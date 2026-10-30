/* ==========================================================================
   render.js — renderizado de sidebar, cabecera, tablero y panel
   ========================================================================== */
;(function (App) {
  "use strict";

  const {
    $,
    el,
    on,
    formatDate,
    formatDateFull,
    daysUntil,
    isOverdue,
    isDueSoon,
    plural,
    percent,
  } = App.utils;

  const filters = { projectQuery: "", query: "", priority: "all", hideDone: false };
  let view = "board";
  let initialized = false;

  const priorityLabel = App.state.PRIORITIES.reduce((acc, item) => {
    acc[item.id] = item.label;
    return acc;
  }, {});

  /* ---------------- Helpers ---------------- */

  /** Texto plano de las notas para la tarjeta (sin markdown). */
  function plainNotes(notes) {
    return String(notes || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_~|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function announce(message) {
    const region = document.getElementById("live-region");
    if (!region) return;
    region.textContent = "";
    window.setTimeout(() => {
      region.textContent = message;
    }, 40);
  }

  function taskMatches(task) {
    const query = filters.query.trim().toLowerCase();
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.hideDone && task.status === "done") return false;
    if (!query) return true;
    const haystack = [task.title, task.notes, task.tags.join(" ")].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    if (active.closest && active.closest("dialog")) return null;
    const card = active.closest("[data-task-id]");
    if (card) return { type: "task", id: card.dataset.taskId };
    if (active.id) return { type: "id", id: active.id };
    return null;
  }

  function restoreFocus(reference) {
    if (!reference) return;
    const selector =
      reference.type === "task"
        ? `.task[data-task-id="${CSS.escape(reference.id)}"]`
        : `#${CSS.escape(reference.id)}`;
    const target = document.querySelector(selector);
    if (target && target !== document.activeElement) target.focus({ preventScroll: true });
  }

  /* ---------------- Sidebar ---------------- */

  function projectItem(project) {
    const template = document.getElementById("tpl-project-item");
    const item = template.content.firstElementChild.cloneNode(true);
    const stats = App.state.stats(project);
    const isActive = project.id === App.state.get().activeProjectId && !project.archived;

    item.classList.toggle("is-active", isActive);
    item.classList.toggle("project-item--archived", project.archived);

    const button = item.querySelector(".project-item__btn");
    button.dataset.action = project.archived ? "restore-project" : "select-project";
    button.dataset.projectId = project.id;
    button.style.setProperty("--project-accent", project.accent);
    button.title = project.description ? `${project.name} · ${project.description}` : project.name;
    if (isActive) button.setAttribute("aria-current", "true");

    item.querySelector(".project-item__name").textContent = project.name;
    item.querySelector(".project-item__meta").textContent = stats.total
      ? `${stats.done} de ${stats.total} completadas`
      : "Sin tareas";
    item.querySelector(".project-item__count").textContent = stats.active || "";

    const more = item.querySelector(".project-item__more");
    more.dataset.projectId = project.id;
    more.setAttribute("aria-label", `Opciones de ${project.name}`);

    return item;
  }

  function renderSidebar() {
    const state = App.state.get();
    const list = document.getElementById("project-list");
    const archivedList = document.getElementById("archived-list");
    const empty = document.getElementById("project-list-empty");
    const archivedSection = document.getElementById("archived-section");
    const archivedCount = document.getElementById("archived-count");

    const query = filters.projectQuery.trim().toLowerCase();
    const matches = (project) =>
      !query ||
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query);

    const open = state.projects.filter((project) => !project.archived);
    const archived = state.projects.filter((project) => project.archived);
    const openVisible = open.filter(matches);
    const archivedVisible = archived.filter(matches);

    const fragment = document.createDocumentFragment();
    for (const project of openVisible) fragment.append(projectItem(project));
    list.replaceChildren(fragment);

    empty.hidden = openVisible.length > 0;
    if (!empty.hidden) {
      empty.textContent = query && open.length
        ? "Ningún proyecto coincide con la búsqueda."
        : "Sin proyectos. Creá el primero.";
    }

    archivedSection.hidden = archived.length === 0;
    archivedCount.textContent = String(archived.length);
    const archivedFragment = document.createDocumentFragment();
    for (const project of archivedVisible) archivedFragment.append(projectItem(project));
    archivedList.replaceChildren(archivedFragment);
  }

  /* ---------------- Cabecera ---------------- */

  function applyAccent(project) {
    const app = document.getElementById("app");
    if (project) {
      app.style.setProperty("--accent", project.accent);
      document.documentElement.style.setProperty("--accent", project.accent);
    }
    return app;
  }

  function chip(text, variant) {
    const node = el("span", { class: "pill" + (variant ? ` ${variant}` : ""), text });
    return node;
  }

  function renderHeader(project) {
    const title = document.getElementById("project-title");
    const desc = document.getElementById("project-desc");
    const meta = document.getElementById("project-meta");
    const dot = document.getElementById("project-accent");
    const archivedPill = document.getElementById("project-archived-pill");
    const ring = document.getElementById("ring-value");
    const progressText = document.getElementById("progress-text");
    const newTask = document.getElementById("btn-new-task");

    if (!project) {
      title.textContent = "Sin proyectos";
      desc.textContent = "Creá un proyecto para empezar a organizar tus tareas.";
      meta.replaceChildren();
      dot.style.background = "var(--muted-dim)";
      dot.style.boxShadow = "none";
      archivedPill.hidden = true;
      ring.style.strokeDashoffset = "113.1";
      progressText.textContent = "0%";
      newTask.disabled = true;
      document.title = "EstadoProyectos · tablero de proyectos";
      return;
    }

    const stats = App.state.stats(project);
    title.textContent = project.name;
    desc.textContent = project.description || "Sin descripción";
    dot.style.background = project.accent;
    dot.style.boxShadow = `0 0 14px 1px ${project.accent}`;
    archivedPill.hidden = !project.archived;
    newTask.disabled = false;

    meta.replaceChildren();
    meta.append(chip(`${stats.total} ${stats.total === 1 ? "tarea" : "tareas"}`));
    meta.append(chip(`${stats.done} ${stats.done === 1 ? "completada" : "completadas"}`));
    if (stats.estimate > 0) meta.append(chip(`${stats.estimate} h pendientes`));
    if (stats.overdue > 0) meta.append(chip(`⚠ ${plural(stats.overdue, "vencida", "vencidas")}`, "pill--warn"));
    if (project.archived) meta.append(chip("Archivado"));

    const ratio = stats.percent / 100;
    ring.style.strokeDashoffset = String(113.1 * (1 - ratio));
    progressText.textContent = `${stats.percent}%`;
    progressText.setAttribute(
      "aria-label",
      `${stats.done} de ${stats.total} tareas completadas (${stats.percent} %)`
    );
    document.title = `${project.name} · EstadoProyectos`;
  }

  /* ---------------- Tarjetas ---------------- */

  function dueLabel(task) {
    if (!task.dueDate) return "";
    const days = daysUntil(task.dueDate);
    if (days === 0) return "Hoy";
    if (days === 1) return "Mañana";
    if (days === -1) return "Ayer";
    return formatDate(task.dueDate);
  }

  function taskCard(project, task) {
    const template = document.getElementById("tpl-task");
    const card = template.content.firstElementChild.cloneNode(true);
    const statusIndex = App.state.STATUS_IDS.indexOf(task.status);

    card.dataset.taskId = task.id;
    card.dataset.projectId = project.id;
    card.dataset.status = task.status;
    card.dataset.order = String(task.order);
    card.setAttribute("aria-label", `${task.title} — ${App.state.statusLabel(task.status)}`);
    card.classList.toggle("is-done", task.status === "done");
    card.classList.toggle("is-blocked", task.status === "blocked");

    card.querySelector(".task__title").textContent = task.title;

    const notes = plainNotes(task.notes);
    const notesEl = card.querySelector(".task__notes");
    if (notes) {
      notesEl.textContent = notes;
      notesEl.hidden = false;
    }

    const tagsEl = card.querySelector(".task__tags");
    if (task.tags.length) {
      const tagFragment = document.createDocumentFragment();
      for (const tag of task.tags) {
        tagFragment.append(el("li", { class: "tag", text: tag }));
      }
      tagsEl.replaceChildren(tagFragment);
      tagsEl.hidden = false;
    }

    if (task.subtasks.length) {
      const done = task.subtasks.filter((subtask) => subtask.done).length;
      const ratio = percent(done, task.subtasks.length);
      const wrapper = card.querySelector(".task__subtasks");
      wrapper.hidden = false;
      const bar = wrapper.querySelector(".task__bar");
      bar.setAttribute("aria-valuenow", String(ratio));
      bar.setAttribute("aria-label", `${done} de ${task.subtasks.length} subtareas completadas`);
      wrapper.querySelector(".task__bar-fill").style.width = `${ratio}%`;
      wrapper.querySelector(".task__subtasks-count").textContent = `${done}/${task.subtasks.length}`;
      if (ratio === 100) wrapper.classList.add("is-complete");
    }

    const priority = card.querySelector(".task__priority");
    priority.dataset.priority = task.priority;
    priority.textContent = priorityLabel[task.priority] || task.priority;

    const due = card.querySelector(".task__due");
    if (task.dueDate) {
      due.textContent = dueLabel(task);
      due.title = "Vence " + formatDateFull(task.dueDate);
      if (task.status !== "done" && isOverdue(task.dueDate)) due.classList.add("is-overdue");
      else if (task.status !== "done" && isDueSoon(task.dueDate)) due.classList.add("is-soon");
    } else {
      due.remove();
    }

    const estimate = card.querySelector(".task__estimate");
    if (task.estimate > 0) estimate.textContent = `${task.estimate} h`;
    else estimate.remove();

    if (task.status === "blocked" && task.blockedReason) {
      const blocked = el("p", { class: "task__blocked", text: task.blockedReason });
      card.querySelector(".task__foot").before(blocked);
    }

    const prev = card.querySelector('[data-action="move-prev"]');
    const next = card.querySelector('[data-action="move-next"]');
    prev.disabled = statusIndex <= 0;
    next.disabled = statusIndex === App.state.STATUS_IDS.length - 1;
    prev.dataset.taskId = task.id;
    next.dataset.taskId = task.id;

    card.querySelector('[data-action="edit-task"]').dataset.taskId = task.id;

    return card;
  }

  /* ---------------- Tablero ---------------- */

  function columnElement(project, status) {
    const template = document.getElementById("tpl-column");
    const column = template.content.firstElementChild.cloneNode(true);
    const all = project.tasks.filter((task) => task.status === status);
    const visible = all.filter(taskMatches);
    const body = column.querySelector(".column__body");
    const empty = column.querySelector(".column__empty");
    const label = App.state.statusLabel(status);

    column.dataset.status = status;
    column.querySelector(".column__title").textContent = label;
    column.querySelector(".column__title").id = `col-title-${status}`;
    column.setAttribute("aria-labelledby", `col-title-${status}`);
    column.querySelector(".column__count").textContent = String(visible.length);
    column.querySelector("[data-action='add-task']").dataset.status = status;

    const fragment = document.createDocumentFragment();
    for (const task of visible) fragment.append(taskCard(project, task));
    body.replaceChildren(fragment);

    empty.hidden = visible.length > 0;
    if (visible.length === 0) {
      empty.textContent = all.length
        ? "Ninguna tarea coincide con el filtro."
        : "Arrastrá tareas acá.";
    }

    return column;
  }

  function renderBoard(project) {
    const board = document.getElementById("board");
    const statuses = filters.hideDone
      ? App.state.STATUS_IDS.filter((status) => status !== "done")
      : App.state.STATUS_IDS;
    const fragment = document.createDocumentFragment();
    for (const status of statuses) fragment.append(columnElement(project, status));
    board.replaceChildren(fragment);
    board.style.setProperty("--board-cols", String(statuses.length));
    board.dataset.columns = String(statuses.length);
  }

  /* ---------------- Panel ---------------- */

  function dashboardCard(project) {
    const template = document.getElementById("tpl-dashboard-item");
    const card = template.content.firstElementChild.cloneNode(true);
    const stats = App.state.stats(project);

    card.dataset.projectId = project.id;
    card.style.setProperty("--accent", project.accent);
    card.style.setProperty("--accent-glow", project.accent + "77");
    card.classList.toggle("is-archived", project.archived);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Abrir ${project.name}`);

    card.querySelector(".dash-card__title").textContent = project.name;
    card.querySelector(".dash-card__pct").textContent = `${stats.percent}%`;
    card.querySelector(".dash-card__desc").textContent = project.description || "Sin descripción";

    const statsEl = card.querySelector(".dash-card__stats");
    const statuses = [
      ["todo", stats.todo, "pendiente", "pendientes"],
      ["doing", stats.doing, "en proceso", "en proceso"],
      ["blocked", stats.blocked, "bloqueada", "bloqueadas"],
      ["done", stats.done, "completada", "completadas"],
    ];
    const statsFragment = document.createDocumentFragment();
    for (const [status, count, singular, pluralForm] of statuses) {
      if (!count) continue;
      statsFragment.append(
        el("span", {
          class: "dash-card__stat",
          style: { "--stat-color": `var(--${status})` },
          text: `${count} ${count === 1 ? singular : pluralForm}`,
        })
      );
    }
    statsEl.replaceChildren(statsFragment);

    card.querySelector(".dash-card__bar-fill").style.width = `${stats.percent}%`;

    const next = App.state
      .tasksByStatus(project, "todo")
      .concat(App.state.tasksByStatus(project, "doing"), App.state.tasksByStatus(project, "blocked"))
      .sort((a, b) => {
        const aDue = a.dueDate || "9999-12-31";
        const bDue = b.dueDate || "9999-12-31";
        if (aDue !== bDue) return aDue < bDue ? -1 : 1;
        return (b.priority === "alta" ? 1 : 0) - (a.priority === "alta" ? 1 : 0);
      })
      .slice(0, 3);

    const list = card.querySelector(".dash-card__next");
    const listFragment = document.createDocumentFragment();
    for (const task of next) {
      listFragment.append(
        el("li", {}, [
          el("span", { class: "dash-card__next-title", text: task.title }),
          el("span", {
            class: "dash-card__next-due" + (isOverdue(task.dueDate) ? " is-overdue" : ""),
            text: task.dueDate ? dueLabel(task) : "",
          }),
        ])
      );
    }
    if (!next.length) {
      listFragment.append(el("li", { class: "dash-card__next-empty", text: "Nada pendiente. ¡Bien ahí!" }));
    }
    list.replaceChildren(listFragment);

    return card;
  }

  function renderDashboard() {
    const grid = document.getElementById("dashboard-grid");
    const empty = document.getElementById("dashboard-empty");
    const projects = App.state.get().projects;

    if (!projects.length) {
      grid.replaceChildren();
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const ordered = projects
      .filter((project) => !project.archived)
      .concat(projects.filter((project) => project.archived));
    const fragment = document.createDocumentFragment();
    for (const project of ordered) fragment.append(dashboardCard(project));
    grid.replaceChildren(fragment);
  }

  /* ---------------- Vistas ---------------- */

  function renderViews(project) {
    const boardView = document.getElementById("view-board");
    const dashboardView = document.getElementById("view-dashboard");
    const noProject = document.getElementById("no-project");
    const filtersBar = document.getElementById("filters");
    const boardButton = document.getElementById("btn-view-board");
    const dashboardButton = document.getElementById("btn-view-dashboard");

    const isBoard = view === "board";
    boardButton.classList.toggle("is-active", isBoard);
    boardButton.setAttribute("aria-pressed", String(isBoard));
    dashboardButton.classList.toggle("is-active", !isBoard);
    dashboardButton.setAttribute("aria-pressed", String(!isBoard));

    if (!project) {
      boardView.hidden = true;
      dashboardView.hidden = true;
      noProject.hidden = false;
      filtersBar.hidden = true;
      return;
    }

    noProject.hidden = true;
    boardView.hidden = !isBoard;
    dashboardView.hidden = isBoard;
    filtersBar.hidden = !isBoard;

    if (isBoard) renderBoard(project);
    else renderDashboard();
  }

  /* ---------------- API ---------------- */

  function renderAll() {
    const focus = captureFocus();
    const state = App.state.get();
    const project = App.state.activeProject();

    applyAccent(project);
    renderSidebar();
    renderHeader(project);
    renderViews(project);

    restoreFocus(focus);
    return state;
  }

  function setView(next) {
    if (next !== "board" && next !== "dashboard") return false;
    view = next;
    renderViews(App.state.activeProject());
    return true;
  }

  function toggleSidebar(force) {
    const app = document.getElementById("app");
    const overlay = document.getElementById("sidebar-overlay");
    const menu = document.getElementById("btn-menu");
    const open = typeof force === "boolean" ? force : !app.classList.contains("is-sidebar-open");
    app.classList.toggle("is-sidebar-open", open);
    overlay.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    if (open) {
      const first = document.querySelector("#project-list .project-item__btn");
      if (first) first.focus({ preventScroll: true });
    }
    return open;
  }

  function bindEvents() {
    on(document, "click", '[data-action="view"]', (event, target) => {
      setView(target.dataset.view);
    });

    on(document, "click", '[data-action="select-project"]', (event, target) => {
      if (App.state.setActiveProject(target.dataset.projectId)) {
        setView("board");
        if (window.matchMedia("(max-width: 1180px)").matches) toggleSidebar(false);
      }
    });

    on(document, "click", '[data-action="restore-project"]', (event, target) => {
      App.state.unarchiveProject(target.dataset.projectId);
      announce("Proyecto restaurado.");
      if (window.matchMedia("(max-width: 1180px)").matches) toggleSidebar(false);
    });

    on(document, "click", '[data-action="open-dashboard-project"]', (event, target) => {
      if (App.state.setActiveProject(target.dataset.projectId)) setView("board");
    });

    on(document, "keydown", ".dash-card", (event, target) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (App.state.setActiveProject(target.dataset.projectId)) setView("board");
    });

    on(document, "click", '[data-action="toggle-sidebar"]', () => toggleSidebar());
    on(document, "click", '[data-action="close-sidebar"]', () => toggleSidebar(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.getElementById("app").classList.contains("is-sidebar-open")) {
        toggleSidebar(false);
      }
    });

    const projectSearch = document.getElementById("project-search");
    projectSearch.addEventListener("input", () => {
      filters.projectQuery = projectSearch.value;
      renderSidebar();
    });

    const taskSearch = document.getElementById("task-search");
    taskSearch.addEventListener("input", () => {
      filters.query = taskSearch.value;
      const project = App.state.activeProject();
      if (project && view === "board") renderBoard(project);
    });

    const priority = document.getElementById("filter-priority");
    priority.addEventListener("change", () => {
      filters.priority = priority.value;
      const project = App.state.activeProject();
      if (project && view === "board") renderBoard(project);
    });

    const hideDone = document.getElementById("filter-hide-done");
    hideDone.addEventListener("change", () => {
      filters.hideDone = hideDone.checked;
      const project = App.state.activeProject();
      if (project && view === "board") renderBoard(project);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    App.state.subscribe(() => renderAll());
    renderAll();
  }

  App.render = {
    init,
    renderAll,
    renderSidebar,
    renderHeader,
    renderBoard,
    renderDashboard,
    setView,
    getView: () => view,
    toggleSidebar,
    announce,
    filters,
    taskMatches,
    dueLabel,
    taskCard,
  };
})(window.App = window.App || {});
