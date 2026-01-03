/* iso_input_ui.js
 *
 * Universal input + context menu (desktop + mobile)
 * - tap/click empty tile => build list
 * - tap/click building => actions (upgrade/demolish)
 * - confirm screen with ✔ / ✖
 */

(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;
  const U = IsoCity.util;
  const s = IsoCity.state;

  // --- INPUT MODE ---
  const isTouch = () =>
    window.matchMedia("(pointer: coarse)").matches;

  // mobile: remember first tap
  s.lastTappedTile = null;


  // -------------------------
  // SAFETY util fallbacks
  // -------------------------
  function getCanvasPoint(canvas, e) {
    if (U?.getCanvasPoint) return U.getCanvasPoint(canvas, e);
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { px, py };
  }

  function pointInRect(px, py, r) {
    if (!r) return false;
    if (U?.pointInRect) return U.pointInRect(px, py, r);
    return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
  }

  // -------------------------
  // UI MODE + MENU STATE
  // -------------------------
  s.uiMode = s.uiMode || "idle";

  s.contextMenu = s.contextMenu || {
    visible: false,
    mode: null, // "empty" | "building" | "confirm"
    tileX: -1,  // viewport coords vx
    tileY: -1,  // viewport coords vy
    building: null,
    actions: [],
    confirmAction: null,
    hit: { close: null, actions: [], confirmYes: null, confirmNo: null },
  };

  function closeMenu() {
    s.contextMenu.visible = false;
    s.contextMenu.mode = null;
    s.contextMenu.actions = [];
    s.contextMenu.confirmAction = null;
    s.uiMode = "idle";
    s.lastTappedTile = null;
  }

  // -------------------------
  // COORDS: screen -> viewport tile
  // -------------------------
  function screenToView(px, py) {
    const v = s.world?.view;
    const o = s.world?.origin;
    if (!v || !o) return null;

    const tw2 = cfg.tileWidth / 2;
    const th2 = cfg.tileHeight / 2;

    const mx = px - o.x;
    const my = py - o.y;

    const a = mx / tw2;
    const b = my / th2;

    const vx = Math.floor((b - a) / 2);
    const vy = Math.floor((b + a) / 2);

    if (vx < 0 || vy < 0 || vx >= v.w || vy >= v.h) return null;
    return { vx, vy };
  }

  // -------------------------
  // DATA HELPERS (robust to different cfg shapes)
  // -------------------------
  function getGold() {
    return s.gameState?.resources?.gold ?? 0;
  }

  function getBuildTypes() {
    const cat = s.gameState?.catalog;
    if (cat && typeof cat === "object") {
      // Hide townhall from build list (backend rule is exactly one).
      return Object.keys(cat).filter((k) => k !== "townhall");
    }
    if (cfg?.BUILD_COST_GOLD && typeof cfg.BUILD_COST_GOLD === "object") {
      return Object.keys(cfg.BUILD_COST_GOLD).filter((k) => k !== "townhall");
    }
    return ["house", "farm", "lumbermill", "barracks"];
  }

  function getBuildCost(type) {
    const c0 = s.gameState?.catalog?.[type]?.build_cost_gold;
    if (Number.isFinite(c0)) return c0;
    const c1 = cfg?.BUILD_COST_GOLD?.[type];
    if (Number.isFinite(c1)) return c1;
    return 100;
  }

  function getUpgradeCost(b) {
    const type = b?.type;
    const lvl = Math.max(1, Math.floor(b?.level ?? 1));
    // next level cost
    const arr1 = cfg?.BUILDING_CONFIG?.[type]?.upgrade_cost_gold;
    if (Array.isArray(arr1) && Number.isFinite(arr1[lvl])) return arr1[lvl]; // lvl==1 => arr[1]
    const arr2 = cfg?.UPGRADE_COST_GOLD?.[type];
    if (Array.isArray(arr2) && Number.isFinite(arr2[lvl])) return arr2[lvl];
    return 100;
  }

  function getUpgradeTimeSec(b) {
    const type = b?.type;
    const lvl = Math.max(1, Math.floor(b?.level ?? 1));
    const arr1 = cfg?.BUILDING_CONFIG?.[type]?.upgrade_duration;
    if (Array.isArray(arr1) && Number.isFinite(arr1[lvl])) return arr1[lvl];
    const arr2 = cfg?.UPGRADE_DURATION?.[type];
    if (Array.isArray(arr2) && Number.isFinite(arr2[lvl])) return arr2[lvl];
    // fallback used in your UI mockups
    return 45;
  }

  function getIncomePerHour(b) {
    const type = b?.type;
    const lvl = Math.max(1, Math.floor(b?.level ?? 1));

    // common naming variants
    const farm = cfg?.BUILDING_CONFIG?.farm?.production_per_hour_gold;
    const lm = cfg?.BUILDING_CONFIG?.lumbermill?.production_per_hour_wood;

    if (type === "farm" && Array.isArray(farm)) return farm[Math.min(lvl - 1, farm.length - 1)] ?? 0;
    if (type === "lumbermill" && Array.isArray(lm)) return lm[Math.min(lvl - 1, lm.length - 1)] ?? 0;

    return 0;
  }

  function getIncomeDeltaIfUpgrade(b) {
    const type = b?.type;
    if (type !== "farm" && type !== "lumbermill") return 0;
    const lvl = Math.max(1, Math.floor(b?.level ?? 1));
    const b2 = { type, level: lvl + 1 };
    return getIncomePerHour(b2) - getIncomePerHour(b);
  }

  // -------------------------
  // ACTION GENERATION
  // -------------------------
  function buildEmptyTileActions() {
    const gold = getGold();
    const out = [];

    for (const type of getBuildTypes()) {
      const cost = getBuildCost(type);
      const can = gold >= cost;

      out.push({
        icon: "🏗️",
        label: type.toUpperCase(),
        type: "build",
        buildingType: type,
        cost,
        time: 30,
        income: 0,
        enabled: !!can,
      });
    }

    // sort: enabled first, then cheapest
    out.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (a.cost ?? 0) - (b.cost ?? 0);
    });

    return out;
  }

  function buildBuildingActions(b) {
    const gold = getGold();
    const out = [];

    const isUpgrading = b?.upgrade_end != null;
    const upCost = getUpgradeCost(b);
    const upTime = getUpgradeTimeSec(b);
    const canUpgrade = !isUpgrading && gold >= upCost;

    out.push({
      icon: "⬆️",
      label: "UPGRADE",
      type: "upgrade",
      buildingId: b._id,
      cost: upCost,
      time: upTime,
      incomeDelta: getIncomeDeltaIfUpgrade(b),
      enabled: !!canUpgrade,
    });

    // If an upgrade is running, offer gem speedups.
    if (isUpgrading) {
      const now = Date.now() / 1000;
      const ue = Number(b.upgrade_end);
      const remaining = Math.max(0, ue - now);

      // Pricing mirror (backend placeholder): 1 gem per started 5 minutes.
      const costFor = (seconds) => Math.max(1, Math.ceil(Math.max(0, seconds) / 300));

      out.push({
        icon: "⚡",
        label: "SPEEDUP (FINISH)",
        type: "speedup",
        speedupMode: "finish",
        buildingId: b._id,
        costGems: costFor(remaining),
        time: 0,
        enabled: true,
      });

      out.push({
        icon: "⚡",
        label: "SPEEDUP (-5m)",
        type: "speedup",
        speedupMode: "reduce",
        seconds: 300,
        buildingId: b._id,
        costGems: costFor(Math.min(300, remaining)),
        time: 0,
        enabled: true,
      });
    }

    out.push({
      icon: "🧨",
      label: "DEMOLISH",
      type: "demolish",
      buildingId: b._id,
      cost: 0,
      time: 0,
      enabled: b?.type !== "townhall",
    });

    return out;
  }

  // -------------------------
  // CONFIRM
  // -------------------------
  function openConfirm(action) {
    if (!action?.enabled) return;
    s.contextMenu.mode = "confirm";
    s.contextMenu.confirmAction = action;
  }

  function executeConfirm() {
    const a = s.contextMenu.confirmAction;
    if (!a) return;

    if (a.type === "build") {
      IsoCity.api.placeBuilding(a.buildingType, s.contextMenu.tileX, s.contextMenu.tileY);
    } else if (a.type === "upgrade") {
      IsoCity.api.upgradeBuilding(a.buildingId);
    } else if (a.type === "demolish") {
      IsoCity.api.demolishBuilding(a.buildingId);
    } else if (a.type === "speedup") {
      IsoCity.api.speedupUpgrade({
        buildingId: a.buildingId,
        mode: a.speedupMode,
        seconds: a.speedupMode === "reduce" ? a.seconds : null,
      });
    }

    closeMenu();
  }

  // -------------------------
  // INPUT: pointer move (hover)
  // -------------------------
  function onPointerMove(e) {
    if (!s.canvas) return;
    if (s.contextMenu?.visible) return; // freeze hover while menu is open

    const { px, py } = getCanvasPoint(s.canvas, e);
    const vxy = screenToView(px, py);
    if (!vxy) {
      s.hoverX = -1;
      s.hoverY = -1;
      s.hoverBuilding = null;
      return;
    }

    s.hoverX = vxy.vx;
    s.hoverY = vxy.vy;

    const b = s.grid?.[vxy.vx]?.[vxy.vy] || null;

    // Selection is a small but important piece of "mravní" čistoty UI:
    // we always know, which building is being acted upon.
    s.selectedBuildingId = b?._id || null;

    // remember selection (for menu buttons / future HUD)
    s.selectedBuildingId = b?._id || null;
    s.hoverBuilding = b;
  }

  // -------------------------
  // INPUT: pointer down (click/tap)
  // -------------------------
  function onPointerDown(e) {
    if (!s.canvas) return;
    const { px, py } = getCanvasPoint(s.canvas, e);

    // CONFIRM MODE
    if (s.contextMenu.visible && s.contextMenu.mode === "confirm") {
      const h = s.contextMenu.hit;

      if (h.confirmYes && pointInRect(px, py, h.confirmYes)) {
        executeConfirm();
        return;
      }
      if (h.confirmNo && pointInRect(px, py, h.confirmNo)) {
        closeMenu();
        return;
      }
      if (h.close && pointInRect(px, py, h.close)) {
        closeMenu();
        return;
      }
      // click outside confirm does nothing (safer on mobile)
      return;
    }

    // MENU OPEN
    if (s.contextMenu.visible) {
      const h = s.contextMenu.hit;

      if (h.close && pointInRect(px, py, h.close)) {
        closeMenu();
        return;
      }

      for (const it of h.actions) {
        if (pointInRect(px, py, it.rect)) {
          // disabled items just ignore
          if (it.action?.enabled) openConfirm(it.action);
          return;
        }
      }

      // click outside => close
      closeMenu();
      return;
    }

    // NORMAL TAP: open menu on tile
    const vxy = screenToView(px, py);
    if (!vxy) return;

    const b = s.grid?.[vxy.vx]?.[vxy.vy] || null;

    /* =========================
       📱 MOBILE: 2-TAP LOGIC
       ========================= */
    if (isTouch()) {
      const same =
        s.lastTappedTile &&
        s.lastTappedTile.vx === vxy.vx &&
        s.lastTappedTile.vy === vxy.vy;

      // 1st tap → jen vybrat (jako hover)
      if (!same) {
        s.lastTappedTile = { vx: vxy.vx, vy: vxy.vy };

        s.hoverX = vxy.vx;
        s.hoverY = vxy.vy;
        s.hoverBuilding = b;
        s.selectedBuildingId = b?._id || null;

        return; // ⛔ NEOTEVÍRAT menu
      }

      // 2nd tap na stejný tile → otevřít menu
      s.lastTappedTile = null;
    }

    /* =========================
       🖱️ DESKTOP / 2nd TAP
       ========================= */
    s.contextMenu.visible = true;
    s.contextMenu.tileX = vxy.vx;
    s.contextMenu.tileY = vxy.vy;
    s.contextMenu.building = b;
    s.contextMenu.mode = b ? "building" : "empty";
    s.contextMenu.actions = b
      ? buildBuildingActions(b)
      : buildEmptyTileActions();
    s.contextMenu.confirmAction = null;

    s.uiMode = "context";

  }

  // -------------------------
  // RENDER: context menu overlay
  // -------------------------
  IsoCity.uiOverlay = IsoCity.uiOverlay || {};

  // keep old calls safe if something expects them
  IsoCity.uiOverlay.drawInspectPanel = IsoCity.uiOverlay.drawInspectPanel || function () { };
  IsoCity.uiOverlay.drawHUD = IsoCity.uiOverlay.drawHUD || function () {
    const s = IsoCity.state;
    if (!IsoCity.ui || !IsoCity.ui.statusIsFresh()) return;

    const ctx = s.ctx;
    if (!ctx || !s.canvas) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const msg = s.lastStatus || "";
    ctx.font = "12px Arial";
    const w = ctx.measureText(msg).width + 16;

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(10, s.canvas.height - 26, w, 18);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(msg, 18, s.canvas.height - 17);

    ctx.restore();
  };

  IsoCity.uiOverlay.drawContextMenu = function () {
    if (!s.contextMenu.visible) return;

    const ctx = s.ctx;
    if (!ctx || !s.canvas) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const isConfirm = s.contextMenu.mode === "confirm";
    const w = 380;
    const h = isConfirm ? 220 : 360;

    const x = Math.floor(s.canvas.width / 2 - w / 2);
    const y = Math.floor(s.canvas.height / 2 - h / 2);

    // hit map reset
    s.contextMenu.hit = { close: null, actions: [], confirmYes: null, confirmNo: null };

    // panel bg
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(x, y, w, h);

    // title
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const b = s.contextMenu.building;
    const title = isConfirm
      ? "CONFIRM"
      : (b ? `${String(b.type).toUpperCase()} (Lvl ${b.level ?? 1})` : "EMPTY TILE");

    ctx.fillText(title, x + 18, y + 14);

    // close X (stable top-right)
    ctx.font = "22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", x + w - 22, y + 22);
    s.contextMenu.hit.close = { x: x + w - 44, y: y + 6, w: 38, h: 38 };

    // content
    if (isConfirm) {
      const a = s.contextMenu.confirmAction || {};
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#fff";

      let yy = y + 58;
      ctx.fillText(`Cost: ${Math.round(a.cost ?? 0)}g`, x + 18, yy); yy += 24;
      if (Number.isFinite(a.time)) ctx.fillText(`Time: ${Math.round(a.time)}s`, x + 18, yy), yy += 24;

      if (Number.isFinite(a.incomeDelta) && a.incomeDelta !== 0) {
        const sign = a.incomeDelta > 0 ? "+" : "";
        ctx.fillText(`Benefit: ${sign}${a.incomeDelta}/h`, x + 18, yy);
      }

      // big square buttons
      const btnW = 140;
      const btnH = 64;
      const btnY = y + h - 86;

      // YES
      ctx.fillStyle = "#2ecc71";
      ctx.fillRect(x + 40, btnY, btnW, btnH);
      ctx.fillStyle = "#000";
      ctx.font = "34px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✔", x + 40 + btnW / 2, btnY + btnH / 2);
      s.contextMenu.hit.confirmYes = { x: x + 40, y: btnY, w: btnW, h: btnH };

      // NO
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(x + w - 40 - btnW, btnY, btnW, btnH);
      ctx.fillStyle = "#000";
      ctx.fillText("✕", x + w - 40 - btnW / 2, btnY + btnH / 2);
      s.contextMenu.hit.confirmNo = { x: x + w - 40 - btnW, y: btnY, w: btnW, h: btnH };

      ctx.restore();
      return;
    }

    // actions list
    let yy = y + 54;
    const rowH = 56;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "15px Arial";

    for (const a of s.contextMenu.actions) {
      const enabled = !!a.enabled;
      const rx = x + 18;
      const rw = w - 36;

      ctx.fillStyle = enabled ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(rx, yy, rw, rowH);

      // icon
      ctx.fillStyle = enabled ? "#fff" : "rgba(255,255,255,0.35)";
      ctx.font = "20px Arial";
      ctx.fillText(a.icon || "•", rx + 12, yy + rowH / 2);

      // label + small meta
      ctx.font = "bold 14px Arial";
      ctx.fillText(a.label || a.type, rx + 48, yy + 18);

      ctx.font = "12px Arial";
      const meta = [];
      if (Number.isFinite(a.cost)) meta.push(`${Math.round(a.cost)}g`);
      if (Number.isFinite(a.costGems)) meta.push(`${Math.round(a.costGems)}💎`);
      if (Number.isFinite(a.time)) meta.push(`${Math.round(a.time)}s`);
      if (Number.isFinite(a.incomeDelta) && a.incomeDelta !== 0) {
        const sign = a.incomeDelta > 0 ? "+" : "";
        meta.push(`${sign}${a.incomeDelta}/h`);
      }
      if (meta.length) ctx.fillText(meta.join(" • "), rx + 48, yy + 38);

      s.contextMenu.hit.actions.push({
        rect: { x: rx, y: yy, w: rw, h: rowH },
        action: a,
      });

      yy += rowH + 12;
      if (yy > y + h - 30) break;
    }

    ctx.restore();
  };

  // -------------------------
  // ATTACH
  // -------------------------
  IsoCity.input = IsoCity.input || {};
  IsoCity.input.attach = function (canvas) {
    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerdown", onPointerDown);
  };
})(window);

