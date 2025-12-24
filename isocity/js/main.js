/* main.js
 *
 * A small "občanský" most mezi člověkem a strojem:
 * - nastaví canvas pro mobil (DPR scaling)
 * - načte session (API_BASE, USER_ID)
 * - připojí UI menu (new_game, reset, credit gems, expand, speedup)
 * - spustí render loop + periodický refresh stavu
 */

(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;

  function $(id) { return document.getElementById(id); }

  function resizeCanvas() {
    const s = IsoCity.state;
    if (!s.canvas) return;
    const dpr = Math.max(1, Math.min(3, global.devicePixelRatio || 1));
    const w = Math.floor(global.innerWidth * dpr);
    const h = Math.floor(global.innerHeight * dpr);
    if (s.canvas.width === w && s.canvas.height === h) return;
    s.canvas.width = w;
    s.canvas.height = h;
    s.canvas.style.width = "100vw";
    s.canvas.style.height = "100vh";
    IsoCity.world.recenter();
  }

  function preloadImages() {
    const s = IsoCity.state;
    const imageMap = cfg.imageMap || {};
    const keys = Object.keys(imageMap);

    return new Promise((resolve) => {
      if (!keys.length) return resolve();
      let loaded = 0;

      for (const type of keys) {
        const img = new Image();
        img.src = imageMap[type];
        img.onload = img.onerror = () => {
          s.assets.images[type] = img;
          loaded++;
          if (loaded === keys.length) resolve();
        };
      }
    });
  }

  function openMenu() {
    const m = $("menu");
    if (!m) return;
    m.classList.remove("hidden");
    // populate inputs from session
    const sess = IsoCity.session;
    if ($("inpApiBase")) $("inpApiBase").value = sess.apiBase;
    if ($("inpUserId")) $("inpUserId").value = sess.userId;
  }

  function closeMenu() {
    const m = $("menu");
    if (!m) return;
    m.classList.add("hidden");
  }

  function wireUI() {
    // menu open/close
    $("btnMenu")?.addEventListener("click", openMenu);
    $("btnMenuClose")?.addEventListener("click", closeMenu);
    $("menu")?.addEventListener("click", (e) => {
      if (e.target?.id === "menu") closeMenu();
    });

    // recenter camera around (0,0)
    $("btnRecenter")?.addEventListener("click", () => {
      IsoCity.world.recenterToZero();
      IsoCity.ui.setStatus("Na střed.");
    });

    // D-pad panning
    $("panUp")?.addEventListener("click", () => IsoCity.world.shiftView(0, -1));
    $("panDown")?.addEventListener("click", () => IsoCity.world.shiftView(0, 1));
    $("panLeft")?.addEventListener("click", () => IsoCity.world.shiftView(-1, 0));
    $("panRight")?.addEventListener("click", () => IsoCity.world.shiftView(1, 0));

    // save & load session
    $("btnSaveSession")?.addEventListener("click", async () => {
      const apiBase = $("inpApiBase")?.value || cfg.API_BASE;
      const uid = $("inpUserId")?.value || cfg.USER_ID;
      IsoCity.session.set({ apiBase, userId: uid });
      IsoCity.ui.setStatus("Session uložena.");
      closeMenu();
      await IsoCity.api.loadGameState();
    });

    // new game
    $("btnNewGame")?.addEventListener("click", async () => {
      try {
        const desired = $("inpUserId")?.value || "";
        await IsoCity.api.newGame({ desiredUserId: desired });
        closeMenu();
      } catch (e) {
        console.error(e);
        IsoCity.ui.setStatus(String(e?.message || e));
      }
    });

    // dev reset
    $("btnDevReset")?.addEventListener("click", async () => {
      try {
        await IsoCity.api.devReset({ wipe: true });
        closeMenu();
      } catch (e) {
        console.error(e);
        IsoCity.ui.setStatus(String(e?.message || e));
      }
    });

    // credit gems
    $("btnCreditGems")?.addEventListener("click", async () => {
      const g = parseInt($("inpCreditGems")?.value || "0", 10);
      await IsoCity.api.creditGems({ gems: g });
    });

    // expand with gems
    $("btnExpandGems")?.addEventListener("click", async () => {
      const steps = parseInt($("inpExpandSteps")?.value || "1", 10);
      await IsoCity.api.expandWithGems({ steps });
    });

    // speedup selected
    $("btnSpeedupFinish")?.addEventListener("click", async () => {
      const bid = IsoCity.state.selectedBuildingId;
      await IsoCity.api.speedupUpgrade({ buildingId: bid, mode: "finish" });
    });
    $("btnSpeedup5m")?.addEventListener("click", async () => {
      const bid = IsoCity.state.selectedBuildingId;
      await IsoCity.api.speedupUpgrade({ buildingId: bid, mode: "reduce", seconds: 300 });
    });
  }

  function loop() {
    IsoCity.render.drawFrame();
    global.requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    // load session
    IsoCity.session.load();

    const s = IsoCity.state;
    s.canvas = $("canvas");
    s.ctx = s.canvas.getContext("2d", { alpha: false });

    resizeCanvas();
    global.addEventListener("resize", resizeCanvas, { passive: true });

    wireUI();

    IsoCity.ui.setStatus("Načítám assety…");
    await preloadImages();

    IsoCity.input.attach(s.canvas);
    await IsoCity.api.loadGameState();

    // gentle refresh: the backend does lazy progress on GET
    global.setInterval(() => IsoCity.api.loadGameState({ soft: true }), 8000);

    IsoCity.ui.setStatus("Připraveno.");
    global.requestAnimationFrame(loop);
  });
})(window);
