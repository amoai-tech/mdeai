import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * GET /api/restaurants/my-vote?contest_id=<uuid>
 *
 * Returns the signed-in account's own ballot for that contest, so a second device can show
 * the same durable receipt. The user id comes from the verified Supabase session, never from
 * the request; the privileged RPC is called server-side and the service-role key never leaves
 * the server.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const contestId = new URL(request.url).searchParams.get("contest_id");
  // Reject malformed input here: a non-UUID must never reach the RPC as a query.
  if (!contestId || !UUID_RE.test(contestId)) {
    return NextResponse.json({ error: "invalid_contest" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  if (!service) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await service.rpc("vote_my_receipt", {
    p_contest_id: contestId,
    p_user_id: user.id,
  });
  if (error) {
    console.error("[my-vote] vote_my_receipt failed:", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  return NextResponse.json({ receipt: data ?? null });
}