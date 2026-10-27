import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import Exercise from "./exercise";
export const dynamic="force-dynamic";
export default function ExercisePage(){return <main className="private-room registration-room">
  <a className="private-link" href="/private">← 나만의 자리</a>
  <p className="eyebrow">PASSKEY · 두 계정 시험</p><h1>각자의 열쇠,<br/>각자의 메모</h1>
  <p>A와 B는 이 사이트 안의 가상 시험 계정입니다. 이메일 전송이나 비밀번호 입력 없이 각각 다른 패스키로 구분합니다. 기존 개인 공간의 키는 그대로 유지합니다.</p>
  <p>처음 등록할 때는 소유자 확인과 최근 10분 안의 기존 구글 키 로그인이 필요합니다. A 등록 → B 등록 → 각 계정 로그인과 접근 거절 시험 순서로 진행하세요.</p>
  <p><a className="private-link" href={chatGPTSignInPath("/private/exercise")}>소유자 ChatGPT 계정으로 확인 →</a></p>
  <p><a className="private-link" href="/private?reauth=1">기존 개인 공간 키로 재확인 →</a> 후 이 화면으로 돌아오세요.</p>
  <Exercise/>
</main>;}
