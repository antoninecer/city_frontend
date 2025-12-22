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
    API_BASE: "https://city.api.ventureout.cz",
    USER_ID: "test123",

    // -------------------------
    // ISOMETRIC TILE SETTINGS
    // -------------------------
    tile: {
      width: 128,
      height: 64,
    },

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
      const rect = canvas.getBoundingClientRect();
      return {
        px: (e.clientX ?? 0) - rect.left,
        py: (e.clientY ?? 0) - rect.top,
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

