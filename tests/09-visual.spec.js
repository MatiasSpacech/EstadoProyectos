"use strict";

const { test, expect } = require("./fixtures");
const { open } = require("./helpers");

// Fecha fija: los datos demo usan fechas relativas, así las capturas son estables.
const FIXED_TIME = new Date("2026-03-10T15:00:00Z");

async function blur(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test.describe("capturas de escritorio", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await open(page);
    await page.waitForTimeout(250);
  });

  test("tablero", async ({ page }) => {
    await expect(page).toHaveScreenshot("tablero.png");
  });

  test("panel de proyectos", async ({ page }) => {
    await page.locator("#btn-view-dashboard").click();
    await blur(page);
    await expect(page).toHaveScreenshot("panel.png");
  });

  test("modal de tarea", async ({ page }) => {
    await page.evaluate(() => {
      const task = App.state.activeProject().tasks.find((item) => item.notes && item.subtasks.length);
      document.querySelector(`.task[data-task-id="${task.id}"] .task__edit`).click();
    });
    await expect(page.locator("dialog[open]")).toBeVisible();
    await blur(page);
    await expect(page).toHaveScreenshot("modal-tarea.png");
  });

  test("menú de proyecto", async ({ page }) => {
    await page.locator("#btn-project-menu").click();
    await expect(page.locator(".menu")).toBeVisible();
    await blur(page);
    await expect(page).toHaveScreenshot("menu-proyecto.png");
  });
});

test.describe("capturas móviles", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await open(page);
    await page.waitForTimeout(250);
  });

  test("tablero móvil", async ({ page }) => {
    await expect(page).toHaveScreenshot("tablero-movil.png");
  });

  test("drawer de proyectos", async ({ page }) => {
    await page.locator("#btn-menu").click();
    await page.waitForTimeout(400);
    await blur(page);
    await expect(page).toHaveScreenshot("drawer-movil.png");
  });
});
