/* iso_api_state.js
 *
 * Runtime state + API bridge
 * WORLD MODEL:
 * - Backend today sends x/y as "world coords" but in practice it's a finite 7x7 (0..6).
 * - Frontend supports viewport (view.w x view.h) with offsetX/offsetY in WORLD coords.
 * - This file auto-detects "finite map coordinates" and forces offset=0 so you never lose buildings.
 */

(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;

  function allocGrid(w, h) {
    return Array.from({ length: w }, () => Array(h).fill(null));
  }

  function getWorldXY(b) {
    // Backend might send x/y (today), or world_x/world_y later.
    const wx =
      (typeof b?.world_x === "number" ? b.world_x : (typeof b?.x === "number" ? b.x : null));
    const wy =
      (typeof b?.world_y === "number" ? b.world_y : (typeof b?.y === "number" ? b.y : null));
    if (wx === null || wy === null) return null;
    return { wx, wy };
  }

  function clampInt(v, fallback = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  function getBuildingsBounds(buildingsObj) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;

    if (!buildingsObj || typeof buildingsObj !== "object") {
      return { ok: false, count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    for (const id in buildingsObj) {
      const b = buildingsObj[id];
      const wxy = getWorldXY(b);
      if (!wxy) continue;
      count++;
      if (wxy.wx < minX) minX = wxy.wx;
      if (wxy.wy < minY) minY = wxy.wy;
      if (wxy.wx > maxX) maxX = wxy.wx;
      if (wxy.wy > maxY) maxY = wxy.wy;
    }

    if (!count) {
      return { ok: false, count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return { ok: true, count, minX, minY, maxX, maxY };
  }

  function isFiniteMapLike(bounds, viewW, viewH) {
    // True if all buildings fit inside [0..viewW-1] and [0..viewH-1] and are non-negative.
    if (!bounds?.ok) return false;
    if (!Number.isFinite(viewW) || !Number.isFinite(viewH) || viewW <= 0 || viewH <= 0) return false;
    return (
      bounds.minX >= 0 &&
      bounds.minY >= 0 &&
      bounds.maxX <= (viewW - 1) &&
      bounds.maxY <= (viewH - 1)
    );
  }

  function centerOffsetOnBounds(bounds, viewW, viewH) {
    // Center viewport on the center of the buildings bounding box.
    // offset = center - halfViewport
    const halfW = (viewW - 1) / 2;
    const halfH = (viewH - 1) / 2;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    return {
      offsetX: Math.round(cx - halfW),
      offsetY: Math.round(cy - halfH),
    };
  }

  // =========================
  // STATE
  // =========================
  IsoCity.state = {
    canvas: null,
    ctx: null,

    // viewport/world model
    world: {
      view: {
        w: clampInt(cfg.VIEWPORT_W, 7),
        h: clampInt(cfg.VIEWPORT_H, 7),

        // WORLD coord of viewport top-left tile
        // IMPORTANT: default to 0,0 because backend (today) is finite (0..6).
        // Infinite-world centering is computed after loadGameState based on bounds.
        offsetX: 0,
        offsetY: 0,
      },
      origin: { x: 0, y: 0 }, // screen origin for iso draw
    },

    // data
    gameState: null,

    // viewport grid (local coords [vx][vy])
    grid: allocGrid(clampInt(cfg.VIEWPORT_W, 7), clampInt(cfg.VIEWPORT_H, 7)),
    placedBuildings: {}, // "vx_vy" -> buildingId

    // hover in viewport coords
    hoverX: -1,
    hoverY: -1,
    hoverBuilding: null,

    // UI status
    lastStatus: "",
    lastStatusAt: 0,

    // assets
    assets: { images: {} },

    // fetch lock
    loadInFlight: false,
  };

  IsoCity.world = {
    // convert viewport tile -> world tile
    viewToWorld(vx, vy) {
      const v = IsoCity.state.world.view;
      return { wx: v.offsetX + vx, wy: v.offsetY + vy };
    },

    // convert world tile -> viewport tile (may be outside)
    worldToView(wx, wy) {
      const v = IsoCity.state.world.view;
      return { vx: wx - v.offsetX, vy: wy - v.offsetY };
    },

    // keep viewport centered on canvas (purely visual)
    recenter() {
      const s = IsoCity.state;
      if (!s.canvas) return;

      const v = s.world.view;
      const tw = cfg.tileWidth;
      const th = cfg.tileHeight;

      const worldW = (v.w + v.h) * (tw / 2);
      const worldH = (v.w + v.h) * (th / 2);

      s.world.origin.x = Math.floor(s.canvas.width / 2 - worldW / 2);
      // this keeps the diamond in a nice "upper-ish" position
      s.world.origin.y = Math.floor(s.canvas.height / 4);
      // (worldH isn't used directly; this heuristic looks good for iso)
    },

    // move viewport by tile units in WORLD coords
    shiftView(dx, dy) {
      const s = IsoCity.state;
      s.world.view.offsetX += clampInt(dx, 0);
      s.world.view.offsetY += clampInt(dy, 0);
      IsoCity.api.loadGameState();
    },

    setViewSize(w, h) {
      const s = IsoCity.state;
      const W = clampInt(w, s.world.view.w);
      const H = clampInt(h, s.world.view.h);
      if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return;

      s.world.view.w = W;
      s.world.view.h = H;
      s.grid = allocGrid(W, H);
      s.placedBuildings = {};
      IsoCity.world.recenter();
    },

    setOffset(ox, oy) {
      const s = IsoCity.state;
      s.world.view.offsetX = clampInt(ox, s.world.view.offsetX);
      s.world.view.offsetY = clampInt(oy, s.world.view.offsetY);
    },
  };

  // =========================
  // UI helpers
  // =========================
  IsoCity.ui = {
    updateUI(gold, wood, extra = "") {
      const ui = document.getElementById("ui");
      if (!ui) return;
      ui.innerHTML = `
        <strong>Gold:</strong> ${Math.round(gold)}<br>
        <strong>Wood:</strong> ${Math.round(wood)}<br>
        <small>user: ${cfg.USER_ID}</small>
        ${extra ? `<br><em>${extra}</em>` : ""}
      `;
    },

    setStatus(msg) {
      const s = IsoCity.state;
      s.lastStatus = msg || "";
      s.lastStatusAt = performance.now();
    },

    statusIsFresh() {
      const s = IsoCity.state;
      return s.lastStatus && performance.now() - s.lastStatusAt < 5000;
    },
  };

  // =========================
  // API
  // =========================
  IsoCity.api = {
    async loadGameState() {
      const s = IsoCity.state;
      if (s.loadInFlight) return;
      s.loadInFlight = true;

      try {
        const res = await fetch(`${cfg.API_BASE}/city/${cfg.USER_ID}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Backend ${res.status}`);
        const data = await res.json();
        s.gameState = data;

        // Optional: backend-driven viewport size (if you add it later)
        const bw = data?.world?.view?.w ?? data?.world?.grid?.w;
        const bh = data?.world?.view?.h ?? data?.world?.grid?.h;
        if (Number.isFinite(bw) && Number.isFinite(bh)) {
          IsoCity.world.setViewSize(bw, bh);
        }

        const v = s.world.view;

        // Ensure grid matches current view
        if (!s.grid || s.grid.length !== v.w || s.grid[0]?.length !== v.h) {
          s.grid = allocGrid(v.w, v.h);
        } else {
          for (let x = 0; x < v.w; x++) for (let y = 0; y < v.h; y++) s.grid[x][y] = null;
        }
        s.placedBuildings = {};

        IsoCity.ui.updateUI(data.resources?.gold ?? 0, data.resources?.wood ?? 0);

        // === KEY FIX ===
        // Auto-detect finite 7x7 coords (0..6) and force offset=0 so you never lose buildings.
        // Otherwise (infinite world), center on buildings bounds.
        const bounds = getBuildingsBounds(data.buildings);
        if (bounds.ok) {
          if (isFiniteMapLike(bounds, v.w, v.h)) {
            IsoCity.world.setOffset(0, 0);
          } else {
            const { offsetX, offsetY } = centerOffsetOnBounds(bounds, v.w, v.h);
            IsoCity.world.setOffset(offsetX, offsetY);
          }
        } else {
          // no buildings => keep offset as-is, but if it became NaN anywhere, reset:
          if (!Number.isFinite(v.offsetX) || !Number.isFinite(v.offsetY)) {
            IsoCity.world.setOffset(0, 0);
          }
        }

        // Recenter visuals (canvas origin), not world coords
        IsoCity.world.recenter();

        // Place buildings into viewport grid (based on WORLD coords)
        for (const id in data.buildings) {
          const b = data.buildings[id];
          const wxy = getWorldXY(b);
          if (!wxy) continue;

          const vv = IsoCity.world.worldToView(wxy.wx, wxy.wy);
          const vx = vv.vx;
          const vy = vv.vy;

          if (vx < 0 || vy < 0 || vx >= v.w || vy >= v.h) continue;

          b._id = id;
          b._wx = wxy.wx;
          b._wy = wxy.wy;

          s.grid[vx][vy] = b;
          s.placedBuildings[`${vx}_${vy}`] = id;
        }

        IsoCity.ui.setStatus("Stav načten.");
      } catch (e) {
        console.error(e);
        IsoCity.ui.updateUI(500, 300, "Offline mód");
        IsoCity.ui.setStatus("Chyba komunikace se serverem");
      } finally {
        s.loadInFlight = false;
      }
    },

    async placeBuilding(type, vx, vy) {
      const s = IsoCity.state;
      const v = s.world.view;

      if (vx < 0 || vy < 0 || vx >= v.w || vy >= v.h) {
        IsoCity.ui.setStatus("Mimo mapu");
        return;
      }

      const { wx, wy } = IsoCity.world.viewToWorld(vx, vy);

      try {
        const gold = s.gameState?.resources?.gold;
        const cost = cfg.BUILD_COST_GOLD[type];
        if (typeof gold === "number" && typeof cost === "number" && gold < cost) {
          IsoCity.ui.setStatus(`Nedostatek zlata (${cost}g)`);
          return;
        }

        const res = await fetch(`${cfg.API_BASE}/city/${cfg.USER_ID}/place`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // keep compatible with current backend
          body: JSON.stringify({ building_type: type, x: wx, y: wy, world_x: wx, world_y: wy }),
        });

        if (!res.ok) {
          const text = await res.text();
          IsoCity.ui.setStatus(`Nelze postavit: ${text}`);
          return;
        }

        IsoCity.ui.setStatus(`Postaveno: ${type}`);
        await IsoCity.api.loadGameState();
      } catch (e) {
        console.error(e);
        IsoCity.ui.setStatus("Chyba při stavbě");
      }
    },

    async upgradeBuilding(buildingId) {
      if (!buildingId) {
        IsoCity.ui.setStatus("Upgrade: chybí buildingId");
        return;
      }
      try {
        const res = await fetch(`${cfg.API_BASE}/city/${cfg.USER_ID}/upgrade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ building_id: buildingId }),
        });

        if (!res.ok) {
          const text = await res.text();
          IsoCity.ui.setStatus(`Upgrade selhal: ${text}`);
          return;
        }

        IsoCity.ui.setStatus("Upgrade spuštěn");
        await IsoCity.api.loadGameState();
      } catch (e) {
        console.error(e);
        IsoCity.ui.setStatus("Chyba upgradu");
      }
    },

    async demolishBuilding(buildingId) {
      if (!buildingId) {
        IsoCity.ui.setStatus("Demolish: chybí buildingId");
        return;
      }
      try {
        const res = await fetch(`${cfg.API_BASE}/city/${cfg.USER_ID}/demolish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ building_id: buildingId }),
        });
        if (!res.ok) {
          const text = await res.text();
          IsoCity.ui.setStatus(`Demolish selhal: ${text}`);
          return;
        }
        IsoCity.ui.setStatus("Budova zbourána");
        await IsoCity.api.loadGameState();
      } catch (e) {
        console.error(e);
        IsoCity.ui.setStatus("Chyba demolice");
      }
    },
  };
})(window);

