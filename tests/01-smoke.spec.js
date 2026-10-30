"use strict";

const { test, expect } = require("@playwright/test");
const { watchErrors } = require("./helpers");

test.describe("carga inicial", () => {
  test("la aplicación arranca sin errores y muestra la interfaz base", async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto("/index.html");

    await expect(page).toHaveTitle(/EstadoProyectos/);
    await expect(page.locator(".brand__text strong")).toContainText("EstadoProyectos");
    await expect(page.locator("#sidebar")).toBeVisible();
    await expect(page.locator("#project-search")).toBeVisible();
    await expect(page.locator("#btn-new-project")).toBeVisible();
    await expect(page.locator("#btn-new-task")).toBeVisible();
    await expect(page.locator("#project-title")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("aplica el tema oscuro y los acentos neón", async ({ page }) => {
    await page.goto("/index.html");

    const styles = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        text: root.getPropertyValue("--text").trim(),
        accent: root.getPropertyValue("--accent").trim(),
        cyan: root.getPropertyValue("--cyan").trim(),
        magenta: root.getPropertyValue("--magenta").trim(),
      };
    });

    expect(styles.bodyBackground).toBe("rgb(6, 8, 15)");
    expect(styles.text).toBe("#e9eeff");
    expect(styles.accent).toBe("#22e6ff");
    expect(styles.cyan).toBe("#22e6ff");
    expect(styles.magenta).toBe("#ff3ec8");
  });

  test("los textos de la interfaz están en español", async ({ page }) => {
    await page.goto("/index.html");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#btn-new-project")).toContainText("Nuevo proyecto");
    await expect(page.locator("#btn-view-board")).toContainText("Tablero");
    await expect(page.locator("#btn-view-dashboard")).toContainText("Panel");
    await expect(page.locator("#filter-priority")).toContainText("Todas las prioridades");
  });
});
