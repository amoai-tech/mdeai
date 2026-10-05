import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("supabase/config.toml", "utf8");
const skill = readFileSync(".claude/skills/supabase/SKILL.md", "utf8");
const upstreamManifest = readFileSync(
  ".claude/skills/supabase/upstream.yaml",
  "utf8",
);
const migrationsRule = readFileSync(
  ".claude/skills/supabase/references/project-rules/supabase-migrations.md",
  "utf8",
);
const declarativeRule = readFileSync(
  ".claude/skills/supabase/references/project-rules/supabase-declarative-schema.md",
  "utf8",
);

const emptySchemaPathsInDbMigrations =
  /^\[db\.migrations\](?:(?!^\[)[\s\S])*?^[ \t]*schema_paths[ \t]*=[ \t]*\[[ \t]*\][ \t]*(?:#.*)?$/m;
const activePgDelta =
  /^\[experimental\.pgdelta\](?:(?!^\[)[\s\S])*?^[ \t]*enabled[ \t]*=[ \t]*true[ \t]*(?:#.*)?$/m;

describe("Supabase skill repository contract", () => {
  it("keeps upstream provenance in one canonical manifest", () => {
    expect(skill).not.toMatch(/^\s*upstream-commit:/m);
    expect(skill).toContain(
      "`upstream.yaml` is the canonical upstream provenance record",
    );

    expect(upstreamManifest).toContain(
      "repository: https://github.com/supabase/agent-skills",
    );
    expect(upstreamManifest).toMatch(
      /^reviewed_commit: 551274ed2fe97c8fea1325f7ceb05803a542f8df$/m,
    );
    expect(upstreamManifest).toContain(
      "local: references/official/supabase",
    );
    expect(upstreamManifest).toContain(
      "local: references/official/supabase-postgres-best-practices",
    );
    expect(upstreamManifest).toContain("local_integrity:");
    expect(upstreamManifest).toContain(
      "references/official/supabase: da104545f7020531c6bbf8981c6f70edf4caf47dd9296fb04b7c4464f9ddee5d",
    );
    expect(upstreamManifest).toContain(
      "references/official/supabase-postgres-best-practices: a714d433362542f2d52e8b7958d1691c49fa4f43c9645c9a647895fb3ca85f92",
    );
  });

  it("documents MDE's current imperative migration mode", () => {
    expect(config).toMatch(emptySchemaPathsInDbMigrations);
    expect(config).not.toMatch(activePgDelta);

    const configWithDeclarativeModeAndDecoy = config.replace(
      "schema_paths = []",
      'schema_paths = ["./schemas/*.sql"]',
    ) + "\n# schema_paths = []\n";
    expect(configWithDeclarativeModeAndDecoy).not.toMatch(
      emptySchemaPathsInDbMigrations,
    );

    expect(skill).toContain("Current migration mode: **imperative**");
    expect(skill).toContain("supabase migration new");
    expect(migrationsRule).toContain(
      "active `[db.migrations]` section contains exactly `schema_paths = []`",
    );
  });

  it("keeps declarative schema guidance conditional while MDE is imperative", () => {
    expect(declarativeRule).toContain("Conditional / future workflow");
    expect(declarativeRule).toContain("pg-delta");
    expect(declarativeRule).toContain("schema_paths` is ignored");
    expect(declarativeRule).toContain("supabase db schema declarative sync");
    expect(declarativeRule).not.toContain("Exclusive Use of Declarative Schema");
    expect(declarativeRule).not.toContain(
      "Non-compliance with these instructions",
    );
  });

  it("lets the Supabase CLI create imperative migration filenames", () => {
    expect(migrationsRule).toContain("supabase migration new");
    expect(migrationsRule).toContain("Never invent");
    expect(migrationsRule).not.toContain(
      "The file MUST be named in the format",
    );
  });
});
