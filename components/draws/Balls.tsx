/** A row of drawn number balls, with an optional bonus ball. */
export function Balls({
  numbers,
  bonus,
  size = "",
}: {
  numbers: number[];
  bonus?: number | null;
  size?: "sm" | "lg" | "";
}) {
  const cls = size ? ` ${size}` : "";
  return (
    <div className="balls">
      {numbers.map((n, i) => (
        <span className={`ball${cls}`} key={i}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
      {bonus != null && (
        <>
          <span className="ball-plus" aria-hidden="true">
            +
          </span>
          <span className={`ball bonus${cls}`} title="Bonus number">
            {String(bonus).padStart(2, "0")}
          </span>
        </>
      )}
    </div>
  );
}
