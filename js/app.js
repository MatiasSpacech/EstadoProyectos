/* ==========================================================================
   app.js — arranque y acciones globales de la interfaz
   ========================================================================== */
;(function (App) {
  "use strict";

  const { $, on } = App.utils;

  let initialized = false;

  /* ---------------- Flujos con confirmación ---------------- */

  async function deleteProjectFlow(projectId) {
    const project = App.state.getProject(projectId);
    if (!project) return;

    const detail = project.tasks.length
      ? ` y sus ${project.tasks.length} ${project.tasks.length === 1 ? "tarea" : "tareas"}`
      : "";

    const result = await App.modals.confirmAction({
      title: "Eliminar proyecto",
      message: `Se va a eliminar “${project.name}”${detail}. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!result.confirmed) return;

    App.state.deleteProject(project.id);
    App.toast("Proyecto eliminado.");
  }

  async function deleteTaskFlow(taskId, projectId) {
    const project = projectId ? App.state.getProject(projectId) : App.state.activeProject();
    if (!project) return;
    const task = App.state.findTask(project, taskId);
    if (!task) return;

    const result = await App.modals.confirmAction({
      title: "Eliminar tarea",
      message: `Se va a eliminar “${task.title}”. Podés deshacerlo desde el aviso.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!result.confirmed) return;

    const snapshot = App.state.deleteTask(project.id, task.id);
    App.toast("Tarea eliminada.", {
      actionLabel: "Deshacer",
      onAction: () => App.state.restoreTask(project.id, snapshot),
    });
  }

  function projectMenu(anchor, projectId) {
    const project = App.state.getProject(projectId);
    if (!project) return;

    const items = [];
    if (project.archived) {
      items.push({
        label: "Restaurar proyecto",
        onSelect: () => {
          App.state.unarchiveProject(project.id);
          App.toast("Proyecto restaurado.", { tone: "success" });
        },
      });
      items.push({
        label: "Eliminar definitivamente",
        danger: true,
        onSelect: () => deleteProjectFlow(project.id),
      });
    } else {
      if (project.id !== App.state.get().activeProjectId) {
        items.push({
          label: "Abrir tablero",
          onSelect: () => {
            App.state.setActiveProject(project.id);
            App.render.setView("board");
          },
        });
      }
      items.push({ label: "Editar proyecto", onSelect: () => App.modals.openProject(project.id) });
      items.push({
        label: "Nueva tarea",
        onSelect: () => App.modals.openTask(null, { projectId: project.id, status: "todo" }),
      });
      items.push({
        label: "Archivar proyecto",
        onSelect: () => {
          App.state.archiveProject(project.id);
          App.toast("Proyecto archivado.");
        },
      });
      items.push({
        label: "Eliminar proyecto",
        danger: true,
        onSelect: () => deleteProjectFlow(project.id),
      });
    }

    App.modals.openMenu(anchor, items);
  }

  async function importFile(file) {
    if (!file) return;
    const parsed = await App.storage.readFile(file);
    if (!parsed.ok) {
      App.toast(parsed.error, { tone: "danger", duration: 7000 });
      return;
    }

    const result = await App.modals.confirmAction({
      title: "Importar backup",
      message: "Se van a reemplazar los proyectos y tareas actuales por los del archivo. ¿Continuar?",
      confirmLabel: "Importar",
    });
    if (!result.confirmed) return;

    App.state.replaceAll(parsed.data);
    App.toast("Backup importado.", { tone: "success" });
  }

  async function wipeFlow() {
    const result = await App.modals.confirmAction({
      title: "Borrar todos los datos",
      message:
        "Se van a borrar todos los proyectos y tareas guardados en este navegador. Exportá un backup si querés conservarlos.",
      confirmLabel: "Borrar todo",
      danger: true,
    });
    if (!result.confirmed) return;

    App.state.wipe();
    App.toast("Datos borrados.");
  }

  async function demoFlow() {
    const result = await App.modals.confirmAction({
      title: "Restaurar datos de ejemplo",
      message: "Se van a reemplazar los datos actuales por los proyectos de ejemplo. ¿Continuar?",
      confirmLabel: "Restaurar demo",
    });
    if (!result.confirmed) return;

    App.state.resetDemo();
    App.toast("Datos de ejemplo restaurados.", { tone: "success" });
  }

  /* ---------------- Acciones ---------------- */

  function bindActions() {
    on(document, "click", '[data-action="new-project"]', () => App.modals.openProject());

    on(document, "click", '[data-action="new-task"]', () => {
      if (!App.state.activeProject()) {
        App.toast("Primero creá un proyecto.", { tone: "danger" });
        return;
      }
      App.modals.openTask(null, { status: "todo" });
    });

    on(document, "click", '[data-action="add-task"]', (event, button) => {
      event.stopPropagation();
      if (!App.state.activeProject()) return;
      App.modals.openTask(null, { status: button.dataset.status || "todo" });
    });

    on(document, "click", '[data-action="edit-task"]', (event, target) => {
      // Ignora clics en otros botones de la tarjeta (mover, menú, etc.).
      if (event.target.closest('[data-action]:not([data-action="edit-task"])')) return;
      const card = target.closest(".task");
      if (!card) return;
      App.modals.openTask(card.dataset.taskId, { projectId: card.dataset.projectId });
    });

    // Enter o Espacio sobre una tarjeta enfocada abre su detalle.
    on(document, "keydown", ".task", (event, card) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.repeat) return;
      event.preventDefault();
      App.modals.openTask(card.dataset.taskId, { projectId: card.dataset.projectId });
    });

    on(document, "click", '[data-action="project-menu"]', (event, button) => {
      event.stopPropagation();
      const projectId = button.dataset.projectId || App.state.get().activeProjectId;
      if (!projectId) return;
      projectMenu(button, projectId);
    });

    on(document, "click", '[data-action="export"]', () => {
      if (!App.state.get().projects.length) {
        App.toast("No hay datos para exportar.", { tone: "danger" });
        return;
      }
      App.storage.exportState(App.state.exportData());
      App.toast("Backup descargado.", { tone: "success" });
    });

    on(document, "click", '[data-action="import"]', () => {
      const input = $("#import-file");
      if (input) input.click();
    });

    const importInput = $("#import-file");
    if (importInput) {
      importInput.addEventListener("change", () => {
        const file = importInput.files && importInput.files[0];
        importInput.value = "";
        importFile(file);
      });
    }

    on(document, "click", '[data-action="restore-demo"]', () => demoFlow());
    on(document, "click", '[data-action="wipe"]', () => wipeFlow());
  }

  /* ---------------- Atajos de teclado ---------------- */

  function isTyping(target) {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.matches("input, textarea, select") ||
      target.isContentEditable ||
      Boolean(target.closest('[contenteditable="true"]'))
    );
  }

  function bindShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (App.modals.isOpen()) return;

      if (event.key === "Escape") {
        if (App.modals && App.render.getView() === "dashboard") App.render.setView("board");
        return;
      }

      const typing = isTyping(event.target);
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        if (App.state.activeProject()) App.modals.openTask(null, { status: "todo" });
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        const search = $("#task-search");
        if (search) search.focus();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target instanceof Element ? event.target.closest(".task") : null;
        if (!target) return;
        event.preventDefault();
        deleteTaskFlow(target.dataset.taskId, target.dataset.projectId);
      }
    });
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (initialized) return;
    initialized = true;

    const result = App.state.load();

    if (App.render && typeof App.render.init === "function") App.render.init();
    if (App.dnd && typeof App.dnd.init === "function") App.dnd.init();
    if (App.modals && typeof App.modals.init === "function") App.modals.init();

    bindActions();
    bindShortcuts();

    if (!result.ok) {
      App.toast(result.error, { tone: "danger", duration: 8000 });
    }

    document.documentElement.dataset.app = "ready";

    window.addEventListener("beforeunload", () => {
      App.storage.flush();
    });
  }

  App.init = init;
  App.deleteTaskFlow = deleteTaskFlow;
  App.deleteProjectFlow = deleteProjectFlow;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window.App = window.App || {});
