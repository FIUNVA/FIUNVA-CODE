/* ============================================================
   CONTOUR POINTS (P0, P1, P2 ...) — the literal vertex sequence the
   program visits along the finish (G70) contour, starting from the
   origin P0 (0,0), one marker per G-code block in order.
   ============================================================ */
function extractContourPoints(result) {
  const finishEvents = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'finish');
  if (!finishEvents.length) return [];
  const pts = [{ z: 0, x: 0, label: 'P0', spindleDir: finishEvents[0].spindleDir }];
  finishEvents.forEach((ev, i) => {
    const last = ev.segment.points[ev.segment.points.length - 1];
    pts.push({ z: last.z, x: last.x, label: 'P' + (i + 1), spindleDir: ev.spindleDir });
  });
  return pts;
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
  dr.forEach((p, i) => {
    g.appendChild(svgEl('circle', { class: 'contourDot', cx: p.z, cy: p.x, r }));
    const label = svgEl('text', { class: 'contourLabel', 'font-size': SC.fontXs, x: p.z, y: p.x - r * 2.2, 'text-anchor': 'middle' });
    label.textContent = pts[i].label;
    g.appendChild(label);
  });
}

function renderDimensionOverlay(world, result, vb) {
  const SC = scaleOf(vb);
  const g = svgEl('g', { id: 'dimOverlayGroup', class: 'dimOverlay' });
  g.style.display = showDimensions ? '' : 'none';
  world.appendChild(g);
  const { diameters, lengths, radii } = extractDimensionFeatures(result);
  const arrowSize = Math.max(SC.u * 1.5, 0.6);

  // Diameters: an arrow-tipped dimension line spanning the full diametral
  // extent, drawn through the part itself — the label sits directly ON that
  // line, written vertically (matching the line's own orientation).
  diameters.forEach((dm) => {
    const zMid = (dm.z0 + dm.z1) / 2;
    const half = dm.diameter / 2;
    g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: zMid, y1: -half, x2: zMid, y2: half }));
    g.appendChild(arrowHead(zMid, -half, 0, -1, arrowSize, 'dimArrowHead'));
    g.appendChild(arrowHead(zMid, half, 0, 1, arrowSize, 'dimArrowHead'));
    const zLabel = zMid - (SC.font * 1.6) / 3; // to the LEFT of the line, close to it
    const label = svgEl('text', {
      class: 'dimText2', 'font-size': SC.fontXs, x: zLabel, y: 0, 'text-anchor': 'middle',
      transform: `rotate(-90 ${zLabel} 0)`,
    });
    label.textContent = `Ø${dm.diameter.toFixed(1)}`;
    g.appendChild(label);
  });

  // Lengths: arrow-tipped dimension line in the reserved lower tier.
  const tierY = vb.featureLenY;
  lengths.forEach((l) => {
    const z0 = Math.min(l.z0, l.z1), z1 = Math.max(l.z0, l.z1);
    g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: z0, y1: tierY, x2: z1, y2: tierY }));
    g.appendChild(arrowHead(z0, tierY, -1, 0, arrowSize, 'dimArrowHead'));
    g.appendChild(arrowHead(z1, tierY, 1, 0, arrowSize, 'dimArrowHead'));
    g.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: z0, y1: 0, x2: z0, y2: tierY }));
    g.appendChild(svgEl('line', { class: 'dimExt', 'stroke-width': SC.hair, x1: z1, y1: 0, x2: z1, y2: tierY }));
    const label = svgEl('text', { class: 'dimText2', 'font-size': SC.fontXs, x: (z0 + z1) / 2, y: tierY + SC.font * 1.3, 'text-anchor': 'middle' });
    label.textContent = l.len.toFixed(1);
    g.appendChild(label);
  });

  // Radii: a leader from the arc's midpoint (always on the TOP/mirrored
  // profile, regardless of which side M03/M04 puts the live toolpath on)
  // out to an "R#" callout — extended well clear of the part's own outer
  // boundary so the leader and label always read as clearly external.
  // Radii: a 45° leader from the arc's midpoint (always on the TOP/mirrored
  // profile, regardless of which side M03/M04 puts the live toolpath on)
  // out to an "R#" callout. Every leader is the SAME fixed length — twice
  // the diameter of the cero-pieza circle — and stays at exactly 45°;
  // when two labels would collide, the later one is nudged along Z only,
  // which keeps both the angle and the length identical.
  const pzRadius = Math.max(SC.u * 2.2, 0.75); // must match buildBaseScene's pzR
  const leaderLen = pzRadius * 4;              // 2x the circle's DIAMETER
  const minLabelGap = SC.fontXs * 3.4;
  const K = Math.SQRT1_2; // 45°: equal Z and X components
  const sortedRadii = radii.slice().sort((a, b) => a.mid.z - b.mid.z);
  let prevLabelZ = null;
  sortedRadii.forEach((rd) => {
    // The arrow tip is ALWAYS pinned exactly to the arc's true position —
    // never move it for collision avoidance, or the leader stops pointing
    // at the radius it's labeling. The tail sits exactly leaderLen away at
    // 45°, fully determined by the tip (fixed length + fixed angle leaves
    // no freedom to also dodge overlaps here).
    const tip = { z: rd.mid.z, x: -Math.abs(rd.mid.x) };
    const tail = { z: tip.z + leaderLen * K, x: tip.x - leaderLen * K };
    g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: tail.z, y1: tail.x, x2: tip.z, y2: tip.x }));
    g.appendChild(arrowHead(tip.z, tip.x, -K, K, arrowSize, 'dimArrowHead'));

    // Only the LABEL may shift further along Z to avoid overlapping a
    // neighbor — reached via a short horizontal elbow from the fixed tail,
    // so the diagonal leader itself never changes.
    let labelZ = tail.z;
    if (prevLabelZ !== null && labelZ - prevLabelZ < minLabelGap) labelZ = prevLabelZ + minLabelGap;
    prevLabelZ = labelZ;
    if (Math.abs(labelZ - tail.z) > 1e-6) {
      g.appendChild(svgEl('line', { class: 'dimLine2', 'stroke-width': SC.hair, x1: tail.z, y1: tail.x, x2: labelZ, y2: tail.x }));
    }
    const rVal = rd.r % 1 === 0 ? rd.r.toFixed(0) : rd.r.toFixed(1);
    const label = svgEl('text', { class: 'dimText2', 'font-size': SC.fontXs, x: labelZ, y: tail.x - SC.font * 0.6, 'text-anchor': 'middle' });
    label.textContent = `R${rVal}`;
    g.appendChild(label);
  });
}

function toggleLayer(id, visible) {
  const g = document.getElementById(id);
  if (g) g.style.display = visible ? '' : 'none';
}
el.chkDims.addEventListener('change', () => {
  showDimensions = el.chkDims.checked;
  toggleLayer('dimOverlayGroup', showDimensions);
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

