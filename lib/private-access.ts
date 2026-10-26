import "server-only";
import { getPrivateSession } from "./passkey-login";

export async function requirePrivateSession(request?: Request) {
  const session = await getPrivateSession(request);
  if (session) return session;
  throw new Response(JSON.stringify({ error: "AUTH_REQUIRED", message: "패스키 로그인이 필요합니다. 현재는 잠금 상태입니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Vary": "Cookie" },
  });
}
