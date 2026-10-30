/* ==========================================================================
   storage.js — persistencia en localStorage, backup e importación
   ========================================================================== */
;(function (App) {
  "use strict";

  const KEY = "estadoproyectos.v1";
  const PROBE_KEY = "__estadoproyectos_probe__";
  const SAVE_DELAY = 250;

  let available = null;
  let saveTimer = 0;
  let pendingState = null;

  function isAvailable() {
    if (available !== null) return available;
    try {
      window.localStorage.setItem(PROBE_KEY, "1");
      window.localStorage.removeItem(PROBE_KEY);
      available = true;
    } catch {
      available = false;
    }
    return available;
  }

  /** @returns {{ok: boolean, data?: object|null, error?: string}} */
  function loadState() {
    if (!isAvailable()) {
      return { ok: false, error: "Este navegador no permite guardar datos locales (localStorage)." };
    }
    let raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      return { ok: false, error: "No se pudo leer el almacenamiento local." };
    }
    if (!raw) return { ok: true, data: null };
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch {
      return { ok: false, error: "Los datos guardados están dañados; se van a regenerar." };
    }
  }

  function persist() {
    saveTimer = 0;
    if (!pendingState || !isAvailable()) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(pendingState));
      return true;
    } catch {
      return false;
    }
  }

  /** Guarda con debounce; flush() fuerza la escritura inmediata. */
  function saveState(state) {
    pendingState = state;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, SAVE_DELAY);
  }

  function flush() {
    if (saveTimer) window.clearTimeout(saveTimer);
    return persist();
  }

  function clear() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = 0;
    pendingState = null;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento no hay nada que borrar */
    }
  }

  function readRaw() {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  /** Descarga el estado como archivo JSON. */
  function exportState(state) {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = App.utils.todayISO();
    link.href = url;
    link.download = `estadoproyectos-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  /** Parsea texto JSON devolviendo resultado explícito (sin lanzar). */
  function parseJSON(text) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { ok: false, error: "El archivo no tiene el formato esperado." };
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: "El archivo no es un JSON válido." };
    }
  }

  function readFile(file) {
    return new Promise((resolve) => {
      if (!file) {
        resolve({ ok: false, error: "No se eligió ningún archivo." });
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => resolve({ ok: false, error: "No se pudo leer el archivo." });
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        resolve(parseJSON(text));
      };
      reader.readAsText(file);
    });
  }

  App.storage = {
    KEY,
    isAvailable,
    loadState,
    saveState,
    flush,
    clear,
    readRaw,
    exportState,
    parseJSON,
    readFile,
  };
})(window.App = window.App || {});
