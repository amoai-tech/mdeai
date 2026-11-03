// SAN-1552 · Publication contract for the AI agent fix prompt.
//
// One marker plus the trusted bot author identify the comment, so a retry or a later head updates
// it instead of adding another. A failure must surface, never report an invented success. The
// Octokit client is faked: no network call happens here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIX_PROMPT_MARKER,
  upsertFixPromptComment,
} from "../pr-agent/fix-prompt-comment.mjs";
import { renderFixPrompt } from "../pr-agent/render-fix-prompt.mjs";
import {
  BASE,
  HEAD,
  OTHER_HEAD,
  PR_URL,
  changedFile,
  stateFinding,
  stateReview,
} from "./helpers/pr-agent-fix-prompt-fixtures.mjs";

const bodyFor = (headSha) =>
  renderFixPrompt({
    result: stateReview({ findings: [stateFinding({ path: "src/app.ts" })] }),
    baseSha: BASE,
    headSha,
    prUrl: PR_URL,
    changedFiles: [changedFile("src/app.ts", 10)],
  }).body;

/** A minimal Octokit-shaped fake that records every write. */
function fakeGithub(existing = []) {
  const calls = { list: 0, created: [], updated: [] };
  const comments = existing.map((comment) => ({ ...comment }));
  const github = {
    paginate: async (fn, params) => {
      calls.list += 1;
      return fn(params);
    },
    rest: {
      issues: {
        listComments: async () => comments,
        createComment: async ({ body }) => {
          const created = {
            id: 900 + calls.created.length,
            body,
            user: { login: "github-actions[bot]" },
            updated_at: new Date(2026, 0, 1, 0, calls.created.length).toISOString(),
          };
          calls.created.push(created);
          comments.push(created);
          return { data: created };
        },
        updateComment: async ({ comment_id, body }) => {
          calls.updated.push({ comment_id, body });
          const target = comments.find((comment) => comment.id === comment_id);
          if (target) {
            target.body = body;
            target.updated_at = new Date(2026, 0, 2).toISOString();
          }
          return { data: target };
        },
      },
    },
  };
  return { github, calls };
}

describe("SAN-1552 fix-prompt publisher — one owned comment", () => {
  const bodyFor = (headSha) =>
    renderFixPrompt({
      result: stateReview({ findings: [stateFinding({ path: "src/app.ts" })] }),
      baseSha: BASE,
      headSha,
      prUrl: PR_URL,
      changedFiles: [changedFile("src/app.ts", 10)],
    }).body;

  it("creates once and then updates the same comment for a later head", async () => {
    const { github, calls } = fakeGithub();
    const first = await upsertFixPromptComment({
      github,
      owner: "amoai-tech",
      repo: "mdeai",
      issueNumber: 1552,
      body: bodyFor(HEAD),
    });
    assert.equal(first.action, "created");
    assert.equal(calls.created.length, 1);

    const second = await upsertFixPromptComment({
      github,
      owner: "amoai-tech",
      repo: "mdeai",
      issueNumber: 1552,
      body: bodyFor(OTHER_HEAD),
    });
    assert.equal(second.action, "updated");
    assert.equal(calls.created.length, 1, "a retry must never create a second comment");
    assert.equal(calls.updated.length, 1);
    assert.equal(second.commentId, first.commentId);
  });

  it("is a no-op when the body is already current", async () => {
    const { github, calls } = fakeGithub();
    const body = bodyFor(HEAD);
    await upsertFixPromptComment({ github, owner: "o", repo: "r", issueNumber: 1, body });
    const repeat = await upsertFixPromptComment({ github, owner: "o", repo: "r", issueNumber: 1, body });
    assert.equal(repeat.action, "unchanged");
    assert.equal(calls.updated.length, 0);
    assert.equal(calls.created.length, 1);
  });
});

describe("SAN-1552 fix-prompt publisher — duplicates and failures", () => {
  it("ignores another author's comment that merely quotes the marker", async () => {
    const { github, calls } = fakeGithub([
      {
        id: 5,
        body: `${FIX_PROMPT_MARKER}\n<!-- mde-pr-agent:fix-prompt-head=${HEAD} -->\nnot the bot`,
        user: { login: "someone-else" },
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const outcome = await upsertFixPromptComment({
      github,
      owner: "o",
      repo: "r",
      issueNumber: 1,
      body: bodyFor(HEAD),
    });
    assert.equal(outcome.action, "created");
    assert.equal(calls.created.length, 1);
    assert.equal(calls.updated.length, 0);
  });

  it("updates the newest owned comment when duplicates already exist", async () => {
    const { github, calls } = fakeGithub([
      { id: 1, body: `${FIX_PROMPT_MARKER}\nold`, user: { login: "github-actions[bot]" }, updated_at: "2026-01-01T00:00:00Z" },
      { id: 2, body: `${FIX_PROMPT_MARKER}\nnewer`, user: { login: "github-actions[bot]" }, updated_at: "2026-01-02T00:00:00Z" },
    ]);
    const outcome = await upsertFixPromptComment({
      github,
      owner: "o",
      repo: "r",
      issueNumber: 1,
      body: bodyFor(HEAD),
    });
    assert.equal(outcome.action, "updated");
    assert.equal(outcome.duplicates, 1);
    assert.equal(calls.updated.length, 1);
    assert.equal(calls.updated[0].comment_id, 2);
    assert.equal(calls.created.length, 0);
  });

  it("refuses to publish a body without its identity marker", async () => {
    const { github } = fakeGithub();
    await assert.rejects(
      () => upsertFixPromptComment({ github, owner: "o", repo: "r", issueNumber: 1, body: "plain comment" }),
      /does not carry the fix-prompt marker/,
    );
  });

  it("surfaces a GitHub API failure instead of reporting success", async () => {
    const github = {
      paginate: async () => [],
      rest: {
        issues: {
          createComment: async () => {
            throw new Error("API rate limit exceeded");
          },
        },
      },
    };
    await assert.rejects(
      () => upsertFixPromptComment({ github, owner: "o", repo: "r", issueNumber: 1, body: bodyFor(HEAD) }),
      /API rate limit exceeded/,
    );
  });
});
