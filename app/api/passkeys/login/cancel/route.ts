import { cancelLogin, loginRoute } from "@/lib/passkey-login";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return loginRoute(() => cancelLogin(request)); }
