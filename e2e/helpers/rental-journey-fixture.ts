import { randomUUID } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  type ThrowawayIdentity,
} from "./auth";

/**
 * SAN-1205 · fixture, cleanup and verification for the rental-conversion journey.
 *
 * Seeds two throwaway brokers and one published listing, removes every row a run created, and
 * re-checks that nothing is left. An unknown answer from the database is never treated as zero.
 */

export type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;

export type Fixture = {
  run: string;
  owner: ThrowawayIdentity;
  other: ThrowawayIdentity;
  ownerProfileId: string;
  otherProfileId: string;
  apartmentId: string;
  title: string;
};

/** A fixture whose identities may not exist yet, so a half-built one can still be cleaned. */
export type PartialFixture = Omit<Fixture, "owner" | "other"> & {
  owner: ThrowawayIdentity | null;
  other: ThrowawayIdentity | null;
};

export type ScheduleBody = {
  success?: boolean;
  leadId?: string;
  showingId?: string;
  error?: { code?: string; message?: string };
};


/** An RLS-scoped client acting as a real signed-in broker. Never service role. */
export function asUser(session: Session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase public env missing");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

/**
 * The Supabase API now and then answers "Bad Gateway". Setup and cleanup must survive that: a
 * silently skipped delete would strand real rows with a green run as the only evidence.
 */
export class NonRetryableError extends Error {}

export async function retryCall<T>(label: string, fn: () => PromiseLike<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const result = await fn();
      const error = (result as { error?: { message: string; status?: number } | null } | undefined)
        ?.error;
      if (error) {
        const status = error.status;
        // A 4xx other than 429 is a caller bug; retrying only delays the real failure.
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
          throw new NonRetryableError(`${label}: ${error.message}`);
        }
        throw new Error(error.message);
      }
      return result;
    } catch (err) {
      if (err instanceof NonRetryableError) throw err;
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw new Error(
    `${label} failed after ${tries} tries: ${last instanceof Error ? last.message : String(last)}`,
  );
}

/** Every renter email this run uses starts with this, so cleanup can find all of them. */
export const renterEmail = (run: string, tag: string) => `san1205-${run}-${tag}@qa-isolation.mdeai.co`;

/**
 * Two brokers and one published listing owned by the first.
 *
 * Any failure part-way tears down what already exists before rethrowing; the caller only
 * receives a fixture on success, so it could not do that itself.
 */
export async function provisionFixture(admin: Admin, run: string): Promise<Fixture> {
  const fixture: PartialFixture = {
    run,
    owner: null,
    other: null,
    ownerProfileId: randomUUID(),
    otherProfileId: randomUUID(),
    apartmentId: randomUUID(),
    title: `SAN1205 journey ${run}`,
  };

  try {
    fixture.owner = await createThrowawayIdentity(`san1205-owner-${run}`);
    fixture.other = await createThrowawayIdentity(`san1205-other-${run}`);

    await retryCall("broker profiles insert", () =>
      admin.from("landlord_profiles").insert([
        {
          id: fixture.ownerProfileId,
          user_id: fixture.owner!.userId,
          display_name: `SAN1205 Owner ${run}`,
          verification_status: "approved",
        },
        {
          id: fixture.otherProfileId,
          user_id: fixture.other!.userId,
          display_name: `SAN1205 Other ${run}`,
          verification_status: "approved",
        },
      ]),
    );

    await retryCall("apartment insert", () =>
      admin.from("apartments").insert({
        id: fixture.apartmentId,
        title: fixture.title,
        slug: `san1205-journey-${run}`,
        neighborhood: "Laureles",
        address: "SAN1205 test address, Laureles",
        bedrooms: 2,
        bathrooms: 1,
        price_monthly: 2_400_000,
        currency: "COP",
        status: "active",
        moderation_status: "approved",
        listing_workflow_status: "published",
        landlord_id: fixture.ownerProfileId,
        available_to: "2099-12-31",
      }),
    );

    return fixture as Fixture;
  } catch (err) {
    const orphans = await cleanupFixture(admin, fixture);
    if (orphans.length > 0) {
      console.error(`[san-1205] provisioning failed and cleanup was incomplete: ${orphans.join("; ")}`);
    }
    throw err;
  }
}

/** Attempt every cleanup step and report everything that failed. */
export async function cleanupFixture(admin: Admin, fixture: PartialFixture): Promise<string[]> {
  const failures: string[] = [];
  const step = async (label: string, fn: () => PromiseLike<unknown>) => {
    try {
      await retryCall(label, fn);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Find leads by this run's email prefix AND by apartment, so a request that landed on the
  // wrong listing, or a failure-path request, is still cleaned up.
  const leadIds = new Set<string>();
  for (const [label, query] of [
    [
      "find leads by email",
      () => admin.from("leads").select("id").ilike("email", `san1205-${fixture.run}-%`),
    ],
    [
      "find leads by apartment",
      () => admin.from("leads").select("id").eq("apartment_id", fixture.apartmentId),
    ],
  ] as const) {
    try {
      const { data } = await retryCall(label, query);
      // No data without an error is an unknown answer, not "no leads". Cleanup must not skip
      // rows because a lookup returned nothing it could trust.
      if (!data) throw new Error("lookup returned no result");
      for (const row of data as Array<{ id: string }>) leadIds.add(row.id);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await step("delete showings by apartment", () =>
    admin.from("showings").delete().eq("apartment_id", fixture.apartmentId),
  );
  if (leadIds.size > 0) {
    await step("delete showings by lead", () =>
      admin.from("showings").delete().in("lead_id", [...leadIds]),
    );
    await step("delete leads", () => admin.from("leads").delete().in("id", [...leadIds]));
  }
  await step("delete apartment", () =>
    admin.from("apartments").delete().eq("id", fixture.apartmentId),
  );
  await step("delete broker profiles", () =>
    admin
      .from("landlord_profiles")
      .delete()
      .in("id", [fixture.ownerProfileId, fixture.otherProfileId]),
  );

  for (const [who, identity] of [
    ["owner", fixture.owner],
    ["other", fixture.other],
  ] as const) {
    if (!identity) continue;
    try {
      await retryCall(`delete ${who} identity`, () => deleteThrowawayIdentity(identity));
    } catch (err) {
      failures.push(`identity/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return failures;
}

/** Prove the rows are gone by asking again, rather than trusting the deletes. */
export async function findResidue(admin: Admin, fixture: Fixture): Promise<string[]> {
  const leftovers: string[] = [];
  const count = async (
    label: string,
    query: () => PromiseLike<{ count: number | null; error: unknown }>,
  ) => {
    try {
      const { count: found } = await retryCall(label, query);
      if (found === null) {
        // An unknown answer is not zero. "Could not verify" must fail the run.
        leftovers.push(`${label}: residue count unavailable, cannot prove zero rows remain`);
      } else if (found > 0) {
        leftovers.push(`${label}: ${found} row(s) remain`);
      }
    } catch (err) {
      // A failed count must never be reported as "no residue".
      leftovers.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await count("leads by email", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .ilike("email", `san1205-${fixture.run}-%`),
  );
  await count("leads by apartment", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  await count("showings by apartment", () =>
    admin
      .from("showings")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  await count("apartment", () =>
    admin.from("apartments").select("id", { count: "exact", head: true }).eq("id", fixture.apartmentId),
  );
  await count("broker profiles", () =>
    admin
      .from("landlord_profiles")
      .select("id", { count: "exact", head: true })
      .in("id", [fixture.ownerProfileId, fixture.otherProfileId]),
  );

  for (const [who, userId] of [
    ["owner", fixture.owner.userId],
    ["other", fixture.other.userId],
  ] as const) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        // 404 is the expected answer once the user is gone; anything else is unverified.
        if ((error as { status?: number }).status !== 404) {
          leftovers.push(`auth user/${who}: could not verify (${error.message})`);
        }
      } else if (data?.user) {
        leftovers.push(`auth user/${who}: still present`);
      }
    } catch (err) {
      leftovers.push(`auth user/${who}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return leftovers;
}

/** Row counts for everything a request could write, by apartment and by this run's emails. */
export async function countRequestRows(admin: Admin, fixture: Fixture) {
  const leads = await retryCall("count leads", () =>
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .or(`apartment_id.eq.${fixture.apartmentId},email.ilike.san1205-${fixture.run}-*`),
  );
  const showings = await retryCall("count showings", () =>
    admin
      .from("showings")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", fixture.apartmentId),
  );
  if (leads.count === null || showings.count === null) {
    throw new Error("row count unavailable: an unknown count must never be treated as zero");
  }
  return { leads: leads.count, showings: showings.count };
}


/**
 * This journey writes and deletes real rows. The database decides whether that is production,
 * not the web address: a local or preview site still writes to whatever Supabase project is
 * configured, so a non-local project needs an explicit acknowledgement.
 */
export function assertWriteTargetAllowed(): void {
  const dbHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
  const dbIsLocal = ["localhost", "127.0.0.1", "[::1]"].includes(dbHost);
  if (!dbIsLocal && process.env.SAN1205_ALLOW_PRODUCTION_WRITES !== "1") {
    throw new Error(
      "SAN-1205 writes and deletes real rows in the configured Supabase project, which is not " +
        "local. Set SAN1205_ALLOW_PRODUCTION_WRITES=1 to confirm that is intended.",
    );
  }
}
