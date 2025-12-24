/* iso_api_state.js
 *
 * Runtime state + API bridge (mobile-first)
 *
 * WORLD MODEL (matches backend):
 * - Buildings are stored in WORLD tile coords (negative allowed).
 * - World bounds are radius-based around (0,0) and come from GET /city/{user}.
 * - Frontend renders a fixed VIEWPORT (default 7x7) and pans by changing
 *   the viewport top-left WORLD coordinate (offsetX/offsetY).
 */

(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;

  function allocGrid(w, h) {
    return Array.from({ length: w }, () => Array(h).fill(null));
  }

  function clampInt(v, fallback = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  function getWorldXY(b) {
    const wx =
      (typeof b?.world_x === "number" ? b.world_x : (typeof b?.x === "number" ? b.x : null));
    const wy =
      (typeof b?.world_y === "number" ? b.world_y : (typeof b?.y === "number" ? b.y : null));
    if (wx === null || wy === null) return null;
    return { wx, wy };
  }

  function nowMs() {
    return (global.performance?.now?.() ?? Date.now());
  }

  function makeIdempotencyKey(prefix = "op") {
    // lightweight uniqueness for local client
    const r = Math.random().toString(16).slice(2);
    return `${prefix}-${Date.now()}-${r}`;
  }

  // ============================================================
  // Session (localStorage)
  // ============================================================
  IsoCity.session = IsoCity.session || {
    apiBase: cfg.API_BASE,
    userId: cfg.USER_ID,

    load() {
      const raw = global.localStorage?.getItem("isocity.session");
      if (!raw) return;
      const s = safeJsonParse(raw, null);
      if (!s) return;
      if (typeof s.apiBase === "string" && s.apiBase.trim()) this.apiBase = s.apiBase.trim();
      if (typeof s.userId === "string" && s.userId.trim()) this.userId = s.userId.trim();
      cfg.API_BASE = this.apiBase;
      cfg.USER_ID = this.userId;
    },

    save() {
      cfg.API_BASE = this.apiBase;
      cfg.USER_ID = this.userId;
      try {
        global.localStorage?.setItem("isocity.session", JSON.stringify({ apiBase: this.apiBase, userId: this.userId }));
      } catch {
        /* ignore */
      }
    },

    set({ apiBase, userId }) {
      if (typeof apiBase === "string" && apiBase.trim()) this.apiBase = apiBase.trim().replace(/\/$/, "");
      if (typeof userId === "string" && userId.trim()) this.userId = userId.trim();
      this.save();
    },
  };

  function apiBase() {
    return IsoCity.session?.apiBase || cfg.API_BASE;
  }
  function userId() {
    return IsoCity.session?.userId || cfg.USER_ID;
  }

  // ============================================================
  // State
  // ============================================================
  IsoCity.state = {
    canvas: null,
    ctx: null,

    world: {
      view: {
        w: clampInt(cfg.VIEWPORT_W, 7),
        h: clampInt(cfg.VIEWPORT_H, 7),
        // WORLD coord of viewport top-left tile
        offsetX: -Math.floor(clampInt(cfg.VIEWPORT_W, 7) / 2),
        offsetY: -Math.floor(clampInt(cfg.VIEWPORT_H, 7) / 2),
      },
      origin: { x: 0, y: 0 },
      bounds: { min_x: -3, max_x: 3, min_y: -3, max_y: 3 },
      radius: 3,
    },

    // data from backend
    gameState: null,

    // viewport grid (local coords [vx][vy])
    grid: allocGrid(clampInt(cfg.VIEWPORT_W, 7), clampInt(cfg.VIEWPORT_H, 7)),
    placedBuildings: {},

    // hover/selection
    hoverX: -1,
    hoverY: -1,
    hoverBuilding: null,
    selectedBuildingId: null,

    // UI
    lastStatus: "",
    lastStatusAt: 0,

    // assets
    assets: { images: {} },

    // fetch lock
    loadInFlight: false,
    firstLoadDone: false,
  };

  // ============================================================
  // World helpers
  // ============================================================
  function clampOffsetToBounds() {
    const s = IsoCity.state;
    const v = s.world.view;
    const b = s.world.bounds;

    // If the viewport is larger than the world, "max" can fall below "min".
    // In that case we pin to min bounds (the world is effectively fully visible).
    const maxOx = Math.max(b.min_x, b.max_x - (v.w - 1));
    const maxOy = Math.max(b.min_y, b.max_y - (v.h - 1));

    v.offsetX = Math.max(b.min_x, Math.min(v.offsetX, maxOx));
    v.offsetY = Math.max(b.min_y, Math.min(v.offsetY, maxOy));
  }

  IsoCity.world = {
    viewToWorld(vx, vy) {
      const v = IsoCity.state.world.view;
      return { wx: v.offsetX + vx, wy: v.offsetY + vy };
    },

    worldToView(wx, wy) {
      const v = IsoCity.state.world.view;
      return { vx: wx - v.offsetX, vy: wy - v.offsetY };
    },

    setViewSize(w, h) {
      const s = IsoCity.state;
      const W = clampInt(w, s.world.view.w);
      const H = clampInt(h, s.world.view.h);
      if (W <= 0 || H <= 0) return;
      s.world.view.w = W;
      s.world.view.h = H;
      s.grid = allocGrid(W, H);
      s.placedBuildings = {};
      clampOffsetToBounds();
      IsoCity.world.recenter();
      IsoCity.world.rebuildViewport();
    },

    setOffset(ox, oy) {
      const s = IsoCity.state;
      s.world.view.offsetX = clampInt(ox, s.world.view.offsetX);
      s.world.view.offsetY = clampInt(oy, s.world.view.offsetY);
      clampOffsetToBounds();
      IsoCity.world.rebuildViewport();
    },

    shiftView(dx, dy) {
      const s = IsoCity.state;
      s.world.view.offsetX += clampInt(dx, 0);
      s.world.view.offsetY += clampInt(dy, 0);
      clampOffsetToBounds();
      IsoCity.world.rebuildViewport();
    },

    recenter() {
      // Visual recentering is handled in iso_render.js (recenterOrigin).
      // We just call it from here when canvas size changes.
      IsoCity.render?.recenterOrigin?.();
    },

    recenterToZero() {
      const s = IsoCity.state;
      const v = s.world.view;
      v.offsetX = -Math.floor(v.w / 2);
      v.offsetY = -Math.floor(v.h / 2);
      clampOffsetToBounds();
      IsoCity.world.rebuildViewport();
    },

    rebuildViewport() {
      const s = IsoCity.state;
      const v = s.world.view;

      // clear grid
      if (!s.grid || s.grid.length !== v.w || s.grid[0]?.length !== v.h) {
        s.grid = allocGrid(v.w, v.h);
      } else {
        for (let x = 0; x < v.w; x++) for (let y = 0; y < v.h; y++) s.grid[x][y] = null;
      }
      s.placedBuildings = {};
      s.hoverBuilding = null;

      const data = s.gameState;
      if (!data?.buildings) return;

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
    },
  };

  // ============================================================
  // UI helpers
  // ============================================================
  IsoCity.ui = {
    updateHUD(data) {
      const gold = data?.resources?.gold ?? 0;
      const wood = data?.resources?.wood ?? 0;
      const gems = data?.resources?.gems ?? 0;

      const elUser = document.getElementById("hudUser");
      const elGold = document.getElementById("hudGold");
      const elWood = document.getElementById("hudWood");
      const elGems = document.getElementById("hudGems");
      const elWorld = document.getElementById("hudWorld");

      if (elUser) elUser.textContent = userId();
      if (elGold) elGold.textContent = String(Math.round(gold));
      if (elWood) elWood.textContent = String(Math.round(wood));
      if (elGems) elGems.textContent = String(Math.round(gems));

      if (elWorld) {
        const r = data?.world?.radius;
        const b = data?.world?.bounds;
        if (Number.isFinite(r) && b) {
          elWorld.textContent = `r=${r} (${b.min_x}..${b.max_x}, ${b.min_y}..${b.max_y})`;
        }
      }
    },

    setStatus(msg) {
      const s = IsoCity.state;
      s.lastStatus = msg || "";
      s.lastStatusAt = nowMs();
      const el = document.getElementById("hudStatus");
      if (el) el.textContent = s.lastStatus;
    },

    statusIsFresh(ms = 4500) {
      const s = IsoCity.state;
      return s.lastStatus && nowMs() - s.lastStatusAt < ms;
    },
  };

  // --- backward-compat for older main.js (expects IsoCity.ui.updateUI) ---
  IsoCity.ui.updateUI = function (gold, wood, extra = "") {
    const s = IsoCity.state;
    s.gameState = s.gameState || {};
    s.gameState.resources = s.gameState.resources || {};
    if (Number.isFinite(gold)) s.gameState.resources.gold = gold;
    if (Number.isFinite(wood)) s.gameState.resources.wood = wood;

    // keep current UI behavior
    IsoCity.ui.updateHUD(s.gameState);
    if (extra) IsoCity.ui.setStatus(extra);
  };


  // ============================================================
  // API
  // ============================================================
  async function apiFetch(path, init) {
    const url = `${apiBase()}${path}`;
    return fetch(url, { cache: "no-store", ...init });
  }

  IsoCity.api = {
    async loadGameState({ soft = false } = {}) {
      const s = IsoCity.state;
      if (s.loadInFlight) return;
      s.loadInFlight = true;

      try {
        const res = await apiFetch(`/city/${encodeURIComponent(userId())}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GET /city failed ${res.status}: ${text}`);
        }
        const data = await res.json();
        s.gameState = data;

        // world info
        if (data?.world?.bounds) {
          s.world.bounds = { ...s.world.bounds, ...data.world.bounds };
        }
        if (Number.isFinite(data?.world?.radius)) s.world.radius = data.world.radius;

        // fixed viewport size (mobile-first)
        IsoCity.world.setViewSize(clampInt(cfg.VIEWPORT_W, 7), clampInt(cfg.VIEWPORT_H, 7));

        // first load: recenter around (0,0)
        if (!s.firstLoadDone) {
          s.firstLoadDone = true;
          IsoCity.world.recenterToZero();
        } else {
          clampOffsetToBounds();
          IsoCity.world.rebuildViewport();
        }

        IsoCity.ui.updateHUD(data);

        if (!soft) IsoCity.ui.setStatus("Stav načten.");
      } catch (e) {
        console.error(e);
        if (!soft) IsoCity.ui.setStatus("Chyba komunikace se serverem");
      } finally {
        s.loadInFlight = false;
      }
    },

    async newGame({ desiredUserId = "" } = {}) {
      const body = desiredUserId?.trim() ? { user_id: desiredUserId.trim() } : { user_id: null };
      const res = await apiFetch(`/new_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`new_game failed ${res.status}: ${text}`);
      }
      const data = await res.json();
      const uid = data?.user_id;
      if (uid) {
        IsoCity.session.set({ userId: uid, apiBase: apiBase() });
      }
      IsoCity.ui.setStatus("Nový hráč vytvořen.");
      await IsoCity.api.loadGameState();
      return data;
    },

    async devReset({ wipe = true } = {}) {
      const res = await apiFetch(`/dev/reset/${encodeURIComponent(userId())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wipe: !!wipe }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`dev/reset failed ${res.status}: ${text}`);
      }
      IsoCity.ui.setStatus("Reset hotov.");
      await IsoCity.api.loadGameState();
    },

    async placeBuilding(type, vx, vy, rotation = 0) {
      const s = IsoCity.state;
      const v = s.world.view;
      if (vx < 0 || vy < 0 || vx >= v.w || vy >= v.h) {
        IsoCity.ui.setStatus("Mimo mapu");
        return;
      }

      const { wx, wy } = IsoCity.world.viewToWorld(vx, vy);

      // Optional client-side affordability check using catalog
      const cost = s.gameState?.catalog?.[type]?.build_cost_gold;
      const gold = s.gameState?.resources?.gold;
      if (Number.isFinite(cost) && Number.isFinite(gold) && gold < cost) {
        IsoCity.ui.setStatus(`Nedostatek zlata (${Math.round(cost)}g)`);
        return;
      }

      const res = await apiFetch(`/city/${encodeURIComponent(userId())}/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building_type: type, x: wx, y: wy, rotation }),
      });

      if (!res.ok) {
        const text = await res.text();
        IsoCity.ui.setStatus(`Nelze postavit: ${text}`);
        return;
      }

      IsoCity.ui.setStatus(`Postaveno: ${type}`);
      await IsoCity.api.loadGameState({ soft: true });
    },

    async upgradeBuilding(buildingId) {
      if (!buildingId) return;
      const res = await apiFetch(`/city/${encodeURIComponent(userId())}/upgrade`, {
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
      await IsoCity.api.loadGameState({ soft: true });
    },

    async demolishBuilding(buildingId) {
      if (!buildingId) return;
      const res = await apiFetch(`/city/${encodeURIComponent(userId())}/demolish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building_id: buildingId }),
      });
      if (!res.ok) {
        const text = await res.text();
        IsoCity.ui.setStatus(`Demolice selhala: ${text}`);
        return;
      }
      IsoCity.ui.setStatus("Budova zbourána");
      await IsoCity.api.loadGameState({ soft: true });
    },

    async creditGems({ gems, provider = "dev", purchaseId = null } = {}) {
      const g = clampInt(gems, 0);
      if (g <= 0) {
        IsoCity.ui.setStatus("Zadej počet gemů > 0");
        return;
      }
      const idem = makeIdempotencyKey("credit_gems");
      const res = await apiFetch(`/shop/credit_gems`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({ user_id: userId(), gems: g, provider, purchase_id: purchaseId || idem }),
      });
      if (!res.ok) {
        const text = await res.text();
        IsoCity.ui.setStatus(`Credit gems selhal: ${text}`);
        return;
      }
      IsoCity.ui.setStatus(`Gemy připsány (+${g})`);
      await IsoCity.api.loadGameState({ soft: true });
    },

    async expandWithGems({ steps = 1 } = {}) {
      const st = Math.max(1, clampInt(steps, 1));
      const idem = makeIdempotencyKey("expand_gems");
      const res = await apiFetch(`/city/${encodeURIComponent(userId())}/expand_gems`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({ steps: st }),
      });
      if (!res.ok) {
        const text = await res.text();
        IsoCity.ui.setStatus(`Expand selhal: ${text}`);
        return;
      }
      IsoCity.ui.setStatus(`Svět rozšířen (+${st})`);
      await IsoCity.api.loadGameState();
    },

    async speedupUpgrade({ buildingId, mode = "finish", seconds = null } = {}) {
      if (!buildingId) {
        IsoCity.ui.setStatus("Nejprve vyber budovu");
        return;
      }
      const idem = makeIdempotencyKey("speedup");
      const payload = { building_id: buildingId, mode };
      if (mode === "reduce") payload.seconds = clampInt(seconds, 0);
      const res = await apiFetch(`/city/${encodeURIComponent(userId())}/speedup_upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        IsoCity.ui.setStatus(`Speedup selhal: ${text}`);
        return;
      }
      IsoCity.ui.setStatus("Speedup použit");
      await IsoCity.api.loadGameState({ soft: true });
    },
  };
})(window);
