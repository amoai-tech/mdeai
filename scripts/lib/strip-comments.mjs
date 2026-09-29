/**
 * SAN-1357 · A conservative comment stripper, shared by the CopilotKit guards.
 *
 * Both the no-new-v1 guard and the consumer-inventory test must look at *code*, not prose: a doc
 * comment reading `Retire @copilotkit/react-ui.` must not create a violation, and a comment naming
 * `useCoAgent` must not sustain an allowlist entry.
 *
 * A regex cannot do this safely. A non-greedy block-comment match pairs any bare opening marker with
 * the next closing marker anywhere later in the file. This repository already contains that shape:
 * scripts/check-mastra.mjs writes the package scope followed by an asterisk inside a LINE comment,
 * and the regex deleted 3,120 characters of real code — including the array that names the aligned
 * packages. When a real v1 usage sat between the two, the guard reported OK and exited 0. A
 * false-positive fix had introduced a false negative, which is the worse failure.
 *
 * So this walks the text once, tracking state, and removes comments only.
 *
 * ponytail: strings are preserved verbatim, because module specifiers such as the react-ui package
 * name live inside them and are exactly what the guard exists to find. Blanking strings would
 * defeat the guard. The known ceiling is a regex literal holding an unescaped opening marker with a
 * later closing marker; recognising regex literals needs surrounding-token context this module
 * deliberately does not attempt. Upgrade to a real tokenizer only if a file here shows that shape.
 */

/** Remove comments from JavaScript/TypeScript source, preserving code and string contents. */
export function stripComments(text) {
  let out = "";
  let state = "code";

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        out += " ";
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        out += " ";
        continue;
      }
      if (c === "'") state = "single";
      else if (c === '"') state = "double";
      else if (c === "`") state = "template";
      out += c;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i++;
      }
      continue;
    }

    // Inside a string or template literal: preserve everything, honouring escapes.
    out += c;
    if (c === "\\") {
      if (i + 1 < text.length) {
        out += text[i + 1];
        i++;
      }
      continue;
    }
    if (state === "single" && c === "'") state = "code";
    else if (state === "double" && c === '"') state = "code";
    else if (state === "template" && c === "`") state = "code";
  }

  return out;
}
