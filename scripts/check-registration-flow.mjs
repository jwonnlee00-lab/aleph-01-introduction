// Component-level tests with a fake authenticator. Never creates an actual passkey.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const result = await build({ entryPoints: ['app/private/passkeys/registration.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'fixture-ui', setup(builder) {
  builder.onResolve({ filter: /^(react|react\/jsx-runtime|@simplewebauthn\/browser)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'react' ? 'export const useState=(v)=>globalThis.flowHarness.state(v); export const useRef=(v)=>globalThis.flowHarness.ref(v); export const useEffect=(f)=>globalThis.flowHarness.effect(f);' : args.path === 'react/jsx-runtime' ? 'export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;' : 'export const browserSupportsWebAuthn=()=>true; export const startRegistration=(o)=>globalThis.flowHarness.device(o); export const WebAuthnAbortService={cancelCeremony(){}};' }));
} }] });
const Component = (await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
const all = node => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(all)] : [];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const results = [];
for (const scenario of ['success', 'cancel', 'expired']) {
  const slots = []; let index = 0; const effects = []; const calls = []; const keys = [];
  globalThis.window = { isSecureContext: true };
  globalThis.flowHarness = {
    state(initial) { const i=index++; if (!(i in slots)) slots[i]=initial; return [slots[i], value => { slots[i]=typeof value==='function'?value(slots[i]):value; }]; },
    ref(initial) { const i=index++; if (!(i in slots)) slots[i]={current:initial}; return slots[i]; },
    effect(callback) { const i=index++; if (!(i in slots)) { slots[i]=true; effects.push(callback); } },
    async device() { calls.push('device'); if (scenario==='cancel') throw new DOMException('cancelled','NotAllowedError'); return { id:'fixture-credential', type:'public-key' }; },
  };
  globalThis.fetch = async (path, init) => {
    if (path.endsWith('/options')) { calls.push('options'); return Response.json({ attemptId:'fixture-attempt', options:{ challenge:'fixture-challenge' } }); }
    if (path.endsWith('/verify')) { calls.push('verify'); assert.equal(JSON.parse(init.body).credential.id,'fixture-credential'); if (scenario==='expired') return Response.json({message:'사용했거나 취소·만료된 등록 질문입니다. 다시 시작해 주세요.'},{status:409}); keys.push({credential_id:'fixture-credential',name:'시험 열쇠',public_key:'public-fixture',storage_location:'시험',created_at:Date.now()}); return Response.json({verified:true}); }
    if (path.endsWith('/cancel')) { calls.push('cancel'); return Response.json({cancelled:true}); }
    calls.push('list'); return Response.json({passkeys:keys,attempts:[],canManage:true,currentCredentialId:null,events:[]});
  };
  const render=()=>{index=0;return Component();};
  let tree=render(); effects.forEach(effect=>effect()); await new Promise(resolve=>setTimeout(resolve,0));
  tree=render(); all(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  tree=render(); const button=all(tree).find(n=>n.type==='button'&&text(n)==='패스키 만들고 등록하기'); assert.equal(button.props.disabled,false);
  await button.props.onClick(); tree=render();
  if (scenario==='success') { assert.deepEqual(calls.filter(v=>v!=='list'),['options','device','verify']); assert.match(text(tree),/등록 완료/); assert.match(text(tree),/시험 열쇠/); }
  if (scenario==='cancel') { assert.equal(calls.includes('verify'),false); assert.equal(calls.includes('cancel'),true); assert.equal(keys.length,0); assert.match(text(tree),/저장하지 않았습니다/); }
  if (scenario==='expired') { assert.equal(keys.length,0); assert.match(text(tree),/만료/); assert.equal(text(tree).includes('등록 완료:'),false); }
  assert.equal(text(tree).includes('공개키를 서버에 등록하기'),false);
  results.push({scenario,passed:true,operations:calls});
}
mkdirSync('evidence/registration-flow-fixture',{recursive:true});
writeFileSync('evidence/registration-flow-fixture/summary.json',JSON.stringify({fixtureOnly:true,actualDeviceNotUsed:true,results},null,2)+'\n');
console.log('Client flow passed: automatic verification, cancellation without key, expired response without false success');
