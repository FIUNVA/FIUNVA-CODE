/* ============================================================
   "VER MEDIDAS" — dimension overlay (diameters + lengths)
   ============================================================ */
let showDimensions = false;
let showCncDimensions = false;
let showAxes = true;
let showTraces = true;
let showFill = true;
let showPartZero = true;
let showChuck = true;
let showBar = true;
let showContourPoints = false;

function extractCncZPositions(result) {
  const finishEvents = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'finish' && ev.segment.type === 'feed');
  const generalEvents = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'general' && ev.segment.type === 'feed');
  const events = finishEvents.length ? finishEvents : generalEvents;
  const positions = [];
  let previousZ = 0;
  events.forEach(ev => {
    const points = ev.segment.points;
    if (!points || points.length < 2) return;
    const endZ = points[points.length - 1].z;
    if (Math.abs(endZ - previousZ) <= 1e-6) return;
    const magnitude = Math.abs(endZ);
    if (magnitude > 1e-6 && !positions.some(item => Math.abs(item.z - endZ) <= 1e-6)) positions.push({ z: endZ, magnitude });
    previousZ = endZ;
  });
  return positions;
}

function extractDimensionFeatures(result) {
  const finishSegs = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'finish' && ev.segment.type === 'feed');
  const generalSegs = result.timeline.filter(ev => ev.kind === 'move' && ev.phase === 'general' && ev.segment.type === 'feed');
  const segs = finishSegs.length ? finishSegs : generalSegs;

  // Radii: read directly off each arc segment (its programmed R, not re-derived
  // from sampled points) — far more reliable than reverse-engineering a radius
  // from a polyline.
  const radii = segs.filter(ev => ev.segment.arc).map(ev => {
    const seg = ev.segment;
    const mid = seg.points[Math.floor(seg.points.length / 2)];
    return { r: seg.r, center: seg.center, mid };
  });

  let pts = [];
  segs.forEach((ev, i) => {
    const p = ev.segment.points;
    pts.push(...(i === 0 ? p : p.slice(1)));
  });
  if (pts.length < 2) return { diameters: [], lengths: [], radii };

  // Same geometry as a second list that KEEPS every segment's first point, tagged
  // with its segment and whether that segment is an arc. The cylinder run detector
  // below needs both: `pts` would make a block look like it starts inside the
  // previous one, and without the arc tag a run drifts into the arc that follows.
  const runPts = [], runSeg = [], runArc = [];
  segs.forEach((ev, i) => {
    ev.segment.points.forEach(pt => { runPts.push(pt); runSeg.push(i); runArc.push(!!ev.segment.arc); });
  });

  const diameters = [];
  if (result.cycleKind === 'G72') {
    // G72: one dimension per linear block of the finishing profile that moves
    // radially, valued from `to.x` — the programmed X already halved to a radius.
    // Exact: no sampling, no arc bleed, no midpoint drift. It also reaches the
    // features a constant-X run structurally cannot see (the shoulder G01 X40.,
    // the taper vertex X30. Z-39.). Arcs and pure-Z blocks never open a dimension
    // of their own, so a diameter that exists only as an arc endpoint is not called
    // out, and a face-off to the axis is not a diameter. z0/z1 span the surface this
    // diameter describes, which centres the callout on the land it lands in.
    // G72 is what makes this necessary: a G71 profile only grows from small to
    // large, so cylinders alone describe it. G72 steps back inward, so the part has
    // to be dimensioned by its programmed values rather than by its silhouette.
    const FACE_MIN = 0.5;
    segs.forEach((ev, i) => {
      const s = ev.segment;
      if (s.arc) return;
      if (Math.abs(s.to.x - s.from.x) <= 1e-6) return;
      if (Math.abs(s.to.x) <= FACE_MIN) return;
      let x = s.to.x, z0 = s.to.z, z1 = s.to.z, landZ = null;
      for (let j = i + 1; j < segs.length; j++) {
        const nx = segs[j].segment;
        // A blend is transparent: it does not end the section, it only softens the
        // step into whatever comes after it.
        if (nx.arc) { landZ = nx.to.z; continue; }
        if (Math.abs(nx.to.x - nx.from.x) <= 1e-6) {          // pure-Z: a cylinder
          z1 = nx.to.z;
          // A SMALLER land is the section's real diameter — the shoulder above it is
          // just the blend's entry, and dimensioning it read Ø23 where the part
          // actually presents a Ø20 cylindrical face. A same-X land only extends.
          if (Math.abs(nx.to.x) < Math.abs(x)) { x = nx.to.x; if (landZ !== null) z0 = landZ; }
          break;
        }
        break;                                                // a radial block ends the section
      }
      if (Math.abs(x) <= FACE_MIN) return;
      diameters.push({ diameter: Math.abs(x) * 2, x, z0, z1 });
    });
  } else {
    // Everything else: constant-X runs, now held inside the block. The old version
    // chained adjacent pairs to the end of the list, so a cylinder followed by an arc
    // absorbed the arc's first samples — they leave the step tangent to the radial
    // direction and stay inside the 0.03 tolerance — and the run's midpoint, and
    // with it the value, drifted into the arc (Ø40 read 39.9, Ø30 read 29.9). A run
    // must start on a linear block and must stop when the next one is an arc;
    // crossing a linear boundary is fine, so a face split in two survives.
    let i = 0;
    while (i < runPts.length - 1) {
      if (runArc[i]) { i++; continue; }
      let j = i;
      while (j + 1 < runPts.length
             && Math.abs(runPts[j + 1].x - runPts[j].x) < 0.03
             && !(runSeg[j + 1] !== runSeg[j] && runArc[j + 1])) j++;
      if (j > i && Math.abs(runPts[j].z - runPts[i].z) > 0.8) {
        const mid = runPts[Math.floor((i + j) / 2)];
        diameters.push({ diameter: Math.abs(mid.x) * 2, x: mid.x, z0: runPts[i].z, z1: runPts[j].z });
      }
      i = Math.max(j, i + 1);
    }
  }

  // Lengths: chain of distances between meaningful direction changes ("corners")
  const corners = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1], b = pts[k], c = pts[k + 1];
    const d1 = Math.hypot(b.z - a.z, b.x - a.x), d2 = Math.hypot(c.z - b.z, c.x - b.x);
    if (d1 < 1e-6 || d2 < 1e-6) continue;
    const ang = Math.abs(Math.atan2(b.x - a.x, b.z - a.z) - Math.atan2(c.x - b.x, c.z - b.z));
    if (ang > 0.12) corners.push(b);
  }
  corners.push(pts[pts.length - 1]);
  const lengths = [];
  for (let k = 0; k < corners.length - 1; k++) {
    const len = Math.abs(corners[k + 1].z - corners[k].z);
    if (len > 0.5) lengths.push({ z0: corners[k].z, z1: corners[k + 1].z, len });
  }
  return { diameters, lengths, radii };
}

