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
      agent: "conciergeAgent",
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
      agent: "hostEventAgent",
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
      expect((props as { runtimeUrl?: string }).runtimeUrl).toBe("/api/copilotkit");
    }
  });

  /**
   * The v2 contract name and the v1 compatibility carrier must always agree.
   *
   * `<CopilotKit>` (v1 bridge, 1.75.0) derives agent identity ONLY from `agent`:
   * `copilotkit.tsx:816` renders `agentId={props.agent ?? "default"}`. Passing
   * `agentId` alone typechecks but resolves every surface to the agent named
   * "default". Both names carrying one value is what keeps the boundary untouched
   * and the agent correct at the same time.
   */
  describe("agent identity — v2 name and v1 carrier agree", () => {
    for (const agent of ["conciergeAgent", "hostEventAgent", "hostOpsAgent"] as const) {
      it(`carries both agentId and agent as "${agent}"`, () => {
        const props = getCopilotKitClientProps(agent);

        expect(props.agentId).toBe(agent);
        expect(props.agent).toBe(agent);
        // Not merely both present — equal, so the two names can never diverge.
        expect(props.agent).toBe(props.agentId);
      });
    }

    it("would resolve to the wrong agent if the v1 carrier were dropped", () => {
      const props = getCopilotKitClientProps("hostOpsAgent");

      // Mirrors the bridge's own expression, `props.agent ?? "default"`, over
      // real inputs rather than a constant. With no `agent`, the bridge renders
      // agentId="default" whatever `agentId` says — the exact defect that
      // dropping the carrier would introduce.
      const resolveBridgeAgentId = (p: { agent?: string }): string => p.agent ?? "default";

      const withoutCarrier = resolveBridgeAgentId({});
      const withCarrier = resolveBridgeAgentId({ agent: props.agent });

      expect(withoutCarrier).toBe("default");
      expect(withCarrier).toBe("hostOpsAgent");
      expect(withCarrier).not.toBe(withoutCarrier);
    });
  });

  it("pins the single-route transport pair on the client half", () => {
    // Same narrowing cast the Cloud-path assertion above uses: the returned
    // value is always the runtimeUrl member, but the declared union still needs it.
    const props = getCopilotKitClientProps("conciergeAgent") as {
      runtimeUrl?: string;
      useSingleEndpoint?: boolean;
    };

    // Client half of the pair owned by copilotkit-transport.ts.
    expect(props.runtimeUrl).toBe(COPILOTKIT_BASE_PATH);
    expect(props.useSingleEndpoint).toBe(COPILOTKIT_USE_SINGLE_ENDPOINT);
    // Server half, asserted here so the two constants cannot drift apart.
    expect(COPILOTKIT_HANDLER_MODE).toBe("single-route");
    expect(COPILOTKIT_USE_SINGLE_ENDPOINT).toBe(true);
  });
});
