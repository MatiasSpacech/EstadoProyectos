"use strict";

const { test, expect } = require("./fixtures");
const { open, readState } = require("./helpers");

test.describe("tablero renderizado", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("muestra las cuatro columnas con títulos y contadores", async ({ page }) => {
    const columns = page.locator("#board .column");
    await expect(columns).toHaveCount(4);

    const titles = ["Pendientes", "En proceso", "Bloqueado", "Completadas"];
    for (let index = 0; index < titles.length; index += 1) {
      await expect(columns.nth(index).locator(".column__title")).toHaveText(titles[index]);
    }

    const data = await readState(page);
    const project = data.projects.find((item) => item.id === data.activeProjectId);
    for (const status of ["todo", "doing", "blocked", "done"]) {
      const expected = project.tasks.filter((task) => task.status === status).length;
      await expect(page.locator(`.column[data-status="${status}"] .column__count`)).toHaveText(String(expected));
      await expect(page.locator(`.column[data-status="${status}"] .task`)).toHaveCount(expected);
    }
  });

  test("las tarjetas muestran prioridad, etiquetas, fecha y subtareas", async ({ page }) => {
    const sample = await page.evaluate(() => {
      const project = App.state.activeProject();
      const task = project.tasks.find((item) => item.subtasks.length && item.tags.length && item.dueDate);
      return { id: task.id, title: task.title, priority: task.priority, tags: task.tags, subtasks: task.subtasks.length };
    });

    const card = page.locator(`.task[data-task-id="${sample.id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator(".task__title")).toHaveText(sample.title);
    await expect(card.locator(".task__priority")).toHaveAttribute("data-priority", sample.priority);
    await expect(card.locator(".task__priority")).toHaveText(/Alta|Media|Baja/);
    await expect(card.locator(".task__tags .tag")).toHaveCount(sample.tags.length);
    await expect(card.locator(".task__due")).not.toBeEmpty();
    await expect(card.locator(".task__subtasks-count")).toHaveText(new RegExp(`/0?${sample.subtasks}`));

    const barValue = await card.locator(".task__bar").getAttribute("aria-valuenow");
    expect(Number(barValue)).toBeGreaterThanOrEqual(0);
    expect(Number(barValue)).toBeLessThanOrEqual(100);
  });

  test("señala las tareas vencidas y su motivo de bloqueo", async ({ page }) => {
    await expect(page.locator(".task__due.is-overdue")).not.toHaveCount(0);

    const blocked = await page.evaluate(() => {
      const project = App.state.activeProject();
      const task = project.tasks.find((item) => item.status === "blocked" && item.blockedReason);
      return task ? { id: task.id, reason: task.blockedReason } : null;
    });

    expect(blocked).not.toBeNull();
    const card = page.locator(`.task[data-task-id="${blocked.id}"]`);
    await expect(card).toHaveClass(/is-blocked/);
    await expect(card.locator(".task__blocked")).toHaveText(blocked.reason);
    await expect(card.locator(".task__due")).toHaveClass(/is-overdue/);
  });

  test("la cabecera refleja el proyecto activo y el progreso", async ({ page }) => {
    const data = await readState(page);
    const project = data.projects.find((item) => item.id === data.activeProjectId);
    const done = project.tasks.filter((task) => task.status === "done").length;
    const expected = Math.round((done / project.tasks.length) * 100);

    await expect(page.locator("#project-title")).toHaveText(project.name);
    await expect(page.locator("#project-desc")).toHaveText(project.description);
    await expect(page.locator("#progress-text")).toHaveText(`${expected}%`);
    await expect(page.locator("#project-meta .pill").first()).toContainText(`${project.tasks.length} tareas`);
    await expect(page).toHaveTitle(new RegExp(project.name));

    const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent").trim());
    expect(accent.toLowerCase()).toBe(project.accent.toLowerCase());
  });

  test("cambiar de proyecto desde el sidebar actualiza el tablero", async ({ page }) => {
    const target = await page.evaluate(() => {
      const data = App.state.get();
      return data.projects.find((project) => !project.archived && project.id !== data.activeProjectId);
    });

    await page.locator(`.project-item__btn[data-project-id="${target.id}"]`).click();

    await expect(page.locator("#project-title")).toHaveText(target.name);
    await expect(page.locator(".project-item.is-active")).toHaveCount(1);
    await expect(page.locator(`.project-item__btn[data-project-id="${target.id}"]`)).toHaveAttribute("aria-current", "true");

    const data = await readState(page);
    expect(data.activeProjectId).toBe(target.id);
  });

  test("el panel muestra una tarjeta por proyecto con progreso y próximas tareas", async ({ page }) => {
    await page.locator("#btn-view-dashboard").click();
    await expect(page.locator("#view-dashboard")).toBeVisible();
    await expect(page.locator("#view-board")).toBeHidden();

    const cards = page.locator(".dash-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.first().locator(".dash-card__pct")).toHaveText(/^\d+%$/);
    await expect(cards.first().locator(".dash-card__bar-fill")).toBeVisible();
    await expect(cards.first().locator(".dash-card__title")).not.toBeEmpty();

    const second = await page.evaluate(() => {
      const data = App.state.get();
      const project = data.projects.find((item) => item.id !== data.activeProjectId && !item.archived);
      return { id: project.id, name: project.name };
    });

    await page.locator(`.dash-card[data-project-id="${second.id}"]`).click();
    await expect(page.locator("#view-board")).toBeVisible();
    await expect(page.locator("#project-title")).toHaveText(second.name);
  });

  test("los filtros de búsqueda, prioridad y completadas funcionan", async ({ page }) => {
    await page.locator("#task-search").fill("login");
    await expect(page.locator(".task")).toHaveCount(1);
    await expect(page.locator(".task__title")).toContainText("login");
    await expect(page.locator(".column__empty:visible")).not.toHaveCount(0);

    await page.locator("#task-search").fill("");

    await page.locator("#filter-priority").selectOption("alta");
    const priorities = await page.locator(".task__priority").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-priority"))
    );
    expect(priorities.length).toBeGreaterThan(0);
    expect(new Set(priorities)).toEqual(new Set(["alta"]));

    await page.locator("#filter-priority").selectOption("all");
    await page.locator("#task-search").fill("zzzz-no-existe");
    await expect(page.locator(".task")).toHaveCount(0);
    await expect(page.locator(".column__empty:visible").first()).toHaveText(/Ninguna tarea coincide/);
    await page.locator("#task-search").fill("");

    await page.locator("#filter-hide-done").check();
    await expect(page.locator("#board .column")).toHaveCount(3);
    await expect(page.locator('.column[data-status="done"]')).toHaveCount(0);
    await page.locator("#filter-hide-done").uncheck();
    await expect(page.locator("#board .column")).toHaveCount(4);
  });

  test("el buscador del sidebar filtra proyectos", async ({ page }) => {
    await page.locator("#project-search").fill("turnos");
    await expect(page.locator("#project-list .project-item")).toHaveCount(1);
    await expect(page.locator("#project-list .project-item__name")).toContainText("turnos");

    await page.locator("#project-search").fill("no-existe");
    await expect(page.locator("#project-list .project-item")).toHaveCount(0);
    await expect(page.locator("#project-list-empty")).toBeVisible();
    await expect(page.locator("#project-list-empty")).toContainText("Ningún proyecto coincide");

    await page.locator("#project-search").fill("");
    await expect(page.locator("#project-list .project-item")).toHaveCount(3);
  });

  test("sin proyectos se muestra el estado vacío", async ({ page }) => {
    await page.evaluate(() => App.state.wipe());

    await expect(page.locator("#no-project")).toBeVisible();
    await expect(page.locator("#view-board")).toBeHidden();
    await expect(page.locator("#filters")).toBeHidden();
    await expect(page.locator("#project-title")).toHaveText("Sin proyectos");
    await expect(page.locator("#project-list .project-item")).toHaveCount(0);
    await expect(page.locator("#btn-new-task")).toBeDisabled();

    await page.evaluate(() => App.state.resetDemo());
    await expect(page.locator("#board .column")).toHaveCount(4);
    await expect(page.locator("#btn-new-task")).toBeEnabled();
  });
});
