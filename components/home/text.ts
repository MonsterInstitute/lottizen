/** Same rule as scripts/prize_values.py: annuity prizes are named by the
 *  agency's own label, not by an amount. */
export function isAnnuityLabel(label: string): boolean {
  return /for life|à vie|a vie|\/\s*wk|\/\s*week|per week|a week|par semaine|\/\s*yr|per year|par année/i.test(label);
}
