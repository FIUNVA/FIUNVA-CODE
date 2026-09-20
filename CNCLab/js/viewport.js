/* ============================================================
   VIEWPORT / WORLD -> SVG MAPPING
   The SVG viewBox is defined directly in world (mm) units, with
   z as the horizontal axis and x as the vertical axis — no manual
   pixel-scale math needed, the SVG engine does the scaling.
   ============================================================ */
function computeViewBox(bounds, g71StockMag) {
  // The stock diameter reflects what the G71 cycle is actually machining
  // (the finish contour's own extent), never an oversized clearance value
  // used only for the initial facing approach — but the viewport itself
  // still needs to be tall enough to show that approach without clipping it.
  const stockMag = Math.max(g71StockMag || bounds.maxAbsX, 4);
  const framingMag = Math.max(stockMag, bounds.maxAbsX);
  // The modeled cylinder spans exactly the material the program actually cuts —
  // its right edge coincides with "cero pieza" (Z0) and its left edge with the
  // deepest programmed cut, with no arbitrary extra stock drawn on either side.
  const zDeepEnd = bounds.minZFeed;
  const zFaceStart = Math.max(bounds.maxZFeed, 0);
  const stockZLeft = zDeepEnd;
  const stockZRight = zFaceStart;
  const stockLen = Math.max(stockZRight - stockZLeft, 5);

  // Viewport-only padding (never part of the stock shape itself): room for
  // the chuck graphic on the left, and for approach/facing rapids, labels
  // and dimension tiers on the right.
  const chuckRoom = Math.max(stockLen * 0.34, 20);
  const rightRoom = Math.max(stockLen * 0.30, 10);
  const viewZmin = stockZLeft - chuckRoom;
  const viewZmax = stockZRight + rightRoom;
  const zSpan = viewZmax - viewZmin;

  // Reserve two dimension "tiers" below the part (overall length, then the
  // per-feature breakdown from "Ver medidas") so their lines/labels always
  // land INSIDE the viewBox instead of being silently clipped. The scale
  // unit is estimated from the Z-span alone first (font/tier sizes would
  // otherwise depend on xHalf, which depends on how much room they need).
  const partHalf = Math.max(framingMag * 1.18, 6);
  const uEst = zSpan / 120;
  const fontEst = Math.max(uEst * 3.2, 1.3);
  const tierGap = Math.max(partHalf * 0.033, fontEst * 0.6);
  // The per-feature Z lengths ("Ver medidas") sit closer to the part; the
  // overall stock-length summary sits further out. Their labels are drawn
  // BELOW their own line, so the gap between the two tiers has to clear a
  // full line of text or the blue numbers land on top of the grey L line.
  const featureLenY = partHalf + tierGap / 2;
  const totalLenY = featureLenY + Math.max(tierGap, fontEst * 2.4);
  const xHalf = totalLenY + fontEst * 2.2;

  // Final reference "unit" the whole drawing's stroke widths, font sizes and
  // tick/offset lengths scale from, so a tiny part and a huge one both
  // render with proportionate, legible linework.
  const u = Math.max(zSpan, xHalf * 2) / 120;

  return {
    stockMag, zDeepEnd, zFaceStart, stockZLeft, stockZRight, stockLen,
    viewZmin, viewZmax, xHalf, partHalf, totalLenY, featureLenY, u,
  };
}

function scaleOf(vb) {
  const u = vb.u;
  return {
    u,
    hair: Math.max(u * 0.28, 0.12),
    thin: Math.max(u * 0.45, 0.18),
    normal: Math.max(u * 0.75, 0.28),
    bold: Math.max(u * 1.15, 0.45),
    fontXs: Math.max(u * 2.6, 1.05),
    font: Math.max(u * 3.2, 1.3),
    fontLg: Math.max(u * 4.2, 1.7),
    tick: Math.max(u * 1.6, 0.7),
  };
}

function pathFromPoints(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].z.toFixed(3)} ${pts[0].x.toFixed(3)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].z.toFixed(3)} ${pts[i].x.toFixed(3)}`;
  return d;
}

/* Draws a small triangular arrowhead with its TIP at (tipX,tipY), pointing
   in the direction (dirX,dirY) (a unit vector) — used for arrow-style
   engineering dimension lines (diameters, lengths). */
function arrowHead(tipX, tipY, dirX, dirY, size, cls) {
  const backX = tipX - dirX * size, backY = tipY - dirY * size;
  const perpX = -dirY * size * 0.42, perpY = dirX * size * 0.42;
  const pts = `${tipX},${tipY} ${(backX + perpX).toFixed(3)},${(backY + perpY).toFixed(3)} ${(backX - perpX).toFixed(3)},${(backY - perpY).toFixed(3)}`;
  return svgEl('polygon', { points: pts, class: cls || 'dimArrowHead' });
}

/* ---------- Display-sign convention: M03 (CW) cuts below centerline,
   M04 (CCW) cuts above it — the standard teaching convention for a
   front-mounted, right-hand-tooled lathe. This is purely a screen-space
   choice (it never touches the underlying stored coordinates) so the
   mirrored stock silhouette, which represents the full body of
   revolution, is unaffected and always shows both halves regardless. ---------- */
function displaySign(spindleDir) { return spindleDir === 'ccw' ? -1 : 1; }
function toDisplayPoints(points, spindleDir) {
  const s = displaySign(spindleDir);
  return points.map(p => ({ z: p.z, x: s * Math.abs(p.x) }));
}
function displayPoint(p, spindleDir) {
  const s = displaySign(spindleDir);
  return { z: p.z, x: s * Math.abs(p.x) };
}
/* The finished part is a body of revolution: a pass cut at any Z is visible
   all the way around the circumference, so every trace line is drawn on
   BOTH sides of centerline equally (never just the M03/M04-implied side —
   that convention only applies to the single tool marker, which represents
   one literal instantaneous position). */
function mirrorPointsBoth(points) {
  const top = points.map(p => ({ z: p.z, x: -Math.abs(p.x) }));
  const bottom = points.map(p => ({ z: p.z, x: Math.abs(p.x) }));
  return [top, bottom];
}

/* ---------- Material heightmap (progressive stock removal) ---------- */
// Sample density scaled to the part's length so a small feature (a 2 mm
// radius on a 60 mm part) still gets plenty of samples across it — a fixed
// count made short arcs and tapers look broken or subtly slanted.
function heightmapSamples(vb) {
  return Math.max(800, Math.min(4000, Math.round(vb.stockLen * 40)));
}

function makeHeightmap(vb, samples) {
  const n = samples;
  const zs = new Array(n + 1);
  const mag = new Array(n + 1).fill(vb.stockMag);
  for (let i = 0; i <= n; i++) zs[i] = vb.stockZRight - (i / n) * (vb.stockZRight - vb.stockZLeft);
  return { zs, mag, vb, riserMap: new Map() };
}

// Records an EXACT vertical step (a real shoulder or facing wall) at its
// precise Z — used instead of guessing steps from sampled magnitude jumps,
// which can misfire on a merely steep-but-continuous arc and tear the
// rendered outline open right where it should stay closed.
function recordRiser(hm, z, mag) {
  const key = z.toFixed(6);
  const existing = hm.riserMap.get(key);
  if (existing === undefined || mag < existing) hm.riserMap.set(key, mag);
}

function applyFeedToHeightmap(hm, points) {
  const n = hm.zs.length - 1;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    const zLo = Math.min(a.z, b.z), zHi = Math.max(a.z, b.z);
    if (Math.abs(a.z - b.z) < 1e-6) {
      // Constant-Z sweep (a facing or shoulder face). If it reaches all the way
      // to the axis it's a true FACING cut: physically, nothing remains at this
      // Z or anywhere further toward +Z (the excess stock beyond the face is
      // fully removed, not just notched) — clear that whole range. A shoulder
      // face that stops partway (doesn't reach the axis) only changes the
      // boundary at its own single Z position; material further out in +Z
      // belongs to a different, already-established feature and must stay.
      const rOuter = Math.max(Math.abs(a.x), Math.abs(b.x));
      const rInner = Math.min(Math.abs(a.x), Math.abs(b.x));
      const reachesAxis = rInner < 0.15;
      if (reachesAxis) {
        for (let i = 0; i <= n; i++) {
          if (hm.zs[i] >= a.z - 1e-6) hm.mag[i] = Math.min(hm.mag[i], rInner);
        }
        recordRiser(hm, a.z, rInner);
      } else {
        let idx = Math.round(((hm.vb.stockZRight - a.z) / (hm.vb.stockZRight - hm.vb.stockZLeft)) * n);
        idx = Math.max(0, Math.min(n, idx));
        hm.mag[idx] = Math.min(hm.mag[idx], rOuter);
        recordRiser(hm, a.z, rOuter);
      }
      continue;
    }
    for (let i = 0; i <= n; i++) {
      const z = hm.zs[i];
      if (z < zLo - 1e-6 || z > zHi + 1e-6) continue;
      const t = (z - a.z) / (b.z - a.z);
      const xAt = a.x + t * (b.x - a.x);
      hm.mag[i] = Math.min(hm.mag[i], Math.abs(xAt));
    }
  }
}

function heightmapToSilhouettePath(hm) {
  const n = hm.zs.length - 1;
  // Merge in the EXACT recorded risers (real shoulders/facing walls) so they
  // render as true vertical steps at their real Z, instead of inferring
  // steps from sampled magnitude jumps (which risked misfiring on a merely
  // steep, continuous arc and opening a gap in the outline).
  const risers = [...hm.riserMap.entries()]
    .map(([k, v]) => ({ z: parseFloat(k), mag: v }))
    .sort((a, b) => b.z - a.z); // descending, matching hm.zs order (zs[0] is most +Z)
  let ri = 0;
  const pts = [{ z: hm.zs[0], mag: hm.mag[0] }];
  for (let i = 1; i <= n; i++) {
    // Push this sample's own profile value FIRST, then raise the wall from
    // it. Emitting the riser before the sample produced a zig-zag (out, back
    // in, out again) at every shoulder — the wall must start from the profile
    // value actually reached at that Z, not from the previous sample's.
    pts.push({ z: hm.zs[i], mag: hm.mag[i] });
    while (ri < risers.length && risers[ri].z <= hm.zs[i - 1] + 1e-6 && risers[ri].z >= hm.zs[i] - 1e-6) {
      pts.push({ z: risers[ri].z, mag: risers[ri].mag });
      ri++;
    }
  }
  let d = `M ${pts[0].z.toFixed(3)} ${(-pts[0].mag).toFixed(3)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].z.toFixed(3)} ${(-pts[i].mag).toFixed(3)}`;
  for (let i = pts.length - 1; i >= 0; i--) d += ` L ${pts[i].z.toFixed(3)} ${pts[i].mag.toFixed(3)}`;
  d += ' Z';
  return d;
}

/* ---------- Static scene scaffolding shared by preview & simulation ---------- */
function buildBaseScene(vb) {
  el.svg.innerHTML = '';
  // the drawn Z axis extends past viewZmin (see zAxisMin below), so the
  // viewBox has to start there or the axis and its -Z label get clipped
  const vbLeft = vb.viewZmin - (vb.viewZmax - vb.viewZmin) * 0.12;
  el.svg.setAttribute('viewBox', `${vbLeft} ${-vb.xHalf} ${vb.viewZmax - vbLeft} ${vb.xHalf * 2}`);
  const SC = scaleOf(vb);

  const defs = svgEl('defs');
  const pattern = svgEl('pattern', { id: 'chuckHatch', width: SC.u * 3, height: SC.u * 3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  const hatchLine = svgEl('line', { x1: 0, y1: 0, x2: 0, y2: SC.u * 3, stroke: '#2a4038', 'stroke-width': SC.hair });
  pattern.appendChild(hatchLine);
  defs.appendChild(pattern);
  // vertical gradient across the diametral (X) axis suggesting the roundness
  // of the revolved solid — light at the "equator" line, darker toward each edge.
  const grad = svgEl('linearGradient', { id: 'materialGradient', x1: 0, y1: 0, x2: 0, y2: 1 });
  const stops = [
    [0, '#22322d'], [0.28, '#4a635a'], [0.5, '#6b8a7d'], [0.72, '#4a635a'], [1, '#22322d'],
  ];
  for (const [off, col] of stops) grad.appendChild(svgEl('stop', { offset: off, 'stop-color': col }));
  defs.appendChild(grad);
  el.svg.appendChild(defs);

  const world = svgEl('g', { id: 'worldGroup' });
  world._SC = SC;
  el.svg.appendChild(world);

  // centerline (Z axis) and a matching X-axis reference line, both dashed,
  // spanning the whole view and labeled at both ends — oriented with
  // respect to the machine reference (cero máquina / home) direction.
  const axesGroup = svgEl('g', { id: 'axesGroup' });
  axesGroup.style.display = showAxes ? '' : 'none';
  // The Z axis runs well past the deep (-Z) end of the part so the direction
  // and its label read clearly beyond the chuck.
  const zAxisMin = vb.viewZmin - (vb.viewZmax - vb.viewZmin) * 0.12;
  axesGroup.appendChild(svgEl('line', { class: 'centerline', 'stroke-width': SC.hair, x1: zAxisMin, y1: 0, x2: vb.viewZmax, y2: 0 }));
  const xAxisZ = 0; // coincides with cero pieza (X0 Z0)
  axesGroup.appendChild(svgEl('line', { class: 'centerline', 'stroke-width': SC.hair, x1: xAxisZ, y1: -vb.xHalf, x2: xAxisZ, y2: vb.xHalf }));
  world.appendChild(axesGroup);

  // chuck body (hatched block behind the clamped end of the stock)
  const chuckGroup = svgEl('g', { id: 'chuckGroup' });
  chuckGroup.style.display = showChuck ? '' : 'none';
  const chuckW = Math.max((vb.stockZRight - vb.stockZLeft) * 0.22, 8);
  const chuckH = vb.stockMag * 1.85;
  chuckGroup.appendChild(svgEl('rect', {
    class: 'chuckJaw', 'stroke-width': SC.thin, x: vb.stockZLeft - chuckW, y: -chuckH / 2, width: chuckW, height: chuckH, fill: 'url(#chuckHatch)',
  }));
  // three simple jaw fingers gripping the stock
  for (const frac of [-0.62, 0, 0.62]) {
    chuckGroup.appendChild(svgEl('rect', {
      class: 'chuckJaw', 'stroke-width': SC.thin, x: vb.stockZLeft - 1, y: frac * vb.stockMag - vb.stockMag * 0.16,
      width: chuckW * 0.35 + 1, height: vb.stockMag * 0.32,
    }));
  }
  world.appendChild(chuckGroup);

  // raw stock ghost outline
  const sx = vb.stockMag;
  const stockPath = `M ${vb.stockZLeft} ${-sx} L ${vb.stockZRight} ${-sx} L ${vb.stockZRight} ${sx} L ${vb.stockZLeft} ${sx} Z`;
  const stockOutlineEl = svgEl('path', { id: 'stockOutlineEl', class: 'stockOutline', 'stroke-width': SC.thin, d: stockPath });
  stockOutlineEl.style.display = showBar ? '' : 'none';
  world.appendChild(stockOutlineEl);

  // axis labels — both ends of each axis line
  const zPlus = svgEl('text', { class: 'axisLabel', 'font-size': SC.font, x: vb.viewZmax - SC.u * 1, y: -SC.font * 0.6, 'text-anchor': 'end' });
  zPlus.textContent = '+Z';
  axesGroup.appendChild(zPlus);
  const zMinus = svgEl('text', { class: 'axisLabel', 'font-size': SC.font, x: zAxisMin + SC.u * 1, y: -SC.font * 0.6, 'text-anchor': 'start' });
  zMinus.textContent = '-Z';
  axesGroup.appendChild(zMinus);
  const xPlus = svgEl('text', { class: 'axisLabel', 'font-size': SC.font, x: xAxisZ + SC.u * 1, y: -vb.xHalf + SC.font * 1.1, 'text-anchor': 'start' });
  xPlus.textContent = '+X';
  axesGroup.appendChild(xPlus);
  const xMinus = svgEl('text', { class: 'axisLabel', 'font-size': SC.font, x: xAxisZ + SC.u * 1, y: vb.xHalf - SC.font * 0.3, 'text-anchor': 'start' });
  xMinus.textContent = '-X';
  axesGroup.appendChild(xMinus);

  // "Cero pieza" (workpiece zero / program origin) — the standard drafting
  // datum symbol: a circle quartered by a crosshair with two OPPOSITE
  // quadrants filled solid (top-left / bottom-right), the other two open.
  const pz = svgEl('g', { id: 'partZeroGroup', class: 'partZero' });
  pz.style.display = showPartZero ? '' : 'none';
  const pzR = Math.max(SC.u * 2.2, 0.75);
  const pzLine = pzR * 2.6;
  pz.appendChild(svgEl('path', { class: 'partZeroFill', d: `M0,0 L${-pzR},0 A${pzR},${pzR} 0 0,1 0,${-pzR} Z` }));
  pz.appendChild(svgEl('path', { class: 'partZeroFill', d: `M0,0 L${pzR},0 A${pzR},${pzR} 0 0,1 0,${pzR} Z` }));
  pz.appendChild(svgEl('circle', { cx: 0, cy: 0, r: pzR, 'stroke-width': SC.thin }));
  pz.appendChild(svgEl('line', { class: 'zeroAxisH', x1: -pzLine, y1: 0, x2: pzLine, y2: 0, 'stroke-width': SC.hair }));
  pz.appendChild(svgEl('line', { class: 'zeroAxisV', x1: 0, y1: -pzLine, x2: 0, y2: pzLine, 'stroke-width': SC.hair }));
  world.appendChild(pz);

  // overall stock-length dimension (first reserved tier)
  const dimY = vb.totalLenY;
  world.appendChild(svgEl('line', { class: 'dimLine', 'stroke-width': SC.thin, x1: vb.stockZLeft, y1: dimY, x2: vb.stockZRight, y2: dimY }));
  world.appendChild(arrowHead(vb.stockZLeft, dimY, -1, 0, SC.tick * 1.4, 'dimArrowHeadGrey'));
  world.appendChild(arrowHead(vb.stockZRight, dimY, 1, 0, SC.tick * 1.4, 'dimArrowHeadGrey'));
  const dimTxt = svgEl('text', { class: 'dimText', 'font-size': SC.font, x: (vb.stockZLeft + vb.stockZRight) / 2, y: dimY + SC.font * 1.35, 'text-anchor': 'middle' });
  dimTxt.textContent = `L ${vb.stockLen.toFixed(1)} mm`;
  world.appendChild(dimTxt);

  return world;
}

