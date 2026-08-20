/**
 * Required on every scratch page (index, price buckets, individual ticket
 * detail) — exact wording from the product brief, not to be paraphrased.
 */
export function ScratchDisclaimer() {
  return (
    <div className="notice" style={{ marginTop: 20 }}>
      <span className="notice-tag">Disclaimer</span>
      <span>
        Rankings are based on publicly available remaining-prize data and do not predict whether a
        ticket will win. Confirm current information with the official lottery operator. Play
        responsibly.
      </span>
    </div>
  );
}
