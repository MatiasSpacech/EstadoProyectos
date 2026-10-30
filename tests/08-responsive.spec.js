"use strict";

const { test, expect } = require("./fixtures");
const { open } = require("./helpers");

async function pageHasNoHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test.describe("escritorio (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar fija, cuatro columnas y sin desborde", async ({ page }) => {
    await open(page);

    await expect(page.locator("#sidebar")).toBeInViewport();
    await expect(page.locator("#btn-menu")).toBeHidden();
    await expect(page.locator("#board .column")).toHaveCount(4);
    expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
  });

  test("la navegación entre panel y tablero funciona", async ({ page }) => {
    await open(page);
    await page.locator("#btn-view-dashboard").click();
    await expect(page.locator(".dash-card")).toHaveCount(4);
    await page.locator("#btn-view-board").click();
    await expect(page.locator("#board .column")).toHaveCount(4);
  });
});

test.describe("tablet (820)", () => {
  test.use({ viewport: { width: 820, height: 900 } });

  test("el tablero se desplaza en horizontal sin desbordar la página", async ({ page }) => {
    await open(page);

    await expect(page.locator("#btn-menu")).toBeVisible();
    const metrics = await page.locator("#board").evaluate((board) => ({
      scrollWidth: board.scrollWidth,
      clientWidth: board.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
    await expect(page.locator("#board .column")).toHaveCount(4);
  });

  test("el drawer lateral abre, cierra con Escape y al elegir proyecto", async ({ page }) => {
    await open(page);

    await page.locator("#btn-menu").click();
    await expect(page.locator("#app")).toHaveClass(/is-sidebar-open/);
    await expect(page.locator("#sidebar-overlay")).toBeVisible();
    await expect(page.locator("#btn-menu")).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(page.locator("#app")).not.toHaveClass(/is-sidebar-open/);

    await page.locator("#btn-menu").click();
    const other = await page.evaluate(() => {
      const data = App.state.get();
      return data.projects.find((project) => !project.archived && project.id !== data.activeProjectId);
    });
    await page.locator(`.project-item__btn[data-project-id="${other.id}"]`).click();
    await expect(page.locator("#app")).not.toHaveClass(/is-sidebar-open/);
    await expect(page.locator("#project-title")).toHaveText(other.name);
  });
});

test.describe("móvil (375)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("las columnas se apilan y no hay desborde horizontal", async ({ page }) => {
    await open(page);

    await expect(page.locator("#btn-menu")).toBeVisible();
    const columns = page.locator("#board .column");
    await expect(columns).toHaveCount(4);

    const layout = await page.locator("#board").evaluate((board) => {
      const first = board.querySelector(".column").getBoundingClientRect();
      const second = board.querySelectorAll(".column")[1].getBoundingClientRect();
      return { firstWidth: first.width, gapY: second.top - first.bottom, boardWidth: board.getBoundingClientRect().width };
    });
    expect(layout.boardWidth).toBeLessThanOrEqual(375);
    expect(layout.firstWidth).toBeLessThanOrEqual(343);
    expect(layout.gapY).toBeGreaterThan(0);
    expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
  });

  test("el drawer entra desde la izquierda y se cierra tocando el fondo", async ({ page }) => {
    await open(page);

    const sidebar = page.locator("#sidebar");
    expect((await sidebar.boundingBox()).x).toBeLessThan(0);

    await page.locator("#btn-menu").click();
    await expect(page.locator("#app")).toHaveClass(/is-sidebar-open/);
    await expect.poll(async () => (await sidebar.boundingBox()).x, { timeout: 2000 }).toBeGreaterThanOrEqual(0);
    const box = await sidebar.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);

    await page.locator("#sidebar-overlay").click({ position: { x: 350, y: 400 } });
    await expect(page.locator("#app")).not.toHaveClass(/is-sidebar-open/);
  });

  test("las acciones principales siguen visibles", async ({ page }) => {
    await open(page);
    await expect(page.locator("#btn-new-task")).toBeVisible();
    await expect(page.locator('[data-action="new-project"]')).toBeVisible();
  });
});
