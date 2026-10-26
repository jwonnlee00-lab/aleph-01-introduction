import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const cases = [
  { label: 'pinned owner', id: 'local-software-test-owner', email: 'owner@example.test', status: 200 },
  { label: 'same owner ID, changed contact email', id: 'local-software-test-owner', email: 'different-contact@example.test', status: 200 },
  { label: 'different ID with matching owner email', id: 'different-user', email: 'owner@example.test', status: 403 },
  { label: 'anonymous', status: 401 },
];
const results = [];
for (const item of cases) {
  const headers = item.id ? { 'oai-authenticated-user-id': item.id, 'oai-authenticated-user-email': item.email } : {};
  const response = await fetch(base + '/api/passkeys', { headers });
  const body = await response.json();
  assert.equal(response.status, item.status, item.label);
  results.push({ label: item.label, expected: item.status, actual: response.status, error: body.error ?? null });
}
const page = await fetch(base + '/private/passkeys', { headers: { 'oai-authenticated-user-id': 'local-software-test-owner', 'oai-authenticated-user-email': 'different-contact@example.test' } });
assert.match(await page.text(), /패스키에 이름 붙이기/);
mkdirSync('evidence/owner-access-fix', { recursive: true });
writeFileSync('evidence/owner-access-fix/summary.json', JSON.stringify({ fixtureOnly: true, checkedAt: new Date().toISOString(), results, ownerPageWithChangedEmail: 'registration form displayed' }, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, cases: results.length, ownerPage: true }));
