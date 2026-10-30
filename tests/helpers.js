"use strict";

const { expect } = require("@playwright/test");

/** Recolecta errores de consola, excepciones y peticiones fallidas. */
function watchErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("requestfailed", (request) => {
    errors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "?"})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  return errors;
}

/** Abre la app y espera a que el estado esté cargado. */
async function open(page, path = "/index.html") {
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.dataset.app === "ready");
}

/** Estado actual serializado. */
function readState(page) {
  return page.evaluate(() => App.state.get());
}

/** Fuerza la escritura en localStorage (evita esperar el debounce). */
function flush(page) {
  return page.evaluate(() => App.storage.flush());
}

/** Abre la app, fuerza el guardado y recarga para verificar persistencia. */
async function reloadPersisted(page) {
  await flush(page);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.app === "ready");
}

module.exports = { expect, watchErrors, open, readState, flush, reloadPersisted };
