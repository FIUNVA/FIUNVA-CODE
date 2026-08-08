let flowchartRendered = false;

function orbFont() {
  return "font-family='Orbitron,sans-serif'";
}

function monoFont() {
  return "font-family='Share Tech Mono,monospace'";
}

function box(x, y, w, h, col, label, sub = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${col}22" stroke="${col}" stroke-width="1.5"/>
    <text x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle" fill="#c8d8e4" font-size="12" ${monoFont()}>${label}</text>
    ${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" fill="#4a6272" font-size="9" ${monoFont()}>${sub}</text>` : ''}`;
}

function diamond(cx, cy, w, h, col, line1, line2 = '') {
  const hw = w / 2;
  const hh = h / 2;
  return `<polygon points="${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}" fill="${col}22" stroke="${col}" stroke-width="1.5"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${col}" font-size="11" ${monoFont()}>${line1}</text>
    ${line2 ? `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="${col}" font-size="11" ${monoFont()}>${line2}</text>` : ''}`;
}

function oval(cx, cy, rx, ry, col, label) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}22" stroke="${col}" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${col}" font-size="13" font-weight="700" ${orbFont()}>${label}</text>`;
}

function line(x1, y1, x2, y2, col, dash = false) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.5" ${dash ? 'stroke-dasharray="6,4"' : ''} marker-end="url(#marker-${col.slice(1)})"/>`;
}

function markerDefs() {
  return `<defs>
    <marker id="marker-${'f59e0b'}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#f59e0b"/></marker>
    <marker id="marker-${'22c55e'}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#22c55e"/></marker>
    <marker id="marker-${'ef4444'}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#ef4444"/></marker>
    <marker id="marker-${'4a6272'}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#4a6272"/></marker>
  </defs>`;
}

function renderSvg(data) {
  const cx = 380;
  return `
    <rect width="760" height="900" fill="#060a0d"/>
    <defs>
      <pattern id="fg" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0L0 0 0 30" fill="none" stroke="#0e1820" stroke-width="0.5"/>
      </pattern>
    </defs>
    <rect width="760" height="900" fill="url(#fg)" opacity="0.5"/>
    <text x="${cx}" y="28" text-anchor="middle" fill="#f59e0b" font-size="14" font-weight="700" ${orbFont()}>MECHATRONICS CLUE — DIAGRAMA DE FLUJO</text>
    ${oval(cx, 62, 80, 26, '#22c55e', 'INICIO')}
    ${line(cx, 88, cx, 112, '#22c55e')}
    ${box(cx - 140, 114, 280, 52, '#f59e0b', 'SELECCIÓN ALEATORIA DE HISTORIA', 'random() → Historia 1–5')}
    ${line(cx, 166, cx, 194, '#4a6272')}
    ${box(cx - 140, 196, 280, 52, '#38bdf8', 'REPORTE DE INCIDENTE', 'Mostrar contexto y personajes')}
    ${line(cx, 248, cx, 274, '#4a6272')}
    ${box(cx - 140, 276, 280, 52, '#f59e0b', 'INVESTIGAR LOCACIÓN', 'Clic en una zona del mapa')}
    ${line(cx, 328, cx, 354, '#4a6272')}
    ${box(cx - 140, 356, 280, 52, '#4a6272', 'MOSTRAR PISTA', 'Pista caliente ⚡ o fría ◆')}
    ${line(cx - 408, 468, cx - 240, 468, '#ef4444')}
    ${line(cx - 240, 468, cx - 240, 302, '#ef4444')}
    ${line(cx - 240, 302, cx - 140, 302, '#ef4444')}
    <text x="${cx - 175}" y="456" text-anchor="middle" fill="#ef4444" font-size="11" ${monoFont()}>NO</text>
    ${line(cx, 500, cx, 528, '#22c55e')}
    <text x="${cx + 16}" y="520" text-anchor="middle" fill="#22c55e" font-size="11" ${monoFont()}>SÍ</text>
    ${box(cx - 140, 530, 280, 52, '#f59e0b', 'HACER ACUSACIÓN', 'Seleccionar culpable + causa + lugar')}
    ${line(cx, 582, cx, 608, '#4a6272')}
    ${diamond(cx, 642, 220, 64, '#f59e0b', '¿ACUSACIÓN CORRECTA?')}
    ${line(cx - 110, 642, cx - 240, 642, '#22c55e')}
    <text x="${cx - 175}" y="632" text-anchor="middle" fill="#22c55e" font-size="11" ${monoFont()}>SÍ</text>
    ${oval(cx - 240, 802, 90, 28, '#22c55e', 'VICTORIA')}
    <text x="${cx - 240}" y="838" text-anchor="middle" fill="#22c55e" font-size="9" ${monoFont()}>✓ Ver relato completo</text>
    ${line(cx + 110, 642, cx + 240, 642, '#ef4444')}
    <text x="${cx + 155}" y="632" text-anchor="middle" fill="#ef4444" font-size="11" ${monoFont()}>NO</text>
    ${oval(cx + 240, 802, 90, 28, '#ef4444', 'DERROTA')}
    <text x="${cx + 240}" y="838" text-anchor="middle" fill="#ef4444" font-size="9" ${monoFont()}>✗ Ver solución real</text>
    ${line(cx - 240, 830, cx - 240, 876, '#4a6272', true)}
    ${line(cx + 240, 830, cx + 240, 876, '#4a6272', true)}
    ${line(cx, 876, cx, 896, '#4a6272', true)}
    <text x="${cx}" y="893" text-anchor="middle" fill="#4a6272" font-size="9" ${monoFont()}>↺ REINICIAR JUEGO — Nueva historia aleatoria</text>
  `;
}

function buildStoriesTable(data) {
  const rows = data.STORIES.map((s, index) => {
    const culprit = data.CHARS.find((char) => char.id === s.culprit);
    const cause = data.CAUSES.find((item) => item.id === s.cause);
    const location = data.LOCS.find((item) => item.id === s.location);
    return `
      <tr>
        <td><span class="story-num">${['I', 'II', 'III', 'IV', 'V'][index]}</span></td>
        <td>${s.title.split('—')[1]?.trim() || s.title}</td>
        <td><span style="color:${culprit?.col};font-weight:700">${culprit?.icon || ''} ${culprit?.name || '—'}</span><br>
            <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim)">${culprit?.role || ''}</span></td>
        <td>${cause?.icon || ''} ${cause?.name || '—'}<br><span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim)">${cause?.desc.substring(0, 45)}…</span></td>
        <td>${location?.icon || ''} ${location?.name || '—'}</td>
        <td><span style="font-size:11px;border:1px solid ${s.culprit === 'none' ? '#38bdf8' : '#ef4444'};border-radius:3px;padding:2px 6px;color:${s.culprit === 'none' ? '#38bdf8' : '#ef4444'};font-family:Share Tech Mono,monospace">${s.culprit === 'none' ? 'NATURAL' : 'SABOTAJE'}</span></td>
      </tr>`;
  });
  return rows.join('');
}

export function renderFlowchart(data) {
  if (flowchartRendered) {
    return;
  }

  const svg = document.getElementById('flow-svg');
  if (!svg) return;

  svg.innerHTML = `${markerDefs()}${renderSvg(data)}`;
  document.getElementById('stories-tbody').innerHTML = buildStoriesTable(data);
  flowchartRendered = true;
}
