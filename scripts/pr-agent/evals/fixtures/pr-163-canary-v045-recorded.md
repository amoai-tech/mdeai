## MDE PR Review 🔍

<!-- pr-agent:review:full -->

Here are some key observations to aid the review process:

<table>
<tr><td>⏱️&nbsp;<strong>Estimated effort to review</strong>: 2 🔵🔵⚪⚪⚪</td></tr>
<tr><td>⚠️&nbsp;<strong>Risk level</strong>: High</td></tr>
<tr><td>✅&nbsp;<strong>Merge recommendation</strong>: Changes required</td></tr>
<tr><td>📂&nbsp;<strong>Priority files</strong>
<br><br>
<ul>
<li>scripts/check-agui-pin.mjs</li>
<li>scripts/__tests__/agui-pin.test.mjs</li>
</ul>
</td></tr>
<tr><td>🏅&nbsp;<strong>Score</strong>: 45</td></tr>
<tr><td>🧪&nbsp;<strong>PR contains tests</strong></td></tr>
<tr><td>🔒&nbsp;<strong>No security concerns identified</strong></td></tr>
<tr><td>⚡&nbsp;<strong>Recommended focus areas for review</strong><br><br>

<details><summary><a href='https://github.com/amoai-tech/mdeai/pull/163/files#diff-01b29ad448a13b582a343a93fe8481eb1daeb41844597bc3acba90d5fc18cd8bR21-R21'><strong>Regex Bug: Exact Version Pattern Missing Dot</strong></a>

The EXACT_VERSION regex at line 21 is `^\d+\.\d+\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$` — it has `\d+\.\d+\d+` (two dots, three digit groups but only two separators). This accepts `1.23` (partial version) and rejects `1.2.3` (valid exact version). The test file has the correct regex with three dots (`\d+\.\d+\.\d+`) but tests its own local copy, not the script's actual regex.
</summary>

```txt
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
```

</details>

<details><summary><a href='https://github.com/amoai-tech/mdeai/pull/163/files#diff-8b377d7e84f295745f9cd0fbe560d713210f91e08cb050bb5cae1897787b3379R73-R80'><strong>Test Does Not Validate Actual Script Regex</strong></a>

Line 73-80 claims to test "the shared pattern used by the checker" but tests the test file's local `EXACT_VERSION` constant (line 13), not the regex in `check-agui-pin.mjs`. The test passes while the production script has a broken regex. The test should import or extract the regex from the actual script to prevent drift.
</summary>

```txt
it("matches the shared pattern used by the checker", () => {
  for (const spec of Object.values(VALID)) {
    assert.equal(EXACT_VERSION.test(spec), true, `${spec} should be accepted`);
  }
  for (const spec of ["^0.0.52", "0.0.x", "*", "latest", "0.0"]) {
    assert.equal(EXACT_VERSION.test(spec), false, `${spec} should be rejected`);
  }
});
```

</details>

</td></tr>
</table>

<hr>
<details> <summary><strong>⚙️ Agent run details</strong></summary>

- Model: nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b
- Tokens: 16,059 in / 1,685 out / 17,744 total
- Time cost: 48.9s
- AI calls: 1

</details>

<!-- pr-agent-review-state:v1
{"findings":[{"body":"**Test Does Not Validate Actual Script Regex** Line 73-80 claims to test \"the shared pattern used by the checker\" but tests the test file's local `EXACT_VERSION` constant (line 13), not the regex in `check-agui-pin.mjs`. The test passes while the production script has a broken regex. The test should import or extract the regex from the actual script to prevent drift.","finding_id":"2209bf0d637a","first_seen":"2026-09-29T09:46:38.736119Z","last_seen":"2026-09-29T09:46:38.736119Z","last_seen_head_sha":"283412878f08ed370fb91e8cab58b463962c2059","line_end":80,"line_start":73,"path":"scripts/__tests__/agui-pin.test.mjs","state":"ACTIVE"},{"body":"**Regex Bug: Exact Version Pattern Missing Dot** The EXACT_VERSION regex at line 21 is `^\\d+\\.\\d+\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$` — it has `\\d+\\.\\d+\\d+` (two dots, three digit groups but only two separators). This accepts `1.23` (partial version) and rejects `1.2.3` (valid exact version). The test file has the correct regex with three dots (`\\d+\\.\\d+\\.\\d+`) but tests its own local copy, not the script's actual regex.","finding_id":"e18730eef34d","first_seen":"2026-09-29T09:46:38.736119Z","last_seen":"2026-09-29T09:46:38.736119Z","last_seen_head_sha":"283412878f08ed370fb91e8cab58b463962c2059","line_end":21,"line_start":21,"path":"scripts/check-agui-pin.mjs","state":"ACTIVE"}],"last_run":{"complete":true,"excluded_files":[],"head_sha":"283412878f08ed370fb91e8cab58b463962c2059","kind":"full","run_id":"https://github.com/amoai-tech/mdeai/commit/283412878f08ed370fb91e8cab58b463962c2059"},"schema_version":1}
-->
