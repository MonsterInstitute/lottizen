import type { CSSProperties } from "react";

/** A row of drawn number balls, with up to two secondary balls.
 *  Single-bonus games pass `bonus`; two-star games (EuroMillions Lucky Stars,
 *  EuroJackpot Euro numbers) also pass `bonus2` and set `star` to render them as
 *  distinct star balls. `bonusTitle` is the hover label (e.g. "Lucky Star"). */
export function Balls({
  numbers,
  bonus,
  bonus2,
  star,
  bonusTitle = "Bonus number",
  size = "",
  fit = false,
}: {
  numbers: number[];
  bonus?: number | null;
  bonus2?: number | null;
  star?: boolean;
  bonusTitle?: string;
  size?: "sm" | "lg" | "";
  /** Keep every ball on one line, shrinking them to the container's width.
   *  Ten or more balls (Pick 10's 20 numbers) still wrap: one line would
   *  make them too small to read. */
  fit?: boolean;
}) {
  const cls = size ? ` ${size}` : "";
  const secondaries = [bonus, bonus2].filter((b): b is number => b != null);
  // Two-secondary games (bonus2 present) render star balls unless overridden.
  const secClass = (star ?? bonus2 != null) ? "ball star" : "ball bonus";
  const row = (
    <div className="balls">
      {numbers.map((n, i) => (
        <span className={`ball${cls}`} key={i}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
      {secondaries.length > 0 && (
        <>
          <span className="ball-plus" aria-hidden="true">
            +
          </span>
          {secondaries.map((b, i) => (
            <span className={`${secClass}${cls}`} key={`b${i}`} title={bonusTitle}>
              {String(b).padStart(2, "0")}
            </span>
          ))}
        </>
      )}
    </div>
  );
  const n = numbers.length + secondaries.length;
  if (!fit || n > 9) return row;
  return (
    <div className="balls-fit" style={{ "--n": n, "--plus": secondaries.length ? 1 : 0 } as CSSProperties}>
      {row}
    </div>
  );
}
