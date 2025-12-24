/* iso_render.js */
(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;
  const U = IsoCity.util;

  function isoToScreen(vx, vy) {
    return { sx: (vy - vx) * (cfg.tileWidth / 2), sy: (vx + vy) * (cfg.tileHeight / 2) };
  }

  // Center the viewport (view.w x view.h) on the canvas.
  function recenterOrigin() {
    const s = IsoCity.state;
    if (!s?.canvas) return;

    const v = s.world?.view;
    if (!v) return;

    // center tile in viewport coords
    const cx = (v.w - 1) / 2;
    const cy = (v.h - 1) / 2;

    const { sx, sy } = isoToScreen(cx, cy);

    // Put the CENTER TILE ground point to canvas center.
    // Ground point is (origin + isoToScreen + tileHeight/2).
    s.world.origin.x = Math.floor(s.canvas.width / 2 - sx);
    s.world.origin.y = Math.floor(s.canvas.height / 2 - sy - cfg.tileHeight / 2);
  }

  function tileGroundPoint(vx, vy) {
    const s = IsoCity.state;
    const { sx, sy } = isoToScreen(vx, vy);
    return { gx: s.world.origin.x + sx, gy: s.world.origin.y + sy + cfg.tileHeight / 2 };
  }

  function resetTransform(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawDiamondPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cfg.tileWidth / 2, cfg.tileHeight / 2);
    ctx.lineTo(0, cfg.tileHeight);
    ctx.lineTo(-cfg.tileWidth / 2, cfg.tileHeight / 2);
    ctx.closePath();
  }

  function buildingScaleFor(img) {
    const vf = cfg.visualFit || { maxW: 1.6, maxH: 3.2, minScale: 0.2, maxScale: 1.0, groundLiftPx: 0 };
    const maxW = cfg.tileWidth * vf.maxW;
    const maxH = cfg.tileHeight * vf.maxH;
    const sW = maxW / img.width;
    const sH = maxH / img.height;
    const sc = Math.min(sW, sH);
    return Math.min(vf.maxScale, Math.max(vf.minScale, sc));
  }

  IsoCity.render = {
    isoToScreen,
    tileGroundPoint,
    buildingScaleFor,
    recenterOrigin,

    drawFrame() {
      const s = IsoCity.state;
      const ctx = s.ctx;
      if (!ctx || !s.canvas) return;

      const v = s.world?.view;
      if (!v) return;

      resetTransform(ctx);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);

      // build tile list in viewport coords
      const tiles = [];
      for (let x = 0; x < v.w; x++) for (let y = 0; y < v.h; y++) tiles.push({ x, y });
      tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      // terrain
      for (const t of tiles) {
        const { sx, sy } = isoToScreen(t.x, t.y);
        ctx.save();
        ctx.translate(s.world.origin.x + sx, s.world.origin.y + sy);

        // vary by WORLD coord (stable while panning)
        const { wx, wy } = IsoCity.world.viewToWorld(t.x, t.y);
        const wb = IsoCity.state?.world?.bounds;
        const inside = wb ? (wx >= wb.min_x && wx <= wb.max_x && wy >= wb.min_y && wy <= wb.max_y) : true;
        const r = U?.hash2 ? U.hash2(wx, wy) : ((Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453) % 1);

        const base1 = inside ? (0.7 + r * 0.1) : 0.18;
        const base2 = inside ? (0.6 + r * 0.08) : 0.14;

        const g = ctx.createLinearGradient(0, 0, 0, cfg.tileHeight);
        g.addColorStop(0, `rgb(${Math.floor(210 * base1)},${Math.floor(185 * base1)},${Math.floor(150 * base1)})`);
        g.addColorStop(1, `rgb(${Math.floor(210 * base2)},${Math.floor(185 * base2)},${Math.floor(150 * base2)})`);

        drawDiamondPath(ctx);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.stroke();

        const b = s.grid?.[t.x]?.[t.y] || null;

        // hover overlay for empty tile (only inside bounds)
        if (inside && s.uiMode !== "context" && t.x === s.hoverX && t.y === s.hoverY && !b) {
          ctx.fillStyle = "rgba(0,255,0,0.14)";
          ctx.fill();
        }

        // hover outline for building tile
        if (s.uiMode !== "context" && b && s.hoverBuilding === b) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(80,160,255,0.95)";
          ctx.stroke();
        }

        ctx.restore();
      }

      // buildings + labels
      const labelQueue = [];

      for (const t of tiles) {
        const b = s.grid?.[t.x]?.[t.y];
        if (!b) continue;

        const img = s.assets?.images?.[b.type];
        if (!img) continue;

        const { gx, gy } = tileGroundPoint(t.x, t.y);
        const sc = buildingScaleFor(img);
        const vf = cfg.visualFit || { groundLiftPx: 0 };

        const dx = gx - (img.width * sc) / 2;
        const dy = gy - img.height * sc + vf.groundLiftPx;

        const isHovered = (s.uiMode !== "context" && s.hoverBuilding === b);
        if (isHovered) {
          labelQueue.push({
            x: gx,
            y: gy - 62,
            text: `${String(b.type).toUpperCase()} (Lvl ${b.level ?? 1})`,
          });
        }

        ctx.save();
        if (isHovered) ctx.filter = `drop-shadow(0 0 7px rgba(80,160,255,0.9))`;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, dx, dy, img.width * sc, img.height * sc);
        ctx.restore();
      }

      // overlay: unified context menu
      IsoCity.uiOverlay?.drawContextMenu?.();

      // labels
      if (labelQueue.length) {
        ctx.save();
        resetTransform(ctx);
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const it of labelQueue) {
          const tw = ctx.measureText(it.text).width;
          const pad = 8;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(it.x - tw / 2 - pad, it.y - 10, tw + pad * 2, 20);
          ctx.fillStyle = "#fff";
          ctx.fillText(it.text, it.x, it.y);
        }
        ctx.restore();
      }

      // HUD/status
      IsoCity.uiOverlay?.drawHUD?.();
    },
  };
})(window);

