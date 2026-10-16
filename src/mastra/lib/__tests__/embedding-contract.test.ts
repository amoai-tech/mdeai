import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAN-1523 — documents are embedded by the Edge worker (supabase/functions/_shared/embedding-worker.ts) and
 * queries by src/mastra/lib/query-embedding.ts. Similarity only means something when both use ONE model and
 * ONE dimension, and when the database tables are sized for it. The two runtimes cannot import each other
 * (Deno vs Next.js), so this test pins them together by reading both sources.
 */
const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const constant = (source: string, name: string) => {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*("([^"]+)"|(\\d+))`));
  if (!match) throw new Error(`${name} not found`);
  return match[2] ?? Number(match[3]);
};

describe("embedding contract: documents (Edge worker) and queries (Next.js) agree", () => {
  const worker = read("supabase/functions/_shared/embedding-worker.ts");
  const query = read("src/mastra/lib/query-embedding.ts");

  it("use the same model", () => {
    expect(constant(worker, "EMBED_MODEL")).toBe(constant(query, "EMBED_MODEL"));
    expect(constant(worker, "EMBED_MODEL")).toBe("gemini-embedding-001");
  });

  it("use the same dimension", () => {
    expect(constant(worker, "EMBED_DIM")).toBe(constant(query, "EMBED_DIM"));
    expect(constant(worker, "EMBED_DIM")).toBe(768);
  });

  it("match the model and dimension baked into the database document hash and queue defaults", () => {
    const sql = read("supabase/migrations/20261016210000_embedding_worker_pipeline.sql");
    expect(sql).toContain("gemini-embedding-001:768:v1");
    const queue = read("supabase/migrations/20260601120200_data040_embedding_jobs.sql");
    expect(queue).toContain("DEFAULT 'gemini-embedding-001'");
    expect(queue).toContain("dimensions int NOT NULL DEFAULT 768");
  });

  it("sets no task type on either side (a one-sided task type would skew similarity)", () => {
    const code = (source: string) => source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code(worker)).not.toMatch(/taskType/);
    expect(code(query)).not.toMatch(/taskType/);
  });
});
