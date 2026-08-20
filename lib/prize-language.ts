/**
 * Plain-language, deliberately cautious wording for a combination-check
 * result. This repo has no official per-game prize-tier table for draw
 * games (only jackpot estimates) — so we NEVER name a prize amount or tier,
 * only report what actually matched and, for anything that could plausibly
 * be a prize, direct the user to confirm with the official operator. See
 * the product brief: "Do not determine or guarantee a prize unless the
 * source data explicitly supports that result."
 */
export interface CheckResultDisplay {
  summary: string;
  needsConfirmation: boolean;
}

export function formatCheckResult(matched: number, pick: number, bonusMatched: boolean | null): CheckResultDisplay {
  if (matched === 0) {
    return { summary: "No prize match recorded for this draw.", needsConfirmation: false };
  }
  const bonusNote = bonusMatched === true ? ", bonus matched" : bonusMatched === false ? ", bonus not matched" : "";
  const summary = `${matched} main number${matched === 1 ? "" : "s"} matched${bonusNote}.`;
  // Conservative threshold: 2+ main matches (or any bonus match) can plausibly
  // be a lower-tier prize on most games, but we can't confirm which without
  // official prize-tier data, so we always defer rather than guess.
  const needsConfirmation = matched >= 2 || bonusMatched === true || matched === pick;
  return { summary, needsConfirmation };
}

export const CONFIRMATION_NOTE = "Prize result requires confirmation with the official lottery operator.";
