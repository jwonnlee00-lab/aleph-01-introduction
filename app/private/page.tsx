import { getPrivateSession } from "@/lib/passkey-login";
import { getPrivateItems } from "@/lib/private-items.server";
import PasskeyLogin, { LogoutButton } from "./login";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrivateSpace({searchParams}: {searchParams?: Promise<{reauth?:string}>}) {
  const reauth = (await searchParams)?.reauth === "1";
  const session = await getPrivateSession();
  const items = session && !reauth ? await getPrivateItems() : null;
  return (
    <main className="private-room">
      <a className="private-link" href="/">← 공개 소개로 돌아가기</a>
      <p className="eyebrow">PRIVATE · 비공개 영역</p>
      <h1>나만의 자리</h1>
      {items ? <>
        <p className="private-status">열림 · 패스키 서명 확인 완료</p>
        <p>서버 세션은 로그인 후 1시간 동안 유효합니다. 아래 내용은 모두 만든 연습용 자료입니다.</p>
        <LogoutButton />
        <section aria-label="나만 보는 가상 자료" className="registration-panel"><ul className="passkey-list">{items.map(item=><li key={item.id}><h2>{item.title}</h2><p>{item.body}</p></li>)}</ul></section>
      </> : <>
        {reauth&&<p>패스키 키 관리를 위해 기기에서 본인 확인을 다시 진행해 주세요.</p>}
        <p className="private-status">잠김 · 패스키 로그인 필요</p>
        <p>비공개 자료 3개는 서버에서 보관합니다. 로그인 전에는 내용을 내려주지 않습니다.</p>
        <PasskeyLogin />
      </>}
      <p><a className="registration-button" href="/private/passkeys">패스키 등록·목록 →</a></p>
      <a className="private-link" href="/api/private/items">서버 자료 요청 확인하기 →</a>
    </main>
  );
}
