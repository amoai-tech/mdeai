import { describe, expect, it } from "vitest";
import { applyLinks, checkBulkSelection, describeLinkError, summarizeBulkLink } from "../apply-links";

const ids = (n: number) => Array.from({ length: n }, (_, i) => "id-" + (i + 1));

describe("applyLinks", () => {
  it("links every id when nothing fails", async () => {
    const result = await applyLinks(ids(5), async () => ({}));
    expect(result.added).toEqual(ids(5));
    expect(result.already).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("separates already-linked entries from newly added ones", async () => {
    const result = await applyLinks(["a", "b", "c"], async (id) => ({ already_linked: id === "b" }));
    expect(result.added).toEqual(["a", "c"]);
    expect(result.already).toEqual(["b"]);
  });

  it("keeps going after a failure in the middle", async () => {
    const seen: string[] = [];
    const result = await applyLinks(["a", "b", "c", "d"], async (id) => {
      seen.push(id);
      if (id === "b") throw new Error("entry not linked");
      return id === "d" ? { already_linked: true } : {};
    });
    expect(seen).toEqual(["a", "b", "c", "d"]);
    expect(result.added).toEqual(["a", "c"]);
    expect(result.already).toEqual(["d"]);
    expect(result.failed).toEqual([{ id: "b", reason: "entry not linked" }]);
  });

  it("keeps going after the first item fails", async () => {
    const result = await applyLinks(["a", "b"], async (id) => {
      if (id === "a") throw new Error("boom");
      return {};
    });
    expect(result.failed).toHaveLength(1);
    expect(result.added).toEqual(["b"]);
  });

  it("survives a non-Error rejection without leaking internals", async () => {
    const result = await applyLinks(["a"], async () => {
      throw { code: "network" };
    });
    expect(result.failed).toEqual([{ id: "a", reason: "Unexpected error" }]);
  });

  it("is safe to retry: the second run reports already linked, never duplicates", async () => {
    const linked = new Set<string>();
    const link = async (id: string) => {
      if (linked.has(id)) return { already_linked: true };
      linked.add(id);
      return {};
    };
    const first = await applyLinks(["a", "b"], link);
    expect(first.added).toEqual(["a", "b"]);
    const retry = await applyLinks(["a", "b"], link);
    expect(retry.added).toEqual([]);
    expect(retry.already).toEqual(["a", "b"]);
    expect(linked.size).toBe(2);
  });

  it("reports an empty request instead of pretending it succeeded", async () => {
    const result = await applyLinks([], async () => ({}));
    expect(result).toEqual({ added: [], already: [], failed: [] });
  });
});

describe("checkBulkSelection", () => {
  it("rejects an empty selection", () => {
    expect(checkBulkSelection([])).toEqual({ ok: false, error: "Choose at least one restaurant." });
  });

  it("rejects more than the batch limit", () => {
    const tooMany = ids(61);
    expect(checkBulkSelection(tooMany)).toEqual({
      ok: false,
      error: "Add at most 60 restaurants at a time.",
    });
  });

  it("accepts exactly the limit", () => {
    const atLimit = ids(60);
    expect(checkBulkSelection(atLimit)).toEqual({ ok: true, ids: atLimit });
  });
});

describe("summarizeBulkLink", () => {
  it("is a success only when nothing failed and nothing was rejected", () => {
    expect(summarizeBulkLink(5, 0, 0, 0)).toBe("success");
  });

  it("is partial when an id was rejected, even if every valid restaurant landed", () => {
    expect(summarizeBulkLink(5, 0, 0, 1)).toBe("partial");
  });

  it("is partial when something failed after others were linked", () => {
    expect(summarizeBulkLink(3, 1, 1, 0)).toBe("partial");
  });

  it("is an error when nothing succeeded", () => {
    expect(summarizeBulkLink(0, 0, 2, 0)).toBe("error");
  });
});

describe("describeLinkError", () => {
  it("uses an Error message, a string, or a safe fallback", () => {
    expect(describeLinkError(new Error("entry not linked"))).toBe("entry not linked");
    expect(describeLinkError("rate limited")).toBe("rate limited");
    expect(describeLinkError(undefined)).toBe("Unexpected error");
  });
});