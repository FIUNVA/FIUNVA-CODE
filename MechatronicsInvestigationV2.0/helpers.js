export function shadeColor(col, pct) {
  const r = Math.max(0, Math.min(255, parseInt(col.slice(1, 3), 16) + pct));
  const g = Math.max(0, Math.min(255, parseInt(col.slice(3, 5), 16) + pct));
  const b = Math.max(0, Math.min(255, parseInt(col.slice(5, 7), 16) + pct));
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function crewmateSVG(col, size = 48, extra = '') {
  const bc = col;
  const sc = shadeColor(col, -30);
  const vc = '#a8d8f0';
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 48" ${extra}>
    <ellipse cx="20" cy="30" rx="14" ry="16" fill="${bc}"/>
    <ellipse cx="20" cy="30" rx="14" ry="16" fill="none" stroke="${sc}" stroke-width="1.5"/>
    <ellipse cx="20" cy="16" rx="12" ry="13" fill="${bc}"/>
    <ellipse cx="20" cy="16" rx="12" ry="13" fill="none" stroke="${sc}" stroke-width="1.5"/>
    <ellipse cx="20" cy="14" rx="8" ry="8" fill="${vc}" opacity="0.9"/>
    <ellipse cx="17" cy="12" rx="2.5" ry="2" fill="white" opacity="0.6"/>
    <rect x="31" y="22" width="7" height="10" rx="2" fill="${sc}"/>
    <ellipse cx="14" cy="45" rx="5" ry="3" fill="${sc}"/>
    <ellipse cx="26" cy="45" rx="5" ry="3" fill="${sc}"/>
  </svg>`;
}
