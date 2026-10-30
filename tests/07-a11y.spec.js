"use strict";

const { test, expect } = require("./fixtures");
const { open } = require("./helpers");

test.describe("accesibilidad", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("el enlace para saltar al contenido es el primer foco", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await expect(page.locator(".skip-link")).toHaveAttribute("href", "#board");
  });

  test("la estructura tiene un solo h1 y columnas etiquetadas", async ({ page }) => {
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    const columns = page.locator("#board .column");
    await expect(columns).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const labelledBy = await columns.nth(index).getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);
    }
  });

  test("las tarjetas exponen estado, prioridad y subtareas a lectores de pantalla", async ({ page }) => {
    const card = page.locator(".task").first();
    await expect(card).toHaveAttribute("aria-label", /—/);

    const bar = page.locator(".task__bar").first();
    if (await bar.count()) {
      await expect(bar).toHaveAttribute("role", "progressbar");
      const value = Number(await bar.getAttribute("aria-valuenow"));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    await expect(page.locator("#live-region")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("#toast-root")).toHaveAttribute("aria-live", "polite");
  });

  test("todos los botones tienen nombre accesible", async ({ page }) => {
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter((button) => {
          const text = (button.textContent || "").trim();
          const label = button.getAttribute("aria-label") || button.getAttribute("title");
          return !text && !label;
        })
        .map((button) => button.outerHTML.slice(0, 120))
    );

    expect(unnamed).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll("[tabindex]:not([tabindex='-1'])").length)).toBeGreaterThan(0);
  });

  test("el diálogo atrapa el foco, se anuncia y lo devuelve al cerrar", async ({ page }) => {
    const trigger = page.locator("#btn-new-task");
    await trigger.focus();
    await trigger.click();

    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-labelledby", /.+/);
    await expect(dialog).toHaveAccessibleName("Nueva tarea");

    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const openDialogElement = document.querySelector("dialog[open]");
        return Boolean(openDialogElement && openDialogElement.contains(document.activeElement));
      });
      expect(inside).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("una tarjeta se abre con Enter y devuelve el foco al cerrar", async ({ page }) => {
    const card = page.locator(".task").first();
    const taskTitle = await card.locator(".task__title").textContent();
    const taskId = await card.getAttribute("data-task-id");

    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[name="title"]')).toHaveValue(taskTitle);

    await page.keyboard.press("Escape");
    await expect(page.locator(`.task[data-task-id="${taskId}"]`)).toBeFocused();
  });

  test("los botones de vista exponen su estado", async ({ page }) => {
    await expect(page.locator("#btn-view-board")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#btn-view-dashboard")).toHaveAttribute("aria-pressed", "false");

    await page.locator("#btn-view-dashboard").click();
    await expect(page.locator("#btn-view-board")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#btn-view-dashboard")).toHaveAttribute("aria-pressed", "true");
  });

  test("el proyecto activo se marca con aria-current", async ({ page }) => {
    const active = page.locator(".project-item.is-active .project-item__btn");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("aria-current", "true");
  });

  test("respeta prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.app === "ready");

    const duration = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dur").trim());
    expect(duration).toBe("0ms");
  });
});
