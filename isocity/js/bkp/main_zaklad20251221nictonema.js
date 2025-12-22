/* js/main.js */

const API_BASE = 'https://city.api.ventureout.cz';
const USER_ID = 'test123';

// Canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });

// Iso grid settings
const tileWidth = 128;
const tileHeight = 64;
const gridSize = 7;

// Map origin (posun celé mapy na canvasu)
const origin = {
  x: Math.floor(canvas.width / 2),
  y: 80
};

// State
let gameState = null;
let placedBuildings = {};   // "x_y" -> buildingId
let grid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));

let selectedType = null;
let hoverX = -1;
let hoverY = -1;

let lastStatus = '';
let lastStatusAt = 0;

// Ceny (jen pro UI / pred-check; server je autorita)
const BUILD_COST_GOLD = {
  townhall: 200,
  farm: 100,
  lumbermill: 150,
  house: 80,
  barracks: 300
};

// Asset map
const buildingImages = {};
const imageMap = {
  townhall: 'assets/realm/Castles/castlekeep_01.png',
  farm: 'assets/realm/Fields Farms/field_01a.png',
  lumbermill: 'assets/realm/Mills/windmill_01a.png',
  house: 'assets/realm/Houses/house_01a.png',
  barracks: 'assets/realm/Barracks/Barracks_01.png'
};

// Které typy chceme kreslit jako "výplň tile" (ground overlay)
const GROUND_TYPES = new Set(['farm']); // sem později přidáš třeba 'road'

// --- UI helpers -------------------------------------------------------------

function updateUI(gold, wood, extra = '') {
  const ui = document.getElementById('ui');
  if (!ui) return;

  ui.innerHTML = `
    <strong>Gold:</strong> ${Math.round(gold)}<br>
    <strong>Wood:</strong> ${Math.round(wood)}<br>
    <small>user: ${USER_ID}</small>
    ${extra ? `<br><em>${extra}</em>` : ''}
  `;
}

function setStatus(msg) {
  lastStatus = msg || '';
  lastStatusAt = performance.now();
}

function statusIsFresh() {
  if (!lastStatus) return false;
  return (performance.now() - lastStatusAt) < 5000;
}

function selectType(type) {
  selectedType = type;
  const cost = BUILD_COST_GOLD[type] ?? '?';
  setStatus(`Vybráno: ${type} (cena ~${cost}g)`);
}
window.selectType = selectType;

// --- Geometry ---------------------------------------------------------------

function isoToScreen(x, y) {
  // Vrací "horní špičku" tile v screen souřadnicích bez originu
  const sx = (y - x) * (tileWidth / 2);
  const sy = (x + y) * (tileHeight / 2);
  return { sx, sy };
}

function tileGroundPoint(x, y) {
  // Bod kontaktu se zemí = střed kosočtverce
  const { sx, sy } = isoToScreen(x, y);
  return {
    gx: origin.x + sx,
    gy: origin.y + sy + tileHeight / 2
  };
}

function screenToIso(clientX, clientY) {
  // Inverze iso transformace (konzistentní s isoToScreen + origin)
  const mx = clientX - origin.x;
  const my = clientY - origin.y;

  const a = mx / (tileWidth / 2);
  const b = my / (tileHeight / 2);

  const x = Math.floor((b - a) / 2);
  const y = Math.floor((b + a) / 2);

  if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return { x: -1, y: -1 };
  return { x, y };
}

// --- Deterministic tile variation -------------------------------------------

function hash2(x, y) {
  // deterministický pseudo-random 0..1 podle tile souřadnic
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) >>> 0;
  n = (n * 1274126177) >>> 0;
  return (n & 0xffffffff) / 0xffffffff;
}

// --- Asset preload ----------------------------------------------------------

function preloadImages() {
  return new Promise((resolve) => {
    let loaded = 0;
    const types = Object.keys(imageMap);
    if (types.length === 0) resolve();

    for (const type of types) {
      const img = new Image();
      img.src = imageMap[type];
      img.onload = () => {
        buildingImages[type] = img;
        loaded++;
        if (loaded === types.length) resolve();
      };
      img.onerror = () => {
        console.warn('Failed to load image:', type, imageMap[type]);
        loaded++;
        if (loaded === types.length) resolve();
      };
    }
  });
}

// --- Backend ----------------------------------------------------------------

async function loadGameState() {
  try {
    const res = await fetch(`${API_BASE}/city/${USER_ID}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    gameState = await res.json();

    updateUI(gameState.resources.gold, gameState.resources.wood);

    grid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    placedBuildings = {};

    for (const id in gameState.buildings) {
      const b = gameState.buildings[id];
      if (typeof b?.x !== 'number' || typeof b?.y !== 'number') continue;
      if (b.x < 0 || b.x >= gridSize || b.y < 0 || b.y >= gridSize) continue;

      grid[b.x][b.y] = b;
      placedBuildings[`${b.x}_${b.y}`] = id;
    }

    setStatus('Stav načten.');
  } catch (e) {
    console.error('Load error:', e);
    updateUI(500, 300, 'Offline mód');
    setStatus(`Chyba načtení: ${String(e.message || e)}`);
  }
}

async function upgradeBuilding(buildingId) {
  try {
    const res = await fetch(`${API_BASE}/city/${USER_ID}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: buildingId })
    });

    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) {}

    if (!res.ok) {
      const detail = payload?.detail ?? text ?? `HTTP ${res.status}`;
      setStatus(`Upgrade failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      return;
    }

    setStatus('Upgrade spuštěn.');
    await loadGameState();
  } catch (e) {
    console.error('Upgrade error:', e);
    setStatus(`Upgrade error: ${String(e.message || e)}`);
  }
}

async function placeBuilding(type, x, y) {
  try {
    // UI před-check (server je autorita, ale tohle dá člověku okamžitou informaci)
    if (gameState?.resources?.gold != null) {
      const cost = BUILD_COST_GOLD[type];
      if (typeof cost === 'number' && gameState.resources.gold < cost) {
        setStatus(`Nelze postavit: ${type} stojí ~${cost}g, máš ${Math.round(gameState.resources.gold)}g`);
        return;
      }
    }

    const res = await fetch(`${API_BASE}/city/${USER_ID}/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_type: type, x, y })
    });

    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) {}

    if (!res.ok) {
      const detail = payload?.detail ?? text ?? `HTTP ${res.status}`;
      setStatus(`Place failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      return;
    }

    setStatus(`Postaveno: ${type} (${x},${y})`);
    await loadGameState();
  } catch (e) {
    console.error('Place error:', e);
    setStatus(`Place error: ${String(e.message || e)}`);
  }
}

// --- Rendering --------------------------------------------------------------

function resetTransform() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawDiamondPath(c) {
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(tileWidth / 2, tileHeight / 2);
  c.lineTo(0, tileHeight);
  c.lineTo(-tileWidth / 2, tileHeight / 2);
  c.closePath();
}

function drawTerrainTile(x, y) {
  const { sx, sy } = isoToScreen(x, y);

  ctx.save();
  ctx.translate(origin.x + sx, origin.y + sy);

  // jemná variace barvy (krajina, ne šachovnice)
  const r = hash2(x, y);
  const base1 = 0.70 + r * 0.10;   // 0.70..0.80
  const base2 = 0.60 + r * 0.08;   // 0.60..0.68

  const g = ctx.createLinearGradient(0, 0, 0, tileHeight);
  g.addColorStop(0, `rgb(${Math.floor(210 * base1)},${Math.floor(185 * base1)},${Math.floor(150 * base1)})`);
  g.addColorStop(1, `rgb(${Math.floor(210 * base2)},${Math.floor(185 * base2)},${Math.floor(150 * base2)})`);

  drawDiamondPath(ctx);
  ctx.fillStyle = g;
  ctx.fill();

  // hrany tile jen velmi jemně (ať to nevypadá jak šachovnice)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // hover zvýraznění – jen overlay
  if (x === hoverX && y === hoverY && !grid[x][y]) {
    ctx.fillStyle = 'rgba(0,255,0,0.12)';
    ctx.fill();
  }

  ctx.restore();
}

function drawGroundOverlay(type, x, y) {
  // "farm" jako textura do tile (clipped diamond)
  const img = buildingImages[type];
  if (!img) return;

  const { sx, sy } = isoToScreen(x, y);

  ctx.save();
  ctx.translate(origin.x + sx, origin.y + sy);

  drawDiamondPath(ctx);
  ctx.clip();

  // texturu roztáhneme do bounding boxu tile
  // (na pocit "výplně" to funguje překvapivě dobře)
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, -tileWidth / 2, 0, tileWidth, tileHeight);
  ctx.globalAlpha = 1;

  ctx.restore();
}

function buildingScaleFor(img) {
  // škáluj tak, aby to nepůsobilo jako obří ikona mimo tile
  const maxW = tileWidth * 0.95;
  const s = Math.min(1, maxW / img.width);
  return Math.max(0.35, s);
}

function drawBuilding(type, x, y, level, upgradeEnd) {
  const img = buildingImages[type];
  if (!img) return;

  // Ground anchor = střed tile
  const { gx, gy } = tileGroundPoint(x, y);

  const s = buildingScaleFor(img);

  // Kotva: spodní střed sprite (lehce zvednout kvůli průhledným okrajům)
  const anchorX = (img.width * s) / 2;
  const anchorY = (img.height * s) - 6;

  const dx = gx - anchorX;
  const dy = gy - anchorY;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, img.width * s, img.height * s);

  // info label nad budovou
  const labelY = dy - 10;
  const label = `${type}  Lvl ${level}`;

  ctx.font = '12px Arial';
  const tw = ctx.measureText(label).width;
  const pad = 6;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(gx - tw / 2 - pad, labelY - 18, tw + pad * 2, 18);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, gx, labelY - 9);

  // timer
  if (upgradeEnd) {
    const remaining = upgradeEnd - (Date.now() / 1000);
    if (remaining > 0) {
      const t = `${Math.ceil(remaining)}s`;
      ctx.fillStyle = 'rgba(255,215,0,0.9)';
      ctx.fillText(t, gx, labelY - 26);
    }
  }

  ctx.restore();
}

function drawHUD() {
  // Jednoduchý stavový řádek dole (pro feedback)
  if (!statusIsFresh()) return;

  const msg = lastStatus;
  ctx.save();
  resetTransform();

  const x = 10;
  const y = canvas.height - 18;
  ctx.font = '12px Arial';

  const w = ctx.measureText(msg).width + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x, y - 14, w, 18);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, x + 8, y - 5);

  ctx.restore();
}

function render() {
  // Background
  resetTransform();
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1) Terrain tiles (v pořadí x+y = správný vizuální dojem)
  const tiles = [];
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) tiles.push({ x, y });
  }
  tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y));

  for (const t of tiles) {
    drawTerrainTile(t.x, t.y);
  }

  // 2) Ground overlays (pole/cesty) – taky v pořadí x+y
  for (const t of tiles) {
    const b = grid[t.x][t.y];
    if (!b) continue;
    if (GROUND_TYPES.has(b.type)) {
      drawGroundOverlay(b.type, t.x, t.y);
    }
  }

  // 3) Buildings (vertikální) – taky v pořadí x+y, aby se “správně překrývaly”
  for (const t of tiles) {
    const b = grid[t.x][t.y];
    if (!b) continue;
    if (GROUND_TYPES.has(b.type)) continue;
    drawBuilding(b.type, t.x, t.y, b.level ?? 1, b.upgrade_end);
  }

  // 4) HUD status
  drawHUD();

  requestAnimationFrame(render);
}

// --- Input ------------------------------------------------------------------

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const pos = screenToIso(cx, cy);
  hoverX = pos.x;
  hoverY = pos.y;
}

function onClick(e) {
  if (hoverX === -1 || hoverY === -1) return;

  const key = `${hoverX}_${hoverY}`;
  const buildingId = placedBuildings[key];

  if (buildingId) {
    upgradeBuilding(buildingId);
    return;
  }

  if (!selectedType) {
    setStatus('Nejdřív vyber typ budovy dole.');
    return;
  }

  placeBuilding(selectedType, hoverX, hoverY);
}

// --- Boot -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  updateUI(500, 300, 'Načítám assety…');
  setStatus('Boot…');

  await preloadImages();

  updateUI(500, 300, 'Vyber typ budovy dole.');
  setStatus('Assety načteny.');

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  await loadGameState();

  // periodický refresh ze serveru (produkce, upgradey, atd.)
  setInterval(loadGameState, 10000);

  // render loop (kvůli timerům a hoveru)
  requestAnimationFrame(render);
});

