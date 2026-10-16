"use client";

/** Restaurant detail vote panel (SAN-1469). */
import { useCallback, useMemo, useState } from "react";
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

export type VoteTarget = { contestId: string; entityId: string };
type Receipt = { voteId: string; createdAt: string | null; status: string };
type PanelState = "idle" | "confirming" | "casting" | "receipt" | "closed" | "error";

export function RestaurantVotePanel({ restaurantName, voteTarget }: { restaurantName: string; voteTarget: VoteTarget | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<PanelState>("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const { url: supabaseUrl, anonKey } = useMemo(() => getSupabaseEnv(), []);
  const functionsUrl = supabaseUrl + "/functions/v1";

  const castVote = useCallback(async () => {
    if (!voteTarget) return;
    setState("casting");
    setMessage(null);
    const goToLogin = () => { router.push("/login?next=" + encodeURIComponent(pathname ?? "/restaurants")); };
    const headers = { "Content-Type": "application/json", apikey: anonKey, Authorization: "" };
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { goToLogin(); return; }
      const authHeaders = { ...headers, Authorization: "Bearer " + token };
      const nonceRes = await fetch(functionsUrl + "/vote-nonce", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ contest_id: voteTarget.contestId }),
      });
      const nonceJson = (await nonceRes.json().catch(() => ({}))) as { data?: { nonce?: string } };
      if (nonceRes.status === 401) { goToLogin(); return; }
      if (!nonceRes.ok || !nonceJson.data?.nonce) {
        setState("error");
        setMessage("We could not start your vote. Please try again.");
        return;
      }
      const castRes = await fetch(functionsUrl + "/vote-cast", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          contest_id: voteTarget.contestId,
          entity_id: voteTarget.entityId,
          nonce: nonceJson.data.nonce,
          idempotency_key: idempotencyKey,
        }),
      });
      const castJson = (await castRes.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { code?: string } };
      const code = castJson.error?.code ?? "";
      if (castRes.status === 401) { goToLogin(); return; }
      if (castRes.status === 410 || code === "CONTEST_CLOSED") { setState("closed"); return; }
      if (castRes.status === 429 || code === "RATE_LIMITED") {
        setState("error"); setMessage("Too many attempts. Please wait a moment and try again."); return;
      }
      if (castRes.status === 409 && code === "NONCE_REPLAYED") {
        setState("error"); setMessage("This vote link was already used. Try again for a fresh one — if your vote was saved you will see the same receipt."); return;
      }
      const data = castJson.data;
      if (castRes.ok && data?.vote_id) {
        setReceipt({ voteId: String(data.vote_id), createdAt: (data.created_at as string | undefined) ?? null, status: String(data.status ?? "cast") });
        setState("receipt");
        return;
      }
      setState("error");
      setMessage("We could not confirm your vote. Try again — if it was saved you will see the same receipt.");
    } catch {
      // The request may have reached the server: never claim nothing was recorded.
      setState("error");
      setMessage("Your connection dropped before we could confirm. Try again — if your vote was saved you will see the same receipt.");
    }
  }, [anonKey, functionsUrl, idempotencyKey, pathname, router, voteTarget]);

  if (!voteTarget) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="vote-not-open">
        <p className="font-medium">Voting is not open for this restaurant yet.</p>
        <p className="mt-1">Once the contest entry is linked to this restaurant, the vote button appears here.</p>
      </div>
    );
  }

  if (state === "receipt" && receipt) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="vote-receipt">
        <p className="font-semibold text-emerald-900">Voto recibido</p>
        <p className="mt-1 text-sm text-emerald-900">Your vote for {restaurantName} is saved.</p>
        <p className="mt-2 font-mono text-xs text-emerald-800" data-testid="vote-receipt-id">Receipt {receipt.voteId}</p>
        {receipt.createdAt ? <p className="mt-1 text-xs text-emerald-800">{new Date(receipt.createdAt).toLocaleString()}</p> : null}
        <Link className="mt-3 inline-block text-sm font-medium underline" href="/restaurants">Back to restaurants</Link>
      </div>
    );
  }

  return (
    <div data-testid="vote-panel">
      <button
        className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60"
        data-testid="vote-cta"
        disabled={state === "casting"}
        onClick={() => { setMessage(null); setState("confirming"); }}
        type="button"
      >
        {state === "casting" ? "Saving your vote…" : "Vote for " + restaurantName}
      </button>
      <p className="mt-2 text-xs text-neutral-600">Provisional · one vote per account</p>
      <Dialog open={state === "confirming"} onOpenChange={(open) => { if (!open) setState("idle"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vote for {restaurantName}?</DialogTitle>
            <DialogDescription>You can vote once. This cannot be changed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="rounded-md border px-3 py-2 text-sm" data-testid="vote-cancel" onClick={() => setState("idle")} type="button">Cancel</button>
            <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white" data-testid="vote-confirm" onClick={castVote} type="button">Confirm vote</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state === "closed" ? <p className="mt-3 text-sm text-neutral-700" data-testid="vote-closed">Voting for this contest is closed.</p> : null}
      {state === "error" && message ? <p className="mt-3 text-sm text-red-700" data-testid="vote-error" role="alert">{message}</p> : null}
    </div>
  );
}