// All credentials here are local software fixtures. No user's keys or sessions are used.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isoCBOR } from '@simplewebauthn/server/helpers';
const base=process.argv[2]??'http://localhost:5173';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/,'Fixture must never run against production');
const records=[];const jar={};const secretValues=[];const owner={'oai-authenticated-user-id':'local-software-test-owner','oai-authenticated-user-email':'owner@example.test'};
const cookieHeader=()=>Object.entries(jar).map(([key,value])=>key+'='+value).join('; ');
async function request(label,path,data,status=200,options={}){
  const cookies=options.cookies??cookieHeader();
  const headers={...(data?{Origin:base,'Content-Type':'application/json'}:{}),...(cookies?{Cookie:cookies}:{}),...(options.owner?owner:{}),...options.headers};
  const response=await fetch(base+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});
  const setCookie=response.headers.get('set-cookie');
  if(setCookie){const pair=setCookie.split(';')[0];const index=pair.indexOf('=');jar[pair.slice(0,index)]=pair.slice(index+1);if(pair.slice(index+1))secretValues.push(pair.slice(index+1));}
  const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={htmlContainsPrivateContent:privateBodies.some(value=>text.includes(value))};}
  assert.equal(response.status,status,label+': '+text.slice(0,300));
  records.push({case:label,request:{method:data?'POST':'GET',path,headers:{...(data?{Origin:headers.Origin}:{}),...(cookies?{Cookie:'[REDACTED]'}:{})},body:data},response:{status:response.status,body,...(setCookie?{setCookie:setCookie.replace(/^[^;]+/,'[COOKIE_VALUE_REDACTED]')}:{})}});
  return body;
}
const privateBodies=[...readFileSync('lib/private-items.server.ts','utf8').matchAll(/body: "([^"]+)"/g)].map(m=>m[1]);
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=pair.publicKey.export({format:'jwk'});const id=randomBytes(32).toString('base64url');
const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
const rpHash=createHash('sha256').update(new URL(base).hostname).digest();let counter=0;
function registration(challenge){const raw=Buffer.from(id,'base64url');const length=Buffer.alloc(2);length.writeUInt16BE(raw.length);const authData=Buffer.concat([rpHash,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,raw,cose]);return{id,rawId:id,type:'public-key',response:{clientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin:base,crossOrigin:false})).toString('base64url'),attestationObject:Buffer.from(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))).toString('base64url'),transports:['internal']},clientExtensionResults:{credProps:{rk:true}}};}
function assertion(challenge,overrides={}){
  const count=Buffer.alloc(4);count.writeUInt32BE(++counter);
  const authData=Buffer.concat([overrides.rpHash??rpHash,Buffer.from([overrides.flags??0x05]),count]);
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:overrides.origin??base,crossOrigin:false}));
  const signature=sign('sha256',Buffer.concat([authData,createHash('sha256').update(client).digest()]),overrides.key??pair.privateKey);
  if(overrides.corrupt)signature[signature.length-1]^=1;
  return{id:overrides.id??id,rawId:overrides.id??id,type:'public-key',response:{clientDataJSON:client.toString('base64url'),authenticatorData:authData.toString('base64url'),signature:signature.toString('base64url')},clientExtensionResults:{}};
}
const options=()=>request('fresh login challenge','/api/passkeys/login/options',{});
const verify=(label,o,credential,status=200,extra={})=>request(label,'/api/passkeys/login/verify',{attemptId:o.attemptId,credential},status,extra);
const directory='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
function modify(sql,...args){const database=new DatabaseSync(directory+'/'+readdirSync(directory).find(n=>n.endsWith('.sqlite')));database.prepare(sql).run(...args);database.close();}
// Clear only stale software fixture keys from prior runs, never a real user's key.
modify("DELETE FROM passkeys WHERE owner_id = ? AND name = ?",'local-software-test-owner','카드 3 소프트웨어 시험 열쇠');
const reg=await request('register local fixture','/api/passkeys/register/options',{name:'카드 3 소프트웨어 시험 열쇠',storageLocation:'기기 자체'},200,{owner:true});
await request('verify fixture registration','/api/passkeys/register/verify',{attemptId:reg.attemptId,credential:registration(reg.options.challenge)},200,{owner:true});
await request('anonymous private API','/api/private/items',undefined,401);
const anonymousPage=await request('anonymous private page','/private');assert.equal(anonymousPage.htmlContainsPrivateContent,false);
await request('ChatGPT identity alone cannot unlock','/api/private/items',undefined,401,{owner:true});
const a=await options();const b=await options();assert.notEqual(a.options.challenge,b.options.challenge);
await verify('superseded challenge rejected',a,assertion(a.options.challenge),409);
await verify('wrong signature rejected',b,assertion(b.options.challenge,{corrupt:true}),401);
await verify('failed challenge cannot be reused',b,assertion(b.options.challenge),409);
const c=await options();const successful=assertion(c.options.challenge);
const login=await verify('valid signature accepted',c,successful);assert.equal(login.verified,true);assert.equal(login.session.type,'server-side');
const sessionOne=cookieHeader();
const privateData=await request('verified session gets three items','/api/private/items');assert.equal(privateData.items.length,3);
const privatePage=await request('verified session renders private page','/private');assert.equal(privatePage.htmlContainsPrivateContent,true);
await verify('successful challenge replay rejected',c,successful,409);
const d=await options();await verify('new login rotates session',d,assertion(d.options.challenge));const sessionTwo=cookieHeader();assert.notEqual(sessionOne,sessionTwo);
await request('rotated old session rejected','/api/private/items',undefined,401,{cookies:sessionOne});
await request('current session works','/api/private/items');
await request('logout revokes server session','/api/passkeys/logout',{});
await request('same saved cookie after logout rejected','/api/private/items',undefined,401,{cookies:sessionTwo});
const loggedOutPage=await request('logged-out page hides content','/private');assert.equal(loggedOutPage.htmlContainsPrivateContent,false);
const wrongKey=await options();await verify('different private key with registered ID rejected',wrongKey,assertion(wrongKey.options.challenge,{key:other.privateKey}),401);
const unknown=await options();await verify('unregistered credential rejected',unknown,assertion(unknown.options.challenge,{id:randomBytes(32).toString('base64url')}),401);
const wrongOrigin=await options();await verify('signed wrong origin rejected',wrongOrigin,assertion(wrongOrigin.options.challenge,{origin:'https://other.example.test'}),401);
const wrongRP=await options();await verify('signed wrong RP ID rejected',wrongRP,assertion(wrongRP.options.challenge,{rpHash:Buffer.alloc(32)}),401);
const noUV=await options();await verify('missing user verification rejected',noUV,assertion(noUV.options.challenge,{flags:0x01}),401);
const expired=await options();modify('UPDATE passkey_login_attempts SET expires_at = ? WHERE id = ?',Date.now()-1,expired.attemptId);await verify('expired login challenge rejected',expired,assertion(expired.options.challenge),409);
const cancelled=await options();await request('cancel login','/api/passkeys/login/cancel',{attemptId:cancelled.attemptId});await verify('cancelled challenge rejected',cancelled,assertion(cancelled.options.challenge),409);
const unbound=await options();await verify('different browser binding rejected',unbound,assertion(unbound.options.challenge),400,{cookies:''});
await request('cross-origin options rejected','/api/passkeys/login/options',{},403,{headers:{Origin:'https://other.example.test'}});
await request('forged session rejected','/api/private/items',undefined,401,{cookies:'pk-session-local='+'a'.repeat(43)});
const last=await options();await verify('login before expiry test',last,assertion(last.options.challenge));const expiringCookie=cookieHeader();
modify('UPDATE passkey_sessions SET expires_at = ? WHERE owner_id = ?',Date.now()-1,'local-software-test-owner');
await request('expired session rejected','/api/private/items',undefined,401,{cookies:expiringCookie});
const output=JSON.stringify({fixtureOnly:true,actualDeviceNotUsed:true,records},null,2)+'\n';
for(const value of secretValues)assert.equal(output.includes(value),false,'Cookie/session token must never enter evidence');
mkdirSync('evidence/card3-local',{recursive:true});writeFileSync('evidence/card3-local/requests-responses.json',output);
writeFileSync('evidence/card3-local/summary.json',JSON.stringify({fixtureOnly:true,checkedAt:new Date().toISOString(),requests:records.length,challenges:[a.options.challenge,b.options.challenge],challengeDifferent:true,signatureVerified:true,wrongSignatureRejected:true,replayRejected:true,privateItemsAfterLogin:3,logoutOldCookieRejected:true,sessionRotationVerified:true,sessionExpiryVerified:true,maskedCookieValues:true,noPasswordInputs:!readFileSync('app/private/login.tsx','utf8').includes('type="password"')},null,2)+'\n');
console.log(JSON.stringify({passed:true,fixtureOnly:true,requests:records.length}));
