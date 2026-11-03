import {
  PromptInjectionDetector,
  TokenLimiter,
  type InputProcessor,
} from "@mastra/core/processors";
import { ACTIVE_TEXT_MODEL } from "./models";

/**
 * Default Mastra input processors for chat agents.
 *
 * PERF-002: PromptInjectionDetector runs a full extra model round-trip BEFORE
 * the agent's own model call — measured at ~3–5s of fixed latency on every turn,
 * the reason a zero-tool concierge turn still took ~9.7s (p50). The concierge is
 * read-only search plus one human-approved (HITL) booking request, so the
 * injection blast radius is low. We make the detector OPT-IN
 * (MASTRA_PROMPT_INJECTION_GUARD=true) instead of auto-on in production.
 * TokenLimiter (non-LLM, no round-trip) always stays on.
 *
 * To re-enable the guard for a deploy: set MASTRA_PROMPT_INJECTION_GUARD=true.
 */
export function getDefaultInputProcessors(): InputProcessor[] {
  // SAN-737: an 8,192-token ceiling counted the concierge's full system prompt,
  // its tool schemas, the server-verified current selection and working memory as
  // "system messages alone" on a second turn. That threw a TripWire before the
  // model could answer, so A→B→Clear failed even though the selection was right.
  // 32,768 leaves room for those system inputs and stays well inside the active
  // Gemini/NVIDIA model context windows.
  const processors: InputProcessor[] = [new TokenLimiter(32768)];

  if (process.env.MASTRA_PROMPT_INJECTION_GUARD === "true") {
    processors.unshift(new PromptInjectionDetector({ model: ACTIVE_TEXT_MODEL }));
  }

  return processors;
}
