import "server-only";
import { env } from "cloudflare:workers";
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const productionOrigin = "https://jungwon-intro.jwonnlee00.chatgpt.site";
const noCache = { "Cache-Control": "no-store, private", Vary: "Cookie" };
export const storageLocations = ["기기 자체", "구글 비밀번호 관리자", "보안 키"] as const;
const metadata = z.object({ name: z.string().trim().min(1).max(40), storageLocation: z.enum(storageLocations) }).strict();
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const credentialSchema = z.object({
  id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048), type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().max(16384), attestationObject: z.string().max(65536),
    transports: z.array(z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"])).max(10).optional(),
    publicKeyAlgorithm: z.number().optional(), publicKey: z.string().max(16384).optional(), authenticatorData: z.string().max(16384).optional(),
  }).strict(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.object({ credProps: z.object({ rk: z.boolean().optional() }).strict().optional() }).strict(),
}).strict();

export function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { ...noCache, ...extra } });
}
function fail(code: string, message: string, status = 400): never { throw json({ error: code, message }, status); }
export async function ownerIdentity() {
  const user = await getChatGPTUser();
  if (!user) fail("OWNER_SIGN_IN_REQUIRED", "등록하려면 먼저 소유자 계정으로 확인해 주세요.", 401);
  // Once pinned by the operator, the Site-scoped authenticated ID is authoritative.
  // Display/contact email can differ between the Sites owner profile and sign-in.
  if (env.PASSKEY_OWNER_ID) {
    const linked = env.PASSKEY_OWNER_LINKED_IDS ? z.array(z.string()).max(5).parse(JSON.parse(env.PASSKEY_OWNER_LINKED_IDS)) : [];
    if (user.userId !== env.PASSKEY_OWNER_ID && !linked.includes(user.userId)) fail("OWNER_ONLY", "현재 브라우저의 로그인 식별자가 아직 소유자와 연결되지 않았습니다. 아래 확인 번호로 연결을 요청해 주세요.", 403);
    return env.PASSKEY_OWNER_ID;
  } else {
    if (!env.PASSKEY_OWNER_EMAIL) fail("SETUP_UNAVAILABLE", "소유자 등록 설정이 준비되지 않았습니다.", 503);
    if (user.email.trim().toLowerCase() !== env.PASSKEY_OWNER_EMAIL.trim().toLowerCase()) fail("OWNER_ONLY", "이 사이트 소유자만 패스키를 등록할 수 있습니다.", 403);
  }
  return user.userId;
}

export async function createIdentityCheck(request: Request) {
  await body(request); mutationOrigin(request);
  const user = await getChatGPTUser();
  if (!user) fail("OWNER_SIGN_IN_REQUIRED", "먼저 ChatGPT 계정으로 확인해 주세요.", 401);
  const database = db(); const now = Date.now();
  await database.prepare("DELETE FROM owner_identity_checks WHERE expires_at <= ?").bind(now).run();
  const existing = await database.prepare("SELECT code, expires_at FROM owner_identity_checks WHERE subject_id = ? AND expires_at > ? LIMIT 1").bind(user.userId, now).first<{code:string;expires_at:number}>();
  if (existing) return json({ code: existing.code, expiresAt: existing.expires_at, grantsAccess: false });
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const expiresAt = now + 15 * 60000;
  await database.prepare("INSERT INTO owner_identity_checks (code, subject_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(code, user.userId, now, expiresAt).run();
  return json({ code, expiresAt, grantsAccess: false });
}
function db() { if (!env.DB) fail("STORAGE_UNAVAILABLE", "저장소 연결을 확인해 주세요.", 503); return env.DB; }
function originFor(request: Request) {
  const origin = new URL(request.url).origin;
  if (origin !== productionOrigin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) fail("WRONG_ORIGIN", "등록 주소가 올바르지 않습니다.", 403);
  return origin;
}
function mutationOrigin(request: Request) {
  const origin = originFor(request);
  if (request.headers.get("origin") !== origin) fail("WRONG_ORIGIN", "같은 사이트에서 등록을 시작해 주세요.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) fail("INVALID_BODY", "JSON 요청이 필요합니다.");
  return origin;
}
async function body(request: Request) {
  // Limit streaming input too; Content-Length alone is untrusted.
  const reader = request.body?.getReader();
  if (!reader) fail("INVALID_BODY", "요청 본문이 없습니다.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 100000) { await reader.cancel(); fail("BODY_TOO_LARGE", "등록 요청이 너무 큽니다.", 413); } chunks.push(part.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail("INVALID_BODY", "요청을 읽을 수 없습니다."); }
}
export function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function hash(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function cookieName(origin: string) { return origin.startsWith("https:") ? "__Host-pk-registration" : "pk-registration-local"; }
async function browserBinding(request: Request, create = false) {
  const origin = originFor(request); const name = cookieName(origin);
  let token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (!create) fail("REGISTRATION_EXPIRED", "등록 정보가 없습니다. 다시 시작해 주세요.");
    token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  }
  return { hash: await hash(token), cookie: `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${origin.startsWith("https:") ? "; Secure" : ""}` };
}
type Attempt = { id: string; challenge: string; name: string; storage_location: string; state: string; expires_at: number };

export async function registrationOptions(request: Request) {
  const input = await body(request);
  const owner = await ownerIdentity(); const origin = mutationOrigin(request);
  const parsed = metadata.safeParse(input);
  if (!parsed.success) fail("INVALID_NAME_OR_LOCATION", "이름(1~40자)과 실제로 선택할 저장 위치를 입력해 주세요.");
  const binding = await browserBinding(request, true); const now = Date.now(); const database = db();
  const rate = await database.prepare("SELECT COUNT(*) AS count FROM passkey_registration_attempts WHERE owner_id = ? AND created_at > ?").bind(owner, now - 3600000).first<{count:number}>();
  if ((rate?.count ?? 0) >= 30) fail("TOO_MANY_ATTEMPTS", "등록 시도가 많습니다. 잠시 뒤 다시 시도해 주세요.", 429);
  const existing = await database.prepare("SELECT credential_id, transports FROM passkeys WHERE owner_id = ?").bind(owner).all<{credential_id:string;transports:string}>();
  if (existing.results.length >= 5) fail("PASSKEY_LIMIT", "패스키는 최대 5개까지 등록할 수 있습니다.", 409);
  const options = await generateRegistrationOptions({
    rpName: "정원의 나만의 자리", rpID: new URL(origin).hostname, userName: "site-owner", userDisplayName: "사이트 소유자",
    userID: new TextEncoder().encode(await hash(owner)), attestationType: "none", supportedAlgorithmIDs: [-7, -257], timeout: 120000,
    excludeCredentials: existing.results.map(row => ({ id: row.credential_id })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const attemptId = base64url(crypto.getRandomValues(new Uint8Array(32))); const expiresAt = now + 300000;
  await database.batch([
    database.prepare("UPDATE passkey_registration_attempts SET state = 'superseded' WHERE owner_id = ? AND browser_hash = ? AND state = 'pending'").bind(owner, binding.hash),
    database.prepare("INSERT INTO passkey_registration_attempts (id, owner_id, browser_hash, challenge, options_json, name, storage_location, state, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)").bind(attemptId, owner, binding.hash, options.challenge, JSON.stringify(options), parsed.data.name, parsed.data.storageLocation, now, expiresAt),
  ]);
  return json({ attemptId, options, expiresAt }, 200, { "Set-Cookie": binding.cookie });
}

export async function verifyRegistration(request: Request) {
  const input = await body(request);
  const owner = await ownerIdentity(); const origin = mutationOrigin(request); const binding = await browserBinding(request);
  const parsed = z.object({ attemptId: idSchema, credential: credentialSchema }).strict().safeParse(input);
  if (!parsed.success) fail("INVALID_BODY", "등록 응답 형식이 올바르지 않습니다.");
  const database = db(); const now = Date.now();
  // Atomic claim: replay and concurrent requests cannot verify the same challenge twice.
  const attempt = await database.prepare("UPDATE passkey_registration_attempts SET state = 'verifying' WHERE id = ? AND owner_id = ? AND browser_hash = ? AND state = 'pending' AND expires_at > ? RETURNING *").bind(parsed.data.attemptId, owner, binding.hash, now).first<Attempt>();
  if (!attempt) fail("CHALLENGE_UNAVAILABLE", "사용했거나 취소·만료된 등록 질문입니다. 다시 시작해 주세요.", 409);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response: parsed.data.credential as RegistrationResponseJSON, expectedChallenge: attempt.challenge, expectedOrigin: origin, expectedRPID: new URL(origin).hostname, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
  } catch {
    await database.prepare("UPDATE passkey_registration_attempts SET state = 'rejected', failure_code = 'VERIFICATION_FAILED' WHERE id = ?").bind(attempt.id).run();
    fail("VERIFICATION_FAILED", "기기 응답을 검증하지 못했습니다. 다시 등록해 주세요.");
  }
  if (!verification.verified) {
    await database.prepare("UPDATE passkey_registration_attempts SET state = 'rejected', failure_code = 'VERIFICATION_FAILED' WHERE id = ?").bind(attempt.id).run();
    fail("VERIFICATION_FAILED", "기기 응답을 검증하지 못했습니다.");
  }
  const info = verification.registrationInfo; const credential = info.credential; const publicKey = base64url(credential.publicKey);
  try {
    await database.batch([
      database.prepare("INSERT INTO passkeys (credential_id, owner_id, name, public_key, counter, transports, device_type, backed_up, storage_location, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM passkeys WHERE owner_id = ?) < 5").bind(credential.id, owner, attempt.name, publicKey, credential.counter, JSON.stringify(credential.transports ?? []), info.credentialDeviceType, Number(info.credentialBackedUp), attempt.storage_location, now, owner),
      database.prepare("UPDATE passkey_registration_attempts SET state = CASE WHEN EXISTS (SELECT 1 FROM passkeys WHERE credential_id = ?) THEN 'verified' ELSE 'rejected' END, request_json = ?, credential_id = ? WHERE id = ?").bind(credential.id, JSON.stringify({ attemptId: attempt.id, credential: parsed.data.credential }), credential.id, attempt.id),
    ]);
  } catch {
    await database.prepare("UPDATE passkey_registration_attempts SET state = 'rejected', failure_code = 'SAVE_FAILED' WHERE id = ?").bind(attempt.id).run();
    fail("SAVE_FAILED", "등록 정보를 저장하지 못했습니다. 목록을 확인한 뒤 다시 시도해 주세요.", 409);
  }
  const stored = await database.prepare("SELECT credential_id FROM passkeys WHERE credential_id = ? AND owner_id = ?").bind(credential.id, owner).first();
  if (!stored) fail("PASSKEY_LIMIT", "등록 가능한 패스키 수를 초과했습니다.", 409);
  return json({ verified: true, passkey: { credentialId: credential.id, name: attempt.name, publicKey, publicKeyFormat: "COSE_Key / base64url", storageLocation: attempt.storage_location, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp, createdAt: now }, message: "공개키를 저장했습니다. 비공개 자료는 아직 잠겨 있습니다." });
}

export async function cancelRegistration(request: Request) {
  const input = await body(request);
  const owner = await ownerIdentity(); mutationOrigin(request); const binding = await browserBinding(request);
  const parsed = z.object({ attemptId: idSchema }).strict().safeParse(input);
  if (!parsed.success) fail("INVALID_BODY", "등록 요청 번호가 올바르지 않습니다.");
  const result = await db().prepare("UPDATE passkey_registration_attempts SET state = 'cancelled' WHERE id = ? AND owner_id = ? AND browser_hash = ? AND state = 'pending' RETURNING id").bind(parsed.data.attemptId, owner, binding.hash).first();
  if (!result) fail("CHALLENGE_UNAVAILABLE", "이미 처리된 등록입니다. 목록을 확인해 주세요.", 409);
  return json({ cancelled: true, message: "등록을 취소했습니다. 패스키 공개키는 저장하지 않았습니다." });
}

export async function registrationEvidence() {
  const owner = await ownerIdentity(); const database = db();
  await database.prepare("UPDATE passkey_registration_attempts SET state = 'expired' WHERE owner_id = ? AND state = 'pending' AND expires_at <= ?").bind(owner, Date.now()).run();
  const keys = await database.prepare("SELECT credential_id, name, public_key, counter, transports, device_type, backed_up, storage_location, created_at FROM passkeys WHERE owner_id = ? ORDER BY created_at DESC").bind(owner).all();
  // Active challenges and cookie binding material never enter exported evidence.
  const attempts = await database.prepare("SELECT id, challenge, name, storage_location, state, created_at, expires_at, request_json, credential_id, failure_code FROM passkey_registration_attempts WHERE owner_id = ? AND state NOT IN ('pending', 'verifying') ORDER BY created_at DESC LIMIT 30").bind(owner).all();
  return json({ generatedAt: new Date().toISOString(), publicKeyFormat: "COSE_Key / base64url", storageLocationSource: "등록자가 기기 인증창에서 확인한 위치를 직접 선택", passkeys: keys.results, attempts: attempts.results, privateKeyStored: false });
}

export async function registrationRoute(action: () => Promise<Response>) {
  try { return await action(); } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "REGISTRATION_UNAVAILABLE", message: "등록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}
