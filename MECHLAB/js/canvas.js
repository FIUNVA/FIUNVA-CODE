/* =========================================================================
   Lienzo libre: geometria (extents, recorte a borde, enlaces paralelos)
   ========================================================================= */
function recomputeRectPoints(wall) {
  var w = wall.width / 2, h = wall.height / 2;
  wall.points = [ { x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h } ];
}
function nodeHasBoundaryShape(n) {
  if (n.isWall) return (n.wallType === 'rect' || n.wallType === 'poly') && !!n.points;
  return true;
}
function currentBoundaryPoints(n) {
  if (n.isWall) return (n.wallType === 'rect' || n.wallType === 'poly') ? n.points : null;
  if (n.kind === 'drum') {
    var dw = (n.width || 260) / 2, dh = (n.height || 200) / 2;
    return [ { x: -dw, y: -dh }, { x: dw, y: -dh }, { x: dw, y: dh }, { x: -dw, y: dh } ];
  }
  var he = nodeHalfExtents(n);
  if (state.mode === 'rot') {
    var N = 20, pts = [];
    for (var i = 0; i < N; i++) { var a = (i / N) * 2 * Math.PI; pts.push({ x: he.hw * Math.cos(a), y: he.hh * Math.sin(a) }); }
    return pts;
  }
  return [ { x: -he.hw, y: -he.hh }, { x: he.hw, y: -he.hh }, { x: he.hw, y: he.hh }, { x: -he.hw, y: he.hh } ];
}
function nodeWorldPoints(n, pos) {
  pos = pos || { x: n.x, y: n.y };
  var pts = currentBoundaryPoints(n);
  if (!pts) return null;
  return pts.map(function(p) { return { x: pos.x + p.x, y: pos.y + p.y }; });
}
function projectPointOnSegment(p, a, b) {
  var abx = b.x - a.x, aby = b.y - a.y;
  var len2 = abx * abx + aby * aby || 1e-9;
  var t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t, t: t };
}
function nearestPointOnShapeRaw(node, clickWorldPos, pos) {
  var pts = nodeWorldPoints(node, pos);
  if (!pts || pts.length < 2) return null;
  var best = null;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    var proj = projectPointOnSegment(clickWorldPos, a, b);
    var d = Math.hypot(proj.x - clickWorldPos.x, proj.y - clickWorldPos.y);
    if (!best || d < best.dist) best = { edge: i, t: proj.t, x: proj.x, y: proj.y, dist: d, a: a, b: b };
  }
  return best;
}
function nearestPointOnShape(node, clickWorldPos, pos) {
  var best = nearestPointOnShapeRaw(node, clickWorldPos, pos);
  if (!best) return null;
  var edgeLen = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y) || 1;
  var steps = Math.max(1, Math.round(edgeLen / GRID_SIZE));
  var snappedT = Math.round(best.t * steps) / steps;
  var snappedPt = { x: best.a.x + (best.b.x - best.a.x) * snappedT, y: best.a.y + (best.b.y - best.a.y) * snappedT };
  return { edge: best.edge, t: snappedT, x: snappedPt.x, y: snappedPt.y, dist: Math.hypot(snappedPt.x - clickWorldPos.x, snappedPt.y - clickWorldPos.y) };
}
function anchorWorldPoint(node, anchor, pos) {
  pos = pos || { x: node.x, y: node.y };
  var pts = nodeWorldPoints(node, pos);
  if (!pts || !anchor) return pos;
  var a = pts[anchor.edge], b = pts[(anchor.edge + 1) % pts.length];
  return { x: a.x + (b.x - a.x) * anchor.t, y: a.y + (b.y - a.y) * anchor.t };
}

/* =========================================================================
   Friccion automatica: detecta contacto masa-arista de pared
   ========================================================================= */
function computeContact(mass, wall) {
  var me = nodeHalfExtents(mass);
  if ((wall.wallType === 'rect' || wall.wallType === 'poly') && wall.points) {
    var raw = nearestPointOnShapeRaw(wall, { x: mass.x, y: mass.y });
    if (!raw) return null;
    var threshold = Math.max(me.hw, me.hh) * 1.12;
    if (raw.dist <= threshold) {
      var snapped = nearestPointOnShape(wall, { x: mass.x, y: mass.y });
      return { anchor: { edge: snapped.edge, t: snapped.t } };
    }
    return null;
  }
  var we = nodeHalfExtents(wall);
  var dist = Math.hypot(mass.x - wall.x, mass.y - wall.y);
  if (dist <= (me.hw + we.hw) * 0.85) return { anchor: null };
  return null;
}
function findFrictionDamper(massId, wallId) {
  return state.dampers.find(function(d) { return d.isFriction && ((d.a === massId && d.b === wallId) || (d.a === wallId && d.b === massId)); });
}
function updateAutoFriction() {
  if (state.mode !== 'trans') return;
  var masses = state.nodes.filter(function(n) { return !n.isWall; });
  var walls = state.nodes.filter(function(n) { return n.isWall; });
  if (!masses.length || !walls.length) return;
  masses.forEach(function(m) {
    walls.forEach(function(w) {
      var contact = computeContact(m, w);
      var existing = findFrictionDamper(m.id, w.id);
      if (contact) {
        if (!existing) {
          var d = addDamper(m.id, w.id, null, contact.anchor);
          d.isFriction = true;
          d.val = 0.4;
        } else {
          if (existing.a === w.id) existing.aAnchor = contact.anchor; else existing.bAnchor = contact.anchor;
        }
      } else if (existing) {
        deleteComponent('damper', existing.id);
      }
    });
  });
}
function updateAutoDrumForces() {
  // Compat: la excitacion del cuadro con excentrica ya NO se materializa como
  // fuerza editable; ahora es una entrada virtual generada por drumVirtualForces().
  // Limpiamos cualquier remanente heredado.
  state.forces = state.forces.filter(function(f) { return !f.isDrumForce; });
}

/* =========================================================================
   Fuerzas virtuales del cuadro con excentrica:
   F(t) = m_e * r * omega^2 * cos(omega*t + phi)  aplicada al nodo del cuadro.
   Se anaden como "fuerzas efectivas" para simulacion y funcion de transferencia,
   pero NO se guardan en state.forces (no aparecen en la paleta de fuerzas).
   ========================================================================= */
function drumVirtualForces() {
  if (state.mode !== 'trans') return [];
  var out = [];
  state.nodes.forEach(function(n) {
    if (n.kind !== 'drum') return;
    var m = n.eccMass || 0, r = n.eccRadius || 0, w = n.omega || 0;
    if (m <= 0 || r <= 0 || w <= 0) return;
    out.push({
      id: '__drum_' + n.id,
      nodeId: n.id,
      symbol: 'F_' + n.label + '(t)',
      wave: 'sine',
      amp: m * r * w * w,
      freq: w / (2 * Math.PI),
      phase: n.phase || 0,
      isDrumForce: true,
      drumId: n.id,
      virtual: true
    });
  });
  return out;
}
function effectiveForces() { return state.forces.concat(drumVirtualForces()); }

/* =========================================================================
   Longitudes de reposo y limites para resortes y amortiguadores
   ========================================================================= */
function linkAnchorWorld(link, endpointKey) {
  var isA = endpointKey === 'a';
  var node = getNode(isA ? link.a : link.b);
  if (!node) return null;
  var anchor = isA ? link.aAnchor : link.bAnchor;
  if (anchor && nodeHasBoundaryShape(node)) return anchorWorldPoint(node, anchor);
  return { x: node.x, y: node.y };
}
function linkCurrentDistance(link) {
  var a = linkAnchorWorld(link, 'a'), b = linkAnchorWorld(link, 'b');
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function initLinkRestLength(link) {
  if (!link) return;
  if (link.L0 == null || !isFinite(link.L0) || link.L0 <= 0) {
    var d = linkCurrentDistance(link);
    link.L0 = d > 8 ? d : 160;
  }
  if (link.Lmin == null || !isFinite(link.Lmin)) link.Lmin = Math.max(20, link.L0 * 0.35);
  if (link.Lmax == null || !isFinite(link.Lmax)) link.Lmax = link.L0 * 1.75;
  if (link.Lmin >= link.Lmax) link.Lmin = link.Lmax * 0.4;
}
function pointInPolygon(pt, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    var intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function resolveWallCollisions(massNode) {
  if (!massNode || massNode.isWall) return;
  var me = nodeHalfExtents(massNode);
  var walls = state.nodes.filter(function(n) { return n.isWall && (n.wallType === 'rect' || n.wallType === 'poly') && n.points && n.points.length >= 3; });
  walls.forEach(function(w) {
    var wpts = nodeWorldPoints(w);
    var near = nearestPointOnShapeRaw(w, { x: massNode.x, y: massNode.y });
    if (!near || !wpts) return;
    var dx = massNode.x - near.x, dy = massNode.y - near.y;
    var dist = Math.hypot(dx, dy);
    var inside = pointInPolygon({ x: massNode.x, y: massNode.y }, wpts);
    var dirx, diry;
    if (inside || dist < 1e-6) {
      var ex = near.b.x - near.a.x, ey = near.b.y - near.a.y; var elen = Math.hypot(ex, ey) || 1;
      var nx = -ey / elen, ny = ex / elen;
      var cx = wpts.reduce(function(s,p){return s+p.x;}, 0) / wpts.length;
      var cy = wpts.reduce(function(s,p){return s+p.y;}, 0) / wpts.length;
      var mx = (near.a.x + near.b.x) / 2, my = (near.a.y + near.b.y) / 2;
      var toC = { x: cx - mx, y: cy - my };
      if (toC.x * nx + toC.y * ny > 0) { nx = -nx; ny = -ny; }
      dirx = nx; diry = ny;
      dist = 0;
    } else {
      dirx = dx / dist; diry = dy / dist;
    }
    var requiredDist = 1 / Math.sqrt((dirx / me.hw) * (dirx / me.hw) + (diry / me.hh) * (diry / me.hh));
    if (dist < requiredDist) {
      massNode.x = near.x + dirx * requiredDist;
      massNode.y = near.y + diry * requiredDist;
    }
  });
}
function nodeHalfExtents(n) {
  if (n.isWall) {
    if ((n.wallType === 'rect' || n.wallType === 'poly') && n.points) {
      var xs = n.points.map(function(p){return p.x;}), ys = n.points.map(function(p){return p.y;});
      return { hw: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2, hh: (Math.max.apply(null, ys) - Math.min.apply(null, ys)) / 2 };
    }
    return { hw: 24 * n.size, hh: 24 * n.size };
  }
  if (n.kind === 'drum') { return { hw: (n.width || 260) / 2, hh: (n.height || 200) / 2 }; }
  if (state.mode === 'rot') { var r = 32 * n.size * Math.sqrt(Math.max(n.mass,0.2)) ; r = Math.min(r, 90); r = Math.max(r,20); return { hw: r, hh: r }; }
  var hw = Math.min(70, Math.max(24, 30 * n.size * Math.sqrt(Math.max(n.mass,0.2))));
  var hh = Math.min(80, Math.max(28, 36 * n.size * Math.sqrt(Math.max(n.mass,0.2))));
  return { hw: hw, hh: hh };
}
function ellipseClip(cx, cy, hw, hh, dx, dy) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: cx, y: cy };
  var t = 1 / Math.sqrt((dx / hw) * (dx / hw) + (dy / hh) * (dy / hh));
  return { x: cx + dx * t, y: cy + dy * t };
}
function pairKey(a, b) { return [a, b].sort().join('|'); }
function linksBetween(aId, bId) {
  var key = pairKey(aId, bId);
  var list = [];
  state.springs.forEach(function(s) { if (pairKey(s.a, s.b) === key) list.push({ kind: 'spring', id: s.id }); });
  state.dampers.forEach(function(d) { if (pairKey(d.a, d.b) === key) list.push({ kind: 'damper', id: d.id }); });
  list.sort(function(x, y) { return x.id < y.id ? -1 : 1; });
  return list;
}
function clippedEndpoints(na, nb, kind, linkId, posA, posB, aAnchor, bAnchor) {
  posA = posA || { x: na.x, y: na.y };
  posB = posB || { x: nb.x, y: nb.y };
  var dx = posB.x - posA.x, dy = posB.y - posA.y;
  var p1, p2;
  if (aAnchor && nodeHasBoundaryShape(na)) p1 = anchorWorldPoint(na, aAnchor, posA);
  else { var ha = nodeHalfExtents(na); p1 = ellipseClip(posA.x, posA.y, ha.hw, ha.hh, dx, dy); }
  if (bAnchor && nodeHasBoundaryShape(nb)) p2 = anchorWorldPoint(nb, bAnchor, posB);
  else { var hb = nodeHalfExtents(nb); p2 = ellipseClip(posB.x, posB.y, hb.hw, hb.hh, -dx, -dy); }
  var group = linksBetween(na.id, nb.id);
  var gi = group.findIndex(function(g) { return g.kind === kind && g.id === linkId; });
  var count = group.length;
  if (count > 1 && gi >= 0) {
    var offsetMag = (gi - (count - 1) / 2) * 48;
    var len = Math.hypot(dx, dy) || 1;
    var px = -dy / len, py = dx / len;
    p1 = { x: p1.x + px * offsetMag, y: p1.y + py * offsetMag };
    p2 = { x: p2.x + px * offsetMag, y: p2.y + py * offsetMag };
  }
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}
function clampVisibleLen(link, len) {
  var Lmin = (link && link.Lmin) || 0;
  var Lmax = (link && link.Lmax) || Infinity;
  var lo = Math.max(6, Lmin), hi = Math.max(lo + 4, Lmax);
  return Math.max(lo, Math.min(hi, len));
}
function springPathD(x1, x2, y, coils) {
  coils = coils || 6;
  var span = x2 - x1;
  var lead = Math.min(16, Math.abs(span) * 0.16);
  var bodyStart = x1 + lead, bodyEnd = x2 - lead;
  var bodyLen = bodyEnd - bodyStart;
  var step = bodyLen / coils;
  var amp = 11;
  var d = 'M ' + x1 + ' ' + y + ' L ' + bodyStart + ' ' + y;
  for (var i = 0; i < coils; i++) {
    var cx0 = bodyStart + step * (i + 0.5);
    var yy = (i % 2 === 0) ? (y - amp) : (y + amp);
    d += ' L ' + cx0 + ' ' + yy;
  }
  d += ' L ' + bodyEnd + ' ' + y + ' L ' + x2 + ' ' + y;
  return d;
}
/*
  Amortiguador estilo pistón real:
    - Cilindro (rectángulo) de longitud FIJA anclado a la izquierda.
    - Pistón (línea vertical con brazo T) que se desplaza dentro del cilindro
      según la elongación actual respecto a L0.
    - Rodillo/vástago exterior que conecta el pistón al nodo B.
  Params:
    fullLen  = distancia total pintada entre anclas (después de clamp visual).
    restLen  = longitud natural del amortiguador (L0). Si es null, se usa fullLen.
*/
function damperMarkup(x1, x2, y, color, restLen) {
  var fullLen = x2 - x1;
  var L0 = (restLen && isFinite(restLen) && restLen > 0) ? restLen : fullLen;
  var leadA = Math.min(14, fullLen * 0.10);
  // Cilindro: largo fijo relativo a L0 (independiente de la elongación actual).
  var cylLen = Math.max(28, Math.min(L0 * 0.55, fullLen * 0.85 - leadA - 6));
  var cylX = x1 + leadA;
  var cylEnd = cylX + cylLen;
  var h = 22;
  // Posición del pistón dentro del cilindro: en reposo, centrado.
  // Elongación relativa a L0 desplaza el pistón hacia atrás/adelante.
  var stroke = fullLen - L0; // >0 estirado, <0 comprimido
  var pistonBase = cylX + cylLen * 0.5;
  var pistonX = pistonBase + stroke * 0.5;
  var pistonMin = cylX + 6, pistonMax = cylEnd - 6;
  var clamped = false;
  if (pistonX < pistonMin) { pistonX = pistonMin; clamped = true; }
  if (pistonX > pistonMax) { pistonX = pistonMax; clamped = true; }
  var s = '';
  // rod A -> cilindro
  s += '<line x1="' + x1 + '" y1="' + y + '" x2="' + cylX + '" y2="' + y + '" stroke="' + color + '" stroke-width="2.2"/>';
  // cuerpo cilindro (abierto a la derecha)
  s += '<path d="M ' + cylEnd + ' ' + (y - h/2) + ' L ' + cylX + ' ' + (y - h/2) + ' L ' + cylX + ' ' + (y + h/2) + ' L ' + cylEnd + ' ' + (y + h/2) + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="miter"/>';
  // pistón (T interior): brazo vertical
  s += '<line x1="' + pistonX + '" y1="' + (y - h/2 + 3) + '" x2="' + pistonX + '" y2="' + (y + h/2 - 3) + '" stroke="' + color + '" stroke-width="3"/>';
  // vástago del pistón hacia afuera
  s += '<line x1="' + pistonX + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + color + '" stroke-width="2.4"/>';
  // marcas de tope cuando el pistón golpea el cilindro
  if (clamped) {
    var tx = (pistonX <= pistonMin) ? cylX : cylEnd;
    s += '<line x1="' + tx + '" y1="' + (y - h/2 - 5) + '" x2="' + tx + '" y2="' + (y + h/2 + 5) + '" stroke="var(--red)" stroke-width="2.2"/>';
  }
  return s;
}

/* Dibuja una línea rígida (tope) desde xA hasta xB indicando que se llegó al límite. */
function limitStopMarkup(xA, xB, y, color) {
  if (Math.abs(xB - xA) < 1) return '';
  var s = '<line x1="' + xA + '" y1="' + y + '" x2="' + xB + '" y2="' + y + '" stroke="' + color + '" stroke-width="1.8" stroke-dasharray="3 3" opacity="0.75"/>';
  return s;
}

/* =========================================================================
   Lienzo libre: marcado SVG por componente (colores por tipo)
   ========================================================================= */
function isSelected(type, id) { return state.selected && state.selected.type === type && state.selected.id === id; }
function wallShapeMarkup(n, sel) {
  var color = 'var(--c-wall)';
  var pts = n.points;
  var pathD = 'M ' + pts.map(function(p){ return p.x + ' ' + p.y; }).join(' L ') + ' Z';
  var g = '<path d="' + pathD + '" fill="var(--c-wall-dim)" stroke="' + color + '" stroke-width="2.6"/>';
  var cx = pts.reduce(function(s,p){return s+p.x;},0) / pts.length;
  var cy = pts.reduce(function(s,p){return s+p.y;},0) / pts.length;
  for (var i = 0; i < pts.length; i++) {
    var p1 = pts[i], p2 = pts[(i+1) % pts.length];
    var ex = p2.x - p1.x, ey = p2.y - p1.y; var elen = Math.hypot(ex, ey) || 1;
    var nx = -ey / elen, ny = ex / elen;
    var mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
    var toC = { x: cx-mx, y: cy-my };
    if (toC.x*nx + toC.y*ny > 0) { nx = -nx; ny = -ny; }
    var nTicks = Math.max(2, Math.floor(elen/24));
    for (var k = 0; k <= nTicks; k++) {
      var t = k/nTicks;
      var hx = p1.x + ex*t, hy = p1.y + ey*t;
      g += '<line x1="' + hx + '" y1="' + hy + '" x2="' + (hx+nx*9) + '" y2="' + (hy+ny*9) + '" stroke="' + color + '" stroke-width="1.3" opacity="0.75"/>';
    }
  }
  var xs = pts.map(function(p){return p.x;}), ys = pts.map(function(p){return p.y;});
  var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
  if (sel) g += '<rect x="' + (minx-8) + '" y="' + (miny-8) + '" width="' + (maxx-minx+16) + '" height="' + (maxy-miny+16) + '" rx="6" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
  g += '<text x="' + cx + '" y="' + (cy+4) + '" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10.5">' + n.label + '</text>';
  if (n.wallType === 'rect') g += '<rect data-role="resize" x="' + (maxx-6) + '" y="' + (maxy-6) + '" width="14" height="14" fill="var(--panel)" stroke="' + color + '" stroke-width="1.4" style="cursor:nwse-resize"/>';
  if (sel) g += deleteBadge(maxx + 14, miny - 14, 'node', n.id);
  return g;
}
function deleteBadge(dx, dy, type, id) {
  return '<g data-role="delete" data-comp-type="' + type + '" data-comp-id="' + id + '" transform="translate(' + dx + ',' + dy + ')" style="cursor:pointer;">' +
    '<circle r="10" fill="var(--panel)" stroke="var(--red)" stroke-width="1.6"/>' +
    '<text text-anchor="middle" dy="4" fill="var(--red)" font-size="13" font-family="monospace">&#215;</text>' +
  '</g>';
}

function anchorTickMarkup(n, color) {
  var pts = currentBoundaryPoints(n);
  if (!pts) return '';
  var g = '';
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    var elen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    var steps = Math.max(1, Math.round(elen / GRID_SIZE));
    for (var k = 1; k < steps; k++) {
      var t = k / steps;
      var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      g += '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="' + color + '" opacity="0.5"/>';
    }
  }
  return g;
}
function nodeMarkup(n, pos, angleDeg) {
  var U = UNITS[state.mode];
  pos = pos || { x: n.x, y: n.y };
  var sel = isSelected('node', n.id);
  var g = '<g class="comp" data-comp-type="node" data-comp-id="' + n.id + '" transform="translate(' + pos.x + ',' + pos.y + ')">';
  if (n.isWall) {
    if ((n.wallType === 'rect' || n.wallType === 'poly') && n.points && n.points.length >= 3) {
      g += wallShapeMarkup(n, sel);
    } else {
    var s = 24 * n.size;
    var color = 'var(--c-wall)';
    g += '<line x1="' + (-s) + '" y1="0" x2="' + s + '" y2="0" stroke="' + color + '" stroke-width="3"/>';
    for (var i = -2; i <= 2; i++) { var xx = i * (s * 0.42); g += '<line x1="' + xx + '" y1="0" x2="' + (xx - 8) + '" y2="13" stroke="' + color + '" stroke-width="1.6"/>'; }
    if (sel) g += '<rect x="' + (-s-8) + '" y="-14" width="' + (s*2+16) + '" height="34" rx="6" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
    g += '<text y="30" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10.5">' + n.label + '</text>';
    g += '<rect data-role="resize" x="' + (s-5) + '" y="-5" width="13" height="13" fill="var(--panel)" stroke="' + color + '" stroke-width="1.4" style="cursor:nwse-resize"/>';
    if (sel) g += deleteBadge(s + 14, -14, 'node', n.id);
    }
  } else if (state.mode === 'rot') {
    var r = 32 * n.size * Math.sqrt(Math.max(n.mass,0.2)); r = Math.min(r,90); r = Math.max(r,20);
    var color2 = 'var(--c-mass)';
    g += '<circle r="' + r + '" fill="var(--c-mass-dim)" stroke="' + color2 + '" stroke-width="2.6"/>';
    g += anchorTickMarkup(n, color2);
    if (sel) g += '<circle r="' + (r+7) + '" fill="none" stroke="' + color2 + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
    g += '<g transform="rotate(' + (angleDeg||0) + ')"><line x1="0" y1="0" x2="0" y2="' + (-r+6) + '" stroke="var(--c-force)" stroke-width="2.6"/><circle r="2.6" fill="var(--c-force)"/></g>';
    if (n.eccMass && n.eccMass > 0) {
      var eR = r * 0.72;
      g += '<g transform="rotate(' + (angleDeg||0) + ')">'
        + '<line x1="0" y1="0" x2="0" y2="' + eR + '" stroke="var(--red)" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.55"/>'
        + '<circle cx="0" cy="' + eR + '" r="5.5" fill="var(--red)" stroke="var(--panel)" stroke-width="1.4"/>'
        + '<text x="9" y="' + (eR+4) + '" fill="var(--red)" font-family="monospace" font-size="10">m&middot;e</text>'
        + '</g>';
    }
    g += '<text y="-4" text-anchor="middle" fill="var(--ink)" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="13">' + n.label + '</text>';
    g += '<text y="13" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10">' + fmtNum(n.mass) + ' ' + U.massUnit + '</text>';
    g += '<rect data-role="resize" x="' + (r*0.7-6) + '" y="' + (r*0.7-6) + '" width="14" height="14" fill="var(--panel)" stroke="' + color2 + '" stroke-width="1.5" style="cursor:nwse-resize"/>';
    if (sel) g += deleteBadge(r + 12, -r - 12, 'node', n.id);
  } else if (n.kind === 'drum') {
    var dw = (n.width || 260) / 2, dh = (n.height || 200) / 2;
    var cdrum = 'var(--c-mass)';
    g += '<rect x="' + (-dw) + '" y="' + (-dh) + '" width="' + (dw*2) + '" height="' + (dh*2) + '" rx="8" fill="var(--c-mass-dim)" stroke="' + cdrum + '" stroke-width="2.8"/>';
    g += anchorTickMarkup(n, cdrum);
    if (sel) g += '<rect x="' + (-dw-7) + '" y="' + (-dh-7) + '" width="' + (dw*2+14) + '" height="' + (dh*2+14) + '" rx="10" fill="none" stroke="' + cdrum + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
    var rr = Math.min(dw, dh) * 0.68;
    g += '<circle r="' + rr + '" fill="none" stroke="var(--ink-dim)" stroke-width="1.6" opacity="0.7"/>';
    var drumAng = (angleDeg||0);
    g += '<g transform="rotate(' + drumAng + ')">'
      + '<line x1="0" y1="0" x2="0" y2="' + (-rr) + '" stroke="var(--ink-dim)" stroke-width="1.2" opacity="0.6"/>'
      + '<line x1="0" y1="0" x2="0" y2="' + (rr*0.78) + '" stroke="var(--red)" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.7"/>'
      + '<circle cx="0" cy="' + (rr*0.78) + '" r="6.5" fill="var(--red)" stroke="var(--panel)" stroke-width="1.4"/>'
      + '<text x="10" y="' + (rr*0.78+4) + '" fill="var(--red)" font-family="monospace" font-size="10">m&middot;e</text>'
      + '</g>';
    g += '<text x="0" y="' + (-dh + 14) + '" text-anchor="middle" fill="var(--ink)" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="13">' + n.label + '</text>';
    g += '<text x="0" y="' + (dh - 6) + '" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10">M=' + fmtNum(n.mass) + ' kg &middot; m=' + fmtNum(n.eccMass) + ' kg &middot; r=' + fmtNum(n.eccRadius) + ' m &middot; ' + fmtNum(n.omega/(2*Math.PI)) + ' Hz</text>';
    g += '<rect data-role="resize" x="' + (dw-8) + '" y="' + (dh-8) + '" width="16" height="16" fill="var(--panel)" stroke="' + cdrum + '" stroke-width="1.5" style="cursor:nwse-resize"/>';
    if (sel) g += deleteBadge(dw + 14, -dh - 14, 'node', n.id);
  } else {
    var hw = Math.min(70, Math.max(24, 30 * n.size * Math.sqrt(Math.max(n.mass,0.2))));
    var hh = Math.min(80, Math.max(28, 36 * n.size * Math.sqrt(Math.max(n.mass,0.2))));
    var color3 = 'var(--c-mass)';
    g += '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + (hw*2) + '" height="' + (hh*2) + '" rx="5" fill="var(--c-mass-dim)" stroke="' + color3 + '" stroke-width="2.6"/>';
    g += anchorTickMarkup(n, color3);
    if (sel) g += '<rect x="' + (-hw-7) + '" y="' + (-hh-7) + '" width="' + (hw*2+14) + '" height="' + (hh*2+14) + '" rx="7" fill="none" stroke="' + color3 + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
    g += '<text y="-4" text-anchor="middle" fill="var(--ink)" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="13">' + n.label + '</text>';
    g += '<text y="14" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10.5">' + fmtNum(n.mass) + ' ' + U.massUnit + '</text>';
    g += '<rect data-role="resize" x="' + (hw-7) + '" y="' + (hh-7) + '" width="15" height="15" fill="var(--panel)" stroke="' + color3 + '" stroke-width="1.5" style="cursor:nwse-resize"/>';
    if (sel) g += deleteBadge(hw + 13, -hh - 13, 'node', n.id);
  }
  g += '</g>';
  return g;
}

function springMarkup(s, posMap) {
  var na = getNode(s.a), nb = getNode(s.b);
  if (!na || !nb) return '';
  var pa = posMap[na.id] || { x: na.x, y: na.y }, pb = posMap[nb.id] || { x: nb.x, y: nb.y };
  var pts = clippedEndpoints(na, nb, 'spring', s.id, pa, pb, s.aAnchor, s.bAnchor);
  var rawLen = Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1);
  initLinkRestLength(s);
  var visLen = clampVisibleLen(s, rawLen);
  var angle = Math.atan2(pts.y2 - pts.y1, pts.x2 - pts.x1) * 180 / Math.PI;
  var sel = isSelected('spring', s.id);
  var midx = rawLen / 2;
  var g = '<g class="comp" data-comp-type="spring" data-comp-id="' + s.id + '" transform="translate(' + pts.x1 + ',' + pts.y1 + ') rotate(' + angle + ')">';
  g += '<line x1="0" y1="0" x2="' + rawLen + '" y2="0" stroke="transparent" stroke-width="22" pointer-events="stroke" style="cursor:pointer;"/>';
  // Segmento rígido si estamos fuera de los límites (tope visual)
  if (rawLen > visLen) g += limitStopMarkup(visLen, rawLen, 0, 'var(--red)');
  if (rawLen < visLen) g += limitStopMarkup(rawLen, visLen, 0, 'var(--red)');
  if (sel) g += '<path d="' + springPathD(0, visLen, 0) + '" fill="none" stroke="var(--c-spring)" stroke-width="6" opacity="0.25"/>';
  g += '<path d="' + springPathD(0, visLen, 0) + '" fill="none" stroke="var(--c-spring)" stroke-width="2.6"/>';
  g += '<text x="' + midx + '" y="-16" text-anchor="middle" fill="var(--c-spring)" font-family="monospace" font-size="11" transform="rotate(' + (-angle) + ' ' + midx + ' -16)">K=' + fmtNum(s.k) + '</text>';
  if (sel) g += '<g transform="translate(' + midx + ',-32) rotate(' + (-angle) + ')">' +
      '<circle r="10" fill="var(--panel)" stroke="var(--red)" stroke-width="1.6"/>' +
      '<text text-anchor="middle" dy="4" fill="var(--red)" font-size="13" font-family="monospace">&#215;</text>' +
      '<rect x="-14" y="-14" width="28" height="28" fill="transparent" data-role="delete" data-comp-type="spring" data-comp-id="' + s.id + '" style="cursor:pointer;"/>' +
    '</g>';
  g += '</g>';
  return g;
}
function frictionBadgeMarkup(d, posMap) {
  var na = getNode(d.a), nb = getNode(d.b);
  if (!na || !nb) return '';
  var wallNode = na.isWall ? na : nb;
  var wallIsA = na.isWall;
  var anchor = wallIsA ? d.aAnchor : d.bAnchor;
  var wallPos = posMap[wallNode.id] || { x: wallNode.x, y: wallNode.y };
  var pt = anchor ? anchorWorldPoint(wallNode, anchor, wallPos) : wallPos;
  var nx = 0, ny = 1;
  if (wallNode.points && anchor) {
    var worldPts = nodeWorldPoints(wallNode, wallPos);
    var a = worldPts[anchor.edge], b = worldPts[(anchor.edge + 1) % worldPts.length];
    var ex = b.x - a.x, ey = b.y - a.y; var elen = Math.hypot(ex, ey) || 1;
    nx = -ey / elen; ny = ex / elen;
    var cx = worldPts.reduce(function(s,p){return s+p.x;}, 0) / worldPts.length;
    var cy = worldPts.reduce(function(s,p){return s+p.y;}, 0) / worldPts.length;
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var toC = { x: cx - mx, y: cy - my };
    if (toC.x * nx + toC.y * ny < 0) { nx = -nx; ny = -ny; }
  }
  var badgePt = { x: pt.x + nx * 16, y: pt.y + ny * 16 };
  var labelPt = { x: pt.x + nx * 38, y: pt.y + ny * 38 };
  var sel = isSelected('damper', d.id);
  var g = '<g class="comp" data-comp-type="damper" data-comp-id="' + d.id + '">';
  g += '<line x1="' + pt.x + '" y1="' + pt.y + '" x2="' + badgePt.x + '" y2="' + badgePt.y + '" stroke="var(--c-damper)" stroke-width="1.4" opacity="0.55"/>';
  g += '<g transform="translate(' + badgePt.x + ',' + badgePt.y + ')">';
  g += '<circle r="15" fill="transparent" pointer-events="all" style="cursor:pointer;"/>';
  if (sel) g += '<circle r="14" fill="none" stroke="var(--c-damper)" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.75"/>';
  g += '<circle r="7.5" fill="var(--panel)" stroke="var(--c-damper)" stroke-width="2.2"/>';
  g += '<path d="M -4 2.5 L -1.3 -3 L 1.3 3 L 4 -2.5" fill="none" stroke="var(--c-damper)" stroke-width="1.7"/>';
  if (sel) g += deleteBadge(17, -17, 'damper', d.id);
  g += '</g>';
  g += '<text x="' + labelPt.x + '" y="' + (labelPt.y+3.5) + '" text-anchor="middle" fill="var(--c-damper)" font-family="monospace" font-size="10.5">Friccion B=' + fmtNum(d.val) + '</text>';
  g += '</g>';
  return g;
}
function damperCompMarkup(d, posMap) {
  if (d.isFriction) return frictionBadgeMarkup(d, posMap);
  var na = getNode(d.a), nb = getNode(d.b);
  if (!na || !nb) return '';
  var pa = posMap[na.id] || { x: na.x, y: na.y }, pb = posMap[nb.id] || { x: nb.x, y: nb.y };
  var pts = clippedEndpoints(na, nb, 'damper', d.id, pa, pb, d.aAnchor, d.bAnchor);
  var rawLen = Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1);
  initLinkRestLength(d);
  var visLen = clampVisibleLen(d, rawLen);
  var angle = Math.atan2(pts.y2 - pts.y1, pts.x2 - pts.x1) * 180 / Math.PI;
  var sel = isSelected('damper', d.id);
  var midx = rawLen / 2;
  var g = '<g class="comp" data-comp-type="damper" data-comp-id="' + d.id + '" transform="translate(' + pts.x1 + ',' + pts.y1 + ') rotate(' + angle + ')">';
  g += '<line x1="0" y1="0" x2="' + rawLen + '" y2="0" stroke="transparent" stroke-width="24" pointer-events="stroke" style="cursor:pointer;"/>';
  if (rawLen > visLen) g += limitStopMarkup(visLen, rawLen, 0, 'var(--red)');
  if (rawLen < visLen) g += limitStopMarkup(rawLen, visLen, 0, 'var(--red)');
  if (sel) g += '<line x1="0" y1="0" x2="' + visLen + '" y2="0" stroke="var(--c-damper)" stroke-width="9" opacity="0.22"/>';
  g += damperMarkup(0, visLen, 0, 'var(--c-damper)', d.L0);
  var labelTxt = 'B=' + fmtNum(d.val);
  g += '<text x="' + midx + '" y="-15" text-anchor="middle" fill="var(--c-damper)" font-family="monospace" font-size="11" transform="rotate(' + (-angle) + ' ' + midx + ' -15)">' + labelTxt + '</text>';
  if (sel) g += '<g transform="translate(' + midx + ',-32) rotate(' + (-angle) + ')">' +
      '<circle r="10" fill="var(--panel)" stroke="var(--red)" stroke-width="1.6"/>' +
      '<text text-anchor="middle" dy="4" fill="var(--red)" font-size="13" font-family="monospace">&#215;</text>' +
      '<rect x="-14" y="-14" width="28" height="28" fill="transparent" data-role="delete" data-comp-type="damper" data-comp-id="' + d.id + '" style="cursor:pointer;"/>' +
    '</g>';
  g += '</g>';
  g += '</g>';
  return g;
}
function forceMarkup(f, indexAtNode, posMap) {
  var n = getNode(f.nodeId);
  if (!n) return '';
  var pos = posMap[n.id] || { x: n.x, y: n.y };
  var he = nodeHalfExtents(n);
  var ay = pos.y - he.hh - 18 - indexAtNode * 24;
  var sel = isSelected('force', f.id);
  var g = '<g class="comp" data-comp-type="force" data-comp-id="' + f.id + '" transform="translate(' + pos.x + ',' + ay + ')">';
  if (sel) g += '<rect x="-46" y="-11" width="70" height="22" rx="6" fill="none" stroke="var(--c-force)" stroke-width="1.5" stroke-dasharray="4 3"/>';
  g += '<line x1="-38" y1="0" x2="8" y2="0" stroke="var(--c-force)" stroke-width="2.6" marker-end="url(#arrowhead)"/>';
  g += '<text x="-44" y="4" text-anchor="end" fill="var(--c-force)" font-family="monospace" font-size="11">' + f.symbol + '</text>';
  if (sel) g += deleteBadge(16, -14, 'force', f.id);
  g += '</g>';
  return g;
}

/* =========================================================================
   Ensamblado del lienzo (render principal)
   ========================================================================= */
var PX_PER_UNIT = 34;
function endpointHandlesMarkup(kind, link, posMap, color) {
  var na = getNode(link.a), nb = getNode(link.b);
  if (!na || !nb) return '';
  var pa = posMap[na.id] || { x: na.x, y: na.y }, pb = posMap[nb.id] || { x: nb.x, y: nb.y };
  var pts = clippedEndpoints(na, nb, kind, link.id, pa, pb, link.aAnchor, link.bAnchor);
  var sel = isSelected(kind, link.id);
  var r = sel ? 7.5 : 6.5;
  var op = sel ? 1 : 0.85;
  var s = '';
  s += '<circle data-role="endpoint" data-link-kind="' + kind + '" data-link-id="' + link.id + '" data-end="a" cx="' + pts.x1 + '" cy="' + pts.y1 + '" r="' + r + '" fill="var(--panel)" stroke="' + color + '" stroke-width="2" opacity="' + op + '" style="cursor:grab;"/>';
  s += '<circle data-role="endpoint" data-link-kind="' + kind + '" data-link-id="' + link.id + '" data-end="b" cx="' + pts.x2 + '" cy="' + pts.y2 + '" r="' + r + '" fill="var(--panel)" stroke="' + color + '" stroke-width="2" opacity="' + op + '" style="cursor:grab;"/>';
  return s;
}
function renderCanvas(animOffsets) {
  animOffsets = animOffsets || {};
  var posMap = {};
  state.nodes.forEach(function(n) {
    if (!n.isWall && animOffsets[n.id] && state.mode === 'trans') {
      posMap[n.id] = { x: n.x + animOffsets[n.id].dx, y: n.y };
    } else {
      posMap[n.id] = { x: n.x, y: n.y };
    }
  });
  var svg = '<defs>' +
    '<marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--c-force)"/></marker>' +
    '<pattern id="gridDots" width="' + GRID_SIZE + '" height="' + GRID_SIZE + '" patternUnits="userSpaceOnUse">' +
      '<circle cx="1" cy="1" r="1.5" fill="rgba(95,192,221,0.18)"/>' +
    '</pattern>' +
    '</defs>';
  svg += '<rect x="-12000" y="-12000" width="24000" height="24000" fill="url(#gridDots)"/>';

  if (state.mode === 'pend') {
    svg += pendulumSceneMarkup(animOffsets && animOffsets.pendThetas);
    document.getElementById('workSvg').innerHTML = svg;
    document.getElementById('emptyHint').style.display = state.links.length ? 'none' : 'block';
    return;
  }

  state.springs.forEach(function(s) { svg += springMarkup(s, posMap); });
  state.dampers.forEach(function(d) { if (!d.isFriction) svg += damperCompMarkup(d, posMap); });

  var forceCountByNode = {};
  state.forces.forEach(function(f) {
    var idxAt = forceCountByNode[f.nodeId] || 0;
    svg += forceMarkup(f, idxAt, posMap);
    forceCountByNode[f.nodeId] = idxAt + 1;
  });

  state.nodes.forEach(function(n) {
    var pos = posMap[n.id];
    var angleDeg = 0;
    if (!n.isWall && animOffsets[n.id] && animOffsets[n.id].angleDeg != null) angleDeg = animOffsets[n.id].angleDeg;
    if (!n.isWall && n.kind === 'drum' && (!animOffsets[n.id] || animOffsets[n.id].angleDeg == null)) {
      angleDeg = (n.phase || 0);
    }
    svg += nodeMarkup(n, pos, angleDeg);
  });

  state.dampers.forEach(function(d) { if (d.isFriction) svg += damperCompMarkup(d, posMap); });

  state.springs.forEach(function(s) { svg += endpointHandlesMarkup('spring', s, posMap, 'var(--c-spring)'); });
  state.dampers.forEach(function(d) { if (!d.isFriction) svg += endpointHandlesMarkup('damper', d, posMap, 'var(--c-damper)'); });

  if (state.pending && state.pending.type === 'trace-poly') svg += tracePreviewMarkup();
  if (reattachPreview) svg += reattachPreviewMarkup();

  document.getElementById('workSvg').innerHTML = svg;
  document.getElementById('emptyHint').style.display = state.nodes.length ? 'none' : 'block';
}

/* =========================================================================
   Render del pendulo: pivote fijo + cadena de eslabones con bob al extremo
   ========================================================================= */
function pendulumSceneMarkup(liveThetas) {
  var links = state.links;
  var thetas = liveThetas || links.map(function(l){ return l.theta0 || 0; });
  var pts = pendulumBobPositions(links, thetas);
  var g = '';
  // Pivote fijo (soporte)
  var pv = pts[0];
  var pvSize = 16;
  g += '<g class="comp" data-comp-type="pivot" data-comp-id="__pivot">';
  g += '<line x1="' + (pv.x - 40) + '" y1="' + pv.y + '" x2="' + (pv.x + 40) + '" y2="' + pv.y + '" stroke="var(--c-wall)" stroke-width="3"/>';
  for (var t = -3; t <= 3; t++) {
    var xh = pv.x + t * 11;
    g += '<line x1="' + xh + '" y1="' + pv.y + '" x2="' + (xh - 7) + '" y2="' + (pv.y + 11) + '" stroke="var(--c-wall)" stroke-width="1.4" opacity="0.75"/>';
  }
  g += '<circle cx="' + pv.x + '" cy="' + pv.y + '" r="5" fill="var(--panel)" stroke="var(--c-wall)" stroke-width="2"/>';
  g += '<text x="' + (pv.x + 46) + '" y="' + (pv.y + 4) + '" fill="var(--ink-dim)" font-family="monospace" font-size="10">' + UNITS.pend.wallLabel + '</text>';
  g += '</g>';
  // Eslabones
  for (var i = 0; i < links.length; i++) {
    var a = pts[i], b = pts[i + 1];
    var sel = isSelected('link', links[i].id);
    var barColor = 'var(--c-mass)';
    var bobR = 10 + 5 * Math.sqrt(Math.max(links[i].mass, 0.2));
    g += '<g class="comp" data-comp-type="link" data-comp-id="' + links[i].id + '">';
    g += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + barColor + '" stroke-width="' + (sel ? 5 : 3.4) + '" stroke-linecap="round" opacity="0.9"/>';
    g += '<circle cx="' + a.x + '" cy="' + a.y + '" r="4" fill="var(--panel)" stroke="var(--c-damper)" stroke-width="1.6"/>';
    g += '<circle cx="' + b.x + '" cy="' + b.y + '" r="' + bobR + '" fill="var(--c-mass-dim)" stroke="' + barColor + '" stroke-width="2.4"/>';
    if (sel) g += '<circle cx="' + b.x + '" cy="' + b.y + '" r="' + (bobR + 6) + '" fill="none" stroke="' + barColor + '" stroke-width="1.4" stroke-dasharray="4 3"/>';
    // Etiqueta
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    var nx = -dy / dl, ny = dx / dl;
    g += '<text x="' + (mx + nx * 14) + '" y="' + (my + ny * 14 + 4) + '" text-anchor="middle" fill="var(--ink-dim)" font-family="monospace" font-size="10.5">' + links[i].label + '</text>';
    g += '<text x="' + b.x + '" y="' + (b.y + bobR + 14) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">L=' + fmtNum(links[i].L) + ' m &middot; m=' + fmtNum(links[i].mass) + ' kg</text>';
    if (sel) g += deleteBadge(b.x + bobR + 12, b.y - bobR - 12, 'link', links[i].id);
    g += '</g>';
  }
  // Fuerzas (torques) sobre eslabones
  var fCount = {};
  state.forces.forEach(function(f) {
    var linkIdx = -1;
    for (var i = 0; i < links.length; i++) if (links[i].id === f.nodeId) { linkIdx = i; break; }
    if (linkIdx < 0) return;
    var bob = pts[linkIdx + 1];
    var k = fCount[f.nodeId] || 0; fCount[f.nodeId] = k + 1;
    var ay = bob.y - 40 - k * 22;
    var sel = isSelected('force', f.id);
    g += '<g class="comp" data-comp-type="force" data-comp-id="' + f.id + '" transform="translate(' + bob.x + ',' + ay + ')">';
    if (sel) g += '<rect x="-46" y="-11" width="70" height="22" rx="6" fill="none" stroke="var(--c-force)" stroke-width="1.5" stroke-dasharray="4 3"/>';
    g += '<path d="M -30 6 A 14 14 0 1 1 -8 -8" fill="none" stroke="var(--c-force)" stroke-width="2.4" marker-end="url(#arrowhead)"/>';
    g += '<text x="-34" y="4" text-anchor="end" fill="var(--c-force)" font-family="monospace" font-size="11">' + f.symbol + '</text>';
    if (sel) g += deleteBadge(16, -14, 'force', f.id);
    g += '</g>';
  });
  return g;
}

/* =========================================================================
   Popover de parametros (edicion por doble clic)
   ========================================================================= */
var openPopoverInfo = null;

function popoverFieldsHTML(type, id) {
  var U = UNITS[state.mode];
  if (type === 'node') {
    var n = getNode(id);
    if (!n) return '';
    if (n.isWall) {
      var wt = n.wallType || 'point';
      var typeOpts = ['point:Simple (un punto)', 'rect:Rectangulo', 'poly:Poligono libre'].map(function(o) {
        var kv = o.split(':'); var sel2 = wt === kv[0] ? ' selected' : '';
        return '<option value="' + kv[0] + '"' + sel2 + '>' + kv[1] + '</option>';
      }).join('');
      var html = '<div class="pf-row"><label>Etiqueta</label><input type="text" data-pf="label" value="' + n.label + '"></div>';
      html += '<div class="pf-row"><label>Tipo de pared</label><select data-pf="wallType">' + typeOpts + '</select></div>';
      if (wt === 'rect') {
        html += '<div class="pf-two"><div class="pf-row"><label>Ancho</label><input type="number" step="5" min="40" data-pf="width" value="' + n.width + '"></div>' +
          '<div class="pf-row"><label>Alto</label><input type="number" step="5" min="24" data-pf="height" value="' + n.height + '"></div></div>' +
          '<div class="eq-note">Tambien puedes arrastrar la manija de la esquina en el lienzo.</div>';
      } else if (wt === 'poly') {
        html += '<button class="del-btn" id="retraceBtn" style="color:var(--c-wall);border-color:var(--c-wall);width:100%;">&#9998; Trazar poligono de nuevo</button>';
        html += '<div class="eq-note">Puntos actuales: ' + (n.points ? n.points.length : 0) + '. Conecta resortes/amortiguadores a cualquier punto de sus lados.</div>';
      }
      return html;
    }
    if (n.kind === 'drum') {
      var htmlD = '<div class="pf-row"><label>Etiqueta</label><input type="text" data-pf="label" value="' + n.label + '"></div>';
      htmlD += '<div class="pf-two"><div class="pf-row"><label>Masa cuadro M (kg)</label><input type="number" step="0.1" min="0.05" data-pf="mass" value="' + n.mass + '"></div>';
      htmlD += '<div class="pf-row"><label>Inercia J (kg&middot;m&#178;)</label><input type="number" step="0.05" min="0.01" data-pf="J" value="' + n.J + '"></div></div>';
      htmlD += '<div class="pf-two"><div class="pf-row"><label>Masa exc. m (kg)</label><input type="number" step="0.05" min="0" data-pf="eccMass" value="' + n.eccMass + '"></div>';
      htmlD += '<div class="pf-row"><label>Radio exc. r (m)</label><input type="number" step="0.01" min="0" data-pf="eccRadius" value="' + n.eccRadius + '"></div></div>';
      var rpm = n.omega * 60 / (2 * Math.PI);
      htmlD += '<div class="pf-two"><div class="pf-row"><label>Velocidad (rpm)</label><input type="number" step="5" min="0" data-pf="rpm" value="' + rpm.toFixed(1) + '"></div>';
      htmlD += '<div class="pf-row"><label>Fase &phi; (grados)</label><input type="number" step="5" data-pf="phase" value="' + n.phase + '"></div></div>';
      htmlD += '<div class="pf-two"><div class="pf-row"><label>Ancho (px)</label><input type="number" step="10" min="80" data-pf="width" value="' + n.width + '"></div>';
      htmlD += '<div class="pf-row"><label>Alto (px)</label><input type="number" step="10" min="60" data-pf="height" value="' + n.height + '"></div></div>';
      var rpmVal = (n.omega || 0) * 60 / (2 * Math.PI);
      var ampInternal = (n.eccMass || 0) * (n.eccRadius || 0) * (n.omega || 0) * (n.omega || 0);
      htmlD += '<div class="eq-note">Vibración auto-inducida por la masa desbalanceada girando dentro del cuadro (no se agrega ninguna fuerza externa). Amplitud efectiva actual: F_cf = m&middot;r&middot;&omega;&#178; = ' + fmtNum(ampInternal, 3) + ' N a ' + fmtNum(rpmVal / 60, 3) + ' Hz. Ajusta m, r o rpm para ver más o menos vibración.</div>';
      return htmlD;
    }
    var htmlM = '<div class="pf-row"><label>Etiqueta</label><input type="text" data-pf="label" value="' + n.label + '"></div>' +
      '<div class="pf-row"><label>' + (U.massSym==='M'?'Masa':'Inercia') + ' (' + U.massUnit + ')</label><input type="number" step="0.1" min="0.05" data-pf="mass" value="' + n.mass + '"></div>';
    if (state.mode === 'rot') {
      htmlM += '<div class="pf-two"><div class="pf-row"><label>Masa exc. m (kg)</label><input type="number" step="0.05" min="0" data-pf="eccMass" value="' + (n.eccMass || 0) + '"></div>';
      htmlM += '<div class="pf-row"><label>Radio exc. r (m)</label><input type="number" step="0.01" min="0" data-pf="eccRadius" value="' + (n.eccRadius || 0) + '"></div></div>';
      htmlM += '<div class="eq-note">La masa excentrica se representa como un punto rojo en el borde de la inercia. Contribuye al momento a traves de J_eff = J + m&middot;r&#178; y aporta un par gravitacional cuando se activa gravedad.</div>';
    }
    return htmlM;
  }
  if (type === 'link') {
    var lk = getLink(id); if (!lk) return '';
    var html = '<div class="pf-row"><label>Etiqueta</label><input type="text" data-pf="label" value="' + lk.label + '"></div>';
    html += '<div class="pf-two"><div class="pf-row"><label>Longitud L (m)</label><input type="number" step="0.05" min="0.1" data-pf="L" value="' + lk.L + '"></div>';
    html += '<div class="pf-row"><label>Masa m (kg)</label><input type="number" step="0.1" min="0.05" data-pf="mass" value="' + lk.mass + '"></div></div>';
    html += '<div class="pf-row"><label>Amort. articulacion b (' + U.bUnit + ')</label><input type="number" step="0.01" min="0" data-pf="b" value="' + lk.b + '"></div>';
    html += '<div class="pf-two"><div class="pf-row"><label>' + String.fromCharCode(952) + '&#8320; (rad)</label><input type="number" step="0.05" data-pf="theta0" value="' + lk.theta0 + '"></div>';
    html += '<div class="pf-row"><label>' + String.fromCharCode(952) + "&#8320;' (rad/s)</label><input type=\"number\" step=\"0.05\" data-pf=\"omega0\" value=\"" + lk.omega0 + '"></div></div>';
    html += '<div class="eq-note">Modelo de masa puntual en el extremo (m concentrada al final del eslabon). Gravedad g = 9.81 m/s&#178;.</div>';
    return html;
  }
  if (type === 'spring') {
    var s = state.springs.find(function(x){return x.id===id;});
    if (!s) return '';
    initLinkRestLength(s);
    var html = '<div class="pf-row"><label>Constante K (' + U.kUnit + ')</label><input type="number" step="0.1" min="0" data-pf="k" value="' + s.k + '"></div>';
    html += '<div class="pf-row"><label>Longitud natural L&#8320; (px)</label><input type="number" step="5" min="10" data-pf="L0" value="' + Math.round(s.L0) + '"></div>';
    html += '<div class="pf-two"><div class="pf-row"><label>Long. mínima</label><input type="number" step="5" min="4" data-pf="Lmin" value="' + Math.round(s.Lmin) + '"></div>';
    html += '<div class="pf-row"><label>Long. máxima</label><input type="number" step="5" min="20" data-pf="Lmax" value="' + Math.round(s.Lmax) + '"></div></div>';
    html += '<div class="eq-note">Los topes visuales indican que el resorte alcanza su límite de compresión o expansión.</div>';
    return html;
  }
  if (type === 'damper') {
    var d = state.dampers.find(function(x){return x.id===id;});
    if (!d) return '';
    initLinkRestLength(d);
    var html2 = '<div class="pf-row"><label>Coeficiente B (' + U.bUnit + ')</label><input type="number" step="0.1" min="0" data-pf="val" value="' + d.val + '"></div>';
    if (!d.isFriction) {
      html2 += '<div class="pf-row"><label>Longitud natural L&#8320; (px)</label><input type="number" step="5" min="10" data-pf="L0" value="' + Math.round(d.L0) + '"></div>';
      html2 += '<div class="pf-two"><div class="pf-row"><label>Recorrido mín.</label><input type="number" step="5" min="4" data-pf="Lmin" value="' + Math.round(d.Lmin) + '"></div>';
      html2 += '<div class="pf-row"><label>Recorrido máx.</label><input type="number" step="5" min="20" data-pf="Lmax" value="' + Math.round(d.Lmax) + '"></div></div>';
      html2 += '<div class="eq-note">El pistón se desplaza dentro del cilindro según la elongación. Los topes en rojo marcan cuando llega a su fondo o carrera máxima.</div>';
    }
    if (d.isFriction) html2 += '<div class="eq-note">Generado automaticamente: esta masa esta apoyada sobre una arista de la pared. Puedes ajustar su coeficiente de friccion libremente.</div>';
    return html2;
  }
  if (type === 'force') {
    var f = getForce(id);
    if (!f) return '';
    var waveOpts = ['step:Escalon','impulse:Impulso','sine:Senoidal','ramp:Rampa'].map(function(o){
      var kv = o.split(':'); var sel = f.wave===kv[0]?' selected':'';
      return '<option value="'+kv[0]+'"'+sel+'>'+kv[1]+'</option>';
    }).join('');
    var html = '<div class="pf-row"><label>Simbolo (uso en TF)</label><input type="text" data-pf="symbol" value="' + f.symbol + '"></div>';
    html += '<div class="pf-row"><label>Forma de onda (simulacion)</label><select data-pf="wave">' + waveOpts + '</select></div>';
    html += '<div class="pf-two"><div class="pf-row"><label>Amplitud (' + U.fUnit + ')</label><input type="number" step="0.1" data-pf="amp" value="' + f.amp + '"></div>';
    if (f.wave === 'sine') html += '<div class="pf-row"><label>Frecuencia (Hz)</label><input type="number" step="0.05" min="0.01" data-pf="freq" value="' + f.freq + '"></div>';
    html += '</div>';
    return html;
  }
  return '';
}

function popoverTitle(type, id) {
  if (type === 'node') { var n = getNode(id); var lab = n.isWall ? 'Pared / soporte' : (n.kind === 'drum' ? 'Cuadro ' + n.label : (UNITS[state.mode].nodeName) + ' ' + n.label); return { color: n.isWall ? 'var(--c-wall)' : 'var(--c-mass)', label: lab }; }
  if (type === 'link') { var lk = getLink(id); return { color: 'var(--c-mass)', label: 'Eslabon ' + (lk ? lk.label : '') }; }
  if (type === 'spring') return { color: 'var(--c-spring)', label: 'Resorte' };
  if (type === 'damper') {
    var dd = state.dampers.find(function(x){return x.id===id;});
    return { color: 'var(--c-damper)', label: (dd && dd.isFriction) ? 'Friccion (automatica)' : 'Amortiguador' };
  }
  if (type === 'force') return { color: 'var(--c-force)', label: UNITS[state.mode].fSym === 'f' ? 'Fuerza' : 'Torque' };
  return { color: 'var(--ink)', label: '' };
}

function openPopover(type, id, clientX, clientY) {
  state.selected = { type: type, id: id };
  openPopoverInfo = { type: type, id: id };
  var t = popoverTitle(type, id);
  var html = '<div class="popover-head"><div class="ttl"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div><button class="x" id="popoverCloseX">&times;</button></div>' +
    '<div class="popover-body">' + popoverFieldsHTML(type, id) + '</div>' +
    '<div class="popover-foot"><button class="del-btn" id="popoverDeleteBtn">&#128465; Eliminar</button></div>';
  var layer = document.getElementById('popoverLayer');
  layer.innerHTML = '<div class="popover" id="popoverBox">' + html + '</div>';
  var box = document.getElementById('popoverBox');
  var left = clientX + 14, top = clientY + 10;
  box.style.left = left + 'px'; box.style.top = top + 'px';
  requestAnimationFrame(function() {
    var rect = box.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (rect.right > vw - 8) box.style.left = Math.max(8, vw - rect.width - 8) + 'px';
    if (rect.bottom > vh - 8) box.style.top = Math.max(8, vh - rect.height - 8) + 'px';
  });
  renderCanvas();
}
function closePopover() {
  openPopoverInfo = null;
  state.selected = null;
  document.getElementById('popoverLayer').innerHTML = '';
  renderCanvas();
}
function applyPopoverField(type, id, field, rawValue, isCheckbox) {
  if (type === 'node') {
    var n = getNode(id); if (!n) return;
    if (field === 'label') n.label = rawValue;
    else if (field === 'mass') { var v = parseFloat(rawValue); if (isNaN(v) || v <= 0) v = 0.05; n.mass = v; }
    else if (field === 'J') { var vJ = parseFloat(rawValue); n.J = isNaN(vJ) || vJ <= 0 ? 0.01 : vJ; }
    else if (field === 'eccMass') { var vem = parseFloat(rawValue); n.eccMass = isNaN(vem) || vem < 0 ? 0 : vem; }
    else if (field === 'eccRadius') { var ver = parseFloat(rawValue); n.eccRadius = isNaN(ver) || ver < 0 ? 0 : ver; }
    else if (field === 'rpm') { var vr = parseFloat(rawValue); if (isNaN(vr) || vr < 0) vr = 0; n.omega = vr * 2 * Math.PI / 60; }
    else if (field === 'phase') { var vp = parseFloat(rawValue); n.phase = isNaN(vp) ? 0 : vp; }
    else if (field === 'wallType') {
      if (rawValue === 'poly') {
        closePopover();
        startTracePoly(n.id);
        return;
      }
      n.wallType = rawValue;
      if (rawValue === 'rect') { if (!n.width) n.width = 160; if (!n.height) n.height = 46; recomputeRectPoints(n); }
      else { n.points = null; }
      reopenPopoverInPlace();
    }
    else if (field === 'width') { var vw = parseFloat(rawValue); n.width = isNaN(vw) || vw < 40 ? 40 : vw; recomputeRectPoints(n); }
    else if (field === 'height') { var vh = parseFloat(rawValue); n.height = isNaN(vh) || vh < 24 ? 24 : vh; recomputeRectPoints(n); }
  } else if (type === 'spring') {
    var s = state.springs.find(function(x){return x.id===id;}); if (!s) return;
    if (field === 'k') { var vk = parseFloat(rawValue); s.k = isNaN(vk) || vk < 0 ? 0 : vk; }
    else if (field === 'L0') { var vl0 = parseFloat(rawValue); if (!isNaN(vl0) && vl0 > 0) s.L0 = vl0; }
    else if (field === 'Lmin') { var vlm = parseFloat(rawValue); if (!isNaN(vlm) && vlm > 0) s.Lmin = vlm; }
    else if (field === 'Lmax') { var vlM = parseFloat(rawValue); if (!isNaN(vlM) && vlM > 0) s.Lmax = vlM; }
  } else if (type === 'link') {
    var lk = getLink(id); if (!lk) return;
    if (field === 'label') lk.label = rawValue;
    else if (field === 'L') { var vL = parseFloat(rawValue); lk.L = isNaN(vL) || vL <= 0.05 ? 0.1 : vL; }
    else if (field === 'mass') { var vm = parseFloat(rawValue); lk.mass = isNaN(vm) || vm <= 0 ? 0.05 : vm; }
    else if (field === 'b') { var vb = parseFloat(rawValue); lk.b = isNaN(vb) || vb < 0 ? 0 : vb; }
    else if (field === 'theta0') { var vt = parseFloat(rawValue); lk.theta0 = isNaN(vt) ? 0 : vt; }
    else if (field === 'omega0') { var vo = parseFloat(rawValue); lk.omega0 = isNaN(vo) ? 0 : vo; }
  } else if (type === 'damper') {
    var d = state.dampers.find(function(x){return x.id===id;}); if (!d) return;
    if (field === 'val') { var vb = parseFloat(rawValue); d.val = isNaN(vb) || vb < 0 ? 0 : vb; }
    else if (field === 'L0') { var vdl0 = parseFloat(rawValue); if (!isNaN(vdl0) && vdl0 > 0) d.L0 = vdl0; }
    else if (field === 'Lmin') { var vdlm = parseFloat(rawValue); if (!isNaN(vdlm) && vdlm > 0) d.Lmin = vdlm; }
    else if (field === 'Lmax') { var vdlM = parseFloat(rawValue); if (!isNaN(vdlM) && vdlM > 0) d.Lmax = vdlM; }
  } else if (type === 'force') {
    var f = getForce(id); if (!f) return;
    if (field === 'symbol') f.symbol = rawValue;
    else if (field === 'wave') { f.wave = rawValue; reopenPopoverInPlace(); }
    else if (field === 'amp') { var va = parseFloat(rawValue); f.amp = isNaN(va) ? 0 : va; }
    else if (field === 'freq') { var vf = parseFloat(rawValue); f.freq = isNaN(vf) || vf <= 0 ? 0.01 : vf; }
  }
}
function reopenPopoverInPlace() {
  if (!openPopoverInfo) return;
  var box = document.getElementById('popoverBox');
  var left = box ? box.style.left : '100px', top = box ? box.style.top : '100px';
  var info = openPopoverInfo;
  var t = popoverTitle(info.type, info.id);
  var html = '<div class="popover-head"><div class="ttl"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div><button class="x" id="popoverCloseX">&times;</button></div>' +
    '<div class="popover-body">' + popoverFieldsHTML(info.type, info.id) + '</div>' +
    '<div class="popover-foot"><button class="del-btn" id="popoverDeleteBtn">&#128465; Eliminar</button></div>';
  document.getElementById('popoverLayer').innerHTML = '<div class="popover" id="popoverBox">' + html + '</div>';
  var nb = document.getElementById('popoverBox');
  nb.style.left = left; nb.style.top = top;
}

/* =========================================================================
   Trazado de pared en forma de poligono (punto por punto)
   ========================================================================= */
function startTracePoly(wallId) {
  state.pending = { type: 'trace-poly', wallId: wallId, points: [] };
  state.selected = null;
  updateHintBar('Haz clic para anadir vertices (minimo 3) &middot; clic cerca del primer punto (o Enter) para cerrar &middot; Esc para cancelar', true);
  renderCanvas();
}
function finishTracePoly() {
  if (!state.pending || state.pending.type !== 'trace-poly') return;
  var wall = getNode(state.pending.wallId);
  var pts = state.pending.points.slice();
  if (pts.length >= 2) {
    var a = pts[pts.length - 1], b = pts[pts.length - 2];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 6 * svgScale().sx) pts.pop();
  }
  if (wall && pts.length >= 3) {
    var ref = pts[0];
    wall.x = ref.x; wall.y = ref.y;
    wall.points = pts.map(function(p) { return { x: p.x - ref.x, y: p.y - ref.y }; });
    wall.wallType = 'poly';
  }
  state.pending = null;
  state.selected = wall ? { type: 'node', id: wall.id } : null;
  updateHintBar(defaultHintText(), false);
  renderCanvas(); renderResults();
}
function tracePreviewMarkup() {
  var pts = state.pending.points;
  if (!pts.length) return '';
  var g = '<g>';
  for (var i = 0; i < pts.length - 1; i++) {
    g += '<line x1="' + pts[i].x + '" y1="' + pts[i].y + '" x2="' + pts[i+1].x + '" y2="' + pts[i+1].y + '" stroke="var(--c-wall)" stroke-width="2.2"/>';
  }
  if (pts.length >= 2) {
    var last = pts[pts.length - 1], first = pts[0];
    g += '<line x1="' + last.x + '" y1="' + last.y + '" x2="' + first.x + '" y2="' + first.y + '" stroke="var(--c-wall)" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.55"/>';
  }
  pts.forEach(function(p, i) {
    g += '<circle cx="' + p.x + '" cy="' + p.y + '" r="6.5" fill="var(--panel)" stroke="var(--c-wall)" stroke-width="2.2"/>';
    g += '<text x="' + p.x + '" y="' + (p.y - 12) + '" text-anchor="middle" fill="var(--c-wall)" font-family="monospace" font-size="10">' + (i+1) + '</text>';
  });
  g += '</g>';
  return g;
}

/* =========================================================================
   Motor de simulacion (RK4 en vivo) + osciloscopio
   ========================================================================= */
var simUI = { running: false, t: 0, x: null, raf: null, lastTs: null, duration: 10, speed: 1,
  samples: [], pendSamples: [], stateSamples: [], scopeSel: null };

/* Selección de señales del osciloscopio: mapa signalId -> bool */
function scopeDefaultSelection() {
  var sel = {};
  if (state.mode === 'pend') {
    state.forces.forEach(function(f) { sel['f:' + f.id] = false; });
    var firstF = state.forces[0];
    if (firstF) sel['f:' + firstF.id] = true;
    state.links.forEach(function(l, i) {
      sel['lp:' + l.id] = (l.id === state.outputNodeId && state.outputType !== 'vel');
      sel['lv:' + l.id] = (l.id === state.outputNodeId && state.outputType === 'vel');
    });
    // asegurar al menos una salida activa
    if (state.outputNodeId) {
      sel[(state.outputType === 'vel' ? 'lv:' : 'lp:') + state.outputNodeId] = true;
    }
  } else {
    var fx = (typeof effectiveForces === 'function') ? effectiveForces() : state.forces;
    fx.forEach(function(f) { sel['f:' + f.id] = false; });
    if (fx.length) sel['f:' + fx[0].id] = true;
    realNodes().forEach(function(n) {
      sel['np:' + n.id] = (n.id === state.outputNodeId && state.outputType !== 'vel');
      sel['nv:' + n.id] = (n.id === state.outputNodeId && state.outputType === 'vel');
    });
    if (state.outputNodeId) {
      sel[(state.outputType === 'vel' ? 'nv:' : 'np:') + state.outputNodeId] = true;
    }
  }
  return sel;
}
function ensureScopeSel() {
  if (!simUI.scopeSel) simUI.scopeSel = scopeDefaultSelection();
  // rellenar señales nuevas con default
  var def = scopeDefaultSelection();
  Object.keys(def).forEach(function(k) { if (!(k in simUI.scopeSel)) simUI.scopeSel[k] = def[k]; });
  // eliminar señales obsoletas
  Object.keys(simUI.scopeSel).forEach(function(k) { if (!(k in def)) delete simUI.scopeSel[k]; });
}
function resetScopeSelection() { simUI.scopeSel = null; }

function makeWaveFunc(f) {
  if (f.wave === 'step') return function(t) { return f.amp; };
  if (f.wave === 'sine') return function(t) { return f.amp * Math.sin(2 * Math.PI * f.freq * t + (f.phase||0) * Math.PI / 180); };
  if (f.wave === 'ramp') return function(t) { return f.amp * t; };
  return function(t) { return 0; };
}
function simReset() {
  simPauseInternal();
  simUI.t = 0; simUI.x = null; simUI.samples = []; simUI.pendSamples = []; simUI.stateSamples = [];
  document.getElementById('timeReadout').textContent = 't = 0.00 s';
  renderCanvas();
  renderScope();
  if (typeof renderPhase === 'function' && lastResults) renderPhase(lastResults);
  var btn = document.getElementById('playBtn');
  if (btn) { btn.textContent = '\u25B6 Simular'; btn.classList.remove('playing'); }
}
function simPauseInternal() {
  simUI.running = false;
  if (simUI.raf) cancelAnimationFrame(simUI.raf);
  simUI.raf = null;
  if (typeof drumClock !== 'undefined' && drumClock && drumClock.raf) {
    cancelAnimationFrame(drumClock.raf);
    drumClock.raf = null;
  }
}
function simStart() {
  var res = lastResults || renderResults();
  if (state.mode === 'pend') {
    var links = state.links;
    if (!links.length) return;
    if (!simUI.x || simUI.x.length !== 2 * links.length) {
      simUI.x = new Array(2 * links.length).fill(0);
      for (var i0 = 0; i0 < links.length; i0++) {
        simUI.x[i0] = links[i0].theta0 || 0;
        simUI.x[links.length + i0] = links[i0].omega0 || 0;
      }
      state.forces.forEach(function(f) {
        if (f.wave === 'impulse') {
          var idx = -1;
          for (var j = 0; j < links.length; j++) if (links[j].id === f.nodeId) { idx = j; break; }
          if (idx >= 0) {
            var mu = pendulumMu(links);
            var M0 = pendulumMassMatrix(links, new Array(links.length).fill(0), mu);
            try {
              var e = new Array(links.length).fill(0); e[idx] = f.amp;
              var dv = solveLinear(M0, e);
              for (var q = 0; q < links.length; q++) simUI.x[links.length + q] += dv[q];
            } catch (er) {}
          }
        }
      });
      simUI.t = 0; simUI.samples = []; simUI.pendSamples = [];
    }
    simUI.running = true; simUI.lastTs = null;
    var btnP = document.getElementById('playBtn');
    if (btnP) { btnP.textContent = '\u23F8 Pausar'; btnP.classList.add('playing'); }
    simUI.raf = requestAnimationFrame(simTick);
    return;
  }
  var rn = realNodes();
  var forcesFx = (typeof effectiveForces === 'function') ? effectiveForces() : state.forces;
  if (!forcesFx.length || !rn.length) return;
  if (!simUI.x || simUI.x.length !== 2 * rn.length) {
    simUI.x = new Array(2 * rn.length).fill(0);
    forcesFx.forEach(function(f) {
      if (f.wave === 'impulse') {
        var idx = res.idx.has(f.nodeId) ? res.idx.get(f.nodeId) : -1;
        if (idx !== -1) {
          var inertia = (typeof effectiveInertiaForNode === 'function') ? effectiveInertiaForNode(rn[idx]) : rn[idx].mass;
          simUI.x[2*idx+1] += f.amp / Math.max(inertia, 0.001);
        }
      }
    });
    simUI.t = 0; simUI.samples = []; simUI.stateSamples = [];
  }
  simUI.running = true; simUI.lastTs = null;
  var btn = document.getElementById('playBtn');
  if (btn) { btn.textContent = '\u23F8 Pausar'; btn.classList.add('playing'); }
  simUI.raf = requestAnimationFrame(simTick);
}
function simTick(ts) {
  if (!simUI.running) return;
  if (simUI.lastTs === null) simUI.lastTs = ts;
  var realDt = Math.min((ts - simUI.lastTs) / 1000, 0.05);
  simUI.lastTs = ts;
  var simDtTotal = realDt * simUI.speed;
  var h = 0.004;
  var steps = Math.max(1, Math.round(simDtTotal / h));

  if (state.mode === 'pend') {
    var links = state.links;
    var N = links.length;
    var linkIdx = {}; for (var li = 0; li < N; li++) linkIdx[links[li].id] = li;
    var forceWaves = state.forces.map(function(f) {
      var idx = linkIdx.hasOwnProperty(f.nodeId) ? linkIdx[f.nodeId] : -1;
      return { idx: idx, fn: makeWaveFunc(f) };
    }).filter(function(o) { return o.idx >= 0; });
    var tauFn = function(tt) {
      var tau = new Array(N).fill(0);
      forceWaves.forEach(function(o) { tau[o.idx] += o.fn(tt); });
      return tau;
    };
    for (var s0 = 0; s0 < steps && simUI.t < simUI.duration; s0++) {
      simUI.x = pendulumStep(links, simUI.x, tauFn, simUI.t, h);
      simUI.t += h;
    }
    var outLinkIdx = -1;
    for (var oi = 0; oi < N; oi++) if (links[oi].id === state.outputNodeId) { outLinkIdx = oi; break; }
    var yVal = 0;
    if (outLinkIdx >= 0) yVal = state.outputType === 'vel' ? simUI.x[N + outLinkIdx] : simUI.x[outLinkIdx];
    var uSumP = 0; forceWaves.forEach(function(o) { uSumP += o.fn(simUI.t); });
    simUI.samples.push({ t: simUI.t, y: yVal, u: uSumP });
    if (simUI.samples.length > 4000) simUI.samples.shift();
    var uSnap = state.forces.map(function(f) { return { id: f.id, val: makeWaveFunc(f)(simUI.t) }; });
    simUI.pendSamples.push({ t: simUI.t, z: simUI.x.slice(), u: uSnap });
    if (simUI.pendSamples.length > 4000) simUI.pendSamples.shift();
    var thetasNow = simUI.x.slice(0, N);
    renderCanvas({ pendThetas: thetasNow });
    renderScope();
    if (typeof renderPhase === 'function' && lastResults) renderPhase(lastResults);
    document.getElementById('timeReadout').textContent = 't = ' + simUI.t.toFixed(2) + ' s';
    if (simUI.t >= simUI.duration) {
      simUI.running = false;
      var btnE = document.getElementById('playBtn');
      if (btnE) { btnE.textContent = '\u25B6 Simular'; btnE.classList.remove('playing'); }
      return;
    }
    simUI.raf = requestAnimationFrame(simTick);
    return;
  }

  var rn = realNodes();
  var idx = buildIndexMap(rn);
  var A = buildGraphA(rn, idx);
  var activeForces = (typeof effectiveForces === 'function') ? effectiveForces() : state.forces;
  var Bcols = [], uFuncs = [];
  activeForces.forEach(function(f) {
    if (idx.has(f.nodeId)) { Bcols.push(buildForceColumn(rn, idx, f.nodeId)); uFuncs.push(makeWaveFunc(f)); }
  });

  for (var s = 0; s < steps && simUI.t < simUI.duration; s++) {
    simUI.x = rk4Step(A, Bcols, uFuncs, simUI.t, simUI.x, h);
    simUI.t += h;
  }

  var Crow = buildOutputRow(rn, idx, state.outputNodeId, state.outputType);
  var y = dotv(Crow, simUI.x);
  var uSum = 0;
  for (var k = 0; k < uFuncs.length; k++) uSum += uFuncs[k](simUI.t);
  simUI.samples.push({ t: simUI.t, y: y, u: uSum });
  if (simUI.samples.length > 4000) simUI.samples.shift();
  simUI.stateSamples.push({ t: simUI.t, x: simUI.x.slice(),
    u: activeForces.map(function(f, i) { return { id: f.id, val: uFuncs[i](simUI.t) }; }) });
  if (simUI.stateSamples.length > 4000) simUI.stateSamples.shift();

  var animOffsets = {};
  rn.forEach(function(n, i) {
    if (state.mode === 'trans') {
      var raw = simUI.x[2*i] * PX_PER_UNIT;
      var off = { dx: Math.max(-70, Math.min(70, raw)) };
      if (n.kind === 'drum') {
        var deg = ((n.omega || 0) * simUI.t) * 180 / Math.PI + (n.phase || 0);
        off.angleDeg = deg;
      }
      animOffsets[n.id] = off;
    } else {
      animOffsets[n.id] = { angleDeg: (simUI.x[2*i] * 180 / Math.PI) };
    }
  });
  renderCanvas(animOffsets);
  renderScope();
  if (typeof syncGraphViewer === 'function' && graphViewerState && graphViewerState.open) {
    var liveSource = graphViewerState.sourceId;
    if (liveSource === 'scope-graph' || liveSource === 'phase-graph') syncGraphViewer();
  }
  document.getElementById('timeReadout').textContent = 't = ' + simUI.t.toFixed(2) + ' s';

  if (simUI.t >= simUI.duration) {
    simUI.running = false;
    var btn = document.getElementById('playBtn');
    if (btn) { btn.textContent = '\u25B6 Simular'; btn.classList.remove('playing'); }
    return;
  }
  simUI.raf = requestAnimationFrame(simTick);
}

var SCOPE_COLORS = ['#5fc0dd', '#f2a154', '#6fcf97', '#b58cf2', '#e8637a', '#9fb0c2', '#f5d76e'];
function buildScopeSignals() {
  var U = UNITS[state.mode];
  var sigs = [];
  if (state.mode === 'pend') {
    state.forces.forEach(function(f) {
      var t = getLink(f.nodeId);
      sigs.push({ id: 'f:' + f.id, kind: 'input', label: f.symbol + ' → ' + (t ? t.label : '?'),
        get: function(idx, i, s) { return (s.u.find(function(o){return o.id===f.id;}) || {val:0}).val; },
        unit: U.fUnit, group: 'in' });
    });
    state.links.forEach(function(l, li) {
      sigs.push({ id: 'lp:' + l.id, kind: 'out', label: 'θ ' + l.label,
        get: function(idx, i, s) { return simUI.pendSamples[i].z[li]; }, unit: U.posUnit, group: 'out' });
      sigs.push({ id: 'lv:' + l.id, kind: 'out', label: 'θ\' ' + l.label,
        get: function(idx, i, s) { return simUI.pendSamples[i].z[state.links.length + li]; }, unit: U.velUnit, group: 'out' });
    });
  } else {
    var fx = (typeof effectiveForces === 'function') ? effectiveForces() : state.forces;
    fx.forEach(function(f) {
      var t = getNode(f.nodeId);
      sigs.push({ id: 'f:' + f.id, kind: 'input', label: f.symbol + ' → ' + (t ? t.label : '?') + (f.isDrumForce ? ' (cuadro)' : ''),
        get: function(idx, i, s) { var u = s.u.find(function(o){return o.id===f.id;}); return u ? u.val : 0; },
        unit: U.fUnit, group: 'in' });
    });
    var rn = realNodes();
    rn.forEach(function(n, ni) {
      sigs.push({ id: 'np:' + n.id, kind: 'out', label: U.pos + ' ' + n.label,
        get: function(idx, i, s) { return s.x[2 * ni]; }, unit: U.posUnit, group: 'out' });
      sigs.push({ id: 'nv:' + n.id, kind: 'out', label: U.velVar + ' ' + n.label,
        get: function(idx, i, s) { return s.x[2 * ni + 1]; }, unit: U.velUnit, group: 'out' });
    });
  }
  return sigs;
}
function niceStep(value) {
  if (!isFinite(value) || value <= 0) return 1;
  var pow10 = Math.pow(10, Math.floor(Math.log10(value)));
  var frac = value / pow10;
  var niceFrac = frac <= 1 ? 1 : (frac <= 2 ? 2 : (frac <= 5 ? 5 : 10));
  return niceFrac * pow10;
}
function scopeSignalValueAt(samples, sg, index) {
  if (!samples.length) return 0;
  var i = Math.max(0, Math.min(samples.length - 1, index));
  try { return sg.get(0, i, samples[i]); } catch (e) { return 0; }
}
function scopeCursorValues(samples, sigs, active, t) {
  if (!samples.length || t == null || !isFinite(t)) return null;
  var i = 0;
  while (i < samples.length - 1 && samples[i + 1].t < t) i++;
  var s0 = samples[i], s1 = samples[Math.min(i + 1, samples.length - 1)];
  var span = Math.max(1e-9, s1.t - s0.t);
  var alpha = Math.max(0, Math.min(1, (t - s0.t) / span));
  var out = [];
  active.forEach(function(sg) {
    var v0 = scopeSignalValueAt(samples, sg, i);
    var v1 = scopeSignalValueAt(samples, sg, Math.min(i + 1, samples.length - 1));
    out.push({ id: sg.id, label: sg.label, group: sg.group, color: SCOPE_COLORS[sigs.indexOf(sg) % SCOPE_COLORS.length], value: v0 + (v1 - v0) * alpha });
  });
  return { time: s0.t + (s1.t - s0.t) * alpha, index: i, values: out };
}
function scopeTickLists(minVal, maxVal, targetMajorCount) {
  var span = Math.max(1e-9, maxVal - minVal);
  var majorStep = niceStep(span / Math.max(2, targetMajorCount));
  var minorStep = majorStep / 5;
  var firstMajor = Math.ceil(minVal / majorStep) * majorStep;
  var firstMinor = Math.ceil(minVal / minorStep) * minorStep;
  var majors = [], minors = [];
  for (var v = firstMinor; v <= maxVal + 1e-9; v += minorStep) {
    if (Math.abs(v / majorStep - Math.round(v / majorStep)) < 1e-6) majors.push(v); else minors.push(v);
  }
  if (!majors.length) majors.push(firstMajor);
  return { majorStep: majorStep, minorStep: minorStep, majors: majors, minors: minors };
}
function renderScopeView(opts) {
  opts = opts || {};
  ensureScopeSel();
  var svgId = opts.svgId || 'scopeSvg';
  var checklistId = opts.checklistId || 'scopeChecklist';
  var readoutId = opts.readoutId || 'scopeReadout';
  var W = opts.width || 1000;
  var H = opts.height || 260;
  var padL = opts.padL != null ? opts.padL : 60;
  var padR = opts.padR != null ? opts.padR : 20;
  var padT = opts.padT != null ? opts.padT : 16;
  var padB = opts.padB != null ? opts.padB : 30;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var dur = Math.max(0.001, simUI.duration);
  var samples = (state.mode === 'pend') ? simUI.pendSamples : simUI.stateSamples;
  var sigs = buildScopeSignals();
  var active = sigs.filter(function(s) { return simUI.scopeSel[s.id]; });

  var outMax = 0.001, inMax = 0.001;
  if (samples.length) {
    for (var i = 0; i < samples.length; i++) {
      active.forEach(function(sg) {
        try {
          var v = sg.get(0, i, samples[i]);
          if (!isFinite(v)) return;
          if (sg.group === 'in') inMax = Math.max(inMax, Math.abs(v));
          else outMax = Math.max(outMax, Math.abs(v));
        } catch (e) {}
      });
    }
  }
  outMax *= 1.2; inMax *= 1.2;
  function sx(t) { return padL + (t / dur) * plotW; }
  function syG(v, isIn) {
    var m = isIn ? inMax : outMax;
    return padT + plotH / 2 - (v / m) * (plotH / 2 - 6);
  }

  var timeTicks = scopeTickLists(0, dur, Math.max(4, Math.round(plotW / (opts.expanded ? 110 : 140))));
  var outTicks = scopeTickLists(-outMax, outMax, Math.max(4, Math.round(plotH / (opts.expanded ? 70 : 90))));
  var inTicks = scopeTickLists(-inMax, inMax, Math.max(4, Math.round(plotH / (opts.expanded ? 70 : 90))));

  var svg = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--bg-grid)"/>';
  timeTicks.minors.forEach(function(t) {
    var xx = sx(t);
    svg += '<line x1="' + xx + '" y1="' + padT + '" x2="' + xx + '" y2="' + (padT + plotH) + '" stroke="var(--edge-soft)" stroke-width="0.7" opacity="0.55"/>';
  });
  timeTicks.majors.forEach(function(t) {
    var xx = sx(t);
    svg += '<line x1="' + xx + '" y1="' + padT + '" x2="' + xx + '" y2="' + (padT + plotH) + '" stroke="var(--edge-soft)" stroke-width="1.2"/>';
    svg += '<text x="' + xx + '" y="' + (H - 8) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">' + fmtNum(t, 1) + '</text>';
  });
  outTicks.minors.forEach(function(v) {
    var yy = padT + plotH / 2 - (v / outMax) * (plotH / 2 - 6);
    if (yy <= padT || yy >= padT + plotH) return;
    svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (padL + plotW) + '" y2="' + yy + '" stroke="var(--edge-soft)" stroke-width="0.7" opacity="0.55"/>';
  });
  outTicks.majors.forEach(function(v) {
    var yy = padT + plotH / 2 - (v / outMax) * (plotH / 2 - 6);
    if (yy <= padT || yy >= padT + plotH) return;
    svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (padL + plotW) + '" y2="' + yy + '" stroke="var(--edge-soft)" stroke-width="1.1"/>';
  });
  svg += '<line x1="' + padL + '" y1="' + (padT + plotH / 2) + '" x2="' + (padL + plotW) + '" y2="' + (padT + plotH / 2) + '" stroke="var(--edge)" stroke-width="1.5"/>';
  // Ejes Y izquierdo (salidas) y derecho (entradas)
  svg += '<text x="6" y="' + (padT + 10) + '" fill="var(--c-mass)" font-family="monospace" font-size="9.5">+' + fmtNum(outMax, 2) + '</text>';
  svg += '<text x="6" y="' + (padT + plotH / 2 + 3) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">0</text>';
  svg += '<text x="6" y="' + (padT + plotH - 2) + '" fill="var(--c-mass)" font-family="monospace" font-size="9.5">-' + fmtNum(outMax, 2) + '</text>';
  svg += '<text x="' + (W - 4) + '" y="' + (padT + 10) + '" text-anchor="end" fill="var(--c-force)" font-family="monospace" font-size="9.5">+' + fmtNum(inMax, 2) + '</text>';
  svg += '<text x="' + (W - 4) + '" y="' + (padT + plotH - 2) + '" text-anchor="end" fill="var(--c-force)" font-family="monospace" font-size="9.5">-' + fmtNum(inMax, 2) + '</text>';
  svg += '<text x="' + (padL + plotW / 2) + '" y="' + (H - 2) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">t [s]</text>';

  var cursor = simUI.scopeCursor && simUI.scopeCursor.active ? scopeCursorValues(samples, sigs, active, simUI.scopeCursor.t) : null;
  if (samples.length > 1 && active.length) {
    active.forEach(function(sg) {
      var color = SCOPE_COLORS[sigs.indexOf(sg) % SCOPE_COLORS.length];
      var isIn = sg.group === 'in';
      var pts = [];
      for (var i = 0; i < samples.length; i++) {
        try {
          var v = sg.get(0, i, samples[i]);
          if (!isFinite(v)) continue;
          pts.push(sx(samples[i].t) + ',' + syG(v, isIn));
        } catch (e) {}
      }
      if (pts.length > 1) {
        var dash = isIn ? ' stroke-dasharray="4 3"' : '';
        svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + (isIn ? 1.6 : 2.1) + '"' + dash + ' opacity="0.95"/>';
      }
    });
  } else if (!active.length) {
    svg += '<text x="' + (padL + plotW / 2) + '" y="' + (padT + plotH / 2 - 8) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="12">Marca al menos una señal en la lista.</text>';
  } else {
    svg += '<text x="' + (padL + plotW / 2) + '" y="' + (padT + plotH / 2 - 8) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="12">Presiona Simular para ver la respuesta.</text>';
  }
  if (cursor) {
    var cx = sx(cursor.time);
    svg += '<line x1="' + cx + '" y1="' + padT + '" x2="' + cx + '" y2="' + (padT + plotH) + '" stroke="var(--c-force)" stroke-width="1.4" stroke-dasharray="5 4"/>';
    cursor.values.forEach(function(v) {
      var y = syG(v.value, v.group === 'in');
      svg += '<circle cx="' + cx + '" cy="' + y + '" r="3.5" fill="' + v.color + '" stroke="var(--panel)" stroke-width="1"/>';
    });
  }

  var el = document.getElementById(svgId);
  if (el) {
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el.innerHTML = svg;
    el.dataset.scopeRendered = '1';
    el.__scopeMeta = { W: W, H: H, padL: padL, padR: padR, padT: padT, padB: padB, plotW: plotW, plotH: plotH, dur: dur, expanded: !!opts.expanded };
    bindScopePointer(el, opts);
  }

  var cl = document.getElementById(checklistId);
  if (cl) {
    var html = '';
    sigs.forEach(function(sg) {
      var color = SCOPE_COLORS[sigs.indexOf(sg) % SCOPE_COLORS.length];
      var checked = simUI.scopeSel[sg.id] ? ' checked' : '';
      var cls = sg.group === 'in' ? 'in' : 'out';
      html += '<label class="scope-chk ' + cls + '"><input type="checkbox" data-scope-sig="' + sg.id + '"' + checked + '>'
        + '<span class="sw" style="background:' + color + (sg.group === 'in' ? ';border:1.5px dashed ' + color : '') + '"></span>'
        + '<span class="lbl">' + sg.label + '</span></label>';
    });
    cl.innerHTML = html;
    bindScopeChecklist(cl, opts);
  }

  var readout = document.getElementById(readoutId);
  if (readout) {
    if (cursor) {
      var rows = cursor.values.map(function(v) {
        return '<div class="scope-readout-row"><span>' + v.label + '</span><span style="color:' + v.color + '">' + fmtNum(v.value, 4) + '</span></div>';
      }).join('');
      readout.innerHTML = '<div class="scope-readout-head">Cursor · t = ' + fmtNum(cursor.time, 4) + ' s</div>' + rows;
    } else if (!samples.length) {
      readout.innerHTML = '<div class="scope-readout-empty">Activa la simulación para registrar muestras.</div>';
    } else {
      readout.innerHTML = '<div class="scope-readout-empty">Haz click o arrastra sobre la gráfica para leer un instante.</div>';
    }
  }
}
function renderScope() { renderScopeView({ svgId: 'scopeSvg', checklistId: 'scopeChecklist', readoutId: 'scopeReadout', width: 1000, height: 260, expanded: false }); }

function bindScopePointer(svg, opts) {
  if (!svg || svg.dataset.scopePointerWired === '1') return;
  svg.dataset.scopePointerWired = '1';
  function setCursorFromEvent(e) {
    var meta = svg.__scopeMeta;
    if (!meta) return;
    var rect = svg.getBoundingClientRect();
    var relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    var t = Math.max(0, Math.min(meta.dur, relX * meta.dur));
    simUI.scopeCursor = { active: true, t: t };
    renderScopeView(opts || { svgId: 'scopeSvg', checklistId: 'scopeChecklist', readoutId: 'scopeReadout', width: 1000, height: 260, expanded: false });
    if (typeof syncGraphViewer === 'function') syncGraphViewer();
  }
  svg.addEventListener('pointerdown', function(e) {
    if (e.button !== 0) return;
    setCursorFromEvent(e);
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  svg.addEventListener('pointermove', function(e) {
    if (e.buttons) setCursorFromEvent(e);
  });
}

function bindScopeChecklist(el, opts) {
  if (!el || el.dataset.scopeChecklistWired === '1') return;
  el.dataset.scopeChecklistWired = '1';
  el.addEventListener('change', function(e) {
    var sig = e.target && e.target.getAttribute('data-scope-sig');
    if (!sig) return;
    if (!simUI.scopeSel) simUI.scopeSel = {};
    simUI.scopeSel[sig] = !!e.target.checked;
    renderScopeView(opts || { svgId: 'scopeSvg', checklistId: 'scopeChecklist', readoutId: 'scopeReadout', width: 1000, height: 260, expanded: false });
    if (typeof syncGraphViewer === 'function') syncGraphViewer();
  });
}

/* Reloj perpetuo para animación del cuadro con excéntrica.
   Independiente de la simulación: el disco siempre gira a la rpm configurada. */
var drumClock = { raf: null, t0: 0 };
function drumTick() {
  drumClock.raf = null;
  if (state.mode !== 'trans') return;
  var hasDrum = state.nodes.some(function(n) { return n.kind === 'drum' && (n.omega || 0) > 0; });
  if (!hasDrum) return;
  if (simUI.running) return;
  var now = performance.now() / 1000;
  var offsets = {};
  state.nodes.forEach(function(n) {
    if (n.kind !== 'drum') return;
    var deg = ((n.omega || 0) * now) * 180 / Math.PI + (n.phase || 0);
    offsets[n.id] = { dx: 0, angleDeg: deg };
  });
  renderCanvas(offsets);
  drumClock.raf = requestAnimationFrame(drumTick);
}
function ensureDrumClock() {
  if (drumClock.raf) return;
  drumClock.raf = requestAnimationFrame(drumTick);
}

/* =========================================================================
   Interacciones del lienzo: arrastrar, redimensionar, conectar, seleccionar
   ========================================================================= */
var PALETTE_BTN_IDS = { spring: 'addSpringBtn', damper: 'addDamperBtn', force: 'addForceBtn' };
var dragState = null;
var justDragged = false;
var lastClickKey = null;
var lastClickTime = 0;
var reattachPreview = null;
function findNodeNear(pt) {
  var best = null, bestDist = Infinity;
  state.nodes.forEach(function(n) {
    var he = nodeHalfExtents(n);
    var d = Math.hypot(n.x - pt.x, n.y - pt.y);
    var threshold = Math.max(he.hw, he.hh) * 1.5 + 24;
    if (d < threshold && d < bestDist) { bestDist = d; best = n; }
  });
  return best;
}
function reattachPreviewMarkup() {
  var p = reattachPreview;
  var s = '<line x1="' + p.fixedX + '" y1="' + p.fixedY + '" x2="' + p.curX + '" y2="' + p.curY + '" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 4" opacity="0.75"/>';
  s += '<circle cx="' + p.curX + '" cy="' + p.curY + '" r="8" fill="none" stroke="var(--ink)" stroke-width="2"/>';
  if (p.candidateId) {
    var cn = getNode(p.candidateId);
    if (cn) { var he = nodeHalfExtents(cn); s += '<circle cx="' + cn.x + '" cy="' + cn.y + '" r="' + (Math.max(he.hw,he.hh)+10) + '" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.6"/>'; }
  }
  return s;
}

/* ---- zoom & pan (viewBox-based) ---- */
