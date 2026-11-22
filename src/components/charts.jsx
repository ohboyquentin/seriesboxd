import { useState, useEffect, useRef } from "react";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM, PALETTE } from "../constants/theme.js";

// ─── GENRE DONUT ──────────────────────────────────────────────────────────────

export function GenreDonut({ genreData }) {
  const [hovered, setHovered] = useState(null);
  const size = 140, cx = 70, cy = 70, r = 52, ir = 32;
  const total = genreData.reduce((a, [, n]) => a + n, 0);
  if (!total) return <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: 20 }}>Pas encore de données</div>;
  let angle = -Math.PI / 2;
  const slices = genreData.map(([genre, count], i) => {
    const sweep = (count / total) * 2 * Math.PI;
    const mk = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [x1,y1]=mk(r,angle),[x2,y2]=mk(r,angle+sweep);
    const [ix1,iy1]=mk(ir,angle),[ix2,iy2]=mk(ir,angle+sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large} 0 ${ix1},${iy1}Z`;
    const mid = angle + sweep / 2;
    angle += sweep;
    return { genre, count, path, color: PALETTE[i] || "#555", mid };
  });
  const hov = hovered !== null ? slices[hovered] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flexShrink: 0 }}>
        <svg width={size} height={size}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color}
              opacity={hovered === null || hovered === i ? 1 : 0.3}
              style={{ cursor: "pointer", transition: "opacity .2s" }}
              transform={hovered === i ? `translate(${Math.cos(s.mid)*3},${Math.sin(s.mid)*3})` : ""}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            />
          ))}
          <text x={cx} y={cy-6} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700" fontFamily="Georgia,serif">{hov ? hov.count : total}</text>
          <text x={cx} y={cy+10} textAnchor="middle" fill="#666" fontSize="9">{hov ? hov.genre : "séries"}</text>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: hovered===null||hovered===i?1:.4, transition: "opacity .2s", cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#ccc", flex: 1 }}>{s.genre}</div>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{Math.round(s.count/total*100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RATING BARS ──────────────────────────────────────────────────────────────

export function RatingBars({ ratingDist, avgRating }) {
  const maxCount = Math.max(...ratingDist.map(r => r.count), 1);
  const [animated, setAnimated] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setAnimated(true); }, { threshold: .3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, borderRadius: 12, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: ORANGE, fontSize: 20 }}>★</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif" }}>{avgRating}</span>
          <span style={{ color: "#666", fontSize: 12 }}>moyenne</span>
        </div>
        <div style={{ color: "#444", fontSize: 12 }}>{ratingDist.reduce((a, r) => a + r.count, 0)} notes</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...ratingDist].reverse().map(({ star, count }) => (
          <div key={star} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: ORANGE, fontSize: 11, width: 42, flexShrink: 0 }}>{"★".repeat(star)}</span>
            <div style={{ flex: 1, height: 10, background: "#141414", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", background: `linear-gradient(90deg, #c026d3, #eca6ee)`, borderRadius: 6, width: animated ? `${(count/maxCount)*100}%` : "0%", transition: "width .8s cubic-bezier(.34,1.2,.64,1)", transitionDelay: `${(5-star)*.08}s` }} />
            </div>
            <div style={{ width: 16, textAlign: "right", color: count > 0 ? "#888" : "#333", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
