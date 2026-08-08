import { GameState } from './state.js';
import { crewmateSVG } from './helpers.js';

const ROOM_CONFIG = [
  { id: 'control', x: 30, y: 30, w: 180, h: 120 },
  { id: 'almacen', x: 490, y: 30, w: 180, h: 120 },
  { id: 'ensamble', x: 220, y: 160, w: 260, h: 160 },
  { id: 'subestacion', x: 30, y: 330, w: 180, h: 120 },
  { id: 'soldadura', x: 490, y: 330, w: 180, h: 120 }
];

const DECOR_MAP = {
  control: { dx: -18, dy: 0 },
  almacen: { dx: 18, dy: 0 },
  ensamble: { dx: 0, dy: 14 },
  subestacion: { dx: 0, dy: 0 },
  soldadura: { dx: 0, dy: 10 }
};

function buildCorridors() {
  return `
    <line x1="210" y1="90" x2="220" y2="220" stroke="#1a2530" stroke-width="28"/>
    <line x1="490" y1="90" x2="480" y2="220" stroke="#1a2530" stroke-width="28"/>
    <line x1="120" y1="150" x2="120" y2="330" stroke="#1a2530" stroke-width="28"/>
    <line x1="580" y1="150" x2="580" y2="330" stroke="#1a2530" stroke-width="28"/>
    <line x1="210" y1="240" x2="220" y2="280" stroke="#1a2530" stroke-width="28"/>
    <line x1="490" y1="240" x2="480" y2="280" stroke="#1a2530" stroke-width="28"/>
    <line x1="210" y1="90" x2="220" y2="220" stroke="#0d1418" stroke-width="24" stroke-dasharray="8,6"/>
    <line x1="490" y1="90" x2="480" y2="220" stroke="#0d1418" stroke-width="24" stroke-dasharray="8,6"/>
    <line x1="120" y1="150" x2="120" y2="330" stroke="#0d1418" stroke-width="24" stroke-dasharray="8,6"/>
    <line x1="580" y1="150" x2="580" y2="330" stroke="#0d1418" stroke-width="24" stroke-dasharray="8,6"/>
  `;
}

function buildRoom(room, loc, visited) {
  const borderCol = visited ? '#f59e0b' : '#1e2d3a';
  const fillCol = visited ? 'rgba(245,158,11,0.06)' : '#0d1418';
  const labelCol = visited ? '#f59e0b' : '#4a6272';
  const textCol = visited ? '#c8d8e4' : '#2e4455';
  const statusFill = visited ? 'rgba(245,158,11,0.1)' : 'rgba(30,45,58,0.5)';
  const statusBorder = visited ? '#f59e0b' : '#1e2d3a';
  const statusText = visited ? '✓ INVESTIGADO — haz clic para ver la pista' : '→ Haz clic para investigar';
  const deco = DECOR_MAP[room.id] || { dx: 0, dy: 0 };

  return `
    <g class="map-room ${visited ? 'visited' : ''}" data-room="${room.id}">
      <rect class="room-bg room-border" x="${room.x}" y="${room.y}" width="${room.w}" height="${room.h}" rx="8"
        fill="${fillCol}" stroke="${borderCol}" stroke-width="1.5"/>
      <rect x="${room.x}" y="${room.y}" width="20" height="6" rx="1" fill="#f59e0b" opacity="0.6"/>
      <rect x="${room.x + room.w - 20}" y="${room.y + room.h - 6}" width="20" height="6" rx="1" fill="#f59e0b" opacity="0.6"/>
      <circle cx="${room.x + 30}" cy="${room.y + 28}" r="16" fill="${visited ? 'rgba(245,158,11,0.15)' : '#131c22'}" stroke="${borderCol}" stroke-width="1"/>
      <text x="${room.x + 30}" y="${room.y + 33}" text-anchor="middle" font-size="16">${loc.icon}</text>
      <text x="${room.x + 52}" y="${room.y + 22}" fill="${labelCol}" font-size="11" font-family="Orbitron,sans-serif" font-weight="700">${loc.name.split(' ').slice(0, 2).join(' ')}</text>
      <text x="${room.x + 52}" y="${room.y + 36}" fill="${textCol}" font-size="9" font-family="Share Tech Mono,monospace">${loc.desc.substring(0, 36)}...</text>
      <rect x="${room.x + 8}" y="${room.y + room.h - 28}" width="${room.w - 16}" height="20" rx="3"
        fill="${statusFill}" stroke="${statusBorder}" stroke-width="1"/>
      <text x="${room.x + room.w / 2}" y="${room.y + room.h - 15}" text-anchor="middle" fill="${visited ? '#f59e0b' : '#2e4455'}"
        font-size="9" font-family="Share Tech Mono,monospace">${statusText}</text>
      <foreignObject x="${room.x + room.w / 2 + deco.dx - 20}" y="${room.y + room.h / 2 + deco.dy - 20}" width="40" height="40">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;pointer-events:none;">${crewmateSVG(loc.icon === '🔩' ? '#6b7280' : '#0d1418', 40)}</div>
      </foreignObject>
      <rect x="${room.x}" y="${room.y}" width="${room.w}" height="${room.h}" rx="8" fill="transparent" style="cursor:pointer;pointer-events:all;"/>
    </g>
  `;
}

export function renderFactoryMap(LOCS, visitedLocs) {
  const svg = document.getElementById('factory-map');
  const defs = `
    <defs>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0L0 0 0 30" fill="none" stroke="#0e1820" stroke-width="0.5"/>
      </pattern>
    </defs>`;

  const roomsSVG = ROOM_CONFIG.map((room) => {
    const loc = LOCS.find((entry) => entry.id === room.id);
    const visited = visitedLocs.includes(room.id);
    return buildRoom(room, loc, visited);
  }).join('');

  const grid = `<rect x="0" y="0" width="700" height="480" fill="url(#grid)"/>`;
  const title = `<text x="350" y="470" text-anchor="middle" fill="#1e2d3a" font-size="11"
    font-family="Share Tech Mono,monospace">PLANTA INDUSTRIAL — LÍNEA 3 — HAZ CLIC EN UNA ZONA PARA INVESTIGAR</text>`;

  svg.innerHTML = `${defs}<rect width="700" height="480" fill="#060a0d"/>${grid}${buildCorridors()}${roomsSVG}${title}`;
}

export function attachMapEvents(onRoomSelected) {
  const svg = document.getElementById('factory-map');
  svg.addEventListener('click', (event) => {
    const roomElement = event.target.closest('[data-room]');
    if (!roomElement) return;
    const locId = roomElement.dataset.room;
    onRoomSelected(locId);
  });
}

export function investigateRoom(locId, LOCS) {
  if (!GameState.currentStory) {
    return null;
  }

  const clueData = GameState.currentStory.clues[locId];
  const loc = LOCS.find((item) => item.id === locId);

  GameState.addVisitedLocation(locId);
  GameState.addClue({ locId, ...clueData });

  return {
    loc,
    clueData
  };
}

export function closeClue() {
  const panel = document.getElementById('clue-panel');
  panel.classList.remove('show');
}
