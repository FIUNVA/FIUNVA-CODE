/* ============================================================
   SYNTAX HIGHLIGHTING (overlay behind the transparent textarea)
   ============================================================ */
const TOK_CLASS = {
  G: 'tok-G', M: 'tok-M', N: 'tok-N', T: 'tok-T', O: 'tok-O',
  X: 'tok-X', Z: 'tok-Z', U: 'tok-U', W: 'tok-W',
  F: 'tok-F', S: 'tok-S', R: 'tok-R', P: 'tok-P', Q: 'tok-Q',
};

function highlightLine(raw) {
  // split off a trailing comment in parentheses, if present, and highlight it dimly
  let code = raw, comment = '';
  const cIdx = raw.indexOf('(');
  if (cIdx !== -1) { code = raw.slice(0, cIdx); comment = raw.slice(cIdx); }
  let out = '';
  let last = 0;
  const re = /([A-Za-z])\s*([-+]?[0-9.]+)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    const letter = m[1].toUpperCase();
    const cls = TOK_CLASS[letter] || 'tok-other';
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = re.lastIndex;
  }
  out += escapeHtml(code.slice(last));
  if (comment) out += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
  return out || '\u200b';
}

let warnLinesSet = new Set();
let noSemiLinesSet = new Set();
let activeLine = -1;

function renderHighlight() {
  const lines = el.input.value.split(/\n/);
  let html = '';
  for (let i = 0; i < lines.length; i++) {
    const classes = ['line-run'];
    if (i === activeLine) classes.push('active');
    if (warnLinesSet.has(i)) classes.push('haswarn');
    if (noSemiLinesSet.has(i)) classes.push('nosemi');
    html += `<span class="${classes.join(' ')}" data-line="${i}">${highlightLine(lines[i])}</span>`;
  }
  el.highlight.innerHTML = html;
  renderLineNumbers(lines.length);
  // Rewriting innerHTML resets each layer's own scroll position; re-sync all
  // of them to the textarea (the source of truth) so the caret, the lit line
  // and the gutter number keep pointing at the same row.
  el.highlight.scrollTop = el.input.scrollTop;
  el.highlight.scrollLeft = el.input.scrollLeft;
  el.lineNumbers.scrollTop = el.input.scrollTop;
}

function renderLineNumbers(n) {
  let html = '';
  for (let i = 1; i <= n; i++) {
    const idx = i - 1;
    const cls = ['lnRow'];
    if (idx === activeLine) cls.push('cur');
    if (warnLinesSet.has(idx)) cls.push('warnline');
    if (noSemiLinesSet.has(idx)) cls.push('nosemiline');
    html += `<span class="${cls.join(' ')}">${i}</span>`;
  }
  el.lineNumbers.innerHTML = html;
}

el.input.addEventListener('scroll', () => {
  el.highlight.scrollTop = el.input.scrollTop;
  el.highlight.scrollLeft = el.input.scrollLeft;
  el.lineNumbers.scrollTop = el.input.scrollTop;
});

function scrollActiveLineIntoView() {
  // The three editor layers (line numbers, highlight overlay, textarea) must
  // scroll as one. scrollIntoView() would move ONLY the highlight layer,
  // leaving the textarea and gutter behind — which is what made the caret and
  // the lit line drift apart after the first simulation. Compute the target
  // offset and drive the textarea instead; its scroll handler syncs the rest.
  const span = el.highlight.querySelector(`[data-line="${activeLine}"]`);
  if (!span) return;
  const lineTop = span.offsetTop;
  const lineH = span.offsetHeight || 19;
  const viewH = el.input.clientHeight;
  const cur = el.input.scrollTop;
  let next = cur;
  if (lineTop < cur) next = lineTop;
  else if (lineTop + lineH > cur + viewH) next = lineTop + lineH - viewH;
  if (next !== cur) {
    el.input.scrollTop = next;
    el.highlight.scrollTop = next;
    el.lineNumbers.scrollTop = next;
  }
}

