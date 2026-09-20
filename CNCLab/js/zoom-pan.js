/* ============================================================
   CNC VIEWPORT — ZOOM (mouse wheel) & PAN (drag / scrollbars)
   The SVG's viewBox always frames the full scene; zoom is done by
   resizing the SVG element itself inside a scrollable container, so
   native scrollbars appear automatically once it's larger than the
   viewport — exactly like panning/zooming a large image.
   ============================================================ */
let zoomLevel = 1;
const ZOOM_MIN = 0.4, ZOOM_MAX = 10;

function applyZoom(newZoom, anchorClientX, anchorClientY) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const vp = el.viewport;
  const rect = vp.getBoundingClientRect();
  const mouseX = (anchorClientX !== undefined ? anchorClientX : rect.left + rect.width / 2) - rect.left;
  const mouseY = (anchorClientY !== undefined ? anchorClientY : rect.top + rect.height / 2) - rect.top;
  const oldSvgRect = el.svg.getBoundingClientRect();
  const oldW = oldSvgRect.width || rect.width, oldH = oldSvgRect.height || rect.height;
  const fracX = (vp.scrollLeft + mouseX) / oldW;
  const fracY = (vp.scrollTop + mouseY) / oldH;
  zoomLevel = newZoom;
  if (Math.abs(zoomLevel - 1) < 0.015) {
    el.svg.style.width = '100%';
    el.svg.style.height = '100%';
  } else {
    el.svg.style.width = (rect.width * zoomLevel) + 'px';
    el.svg.style.height = (rect.height * zoomLevel) + 'px';
  }
  const newW = el.svg.getBoundingClientRect().width, newH = el.svg.getBoundingClientRect().height;
  vp.scrollLeft = fracX * newW - mouseX;
  vp.scrollTop = fracY * newH - mouseY;
}

el.viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
  applyZoom(zoomLevel * factor, e.clientX, e.clientY);
}, { passive: false });

let dragging = false, dragStartX = 0, dragStartY = 0, dragScrollLeft = 0, dragScrollTop = 0;
el.viewport.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  el.viewport.classList.add('grabbing');
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragScrollLeft = el.viewport.scrollLeft; dragScrollTop = el.viewport.scrollTop;
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  el.viewport.scrollLeft = dragScrollLeft - (e.clientX - dragStartX);
  el.viewport.scrollTop = dragScrollTop - (e.clientY - dragStartY);
});
window.addEventListener('mouseup', () => {
  dragging = false;
  el.viewport.classList.remove('grabbing');
});

function resetView() {
  zoomLevel = 1;
  el.svg.style.width = '100%';
  el.svg.style.height = '100%';
  el.viewport.scrollLeft = 0;
  el.viewport.scrollTop = 0;
}

// A wider framing that also reaches the tool's initial/reference (machine
// zero) position — computed on demand, never used for the normal/default
// view, so the everyday view of the part stays tightly cropped.
function computeHomeViewBox(bounds, g71StockMag, home) {
  const base = computeViewBox(bounds, g71StockMag);
  if (!home) return base;
  const pad = Math.max(base.stockLen * 0.15, 8);
  const viewZmax = Math.max(base.viewZmax, home.z + pad);
  const viewZmin = Math.min(base.viewZmin, home.z - pad);
  const xHalf = Math.max(base.xHalf, Math.abs(home.x) * 1.15 + pad);
  return { ...base, viewZmax, viewZmin, xHalf };
}

// HOME: shows the whole scene — the piece plus the tool's initial (machine
// zero / reference) position — by widening the camera frame, not the
// simulation; the next normal render restores the usual tight framing.
el.btnHome.addEventListener('click', () => {
  if (lastResult) {
    const hvb = computeHomeViewBox(lastResult.bounds, lastResult.g71StockMag, lastResult.home);
    el.svg.setAttribute('viewBox', `${hvb.viewZmin} ${-hvb.xHalf} ${hvb.viewZmax - hvb.viewZmin} ${hvb.xHalf * 2}`);
  }
  resetView();
});

