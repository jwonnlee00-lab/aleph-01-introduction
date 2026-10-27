import "server-only";
import { requirePrivateSession } from "./private-access";

// Fictional exercise data. Never import this module into a client component.
const items = [
  { id: "project", title: "음식 취향", body: "부산 사람이지만 돼지 내장 들어간 국밥을 잘 못 먹음" },
  { id: "applications", title: "노래 취향", body: "국내 발라드 정말 안 좋아함" },
  { id: "reflection", title: "취향 회고", body: "치이카와에서 아노코가 제일 귀엽다고 생각함" },
] as const;

export async function getPrivateItems(request?: Request) {
  await requirePrivateSession(request);
  return items;
}
