// Local disposable fixture account only. No actual user's keys or sessions are used.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {isoCBOR} from '@simplewebauthn/server/helpers';
const base=process.argv[2]??'http://localhost:5173';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const ownerId='local-software-test-owner';const identity={'oai-authenticated-user-id':ownerId,'oai-authenticated-user-email':'owner@example.test'};
const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';const file=folder+'/'+readdirSync(folder).find(n=>n.endsWith('.sqlite'));
function sql(statement,...values){const database=new DatabaseSync(file);const value=database.prepare(statement).all(...values);database.close();return value;}
function key(name){const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=pair.publicKey.export({format:'jwk'});return{name,id:randomBytes(32).toString('base64url'),pair,counter:0,cose:isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]))};}
const a=key('시험 기본 열쇠 A');const b=key('시험 예비 열쇠 B');const c=key('동시 삭제 시험 열쇠 C');
// This fixture account is local and disposable; seed only its first public key.
sql('DELETE FROM passkey_sessions WHERE owner_id = ?',ownerId);sql('DELETE FROM passkeys WHERE owner_id = ?',ownerId);sql('DELETE FROM passkey_events WHERE owner_id = ?',ownerId);
function seed(k){sql('INSERT INTO passkeys (credential_id,owner_id,name,public_key,counter,transports,device_type,backed_up,storage_location,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',k.id,ownerId,k.name,Buffer.from(k.cose).toString('base64url'),k.counter,'["internal"]','singleDevice',0,'기기 자체',Date.now());}
seed(a);
const records=[];const jar={};const secrets=[];const cookies=()=>Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
async function req(label,path,data,status=200,extra={}){
 const value=extra.cookies??cookies();const response=await fetch(base+path,{method:data?'POST':'GET',headers:{...identity,...(data?{Origin:base,'Content-Type':'application/json'}:{}),...(value?{Cookie:value}:{}),...extra.headers},body:data?JSON.stringify(data):undefined});
 const cookie=response.headers.get('set-cookie');if(cookie){const pair=cookie.split(';')[0];const index=pair.indexOf('=');jar[pair.slice(0,index)]=pair.slice(index+1);if(pair.slice(index+1))secrets.push(pair.slice(index+1));}
 const body=await response.json();if(status!==null)assert.equal(response.status,status,label+': '+JSON.stringify(body));
 records.push({case:label,request:{method:data?'POST':'GET',path,...(value?{Cookie:'[REDACTED]'}:{}),body:data},response:{status:response.status,body,...(cookie?{setCookie:'[REDACTED]'}:{})}});return{status:response.status,body};
}
const rpHash=createHash('sha256').update(new URL(base).hostname).digest();
function assertion(k,challenge){const counter=Buffer.alloc(4);counter.writeUInt32BE(++k.counter);const authenticatorData=Buffer.concat([rpHash,Buffer.from([5]),counter]);const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:base,crossOrigin:false}));return{id:k.id,rawId:k.id,type:'public-key',response:{clientDataJSON:client.toString('base64url'),authenticatorData:authenticatorData.toString('base64url'),signature:sign('sha256',Buffer.concat([authenticatorData,createHash('sha256').update(client).digest()]),k.pair.privateKey).toString('base64url')},clientExtensionResults:{}};}
async function login(k,label,status=200){const options=(await req('login challenge','/api/passkeys/login/options',{})).body;return req(label,'/api/passkeys/login/verify',{attemptId:options.attemptId,credential:assertion(k,options.options.challenge)},status);}
function registration(k,challenge){const raw=Buffer.from(k.id,'base64url');const length=Buffer.alloc(2);length.writeUInt16BE(raw.length);const authData=Buffer.concat([rpHash,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,raw,k.cose]);return{id:k.id,rawId:k.id,type:'public-key',response:{clientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin:base,crossOrigin:false})).toString('base64url'),attestationObject:Buffer.from(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))).toString('base64url'),transports:['internal']},clientExtensionResults:{credProps:{rk:true}}};}
await req('add without recent passkey denied','/api/passkeys/register/options',{name:b.name,storageLocation:'기기 자체'},403);
await req('delete without passkey denied','/api/passkeys/delete',{credentialId:a.id,confirmName:a.name},403);
await login(a,'original key login succeeds');
const options=(await req('second key registration options','/api/passkeys/register/options',{name:b.name,storageLocation:'기기 자체'})).body;
assert.equal(options.options.excludeCredentials.some(row=>row.id===a.id),true);assert.deepEqual(options.options.excludeCredentials.find(row=>row.id===a.id).transports,['internal']);
await req('register independent second public key','/api/passkeys/register/verify',{attemptId:options.attemptId,credential:registration(b,options.options.challenge)});
const list=(await req('two named dated keys','/api/passkeys')).body;assert.equal(list.passkeys.length,2);for(const k of list.passkeys){assert.ok(k.name);assert.ok(k.created_at);}
await login(b,'backup key login succeeds before deletion');const backupSession=cookies();
await req('wrong confirmation name rejected','/api/passkeys/delete',{credentialId:b.id,confirmName:'wrong name'},409);
await req('delete backup key B','/api/passkeys/delete',{credentialId:b.id,confirmName:b.name});
await req('deleted key session revoked','/api/private/items',undefined,401,{cookies:backupSession});
const after=(await req('one named key remains','/api/passkeys')).body;assert.equal(after.passkeys.length,1);assert.equal(after.passkeys[0].credential_id,a.id);assert.equal(after.canManage,false);
await login(b,'deleted key B signature rejected',401);
await login(a,'remaining key A login succeeds');const privateData=(await req('remaining key opens three items','/api/private/items')).body;assert.equal(privateData.items.length,3);
await req('last key deletion blocked','/api/passkeys/delete',{credentialId:a.id,confirmName:a.name},409);
assert.equal(sql('SELECT COUNT(*) AS count FROM passkeys WHERE owner_id = ?',ownerId)[0].count,1);
const activeSessionHash=sql('SELECT session_hash FROM passkey_sessions WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',ownerId)[0].session_hash;
sql('UPDATE passkey_sessions SET created_at = ? WHERE session_hash = ?',Date.now()-600001,activeSessionHash);
await req('stale login cannot delete keys','/api/passkeys/delete',{credentialId:a.id,confirmName:a.name},403);
await login(a,'fresh reauthentication succeeds');
seed(c);const concurrentCookie=cookies();const outcomes=await Promise.all([req('concurrent delete A','/api/passkeys/delete',{credentialId:a.id,confirmName:a.name},null,{cookies:concurrentCookie}),req('concurrent delete C','/api/passkeys/delete',{credentialId:c.id,confirmName:c.name},null,{cookies:concurrentCookie})]);
assert.equal(outcomes.filter(r=>r.status===200).length,1);assert.ok(outcomes.every(r=>[200,403,409].includes(r.status)));assert.equal(sql('SELECT COUNT(*) AS count FROM passkeys WHERE owner_id = ?',ownerId)[0].count,1);
// Simulate an operator reset to zero keys in this disposable local account.
sql('DELETE FROM passkeys WHERE owner_id = ?',ownerId);await req('zero keys means no passkey login','/api/passkeys/login/options',{},409);await req('zero keys invalidates private session','/api/private/items',undefined,401);
const serialized=JSON.stringify({fixtureOnly:true,actualUserKeysNotUsed:true,records},null,2)+'\n';for(const secret of secrets)assert.equal(serialized.includes(secret),false);
mkdirSync('evidence/card4-local',{recursive:true});writeFileSync('evidence/card4-local/requests-responses.json',serialized);
writeFileSync('evidence/card4-local/summary.json',JSON.stringify({fixtureOnly:true,checkedAt:new Date().toISOString(),requests:records.length,twoIndependentKeys:true,namesAndDatesPresent:true,existingKeyExcluded:true,backupLoginBeforeDeletion:true,deletedKeyRejected401:true,deletedKeySessionRejected401:true,remainingKeyLogin200:true,lastKeyDeletion409:true,concurrentDeletionKeepsOne:true,managementNeedsRecentPasskey:true,zeroKeyLogin409:true,maskedCookies:true},null,2)+'\n');console.log(JSON.stringify({passed:true,fixtureOnly:true,requests:records.length}));
