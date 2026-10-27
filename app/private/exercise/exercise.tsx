"use client";
import {useEffect,useState} from "react";
import {startRegistration,startAuthentication,type PublicKeyCredentialCreationOptionsJSON,type PublicKeyCredentialRequestOptionsJSON} from "@simplewebauthn/browser";
type Account="a"|"b";
type Status={canManage:boolean;managementError?:{error:string;message:string}|null;currentAccount:Account|null;accounts:{id:Account;label:string;keys:{name:string;createdAt:number}[]}[]};
type RecordItem={case:string;request:{method:string;path:string;body?:unknown};response:{status:number;body:unknown}};
export default function Exercise(){
  const [status,setStatus]=useState<Status|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [records,setRecords]=useState<RecordItem[]>([]);const [items,setItems]=useState<{title:string;body:string}[]>([]);
  async function call(path:string,data?:unknown,label=path,expected=200,secret=false){const response=await fetch("/api/exercise/"+path,{method:data===undefined?"GET":"POST",headers:data===undefined?{}:{"Content-Type":"application/json"},body:data===undefined?undefined:JSON.stringify(data),cache:"no-store"});const result=await response.json() as Status & {attemptId:string;options:PublicKeyCredentialCreationOptionsJSON & PublicKeyCredentialRequestOptionsJSON;verified?:boolean;error?:string;message?:string;account?:Account;session?:{type:string;expiresAt:number};items:{title:string;body:string}[];count:number};
    setRecords(rows=>[...rows,{case:label,request:{method:data===undefined?"GET":"POST",path:"/api/exercise/"+path,...(data!==undefined?{body:secret?"[WebAuthn 응답·ID 생략]":data}:{})},response:{status:response.status,body:secret?{verified:result.verified,error:result.error,message:result.message,account:result.account,session:result.session}:result}}]);
    if(response.status!==expected)throw new Error(result.message??`${label}: HTTP ${response.status}`);return result;}
  async function refresh(){const result=await call("status");setStatus(result);return result as Status;}
  useEffect(()=>{const update=()=>{refresh().catch(e=>setMessage(e.message));};update();window.addEventListener("focus",update);window.addEventListener("pageshow",update);return()=>{window.removeEventListener("focus",update);window.removeEventListener("pageshow",update);};},[]);
  async function work(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e instanceof Error?e.message:"처리하지 못했습니다.");}finally{setBusy(false);}}
  async function register(account:Account){await work(async()=>{const o=await call("register-options",{account},`${account} 등록 질문`,200,true) as {attemptId:string;options:PublicKeyCredentialCreationOptionsJSON};const credential=await startRegistration({optionsJSON:o.options});await call("register-verify",{account,attemptId:o.attemptId,credential},`${account} 등록 검증`,200,true);await refresh();setMessage(`${account.toUpperCase()} 등록 완료. 실제 저장 위치를 확인해 별도로 기록하세요.`);});}
  async function login(account:Account){await work(async()=>{setItems([]);const o=await call("login-options",{account},`${account} 로그인 질문`,200,true) as {attemptId:string;options:PublicKeyCredentialRequestOptionsJSON};const credential=await startAuthentication({optionsJSON:o.options});const payload={account,attemptId:o.attemptId,credential};await call("login-verify",payload,`${account} 로그인 성공`,200,true);await call("login-verify",payload,`${account} 사용한 질문 재사용 거절`,409,true);await refresh();const result=await call(`items?account=${account}`,undefined,`${account} 본인 자료 성공`);setItems(result.items);setMessage(`${account.toUpperCase()} 로그인과 사용한 질문 재사용 거절을 확인했습니다.`);});}
  async function check(){await work(async()=>{const s=await refresh();const own=s.currentAccount;if(!own)throw new Error("A 또는 B로 먼저 로그인하세요.");const other=own==="a"?"b":"a";const before=await call(`items?account=${own}`,undefined,"본인 자료 건수 전");await call(`items?account=${other}`,undefined,`${own}에서 ${other} 자료 요청 거절`,403);await refresh();const after=await call(`items?account=${own}`,undefined,"본인 자료 건수 후");await call(`own-items?account=${other}`,undefined,"주소의 다른 계정 무시하고 본인 자료 반환");await call("own-items",{account:other},"본문의 다른 계정 무시하고 본인 자료 반환");if(before.count!==after.count)throw new Error("자료 건수가 달라졌습니다.");setItems(after.items);setMessage(`${own.toUpperCase()}에서 ${other.toUpperCase()} 접근 거절·본인 자료 유지·계정 위조 무시를 확인했습니다. 반대 계정으로 로그인해 같은 시험을 진행하세요.`);});}
  function download(){const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),note:"실제 이 브라우저 요청·응답. 쿠키·WebAuthn 응답은 제외. 소유자 재확인이 유효하면 status의 resourceCounts로 양쪽 자료 건수를 확인.",records},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="two-account-evidence.json";a.click();URL.revokeObjectURL(url);}
  return <>
    <section className="registration-panel"><h2>시험 계정 등록과 로그인</h2><p>{status?.canManage?"소유자 확인 완료 · 시험 키 등록 가능":"시험 키 등록은 소유자 확인과 기존 키 재로그인 후 가능합니다. 이미 등록한 시험 키의 로그인은 가능합니다."}</p>
      {status?.managementError&&<p role="alert">등록 제한 이유: {status.managementError.message} ({status.managementError.error})</p>}
      {status?.accounts.map(a=><div key={a.id} style={{marginBottom:"2rem"}}><h3>{a.id.toUpperCase()} · {a.label}</h3><p>등록 키 {a.keys.length}개 {a.keys.map(k=>`${k.name} · ${new Date(k.createdAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}`).join(", ")}</p>
      <button className="registration-secondary" disabled={busy||!status.canManage||a.keys.length>0} onClick={()=>register(a.id)}>{a.id.toUpperCase()}용 새 패스키 등록</button>{" "}<button className="registration-button" disabled={busy||!a.keys.length} onClick={()=>login(a.id)}>{a.id.toUpperCase()}로 로그인</button></div>)}
      <button className="registration-secondary" disabled={busy} onClick={()=>work(async()=>{await refresh();})}>등록 상태 새로고침</button>
      <p>두 계정의 키는 같은 관리자에 저장해도 별도 사용자로 등록됩니다. 저장창의 사용자 이름이 A인지 B인지 확인하세요. 취소하면 검증·저장이 진행되지 않으며 질문은 5분 뒤 만료됩니다.</p>
    </section>
    <section className="registration-panel"><h2>자료 접근 시험</h2><p>현재 시험 로그인: {status?.currentAccount?.toUpperCase()??"없음"}</p>
      <button className="registration-button" disabled={busy||!status?.currentAccount} onClick={check}>다른 계정 접근 거절 확인</button>{" "}
      <button className="registration-secondary" disabled={busy||!status?.currentAccount} onClick={()=>work(async()=>{await call("logout",{},"시험 로그아웃");setItems([]);await refresh();await call("own-items",undefined,"로그아웃 후 자료 요청 거절",401);setMessage("시험 세션을 종료했습니다. 기존 개인 공간 세션과는 별개입니다.");})}>시험 계정 로그아웃</button>
      {items.map((item,i)=><article key={i}><h3>{item.title}</h3><p>{item.body}</p></article>)}
      <p role="status" aria-live="polite">{busy?"처리 중…":message}</p>
    </section>
    <section className="registration-panel"><h2>이 브라우저의 확인 기록</h2><p>기록은 새로고침하면 사라집니다. A·B 시험을 모두 마친 뒤 내려받으세요. 비밀번호·쿠키·개인키는 기록하지 않습니다.</p><button className="registration-secondary" disabled={!records.length||busy} onClick={download}>요청·응답 기록 내려받기</button><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(records,null,2)}</pre></section>
  </>;
}


