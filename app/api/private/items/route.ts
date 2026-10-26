import { getPrivateItems } from "@/lib/private-items.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: getPrivateItems() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
