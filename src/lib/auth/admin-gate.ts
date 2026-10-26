import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * SAN-1580 · the one server-side contest-management gate.
 *
 * `public.is_admin()` is true for `admin` **or** `super_admin` (it is not a
 * super-admin-only check). Both pages and the existing audited actions must ask
 * this same question before reading or writing. The navigation/shell is never a
 * permission boundary.
 *
 * The browser can never name the actor: the id comes from the verified session,
 * and every service-role RPC re-checks it again.
 */
export type AdminGate =
  | { status: "guest" }
  | { status: "denied"; userId: string }
  | { status: "error"; message: string }
  | { status: "ok"; userId: string };

/** Read the session and the canonical admin flag. No rendering, no redirect. */
export async function getAdminGate(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "guest" };

  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    return {
      status: "error",
      message: "We could not verify admin access. Try again.",
    };
  }
  return data === true
    ? { status: "ok", userId: user.id }
    : { status: "denied", userId: user.id };
}

/**
 * The action guard. Throws BEFORE any service-role RPC, so a forged form or a
 * replayed action id cannot write as another actor.
 */
export async function requireAdminId(): Promise<string> {
  const gate = await getAdminGate();
  if (gate.status === "guest") {
    throw new Error("Sign in as an admin to manage contests.");
  }
  if (gate.status === "denied") {
    throw new Error("Admin access required.");
  }
  if (gate.status === "error") {
    throw new Error(gate.message);
  }
  return gate.userId;
}
