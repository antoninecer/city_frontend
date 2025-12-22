/* main.js (bootstrap) */
(function (global) {
  const IsoCity = (global.IsoCity = global.IsoCity || {});
  const cfg = IsoCity.cfg;

  function computeOrigin(canvas) {
    return { x: Math.floor(canvas.width / 2), y: 80 };
  }

  function preloadImages() {
    const s = IsoCity.state;
    const imageMap = cfg.imageMap;
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

  function loop() {
    IsoCity.render.drawFrame();
    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const s = IsoCity.state;

    s.canvas = document.getElementById("canvas");
    s.ctx = s.canvas.getContext("2d", { alpha: false });
    s.origin = computeOrigin(s.canvas);

    IsoCity.ui.updateUI(500, 300, "Načítám assety…");
    IsoCity.ui.setStatus("Boot…");

    await preloadImages();

    IsoCity.input.attach(s.canvas);

    await IsoCity.api.loadGameState();
    setInterval(IsoCity.api.loadGameState, 10000);

    IsoCity.ui.setStatus("Připraveno.");
    requestAnimationFrame(loop);
  });
})(window);

