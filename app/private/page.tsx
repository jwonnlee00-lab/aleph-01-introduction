export const dynamic = "force-dynamic";

export default function PrivateSpace() {
  return (
    <main className="private-room">
      <a className="private-link" href="/">← 공개 소개로 돌아가기</a>
      <p className="eyebrow">PRIVATE · 비공개 영역</p>
      <h1>나만의 자리</h1>
      <p className="private-status">잠김 · 패스키 로그인 필요</p>
      <p>비공개 자료 3개는 서버에서 보관합니다. 로그인 전에는 내용을 표시하지 않습니다.</p>
      <p>현재 카드 1에서는 공간 구분과 접근 거절만 구현했습니다. 패스키 등록·로그인은 다음 단계에서 제공됩니다.</p>
      <a className="private-link" href="/api/private/items">비로그인 자료 요청 확인하기 →</a>
    </main>
  );
}
