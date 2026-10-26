"use client";
import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, WebAuthnAbortService, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

async function post<T = Record<string,unknown>>(path:string, value:unknown):Promise<T> {
  const response = await fetch(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(value), cache:"no-store" });
  const data = await response.json() as T & {message?:string};
  if (!response.ok) throw new Error(data.message ?? "요청을 완료하지 못했습니다.");
  return data;
}
export default function PasskeyLogin() {
  const [supported,setSupported] = useState<boolean|null>(null);
  const [busy,setBusy] = useState(false); const [verifying,setVerifying] = useState(false); const [message,setMessage] = useState("");
  const interrupted = useRef(false);
  useEffect(()=>{setSupported(window.isSecureContext && browserSupportsWebAuthn()); return ()=>WebAuthnAbortService.cancelCeremony();},[]);
  async function login() {
    setBusy(true);setMessage("");interrupted.current=false;
    let attemptId:string|null=null;let sent=false;
    try {
      const result=await post<{attemptId:string;options:PublicKeyCredentialRequestOptionsJSON}>("/api/passkeys/login/options",{});
      attemptId=result.attemptId;
      if(interrupted.current){await post("/api/passkeys/login/cancel",{attemptId});setMessage("로그인을 취소했습니다.");return;}
      const credential=await startAuthentication({optionsJSON:result.options});
      if(interrupted.current){await post("/api/passkeys/login/cancel",{attemptId});setMessage("로그인을 취소했습니다.");return;}
      sent=true;setVerifying(true);setMessage("서명을 확인하고 있습니다…");
      await post("/api/passkeys/login/verify",{attemptId,credential});
      window.location.assign("/private");
    } catch(error) {
      if(attemptId && !sent){
        await post("/api/passkeys/login/cancel",{attemptId}).catch(()=>{});
        setMessage("기기 인증이 취소되었거나 완료되지 않았습니다. 개인 공간은 잠겨 있습니다.");
      } else setMessage(error instanceof Error?error.message:"로그인하지 못했습니다.");
    } finally{setBusy(false);setVerifying(false);}
  }
  return <section className="registration-panel" aria-labelledby="login-title">
    <h2 id="login-title">등록한 패스키로 들어가기</h2>
    <p>구글 비밀번호 관리자 등에 저장한 이 사이트의 패스키를 선택하세요. 기기가 서명하고 서버가 공개키로 확인한 뒤에만 개인 공간이 열립니다.</p>
    <button className="registration-button" disabled={supported!==true||busy} onClick={login}>{verifying?"서명을 확인하는 중…":busy?"기기 인증을 기다리는 중…":"패스키로 로그인"}</button>
    {busy&&!verifying&&<button className="registration-secondary" onClick={()=>{interrupted.current=true;WebAuthnAbortService.cancelCeremony();}}>로그인 취소</button>}
    {supported===false&&<p role="alert">이 브라우저에서 패스키를 사용할 수 없습니다. 등록했던 일반 Chrome에서 이 주소를 열어 주세요.</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}

export function LogoutButton() {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function logout(){setBusy(true);try{await post("/api/passkeys/logout",{});window.location.replace("/private");}catch(error){setMessage(error instanceof Error?error.message:"로그아웃하지 못했습니다.");setBusy(false);}}
  // Clear a page restored from back-forward cache; server/API authorization remains authoritative.
  useEffect(()=>{const check=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload();};window.addEventListener("pageshow",check);return()=>window.removeEventListener("pageshow",check);},[]);
  return <div><button className="registration-secondary" disabled={busy} onClick={logout}>{busy?"로그아웃 중…":"로그아웃"}</button><p role="status">{message}</p></div>;
}
