"use client";

/** Restaurant contest voting: confirmed user action, durable idempotency, server receipt. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveSavedVote, type SavedVote } from "./vote-panel-recovery";

// Hydration marker: server snapshot false, client snapshot true. Stable no-op subscription.
// Declared AFTER every import: ES modules require imports to precede other statements.
const subscribeNever = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

export type VoteTarget = { contestId: string; entityId: string };
type Receipt = { voteId: string; createdAt: string | null; status: string; entityId: string };
type PanelState =
  | "idle" | "checking" | "confirming" | "casting"
  | "receipt" | "closed" | "error"
  | "unknown"          // saved-vote check failed — offer retry, never invite a vote
  | "already-voted"   // this account voted for another restaurant — hide the CTA
  | "sign-in-required"; // saved vote lookup returned 401: re-authenticate before any vote
type VoteResponse = {
  data?: { vote_id?: string; created_at?: string; status?: string; entity_id?: string; contest_id?: string; nonce?: string };
  error?: { code?: string };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPT_STATUSES = new Set(["cast", "replayed", "already_voted"]);

/**
 * Reuse the stored idempotency key; mint a new one ONLY when there is nothing to recover.
 * A reload must therefore send the original key, so vote-cast can return the committed
 * ballot instead of treating the request as a new vote.
 */
export function nextIdempotencyKey(existing: string | null): string {
  return existing && UUID_RE.test(existing) ? existing : crypto.randomUUID();
}

export function parseReceipt(body: VoteResponse, target: VoteTarget): Receipt | null {
  const data = body.data;
  if (!data || !data.vote_id || !UUID_RE.test(data.vote_id)) return null;
  if (data.contest_id !== target.contestId || data.entity_id !== target.entityId || !data.entity_id || !UUID_RE.test(data.entity_id)) return null;
  // Never show a "cast" receipt without an explicit, recognised server status.
  if (!data.status || !RECEIPT_STATUSES.has(data.status)) return null;
  return { voteId: data.vote_id, createdAt: data.created_at ?? null, status: data.status, entityId: data.entity_id };
}

export function RestaurantVotePanel({ restaurantName, voteTarget }: { restaurantName: string; voteTarget: VoteTarget | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const inFlight = useRef(false);
  const retryAfter = useRef(0);
  const [state, setState] = useState<PanelState>("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyVotedName, setAlreadyVotedName] = useState<string | null>(null);
  // recover() lives inside the effect, so Retry re-runs the effect instead of calling it.
  const [retryNonce, setRetryNonce] = useState(0);
  // Hydration marker. React only runs effects after it has attached event handlers, so this
  // flipping to true is proof the button is live. Without it a test (or a fast user) can click
  // server-rendered HTML that has no onClick yet and see nothing happen.
  const hydrated = useSyncExternalStore(subscribeNever, hydratedOnClient, hydratedOnServer);
  const { url: supabaseUrl, anonKey } = getSupabaseEnv();
  const functionsUrl = supabaseUrl + "/functions/v1";
  const contestId = voteTarget?.contestId;
  const entityId = voteTarget?.entityId;
  const goToLogin = useCallback(() => {
    // Preserve only the verified contest identity, not untrusted query parameters.
    const safeReturn = (pathname ?? "/restaurants") +
      (contestId ? "?contest_id=" + encodeURIComponent(contestId) : "");
    router.push("/login?next=" + encodeURIComponent(safeReturn));
  }, [pathname, router, contestId]);
  // Sign in BEFORE the confirm dialog: the dialog is only meaningful for a known account.
  const startVote = useCallback(async () => {
    setMessage(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) { setState("confirming"); return; }
    } catch (err) {
      // A failed session check must not dead-end the button: fall through to sign-in.
      console.error("[vote] session check failed:", err instanceof Error ? err.message : err);
    }
    // No session, or we could not tell: ask the visitor to sign in. Never open blind.
    goToLogin();
  }, [goToLogin]);
  // Store only the idempotency key, not a vote receipt or auth credential.
  // On reload the server re-reads the committed ballot. This lookup has no nonce
  // and cannot create a new ballot; vote-cast checks the existing key first.
  useEffect(() => {
    if (!contestId || !entityId) return;
    let active = true;
    const target: VoteTarget = { contestId, entityId };
    async function recover() {
      setState("checking");
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        const session = data.session;
        if (!session) { setState("idle"); return; }
        const user = session.user;
        // Cross-device first: ask the server which ballot THIS account already has.
        const storageKey = "mde:restaurant-vote:" + target.contestId + ":" + target.entityId + ":" + user.id;
        const localKey = window.localStorage.getItem(storageKey);
        const hasLocalKey = Boolean(localKey && UUID_RE.test(localKey));

        let outcome: SavedVote = { kind: "unknown" };
        try {
          const res = await fetch("/api/restaurants/my-vote?contest_id=" + target.contestId, { cache: "no-store" });
          // Only a 2xx carries a payload to classify; anything else is unproven, not absent.
          const payload = res.ok ? await res.json().catch(() => undefined) : undefined;
          outcome = resolveSavedVote(res.status, payload, target.entityId);
        } catch (err) {
          console.error("[vote] saved-vote check failed:", err instanceof Error ? err.message : err);
          outcome = { kind: "unknown" };
        }
        if (!active) return;

        if (outcome.kind === "sign-in") {
          // A 401 means the account must re-authenticate, even without a local key.
          // Returning to idle would falsely offer a fresh ballot.
          setState("sign-in-required");
          goToLogin();
          return;
        }
        if (outcome.kind === "receipt") { setReceipt(outcome.receipt); setState("receipt"); return; }
        if (outcome.kind === "already-voted") {
          setAlreadyVotedName(outcome.restaurantName);
          setState("already-voted");
          return;
        }
        // Unknown means we cannot prove whether a ballot exists. Even a saved idempotency
        // key does NOT justify calling the write-capable vote-cast endpoint automatically.
        // Retry only this read until the server confirms a ballot (or explicit absence).
        if (outcome.kind === "unknown") { setState("unknown"); return; }
        if (outcome.kind === "none" && !hasLocalKey) { setState("idle"); return; }
        const key = localKey as string;
        const response = await fetch(functionsUrl + "/vote-cast", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: "Bearer " + session.access_token },
          body: JSON.stringify({ contest_id: target.contestId, entity_id: target.entityId, idempotency_key: key }),
        });
        const body = (await response.json().catch(() => ({}))) as VoteResponse;
        if (!active) return;
        const saved = response.ok ? parseReceipt(body, target) : null;
        if (saved) { setReceipt(saved); setState("receipt"); return; }
        if (response.status === 401) {
          // Expired session: send them to sign in rather than restoring a Vote button.
          setState("sign-in-required");
          goToLogin();
          return;
        }
        if (!response.ok && response.status >= 500) {
          // Unconfirmed: the ballot may already exist. Never fall back to a vote-enabled state.
          setState("unknown");
          return;
        }
        // 2xx without a parseable receipt, or an unexpected 4xx: the outcome is UNCONFIRMED.
        // Restoring the Vote button here would invite a second ballot.
        setState("unknown");
        return;
      } catch {
        // Same rule: a thrown request proves nothing about the ballot.
        if (active) setState("unknown");
      }
    }
    void recover();
    return () => { active = false; };
  }, [anonKey, contestId, entityId, functionsUrl, retryNonce, goToLogin]);

  const castVote = useCallback(async () => {
    if (!voteTarget || inFlight.current) return;
    if (Date.now() < retryAfter.current) {
      setMessage("Please wait before retrying your vote.");
      setState("error");
      return;
    }
    inFlight.current = true;
    setState("casting");
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) { goToLogin(); setState("idle"); return; }
      const target = voteTarget;
      const storageKey = "mde:restaurant-vote:" + target.contestId + ":" + target.entityId + ":" + session.user.id;
      const existingKey = window.localStorage.getItem(storageKey);
      const idempotencyKey = nextIdempotencyKey(existingKey);
      // Persist before sending: recover after lost response, navigation, or reload.
      window.localStorage.setItem(storageKey, idempotencyKey);
      const headers = { "Content-Type": "application/json", apikey: anonKey, Authorization: "Bearer " + session.access_token };
      // Only a STORED key can map to a committed ballot. A brand-new key has nothing to
      // recover, so skip the round trip and never create a vote without confirming.
      if (existingKey && UUID_RE.test(existingKey)) {
        const priorRes = await fetch(functionsUrl + "/vote-cast", {
          method: "POST", headers,
          body: JSON.stringify({ contest_id: target.contestId, entity_id: target.entityId, idempotency_key: idempotencyKey }),
        });
        const priorJson = (await priorRes.json().catch(() => ({}))) as VoteResponse;
        const prior = priorRes.ok ? parseReceipt(priorJson, target) : null;
        if (prior) { setReceipt(prior); setState("receipt"); return; }
        if (!priorRes.ok && priorRes.status >= 500) {
          // The earlier ballot may or may not exist. Do not request a fresh ticket while the
          // previous outcome is unknown; ask the voter to retry instead.
          setState("unknown");
          return;
        }
      }
      const nonceRes = await fetch(functionsUrl + "/vote-nonce", {
        method: "POST", headers, body: JSON.stringify({ contest_id: target.contestId }),
      });
      const nonceJson = (await nonceRes.json().catch(() => ({}))) as VoteResponse;
      if (nonceRes.status === 401) { goToLogin(); setState("idle"); return; }
      if (nonceRes.status === 410) { setState("closed"); return; }
      if (nonceRes.status === 429) {
        const seconds = Math.max(1, Number(nonceRes.headers.get("Retry-After")) || 60);
        retryAfter.current = Date.now() + seconds * 1000;
        setMessage("Too many requests. Try again in " + seconds + " seconds.");
        setState("error"); return;
      }
      if (!nonceRes.ok || !nonceJson.data?.nonce) {
        setMessage("Could not start your vote. Try again.");
        setState("error"); return;
      }
      const castRes = await fetch(functionsUrl + "/vote-cast", {
        method: "POST", headers,
        body: JSON.stringify({
          contest_id: target.contestId, entity_id: target.entityId,
          nonce: nonceJson.data.nonce, idempotency_key: idempotencyKey,
        }),
      });
      const body = (await castRes.json().catch(() => ({}))) as VoteResponse;
      const code = body.error?.code ?? "";
      if (castRes.status === 401) { goToLogin(); setState("idle"); return; }
      const saved = castRes.ok ? parseReceipt(body, target) : null;
      if (saved) { setReceipt(saved); setState("receipt"); return; }
      // One vote per account per contest: a ballot for ANOTHER restaurant is legitimate
      // history, not a broken vote. Say so without claiming this restaurant's receipt.
      if (castRes.ok && body.data?.status === "already_voted") {
        // The account already holds a ballot for this contest. This is not an error: show the
        // non-votable state so the CTA is hidden and no second ballot is invited.
        setAlreadyVotedName(null);
        setState("already-voted");
        return;
      }
      if (castRes.status === 410 || code === "CONTEST_CLOSED") { setState("closed"); return; }
      if (castRes.status === 429) {
        const seconds = Math.max(1, Number(castRes.headers.get("Retry-After")) || 60);
        retryAfter.current = Date.now() + seconds * 1000;
        setMessage("Too many attempts. Try again in " + seconds + " seconds.");
      } else if (code === "NONCE_REPLAYED" || code === "NONCE_INVALID") {
        setMessage("The vote confirmation expired or was used. Try again for a fresh one.");
      } else {
        // An unconfirmed cast result must never lead back to a vote-enabled UI.
        setState("unknown");
        return;
      }
      setState("error");
    } catch (err) {
      // Log the real exception: without it a thrown fetch is indistinguishable from a
      // timeout, and CI has no other way to name the cause.
      console.error("[vote] cast request threw:", err instanceof Error ? err.message : err);
      // A request may have committed even if the network response never arrived.
      // Recheck the server; never re-offer a fresh Vote CTA on an unknown outcome.
      setState("unknown");
    } finally {
      inFlight.current = false;
    }
  }, [anonKey, functionsUrl, goToLogin, voteTarget]);

  if (!voteTarget) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vote-not-open">
        <p className="font-medium">A voting target is not available from this link.</p>
        <p className="mt-1">Open this restaurant from a specific contest to vote. It may be linked to multiple contests, or not yet linked.</p>
      </div>
    );
  }

  if (state === "sign-in-required") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vote-signin-required" role="alert">
        <p className="font-medium">Please sign in again to check your saved vote.</p>
        <p className="mt-1">We cannot offer another vote until your account has been checked.</p>
        <button className="mt-3 min-h-11 rounded-md border border-amber-300 bg-white px-4 py-2 font-medium"
          type="button" onClick={goToLogin}>Sign in again</button>
      </div>
    );
  }

  if (state === "unknown") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vote-check-failed" role="alert">
        <p className="font-medium">Could not check your saved vote.</p>
        <p className="mt-1">Reconnect and try again before voting, so you do not cast a second ballot.</p>
        <button className="mt-3 min-h-11 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium"
                data-testid="vote-retry-check" onClick={() => setRetryNonce((n) => n + 1)} type="button">
          Retry
        </button>
      </div>
    );
  }

  if (state === "already-voted") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vote-already-voted">
        <p className="font-medium">You already voted in this contest{alreadyVotedName ? " for " + alreadyVotedName : ""}.</p>
        <p className="mt-1">One vote per account per contest, so voting is closed for this account.</p>
      </div>
    );
  }

  if (state === "receipt" && receipt) {
    const isThisRestaurant = receipt.entityId === voteTarget.entityId;
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="vote-receipt" role="status">
        <p className="font-semibold text-emerald-900">Voto recibido</p>
        <p className="mt-1 text-sm text-emerald-900">
          {isThisRestaurant ? "Your vote for " + restaurantName + " is saved." : "You have already voted for another restaurant in this contest."}
        </p>
        <p className="mt-2 break-all font-mono text-xs text-emerald-800" data-testid="vote-receipt-id">Receipt {receipt.voteId}</p>
        {receipt.createdAt ? <p className="mt-1 text-xs text-emerald-800">{new Date(receipt.createdAt).toLocaleString()}</p> : null}
        <Link className="mt-3 inline-block min-h-11 text-sm font-medium underline" href="/restaurants">Back to restaurants</Link>
      </div>
    );
  }

  return (
    <div data-testid="vote-panel">
      <button
        className="min-h-11 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60"
        data-testid="vote-cta"
        data-hydrated={hydrated ? "true" : "false"}
        disabled={state === "casting" || state === "checking" || state === "closed"}
        onClick={() => { if (inFlight.current) return; void startVote(); }}
        type="button"
      >
        {state === "casting" ? "Saving your vote…" : state === "checking" ? "Checking saved vote…" : "Vote for " + restaurantName}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">Provisional · one vote per account</p>
      <Dialog open={state === "confirming"} onOpenChange={(open) => { if (!open && !inFlight.current) setState("idle"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vote for {restaurantName}?</DialogTitle>
            <DialogDescription>Confirm your final vote. You can vote once per contest and cannot change it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="min-h-11 rounded-md border px-4 py-2 text-sm" data-testid="vote-cancel" onClick={() => setState("idle")} type="button">Cancel</button>
            <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" data-testid="vote-confirm" onClick={() => void castVote()} type="button">Confirm vote</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state === "closed" ? <p className="mt-3 text-sm text-muted-foreground" data-testid="vote-closed">Voting for this contest is closed.</p> : null}
      {state === "error" && message ? <p className="mt-3 text-sm text-destructive" data-testid="vote-error" role="alert">{message}</p> : null}
    </div>
  );
}
