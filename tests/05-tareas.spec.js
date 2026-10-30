"use strict";

const { test, expect } = require("./fixtures");
const { open, reloadPersisted } = require("./helpers");

async function openNewTask(page) {
  await page.locator("#btn-new-task").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function submit(dialog) {
  await dialog.locator('button[type="submit"]').click();
}

async function readTask(page, title) {
  return page.evaluate((value) => {
    const task = App.state.activeProject().tasks.find((item) => item.title === value);
    return task ? JSON.parse(JSON.stringify(task)) : null;
  }, title);
}

test.describe("tareas: crear, editar y eliminar", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("crea una tarea completa y la muestra en el tablero", async ({ page }) => {
    const dialog = await openNewTask(page);

    await dialog.locator('[name="title"]').fill("Preparar demo del cliente");
    await dialog.locator('[name="priority"]').selectOption("alta");
    await dialog.locator('[name="estimate"]').fill("3");
    await dialog.locator('[name="dueDate"]').fill("2026-02-10");
    await dialog.locator('[name="tags"]').fill("demo, cliente, demo");

    const subtaskInput = dialog.locator("[data-subtask-input]");
    await subtaskInput.fill("Armar guion");
    await subtaskInput.press("Enter");
    await subtaskInput.fill("Probar proyector");
    await subtaskInput.press("Enter");
    await expect(dialog.locator("[data-subtasks] .subtask")).toHaveCount(2);

    await dialog.locator('[name="notes"]').fill("**Ojo** con el horario.\n- Llevar cables\n- `npm run build`");
    await expect(dialog.locator("[data-notes-preview] strong")).toHaveText("Ojo");
    await expect(dialog.locator("[data-notes-preview] li")).toHaveCount(2);

    await submit(dialog);
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const task = await readTask(page, "Preparar demo del cliente");
    expect(task).not.toBeNull();
    expect(task.priority).toBe("alta");
    expect(task.estimate).toBe(3);
    expect(task.dueDate).toBe("2026-02-10");
    expect(task.tags).toEqual(["demo", "cliente"]);
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].title).toBe("Armar guion");

    const card = page.locator(`.task[data-task-id="${task.id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator(".task__priority")).toHaveAttribute("data-priority", "alta");
    await expect(card.locator(".task__tags .tag")).toHaveCount(2);
    await expect(card.locator(".task__subtasks-count")).toHaveText("0/2");
    await expect(card.locator(".task__due")).toHaveText("10 feb");
    await expect(card.locator(".task__notes")).toContainText("Ojo con el horario");

    await reloadPersisted(page);
    await expect(page.locator(`.task[data-task-id="${task.id}"]`)).toHaveCount(1);
  });

  test("valida el título obligatorio sin cerrar el diálogo", async ({ page }) => {
    const dialog = await openNewTask(page);

    await submit(dialog);
    await expect(dialog.locator(".field__error")).toBeVisible();
    await expect(dialog.locator(".field__error")).toContainText("título");
    await expect(dialog).toBeVisible();

    await dialog.locator('[name="title"]').fill("Tarea con título");
    await expect(dialog.locator(".field__error")).toHaveCount(0);
    await submit(dialog);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator(".task__title", { hasText: "Tarea con título" })).toHaveCount(1);
  });

  test("exige motivo al crear una tarea bloqueada", async ({ page }) => {
    const dialog = await openNewTask(page);
    await dialog.locator('[name="title"]').fill("Esperando credenciales");
    await dialog.locator('[name="status"]').selectOption("blocked");
    await expect(dialog.locator("[data-blocked-field]")).toBeVisible();

    await submit(dialog);
    await expect(dialog.locator(".field__error")).toContainText("bloqueada");
    await expect(dialog).toBeVisible();

    await dialog.locator('[name="blockedReason"]').fill("Falta el acceso al servidor");
    await submit(dialog);
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const task = await readTask(page, "Esperando credenciales");
    expect(task.status).toBe("blocked");
    expect(task.blockedReason).toBe("Falta el acceso al servidor");

    const card = page.locator(`.task[data-task-id="${task.id}"]`);
    await expect(card).toHaveClass(/is-blocked/);
    await expect(card.locator(".task__blocked")).toHaveText("Falta el acceso al servidor");
  });

  test("completar todas las subtareas completa la tarea (auto-completado)", async ({ page }) => {
    const dialog = await openNewTask(page);
    await dialog.locator('[name="title"]').fill("Checklist automática");

    const subtaskInput = dialog.locator("[data-subtask-input]");
    await subtaskInput.fill("Paso uno");
    await subtaskInput.press("Enter");
    await subtaskInput.fill("Paso dos");
    await subtaskInput.press("Enter");
    await submit(dialog);

    const created = await readTask(page, "Checklist automática");
    expect(created.status).toBe("todo");

    await page.locator(`.task[data-task-id="${created.id}"] .task__title`).click();
    const editDialog = page.locator("dialog[open]");
    await expect(editDialog).toBeVisible();

    await editDialog.locator("[data-subtask-toggle]").nth(0).check();
    await expect(editDialog.locator("[data-subtasks] .subtask.is-done")).toHaveCount(1);
    await editDialog.locator("[data-subtask-toggle]").nth(1).check();
    await submit(editDialog);

    const completed = await readTask(page, "Checklist automática");
    expect(completed.status).toBe("done");
    expect(completed.subtasks.every((subtask) => subtask.done)).toBe(true);
    await expect(page.locator(`.column[data-status="done"] .task[data-task-id="${completed.id}"]`)).toHaveCount(1);
  });

  test("edita una tarea existente desde su tarjeta", async ({ page }) => {
    const original = await page.evaluate(() => {
      const task = App.state.activeProject().tasks.find((item) => item.subtasks.length > 1);
      return JSON.parse(JSON.stringify(task));
    });

    await page.locator(`.task[data-task-id="${original.id}"] .task__title`).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator('[name="title"]')).toHaveValue(original.title);
    await expect(dialog.locator('[name="priority"]')).toHaveValue(original.priority);

    await dialog.locator('[name="title"]').fill("Título actualizado");
    await dialog.locator('[name="priority"]').selectOption("baja");
    await dialog.locator('[data-subtasks] [data-action="remove-subtask"]').first().click();
    await submit(dialog);

    const updated = await readTask(page, "Título actualizado");
    expect(updated.id).toBe(original.id);
    expect(updated.priority).toBe("baja");
    expect(updated.subtasks).toHaveLength(original.subtasks.length - 1);

    const card = page.locator(`.task[data-task-id="${original.id}"]`);
    await expect(card.locator(".task__title")).toHaveText("Título actualizado");
    await expect(card.locator(".task__priority")).toHaveAttribute("data-priority", "baja");
  });

  test("elimina una tarea y permite deshacer", async ({ page }) => {
    const task = await page.evaluate(() => {
      const item = App.state.activeProject().tasks.find((candidate) => candidate.status === "todo");
      return { id: item.id, title: item.title };
    });

    await page.locator(`.task[data-task-id="${task.id}"] .task__title`).click();
    const editDialog = page.locator("dialog[open]");
    await editDialog.locator('[data-action="delete-task"]').click();

    const confirm = page.locator("dialog[open]");
    await expect(confirm.locator(".dialog__title")).toHaveText("Eliminar tarea");
    await confirm.locator('button[type="submit"]').click();

    await expect(page.locator(`.task[data-task-id="${task.id}"]`)).toHaveCount(0);
    const toast = page.locator(".toast", { hasText: "Tarea eliminada" });
    await expect(toast).toBeVisible();

    await toast.locator(".toast__action").click();
    await expect(page.locator(`.task[data-task-id="${task.id}"]`)).toHaveCount(1);

    const restored = await page.evaluate(
      (taskId) => App.state.activeProject().tasks.some((item) => item.id === taskId),
      task.id
    );
    expect(restored).toBe(true);
  });

  test("las notas markdown se renderizan sin permitir HTML inyectado", async ({ page }) => {
    const dialog = await openNewTask(page);
    await dialog.locator('[name="title"]').fill("Notas seguras");
    await dialog
      .locator('[name="notes"]')
      .fill('<img src=x onerror="window.__xss = 1"> **negrita** y [enlace](https://example.com)');

    const preview = dialog.locator("[data-notes-preview]");
    await expect(preview.locator("strong")).toHaveText("negrita");
    await expect(preview.locator("a")).toHaveAttribute("href", "https://example.com");
    await expect(preview.locator("a")).toHaveAttribute("rel", /noopener/);
    await expect(preview.locator("img")).toHaveCount(0);
    await expect(preview).toContainText("<img");

    await submit(dialog);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    const task = await readTask(page, "Notas seguras");
    await expect(page.locator(`.task[data-task-id="${task.id}"] .task__notes`)).toContainText("<img");
    await expect(page.locator(`.task[data-task-id="${task.id}"] img`)).toHaveCount(0);
  });

  test("el botón + de una columna abre el diálogo con ese estado", async ({ page }) => {
    await page.locator('.column[data-status="doing"] [data-action="add-task"]').click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator('[name="status"]')).toHaveValue("doing");
    await dialog.locator('[name="title"]').fill("Creada desde la columna");
    await submit(dialog);

    const task = await readTask(page, "Creada desde la columna");
    expect(task.status).toBe("doing");
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${task.id}"]`)).toHaveCount(1);
  });

  test("atajos: n abre una tarea nueva y / enfoca la búsqueda", async ({ page }) => {
    await page.locator("body").click({ position: { x: 400, y: 10 } });
    await page.keyboard.press("n");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await page.keyboard.press("/");
    await expect(page.locator("#task-search")).toBeFocused();
  });
});
