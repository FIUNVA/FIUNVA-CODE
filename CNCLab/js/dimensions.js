/* ============================================================
   "VER MEDIDAS" — dimension overlay (diameters + lengths)
   ============================================================ */
let showDimensions = false;
let showAxes = true;
let showTraces = true;
let showFill = true;
let showPartZero = true;
let showChuck = true;
let showBar = true;
let showContourPoints = false;

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

  // Diameters: runs where X stays ~constant while Z sweeps (an OD turning surface).
  // Group by adjacent-pair tolerance (robust against gradual arc-tail drift near a
  // tangent point) and read the value from the run's midpoint, not its edge.
  const diameters = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i;
    while (j + 1 < pts.length && Math.abs(pts[j + 1].x - pts[j].x) < 0.03) j++;
    if (j > i && Math.abs(pts[j].z - pts[i].z) > 0.8) {
      const mid = pts[Math.floor((i + j) / 2)];
      diameters.push({ diameter: Math.abs(mid.x) * 2, x: mid.x, z0: pts[i].z, z1: pts[j].z });
    }
    i = Math.max(j, i + 1);
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

