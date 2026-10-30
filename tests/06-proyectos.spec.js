"use strict";

const fs = require("node:fs");
const { test, expect } = require("./fixtures");
const { open, readState, reloadPersisted } = require("./helpers");

async function menuItem(page, label) {
  const item = page.locator(".menu__item", { hasText: label });
  await expect(item).toBeVisible();
  await item.click();
}

test.describe("proyectos: crear, editar, archivar y eliminar", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("crea un proyecto desde el panel lateral", async ({ page }) => {
    await page.locator("#btn-new-project").click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator(".dialog__title")).toHaveText("Nuevo proyecto");

    await dialog.locator('[name="name"]').fill("Proyecto nuevo");
    await dialog.locator('[name="description"]').fill("Descripción de prueba");
    await dialog.locator("[data-swatches] .swatch").nth(3).click();
    await dialog.locator('[name="autoComplete"]').check();
    await dialog.locator('button[type="submit"]').click();

    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator("#project-title")).toHaveText("Proyecto nuevo");
    await expect(page.locator("#project-desc")).toHaveText("Descripción de prueba");
    await expect(page.locator("#project-list .project-item")).toHaveCount(4);

    const project = await page.evaluate(() => {
      const current = App.state.activeProject();
      return { id: current.id, accent: current.accent, autoComplete: current.autoComplete };
    });
    const expectedAccent = await page.evaluate(() => App.state.ACCENTS[3]);
    expect(project.accent).toBe(expectedAccent);
    expect(project.autoComplete).toBe(true);

    await reloadPersisted(page);
    await expect(page.locator("#project-title")).toHaveText("Proyecto nuevo");
    await expect(page.locator(`.project-item__btn[data-project-id="${project.id}"]`)).toHaveCount(1);
  });

  test("valida el nombre del proyecto", async ({ page }) => {
    await page.locator("#btn-new-project").click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator('button[type="submit"]').click();

    await expect(dialog.locator(".field__error")).toContainText("nombre");
    await expect(dialog).toBeVisible();

    await dialog.locator('[name="name"]').fill("Con nombre");
    await expect(dialog.locator(".field__error")).toHaveCount(0);
    await dialog.locator('button[type="submit"]').click();
    await expect(page.locator("#project-title")).toHaveText("Con nombre");
  });

  test("edita el proyecto desde su menú contextual", async ({ page }) => {
    const activeId = await page.evaluate(() => App.state.get().activeProjectId);
    const item = page.locator(`.project-item:has(.project-item__btn[data-project-id="${activeId}"])`);
    await item.hover();
    await item.locator(".project-item__more").click();

    await expect(page.locator(".menu")).toBeVisible();
    await menuItem(page, "Editar proyecto");

    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator(".dialog__title")).toHaveText("Editar proyecto");
    await dialog.locator('[name="name"]').fill("Portal renovado");
    await dialog.locator('[name="description"]').fill("Nueva descripción");
    await dialog.locator('button[type="submit"]').click();

    await expect(page.locator("#project-title")).toHaveText("Portal renovado");
    await expect(page.locator("#project-desc")).toHaveText("Nueva descripción");
    await expect(page.locator(`.project-item__btn[data-project-id="${activeId}"] .project-item__name`)).toHaveText(
      "Portal renovado"
    );
  });

  test("archiva un proyecto y lo restaura desde Archivados", async ({ page }) => {
    const activeId = await page.evaluate(() => App.state.get().activeProjectId);
    const item = page.locator(`.project-item:has(.project-item__btn[data-project-id="${activeId}"])`);
    await item.hover();
    await item.locator(".project-item__more").click();
    await menuItem(page, "Archivar proyecto");

    await expect(page.locator("#project-list .project-item")).toHaveCount(2);
    await expect(page.locator("#archived-count")).toHaveText("2");
    await expect(page.locator("#project-title")).not.toHaveText("Portal de clientes");

    const data = await readState(page);
    expect(data.projects.find((project) => project.id === activeId).archived).toBe(true);
    expect(data.activeProjectId).not.toBe(activeId);

    await page.locator("#archived-section > summary").click();
    const archivedItem = page.locator(`#archived-list .project-item__btn[data-project-id="${activeId}"]`);
    await expect(archivedItem).toBeVisible();
    await archivedItem.click();

    await expect(page.locator("#project-title")).toHaveText("Portal de clientes");
    const restored = await page.evaluate(
      (projectId) => App.state.getProject(projectId).archived,
      activeId
    );
    expect(restored).toBe(false);
  });

  test("elimina un proyecto con confirmación", async ({ page }) => {
    const before = await page.evaluate(() => App.state.get().projects.length);

    await page.locator("#btn-project-menu").click();
    await menuItem(page, "Eliminar proyecto");

    const confirm = page.locator("dialog[open]");
    await expect(confirm.locator(".dialog__title")).toHaveText("Eliminar proyecto");
    await expect(confirm.locator(".dialog__text")).toContainText("no se puede deshacer");
    await confirm.locator('button[type="submit"]').click();

    const after = await page.evaluate(() => App.state.get().projects.length);
    expect(after).toBe(before - 1);
    await expect(page.locator("#project-list .project-item")).toHaveCount(2);
  });

  test("el menú se cierra con Escape y al hacer clic afuera", async ({ page }) => {
    await page.locator("#btn-project-menu").click();
    await expect(page.locator(".menu")).toBeVisible();
    await expect(page.locator(".menu__item")).not.toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".menu")).toHaveCount(0);

    await page.locator("#btn-project-menu").click();
    await expect(page.locator(".menu")).toBeVisible();
    await page.locator("#project-title").click();
    await expect(page.locator(".menu")).toHaveCount(0);
  });

  test("exporta un backup JSON descargable", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('[data-action="export"]').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^estadoproyectos-\d{4}-\d{2}-\d{2}\.json$/);
    const filePath = await download.path();
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));

    expect(payload.version).toBe(1);
    expect(payload.projects).toHaveLength(4);
    expect(payload.activeProjectId).toBeTruthy();
    await expect(page.locator(".toast", { hasText: "Backup descargado" })).toBeVisible();
  });

  test("importa un backup reemplazando los datos actuales", async ({ page }) => {
    const backup = await page.evaluate(() => {
      const data = App.state.exportData();
      data.projects = data.projects.slice(0, 2);
      data.projects[0].name = "Importado uno";
      data.activeProjectId = data.projects[0].id;
      return data;
    });

    await page.setInputFiles("#import-file", {
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup), "utf8"),
    });

    const confirm = page.locator("dialog[open]");
    await expect(confirm.locator(".dialog__title")).toHaveText("Importar backup");
    await confirm.locator('button[type="submit"]').click();

    await expect(page.locator("#project-title")).toHaveText("Importado uno");
    const count = await page.evaluate(() => App.state.get().projects.length);
    expect(count).toBe(2);

    await reloadPersisted(page);
    await expect(page.locator("#project-title")).toHaveText("Importado uno");
  });

  test("rechaza un archivo inválido sin tocar los datos", async ({ page }) => {
    await page.setInputFiles("#import-file", {
      name: "roto.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ esto no es json", "utf8"),
    });

    await expect(page.locator(".toast.toast--danger")).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const count = await page.evaluate(() => App.state.get().projects.length);
    expect(count).toBe(4);
  });

  test("borra todos los datos y restaura la demo desde el pie", async ({ page }) => {
    await page.locator('[data-action="wipe"]').click();
    const confirm = page.locator("dialog[open]");
    await expect(confirm.locator(".dialog__title")).toHaveText("Borrar todos los datos");
    await confirm.locator('button[type="submit"]').click();

    await expect(page.locator("#no-project")).toBeVisible();
    expect(await page.evaluate(() => App.state.get().projects.length)).toBe(0);

    await page.locator('[data-action="restore-demo"]').click();
    const demoConfirm = page.locator("dialog[open]");
    await expect(demoConfirm.locator(".dialog__title")).toHaveText("Restaurar datos de ejemplo");
    await demoConfirm.locator('button[type="submit"]').click();

    await expect(page.locator("#board .column")).toHaveCount(4);
    expect(await page.evaluate(() => App.state.get().projects.length)).toBe(4);
  });

  test("cancelar la confirmación no cambia nada", async ({ page }) => {
    const before = await page.evaluate(() => App.state.get().projects.length);

    await page.locator('[data-action="wipe"]').click();
    const confirm = page.locator("dialog[open]");
    await confirm.locator('[data-action="close-dialog"]').click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const after = await page.evaluate(() => App.state.get().projects.length);
    expect(after).toBe(before);
  });
});
