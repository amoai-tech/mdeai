import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, rpc })),
}));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const partner = "00000000-0000-4000-8000-000000000002";
const audit = "00000000-0000-4000-8000-000000000003";
function post(body: unknown) {
  return POST(new Request("http://localhost/api/partners/restaurants/" + id + "/assignment", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}
const body = { partnerId: partner, expectedPartnerId: null, reason: "Joined MDE" };

describe("SAN-1604 authenticated admin transfer adapter", () => {
  beforeEach(() => {vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:"admin"}}});});
  it("rejects guests without calling the database", async () => {
    getUser.mockResolvedValue({data:{user:null}});
    expect((await post(body)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects missing expected previous assignment and invalid reason", async () => {
    expect((await post({partnerId:partner,reason:"Joined MDE"})).status).toBe(400);
    expect((await post({...body,reason:""})).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes CAS + reason to the single audited RPC and returns persisted receipt", async () => {
    rpc.mockResolvedValue({data:{restaurantId:id,partnerId:partner,changed:true,auditId:audit},error:null});
    const res=await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({success:true,partnerId:partner,auditId:audit,changed:true});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("restaurant_admin_transfer",{
      p_restaurant_id:id,p_partner_id:partner,p_expected_partner_id:null,p_reason:"Joined MDE",
    });
  });
  it("denies an outsider and reports stale changes without a false receipt", async () => {
    rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}})
      .mockResolvedValueOnce({data:null,error:{code:"P0001"}});
    expect((await post(body)).status).toBe(403);
    expect((await post(body)).status).toBe(409);
  });
  it("refuses success without confirmed audit and exact target", async () => {
    rpc.mockResolvedValue({data:{restaurantId:id,partnerId:partner,changed:true},error:null});
    expect((await post(body)).status).toBe(500);
  });
  it("accepts a verified idempotent no-op without adding an audit", async () => {
    rpc.mockResolvedValue({data:{restaurantId:id,partnerId:partner,changed:false},error:null});
    const res=await post(body);
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toBe(false);
  });
});
