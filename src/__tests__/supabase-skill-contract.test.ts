import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(path, "utf8");

const config = readRepoFile("supabase/config.toml");
const skill = readRepoFile(".claude/skills/supabase/SKILL.md");
const migrationsRule = readRepoFile(
  ".claude/skills/supabase/references/project-rules/supabase-migrations.md",
);
const declarativeRule = readRepoFile(
  ".claude/skills/supabase/references/project-rules/supabase-declarative-schema.md",
);

describe("Supabase skill repository contract", () => {
  it("keeps upstream provenance in one canonical manifest", () => {
    expect(skill).not.toMatch(/^\s*upstream-commit:/m);
    expect(skill).toContain(
      "`upstream.yaml` is the canonical upstream provenance record",
    );
  });

  it("documents MDE's current imperative migration mode", () => {
    expect(config).toMatch(/schema_paths\s*=\s*\[\s*\]/);
    expect(skill).toContain("Current migration mode: **imperative**");
    expect(skill).toContain("`supabase migration new <name>`");
  });

  it("keeps declarative schema guidance conditional while schema_paths is empty", () => {
    expect(declarativeRule).toContain("Conditional / future workflow");
    expect(declarativeRule).toContain("`schema_paths` is non-empty");
    expect(declarativeRule).not.toContain("Exclusive Use of Declarative Schema");
    expect(declarativeRule).not.toContain(
      "Non-compliance with these instructions",
    );
  });

  it("lets the Supabase CLI create imperative migration filenames", () => {
    expect(migrationsRule).toContain("`supabase migration new <name>`");
    expect(migrationsRule).toContain("Never invent");
    expect(migrationsRule).not.toContain(
      "The file MUST be named in the format",
    );
  });
});
