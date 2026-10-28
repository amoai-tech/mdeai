// SAN-1552 · Identity and the single publication path for the AI agent fix prompt.
//
// The marker is stable across heads so a retry updates the same comment; the head is recorded
// separately so an outdated prompt can be recognised. Only the trusted bot author plus the marker
// identify the comment, so a human comment that quotes the marker is never mistaken for ours.

export const FIX_PROMPT_MARKER = "<!-- mde-pr-agent:fix-prompt:v1 -->";
/** The head the current comment was rendered for, so a stale prompt can be recognised. */
export const FIX_PROMPT_HEAD_RE = /<!-- mde-pr-agent:fix-prompt-head=([0-9a-f]{40}) -->/;

/** GitHub rejects comments over 65,536 characters; stay below that with room for the envelope. */
export const MAX_COMMENT_CHARS = 60_000;

/** The head a previously published comment was rendered for, if it recorded one. */
export function publishedHeadOf(body) {
  return FIX_PROMPT_HEAD_RE.exec(String(body ?? ""))?.[1]?.toLowerCase() ?? null;
}

/**
 * Create or update the single comment this module owns. Retries and later heads never create a
 * second comment: the marker plus the trusted bot author identify it.
 *
 * @param {object} input
 * @param {{paginate: Function, rest: {issues: object}}} input.github Octokit-shaped client.
 * @returns {Promise<{action: "created"|"updated"|"unchanged", commentId: number|null, owned: number, duplicates: number}>}
 */
export async function upsertFixPromptComment({ github, owner, repo, issueNumber, body }) {
  if (!String(body ?? "").includes(FIX_PROMPT_MARKER)) {
    throw new Error("refusing to publish a comment that does not carry the fix-prompt marker");
  }
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const owned = (comments ?? []).filter(
    (comment) =>
      comment?.user?.login === "github-actions[bot]" &&
      String(comment.body ?? "").includes(FIX_PROMPT_MARKER),
  );

  if (owned.length === 0) {
    const created = await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    return { action: "created", commentId: created?.data?.id ?? null, owned: 0, duplicates: 0 };
  }

  const newest = owned.reduce((left, right) =>
    new Date(right.updated_at ?? 0).getTime() >= new Date(left.updated_at ?? 0).getTime() ? right : left,
  );
  if (String(newest.body ?? "") === body) {
    return { action: "unchanged", commentId: newest.id ?? null, owned: owned.length, duplicates: owned.length - 1 };
  }
  await github.rest.issues.updateComment({ owner, repo, comment_id: newest.id, body });
  return {
    action: "updated",
    commentId: newest.id ?? null,
    owned: owned.length,
    duplicates: owned.length - 1,
  };
}
