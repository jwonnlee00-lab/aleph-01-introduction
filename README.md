# 정원의 소개 · 패스키 과제

공개 소개와 취향은 누구나 읽을 수 있습니다. 소개 아래의 ‘나만의 자리’에는 가상 자료 세 항목을 두고 서버에서 접근을 막았습니다. 카드 2에서는 소유자가 패스키를 등록하고 공개키와 이름을 서버에 저장할 수 있습니다. 카드 3에서는 패스키 서명을 확인한 뒤 서버 세션을 발급합니다. 로그인한 세션만 가상 자료 세 항목을 조회할 수 있고, 로그아웃하면 같은 쿠키를 다시 보내도 401로 거절됩니다.

- 결과물: https://jungwon-intro.jwonnlee00.chatgpt.site
- 패스키 로그인: https://jungwon-intro.jwonnlee00.chatgpt.site/private
- 카드 3 구현 설명과 검증: [CARD8_3_CHECK.md](CARD8_3_CHECK.md)
- 카드 4 예비 키·삭제·분실 안내: [CARD8_4_CHECK.md](CARD8_4_CHECK.md)
- 패스키 등록: https://jungwon-intro.jwonnlee00.chatgpt.site/private/passkeys
- 카드 1 설명: [CARD8_1_CHECK.md](CARD8_1_CHECK.md)
- 카드 2 구현 설명과 검증: [CARD8_2_CHECK.md](CARD8_2_CHECK.md)

## 실행 방법

Node.js 22.13 이상과 pnpm 11.25.0을 사용합니다.

```sh
pnpm run install:ci
pnpm run db:generate
pnpm run build
```

처음 로컬 DB를 만들 때 생성된 SQL을 한 번 적용합니다.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_hard_komodo.sql
pnpm run start
node scripts/check-card1.mjs http://127.0.0.1:8787
```

이미 적용한 마이그레이션은 다시 실행하지 않습니다. 실제 배포용 소유자 정보는 Sites 런타임의 PASSKEY_OWNER_EMAIL에 비밀 설정으로 보관합니다. 로컬 시험은 실제 계정 대신 owner@example.test 가상 계정을 씁니다. 실제 소유자 값이나 쿠키는 소스에 넣지 않습니다.

## 주요 파일

| 파일 | 동작 |
| --- | --- |
| app/page.tsx | 공개 소개와 잠긴 개인 공간의 경계를 표시합니다. |
| app/private/page.tsx | 잠금 안내와 패스키 등록 입구입니다. |
| app/private/passkeys/ | 소유자 확인, 기기 등록과 이름·공개키 목록을 보여 줍니다. |
| app/api/passkeys/register/ | 등록 질문 생성, 응답 검증, 취소 요청을 받습니다. |
| lib/passkey-registration.ts | 질문 보관과 검증, 공개키 저장을 처리합니다. |
| app/api/passkeys/route.ts | 소유자에게만 목록과 등록 증거를 반환합니다. |
| app/api/private/items/route.ts | 비공개 자료 조회 경로입니다. 세션이 없거나 폐기·만료되면 401을 반환합니다. |
| lib/private-access.ts | 패스키로 검증된 서버 세션만 자료 조회를 허용합니다. |
| db/schema.ts | 공개키와 등록 시도 기록의 컬럼을 정의합니다. |

## 검증 결과

빌드와 TypeScript 검사를 통과했습니다. 로컬 소프트웨어 시험에서는 등록 질문의 차이, 공개키 저장, 취소 시 공개키 미저장, 질문 재사용·만료·잘못된 출처·다른 계정 거절을 24개 요청으로 확인했습니다. 소프트웨어 시험은 실제 구글 관리자 등록이 아닙니다. 실제 등록과 기기 인증창 취소는 사용자 기기에서 확인해야 합니다.

- [카드 1 배포 응답](evidence/card1-production)
- [카드 2 로컬 요청·응답과 시험용 공개키](evidence/card2-local)
- [카드 2 배포 API의 익명 접근 거절](evidence/card2-production)

등록은 USB 보안 키 외에도 구글 비밀번호 관리자와 기기 자체 저장을 사용할 수 있습니다. 구글 관리자를 이용하려면 일반 Chrome이나 지원되는 Android 기기에서 등록하고 실제 저장 위치를 확인합니다.

index.html과 style.css는 이전 정적 소개 페이지입니다. 현재 배포 코드는 app/입니다. 로그인·로그아웃·자료 조회는 app/api/passkeys/login/, app/api/passkeys/logout/, app/api/private/items/를 통해 처리합니다. 카드 3의 로컬 서명·세션 검사 44건을 통과했습니다. 실제 Chrome에서도 자료 3개 조회와 로그아웃 후 잠금을 사용자가 확인했고, 운영 DB의 로그인 성공·세션 폐기 기록과 대조했습니다.

## 예비 키와 분실 대비

같은 소유자에 다른 패스키를 추가하고 이름·등록 날짜로 구분할 수 있습니다. 최근 10분 안에 패스키로 로그인한 경우에만 기존 키가 있는 계정에 키를 추가하거나 삭제합니다. 삭제한 키와 그 키의 세션은 즉시 거절하고, 마지막 키는 삭제하지 못하게 합니다.

로컬 소프트웨어 키의 등록·삭제·남은 키 로그인·삭제 키 거절·동시 삭제 보호·0개 상태 검사 26건과 기존 로그인 검사 44건을 통과했습니다. 실제 두 번째 Windows Hello 키 등록과 삭제 대상 선택은 사용자 기기에서 진행해야 하며, 로컬 시험을 실제 등록 완료로 표시하지 않습니다. 모든 기기 접근을 잃으면 자동 복구하지 않고 운영자의 별도 본인 확인과 재설정이 필요합니다.

## 두 시험 계정

`/private/exercise`에서 기존 개인 공간과 별개인 시험 계정 A·B의 패스키를 등록하고 자료 격리를 확인합니다. 소유자 확인과 최근 개인 공간 로그인이 있어야 등록할 수 있으며 비밀번호는 사용하지 않습니다. 사용 순서와 검증 범위는 [TWO_ACCOUNT_CHECK.md](TWO_ACCOUNT_CHECK.md)에 있습니다.
