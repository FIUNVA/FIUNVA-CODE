/* ============================================================
   CONTOUR POINTS (P0, P1, P2 ...) — the literal vertex sequence the
   program visits along the finish (G70) contour, starting from the
   origin P0 (0,0), one marker per G-code block in order.
   ============================================================ */
function extractContourPoints(result) {
  const finishEvents = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'finish');
  if (!finishEvents.length) return [];
  const pts = [{ z: 0, x: 0, label: 'P0', spindleDir: finishEvents[0].spindleDir }];
  finishEvents.forEach((ev) => {
    const last = ev.segment.points[ev.segment.points.length - 1];
    // The declared contract is one marker per program block, but a block that lands
    // exactly where an earlier one already did only stacks a second dot (and a
    // second label) on the first: the lead-in rapid and the first feed can share an
    // endpoint, and a contour that closes back onto the origin lands on P0. Coincident
    // points are the same vertex, so the series keeps one marker for them.
    const dup = pts.some(p => Math.abs(last.z - p.z) <= 1e-6 && Math.abs(last.x - p.x) <= 1e-6);
    if (dup) return;
    // Numbering from pts.length (not the event index) so skipping one leaves no
    // gap in the series.
    pts.push({ z: last.z, x: last.x, label: 'P' + pts.length, spindleDir: ev.spindleDir });
  });
  return pts;
}

/* Lay the contour labels out so none of them can overlap, given the dots they
   belong to. Works in the "outward coordinate" — each label's distance from the
   axis measured along its OWN side of it — so a label can only ever be pushed
   further out, never inboard: a label moved toward the axis would land on top of
   its own dot and back under the material it annotates. */
function placeContourLabels(marks, labelH) {
  const near = (a, b) => marks[a].out === marks[b].out
    && Math.abs(marks[a].z - marks[b].z) < (marks[a].w + marks[b].w) / 2;
  // A crowded run of markers is laid out as one unit: nudging each label in turn
  // cascades, because every label it moves becomes the obstacle for the next one.
  // Runs are the connected components of the "close enough in Z to collide" graph.
  // Labels on opposite sides of the axis never meet, so they are never in a run.
  const seen = marks.map(() => false);
  marks.forEach((m, i) => {
    if (seen[i]) return;
    const run = [i];
    seen[i] = true;
    for (let n = 0; n < run.length; n++) {
      marks.forEach((_, j) => {
        if (seen[j] || !near(run[n], j)) return;
        seen[j] = true;
        run.push(j);
      });
    }
    if (run.length < 2) return;
    // In ascending order, so one forward sweep is the minimal spread: each label
    // sits at its own position unless the one inboard of it is already in the way.
    // Laying the run out from the axis outwards is what keeps the label nearest the
    // surface where it belongs and absorbs the crowding on the outermost one.
    run.sort((a, b) => marks[a].nat - marks[b].nat);
    for (let n = 0; n < run.length; n++) marks[run[n]].o = marks[run[n]].nat;
    for (let n = 1; n < run.length; n++) {
      const prev = marks[run[n - 1]];
      marks[run[n]].o = Math.max(marks[run[n]].o, prev.o + labelH);
    }
  });
  return marks;
}

function renderContourPoints(world, result, vb) {
  const SC = scaleOf(vb);
  const g = svgEl('g', { id: 'contourPointsGroup', class: 'contourPoints' });
  g.style.display = showContourPoints ? '' : 'none';
  world.appendChild(g);
  const pts = extractContourPoints(result);
  if (pts.length < 2) return;
  const dr = pts.map(p => displayPoint(p, p.spindleDir));
  const r = Math.max(SC.u * 0.9, 0.35);
  // The text is not rotated here, so what a label occupies along Z is its own width
  // and along Y its glyph height — the same box the radius callouts test, so a
  // three-character "P10" is not treated as if it were one glyph wide. Two labels
  // only collide when they overlap in BOTH axes, which is why the Z test below uses
  // the width and only then demands a full glyph height of clearance in Y.
  const labelH = SC.fontXs * 0.85;
  const marks = dr.map((p, i) => {
    // Outward, away from the axis. In display space +Y is the lower half, so the
    // label follows the sign of its own point instead of always sitting above it,
    // where it used to land inside the material and under the callouts.
    const out = Math.sign(p.x) || 1;
    const nat = out * p.x + r * 2.2;
    return { z: p.z, x: p.x, out, nat, o: nat, w: pts[i].label.length * SC.fontXs * 0.62 };
  });
  placeContourLabels(marks, labelH);
  marks.forEach((m, i) => {
    g.appendChild(svgEl('circle', { class: 'contourDot', cx: m.z, cy: m.x, r }));
    const label = svgEl('text', { class: 'contourLabel', 'font-size': SC.fontXs, x: m.z, y: m.out * m.o, 'text-anchor': 'middle' });
    label.textContent = pts[i].label;
    g.appendChild(label);
  });
}

function appendDiameterAndRadiusDimensions(g, features, vb) {
  const SC = scaleOf(vb);
  const { diameters, radii } = features;
  const arrowSize = Math.max(SC.u * 1.5, 0.6);
  // A stepped shaft stacks several diameter callouts along the same axis. The text
  // is rotated, so what it occupies ALONG Z is its glyph height, not the length of
  // the string — a label is about 0.9 font-xs wide once turned on its side. Gapping
  // them by the string length instead dragged callouts several mm off their own
  // line and fired on the G72 example, where the closest pair is 7 mm apart. Z0 is
  // on the right and -Z to the left, and the glyph body grows toward -X, so the text
  // already sits to the LEFT of its line by the offset below.
  const labelGap = SC.fontXs * 1.2;
  const placed = diameters
    .map(dm => ({ dm, zLabel: (dm.z0 + dm.z1) / 2 - (SC.font * 0.8) / 3 }))
    .sort((a, b) => a.zLabel - b.zLabel);
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].zLabel - placed[i - 1].zLabel < labelGap) placed[i].zLabel = placed[i - 1].zLabel + labelGap;
  }
  placed.forEach(({ dm, zLabel }) => {
    const zMid = (dm.z0 + dm.z1) / 2;
    const half = dm.diameter / 2;
    g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: zMid, y1: -half, x2: zMid, y2: half }));
    g.appendChild(arrowHead(zMid, -half, 0, -1, arrowSize, 'dimArrowHead'));
    g.appendChild(arrowHead(zMid, half, 0, 1, arrowSize, 'dimArrowHead'));
    const label = svgEl('text', { class: 'dimText2', 'font-size': SC.fontXs, x: zLabel, y: 0, 'text-anchor': 'middle', transform: `rotate(-90 ${zLabel} 0)` });
    label.textContent = `Ø${dm.diameter.toFixed(1)}`;
    g.appendChild(label);
  });
  // Radius callouts. The plain 45° leader is the normal form and most radii keep it;
  // the horizontal shelf is a last resort. The old rule pushed to a fixed
  // fontXs*3.4 apart, which fired on the Ej. 3's R1.5 and R2 even though they never
  // overlapped: they are 7.25 mm apart along Z but also 4.5 mm apart in height, and
  // two labels at different heights read fine side by side. So the test is now a real
  // overlap check — both distances short — using the same text-width estimate the CNC
  // rows below already use.
  const pzRadius = Math.max(SC.u * 2.2, 0.75);
  const baseLeader = pzRadius * 4;
  const MAX_LEADER = baseLeader * 2;  // past this, stop lengthening and shelve instead
  const labelH = SC.fontXs * 0.8;
  const K = Math.SQRT1_2;
  const sortedRadii = radii.slice().sort((a, b) => a.mid.z - b.mid.z);
  let prev = null;                    // { z, x, w } of the previous label
  sortedRadii.forEach((rd) => {
    const rVal = rd.r % 1 === 0 ? rd.r.toFixed(0) : rd.r.toFixed(1);
    const text = `R${rVal}`;
    const w = text.length * SC.fontXs * 0.62;
    const tip = { z: rd.mid.z, x: -Math.abs(rd.mid.x) };
    let leader = baseLeader;
    let tail = { z: tip.z + leader * K, x: tip.x - leader * K };
    const hits = l => !!prev && Math.abs(l.z - prev.z) < (w + prev.w) / 2 && Math.abs(l.x - prev.x) < labelH;
    if (hits(tail)) {
      // Lengthen the SAME 45° leader. Its tail travels right and down together, and
      // the extra drop usually separates the two labels in height as well.
      leader = Math.min(MAX_LEADER, leader + ((w + prev.w) / 2 - (tail.z - prev.z)) / K);
      tail = { z: tip.z + leader * K, x: tip.x - leader * K };
    }
    let shelf = null;
    if (hits(tail)) {
      // Last resort: the composite. The shelf carries the label clear, and the label
      // sits at the MIDPOINT of the run so the line passes under the whole text
      // instead of stopping short of it.
      shelf = prev.z + (w + prev.w) / 2;
      g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: tail.z, y1: tail.x, x2: shelf, y2: tail.x }));
      tail.z = (tail.z + shelf) / 2;
    }
    g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: tail.z, y1: tail.x, x2: tip.z, y2: tip.x }));
    g.appendChild(arrowHead(tip.z, tip.x, -K, K, arrowSize, 'dimArrowHead'));
    const label = svgEl('text', { class: 'dimText2', 'font-size': SC.fontXs, x: tail.z, y: tail.x - SC.font * 0.6, 'text-anchor': 'middle' });
    label.textContent = text;
    g.appendChild(label);
    prev = { z: tail.z, x: tail.x, w };
  });
}

function renderDimensionOverlay(world, result, vb) {
  const SC = scaleOf(vb);
  const features = extractDimensionFeatures(result);
  const arrowSize = Math.max(SC.u * 1.5, 0.6);
  const conventional = svgEl('g', { id: 'dimOverlayGroup', class: 'dimOverlay' });
  conventional.style.display = showDimensions ? '' : 'none';
  world.appendChild(conventional);
  appendDiameterAndRadiusDimensions(conventional, features, vb);
  const tierY = vb.featureLenY;
  features.lengths.forEach((l) => {
    const z0 = Math.min(l.z0, l.z1), z1 = Math.max(l.z0, l.z1);
    conventional.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: z0, y1: tierY, x2: z1, y2: tierY }));
    conventional.appendChild(arrowHead(z0, tierY, -1, 0, arrowSize, 'dimArrowHead'));
    conventional.appendChild(arrowHead(z1, tierY, 1, 0, arrowSize, 'dimArrowHead'));
    conventional.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: z0, y1: 0, x2: z0, y2: tierY }));
    conventional.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: z1, y1: 0, x2: z1, y2: tierY }));
    const label = svgEl('text', { class: 'dimText2', 'font-size': SC.fontXs, x: (z0 + z1) / 2, y: tierY + SC.font * 1.3, 'text-anchor': 'middle' });
    label.textContent = l.len.toFixed(1);
    conventional.appendChild(label);
  });
  const cnc = svgEl('g', { id: 'cncDimOverlayGroup', class: 'dimOverlay cncDimOverlay' });
  cnc.style.display = showCncDimensions ? '' : 'none';
  world.appendChild(cnc);
  appendDiameterAndRadiusDimensions(cnc, features, vb);
  extractCncZPositions(result).forEach((position, index) => {
    const y = vb.cncFirstY + index * vb.rowGap;
    const z = position.z;
    const value = position.magnitude.toFixed(1);
    const span = Math.abs(z);
    const estimatedTextWidth = value.length * SC.fontXs * 0.62;
    const useExterior = index === 0 && span < estimatedTextWidth + arrowSize * 2.4;
    const left = Math.min(0, z);
    const right = Math.max(0, z);
    const exteriorRun = arrowSize * 2.2;
    cnc.appendChild(svgEl('line', {
      class: 'dimLine2', 'stroke-width': SC.hair,
      x1: useExterior ? left - exteriorRun : left,
      y1: y,
      x2: useExterior ? right + exteriorRun : right,
      y2: y,
    }));
    if (useExterior) {
      cnc.appendChild(arrowHead(left, y, 1, 0, arrowSize, 'dimArrowHead'));
      cnc.appendChild(arrowHead(right, y, -1, 0, arrowSize, 'dimArrowHead'));
    } else {
      cnc.appendChild(arrowHead(left, y, -1, 0, arrowSize, 'dimArrowHead'));
      cnc.appendChild(arrowHead(right, y, 1, 0, arrowSize, 'dimArrowHead'));
    }
    cnc.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: 0, y1: 0, x2: 0, y2: y }));
    cnc.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: z, y1: 0, x2: z, y2: y }));
    const label = svgEl('text', {
      class: 'dimText2',
      'font-size': SC.fontXs,
      x: useExterior ? right + exteriorRun + SC.fontXs * 0.55 : (left + right) / 2,
      y: useExterior ? y + SC.fontXs * 0.35 : y - SC.fontXs * 0.55,
      'text-anchor': useExterior ? 'start' : 'middle',
    });
    label.textContent = value;
    cnc.appendChild(label);
  });
}
function toggleLayer(id, visible) {
  const g = document.getElementById(id);
  if (g) g.style.display = visible ? '' : 'none';
}
el.chkDims.addEventListener('change', () => {
  showDimensions = el.chkDims.checked;
  if (showDimensions) {
    showCncDimensions = false;
    el.chkCncDims.checked = false;
  }
  toggleLayer('dimOverlayGroup', showDimensions);
  toggleLayer('totalLengthGroup', showDimensions);
  toggleLayer('cncDimOverlayGroup', false);
  applyAxisLabelMode();
});
el.chkCncDims.addEventListener('change', () => {
  showCncDimensions = el.chkCncDims.checked;
  if (showCncDimensions) {
    showDimensions = false;
    el.chkDims.checked = false;
  }
  toggleLayer('cncDimOverlayGroup', showCncDimensions);
  toggleLayer('dimOverlayGroup', false);
  toggleLayer('totalLengthGroup', false);
  applyAxisLabelMode();
});
el.chkAxes.addEventListener('change', () => {
  showAxes = el.chkAxes.checked;
  toggleLayer('axesGroup', showAxes);
});
el.chkTraces.addEventListener('change', () => {
  showTraces = el.chkTraces.checked;
  toggleLayer('tracesGroup', showTraces);
});
el.chkChuck.addEventListener('change', () => {
  showChuck = el.chkChuck.checked;
  toggleLayer('chuckGroup', showChuck);
});
el.chkBar.addEventListener('change', () => {
  showBar = el.chkBar.checked;
  toggleLayer('stockOutlineEl', showBar);
});
el.chkContourPts.addEventListener('change', () => {
  showContourPoints = el.chkContourPts.checked;
  toggleLayer('contourPointsGroup', showContourPoints);
});
el.chkGrid.addEventListener('change', () => {
  el.viewport.classList.toggle('noGrid', !el.chkGrid.checked);
});
el.chkLightBg.addEventListener('change', () => {
  el.viewport.classList.toggle('lightBg', el.chkLightBg.checked);
});
el.chkPartZero.addEventListener('change', () => {
  showPartZero = el.chkPartZero.checked;
  toggleLayer('partZeroGroup', showPartZero);
});
el.chkFill.addEventListener('change', () => {
  showFill = el.chkFill.checked;
  // "Relleno" controls only the interior shading — the part's outline stays
  // visible either way, so the profile is still readable when it's off.
  const fillEl = document.getElementById('materialFillEl');
  if (fillEl) fillEl.classList.toggle('noFill', !showFill);
});
el.btnViewMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  el.viewMenu.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!el.viewMenu.contains(e.target)) el.viewMenu.classList.remove('open');
});

