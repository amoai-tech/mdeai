"""Exercise the *actual* PR-Agent loader from MDE's pinned v0.46 Docker image.

Run from repo root, with no credentials in the container:
  docker run --rm --read-only --tmpfs /tmp:rw,size=80m,mode=1777 \
    --cap-drop ALL --security-opt no-new-privileges \
    --user 65534:65534 -e PYTHONDONTWRITEBYTECODE=1 \
    -v "$PWD:/github/workspace:ro" --entrypoint python \
    pragent/pr-agent@sha256:65e5b196e38cecd7df8a71fe29942052e081a0c6645132c2ac874df60b1760c7 \
    /github/workspace/scripts/__tests__/pr-agent-pinned-loader.py

The tokenizer may fetch its public encoding into /tmp on first run.
Upstream: https://github.com/The-PR-Agent/pr-agent/blob/v0.46.0/pr_agent/algo/skills_loader.py
"""

from pathlib import Path

from pr_agent.algo.skills_loader import discover_skills, format_skills_context

ROOT = Path("/github/workspace")
SENTINELS = {
    "copilotkit": "Preserve same-origin",
    "mastra": "RequestContext carries request metadata",
    "supabase": "User A must not read",
    "maps": "Do not invent or transform ungrounded coordinates",
    "stripe": "duplicate delivery must not duplicate tickets",
    "nextjs": "Async Request APIs are async-only",
}

paths = [str(ROOT / ".claude/skills/code-review/SKILL.md")]
paths += [str(ROOT / f"scripts/pr-agent/skills/{name}/SKILL.md") for name in SENTINELS]
skills = discover_skills(paths)
assert len(skills) == len(paths), f"discovered {len(skills)} of {len(paths)} skills"
names = {skill.name for skill in skills}
assert "code-review" in names, f"universal code review missing: {names}"

for domain, sentence in SENTINELS.items():
    name = f"mde-pr-review-{domain}"
    assert name in names, f"{name} was not discovered"
    context = format_skills_context(
        [skill for skill in skills if skill.name == name], max_tokens=3200
    )
    assert "#### review.md" in context, f"{domain} review.md was not inlined"
    assert sentence in context, f"{domain} guidance missing from prompt"

# package.json selects all specialists: none may silently drop at the configured budget.
full_context = format_skills_context(skills, max_tokens=6000)
for domain, sentence in SENTINELS.items():
    assert sentence in full_context, f"{domain} guidance dropped from 6000-token context"

print(f"PINNED_SKILLS_LOADER_PASS skills={len(skills)} domains={len(SENTINELS)}")
