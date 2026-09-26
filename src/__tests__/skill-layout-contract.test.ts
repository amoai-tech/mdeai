import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function withSkillLayout(run: (root: string, script: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "mde-skill-layout-"));
  try {
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, ".claude/skills/foo"), { recursive: true });
    mkdirSync(join(root, ".agents/skills/foo"), { recursive: true });
    copyFileSync("scripts/check-skill-layout.py", join(root, "scripts/check-skill-layout.py"));
    writeFileSync(
      join(root, ".claude/skills/foo/SKILL.md"),
      "---\nname: foo\ndescription: test fixture\n---\n",
    );
    symlinkSync(
      "../../../.claude/skills/foo/SKILL.md",
      join(root, ".agents/skills/foo/SKILL.md"),
    );    run(root, join(root, "scripts/check-skill-layout.py"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function check(script: string, cwd: string) {
  return spawnSync("python3", [script], { cwd, encoding: "utf8" });
}

describe("skill layout enforcement", () => {
  it("anchors repository discovery to the checker location", () => {
    withSkillLayout((root, script) => {
      const elsewhere = join(root, "elsewhere");
      mkdirSync(elsewhere);
      const result = check(script, elsewhere);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("SKILL_LAYOUT_PASS active=1");
    });
  });

  it("rejects extra physical content in a Codex exposure", () => {
    withSkillLayout((root, script) => {
      writeFileSync(join(root, ".agents/skills/foo/duplicate.md"), "duplicate");
      const result = check(script, root);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("unexpected Codex exposure entry");
    });
  });
  it("rejects canonical frontmatter names that do not match the directory", () => {
    withSkillLayout((root, script) => {
      writeFileSync(
        join(root, ".claude/skills/foo/SKILL.md"),
        "---\nname: wrong-name\ndescription: test fixture\n---\n",
      );
      const result = check(script, root);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("frontmatter name mismatch");
    });
  });

  it("rejects broken symlinks for retired skill owners", () => {
    withSkillLayout((root, script) => {
      symlinkSync(
        "/definitely/missing",
        join(root, ".agents/skills/copilotkit-review"),
      );
      const result = check(script, root);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("retired skill/discovery entry exists");
    });
  });

  it("is part of the required floor gate", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };    expect(pkg.scripts?.["check:skills"]).toBe("python3 scripts/check-skill-layout.py");
    expect(pkg.scripts?.floor).toContain("npm run check:skills");
  });
});
