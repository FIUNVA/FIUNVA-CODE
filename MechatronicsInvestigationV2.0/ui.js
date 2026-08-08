import { GameState } from './state.js';
import { crewmateSVG } from './helpers.js';
import { renderFactoryMap, attachMapEvents, investigateRoom, closeClue } from './map.js';
import { renderFlowchart } from './flowchart.js';

let gameData = null;

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setActiveTab(tab) {
  $all('.nav-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
}

export function init(data) {
  gameData = data;
  attachEvents();
  renderIntro();
}

function attachEvents() {
  $('#tab-game').addEventListener('click', () => switchTab('game'));
  $('#tab-flow').addEventListener('click', () => switchTab('flow'));
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-back-intro').addEventListener('click', () => showScreen('intro'));
  $('#btn-start-invest').addEventListener('click', startInvestigation);
  $('#btn-accuse').addEventListener('click', goAccuse);
  $('#btn-accuse2').addEventListener('click', goAccuse);
  $('#btn-back-briefing').addEventListener('click', goBriefing);
  $('#btn-back-invest').addEventListener('click', goInvest);
  $('#btn-submit').addEventListener('click', submitAccusation);
  $('#btn-restart').addEventListener('click', restartGame);
  $('#clue-close').addEventListener('click', closeClue);
  attachMapEvents((locId) => {
    handleRoomInvestigation(locId);
  });
}

function showScreen(name) {
  closeClue();
  GameState.setScreen(name);
  $all('.screen').forEach((screen) => screen.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.add('active');
  }
  updateBadge();
}

export function switchTab(tab) {
  GameState.currentTab = tab;
  setActiveTab(tab);

  if (tab === 'flow') {
    showScreen('flow');
    renderFlowchart(gameData);
    return;
  }

  showScreen(GameState.lastGameScreen || 'intro');
}

function updateBadge() {
  const badge = $('#nav-story-badge');
  if (GameState.currentStory && GameState.currentScreen !== 'intro') {
    badge.textContent = `CASO: ${GameState.currentStory.title.split('—')[0].trim()}`;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

function renderIntro() {
  const wrap = $('#intro-crewmates');
  wrap.innerHTML = gameData.CHARS.slice(0, 5).map((c) => `
    <div class="intro-card">
      ${crewmateSVG(c.col, 56)}
      <div class="intro-card-name" style="color:${c.col}">${c.name.split(' ')[0]}</div>
      <div class="intro-card-role">${c.role.split(' ').slice(0, 2).join(' ')}</div>
    </div>
  `).join('');
}

function startGame() {
  GameState.reset();
  const randomIndex = Math.floor(Math.random() * gameData.STORIES.length);
  GameState.currentStory = gameData.STORIES[randomIndex];
  renderBriefing();
  showScreen('briefing');
}

function restartGame() {
  startGame();
}

function renderBriefing() {
  $('#brief-title').textContent = GameState.currentStory.title;
  $('#brief-incident').textContent = GameState.currentStory.incident;

  $('#brief-chars').innerHTML = gameData.CHARS.slice(0, 5).map((c) => {
    const imgMap = { carlos: 'CARLOS.png', ana: 'ANA.png', luis: 'LUIS.png', maria: 'MARIA.png' };
    const imgFile = imgMap[c.id] || null;
    const imgHTML = imgFile ? `<img src="Images/${imgFile}" alt="${c.name}" class="char-card-image">` : `<div style="width:140px;height:160px;display:flex;align-items:center;justify-content:center;background:var(--surf3);border-radius:8px;margin-bottom:12px">${crewmateSVG(c.col, 60)}</div>`;
    return `
    <div class="char-card">
      ${imgHTML}
      <div class="char-card-info">
        <div class="char-name" style="color:${c.col}">${c.name}</div>
        <div class="char-role">${c.role}</div>
        <div class="char-bio">${c.bio}</div>
      </div>
    </div>
  `}).join('');

  $('#brief-locs').innerHTML = gameData.LOCS.map((l) => `
    <div class="loc-tag">${l.icon} ${l.name}</div>
  `).join('');

  $('#brief-causes').innerHTML = gameData.CAUSES.map((c) => `
    <div class="cause-tag">${c.icon} ${c.name}</div>
  `).join('');
}

function startInvestigation() {
  renderSidebar();
  renderFactoryMap(gameData.LOCS, GameState.visitedLocs);
  updateInvestUI();
  showScreen('invest');
}

function renderSidebar() {
  $('#sidebar-crew').innerHTML = gameData.CHARS.slice(0, 5).map((c) => `
    <div class="crew-item" id="crew-${c.id}">
      ${crewmateSVG(c.col, 32)}
      <div>
        <div class="crew-name" style="color:${c.col}">${c.name.split(' ')[0]}</div>
        <div class="crew-status mono" style="color:var(--dim)">${c.role.split(' ')[0]}</div>
      </div>
    </div>
  `).join('');
}

function updateInvestUI() {
  $('#invest-top-title').textContent = `🔍 ${GameState.currentStory.title}`;
  $('#invest-counter').textContent = `Locaciones: ${GameState.visitedLocs.length}/5`;
  $('#invest-clues').textContent = `Pistas: ${GameState.foundClues.length}/5`;

  const canAccuse = GameState.canAccuse();
  const warn = $('#invest-warn');
  warn.style.display = canAccuse ? 'none' : 'flex';
  if (!canAccuse) {
    warn.textContent = `⚠ Visita ${3 - GameState.visitedLocs.length} locación(es) más para poder acusar`;
  }

  $('#btn-accuse').disabled = !canAccuse;
  $('#btn-accuse2').disabled = !canAccuse;

  const nbEmpty = $('#nb-empty');
  const nbEntries = $('#nb-entries');
  nbEmpty.style.display = GameState.foundClues.length ? 'none' : 'block';
  nbEntries.innerHTML = GameState.foundClues.map((cl) => {
    const loc = gameData.LOCS.find((l) => l.id === cl.locId);
    return `<div class="nb-entry ${cl.hot ? 'hot' : ''}">
      <div class="nb-entry-loc">${loc.icon} ${loc.name}${cl.hot ? ' — ⚡ RELEVANTE' : ''}</div>
      <div class="nb-entry-text">${cl.text}</div>
    </div>`;
  }).join('');
}

function handleRoomInvestigation(locId) {
  const result = investigateRoom(locId, gameData.LOCS);
  if (!result) return;

  const { loc, clueData } = result;
  const panel = $('#clue-panel');
  panel.className = `${clueData.hot ? 'hot' : 'cold'} show`;
  $('#clue-tag').textContent = clueData.hot ? '⚡ EVIDENCIA RELEVANTE' : '◆ OBSERVACIÓN';
  $('#clue-loc').textContent = `${loc.icon} ${loc.name}`;
  $('#clue-body').textContent = clueData.text;

  renderFactoryMap(gameData.LOCS, GameState.visitedLocs);
  updateInvestUI();
}

function goAccuse() {
  if (!GameState.canAccuse()) {
    alert('Debes investigar al menos 3 locaciones antes de acusar.');
    return;
  }
  renderAccusation();
  showScreen('accuse');
}

function goBriefing() {
  showScreen('briefing');
}

function goInvest() {
  renderFactoryMap(gameData.LOCS, GameState.visitedLocs);
  updateInvestUI();
  showScreen('invest');
}

function renderAccusation() {
  GameState.resetAccusation();
  updateAccusationSummary();

  $('#acc-chars').innerHTML = gameData.CHARS.map((c) => {
    const imgMap = { carlos: 'CARLOS.png', ana: 'ANA.png', luis: 'LUIS.png', maria: 'MARIA.png' };
    const imgFile = imgMap[c.id];
    const imgHTML = imgFile 
      ? `<img src="Images/${imgFile}" alt="${c.name}" class="select-item-image">`
      : `<div style="width:100px;height:120px;display:flex;align-items:center;justify-content:center;background:var(--surf3);border-radius:6px;margin-bottom:10px;border:1px solid var(--bdr)">${crewmateSVG(c.col, 40)}</div>`;
    return `
    <div class="select-item select-item-with-image" data-field="culprit" data-value="${c.id}">
      ${imgHTML}
      <div class="select-item-name" style="color:${c.col}">${c.name}</div>
      <div class="select-item-sub">${c.role}</div>
    </div>
  `}).join('');

  $('#acc-causes').innerHTML = gameData.CAUSES.map((c) => `
    <div class="select-item" data-field="cause" data-value="${c.id}">
      <div class="select-item-icon">${c.icon}</div>
      <div class="select-item-name">${c.name}</div>
      <div class="select-item-sub">${c.desc.substring(0, 40)}…</div>
    </div>
  `).join('');

  $('#acc-locs').innerHTML = gameData.LOCS.map((l) => `
    <div class="select-item" data-field="location" data-value="${l.id}">
      <div class="select-item-icon">${l.icon}</div>
      <div class="select-item-name">${l.name}</div>
      <div class="select-item-sub">${l.desc.substring(0, 40)}…</div>
    </div>
  `).join('');

  $all('.select-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectAcc(item.dataset.field, item.dataset.value, item);
    });
  });
}

function selectAcc(field, value, element) {
  const parent = element.parentElement;
  parent.querySelectorAll('.select-item').forEach((item) => item.classList.remove('chosen'));
  element.classList.add('chosen');
  GameState.accusation[field] = value;
  updateAccusationSummary();
  
  // Mostrar tarjeta de perfil si se selecciona un culpable
  if (field === 'culprit') {
    showProfileCard(value);
  }
}

function showProfileCard(charId) {
  const ch = gameData.CHARS.find((c) => c.id === charId);
  if (!ch) return;
  
  const imgMap = { carlos: 'CARLOS.png', ana: 'ANA.png', luis: 'LUIS.png', maria: 'MARIA.png' };
  const imgFile = imgMap[charId];
  const imgHTML = imgFile 
    ? `<img src="Images/${imgFile}" alt="${ch.name}" class="profile-image selected">`
    : `<div style="width:180px;height:220px;display:flex;align-items:center;justify-content:center;background:var(--surf3);border-radius:8px;border:2px solid var(--amber);margin:0 auto 16px">${crewmateSVG(ch.col, 100)}</div>`;
  
  let profileSection = $('#accuse-visual-section');
  if (!profileSection) {
    profileSection = document.createElement('div');
    profileSection.id = 'accuse-visual-section';
    $('#acc-chars').parentElement.insertBefore(profileSection, $('#acc-chars'));
  }
  
  profileSection.innerHTML = `
    <div class="profile-card">
      ${imgHTML}
      <div class="profile-name">${ch.name}</div>
      <div class="profile-role">${ch.role}</div>
      <div class="profile-bio">${ch.bio}</div>
    </div>
  `;
}

function updateAccusationSummary() {
  const ch = gameData.CHARS.find((c) => c.id === GameState.accusation.culprit);
  const ca = gameData.CAUSES.find((c) => c.id === GameState.accusation.cause);
  const lo = gameData.LOCS.find((l) => l.id === GameState.accusation.location);

  const sv = $('#acc-s-char');
  const scv = $('#acc-s-cause');
  const slv = $('#acc-s-loc');

  if (ch) { sv.textContent = ch.name; sv.className = 'acc-value set'; }
  else { sv.textContent = '— Sin seleccionar'; sv.className = 'acc-value empty'; }
  if (ca) { scv.textContent = ca.name; scv.className = 'acc-value set'; }
  else { scv.textContent = '— Sin seleccionar'; scv.className = 'acc-value empty'; }
  if (lo) { slv.textContent = lo.name; slv.className = 'acc-value set'; }
  else { slv.textContent = '— Sin seleccionar'; slv.className = 'acc-value empty'; }

  const complete = GameState.accusation.culprit && GameState.accusation.cause && GameState.accusation.location;
  $('#btn-submit').disabled = !complete;
  $('#acc-note').textContent = complete
    ? '¡Acusación lista! Haz clic en "PRESENTAR ACUSACIÓN" cuando estés seguro.'
    : `Selecciona los ${(!GameState.accusation.culprit ? 1 : 0) + (!GameState.accusation.cause ? 1 : 0) + (!GameState.accusation.location ? 1 : 0)} campo(s) restante(s)`;
}

function submitAccusation() {
  const win = GameState.accusation.culprit === GameState.currentStory.culprit
    && GameState.accusation.cause === GameState.currentStory.cause
    && GameState.accusation.location === GameState.currentStory.location;
  renderReveal(win);
  showScreen('reveal');
}

function renderReveal(win) {
  const banner = $('#verdict-banner');
  banner.className = `verdict-banner ${win ? 'win' : 'lose'}`;
  $('#verdict-title').textContent = win
    ? '✅ ¡DIAGNÓSTICO CORRECTO!' : '❌ DIAGNÓSTICO INCORRECTO';
  $('#verdict-sub').textContent = win
    ? '¡Identificaste al responsable, la causa y el lugar correctamente! La línea puede reanudarse.'
    : 'Tu hipótesis no coincide con la evidencia real del caso. El saboteador sigue libre...';

  const cg = $('#compare-grid');
  if (!win) {
    cg.style.display = 'grid';
    const fields = [
      ['Acusado', gameData.CHARS.find((c) => c.id === GameState.accusation.culprit)?.name || '—', gameData.CHARS.find((c) => c.id === GameState.currentStory.culprit)?.name || '—'],
      ['Causa', gameData.CAUSES.find((c) => c.id === GameState.accusation.cause)?.name || '—', gameData.CAUSES.find((c) => c.id === GameState.currentStory.cause)?.name || '—'],
      ['Lugar', gameData.LOCS.find((l) => l.id === GameState.accusation.location)?.name || '—', gameData.LOCS.find((l) => l.id === GameState.currentStory.location)?.name || '—']
    ];
    $('#compare-player').innerHTML = fields.map(([l, p]) => `
      <div class="compare-field">
        <div class="compare-field-l">${l}</div>
        <div class="compare-field-v" style="color:var(--red)">${p}</div>
      </div>`).join('');
    $('#compare-answer').innerHTML = fields.map(([l, , a]) => `
      <div class="compare-field">
        <div class="compare-field-l">${l}</div>
        <div class="compare-field-v">${a}</div>
      </div>`).join('');
  } else {
    cg.style.display = 'none';
  }

  const culprit = gameData.CHARS.find((c) => c.id === GameState.currentStory.culprit);
  const cause = gameData.CAUSES.find((c) => c.id === GameState.currentStory.cause);
  const location = gameData.LOCS.find((l) => l.id === GameState.currentStory.location);

  $('#solution-cards').innerHTML = [
    { l: 'RESPONSABLE', icon: crewmateSVG(culprit.col, 42), name: culprit.name, sub: culprit.role, c: culprit.col },
    { l: 'CAUSA / "ARMA"', icon: cause.icon, name: cause.name, sub: cause.desc, c: '#f59e0b' },
    { l: 'LOCACIÓN', icon: location.icon, name: location.name, sub: location.desc, c: '#38bdf8' }
  ].map(({ l, icon, name, sub, c }) => `
    <div class="sol-card" style="border-top-color:${c}">
      <div class="sol-card-l" style="color:${c}">${l}</div>
      <div class="sol-card-icon">${icon}</div>
      <div class="sol-card-name" style="color:${c}">${name}</div>
      <div class="sol-card-sub">${sub}</div>
    </div>
  `).join('');

  let narrative = '';
  if (GameState.currentStory.motive) {
    narrative += `<div class="narr-section motive">
      <div class="narr-section-l">▼ MOTIVO / LO QUE OCURRIÓ</div>
      <div class="narr-text">${GameState.currentStory.motive}</div>
    </div>`;
  } else {
    narrative += `<div class="narr-section motive">
      <div class="narr-section-l" style="color:var(--blue)">▼ CAUSA RAÍZ</div>
      <div class="narr-text">Esta falla no tuvo un responsable humano. Fue una falla natural por fin de vida útil del componente, agravada por un programa de mantenimiento preventivo desactualizado.</div>
    </div>`;
  }

  narrative += `<div class="narr-section ending">
    <div class="narr-section-l">▼ DESENLACE</div>
    <div class="narr-text">${GameState.currentStory.ending}</div>
  </div>`;

  $('#narr-content').innerHTML = narrative;
}
