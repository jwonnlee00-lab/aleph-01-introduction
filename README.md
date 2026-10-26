# 패스키 과제 · 카드 1

공개 소개 아래에 ‘나만의 자리’를 추가했습니다. 공개 소개는 누구나 볼 수 있고, 개인 공간에는 잠금 안내만 나옵니다. 가상 자료 세 항목은 서버 전용 모듈에 두었습니다. 자료 API는 로그인 없이 요청하면 401로 거절합니다.

- 결과물: https://jungwon-intro.jwonnlee00.chatgpt.site
- 공개 화면: `app/page.tsx`
- 잠금 안내: `app/private/page.tsx`
- 비공개 조회: `app/api/private/items/route.ts`
- 접근 검사: `lib/private-access.ts`
- 가상 자료: `lib/private-items.server.ts`
- 설명과 확인 방법: [CARD8_1_CHECK.md](CARD8_1_CHECK.md)
- 배포 응답 증거: [evidence/card1-production](evidence/card1-production)

등록·로그인·로그아웃은 다음 카드에서 구현합니다. 현재는 비공개 자료 조회를 모두 거절합니다. 공개 GitHub에 들어 있는 연습 자료는 실제 비밀이 아닙니다. 이번 카드가 확인하는 경계는 웹사이트의 비로그인 응답입니다.

## 실행 방법

Node.js 22.13 이상, pnpm 11.25.0에서 실행합니다.

```sh
pnpm run install:ci
pnpm run build
pnpm run start
node scripts/check-card1.mjs http://127.0.0.1:8787
```

배포 주소로 검사하려면 마지막 명령에 `https://jungwon-intro.jwonnlee00.chatgpt.site`를 전달합니다. 검사 과정에서 쿠키 없는 공개·잠금 페이지, 비로그인 API, 가짜 쿠키 API 요청을 보냅니다. 서버 응답 본문과 상태 코드를 파일로 보관하며, 비공개 본문이 HTML과 연결된 클라이언트 스크립트에 포함되지 않았는지 확인합니다.

## 검증 결과

2026-10-26 로컬 Worker와 배포 주소에서 같은 네 요청을 확인했습니다. 공개·잠금 페이지는 200, 자료 API와 가짜 쿠키 API는 401이었고 비공개 본문은 없었습니다. 공개 HTML에 연결된 클라이언트 스크립트 세 개에도 비공개 본문이 없었습니다. 빌드와 TypeScript 검사도 통과했습니다.

`index.html`과 `style.css`는 이전 정적 소개 페이지입니다. 현재 배포 소스는 `app/`이며, 기존 파일은 이전 과제 기록으로 남겼습니다.
