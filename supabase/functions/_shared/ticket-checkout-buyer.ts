/**
 * Resolve authenticated buyer identity from a bearer credential.
 * Public/anon keys are guest checkout; any claimed user JWT must be
 * checked with Supabase Auth rather than decoded or trusted from the body.
 */
export async function resolveCheckoutBuyer(
  authorization: string | null,
  publicKey: string | null,
  anonKey: string | null,
  verifyUser: (authorization: string) => Promise<string | null>,
): Promise<{ buyerUserId: string | null; invalidSession: boolean }> {
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!bearer || bearer === publicKey || bearer === anonKey) {
    return { buyerUserId: null, invalidSession: false };
  }
  const buyerUserId = await verifyUser(authorization!);
  return { buyerUserId, invalidSession: !buyerUserId };
}
