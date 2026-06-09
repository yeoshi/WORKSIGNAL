/**
 * Reply role disambiguation (Gmail_Monitor, Req 18.3).
 *
 * Pure, deterministic logic that attributes an inbound reply to one specific
 * sent {@link Application} when a user has more than one application to the
 * *same company* differing by role title.
 *
 * Design reference: design.md — Gmail_Monitor, "Role disambiguation (18.3)":
 * "when a user has multiple applications to the same company, the monitor picks
 * the specific application using the role title referenced in the reply, the
 * thread id, and the application thread the reply belongs to."
 *
 * Requirement 18.3: WHERE a User has more than one sent Application to the same
 * company, THE Gmail_Monitor SHALL determine which specific Application a reply
 * corresponds to using the role title referenced in the reply, the thread
 * identifier, and the application thread the reply belongs to.
 *
 * Correctness property (Property 15): *for any* set of two or more sent
 * applications to the same company that differ by role title, and any reply
 * that references one of those roles, the reply is attributed to the
 * application whose role title the reply references.
 *
 * To honour Property 15 even against a conflicting thread id, the *role-title
 * reference* is the primary signal: a candidate whose role title is most fully
 * referenced in the reply wins. The thread identifier / application thread is
 * used as a supporting tie-breaker when the role reference alone cannot
 * separate two candidates. When no signal distinguishes multiple candidates,
 * the reply is reported as unmatched rather than guessed.
 *
 * This module is a pure function so it is directly property-testable
 * (see task 7.6 / Property 15); it performs no I/O.
 */
import type {
  Application,
  InboundEmail,
  MatchResult,
} from '@worksignal/shared';

/**
 * Tokens that carry no disambiguating signal in a role title and are dropped
 * before matching (e.g. "Head **of** Sales", "Engineer **and** Architect").
 * Kept deliberately small — role titles are short and most words are
 * meaningful.
 */
const TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'for',
  'to',
  'in',
  'at',
  'on',
  'with',
]);

/**
 * Relative weights used to fold the three component signals into a single
 * 0-100 confidence {@link MatchResult.score}. The role-title coverage term
 * dominates, reflecting that the referenced role is the primary signal.
 */
const SCORE_WEIGHTS = {
  /** Fraction of the role title's tokens referenced by the reply. */
  coverage: 0.6,
  /** The full role-title phrase appears verbatim in the reply. */
  phrase: 0.2,
  /** The reply belongs to the application's email thread. */
  thread: 0.2,
} as const;

/**
 * Normalise free text for matching: lower-case, replace every run of
 * non-alphanumeric characters with a single space, and trim. Produces a stable
 * canonical form for both phrase (substring) checks and tokenisation.
 *
 * @param text - Arbitrary input text.
 * @returns The normalised string (possibly empty).
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tokenise a role title into its meaningful, de-duplicated tokens: normalise,
 * split on whitespace, drop stopwords and single-character tokens.
 *
 * @param title - A role title.
 * @returns The set of distinct meaningful tokens.
 */
function titleTokens(title: string): Set<string> {
  const tokens = normalise(title)
    .split(' ')
    .filter((t) => t.length > 1 && !TITLE_STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Tokenise the reply text into a membership set used to test which role-title
 * tokens are referenced.
 *
 * @param text - The normalised reply text.
 * @returns The set of distinct reply tokens.
 */
function replyTokens(text: string): Set<string> {
  return new Set(text.split(' ').filter(Boolean));
}

/**
 * The disambiguation signals computed for a single candidate application
 * against a reply. Ordering of fields mirrors their precedence in
 * {@link compareScored}.
 */
interface ScoredCandidate {
  application: Application;
  /** Fraction of the candidate's role-title tokens referenced by the reply. */
  coverage: number;
  /** Number of role-title tokens referenced by the reply. */
  matchedCount: number;
  /** The full role-title phrase appears verbatim in the reply. */
  phraseMatch: boolean;
  /** The reply's thread id equals the application's email thread id. */
  threadMatch: boolean;
  /** Folded 0-100 confidence score for {@link MatchResult.score}. */
  score: number;
}

/**
 * Score one candidate application against the reply.
 *
 * @param application - A candidate sent application (same company).
 * @param replyText - The normalised reply text (subject + body).
 * @param replyTokenSet - Pre-computed token set of the reply text.
 * @param email - The inbound reply email (for its thread id).
 * @returns The computed {@link ScoredCandidate}.
 */
function scoreCandidate(
  application: Application,
  replyText: string,
  replyTokenSet: Set<string>,
  email: InboundEmail,
): ScoredCandidate {
  const tokens = titleTokens(application.role_title);
  let matchedCount = 0;
  for (const token of tokens) {
    if (replyTokenSet.has(token)) matchedCount += 1;
  }
  const coverage = tokens.size === 0 ? 0 : matchedCount / tokens.size;

  const normalisedTitle = normalise(application.role_title);
  const phraseMatch =
    normalisedTitle.length > 0 && replyText.includes(normalisedTitle);

  const threadMatch =
    application.email_thread_id != null &&
    application.email_thread_id !== '' &&
    application.email_thread_id === email.thread_id;

  const score = Math.round(
    100 *
      (SCORE_WEIGHTS.coverage * coverage +
        SCORE_WEIGHTS.phrase * (phraseMatch ? 1 : 0) +
        SCORE_WEIGHTS.thread * (threadMatch ? 1 : 0)),
  );

  return { application, coverage, matchedCount, phraseMatch, threadMatch, score };
}

/**
 * Whether a candidate carries any positive disambiguating signal at all.
 * Used to avoid guessing when nothing distinguishes the reply from noise.
 */
function hasSignal(c: ScoredCandidate): boolean {
  return c.coverage > 0 || c.threadMatch;
}

/**
 * Compare two scored candidates by their *meaningful* signals (role-title
 * reference first, thread match last). Returns a positive number when `a`
 * ranks ahead of `b`, negative when behind, and `0` when they are tied on
 * every meaningful signal (a genuine ambiguity).
 *
 * Precedence honours Property 15: the role-title reference (coverage, then a
 * verbatim phrase match, then absolute matched-token count) outranks the
 * thread id, so a reply that references one role is attributed to that role's
 * application even if another application's thread id happens to match.
 */
function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.coverage !== b.coverage) return a.coverage - b.coverage;
  if (a.phraseMatch !== b.phraseMatch) return (a.phraseMatch ? 1 : 0) - (b.phraseMatch ? 1 : 0);
  if (a.matchedCount !== b.matchedCount) return a.matchedCount - b.matchedCount;
  if (a.threadMatch !== b.threadMatch) return (a.threadMatch ? 1 : 0) - (b.threadMatch ? 1 : 0);
  return 0;
}

/**
 * Attribute an inbound reply to the specific sent application it concerns.
 *
 * Intended to run *after* fuzzy company matching (Req 18.2) has narrowed the
 * inbox to applications for a single company; `candidates` should therefore be
 * the set of that company's sent applications. The function then disambiguates
 * among them by role-title reference (primary), with the thread id /
 * application thread as a supporting tie-breaker (Req 18.3, Property 15).
 *
 * Behaviour:
 *  - No candidates → `{ matched: false }`.
 *  - Exactly one candidate → matched (it is the only application for the
 *    company; there is nothing to disambiguate).
 *  - Multiple candidates → matched to the strictly best-scoring candidate.
 *    If no candidate carries any positive signal, or the two best candidates
 *    are tied on every meaningful signal, the reply is genuinely ambiguous and
 *    `{ matched: false }` is returned rather than guessing.
 *
 * @param email - The inbound reply email.
 * @param candidates - Same-company sent applications to disambiguate between.
 * @returns A {@link MatchResult} identifying the attributed application, or
 *          `{ matched: false }` when attribution is not possible.
 */
export function disambiguateReply(
  email: InboundEmail,
  candidates: readonly Application[],
): MatchResult {
  if (candidates.length === 0) {
    return { matched: false };
  }

  const replyText = normalise(`${email.subject} ${email.body}`);
  const replyTokenSet = replyTokens(replyText);

  const scored = candidates.map((application) =>
    scoreCandidate(application, replyText, replyTokenSet, email),
  );

  // Sole candidate: no ambiguity, attribute the reply to it.
  if (scored.length === 1) {
    const only = scored[0]!;
    return { matched: true, applicationId: only.application.application_id, score: only.score };
  }

  // Rank by meaningful signals; break exact ties deterministically by id so
  // the function is a pure, order-independent function of its inputs.
  const ranked = [...scored].sort((a, b) => {
    const cmp = compareScored(b, a);
    if (cmp !== 0) return cmp;
    return a.application.application_id < b.application.application_id ? -1 : 1;
  });

  const best = ranked[0]!;
  const runnerUp = ranked[1]!;

  // No distinguishing signal anywhere, or the top two are tied on every
  // meaningful signal → genuinely ambiguous, do not guess.
  if (!hasSignal(best) || compareScored(best, runnerUp) === 0) {
    return { matched: false };
  }

  return { matched: true, applicationId: best.application.application_id, score: best.score };
}
