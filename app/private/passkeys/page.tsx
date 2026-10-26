import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { ownerIdentity } from "@/lib/passkey-registration";
import PasskeyRegistration from "./registration";

export const dynamic = "force-dynamic";
export default async function PasskeysPage() {
  const user = await getChatGPTUser();
  let allowed = false;
  if (user) { try { await ownerIdentity(); allowed = true; } catch { /* Show an access message without owner details. */ } }
  return <main className="private-room registration-room">
    <a className="private-link" href="/private">← 나만의 자리</a>
    <p className="eyebrow">PASSKEY · 열쇠 등록</p>
    <h1>비밀번호 대신,<br />내 기기의 열쇠</h1>
    <p>기기가 열쇠를 만들고 서버에는 공개키만 보냅니다. 비공개 자료는 패스키 로그인을 붙이는 다음 카드까지 잠겨 있습니다.</p>
    {allowed ? <PasskeyRegistration /> : <section className="registration-panel">
      <h2>소유자 확인이 필요합니다</h2>
      <p>{user ? "이 계정으로는 등록할 수 없습니다. 사이트 소유자 계정을 사용해 주세요." : "다른 사람이 먼저 열쇠를 등록하지 못하도록, 등록 화면은 소유자에게만 열립니다."}</p>
      <a className="registration-button" href={chatGPTSignInPath("/private/passkeys")} target="_top">소유자 ChatGPT 계정으로 확인</a>
      <p className="registration-hint">이 확인은 등록 권한만 확인합니다. 개인 공간을 열거나 사이트 비밀번호를 만들지 않습니다.</p>
    </section>}
  </main>;
}
