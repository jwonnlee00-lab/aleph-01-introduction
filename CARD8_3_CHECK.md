# 카드 3 — 패스키로 들어가기

공개 소개는 누구나 볼 수 있습니다. ‘나만의 자리’에서는 등록한 패스키로 로그인해야 가상 자료 세 항목이 열립니다. 서버가 매번 새 질문을 만들고, 기기가 보낸 서명을 저장된 공개키로 검증합니다. 통과한 경우에만 서버 세션을 발급합니다. ChatGPT 소유자 확인만으로 개인 공간을 열 수는 없습니다.

## 확인 방법

어디로 가나요: https://jungwon-intro.jwonnlee00.chatgpt.site/private  
무엇을 하나요: ‘패스키로 로그인’ → 등록한 패스키로 기기 인증 → 가상 자료 확인 후 로그아웃합니다.  
통과 모습: 로그인 뒤 자료 3개가 보이고, 로그아웃 뒤 자료 요청이 401로 거절됩니다.  
안 될 때: 취소·미지원·서명 오류·사용하거나 만료된 질문 안내가 나오며 개인 공간은 계속 잠겨 있습니다.

## 구현 설명

### 1. 로그인 질문

`POST /api/passkeys/login/options`가 SimpleWebAuthn의 `generateAuthenticationOptions()`로 새 질문을 만듭니다. 질문과 5분 만료 시각은 D1의 `passkey_login_attempts`에 보관합니다. 로그인 요청 번호와 HttpOnly 쿠키의 해시를 함께 확인해, 같은 브라우저에서 시작한 요청만 검증합니다. 이 쿠키는 등록용 쿠키나 로그인 완료 세션과 다릅니다.

같은 브라우저에서 새 로그인을 시작하면 이전 미완료 질문은 superseded로 바꿉니다. 한 IP에서는 1시간에 로그인 질문을 60회까지 발급합니다. IP 원문은 저장하지 않고 해시로 횟수만 계산하며 제출 기록에서 제외합니다.

### 2. 공개키로 서명 확인

브라우저의 `startAuthentication()`이 기기 인증을 요청합니다. 돌아온 `clientDataJSON`, `authenticatorData`, `signature`를 `POST /api/passkeys/login/verify`로 보냅니다. 서버는 credential ID로 소유자에게 등록된 공개키를 조회합니다. 응답에 들어 있는 임의 공개키를 믿거나 새로 등록하지 않습니다.

`verifyAuthenticationResponse()`에 DB의 공개키와 카운터, 서버가 보관한 질문, 정확한 origin과 RP ID를 전달합니다. 사용자 존재·확인 플래그를 요구하고, 검증 결과가 true인 경우에만 세션을 만듭니다. 다른 개인키로 만든 서명이나 모르는 credential ID, 잘못된 origin·RP ID, 사용자 확인 플래그가 없는 응답은 거절합니다.

### 3. 질문 재사용 차단

검증 전에 조건부 UPDATE로 pending이면서 만료되지 않은 질문 하나를 verifying 상태로 바꿉니다. 먼저 처리한 요청만 행을 받을 수 있습니다. 서명 검증이 성공하거나 실패하면 그 질문은 다시 쓸 수 없습니다. 사용·취소·만료·대체된 질문은 409와 CHALLENGE_UNAVAILABLE로 거절합니다.

서명 카운터 갱신과 세션 발급, 성공 상태 변경은 D1 batch에서 처리합니다. 기존 카운터가 동시에 바뀌었다면 세션을 만들지 않습니다. 동기화 패스키가 카운터 0을 사용하는 경우도 검증 라이브러리의 규칙에 따라 처리합니다.

### 4. 로그인 뒤의 세션

로그인 뒤 사람을 알아보는 수단은 **서버 세션**입니다. 성공할 때마다 임의의 32바이트 값을 새로 만들고, DB의 `passkey_sessions`에는 그 값의 SHA-256 해시만 저장합니다. 실제 값은 운영 사이트의 `__Host-pk-session` 쿠키에 넣습니다. 쿠키에는 Secure, HttpOnly, SameSite=Strict, Path=/를 적용하고 유효 시간은 1시간으로 정했습니다. localhost 시험에서는 Secure를 붙일 수 없어 별도 이름인 `pk-session-local`을 사용합니다.

세션 값은 응답 JSON이나 localStorage에 넣지 않습니다. `/private`의 서버 렌더링과 `/api/private/items`는 매번 세션의 존재·만료·폐기 상태와 해당 패스키의 존재를 검사합니다. 검증 전에 내려받은 HTML이나 클라이언트 번들에는 비공개 본문이 없습니다. 인증 결과와 자료 응답은 캐시하지 않습니다.

### 5. 로그아웃

`POST /api/passkeys/logout`은 현재 세션을 DB에서 폐기한 뒤 쿠키도 지웁니다. 쿠키만 지우는 방식이 아니므로, 이전 값을 따로 보관했다가 다시 보내도 자료를 받을 수 없습니다. 로그인에 다시 성공하면 같은 브라우저의 이전 세션도 폐기해 값을 교체합니다. 뒤로가기로 보관된 화면이 복원되면 페이지를 다시 불러옵니다.

### 6. 기록과 비밀번호

`evidence/card3-local/requests-responses.json`은 로컬 소프트웨어 시험의 요청과 응답을 담습니다. 모든 Cookie와 Set-Cookie 값은 가렸습니다. 테스트는 실제 값을 메모리에서 다시 보내 거절을 확인한 뒤, 저장할 JSON 어디에도 그 값이 들어 있지 않은지 검사합니다. 공개 기록에는 서버의 세션 해시도 넣지 않습니다. 실제 사용자의 로그인 요청과 세션은 이 시험에 사용하지 않았습니다.

이 사이트에는 비밀번호 입력칸이나 비밀번호 저장 기능이 없습니다. 기기·구글 관리자가 요구하는 PIN은 이 사이트로 보내지 않습니다.

## 검증 결과

2026-10-26 로컬 Worker와 D1에서 소프트웨어 EC 키로 실제 서명을 만들고 44개 요청을 확인했습니다. 실제 사용자 패스키가 아니라 로컬에서만 만든 시험 키입니다. 개인키는 시험 프로세스 안에 두고 내보내지 않았습니다. 빌드와 TypeScript 검사를 통과했습니다.

| 요청 조건 | 결과 |
| --- | --- |
| 저장한 공개키와 짝인 개인키로 올바른 질문에 서명 | 200, verified: true, 서버 세션 발급 |
| 같은 등록 ID에 틀린 서명 또는 다른 개인키 서명 | 401, SIGNATURE_INVALID, 세션 없음 |
| 성공한 요청 본문을 그대로 재전송 | 409, CHALLENGE_UNAVAILABLE |
| 틀린 서명으로 거절된 질문을 다시 사용 | 409, CHALLENGE_UNAVAILABLE |
| 로그인 전 또는 ChatGPT 확인 헤더만 넣은 자료 요청 | 401, AUTH_REQUIRED |
| 유효한 로그인 세션으로 자료 요청 | 200, items 3개 |
| 세션 교체 뒤 이전 쿠키로 요청 | 401, AUTH_REQUIRED |
| 로그아웃 전에 저장한 같은 쿠키로 다시 요청 | 401, AUTH_REQUIRED |
| 세션 만료 시각이 지난 쿠키 | 401, AUTH_REQUIRED |
| 취소·만료·대체된 질문 | 409 |
| 모르는 credential ID, 잘못된 서명 origin·RP ID, 사용자 확인 플래그 없음 | 401 |

서로 다른 로그인 요청에서 발급된 질문은 다음과 같습니다. 둘 다 시험에서 이미 처리해 재사용할 수 없습니다.

```text
T7V-UqmQFza2a3kubQX-vN0e4nPtx0IS1_Dlz10p5to
crrR68G5RM56Zhr06kzKvS2Alj_AafLzsTK4rmID_Qo
```

요청·응답 파일의 case 이름으로 다음 기록을 나란히 찾을 수 있습니다.

- 성공: `valid signature accepted`
- 실패: `wrong signature rejected`
- 성공 요청 재사용: `successful challenge replay rejected`
- 로그아웃 후 같은 값 재사용: `same saved cookie after logout rejected`

| 기준 | 근거 |
| --- | --- |
| T08-C27·C28 | 서버가 만든 서로 다른 두 질문과 options 요청·응답 |
| T08-C29·C30 | 실제 EC 서명의 성공 200과 변조·다른 개인키 서명의 실패 401 |
| T08-C31 | 성공한 요청을 그대로 다시 보내 409 확인 |
| T08-C32 | 서버 세션의 해시 저장과 HttpOnly 쿠키 방식 설명 |
| T08-C33 | 로그아웃 전에 보관한 같은 쿠키로 요청해 401 확인 |
| T08-C34 | 저장 전 쿠키 값을 가리고 원래 값이 JSON에 없는지 검사 |
| T08-C35 | 로그인 화면에 비밀번호 입력칸이 없으며 WebAuthn 기기 인증만 사용 |

위 44건은 로컬 소프트웨어 시험입니다. 이후 실제 Chrome 로그인·자료 조회·로그아웃도 사용자 확인과 운영 DB로 대조했으며, 아래 실제 기기 확인에 별도로 기록했습니다.

## 주요 파일

- `lib/passkey-login.ts`: 질문 발급·서명 검증·세션 조회·로그아웃을 처리합니다.
- `app/api/passkeys/login/`: options·verify·cancel 요청을 받습니다.
- `app/api/passkeys/logout/route.ts`: 서버 세션을 폐기합니다.
- `lib/private-access.ts`: 서버 자료 접근 검사를 수행합니다.
- `lib/private-items.server.ts`: 검사 뒤 가상 자료만 반환합니다.
- `app/private/page.tsx`, `app/private/login.tsx`: 잠금 화면과 인증된 자료, 로그인·로그아웃 버튼입니다.
- `db/schema.ts`, `drizzle/0002_burly_ego.sql`: 로그인 질문과 세션 스키마입니다.
- `scripts/check-card3.mjs`: 실제 사용자 값 없이 서명 성공·실패와 세션 폐기를 검사합니다.

## 재현 방법

로컬 DB에 기존 마이그레이션을 적용한 상태에서 `0002_burly_ego.sql`을 한 번 추가 적용합니다. 이미 적용한 SQL은 반복하지 않습니다. 로컬 Worker에는 `PASSKEY_OWNER_ID=local-software-test-owner`, `PASSKEY_OWNER_EMAIL=owner@example.test`의 가상 설정을 넣고 `http://localhost:5173`에서 실행합니다.

```sh
node scripts/check-card3.mjs http://localhost:5173
```

이 스크립트는 실제 배포 주소에서 실행되지 않도록 제한했습니다. 소스·설명은 [SimpleWebAuthn 서버 문서](https://simplewebauthn.dev/docs/packages/server)의 서명 검증 규칙을 따릅니다.

## 실제 기기 확인

2026-10-26 사용자가 등록했던 Chrome에서 자료 세 개가 보이고 로그아웃 뒤 잠긴다고 확인했습니다. 운영 DB에서도 로그인 시도의 verified 상태와 세션의 revoked_at 값이 기록된 것을 대조했습니다. 쿠키·세션 해시·계정 ID·실제 서명 요청 원문은 제출하지 않았습니다. 공개 요약은 evidence/card3-production/actual-flow-summary.json에 있습니다.

배포 주소에 세션 없이 다시 요청한 결과도 보관했습니다. /private는 잠금 화면 200, /api/private/items는 401이었고 비공개 본문은 없었습니다. 실제 기기 성공·로그아웃 확인과 로컬 소프트웨어 키의 변조·재사용 공격 검사를 구분해 기록했습니다.
