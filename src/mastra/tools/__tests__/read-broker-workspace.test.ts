import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { setAuditUserId } from "@/mastra/lib/tool-audit-context";
import { HOST_SUPABASE_KEY } from "@/mastra/tools/hostops-read-tools";
import { readBrokerWorkspaceTool } from "../read-broker-workspace";
import { readBrokerWorkspace } from "@/lib/rentals/broker-concierge-read";

vi.mock("@/lib/rentals/broker-concierge-read", () => ({
  readBrokerWorkspace: vi.fn().mockResolvedValue({ listings: [], viewingRequests: [] }),
}));

describe("readBrokerWorkspaceTool runtime authorization", () => {
  it("is read-only and takes no model-supplied broker identity", () => {
    expect(readBrokerWorkspaceTool.id).toBe("read-broker-workspace");
    const schema = readBrokerWorkspaceTool.inputSchema;
    const keys = Object.keys((schema as unknown as {shape: Record<string, unknown>}).shape);
    expect(keys).toEqual(["focus"]);
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("landlordId");
  });

  it("rejects a request without authenticated context and never reads data", async () => {
    const requestContext = new RequestContext();
    await expect(readBrokerWorkspaceTool.execute!(
      { focus: "viewings" },
      { requestContext } as never,
    )).rejects.toThrow(/Sign in/);
    expect(readBrokerWorkspace).not.toHaveBeenCalled();
  });

  it("uses the server-derived user identity and user-scoped client", async () => {
    const requestContext = new RequestContext();
    const supabase = { marker: "authenticated client" };
    setAuditUserId(requestContext, "broker-a-id");
    requestContext.set(HOST_SUPABASE_KEY, supabase);
    await readBrokerWorkspaceTool.execute!(
      { focus: "viewings" },
      { requestContext } as never,
    );
    expect(readBrokerWorkspace).toHaveBeenCalledWith(supabase, "broker-a-id", "viewings");
  });
});
