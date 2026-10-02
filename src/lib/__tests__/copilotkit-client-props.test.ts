import { afterEach, describe, expect, it, vi } from "vitest";

import { getCopilotKitClientProps } from "../copilotkit-client-props";
import {
  COPILOTKIT_BASE_PATH,
  COPILOTKIT_HANDLER_MODE,
  COPILOTKIT_USE_SINGLE_ENDPOINT,
} from "../copilotkit-transport";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCopilotKitClientProps", () => {
  it("returns the same-origin runtimeUrl in production even when the Cloud public API key is set", () => {
    // The regression guard for UX-001: production must NOT route to CopilotKit
    // Cloud (v2), which cannot reach our in-process v1 agents.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY", "ck_pub_should_be_ignored");

    const props = getCopilotKitClientProps("conciergeAgent");

    expect(props).toMatchObject({
      agentId: "conciergeAgent",
      runtimeUrl: "/api/copilotkit",
      useSingleEndpoint: true,
      showDevConsole: false,
      headers: {},
      properties: {},
      agents__unsafe_dev_only: {},
      selfManagedAgents: {},
    });
    const again = getCopilotKitClientProps("conciergeAgent");
    expect(again.headers).toBe(props.headers);
    expect(again.selfManagedAgents).toBe(props.selfManagedAgents);
    expect("publicApiKey" in props).toBe(false);
  });

  it("returns the same-origin runtimeUrl in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY", "");

    const props = getCopilotKitClientProps("hostEventAgent");

    expect(props).toMatchObject({
      agentId: "hostEventAgent",
      runtimeUrl: "/api/copilotkit",
      useSingleEndpoint: true,
      showDevConsole: false,
    });
    expect(getCopilotKitClientProps("hostEventAgent").headers).toBe(
      getCopilotKitClientProps("conciergeAgent").headers,
    );
  });

  it("never passes publicApiKey for either agent, regardless of the Cloud env var", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY", "ck_pub_live_value");

    for (const agent of ["conciergeAgent", "hostEventAgent"] as const) {
      const props = getCopilotKitClientProps(agent);
      expect("publicApiKey" in props).toBe(false);
      expect(props.runtimeUrl).toBe("/api/copilotkit");
    }
  });

  /**
   * One agent identity, `agentId`, now that no compatibility `<CopilotKit>`
   * wrapper is left to need the v1 `agent` duplicate. The cross-file guard that
   * ties this to the wrappers lives in the v2 contract test.
   */
  describe("agent identity — agentId only", () => {
    for (const agent of ["conciergeAgent", "hostEventAgent", "hostOpsAgent"] as const) {
      it(`carries agentId "${agent}" and no v1 agent carrier`, () => {
        const props = getCopilotKitClientProps(agent);

        expect(props.agentId).toBe(agent);
        expect("agent" in props).toBe(false);
      });
    }
  });

  it("pins the single-route transport pair on the client half", () => {
    const props = getCopilotKitClientProps("conciergeAgent");

    // Client half of the pair owned by copilotkit-transport.ts.
    expect(props.runtimeUrl).toBe(COPILOTKIT_BASE_PATH);
    expect(props.useSingleEndpoint).toBe(COPILOTKIT_USE_SINGLE_ENDPOINT);
    // Server half, asserted here so the two constants cannot drift apart.
    expect(COPILOTKIT_HANDLER_MODE).toBe("single-route");
    expect(COPILOTKIT_USE_SINGLE_ENDPOINT).toBe(true);
  });
});
