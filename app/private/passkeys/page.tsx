import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { ownerIdentity } from "@/lib/passkey-registration";
import PasskeyRegistration from "./registration";

export const dynamic = "force-dynamic";
export default async function PasskeysPage() {
  const user = await getChatGPTUser();
  let allowed = false;
  let accessMessage = "다른 사람이 먼저 열쇠를 등록하지 못하도록, 등록 화면은 소유자에게만 열립니다.";
  let accessCode = "OWNER_SIGN_IN_REQUIRED";
  if (user) {
    try { await ownerIdentity(); allowed = true; }
    catch (error) {
      if (error instanceof Response) {
        const detail = await error.json() as { error: string; message: string };
        accessCode = detail.error; accessMessage = detail.message;
      } else { accessCode = "REGISTRATION_UNAVAILABLE"; accessMessage = "소유자 확인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."; }
    }
  }
  return <main className="private-room registration-room">
    <a className="private-link" href="/private">← 나만의 자리</a>
    <p className="eyebrow">PASSKEY · 열쇠 등록</p>
    <h1>비밀번호 대신,<br />내 기기의 열쇠</h1>
    <p>기기가 열쇠를 만들고 서버에는 공개키만 보냅니다. 비공개 자료는 패스키 로그인을 붙이는 다음 카드까지 잠겨 있습니다.</p>
    {allowed ? <PasskeyRegistration /> : <section className="registration-panel">
      <h2>소유자 확인이 필요합니다</h2>
      <p role="alert">{accessMessage}</p>
      <p className="registration-hint">확인 코드: {accessCode}</p>
      <a className="registration-button" href={chatGPTSignInPath("/private/passkeys")} target="_top">소유자 ChatGPT 계정으로 확인</a>
      {user && <a className="registration-secondary" href={chatGPTSignOutPath("/private/passkeys")} target="_top">사이트 로그인 해제</a>}
      <p className="registration-hint">이 확인은 등록 권한만 확인합니다. 개인 공간을 열거나 사이트 비밀번호를 만들지 않습니다.</p>
    </section>}
  </main>;
}
