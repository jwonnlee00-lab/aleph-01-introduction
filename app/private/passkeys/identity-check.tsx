"use client";
import { useState } from "react";

export default function IdentityCheck() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function check() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/passkeys/identity-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      const result = await response.json() as { code?: string; message?: string };
      if (!response.ok || !result.code) throw new Error(result.message ?? "확인 번호를 만들지 못했습니다.");
      setCode(result.code);
    } catch (error) { setMessage(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="registration-confirm">
    <p>같은 계정인데도 막히면 현재 Chrome의 로그인 식별자를 확인 번호로 연결할 수 있습니다.</p>
    <button className="registration-secondary" onClick={check} disabled={busy}>{busy ? "확인 중…" : "소유자 연결 확인 번호 받기"}</button>
    {code && <div role="status"><p>이 대화에 아래 번호를 보내 주세요. 유효 시간은 15분입니다.</p><p><strong style={{fontFamily:"monospace", fontSize:"1.3rem", overflowWrap:"anywhere"}}>{code}</strong></p></div>}
    <p className="registration-hint">확인 번호는 서버 기록을 찾는 용도입니다. 번호를 발급받는 것만으로는 등록 권한을 얻지 못하며 이메일이나 개인키를 보낼 필요가 없습니다.</p>
    {message && <p role="alert">{message}</p>}
  </div>;
}
