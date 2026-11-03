/**
 * Require an explicit negative answer to "is any place selected?".
 * A standalone "no", incidental words like "known", or a historical name
 * without saying there is NO current selection is not enough.
 *
 * SAN-737: keep this parser as plain string operations. The earlier regex
 * version was correct but Codacy's unsafe-regex heuristic flagged six
 * high-severity findings in this test helper. Small phrase lists are easier to
 * audit and cannot cause catastrophic backtracking.
 */
const SELECTED_NOUNS = [
  "place",
  "item",
  "record",
  "listing",
  "rental",
  "apartment",
  "venue",
  "restaurant",
  "event",
  "cafe",
  "café",
  "club",
];
const NEGATIVE_FIRST_WORDS = new Set(["none", "no", "not", "nothing"]);

function replaceAll(text: string, phrase: string): string {
  return phrase ? text.split(phrase).join("") : text;
}

function stripFutureSelections(text: string): string {
  let next = text;
  for (const prefix of ["once", "if", "when"]) {
    for (const determiner of ["a", "an", "the"]) {
      for (const noun of SELECTED_NOUNS) {
        for (const verb of ["is", "are"]) {
          next = replaceAll(next, `${prefix} ${determiner} ${noun} ${verb} selected`);
          next = replaceAll(next, `${prefix} ${determiner} ${noun} ${verb} currently selected`);
        }
      }
    }
  }
  return next;
}

function stripHistoricalSelections(text: string): string {
  let next = text;
  for (const adverb of ["previously", "formerly", "last", "earlier", "old"]) {
    for (const qualifier of ["", "public "]) {
      for (const noun of SELECTED_NOUNS) {
        next = replaceAll(next, `${adverb} ${qualifier}selected ${noun}`);
        next = replaceAll(next, `${adverb} ${qualifier}selected ${noun}s`);
      }
    }
  }
  return next;
}

function stripNegativeClaims(text: string): string {
  let next = text;
  // "I'm checking whether any place is currently selected" is a description
  // of the check being performed, not a claim that an item is selected.
  for (const phrase of [
    "checking whether any place is currently selected",
    "checking whether any place is selected",
    "whether any place is currently selected",
    "whether any place is selected",
  ]) {
    next = replaceAll(next, phrase);
  }
  for (const subject of ["nothing", "none", "no one", "nobody"]) {
    for (const verb of ["is", "are"]) {
      next = replaceAll(next, `${subject} ${verb} selected`);
      next = replaceAll(next, `${subject} ${verb} currently selected`);
    }
  }
  for (const qualifier of ["", "currently ", "active ", "public ", "new ", "currently public ", "currently active "]) {
    for (const noun of SELECTED_NOUNS) {
      next = replaceAll(next, `no ${qualifier}${noun} selected`);
      next = replaceAll(next, `no ${qualifier}${noun} is selected`);
      next = replaceAll(next, `no ${qualifier}${noun} is currently selected`);
      next = replaceAll(next, `no ${qualifier}${noun} are selected`);
      // Compound negative observed from the real Rentals agent:
      // "no public place or rental listing is currently selected".
      next = replaceAll(next, `no ${qualifier}${noun} or rental listing is currently selected`);
    }
  }
  return next;
}

function firstWordOf(text: string): string {
  let end = 0;
  while (end < text.length && !" \t\r\n".includes(text.charAt(end))) end += 1;
  let word = text.slice(0, end);
  while (word.length > 0 && ".,!?;:".includes(word[word.length - 1] ?? "")) {
    word = word.slice(0, -1);
  }
  return word;
}

function hasSelectedPlaceClaim(text: string): boolean {
  for (const noun of SELECTED_NOUNS) {
    for (const qualifier of ["", "public ", "currently ", "currently public "]) {
      for (const verb of ["is", "remains", "still"]) {
        const marker = `selected ${qualifier}${noun} ${verb} `;
        let index = text.indexOf(marker);
        while (index >= 0) {
          let rest = text.slice(index + marker.length).trimStart();
          if (rest.startsWith("currently ")) rest = rest.slice("currently ".length).trimStart();
          if (rest.startsWith("the ")) rest = rest.slice("the ".length).trimStart();
          const firstWord = firstWordOf(rest);
          if (!NEGATIVE_FIRST_WORDS.has(firstWord)) return true;
          index = text.indexOf(marker, index + marker.length);
        }
      }
    }
  }
  return false;
}

function selectedPublicItemFields(text: string): string[] {
  const marker = "selected public item:";
  const values: string[] = [];
  let index = text.indexOf(marker);
  while (index >= 0) {
    const rest = text.slice(index + marker.length);
    let end = rest.length;
    for (let i = 0; i < rest.length; i += 1) {
      if (".!?\r\n".includes(rest.charAt(i))) {
        end = i;
        break;
      }
    }
    values.push(rest.slice(0, end).trim());
    index = text.indexOf(marker, index + marker.length);
  }
  return values;
}

function hasNegativeSelectedStatement(text: string): boolean {
  if (
    text.includes("nothing is selected") ||
    text.includes("nothing is currently selected") ||
    text.includes("nothing's selected") ||
    text.includes("nothing's currently selected") ||
    text.includes("none is selected") ||
    text.includes("none are selected") ||
    text.includes("selection is cleared") ||
    text.includes("there is no selected") ||
    text.includes("there's no selected") ||
    ((text.includes("there is no ") || text.includes("there's no ")) && text.includes("selected"))
  ) {
    return true;
  }
  for (const qualifier of ["", "currently ", "active ", "public ", "new ", "currently public ", "currently active "]) {
    for (const noun of SELECTED_NOUNS) {
      if (
        text.includes(`no ${qualifier}${noun} selected`) ||
        text.includes(`no ${qualifier}${noun} is selected`) ||
        text.includes(`no ${qualifier}${noun} is currently selected`) ||
        text.includes(`no ${qualifier}${noun} are selected`)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function confirmsNothingSelected(input: string): boolean {
  const answer = input.trim().toLowerCase();
  if (!answer) return false;

  const currentState = stripHistoricalSelections(stripFutureSelections(answer));

  // "The selected place is Apartment B" never contains "is selected".
  if (hasSelectedPlaceClaim(currentState)) return false;

  const remainingClaims = stripNegativeClaims(currentState);
  if (
    remainingClaims.includes(" is selected") ||
    remainingClaims.includes(" is currently selected") ||
    remainingClaims.includes(" remains selected") ||
    remainingClaims.includes(" still selected")
  ) {
    return false;
  }

  // Some grounded agents use a structured, explicit current-state answer.
  // Only a single exact NONE field counts: a second selected item or an
  // item name must not be misclassified as a cleared selection.
  const fields = selectedPublicItemFields(answer);
  if (fields.length > 0) return fields.length === 1 && fields[0] === "none";

  // Another exact negative form observed from the real Events agent on mobile.
  if (
    answer.startsWith("i don't have any currently selected") ||
    answer.startsWith("i do not have any currently selected")
  ) {
    return true;
  }

  // Real agents answer in more than one sentence: the negative can come after
  // "Based on your request..." or "You don't have...". Accept any explicit
  // negative statement, but keep the known ambiguous "I know..." form rejected.
  if (hasNegativeSelectedStatement(currentState)) {
    if (answer.startsWith("i know") || answer.startsWith("known")) return false;
    return true;
  }

  const startsAsConfirmation =
    answer === "no" ||
    answer.startsWith("no ") ||
    answer.startsWith("no,") ||
    answer.startsWith("no.") ||
    answer.startsWith("no —") ||
    answer.startsWith("nothing") ||
    answer.startsWith("none") ||
    answer.startsWith("there is") ||
    answer.startsWith("there are") ||
    answer.startsWith("selection") ||
    answer.startsWith("currently") ||
    answer.startsWith("i've checked") ||
    answer.startsWith("i have checked") ||
    answer.startsWith("i checked") ||
    answer.startsWith("right now") ||
    answer.startsWith("based on the current browser state") ||
    answer.startsWith("based on current browser state") ||
    answer.startsWith("based on ");
  if (!startsAsConfirmation) return false;

  // "No — no public place or rental listing is currently selected." has a
  // compound object between "no" and "selected", so the exact phrase list above
  // misses it. The positive/contradiction checks already ran, so a remaining
  // explicit "no … selected" is a negative answer.
  if (currentState.includes("no ") && currentState.includes("selected")) return true;
  return hasNegativeSelectedStatement(currentState);
}
