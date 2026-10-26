import "server-only";
import { requirePrivateSession } from "./private-access";

// Fictional exercise data. Never import this module into a client component.
const items = [
  { id: "project", title: "준비 중인 프로젝트 메모", body: "가상 프로젝트 달빛: 퍼즐 풀이 기록장을 만들고, 주말마다 화면 하나씩 완성한다." },
  { id: "applications", title: "지원 계획", body: "가상 기업 별숲 연구소와 구름 공방의 공고를 비교하고, 연습용 포트폴리오를 정리한다." },
  { id: "reflection", title: "개인 회고", body: "연습 회고: 서두르기보다 작은 기능을 끝까지 확인하자. 다음에는 오류 응답부터 기록한다." },
] as const;

export function getPrivateItems() {
  requirePrivateSession();
  return items;
}
