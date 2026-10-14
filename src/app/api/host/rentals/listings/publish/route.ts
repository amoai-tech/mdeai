import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isListingWorkflowStatus } from "@/lib/rentals/listing-workflow";
import { runPublishRpc } from "@/lib/rentals/run-publish-rpc";
import { runSelfAttestedPublishRpc } from "@/lib/rentals/run-self-attested-publish";

const PUBLISH_MODES = ["verified", "self_attested"] as const;
type PublishMode = (typeof PUBLISH_MODES)[number];
const isPublishMode = (value: unknown): value is PublishMode =>
  typeof value === "string" && (PUBLISH_MODES as readonly string[]).includes(value);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apartmentIdRaw = (raw as Record<string, unknown>).apartmentId;
  if (typeof apartmentIdRaw !== "string") {
    return NextResponse.json({ error: "apartmentId must be a string" }, { status: 400 });
  }

  const apartmentId = apartmentIdRaw.trim();
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId is required" }, { status: 400 });
  }

  const mode = (raw as Record<string, unknown>).mode ?? "verified";
  if (!isPublishMode(mode)) {
    return NextResponse.json({ error: "Invalid publish mode" }, { status: 400 });
  }

  // Publish First, Verify Later: the owning landlord self-attests and publishes.
  if (mode === "self_attested") {
    const result = await runSelfAttestedPublishRpc(supabase, apartmentId, {
      advertisingAuthority: (raw as Record<string, unknown>).advertisingAuthority === true,
      photoRights: (raw as Record<string, unknown>).photoRights === true,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ transition: result.transition });
  }

  const listingWorkflowStatus = (raw as Record<string, unknown>).listingWorkflowStatus;
  if (!isListingWorkflowStatus(listingWorkflowStatus)) {
    return NextResponse.json({ error: "Invalid listingWorkflowStatus" }, { status: 400 });
  }

  const result = await runPublishRpc(supabase, apartmentId, listingWorkflowStatus);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ transition: result.transition });
}
