// Local-only protocol tests. This is a software fixture, never a real user passkey.
import assert from 'node:assert/strict';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const base = process.argv[2] ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/, 'Never run fixture identities against production');
const output = 'evidence/card2-local'; mkdirSync(output, { recursive: true });
const records = []; let cookie = '';
const identity = { 'oai-authenticated-user-id': 'local-software-test-owner', 'oai-authenticated-user-email': 'owner@example.test' };
async function request(path, data, status = 200, overrides = {}) {
  // Let workerd finish the previous rejected request's body stream.
  await new Promise(resolve => setTimeout(resolve, 100));
  const headers = { Connection: 'close', ...(overrides.anonymous ? {} : identity), ...(data ? { Origin: base, 'Content-Type': 'application/json' } : {}), ...(cookie && !overrides.noCookie ? { Cookie: cookie } : {}), ...overrides.headers };
  const response = await fetch(base + path, { method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const text = await response.text();
  let result; try { result = JSON.parse(text); } catch { throw new Error(`${path} (${records.length} previous requests): HTTP ${response.status}: ${text}`); }
  assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`);
  records.push({ request: { method: data ? 'POST' : 'GET', path, body: data }, response: { status: response.status, body: result }, note: 'Cookie and fixture identity headers omitted' });
  return result;
}
async function options(name) { return request('/api/passkeys/register/options', { name, storageLocation: '기기 자체' }); }
async function fixture(challenge, origin = base) {
  // The private CryptoKey stays in this test process and is never exported.
  const key = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', key.publicKey);
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]));
  const credentialId = randomBytes(32); const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
  const authData = Buffer.concat([createHash('sha256').update(new URL(base).hostname).digest(), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, credentialId, cose]);
  const attestationObject = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]));
  return { id: credentialId.toString('base64url'), rawId: credentialId.toString('base64url'), type: 'public-key', response: { clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false })).toString('base64url'), attestationObject: Buffer.from(attestationObject).toString('base64url'), transports: ['internal'] }, clientExtensionResults: { credProps: { rk: true } }, authenticatorAttachment: 'platform' };
}

const before = (await request('/api/passkeys')).passkeys.length;
await request('/api/passkeys', undefined, 401, { anonymous: true });
await request('/api/passkeys/register/options', { name: '무단 요청', storageLocation: '기기 자체' }, 401, { anonymous: true });
await request('/api/passkeys/register/options', { name: '다른 계정', storageLocation: '기기 자체' }, 403, { headers: { 'oai-authenticated-user-email': 'other@example.test' } });
await request('/api/passkeys/register/options', { name: '다른 출처', storageLocation: '기기 자체' }, 403, { headers: { Origin: 'https://other.example.test' } });
const first = await options('테스트 질문 A'); const second = await options('테스트 질문 B');
assert.notEqual(first.options.challenge, second.options.challenge);
await request('/api/passkeys/register/verify', { attemptId: first.attemptId, credential: await fixture(first.options.challenge) }, 409);
await request('/api/passkeys/register/cancel', { attemptId: second.attemptId });
const afterCancel = await request('/api/passkeys'); assert.equal(afterCancel.passkeys.length, before);
await request('/api/passkeys/register/verify', { attemptId: second.attemptId, credential: await fixture(second.options.challenge) }, 409);
const third = await options('로컬 소프트웨어 시험 열쇠'); const credential = await fixture(third.options.challenge);
await request('/api/passkeys/register/verify', { attemptId: third.attemptId, credential }, 400, { noCookie: true });
await request('/api/passkeys/register/verify', { attemptId: third.attemptId, credential: { ...credential, privateKey: 'not-accepted' } }, 400);
const verified = await request('/api/passkeys/register/verify', { attemptId: third.attemptId, credential });
assert.equal(verified.verified, true);
await request('/api/passkeys/register/verify', { attemptId: third.attemptId, credential }, 409);
const stored = (await request('/api/passkeys')).passkeys.find(key => key.credential_id === credential.id);
assert.equal(stored.public_key, verified.passkey.publicKey);
const decoded = isoCBOR.decodeFirst(Buffer.from(stored.public_key, 'base64url'));
assert.equal(decoded.get(1), 2); assert.equal(decoded.get(3), -7); assert.equal(decoded.get(-2).length, 32); assert.equal(decoded.get(-3).length, 32);
assert.deepEqual(Object.keys(stored).sort(), ['credential_id', 'name', 'public_key', 'counter', 'transports', 'device_type', 'backed_up', 'storage_location', 'created_at'].sort());
const mismatch = await options('틀린 질문 시험');
await request('/api/passkeys/register/verify', { attemptId: mismatch.attemptId, credential: await fixture('different-challenge') }, 400);
const wrongOrigin = await options('틀린 출처 시험');
await request('/api/passkeys/register/verify', { attemptId: wrongOrigin.attemptId, credential: await fixture(wrongOrigin.options.challenge, 'https://wrong.example.test') }, 400);
const expired = await options('만료 시험');
// Expire just this fixture's challenge in the local SQLite database.
const sqliteRoot = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const sqlitePath = readdirSync(sqliteRoot).find(name => name.endsWith('.sqlite'));
const database = new DatabaseSync(join(sqliteRoot, sqlitePath));
database.prepare('UPDATE passkey_registration_attempts SET expires_at = ? WHERE id = ?').run(Date.now() - 1, expired.attemptId);
database.close();
await request('/api/passkeys/register/verify', { attemptId: expired.attemptId, credential: await fixture(expired.options.challenge) }, 409);
const final = await request('/api/passkeys'); assert.equal(final.passkeys.length, before + 1);
const privateResponse = await fetch(base + '/api/private/items'); assert.equal(privateResponse.status, 401);
const successfulRequest = JSON.parse(final.attempts.find(row => row.state === 'verified' && row.id === third.attemptId).request_json);
assert.equal('privateKey' in successfulRequest.credential, false);
assert.equal('password' in successfulRequest.credential, false);
writeFileSync(output + '/requests-responses.json', JSON.stringify({ fixtureOnly: true, provider: '로컬 소프트웨어 시험 · 실제 기기 아님', records }, null, 2) + '\n');
writeFileSync(output + '/stored-public-key.json', JSON.stringify({ fixtureOnly: true, stored, decodedKey: { type: 'EC2', algorithm: 'ES256', curve: 'P-256', x: Buffer.from(decoded.get(-2)).toString('base64url'), y: Buffer.from(decoded.get(-3)).toString('base64url') } }, null, 2) + '\n');
writeFileSync(output + '/summary.json', JSON.stringify({ fixtureOnly: true, checkedAt: new Date().toISOString(), requestCount: records.length, uniqueChallenges: [first.options.challenge, second.options.challenge], challengeDifferent: true, cancellationSavedNoPublicKey: true, replayRejected: true, wrongChallengeRejected: true, wrongOriginRejected: true, expiredChallengeRejected: true, unboundBrowserRejected: true, privateKeyFieldRejected: true, storedKeyMatchesVerifiedPublicKey: true, privateDataStill401: true, actualGooglePasswordManagerRegistration: 'not-tested' }, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, fixtureOnly: true, requests: records.length, output }));
