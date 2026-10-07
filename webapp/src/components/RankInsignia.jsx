import React from "react";

// Rank insignia drawn as SVG: chevrons for the first levels, then bars,
// then stars. Replaces emoji avatars with something that reads as kit.
const CHEVRON = (y) => `M5 ${y} L12 ${y - 4.5} L19 ${y}`;

function Star({ cx, cy, r }) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon points={pts.join(" ")} fill="currentColor" stroke="none" />;
}

export default function RankInsignia({ level = 1, color = "currentColor", className = "w-[62%] h-[62%]" }) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  let content;

  if (lv <= 4) {
    const n = Math.min(lv, 3);
    const top = 12 - (n - 1) * 2.5 + 2;
    content = (
      <>
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={CHEVRON(top + i * 5)} />
        ))}
        {lv === 4 && <path d="M6 19.5 Q12 22.5 18 19.5" />}
      </>
    );
  } else if (lv <= 7) {
    const n = lv === 5 ? 1 : 2;
    content = Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? 10.25 : 6.5 + i * 7.5;
      return <rect key={i} x={x} y="4" width="3.5" height="16" rx="0.6" fill="currentColor" stroke="none" />;
    });
  } else {
    const n = lv <= 10 ? 1 : lv <= 15 ? 2 : 3;
    const positions = n === 1 ? [[12, 12, 7]] : n === 2 ? [[7.5, 12, 4.6], [16.5, 12, 4.6]] : [[12, 7.5, 4.2], [6.8, 15.5, 4.2], [17.2, 15.5, 4.2]];
    content = positions.map(([cx, cy, r], i) => <Star key={i} cx={cx} cy={cy} r={r} />);
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}
