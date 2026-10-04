"use client";

import { useMemo, useState } from "react";
import type { EmbedCatalog, EmbedKind } from "@/lib/embed";

const KIND_ORDER: EmbedKind[] = ["latest", "jackpot", "scratch", "number"];
const KIND_LABEL: Record<EmbedKind, string> = {
  latest: "Latest numbers",
  jackpot: "Current jackpot",
  scratch: "Top 3 scratch tickets",
  number: "Number statistics",
};

/** Configurator for /embed: pick a widget, preview the live iframe, copy the
 *  snippet. The snippet is plain HTML: an iframe plus a text credit link. */
export function EmbedBuilder({ catalog, siteUrl }: { catalog: EmbedCatalog; siteUrl: string }) {
  const [countrySlug, setCountrySlug] = useState(catalog.countries[0].slug);
  const country = catalog.countries.find((c) => c.slug === countrySlug)!;
  const isCanada = country.code === "CA";

  // Scratch data exists for Canada only; the rest depend on what each game publishes.
  const kinds = useMemo(
    () =>
      KIND_ORDER.filter((k) => (k === "scratch" ? isCanada : country.games.some((g) => g.kinds.includes(k)))),
    [country, isCanada],
  );

  const [kindRaw, setKind] = useState<EmbedKind>("latest");
  const kind = kinds.includes(kindRaw) ? kindRaw : kinds[0];
  const games = country.games.filter((g) => g.kinds.includes(kind));
  const [gameRaw, setGame] = useState(games[0]?.slug ?? "");
  const game = games.find((g) => g.slug === gameRaw) ?? games[0];
  const [province, setProvince] = useState(catalog.provinces[0].slug);
  const [nRaw, setN] = useState(7);
  const n = game?.max ? Math.min(Math.max(1, nRaw), game.max) : nRaw;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copied, setCopied] = useState(false);

  let path = "";
  let height = 200;
  let title = "";
  let creditPath = "";
  let creditText = "";
  if (kind === "scratch") {
    const p = catalog.provinces.find((x) => x.slug === province)!;
    path = `/embed/scratch/${province}`;
    height = catalog.scratchHeight;
    title = `${p.label} scratch tickets: top 3 by prize money left`;
    creditPath = `/scratch/${province}`;
    creditText = `${p.label.split(" (")[0]} scratch ticket rankings`;
  } else if (game) {
    height = game.heights[kind] ?? 200;
    if (kind === "latest") {
      path = `/embed/latest/${game.slug}`;
      title = `${game.name} winning numbers`;
      creditPath = `/${country.slug}/${game.slug}/results`;
      creditText = `${game.name} results`;
    } else if (kind === "jackpot") {
      path = `/embed/jackpot/${game.slug}`;
      title = `${game.name} jackpot`;
      creditPath = `/${country.slug}/${game.slug}`;
      creditText = `${game.name} jackpot and draws`;
    } else {
      path = `/embed/number/${game.slug}/${n}`;
      title = `${game.name} number ${n} history`;
      creditPath = `/${country.slug}/${game.slug}/number/${n}`;
      creditText = `${game.name} number ${n} statistics`;
    }
  }
  const query = theme === "dark" ? "?theme=dark" : "";
  const snippet =
    `<iframe src="${siteUrl}${path}${query}" title="${title}" width="100%" height="${height}" ` +
    `style="max-width:400px;border:0" loading="lazy"></iframe>\n` +
    `<p style="font-size:12px;margin:4px 0 0">${creditText} from <a href="${siteUrl}${creditPath}">Lottizen</a></p>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context): the textarea is
      // selectable, so the reader can still copy by hand.
    }
  }

  return (
    <div className="embed-builder">
      <div className="card embed-controls">
        <div className="field">
          <label>Country</label>
          <div className="chip-row">
            {catalog.countries.map((c) => (
              <button
                type="button"
                key={c.slug}
                className={`chip${c.slug === countrySlug ? " active" : ""}`}
                onClick={() => setCountrySlug(c.slug)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Widget</label>
          <div className="chip-row">
            {kinds.map((k) => (
              <button type="button" key={k} className={`chip${k === kind ? " active" : ""}`} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {kind === "scratch" ? (
          <div className="field">
            <label htmlFor="embed-province">Province</label>
            <select id="embed-province" value={province} onChange={(e) => setProvince(e.target.value)}>
              {catalog.provinces.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="embed-game">Game</label>
            <select id="embed-game" value={game?.slug} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
            {kind === "jackpot" && (
              <span className="field-hint">Only games whose operator publishes a jackpot estimate are listed.</span>
            )}
          </div>
        )}

        {kind === "number" && game?.max && (
          <div className="field">
            <label htmlFor="embed-n">Number (1–{game.max})</label>
            <input
              id="embed-n"
              type="number"
              min={1}
              max={game.max}
              value={n}
              onChange={(e) => setN(Number(e.target.value) || 1)}
            />
          </div>
        )}

        <div className="field">
          <label>Theme</label>
          <div className="chip-row">
            {(["light", "dark"] as const).map((t) => (
              <button type="button" key={t} className={`chip${t === theme ? " active" : ""}`} onClick={() => setTheme(t)}>
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="embed-output">
        <div className={`embed-preview${theme === "dark" ? " dark" : ""}`}>
          <iframe
            key={`${path}${query}`}
            src={`${path}${query}`}
            title={title}
            width="100%"
            height={height}
            style={{ maxWidth: 400, border: 0, display: "block" }}
          />
        </div>
        <div className="field" style={{ marginTop: 20 }}>
          <label htmlFor="embed-code">Embed code</label>
          <textarea id="embed-code" className="embed-code" readOnly value={snippet} rows={5} onFocus={(e) => e.target.select()} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copied ? "Copied" : "Copy code"}
            </button>
            <span className="field-hint">No JavaScript. Updates itself every day.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
