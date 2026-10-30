"use strict";

const base = require("@playwright/test");

/**
 * Fixture compartida: cualquier error de consola, excepción no capturada o
 * respuesta HTTP fallida hace fallar el test al terminar.
 */
const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push("console: " + message.text());
    });
    page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
    });

    await use(page);

    if (errors.length) {
      throw new Error("Errores detectados en la página:\n" + errors.join("\n"));
    }
  },
});

module.exports = { test, expect: base.expect };
