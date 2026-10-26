import "server-only";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { base64url, body, db, hash, json, mutationOrigin, originFor } from "./passkey-registration";

const attemptId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const assertionSchema = z.object({
  id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: z.string().max(16384), authenticatorData: z.string().max(16384), signature: z.string().max(16384), userHandle: z.string().max(1024).optional() }).strict(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.object({}).strict(),
}).strict();
function denied(code: string, message: string, status = 400): never { throw json({ error: code, message }, status); }
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
function cookieName(kind: "login" | "session", local: boolean) { return local ? `pk-${kind}-local` : `__Host-pk-${kind}`; }
function localOrigin(origin: string) { return origin.startsWith("http:"); }
function cookieValue(value: string | null, name: string) { return value?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1); }
function cookie(name: string, value: string, local: boolean, age: number) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${local ? "" : "; Secure"}`; }
function fromBase64(value: string) { return new Uint8Array(Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0))); }
async function loginBinding(request: Request, create = false) {
  const local = localOrigin(originFor(request)); const name = cookieName("login", local);
  let value = cookieValue(request.headers.get("cookie"), name);
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    if (!create) denied("LOGIN_EXPIRED", "로그인 정보를 찾지 못했습니다. 다시 시작해 주세요.");
    value = randomToken();
  }
  return { hash: await hash(value), setCookie: cookie(name, value, local, 600) };
}
function ownerId() { if (!env.PASSKEY_OWNER_ID) denied("OWNER_SETUP_REQUIRED", "로그인할 소유자 설정이 준비되지 않았습니다.", 503); return env.PASSKEY_OWNER_ID; }

export async function loginOptions(request: Request) {
  await body(request); const origin = mutationOrigin(request); const owner = ownerId(); const binding = await loginBinding(request, true); const now = Date.now(); const database = db();
  const exists = await database.prepare("SELECT credential_id FROM passkeys WHERE owner_id = ? LIMIT 1").bind(owner).first();
  if (!exists) denied("NO_PASSKEY", "아직 등록된 패스키가 없습니다. 먼저 소유자 등록 화면에서 등록해 주세요.", 409);
  const rateKey = await hash(request.headers.get("cf-connecting-ip") ?? "local-preview");
  const rate = await database.prepare("SELECT COUNT(*) AS count FROM passkey_login_attempts WHERE rate_key = ? AND created_at > ?").bind(rateKey, now - 3600000).first<{count:number}>();
  if ((rate?.count ?? 0) >= 60) denied("TOO_MANY_ATTEMPTS", "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  const options = await generateAuthenticationOptions({ rpID: new URL(origin).hostname, userVerification: "required", timeout: 120000 });
  const id = randomToken(); const expiresAt = now + 300000;
  await database.batch([
    database.prepare("UPDATE passkey_login_attempts SET state = 'superseded' WHERE browser_hash = ? AND state = 'pending'").bind(binding.hash),
    database.prepare("INSERT INTO passkey_login_attempts (id, challenge, browser_hash, rate_key, state, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").bind(id, options.challenge, binding.hash, rateKey, now, expiresAt),
  ]);
  return json({ attemptId: id, options, expiresAt }, 200, { "Set-Cookie": binding.setCookie });
}

export async function verifyLogin(request: Request) {
  const input = await body(request); const origin = mutationOrigin(request); const binding = await loginBinding(request); const owner = ownerId();
  const parsed = z.object({ attemptId, credential: assertionSchema }).strict().safeParse(input);
  if (!parsed.success) denied("INVALID_BODY", "로그인 응답 형식이 올바르지 않습니다.");
  const database = db(); const now = Date.now();
  const attempt = await database.prepare("UPDATE passkey_login_attempts SET state = 'verifying' WHERE id = ? AND browser_hash = ? AND state = 'pending' AND expires_at > ? RETURNING id, challenge").bind(parsed.data.attemptId, binding.hash, now).first<{id:string;challenge:string}>();
  if (!attempt) denied("CHALLENGE_UNAVAILABLE", "이미 사용했거나 만료·취소된 로그인 질문입니다. 다시 시작해 주세요.", 409);
  const reject = async (code: string) => { await database.prepare("UPDATE passkey_login_attempts SET state = 'rejected', result_code = ? WHERE id = ?").bind(code, attempt.id).run(); denied(code, "패스키 서명을 확인하지 못했습니다. 등록한 패스키로 다시 시도해 주세요.", 401); };
  const key = await database.prepare("SELECT credential_id, owner_id, public_key, counter, transports FROM passkeys WHERE credential_id = ? AND owner_id = ?").bind(parsed.data.credential.id, owner).first<{credential_id:string;owner_id:string;public_key:string;counter:number;transports:string}>();
  if (!key) return reject("UNKNOWN_PASSKEY");
  let verification;
  try {
    verification = await verifyAuthenticationResponse({ response: parsed.data.credential as AuthenticationResponseJSON, expectedChallenge: attempt.challenge, expectedOrigin: origin, expectedRPID: new URL(origin).hostname, requireUserVerification: true, credential: { id: key.credential_id, publicKey: fromBase64(key.public_key), counter: key.counter } });
  } catch { return reject("SIGNATURE_INVALID"); }
  if (!verification.verified) return reject("SIGNATURE_INVALID");
  const token = randomToken(); const sessionHash = await hash(token); const local = localOrigin(origin); const expiresAt = now + 3600000;
  const oldToken = cookieValue(request.headers.get("cookie"), cookieName("session", local));
  const statements = [
    database.prepare("UPDATE passkeys SET counter = ?, backed_up = ? WHERE credential_id = ? AND counter = ?").bind(verification.authenticationInfo.newCounter, Number(verification.authenticationInfo.credentialBackedUp), key.credential_id, key.counter),
    database.prepare("INSERT INTO passkey_sessions (session_hash, owner_id, credential_id, created_at, expires_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1").bind(sessionHash, owner, key.credential_id, now, expiresAt),
    database.prepare("UPDATE passkey_login_attempts SET state = CASE WHEN EXISTS (SELECT 1 FROM passkey_sessions WHERE session_hash = ?) THEN 'verified' ELSE 'rejected' END, owner_id = ?, result_code = CASE WHEN EXISTS (SELECT 1 FROM passkey_sessions WHERE session_hash = ?) THEN 'VERIFIED' ELSE 'COUNTER_CONFLICT' END WHERE id = ?").bind(sessionHash, owner, sessionHash, attempt.id),
  ];
  if (oldToken) statements.push(database.prepare("UPDATE passkey_sessions SET revoked_at = ? WHERE session_hash = ?").bind(now, await hash(oldToken)));
  await database.batch(statements);
  const saved = await database.prepare("SELECT session_hash FROM passkey_sessions WHERE session_hash = ?").bind(sessionHash).first();
  if (!saved) denied("COUNTER_CONFLICT", "로그인 요청이 겹쳤습니다. 다시 시작해 주세요.", 409);
  return json({ verified: true, session: { type: "server-side", expiresAt }, next: "/private" }, 200, { "Set-Cookie": cookie(cookieName("session", local), token, local, 3600) });
}

export type PrivateSession = { owner_id: string; credential_id: string; expires_at: number; session_hash: string };
export async function getPrivateSession(request?: Request): Promise<PrivateSession | null> {
  const incoming = request ? request.headers : await headers();
  const local = request ? localOrigin(originFor(request)) : /^(localhost|127\.0\.0\.1):\d+$/.test(incoming.get("host") ?? "");
  const token = cookieValue(incoming.get("cookie"), cookieName("session", local));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db().prepare("SELECT s.owner_id, s.credential_id, s.expires_at, s.session_hash FROM passkey_sessions s JOIN passkeys p ON p.credential_id = s.credential_id AND p.owner_id = s.owner_id WHERE s.session_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?").bind(await hash(token), Date.now()).first<PrivateSession>();
}
export async function logout(request: Request) {
  await body(request); const origin = mutationOrigin(request); const session = await getPrivateSession(request);
  if (session) await db().prepare("UPDATE passkey_sessions SET revoked_at = ? WHERE session_hash = ?").bind(Date.now(), session.session_hash).run();
  const local = localOrigin(origin);
  return json({ loggedOut: true }, 200, { "Set-Cookie": cookie(cookieName("session", local), "", local, 0) });
}
export async function cancelLogin(request: Request) {
  const input = await body(request); mutationOrigin(request); const binding = await loginBinding(request);
  const parsed = z.object({ attemptId }).strict().safeParse(input);
  if (!parsed.success) denied("INVALID_BODY", "로그인 요청 번호를 확인해 주세요.");
  await db().prepare("UPDATE passkey_login_attempts SET state = 'cancelled', result_code = 'CANCELLED' WHERE id = ? AND browser_hash = ? AND state = 'pending'").bind(parsed.data.attemptId, binding.hash).run();
  return json({ cancelled: true });
}
export async function loginRoute(action: () => Promise<Response>) {
  try { return await action(); } catch (error) { if (error instanceof Response) return error; return json({error:"LOGIN_UNAVAILABLE",message:"로그인 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."},503); }
}
