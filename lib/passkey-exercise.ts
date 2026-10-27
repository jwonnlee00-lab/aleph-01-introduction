import "server-only";
import { env } from "cloudflare:workers";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { base64url, body, db, hash, json, mutationOrigin, originFor, ownerIdentity, requireManagementSession } from "./passkey-registration";

const accountSchema = z.enum(["a", "b"]);
type Account = z.infer<typeof accountSchema>;
const labels = { a: "userA@aleph.com", b: "userB@example.test" };
// Separate, fictional resources. Never include these in client bundles or anonymous HTML.
const notes = {
  a: [{id:"a-1",title:"A의 프로젝트",body:"가상 별빛 지도 만들기"},{id:"a-2",title:"A의 연습",body:"퍼즐 화면 한 장 완성"},{id:"a-3",title:"A의 회고",body:"작은 기능부터 확인하기"}],
  b: [{id:"b-1",title:"B의 프로젝트",body:"가상 구름 도서관 만들기"},{id:"b-2",title:"B의 연습",body:"책갈피 화면 두 장 완성"},{id:"b-3",title:"B의 회고",body:"오류 응답부터 살펴보기"}],
};
function deny(error:string,message:string,status=400):never { throw json({error,message},status); }
function account(value:unknown):Account { const result=accountSchema.safeParse(value); if(!result.success) deny("INVALID_ACCOUNT","시험 계정 A 또는 B를 선택하세요."); return result.data; }
function accountOwner(id:Account) { if(!env.PASSKEY_OWNER_ID) deny("OWNER_SETUP_REQUIRED","사이트 설정을 확인해 주세요.",503); return `${env.PASSKEY_OWNER_ID}:exercise:${id}`; }
function token(){return base64url(crypto.getRandomValues(new Uint8Array(32)));}
function cookieName(kind:string,origin:string){return `${origin.startsWith("https:")?"__Host-":""}exercise-${kind}`;}
function readCookie(request:Request,kind:string){const name=cookieName(kind,originFor(request)); return request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1);}
function cookie(kind:string,value:string,origin:string,age=3600){return `${cookieName(kind,origin)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${origin.startsWith("https:")?"; Secure":""}`;}
async function binding(request:Request,create=false){let value=readCookie(request,"binding");if(!value||!/^[\w-]{43}$/.test(value)){if(!create)deny("CHALLENGE_UNAVAILABLE","등록 정보를 찾지 못했습니다. 다시 시작하세요.",409);value=token();}return {hash:await hash(value),cookie:cookie("binding",value,originFor(request),600)};}
async function admin(request:Request){const owner=await ownerIdentity();await requireManagementSession(owner,request);}
async function session(request:Request){const raw=readCookie(request,"session");if(!raw||!/^[\w-]{43}$/.test(raw))return null;return db().prepare("SELECT s.owner_id, s.session_hash FROM passkey_sessions s JOIN passkeys p ON p.credential_id=s.credential_id AND p.owner_id=s.owner_id WHERE s.session_hash=? AND s.revoked_at IS NULL AND s.expires_at> ? AND s.owner_id IN (?,?)").bind(await hash(raw),Date.now(),accountOwner("a"),accountOwner("b")).first<{owner_id:string;session_hash:string}>();}
async function currentAccount(request:Request){const s=await session(request);if(!s)deny("AUTH_REQUIRED","시험 계정의 패스키 로그인이 필요합니다.",401);return {id:s.owner_id===accountOwner("a")?"a" as const:"b" as const,...s};}
const idSchema=z.string().regex(/^[\w-]{43}$/);
const registrationInput=z.object({account:accountSchema,attemptId:idSchema,credential:z.object({id:z.string().min(1).max(2048)}).passthrough()}).strict();
const loginInput=registrationInput;
export async function exercise(request:Request,action:string):Promise<Response>{
  const database=db();
  if(action==="status"){
    let canManage=false;try{await admin(request);canManage=true;}catch(e){if(!(e instanceof Response))throw e;}
    const keys=await database.prepare("SELECT owner_id,name,created_at FROM passkeys WHERE owner_id IN (?,?) ORDER BY created_at").bind(accountOwner("a"),accountOwner("b")).all<{owner_id:string;name:string;created_at:number}>();
    const s=await session(request);
    return json({canManage,currentAccount:s?(s.owner_id===accountOwner("a")?"a":"b"):null,resourceCounts:canManage?{a:notes.a.length,b:notes.b.length}:null,accounts:(["a","b"] as const).map(id=>({id,label:labels[id],keys:keys.results.filter(k=>k.owner_id===accountOwner(id)).map(k=>({name:k.name,createdAt:k.created_at}))}))});
  }
  if(action==="items"||action==="own-items"){
    const s=await currentAccount(request);
    if(action==="items"){
      const target=account(new URL(request.url).searchParams.get("account"));
      if(target!==s.id)deny("FORBIDDEN_ACCOUNT","다른 시험 계정의 자료는 조회할 수 없습니다.",403);
    }
    // own-items intentionally ignores URL/body account claims. Identity comes only from the session.
    if(request.method==="POST"){mutationOrigin(request);await body(request);}
    return json({account:s.id,items:notes[s.id],count:notes[s.id].length});
  }
  mutationOrigin(request);const input=await body(request);
  if(action==="logout"){
    const s=await session(request);if(s)await database.prepare("UPDATE passkey_sessions SET revoked_at=? WHERE session_hash=?").bind(Date.now(),s.session_hash).run();
    return json({loggedOut:true},200,{"Set-Cookie":cookie("session","",originFor(request),0)});
  }
  if(action==="register-options"){
    await admin(request);const id=account(input.account);const owner=accountOwner(id);
    const exists=await database.prepare("SELECT COUNT(*) AS count FROM passkeys WHERE owner_id=?").bind(owner).first<{count:number}>();
    if(exists?.count)deny("ALREADY_REGISTERED","이 시험 계정에는 이미 키가 있습니다. 로그인으로 확인하세요.",409);
    const b=await binding(request,true);const now=Date.now();
    const options=await generateRegistrationOptions({rpName:"정원의 계정 격리 시험",rpID:new URL(request.url).hostname,userID:new TextEncoder().encode(await hash(owner)),userName:labels[id],userDisplayName:`시험 계정 ${id.toUpperCase()}`,attestationType:"none",supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey:"required",userVerification:"required"}});
    const attemptId=token();
    await database.batch([
      database.prepare("UPDATE passkey_registration_attempts SET state='superseded' WHERE owner_id=? AND browser_hash=? AND state='pending'").bind(owner,b.hash),
      database.prepare("INSERT INTO passkey_registration_attempts (id,owner_id,browser_hash,challenge,options_json,name,storage_location,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)").bind(attemptId,owner,b.hash,options.challenge,JSON.stringify(options),`시험 ${id.toUpperCase()} 패스키`,"시험 등록자가 기기에서 선택",now,now+300000),
    ]);
    return json({attemptId,options},200,{"Set-Cookie":b.cookie});
  }
  if(action==="register-verify"){
    await admin(request);const parsed=registrationInput.safeParse(input);if(!parsed.success)deny("INVALID_BODY","등록 응답 형식을 확인하세요.");const {account:id,attemptId,credential}=parsed.data;const owner=accountOwner(id);const b=await binding(request);
    const attempt=await database.prepare("UPDATE passkey_registration_attempts SET state='verifying' WHERE id=? AND owner_id=? AND browser_hash=? AND state='pending' AND expires_at>? RETURNING challenge").bind(attemptId,owner,b.hash,Date.now()).first<{challenge:string}>();
    if(!attempt)deny("CHALLENGE_UNAVAILABLE","이미 사용했거나 만료된 등록 질문입니다.",409);
    let result;try{result=await verifyRegistrationResponse({response:credential as unknown as RegistrationResponseJSON,expectedChallenge:attempt.challenge,expectedOrigin:originFor(request),expectedRPID:new URL(request.url).hostname,requireUserVerification:true});}catch{await database.prepare("UPDATE passkey_registration_attempts SET state='rejected' WHERE id=?").bind(attemptId).run();deny("REGISTRATION_INVALID","등록 검증에 실패했습니다.",401);}
    if(!result.verified||!result.registrationInfo)deny("REGISTRATION_INVALID","등록 검증에 실패했습니다.",401);
    const info=result.registrationInfo;const key=info.credential;
    const saved=await database.batch([
      database.prepare("INSERT INTO passkeys (credential_id,owner_id,name,public_key,counter,transports,device_type,backed_up,storage_location,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM passkeys WHERE owner_id=?)").bind(key.id,owner,`시험 ${id.toUpperCase()} 패스키`,base64url(key.publicKey),key.counter,JSON.stringify(key.transports??[]),info.credentialDeviceType,Number(info.credentialBackedUp),"시험 등록자가 기기에서 선택",Date.now(),owner),
      database.prepare("UPDATE passkey_registration_attempts SET state=CASE WHEN changes()=1 THEN 'verified' ELSE 'rejected' END WHERE id=?").bind(attemptId),
    ]);
    if(!saved[0].meta.changes)deny("ALREADY_REGISTERED","등록이 중복됐습니다. 목록을 확인하세요.",409);
    return json({verified:true,account:id});
  }
  if(action==="login-options"){
    const id=account(input.account);const owner=accountOwner(id);const now=Date.now();
    const keys=await database.prepare("SELECT credential_id,transports FROM passkeys WHERE owner_id=?").bind(owner).all<{credential_id:string;transports:string}>();if(!keys.results.length)deny("NO_PASSKEY","소유자가 이 시험 계정의 키를 먼저 등록해야 합니다.",409);
    const rateKey=await hash(request.headers.get("cf-connecting-ip")??"local-exercise");
    const rate=await database.prepare("SELECT COUNT(*) AS count FROM passkey_login_attempts WHERE rate_key=? AND created_at>?").bind(rateKey,now-3600000).first<{count:number}>();if((rate?.count??0)>=60)deny("TOO_MANY_ATTEMPTS","잠시 후 다시 시도하세요.",429);
    const b=await binding(request,true);const options=await generateAuthenticationOptions({rpID:new URL(request.url).hostname,userVerification:"required",allowCredentials:keys.results.map(k=>({id:k.credential_id,transports:JSON.parse(k.transports)}))});const attemptId=token();
    await database.batch([
      database.prepare("UPDATE passkey_login_attempts SET state='superseded' WHERE browser_hash=? AND state='pending'").bind(b.hash),
      database.prepare("INSERT INTO passkey_login_attempts (id,challenge,browser_hash,rate_key,state,created_at,expires_at,owner_id) VALUES (?,?,?,?,'pending',?,?,?)").bind(attemptId,options.challenge,b.hash,rateKey,now,now+300000,owner),
    ]);
    return json({attemptId,options},200,{"Set-Cookie":b.cookie});
  }
  if(action==="login-verify"){
    const parsed=loginInput.safeParse(input);if(!parsed.success)deny("INVALID_BODY","로그인 응답 형식을 확인하세요.");const {account:id,attemptId,credential}=parsed.data;const owner=accountOwner(id);const b=await binding(request);
    const attempt=await database.prepare("UPDATE passkey_login_attempts SET state='verifying' WHERE id=? AND owner_id=? AND browser_hash=? AND state='pending' AND expires_at>? RETURNING challenge").bind(attemptId,owner,b.hash,Date.now()).first<{challenge:string}>();if(!attempt)deny("CHALLENGE_UNAVAILABLE","이미 사용했거나 만료된 로그인 질문입니다.",409);
    const reject=async(code:string):Promise<never>=>{await database.prepare("UPDATE passkey_login_attempts SET state='rejected',result_code=? WHERE id=?").bind(code,attemptId).run();deny(code,"이 시험 계정에 등록한 패스키만 사용할 수 있습니다.",401);};
    const key=await database.prepare("SELECT public_key,counter FROM passkeys WHERE owner_id=? AND credential_id=?").bind(owner,credential.id).first<{public_key:string;counter:number}>();if(!key)return reject("UNKNOWN_PASSKEY");
    let result;try{result=await verifyAuthenticationResponse({response:credential as unknown as AuthenticationResponseJSON,expectedChallenge:attempt.challenge,expectedOrigin:originFor(request),expectedRPID:new URL(request.url).hostname,requireUserVerification:true,credential:{id:credential.id,publicKey:new Uint8Array(Uint8Array.from(atob(key.public_key.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0))),counter:key.counter}});}catch{return reject("SIGNATURE_INVALID");}if(!result.verified)return reject("SIGNATURE_INVALID");
    const raw=token();const sessionHash=await hash(raw);const now=Date.now();const old=await session(request);
    const statements=[
      database.prepare("UPDATE passkeys SET counter=? WHERE credential_id=? AND owner_id=? AND counter=?").bind(result.authenticationInfo.newCounter,credential.id,owner,key.counter),
      database.prepare("INSERT INTO passkey_sessions (session_hash,owner_id,credential_id,created_at,expires_at) SELECT ?,?,?,?,? WHERE changes()=1").bind(sessionHash,owner,credential.id,now,now+3600000),
      database.prepare("UPDATE passkey_login_attempts SET state=CASE WHEN EXISTS (SELECT 1 FROM passkey_sessions WHERE session_hash=?) THEN 'verified' ELSE 'rejected' END,result_code=CASE WHEN EXISTS (SELECT 1 FROM passkey_sessions WHERE session_hash=?) THEN 'VERIFIED' ELSE 'COUNTER_CONFLICT' END WHERE id=?").bind(sessionHash,sessionHash,attemptId),
    ];if(old)statements.push(database.prepare("UPDATE passkey_sessions SET revoked_at=? WHERE session_hash=?").bind(now,old.session_hash));await database.batch(statements);
    if(!await database.prepare("SELECT session_hash FROM passkey_sessions WHERE session_hash=?").bind(sessionHash).first())deny("COUNTER_CONFLICT","로그인 요청이 겹쳤습니다.",409);
    return json({verified:true,account:id,session:{type:"server-side",expiresAt:now+3600000}},200,{"Set-Cookie":cookie("session",raw,originFor(request))});
  }
  deny("NOT_FOUND","없는 시험 요청입니다.",404);
}
