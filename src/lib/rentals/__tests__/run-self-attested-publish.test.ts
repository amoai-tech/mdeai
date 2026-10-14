import { describe, expect, it, vi } from "vitest";
import { runSelfAttestedPublishRpc } from "../run-self-attested-publish";

const row = {
  id: "a1",
  listing_workflow_status: "published",
  published_at: "2026-10-14T00:00:00Z",
  published_by: "u1",
};

function client(result: unknown) {
  return { rpc: vi.fn().mockResolvedValue(result) } as never;
}

describe("runSelfAttestedPublishRpc", () => {
  it("calls the self-attested RPC with the attestation and maps the transition", async () => {
    const supabase = client({ data: row, error: null });
    const res = await runSelfAttestedPublishRpc(supabase, "a1", {
      advertisingAuthority: true,
      photoRights: true,
    });
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "publish_self_attested_rental",
      { p_apartment_id: "a1", p_advertising_authority: true, p_photo_rights: true },
    );
    expect(res).toEqual({
      ok: true,
      transition: {
        apartmentId: "a1",
        listingWorkflowStatus: "published",
        publishedAt: row.published_at,
        publishedBy: "u1",
      },
    });
  });

  it("maps an ownership denial to 403", async () => {
    const supabase = client({
      data: null,
      error: { message: "not authorized to publish this listing", code: "42501" },
    });
    const res = await runSelfAttestedPublishRpc(supabase, "a1", {
      advertisingAuthority: true,
      photoRights: true,
    });
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("maps an internal inconsistent published state to 500", async () => {
    const supabase = client({
      data: null,
      error: { message: "published listing has inconsistent state", code: "23514" },
    });
    const res = await runSelfAttestedPublishRpc(supabase, "a1", {
      advertisingAuthority: true,
      photoRights: true,
    });
    expect(res).toMatchObject({ ok: false, status: 500 });
  });

  it("maps a missing self-attestation to 400", async () => {
    const supabase = client({
      data: null,
      error: {
        message: "self-attestation required: advertising authority and photo rights",
        code: "check_violation",
      },
    });
    const res = await runSelfAttestedPublishRpc(supabase, "a1", {
      advertisingAuthority: false,
      photoRights: false,
    });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});
