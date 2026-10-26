import { registrationEvidence, registrationRoute } from "@/lib/passkey-registration";
export const dynamic = "force-dynamic";
export async function GET() { return registrationRoute(registrationEvidence); }
