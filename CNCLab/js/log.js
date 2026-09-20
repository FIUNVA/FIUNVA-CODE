/* ============================================================
   LOG / WARNINGS PANEL
   ============================================================ */
function renderLog(warnings, noSemiLines) {
  warnLinesSet = new Set(warnings.map(w => w.line).filter(l => l !== undefined));
  noSemiLinesSet = new Set(noSemiLines || []);
  if (!warnings.length && !noSemiLinesSet.size) {
    el.logPanel.innerHTML = '<div class="log-empty">Sin observaciones — sintaxis y geometría verificadas.</div>';
    return;
  }
  let html = '';
  for (const idx of noSemiLinesSet) {
    html += `<div class="log-row nosemi"><span class="tag tagAmber">N.${idx + 1}</span><span class="msg">Falta punto y coma (;) al final del bloque — <b>la línea se ignora por completo</b>.</span></div>`;
  }
  for (const w of warnings) {
    const lineTxt = (w.line !== undefined) ? `N.${w.line + 1}` : '';
    html += `<div class="log-row"><span class="tag">${lineTxt || '!'}</span><span class="msg">${escapeHtml(w.message)}</span></div>`;
  }
  el.logPanel.innerHTML = html;
}

