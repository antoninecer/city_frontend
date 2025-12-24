/* iso_config.js
 *
 * Frontend-only, NEMĚNNÝ konfigurační soubor.
 * ❗ Neobsahuje žádný runtime state (žádná velikost mapy, žádná data světa).
 * ❗ Grid / svět se bere výhradně z API (iso_api_state.js).
 */

(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});

  // =========================
  // CORE CONFIG
  // =========================
  IsoCity.cfg = {
    // Defaults only. Runtime values are loaded from localStorage (see main.js)
    // and can be changed in the in-game menu.
    API_BASE: "https://city.api.ventureout.cz",
    USER_ID: "test123",

    // Viewport size on mobile. The WORLD size comes from backend (world.radius).
    VIEWPORT_W: 7,
    VIEWPORT_H: 7,

    // -------------------------
    // ISOMETRIC TILE SETTINGS
    // -------------------------
    tile: {
      width: 128,
      height: 64,
    },

    // Back-compat aliases (older JS expected cfg.tileWidth / cfg.tileHeight)
    // (kept here so the rest of the code can stay clean)
    tileWidth: 128,
    tileHeight: 64,

    // -------------------------
    // VISUAL FIT (1×1 footprint)
    // -------------------------
    visualFit: {
      maxW: 0.78,
      maxH: 0.78,
      minScale: 0.18,
      maxScale: 0.75,
      // kladná hodnota = sprite víc dolů do tile (zem)
      groundLiftPx: 35, // tuned for current asset pack
    },

    // -------------------------
    // BUILDING COSTS
    // -------------------------
    buildCostGold: {
      townhall: 200,
      farm: 100,
      lumbermill: 150,
      house: 80,
      barracks: 300,
    },

    // Back-compat alias (older JS expected cfg.BUILD_COST_GOLD)
    BUILD_COST_GOLD: null,

    // -------------------------
    // ASSET MAP
    // -------------------------
    imageMap: {
      townhall: "assets/realm/Castles/castlekeep_01.png",
      farm: "assets/realm/Fields Farms/field_01a.png",
      lumbermill: "assets/realm/Mills/windmill_01a.png",
      house: "assets/realm/Houses/house_01a.png",
      barracks: "assets/realm/Barracks/Barracks_01.png",
    },

    // -------------------------
    // GROUND / OVERLAYS
    // (zatím vypnuto – striktní 1×1)
    // -------------------------
    groundTypes: new Set([]),
  };

  // finalize aliases
  IsoCity.cfg.tileWidth = IsoCity.cfg.tile.width;
  IsoCity.cfg.tileHeight = IsoCity.cfg.tile.height;
  IsoCity.cfg.BUILD_COST_GOLD = IsoCity.cfg.buildCostGold;

  // =========================
  // SHARED UTILITIES
  // =========================
  IsoCity.util = {
    pointInRect(px, py, r) {
      return (
        px >= r.x &&
        px <= r.x + r.w &&
        py >= r.y &&
        py <= r.y + r.h
      );
    },

  getCanvasPoint(canvas, e) {
    // Works with DPR-scaled canvas (mobile/retina) + pointer events.
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX) ?? 0);
    const cy = (e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? 0);

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      px: (cx - rect.left) * scaleX,
      py: (cy - rect.top) * scaleY,
    };
  },


    // deterministic hash (terrain / variation ready)
    hash2(x, y) {
      let n = x * 374761393 + y * 668265263;
      n = (n ^ (n >> 13)) >>> 0;
      n = (n * 1274126177) >>> 0;
      return (n & 0xffffffff) / 0xffffffff;
    },
  };
})(window);

