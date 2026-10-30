/* ==========================================================================
   app.js — arranque de la aplicación y orquestación de la interfaz
   ========================================================================== */
;(function (App) {
  "use strict";

  const { $ } = App.utils;

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    const result = App.state.load();

    if (!result.ok) {
      console.warn("[EstadoProyectos] " + result.error);
    }

    // La vista se conecta en la fase de render; el estado ya está disponible.
    if (App.render && typeof App.render.init === "function") {
      App.render.init();
    }

    document.documentElement.dataset.app = "ready";

    window.addEventListener("beforeunload", () => {
      App.storage.flush();
    });
  }

  App.init = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window.App = window.App || {});
