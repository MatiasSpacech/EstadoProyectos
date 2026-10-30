"use strict";

const { test, expect } = require("./fixtures");
const { open, readState, reloadPersisted } = require("./helpers");

/** Arrastra una tarjeta con el ratón hasta una columna (y opcionalmente un índice). */
async function startDrag(page, taskId, status, index = null) {
  const card = page.locator(`.task[data-task-id="${taskId}"]`);
  const box = await card.boundingBox();
  if (!box) throw new Error(`No se encontró la tarjeta ${taskId}`);

  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + 26, { steps: 5 });

  const zone = page.locator(`.column[data-status="${status}"] .column__body`);
  const zoneBox = await zone.boundingBox();
  if (!zoneBox) throw new Error(`No se encontró la columna ${status}`);

  let targetY = zoneBox.y + 36;
  if (index !== null) {
    const cards = page.locator(`.column[data-status="${status}"] .task`);
    const count = await cards.count();
    if (count > 0 && index < count) {
      const target = await cards.nth(index).boundingBox();
      targetY = target.y + 6;
    } else {
      targetY = zoneBox.y + zoneBox.height - 6;
    }
  }

  await page.mouse.move(zoneBox.x + zoneBox.width / 2, targetY, { steps: 14 });
  await page.waitForTimeout(120);
  return { card, zone, box, targetY };
}

test.describe("drag & drop", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("arrastra una tarea a otra columna y persiste el cambio", async ({ page }) => {
    const task = await page.evaluate(() => {
      const project = App.state.activeProject();
      const item = App.state.tasksByStatus(project, "todo")[0];
      return { id: item.id, title: item.title, projectId: project.id };
    });

    const { card } = await startDrag(page, task.id, "doing");

    await expect(page.locator(".task-placeholder")).toHaveCount(1);
    await expect(page.locator(".column__body.is-drop-target")).toHaveCount(1);

    await page.mouse.up();

    await expect(page.locator(".task-placeholder")).toHaveCount(0);
    await expect(page.locator(".column__body.is-drop-target")).toHaveCount(0);
    await expect(card).toHaveCount(1);

    const placement = await page.evaluate(
      ({ projectId, taskId }) => {
        const project = App.state.getProject(projectId);
        const item = project.tasks.find((candidate) => candidate.id === taskId);
        return {
          status: item.status,
          order: item.order,
          doing: App.state.tasksByStatus(project, "doing").map((candidate) => candidate.id),
        };
      },
      { projectId: task.projectId, taskId: task.id }
    );

    expect(placement.status).toBe("doing");
    expect(placement.doing).toContain(task.id);
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${task.id}"]`)).toHaveCount(1);

    await reloadPersisted(page);
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${task.id}"]`)).toHaveCount(1);
  });

  test("reordena dentro de la misma columna", async ({ page }) => {
    const before = await page.evaluate(() => {
      const project = App.state.activeProject();
      return App.state.tasksByStatus(project, "todo").map((task) => task.id);
    });
    expect(before.length).toBeGreaterThan(1);

    await startDrag(page, before[0], "todo", 1);
    await page.mouse.up();

    const after = await page.evaluate(() =>
      App.state.tasksByStatus(App.state.activeProject(), "todo").map((task) => task.id)
    );

    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(after).toHaveLength(before.length);
  });

  test("permite soltar en una columna vacía", async ({ page }) => {
    const task = await page.evaluate(() => {
      const project = App.state.activeProject();
      // Vacía la columna "done" moviendo sus tareas a pendientes.
      for (const item of App.state.tasksByStatus(project, "done")) {
        App.state.moveTask(project.id, item.id, "todo", null);
      }
      const source = App.state.tasksByStatus(project, "todo")[0];
      return { id: source.id, projectId: project.id };
    });

    await expect(page.locator('.column[data-status="done"] .task')).toHaveCount(0);

    await startDrag(page, task.id, "done");
    await page.mouse.up();

    await expect(page.locator('.column[data-status="done"] .task')).toHaveCount(1);
    const placement = await page.evaluate(
      ({ projectId, taskId }) => {
        const item = App.state.getProject(projectId).tasks.find((candidate) => candidate.id === taskId);
        return { status: item.status, order: item.order, completedAt: item.completedAt };
      },
      { projectId: task.projectId, taskId: task.id }
    );

    expect(placement.status).toBe("done");
    expect(placement.order).toBe(0);
    expect(typeof placement.completedAt).toBe("string");
  });

  test("el placeholder se mueve según la posición del puntero", async ({ page }) => {
    const taskId = await page.evaluate(() => App.state.tasksByStatus(App.state.activeProject(), "todo")[0].id);

    await startDrag(page, taskId, "doing", 0);
    const zone = page.locator('.column[data-status="doing"] .column__body');
    const firstCard = page.locator('.column[data-status="doing"] .task').first();

    // El placeholder debe quedar antes de la primera tarjeta.
    const order = await zone.evaluate((element) => {
      return Array.from(element.children).map((child) => child.className.split(" ")[0]);
    });
    expect(order.indexOf("task-placeholder")).toBe(0);

    const placeholderBox = await page.locator(".task-placeholder").boundingBox();
    const firstBox = await firstCard.boundingBox();
    expect(placeholderBox.y).toBeLessThanOrEqual(firstBox.y);

    await page.mouse.up();
  });

  test("mover con los botones laterales cambia de columna", async ({ page }) => {
    const task = await page.evaluate(() => {
      const project = App.state.activeProject();
      const item = App.state.tasksByStatus(project, "todo")[0];
      return { id: item.id, projectId: project.id };
    });

    const card = page.locator(`.task[data-task-id="${task.id}"]`);
    await card.hover();
    await card.locator('[data-action="move-next"]').click();

    let status = await page.evaluate(
      (taskId) => App.state.get().projects.flatMap((project) => project.tasks).find((item) => item.id === taskId).status,
      task.id
    );
    expect(status).toBe("doing");

    await page.locator(`.task[data-task-id="${task.id}"]`).hover();
    await page.locator(`.task[data-task-id="${task.id}"] [data-action="move-prev"]`).click();
    status = await page.evaluate(
      (taskId) => App.state.get().projects.flatMap((project) => project.tasks).find((item) => item.id === taskId).status,
      task.id
    );
    expect(status).toBe("todo");
  });

  test("se puede mover y reordenar solo con teclado", async ({ page }) => {
    const taskId = await page.evaluate(() => App.state.tasksByStatus(App.state.activeProject(), "todo")[0].id);
    const card = page.locator(`.task[data-task-id="${taskId}"]`);

    await card.focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${taskId}"]`)).toHaveCount(1);
    await expect(card).toBeFocused();

    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.locator(`.column[data-status="blocked"] .task[data-task-id="${taskId}"]`)).toHaveCount(1);
    await expect(card).toBeFocused();

    const before = await page.evaluate(() => {
      const project = App.state.activeProject();
      return App.state.tasksByStatus(project, "blocked").map((task) => task.order);
    });
    expect(before.length).toBeGreaterThan(1);

    await page.keyboard.press("Alt+ArrowDown");
    await expect(card).toBeFocused();

    const order = await page.evaluate((id) => {
      const project = App.state.activeProject();
      return App.state.tasksByStatus(project, "blocked").findIndex((task) => task.id === id);
    }, taskId);
    expect(order).toBeGreaterThan(0);

    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${taskId}"]`)).toHaveCount(1);

    await expect(page.locator("#live-region")).toContainText("Tarea movida");
  });

  test("el arrastre táctil con pulsación larga mueve la tarjeta", async ({ page }) => {
    const task = await page.evaluate(() => {
      const project = App.state.activeProject();
      const item = App.state.tasksByStatus(project, "todo")[0];
      return { id: item.id, projectId: project.id };
    });

    const target = await page.locator('.column[data-status="doing"] .column__body').boundingBox();
    const card = page.locator(`.task[data-task-id="${task.id}"]`);
    const box = await card.boundingBox();

    await page.evaluate((id) => {
      window.__touchTaskId = id;
    }, task.id);

    await page.evaluate(
      ({ x, y }) => {
        const card = document.querySelector(`.task[data-task-id="${window.__touchTaskId}"]`);
        const event = (type, clientX, clientY) =>
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            buttons: 1,
            clientX,
            clientY,
          });
        card.dispatchEvent(event("pointerdown", x, y));
      },
      { x: box.x + box.width / 2, y: box.y + 16 }
    );

    await page.waitForTimeout(260);
    await expect(page.locator(".task--ghost")).toHaveCount(1);

    await page.evaluate(
      ({ x, y }) => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            buttons: 1,
            clientX: x,
            clientY: y,
          })
        );
      },
      { x: target.x + target.width / 2, y: target.y + 30 }
    );

    await page.waitForTimeout(80);

    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          clientX: 0,
          clientY: 0,
        })
      );
    });

    await expect(page.locator(".task--ghost")).toHaveCount(0);
    await expect(page.locator(`.column[data-status="doing"] .task[data-task-id="${task.id}"]`)).toHaveCount(1);

    const status = await page.evaluate(
      ({ projectId, taskId }) => {
        const project = App.state.getProject(projectId);
        return project.tasks.find((item) => item.id === taskId).status;
      },
      { projectId: task.projectId, taskId: task.id }
    );
    expect(status).toBe("doing");
  });

  test("soltar fuera de una columna no mueve la tarea", async ({ page }) => {
    const task = await page.evaluate(() => {
      const project = App.state.activeProject();
      const item = App.state.tasksByStatus(project, "todo")[0];
      return { id: item.id, projectId: project.id, status: item.status };
    });

    const card = page.locator(`.task[data-task-id="${task.id}"]`);
    const box = await card.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 18);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 200, { steps: 10 });
    await page.mouse.move(10, 10, { steps: 6 });
    await page.mouse.up();

    const data = await readState(page);
    const found = data.projects.flatMap((project) => project.tasks).find((item) => item.id === task.id);
    expect(found.status).toBe(task.status);
    await expect(page.locator(".task-placeholder")).toHaveCount(0);
  });
});
