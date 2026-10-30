"use strict";

const { test, expect } = require("./fixtures");
const { open, readState, flush, reloadPersisted } = require("./helpers");

test.describe("estado, persistencia y datos demo", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("el primer arranque siembra datos demo coherentes", async ({ page }) => {
    const data = await readState(page);

    expect(data.version).toBe(1);
    expect(data.projects).toHaveLength(4);
    expect(data.projects.filter((project) => project.archived)).toHaveLength(1);

    const active = data.projects.find((project) => project.id === data.activeProjectId);
    expect(active).toBeTruthy();
    expect(active.archived).toBe(false);
    expect(active.tasks.length).toBeGreaterThan(3);

    const statuses = new Set();
    for (const project of data.projects) {
      expect(project.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(project.name.length).toBeGreaterThan(0);
      for (const task of project.tasks) {
        statuses.add(task.status);
        expect(task.id).toMatch(/^t_/);
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.order).toBeGreaterThanOrEqual(0);
      }
    }

    expect([...statuses].sort()).toEqual(["blocked", "doing", "done", "todo"]);
    // Hay al menos una tarea vencida para probar el estado de alerta.
    const stats = await page.evaluate(() => App.state.stats(App.state.activeProject()));
    expect(stats.overdue).toBeGreaterThan(0);
  });

  test("cada columna mantiene un orden consecutivo desde cero", async ({ page }) => {
    const orders = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      const result = {};
      for (const status of App.state.STATUS_IDS) {
        result[status] = App.state.tasksByStatus(project, status).map((task) => task.order);
      }
      return result;
    });

    for (const status of Object.keys(orders)) {
      expect(orders[status]).toEqual(orders[status].map((_, index) => index));
    }
  });

  test("persiste las tareas nuevas después de recargar", async ({ page }) => {
    const created = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      const task = App.state.addTask(project.id, {
        title: "Tarea persistente",
        status: "doing",
        priority: "alta",
        tags: "api, API, backend",
        estimate: 2.5,
      });
      return { projectId: project.id, taskId: task.id, order: task.order };
    });

    expect(created.order).toBeGreaterThanOrEqual(0);

    await reloadPersisted(page);

    const found = await page.evaluate(
      ({ projectId, taskId }) => {
        const project = App.state.getProject(projectId);
        return project ? project.tasks.find((task) => task.id === taskId) || null : null;
      },
      created
    );

    expect(found).toBeTruthy();
    expect(found.title).toBe("Tarea persistente");
    expect(found.status).toBe("doing");
    expect(found.priority).toBe("alta");
    expect(found.tags).toEqual(["api", "backend"]);
    expect(found.estimate).toBe(2.5);
  });

  test("mover una tarea recalcula el orden y las fechas de completado", async ({ page }) => {
    const moved = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      const target = App.state.tasksByStatus(project, "todo")[0];
      App.state.moveTask(project.id, target.id, "doing", 0);

      const afterDoing = App.state.tasksByStatus(project, "doing").map((task) => task.id);
      const todoOrders = App.state.tasksByStatus(project, "todo").map((task) => task.order);

      App.state.moveTask(project.id, target.id, "done", null);
      const doneTask = project.tasks.find((task) => task.id === target.id);
      const completedAt = doneTask.completedAt;

      App.state.moveTask(project.id, target.id, "todo", 1);
      const reopened = project.tasks.find((task) => task.id === target.id);

      return {
        targetId: target.id,
        afterDoing,
        todoOrders,
        completedAt,
        reopenedCompletedAt: reopened.completedAt,
        todoAfter: App.state.tasksByStatus(project, "todo").map((task) => task.order),
        doneOrders: App.state.tasksByStatus(project, "done").map((task) => task.order),
      };
    });

    expect(moved.afterDoing[0]).toBe(moved.targetId);
    expect(moved.todoOrders).toEqual(moved.todoOrders.map((_, index) => index));
    expect(typeof moved.completedAt).toBe("string");
    expect(moved.reopenedCompletedAt).toBeNull();
    expect(moved.todoAfter).toEqual(moved.todoAfter.map((_, index) => index));
    expect(moved.doneOrders).toEqual(moved.doneOrders.map((_, index) => index));
  });

  test("mover a bloqueado guarda el motivo y salir de bloqueado lo limpia", async ({ page }) => {
    const result = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      const task = App.state.tasksByStatus(project, "todo")[0];
      App.state.moveTask(project.id, task.id, "blocked", null);
      App.state.updateTask(project.id, task.id, { blockedReason: "Esperando deploy" });
      const blockedReason = project.tasks.find((item) => item.id === task.id).blockedReason;

      App.state.moveTask(project.id, task.id, "doing", null);
      const afterReason = project.tasks.find((item) => item.id === task.id).blockedReason;

      return { blockedReason, afterReason };
    });

    expect(result.blockedReason).toBe("Esperando deploy");
    expect(result.afterReason).toBe("");
  });

  test("archivar y restaurar proyectos actualiza el proyecto activo", async ({ page }) => {
    const result = await page.evaluate(() => {
      const activeId = App.state.get().activeProjectId;
      const project = App.state.getProject(activeId);
      App.state.archiveProject(activeId);
      const afterArchive = {
        archived: project.archived,
        activeProjectId: App.state.get().activeProjectId,
      };
      App.state.unarchiveProject(activeId);
      return {
        ...afterArchive,
        restored: project.archived,
        activeAfterRestore: App.state.get().activeProjectId,
        activeId,
      };
    });

    expect(result.archived).toBe(true);
    expect(result.activeProjectId).not.toBe(result.activeId);
    expect(result.restored).toBe(false);
    expect(result.activeAfterRestore).toBe(result.activeId);
  });

  test("el backup exportado se puede reimportar sin pérdidas", async ({ page }) => {
    const exported = await page.evaluate(() => App.state.exportData());

    await page.evaluate(() => {
      const project = App.state.get().projects[0];
      App.state.addTask(project.id, { title: "Ruido" });
    });

    await page.evaluate((snapshot) => App.state.replaceAll(snapshot), exported);
    await reloadPersisted(page);

    const after = await page.evaluate(() => App.state.exportData());
    expect(after.projects).toHaveLength(exported.projects.length);
    expect(after.activeProjectId).toBe(exported.activeProjectId);
    expect(JSON.stringify(after)).toBe(JSON.stringify(exported));
  });

  test("normaliza datos incompletos o inválidos", async ({ page }) => {
    await page.evaluate(() => {
      App.state.replaceAll({
        activeProjectId: "no-existe",
        projects: [
          {
            name: "   Demo   ",
            accent: "no-es-color",
            tasks: [
              {
                status: "inventado",
                priority: "urgente",
                estimate: "mucho",
                tags: "UI, ui, api",
                dueDate: "mañana",
                subtasks: [{ title: "Una subtarea" }, null, { title: "  " }],
              },
            ],
          },
        ],
      });
    });

    const data = await readState(page);
    const project = data.projects[0];
    const task = project.tasks[0];

    expect(project.name).toBe("Demo");
    expect(project.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(data.activeProjectId).toBe(project.id);
    expect(task.title).toBe("Tarea 1");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("media");
    expect(task.estimate).toBe(0);
    expect(task.dueDate).toBeNull();
    expect(task.tags).toEqual(["ui", "api"]);
    expect(task.subtasks).toHaveLength(1);
  });

  test("las subtareas completas activan el auto-completado configurado", async ({ page }) => {
    const result = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      App.state.updateProject(project.id, { autoComplete: true });
      const task = App.state.addTask(project.id, { title: "Con subtareas", status: "todo" });
      App.state.addSubtask(project.id, task.id, "Paso uno");
      App.state.addSubtask(project.id, task.id, "Paso dos");
      const first = task.subtasks[0];
      App.state.toggleSubtask(project.id, task.id, first.id, true);
      const halfway = task.status;
      App.state.toggleSubtask(project.id, task.id, task.subtasks[1].id, true);
      const completed = task.status;
      App.state.toggleSubtask(project.id, task.id, first.id, false);
      return { halfway, completed, reopened: task.status };
    });

    expect(result.halfway).toBe("todo");
    expect(result.completed).toBe("done");
    expect(result.reopened).toBe("doing");
  });

  test("borrar tareas devuelve un snapshot que permite deshacer", async ({ page }) => {
    const result = await page.evaluate(() => {
      const project = App.state.get().projects[0];
      const list = App.state.tasksByStatus(project, "todo");
      const target = list[0];
      const snapshot = App.state.deleteTask(project.id, target.id);
      const afterDelete = project.tasks.some((task) => task.id === target.id);
      App.state.restoreTask(project.id, snapshot);
      const restored = App.state.tasksByStatus(project, "todo").map((task) => task.id);
      return { afterDelete, restored, targetId: target.id, index: snapshot.index };
    });

    expect(result.afterDelete).toBe(false);
    expect(result.restored[result.index]).toBe(result.targetId);
  });

  test("borrar todo y restaurar la demo", async ({ page }) => {
    await page.evaluate(() => App.state.wipe());
    let data = await readState(page);
    expect(data.projects).toEqual([]);
    expect(data.activeProjectId).toBeNull();

    await flush(page);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.app === "ready");
    data = await readState(page);
    expect(data.projects).toEqual([]);

    await page.evaluate(() => App.state.resetDemo());
    data = await readState(page);
    expect(data.projects).toHaveLength(4);
  });

  test("el estado se guarda bajo la clave versionada", async ({ page }) => {
    await page.evaluate(() => App.state.addTask(App.state.get().projects[0].id, { title: "Guardame" }));
    await flush(page);
    const raw = await page.evaluate(() => localStorage.getItem("estadoproyectos.v1"));
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.projects.length).toBe(4);
  });
});
