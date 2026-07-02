"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * The signature interactive scratch ticket from the v5 hero, repurposed to
 * reveal today's #1 value pick. Canvas foil + scratch logic is ported verbatim;
 * the revealed content is the top game's live stats.
 */
export interface ScratchHeroData {
  slug: string;
  name: string;
  gameNumber: string;
  price: number;
  valueScore: number;
  topPrizeLabel: string;
}

export function ScratchTicketHero({ data }: { data: ScratchHeroData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const zone = zoneRef.current;
    if (!canvas || !zone) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let done = false;

    function drawFoil(w: number, h: number) {
      const g = ctx!.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#D8D2C5");
      g.addColorStop(0.4, "#E8E2D3");
      g.addColorStop(0.7, "#CFC8B9");
      g.addColorStop(1, "#B5AFA2");
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, w, h);
      const hl = ctx!.createLinearGradient(0, 0, w, h);
      hl.addColorStop(0, "rgba(255,255,255,0)");
      hl.addColorStop(0.45, "rgba(255,255,255,0.18)");
      hl.addColorStop(0.55, "rgba(255,255,255,0)");
      ctx!.fillStyle = hl;
      ctx!.fillRect(0, 0, w, h);
      ctx!.strokeStyle = "rgba(255,255,255,0.04)";
      ctx!.lineWidth = 1;
      for (let x = 0; x < w; x += 3) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
    }

    function setup() {
      const rect = zone!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.scale(dpr, dpr);
      drawFoil(rect.width, rect.height);
    }

    function point(e: MouseEvent | TouchEvent) {
      const rect = canvas!.getBoundingClientRect();
      const t = "touches" in e ? e.touches[0] : (e as MouseEvent);
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function scratch(x: number, y: number) {
      ctx!.globalCompositeOperation = "destination-out";
      ctx!.beginPath();
      ctx!.arc(x, y, 22, 0, Math.PI * 2);
      ctx!.fill();
      if (lastX || lastY) {
        ctx!.lineWidth = 44;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(lastX, lastY);
        ctx!.lineTo(x, y);
        ctx!.stroke();
      }
      lastX = x;
      lastY = y;
    }

    function pct() {
      const img = ctx!.getImageData(0, 0, canvas!.width, canvas!.height);
      let cleared = 0;
      const total = img.data.length / 4;
      for (let i = 3; i < img.data.length; i += 32) {
        if (img.data[i] === 0) cleared++;
      }
      return (cleared * 8) / total;
    }

    function finish() {
      done = true;
      setRevealed(true);
      let opacity = 1;
      const step = () => {
        opacity -= 0.06;
        canvas!.style.opacity = String(Math.max(0, opacity));
        if (opacity > 0) requestAnimationFrame(step);
        else canvas!.style.display = "none";
      };
      step();
    }

    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      if (done) return;
      isDrawing = true;
      const p = point(e);
      lastX = p.x;
      lastY = p.y;
      scratch(p.x, p.y);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!isDrawing || done) return;
      e.preventDefault();
      const p = point(e);
      scratch(p.x, p.y);
    }
    function end() {
      if (!isDrawing) return;
      isDrawing = false;
      lastX = 0;
      lastY = 0;
      if (!done && pct() > 0.3) finish();
    }

    setup();
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      if (done) return;
      clearTimeout(timer);
      timer = setTimeout(setup, 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="ticket-stage reveal r-3">
      <div className={`scratch-ticket ${revealed ? "revealed" : ""}`}>
        <div className="ticket-stub">
          <div className="ticket-stub-text">TODAY&rsquo;S BEST VALUE · MMXXVI</div>
        </div>
        <div className="ticket-body">
          <div className="ticket-header">
            <div>
              <div className="ticket-brand">LOTTIZEN</div>
              <div className="ticket-brand-sub">VALUE PICK · ONT</div>
            </div>
            <div className="ticket-jackpot">
              <div className="ticket-jackpot-label">Value Score</div>
              <div className="ticket-jackpot-amount">{data.valueScore.toFixed(1)}</div>
            </div>
          </div>

          <div className="scratch-zone" ref={zoneRef}>
            <div className="scratch-revealed">
              <div className="scratch-revealed-content">
                <div className="scratch-cell">
                  <div className="scratch-label">Top Pick</div>
                  <div className="scratch-value">{data.name}</div>
                </div>
                <div className="scratch-cell">
                  <div className="scratch-label">Game No.</div>
                  <div className="scratch-value gold">#{data.gameNumber}</div>
                </div>
                <div className="scratch-cell">
                  <div className="scratch-label">Price</div>
                  <div className="scratch-value">${Math.round(data.price)}</div>
                </div>
                <div className="scratch-cell">
                  <div className="scratch-label">Top Prize</div>
                  <div className="scratch-value gold">{data.topPrizeLabel}</div>
                </div>
              </div>
            </div>
            <canvas ref={canvasRef} className="scratch-canvas" />
            <div className={`scratch-hint ${revealed ? "hidden" : ""}`}>
              Scratch to reveal today&rsquo;s pick
            </div>
          </div>

          <div className="ticket-footer">
            <div className="ticket-id">SERIAL · LZ·{data.gameNumber}·ON</div>
            <div className="ticket-tier">
              <div className="ticket-tier-label">Ranked</div>
              <Link href={`/scratch/${data.slug}`} className="ticket-tier-name">
                #1 of the day →
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className={`ticket-stage-caption ${revealed ? "revealed" : ""}`}>
        {revealed ? "— TAP THE CARD TO SEE FULL BREAKDOWN —" : "TODAY'S #1 VALUE SCRATCH TICKET"}
      </div>
    </div>
  );
}
