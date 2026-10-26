import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173';
const directory = process.argv[3] ?? 'evidence/card1-local';
mkdirSync(directory, { recursive: true });
const source = readFileSync('lib/private-items.server.ts', 'utf8');
const secrets = [...source.matchAll(/body: "([^"]+)"/g)].map(match => match[1]);
assert.equal(secrets.length, 3, 'Three fictional private items exist on the server');
const results = [];
for (const [name, path, status, headers] of [
  ['public', '/', 200, {}],
  ['private', '/private', 200, {}],
  ['denied', '/api/private/items', 401, {}],
  ['forged-cookie', '/api/private/items', 401, { Cookie: 'session=fake; authenticated=true' }],
]) {
  const response = await fetch(new URL(path, base), { headers });
  const body = await response.text();
  writeFileSync(`${directory}/${name}.body.txt`, body);
  const safeHeaders = Object.fromEntries([...response.headers].filter(([name]) => !['set-cookie', 'authorization', 'proxy-authorization'].includes(name)));
  const record = { request: { method: 'GET', path, headers }, status: response.status, headers: safeHeaders, containsPrivateContent: secrets.some(secret => body.includes(secret)) };
  writeFileSync(`${directory}/${name}.response.json`, JSON.stringify(record, null, 2) + '\n');
  assert.equal(response.status, status, path);
  assert.equal(record.containsPrivateContent, false, `${path} must not contain private bodies`);
  if (status === 401) {
    assert.equal(JSON.parse(body).error, 'AUTH_REQUIRED');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  results.push({ path, status: response.status, privateContentAbsent: true });
}
// Check every anonymous client script referenced in the public response too.
const publicBody = readFileSync(`${directory}/public.body.txt`, 'utf8');
const scripts = [...new Set([...publicBody.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]))];
for (const src of scripts) {
  const response = await fetch(new URL(src, base));
  assert.equal(response.status, 200, src);
  const body = await response.text();
  for (const secret of secrets) assert.equal(body.includes(secret), false, src);
}
writeFileSync(`${directory}/summary.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), privateItemCount: secrets.length, results, clientScriptsChecked: scripts.length }, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, directory, requests: results.length, clientScriptsChecked: scripts.length }));
