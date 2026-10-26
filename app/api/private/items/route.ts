import { getPrivateItems } from "@/lib/private-items.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json({ items: await getPrivateItems(request) }, { headers: { "Cache-Control": "no-store, private", Vary: "Cookie" } });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
