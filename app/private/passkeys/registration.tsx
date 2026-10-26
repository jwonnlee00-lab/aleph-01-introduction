"use client";

import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, startRegistration, WebAuthnAbortService, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type KeyRecord = { credential_id: string; name: string; public_key: string; storage_location: string; device_type: string; backed_up: number; created_at: number };
type Evidence = { passkeys: KeyRecord[]; attempts: { id: string; challenge: string; state: string; request_json: string | null }[]; canManage: boolean; currentCredentialId: string | null; events: {name:string;action:string;remaining_count:number;created_at:number}[]; [key: string]: unknown };
async function api<T = Record<string, unknown>>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, { method: payload === undefined ? "GET" : "POST", cache: "no-store", headers: payload === undefined ? {} : { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const result = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "요청에 실패했습니다.");
  return result;
}

export default function PasskeyRegistration() {
  const [name, setName] = useState("Windows Hello · 예비 열쇠");
  const [storageLocation, setStorageLocation] = useState("기기 자체");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<KeyRecord | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const attempt = useRef<string | null>(null);
  const interrupted = useRef(false);
  async function refresh() { const data = await api<Evidence>("/api/passkeys"); setEvidence(data); return data; }
  useEffect(() => {
    setSupported(window.isSecureContext && browserSupportsWebAuthn());
    refresh().catch(error => setMessage(error.message)).finally(() => setLoading(false));
    return () => { WebAuthnAbortService.cancelCeremony(); };
  }, []);

  async function register() {
    if (!confirmation) return;
    interrupted.current = false; setBusy(true); setMessage("");
    let phase: "options" | "device" | "verify" = "options";
    let credentialId: string | null = null;
    try {
      const options = await api<{attemptId:string;options:PublicKeyCredentialCreationOptionsJSON}>("/api/passkeys/register/options", { name, storageLocation });
      attempt.current = options.attemptId;
      if (interrupted.current) {
        await api("/api/passkeys/register/cancel", { attemptId: options.attemptId });
        attempt.current = null; setMessage("등록을 취소했습니다. 패스키 공개키는 저장하지 않았습니다."); await refresh(); return;
      }
      phase = "device";
      const credential = await startRegistration({ optionsJSON: options.options });
      if (interrupted.current) {
        await api("/api/passkeys/register/cancel", { attemptId: options.attemptId });
        attempt.current = null; setMessage("등록을 취소했습니다. 서버에 공개키는 저장하지 않았습니다."); return;
      }
      credentialId = credential.id;
      phase = "verify"; setSaving(true); setMessage("기기 인증 완료 · 공개키를 서버에 저장하고 있습니다…");
      await api("/api/passkeys/register/verify", { attemptId: options.attemptId, credential });
      attempt.current = null;
      setMessage("등록 완료: 공개키를 서버에 저장했습니다. 아래 목록에서 이름과 공개키를 확인하세요.");
    } catch (error) {
      if (attempt.current && phase !== "verify") {
        try {
          await api("/api/passkeys/register/cancel", { attemptId: attempt.current });
          const duplicate = error instanceof Error && (error.name === "InvalidStateError" || (error as Error & {code?:string}).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED");
          setMessage(duplicate ? "이 저장 위치에는 이미 등록된 패스키가 있습니다. 구글 관리자 대신 Windows Hello 등 다른 저장 위치를 선택해 주세요." : "등록이 취소되었거나 기기 인증을 완료하지 못했습니다. 서버에 패스키 공개키를 저장하지 않았습니다.");
        } catch { setMessage("등록을 끝내지 못했습니다. 목록을 새로고침해 저장 여부를 확인해 주세요."); }
        attempt.current = null;
      } else {
        const latest = await refresh().catch(() => null);
        if (credentialId && latest?.passkeys.some(key => key.credential_id === credentialId)) setMessage("등록 완료: 서버 목록에서 공개키 저장을 확인했습니다.");
        else setMessage(error instanceof Error ? error.message : "등록을 확인하지 못했습니다. 목록을 확인해 주세요.");
      }
    } finally {
      attempt.current = null; setBusy(false); setSaving(false);
      await refresh().catch(() => setMessage(previous => previous + " 목록을 불러오지 못했습니다. ‘목록 새로고침’을 눌러 주세요."));
    }
  }
  function cancel() {
    interrupted.current = true; WebAuthnAbortService.cancelCeremony();
  }
  async function removeKey() {
    if (!deleteCandidate || !deleteConfirmed) return;
    setBusy(true);setMessage("");
    try {
      const result = await api<{message:string}>("/api/passkeys/delete", {credentialId:deleteCandidate.credential_id,confirmName:deleteCandidate.name});
      setMessage(result.message);setDeleteCandidate(null);setDeleteConfirmed(false);
    } catch(error) { setMessage(error instanceof Error?error.message:"삭제 결과를 확인해 주세요."); }
    finally {setBusy(false);await refresh().catch(()=>{});}
  }
  async function download() {
    try {
      const data = await refresh();
      const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "card2-registration-evidence.json"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "기록을 받지 못했습니다."); }
  }
  return <>
    <section className="registration-panel" aria-labelledby="register-title">
      <h2 id="register-title">{evidence?.passkeys.length ? "두 번째 열쇠 등록하기" : "패스키에 이름 붙이기"}</h2>
      {evidence && !evidence.canManage && <div className="registration-confirm"><p>키를 추가·삭제하려면 최근 10분 안에 패스키로 로그인해야 합니다.</p><a className="private-link" href="/private?reauth=1">패스키로 다시 확인하기 →</a><p className="registration-hint">로그인 후 이 목록으로 돌아와 ‘목록 새로고침’을 눌러 주세요.</p></div>}
      <label className="registration-field">패스키 이름<input maxLength={40} value={name} onChange={e => setName(e.target.value)} disabled={busy} autoComplete="off" /></label>
      <label className="registration-field">저장할 위치<select value={storageLocation} onChange={e => { setStorageLocation(e.target.value); setConfirmation(false); }} disabled={busy}>
        <option>구글 비밀번호 관리자</option><option>기기 자체</option><option>보안 키</option>
      </select></label>
      <p className="registration-hint">등록창에서도 같은 위치를 선택하세요. 저장 업체 이름은 브라우저 응답만으로 확인할 수 없어 직접 확인해 기록합니다. 구글 관리자가 안 보이면 해당 관리자를 사용하는 Chrome이나 휴대전화에서 같은 주소로 진행하세요.</p>
      <p className="registration-hint">예비 키는 기기 자체를 선택하고 인증창에서 Windows Hello에 저장하세요. 구글 키가 다른 기기에 동기화되어 보이는 것은 별도의 두 번째 키가 아닙니다.</p>
      {supported === false && <p role="alert">이 브라우저에서 패스키를 사용할 수 없습니다. HTTPS 주소를 패스키 지원 브라우저에서 열어 주세요.</p>}
      <div className="registration-confirm">
        <label><input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} disabled={busy} /> 기기 인증창에서도 ‘{storageLocation}’를 선택해 저장하겠습니다.</label>
        <p className="registration-hint">다른 위치만 보이면 기기 인증창에서 취소하세요. 기기 인증을 마치면 공개키를 서버에 바로 저장하고 목록을 갱신합니다.</p>
      </div>
      <button className="registration-button" onClick={register} disabled={supported !== true || busy || loading || !name.trim() || !confirmation || !evidence?.canManage}>{saving ? "공개키를 저장하는 중…" : busy ? "기기 인증을 기다리는 중…" : "패스키 만들고 등록하기"}</button>
      {busy && !saving && <button className="registration-secondary" onClick={cancel}>등록 취소</button>}
      <p role="status" aria-live="polite" className="registration-message">{message}</p>
    </section>
    <section className="registration-panel" aria-labelledby="list-title">
      <h2 id="list-title">등록한 패스키 <span className="registration-count">{evidence?.passkeys.length ?? 0}개</span></h2>
      {loading ? <p>목록을 확인하고 있습니다.</p> : !evidence ? <p>목록을 불러오지 못했습니다. 새로고침해 주세요.</p> : evidence.passkeys.length === 0 ? <p>아직 서버에 등록한 패스키가 없습니다.</p> : <ul className="passkey-list">{evidence.passkeys.map(key => <li key={key.credential_id}>
        <h3>{key.name}</h3><p>저장 위치: {key.storage_location} · 등록자가 선택한 값</p>
        <p>등록 시각: {new Date(key.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</p>
        {evidence.currentCredentialId===key.credential_id&&<p className="registration-hint">현재 로그인에 사용한 키 · 삭제하면 이 키로 만든 세션도 종료됩니다.</p>}
        <details><summary>서버에 저장된 공개키 보기</summary><p>COSE_Key 형식을 base64url로 표현한 공개키입니다. 비밀번호나 개인키가 아닙니다.</p><pre>{key.public_key}</pre><p>기기 유형: {key.device_type} · 백업 상태: {key.backed_up ? "백업됨" : "백업 확인 안 됨"}</p></details>
        <button className="registration-secondary" disabled={busy || !evidence.canManage || evidence.passkeys.length<2} onClick={()=>{setDeleteCandidate(key);setDeleteConfirmed(false);}}>{evidence.passkeys.length<2?"마지막 열쇠 · 삭제 불가":"이 패스키 삭제"}</button>
      </li>)}</ul>}
      {deleteCandidate&&<div className="registration-confirm" role="group" aria-label="패스키 삭제 확인"><h3>‘{deleteCandidate.name}’ 삭제</h3><p>서버의 공개키와 해당 키로 만든 세션을 폐기합니다. 기기 관리자에 남은 키로도 이 사이트에 로그인할 수 없습니다.</p><p>남겨 둘 다른 키로 로그인할 수 있는지 먼저 확인하세요. 마지막 키는 삭제되지 않습니다.</p><label><input type="checkbox" checked={deleteConfirmed} disabled={busy} onChange={e=>setDeleteConfirmed(e.target.checked)}/> 삭제할 키 이름과 남길 다른 키를 확인했습니다.</label><div><button className="registration-button" disabled={busy||!deleteConfirmed} onClick={removeKey}>확인한 패스키 삭제하기</button><button className="registration-secondary" disabled={busy} onClick={()=>setDeleteCandidate(null)}>돌아가기</button></div></div>}
      <button className="registration-secondary" disabled={busy} onClick={() => refresh().catch(error => setMessage(error.message))}>목록 새로고침</button>
      <button className="registration-secondary" disabled={busy || !evidence} onClick={download}>제출용 등록 기록 내려받기</button>
      <p className="registration-hint">완료·취소된 등록 질문, 기기가 보낸 등록 요청 본문, 서버의 공개키와 저장 위치를 담습니다. 쿠키·계정 정보·개인키는 담지 않습니다. 실제 등록 기록은 소유자만 볼 수 있습니다.</p>
      <p className="registration-hint">등록 창에서 취소하면 공개키는 저장하지 않습니다. 질문과 취소 상태는 검증 기록으로 남습니다.</p>
      <section className="registration-confirm" aria-labelledby="lost-title"><h3 id="lost-title">열쇠를 모두 잃으면</h3><p>서버에 등록된 키가 0개면 패스키 로그인은 거절됩니다. 마지막 키 삭제는 막아 둡니다.</p><p>등록된 모든 키를 실제로 잃었거나 사용할 수 없으면 개인 공간에 들어갈 수 없습니다. 이 화면에는 비밀번호나 자동 복구 기능이 없습니다. 사이트 운영자가 별도로 본인을 확인하고 재설정해야 합니다.</p><p className="registration-hint">처음 키를 등록하는 0개 상태에서만 소유자 계정 확인 후 첫 키를 등록할 수 있습니다. 키가 이미 있으면 키 추가에도 패스키 로그인이 필요합니다.</p></section>
      {!!evidence?.events?.length&&<section aria-label="패스키 삭제 기록"><h3>삭제 기록</h3><ul>{evidence.events.map((event,index)=><li key={index}>{event.name} · {new Date(event.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} · 삭제 뒤 {event.remaining_count}개 남음</li>)}</ul></section>}
    </section>
  </>;
}
