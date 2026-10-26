import { verifyRegistration, registrationRoute } from "@/lib/passkey-registration";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return registrationRoute(() => verifyRegistration(request)); }
