type RequestContextLike = { set(key: string, value: string): void };

type RunInput = { userId: string; tenantId: string; prompt: string };

export function applyRunContext(ctx: RequestContextLike, input: RunInput) {
  ctx.set("userId", input.userId);
  ctx.set("tenantId", input.tenantId);
  return input.prompt;
}
