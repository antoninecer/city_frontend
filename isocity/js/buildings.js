// buildings.js
// Single source of truth for building footprints, anchors, variants and (later) costs.
// No UI strings here; use i18nKey for localization.
//
// Coordinate conventions:
// - Grid coordinates: (x, y) where x increases "down", y increases "right".
// - Placement uses an ANCHOR tile. A multi-tile building occupies a rectangle footprint {w,h}.
// - The anchor is typically the SOUTH-EAST tile of the footprint (w-1, h-1), meaning the building
//   extends to the north-west from the clicked/placed tile. This matches common isometric builders.
//
// Rendering:
// - Use anchor tile -> compute screenX/screenY -> draw sprite so that its "feet" sit on the anchor tile.
// - The footprint is used for collision / placement validity.

export const TILE = {
  width: 128,
  height: 64,
};

// Helper to standardize footprint objects
const fp = (w, h) => ({ w, h });

// Anchor presets
const ANCHOR = {
  SE: (footprint) => ({ x: footprint.w - 1, y: footprint.h - 1 }),
  // If you ever want other conventions:
  // SW: (footprint) => ({ x: footprint.w - 1, y: 0 }),
  // CENTER_BOTTOM: (footprint) => ({ x: Math.floor((footprint.w - 1) / 2), y: footprint.h - 1 }),
};

// If you later add production/costs, keep it here.
// For now, costs are placeholders and can be wired to backend rules.
const COST = {
  none: { gold: 0, wood: 0 },
};

// ---- Core catalog (based on your PDF screenshots) ----
export const BUILDING_CATALOG = {
  // === Terrain / tiles (non-blocking overlays) ===
  // These are 1x1 by nature; you can treat them as "tile skins" rather than buildings.
  field: {
    kind: "tile",
    i18nKey: "tile.field",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "field_01a", sprite: "assets/realm/Fields Farms/field_01a.png" },
      { id: "field_01b", sprite: "assets/realm/Fields Farms/field_01b.png" },
      { id: "field_01c", sprite: "assets/realm/Fields Farms/field_01c.png" },
      { id: "field_01d", sprite: "assets/realm/Fields Farms/field_01d.png" },
      { id: "field_01e", sprite: "assets/realm/Fields Farms/field_01e.png" },
      { id: "field_01f", sprite: "assets/realm/Fields Farms/field_01f.png" },
      { id: "field_01g", sprite: "assets/realm/Fields Farms/field_01g.png" },
      { id: "field_02a", sprite: "assets/realm/Fields Farms/field_02a.png" }, // if present
    ],
    cost: COST.none,
  },

  crop: {
    kind: "tile",
    i18nKey: "tile.crop",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "crop_01a", sprite: "assets/realm/Fields Farms/crop_01a.png" },
      { id: "crop_01b", sprite: "assets/realm/Fields Farms/crop_01b.png" },
      { id: "crop_01c", sprite: "assets/realm/Fields Farms/crop_01c.png" },
    ],
    cost: COST.none,
  },

  // === Economy / utility buildings ===
  barn: {
    kind: "building",
    i18nKey: "building.barn",
    // Conservative: barns usually occupy 2x2 in iso builders
    footprintByLevel: [
      { minLevel: 1, footprint: fp(2, 2) },
      // If you later want bigger barns at higher levels:
      // { minLevel: 10, footprint: fp(3, 3) },
    ],
    blocksMovement: true,
    variants: [
      { id: "barn_01a", sprite: "assets/realm/Barns Stables/barn_01a.png" },
      { id: "barn_01b", sprite: "assets/realm/Barns Stables/barn_01b.png" },
      { id: "barn_01c", sprite: "assets/realm/Barns Stables/barn_01c.png" },
    ],
    cost: { gold: 120, wood: 80 },
  },

  stable: {
    kind: "building",
    i18nKey: "building.stable",
    footprintByLevel: [{ minLevel: 1, footprint: fp(2, 2) }],
    blocksMovement: true,
    variants: [
      { id: "stable_01a", sprite: "assets/realm/Barns Stables/stable_01a.png" },
      { id: "stable_01b", sprite: "assets/realm/Barns Stables/stable_01b.png" },
      { id: "stable_02", sprite: "assets/realm/Barns Stables/stable_02.png" },
      { id: "stable_03", sprite: "assets/realm/Barns Stables/stable_03.png" },
    ],
    cost: { gold: 160, wood: 120 },
  },

  // === Military ===
  barracks: {
    kind: "building",
    i18nKey: "building.barracks",
    // Conservative: barracks are typically 3x2 or 2x3.
    // Choose 3x2 so you stop "building inside it".
    footprintByLevel: [
      { minLevel: 1, footprint: fp(3, 2) },
      // Example upgrade expansion:
      { minLevel: 10, footprint: fp(3, 3) },
    ],
    blocksMovement: true,
    variants: [
      { id: "Barracks_01", sprite: "assets/realm/Barracks/Barracks_01.png" },
      { id: "Barracks_02", sprite: "assets/realm/Barracks/Barracks_02.png" },
      { id: "Barracks_03", sprite: "assets/realm/Barracks/Barracks_03.png" },
      { id: "Barracks_04", sprite: "assets/realm/Barracks/Barracks_04.png" },
    ],
    cost: { gold: 300, wood: 200 },
  },

  guardhouse: {
    kind: "building",
    i18nKey: "building.guardhouse",
    footprintByLevel: [{ minLevel: 1, footprint: fp(2, 2) }],
    blocksMovement: true,
    variants: [
      { id: "guardhouse_01a", sprite: "assets/realm/Barracks/guardhouse_01a.png" },
      { id: "guardhouse_01b", sprite: "assets/realm/Barracks/guardhouse_01b.png" },
      { id: "guardhouse_02a", sprite: "assets/realm/Barracks/guardhouse_02a.png" },
      { id: "guardhouse_03a", sprite: "assets/realm/Barracks/guardhouse_03a.png" },
    ],
    cost: { gold: 220, wood: 140 },
  },

  // === Industry ===
  blacksmith: {
    kind: "building",
    i18nKey: "building.blacksmith",
    footprintByLevel: [{ minLevel: 1, footprint: fp(2, 2) }],
    blocksMovement: true,
    variants: [
      { id: "blacksmith_01", sprite: "assets/realm/Blacksmiths/blacksmith_01.png" },
      { id: "blacksmith_02", sprite: "assets/realm/Blacksmiths/blacksmith_02.png" },
      { id: "blacksmith_03", sprite: "assets/realm/Blacksmiths/blacksmith_03.png" },
    ],
    cost: { gold: 180, wood: 120 },
  },

  workshop: {
    kind: "building",
    i18nKey: "building.workshop",
    footprintByLevel: [{ minLevel: 1, footprint: fp(2, 2) }],
    blocksMovement: true,
    variants: [
      { id: "workshop_02", sprite: "assets/realm/Blacksmiths/workshop_02.png" },
      { id: "workshop_03", sprite: "assets/realm/Blacksmiths/workshop_03.png" },
    ],
    cost: { gold: 160, wood: 160 },
  },

  // === Decorations / small props (do NOT block by default) ===
  // These can be placeable props or auto-spawned details.
  prop_anvil: {
    kind: "prop",
    i18nKey: "prop.anvil",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "anvil_01a", sprite: "assets/realm/Blacksmiths/anvil_01a.png" },
      { id: "anvil_01b", sprite: "assets/realm/Blacksmiths/anvil_01b.png" },
    ],
    cost: COST.none,
  },

  prop_kiln: {
    kind: "prop",
    i18nKey: "prop.kiln",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "kiln_01", sprite: "assets/realm/Blacksmiths/kiln_01.png" },
      { id: "kiln_01a", sprite: "assets/realm/Blacksmiths/kiln_01a.png" },
    ],
    cost: COST.none,
  },

  prop_trough: {
    kind: "prop",
    i18nKey: "prop.trough",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "trough_01a", sprite: "assets/realm/Blacksmiths/trough_01a.png" },
      { id: "trough_01b", sprite: "assets/realm/Blacksmiths/trough_01b.png" },
      { id: "watertrough_01a", sprite: "assets/realm/Barns Stables/watertrough_01a.png" },
      { id: "watertrough_01b", sprite: "assets/realm/Barns Stables/watertrough_01b.png" },
    ],
    cost: COST.none,
  },

  prop_haystack: {
    kind: "prop",
    i18nKey: "prop.haystack",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "haystack_01a", sprite: "assets/realm/Barns Stables/haystack_01a.png" },
      { id: "haystack_01b", sprite: "assets/realm/Barns Stables/haystack_01b.png" },
    ],
    cost: COST.none,
  },

  prop_shed: {
    kind: "prop",
    i18nKey: "prop.shed",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "shed_01a", sprite: "assets/realm/Barns Stables/shed_01a.png" },
      { id: "shed_01b", sprite: "assets/realm/Barns Stables/shed_01b.png" },
    ],
    cost: COST.none,
  },

  prop_well: {
    kind: "prop",
    i18nKey: "prop.well",
    footprint: fp(1, 1),
    anchor: { x: 0, y: 0 },
    blocksMovement: false,
    variants: [
      { id: "well_01a", sprite: "assets/realm/Barns Stables/well_01a.png" },
      { id: "well_01b", sprite: "assets/realm/Barns Stables/well_01b.png" },
    ],
    cost: COST.none,
  },

  // === Religion ===
  chapel: {
    kind: "building",
    i18nKey: "building.chapel",
    footprintByLevel: [{ minLevel: 1, footprint: fp(2, 2) }],
    blocksMovement: true,
    variants: [
      { id: "chapel_01a", sprite: "assets/realm/Churches/chapel_01a.png" },
      { id: "chapel_01b", sprite: "assets/realm/Churches/chapel_01b.png" },
      { id: "chapel_02", sprite: "assets/realm/Churches/chapel_02.png" },
    ],
    cost: { gold: 220, wood: 160 },
  },

  church: {
    kind: "building",
    i18nKey: "building.church",
    footprintByLevel: [
      { minLevel: 1, footprint: fp(2, 2) },
      { minLevel: 10, footprint: fp(3, 3) }, // upgrade expansion idea
    ],
    blocksMovement: true,
    variants: [
      { id: "church_01a", sprite: "assets/realm/Churches/church_01a.png" },
      { id: "church_01b", sprite: "assets/realm/Churches/church_01b.png" },
      { id: "church_02a", sprite: "assets/realm/Churches/church_02a.png" },
      { id: "church_03a", sprite: "assets/realm/Churches/church_03a.png" },
      { id: "church_04", sprite: "assets/realm/Churches/church_04.png" },
    ],
    cost: { gold: 260, wood: 180 },
  },

  cathedral: {
    kind: "building",
    i18nKey: "building.cathedral",
    footprintByLevel: [{ minLevel: 1, footprint: fp(3, 3) }],
    blocksMovement: true,
    variants: [
      { id: "cathedral_01a", sprite: "assets/realm/Churches/cathedral_01a.png" },
      { id: "cathedral_01b", sprite: "assets/realm/Churches/cathedral_01b.png" },
    ],
    cost: { gold: 450, wood: 260 },
  },

  // === Castle / Town Hall ===
  // This is where your "townhall" can start. Upgrades can change footprint (big deal).
  castlekeep: {
    kind: "building",
    i18nKey: "building.castlekeep",
    // Very common mechanic: bigger keep requires clearing adjacent tiles.
    footprintByLevel: [
      { minLevel: 1, footprint: fp(3, 3) },
      { minLevel: 10, footprint: fp(4, 4) },
    ],
    blocksMovement: true,
    variants: [
      { id: "castlekeep_01", sprite: "assets/realm/Castles/castlekeep_01.png" },
      { id: "castlekeep_02", sprite: "assets/realm/Castles/castlekeep_02.png" },
      { id: "castlekeep_03", sprite: "assets/realm/Castles/castlekeep_03.png" },
      { id: "castlekeep_04", sprite: "assets/realm/Castles/castlekeep_04.png" },
      { id: "castlekeep_05", sprite: "assets/realm/Castles/castlekeep_05.png" },
      { id: "castlekeep_06", sprite: "assets/realm/Castles/castlekeep_06.png" },
      { id: "castlekeep_07", sprite: "assets/realm/Castles/castlekeep_07.png" },
      { id: "castlekeep_08", sprite: "assets/realm/Castles/castlekeep_08.png" },
      { id: "castlekeep_09", sprite: "assets/realm/Castles/castlekeep_09.png" },
      { id: "castlekeep_10", sprite: "assets/realm/Castles/castlekeep_10.png" },
      { id: "castlekeep_11", sprite: "assets/realm/Castles/castlekeep_11.png" },
      { id: "castlekeep_12_noshadow", sprite: "assets/realm/Castles/castlekeep_12_noshadow.png" },
      { id: "castlekeep_12", sprite: "assets/realm/Castles/castlekeep_12.png" },
      { id: "castlekeep_13", sprite: "assets/realm/Castles/castlekeep_13.png" },
      { id: "castlekeep_14", sprite: "assets/realm/Castles/castlekeep_14.png" },
    ],
    cost: { gold: 500, wood: 300 },
  },
};

// ---- Backend type mapping (your API uses these) ----
// Extend this as you add more building types server-side.
export const BACKEND_TYPE_TO_CATALOG_ID = {
  townhall: "castlekeep",
  farm: "field",        // if you treat farm as a tile (field) + crop overlay later
  lumbermill: "workshop", // placeholder until you have windmill/sawmill set
  house: "chapel",        // placeholder until you have a house set in this asset pack
  barracks: "barracks",
};

// ---- Selectors ----
export function getCatalogIdForBackendType(backendType) {
  return BACKEND_TYPE_TO_CATALOG_ID[backendType] || backendType;
}

export function getBuildingDef(catalogId) {
  return BUILDING_CATALOG[catalogId] || null;
}

export function getFootprintForLevel(def, level = 1) {
  if (!def) return fp(1, 1);
  if (def.footprint) return def.footprint;

  const rules = def.footprintByLevel || [{ minLevel: 1, footprint: fp(1, 1) }];
  let chosen = rules[0].footprint;
  for (const r of rules) {
    if (level >= r.minLevel) chosen = r.footprint;
  }
  return chosen;
}

export function getAnchorForFootprint(def, footprint) {
  if (!def) return { x: 0, y: 0 };
  if (def.anchor) return def.anchor;
  // Default to south-east anchor for iso placement
  return ANCHOR.SE(footprint);
}

// Choose a sprite variant. For now: deterministic by level (cycling variants), later you can bind exact sprites per level.
export function pickVariant(def, level = 1) {
  if (!def || !def.variants || def.variants.length === 0) return null;
  const idx = Math.max(0, (level - 1) % def.variants.length);
  return def.variants[idx];
}

// Returns list of occupied tiles relative to top-left of footprint rectangle
export function footprintTiles(footprint) {
  const tiles = [];
  for (let dx = 0; dx < footprint.w; dx++) {
    for (let dy = 0; dy < footprint.h; dy++) {
      tiles.push({ dx, dy });
    }
  }
  return tiles;
}

// Given an anchor tile (ax, ay), compute top-left tile of the footprint rectangle.
export function topLeftFromAnchor(ax, ay, footprint, anchor) {
  return { x: ax - anchor.x, y: ay - anchor.y };
}

