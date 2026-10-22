import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  buildWorkspaceContexts,
  type WorkspaceContext,
} from "@/lib/app/workspace-contexts";

/**
 * SAN-1575 — server-owned workspace resolution.
 *
 * The browser never supplies a role, partner id or workspace name that grants
 * access. This resolver reads the signed-in user's real memberships and returns
 * only destinations that already exist. It is `cache()`d so the layout and the
 * page share one resolution per request.
 *
 * `error` is a first-class outcome: a failed membership query must never render
 * as "no workspaces", because that would silently remove access the user has.
 */
export type WorkspaceResolution =
  | {
      status: "ok";
      userId: string;
      email: string | null;
      contexts: WorkspaceContext[];
    }
  | { status: "none"; userId: string; email: string | null }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const LOAD_ERROR = "We could not load your workspaces. Try again.";

function readBusinessName(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = (settings as Record<string, unknown>).businessName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const resolveWorkspaceContexts = cache(
  async (): Promise<WorkspaceResolution> => {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[app] auth.getUser failed", authError.message);
      return { status: "error", message: LOAD_ERROR };
    }
    if (!user) {
      return { status: "unauthenticated" };
    }

    const [landlord, organizerEvents, memberships, admin] = await Promise.all([
      supabase
        .from("landlord_profiles")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
      supabase
        .from("events")
        .select("id")
        .eq("organizer_id", user.id)
        .limit(1),
      supabase
        .from("partner_members")
        .select("partner_id")
        .eq("profile_id", user.id),
      supabase.rpc("is_admin"),
    ]);

    if (
      landlord.error ||
      organizerEvents.error ||
      memberships.error ||
      admin.error
    ) {
      console.error("[app] workspace resolution failed", {
        landlord: landlord.error?.message,
        events: organizerEvents.error?.message,
        partners: memberships.error?.message,
        admin: admin.error?.message,
      });
      return { status: "error", message: LOAD_ERROR };
    }

    const partnerIds = [
      ...new Set((memberships.data ?? []).map((row) => row.partner_id)),
    ];

    let partnerLabels: string[] = [];
    if (partnerIds.length > 0) {
      const { data: partners, error: partnerError } = await supabase
        .from("partners")
        .select("id, type, settings")
        .in("id", partnerIds);

      if (partnerError) {
        console.error("[app] partner lookup failed", partnerError.message);
        return { status: "error", message: LOAD_ERROR };
      }

      partnerLabels = (partners ?? []).map(
        (partner) =>
          readBusinessName(partner.settings) ?? humanize(partner.type),
      );
    }

    const contexts = buildWorkspaceContexts({
      hasLandlordProfile: (landlord.data?.length ?? 0) > 0,
      hasOrganizerEvents: (organizerEvents.data?.length ?? 0) > 0,
      partnerLabels,
      isAdmin: admin.data === true,
    });

    if (contexts.length === 0) {
      return { status: "none", userId: user.id, email: user.email ?? null };
    }

    return {
      status: "ok",
      userId: user.id,
      email: user.email ?? null,
      contexts,
    };
  },
);
