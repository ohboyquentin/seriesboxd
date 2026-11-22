// Hexagone SVG
export function HexBadge({ badge, unlocked = false, size = 56 }) {
  const w = size, h = size * 1.15;
  const cx = w / 2, cy = h / 2;
  const r = w * 0.46;
  const pts = Array.from({length: 6}, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
  const innerR = r * 0.82;
  const innerPts = Array.from({length: 6}, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${cx + innerR * Math.cos(a)},${cy + innerR * Math.sin(a)}`;
  }).join(" ");

  const isSecret = badge.secret && !unlocked;
  const col = unlocked ? badge.color : (isSecret ? "#1e1e1e" : "#2a2a2a");
  const bg  = unlocked ? `${badge.color}22` : (isSecret ? "#444444" : "#141414");
  const iconColor = unlocked ? badge.color : (isSecret ? "#252525" : "#333");
  const displayIcon = isSecret ? "?" : badge.icon;
  const displayFontSize = isSecret ? size * 0.28 : size * 0.32;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polygon points={pts} fill={bg} stroke={col} strokeWidth={unlocked ? 1.5 : (isSecret ? 0.8 : 1)} strokeDasharray={isSecret ? "3 2" : "none"} />
      <polygon points={innerPts} fill="none" stroke={col} strokeWidth={0.5} strokeOpacity={unlocked ? 0.35 : 0.08} />
      <text x={cx} y={cy + size * 0.12} textAnchor="middle" fontSize={displayFontSize} fill={iconColor} fontWeight={isSecret ? "700" : "normal"} style={{ userSelect: "none" }}>{displayIcon}</text>
    </svg>
  );
}
