/* ==========================================================================
   state.js — modelo de datos, estado central y operaciones de dominio
   ========================================================================== */
;(function (App) {
  "use strict";

  const { uid, clamp, clone, parseTags, sortByOrder, percent, isOverdue, todayISO } = App.utils;

  const VERSION = 1;
  const STATUSES = [
    { id: "todo", label: "Pendientes", hint: "Por hacer" },
    { id: "doing", label: "En proceso", hint: "En curso" },
    { id: "blocked", label: "Bloqueado", hint: "Esperando" },
    { id: "done", label: "Completadas", hint: "Terminadas" },
  ];
  const STATUS_IDS = STATUSES.map((status) => status.id);
  const STATUS_LABEL = STATUSES.reduce((acc, status) => {
    acc[status.id] = status.label;
    return acc;
  }, {});
  const PRIORITIES = [
    { id: "baja", label: "Baja" },
    { id: "media", label: "Media" },
    { id: "alta", label: "Alta" },
  ];
  const ACCENTS = ["#22e6ff", "#ff3ec8", "#9a6bff", "#a8ff3e", "#ffb020", "#ff5c7a"];

  let state = null;
  const listeners = new Set();

  /* ---------------- Normalización ---------------- */

  function isStatus(value) {
    return STATUS_IDS.includes(value);
  }

  function isPriority(value) {
    return PRIORITIES.some((priority) => priority.id === value);
  }

  function cleanText(value, max) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function normalizeDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;
  }

  function normalizeSubtask(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const title = cleanText(raw.title, 100);
    if (!title) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid("s"),
      title,
      done: Boolean(raw.done),
      order: Number.isFinite(raw.order) ? raw.order : index,
    };
  }

  function normalizeTask(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const status = isStatus(raw.status) ? raw.status : "todo";
    const estimate = Number(raw.estimate);

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid("t"),
      title: cleanText(raw.title, 120) || `Tarea ${index + 1}`,
      notes: String(raw.notes || "").slice(0, 4000),
      status,
      priority: isPriority(raw.priority) ? raw.priority : "media",
      tags: parseTags(raw.tags),
      estimate: Number.isFinite(estimate) ? clamp(Math.round(estimate * 2) / 2, 0, 999) : 0,
      dueDate: normalizeDate(raw.dueDate),
      subtasks: (Array.isArray(raw.subtasks) ? raw.subtasks : []).map(normalizeSubtask).filter(Boolean),
      order: Number.isFinite(raw.order) ? raw.order : index,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      completedAt: status === "done" ? (typeof raw.completedAt === "string" ? raw.completedAt : new Date().toISOString()) : null,
      blockedReason: cleanText(raw.blockedReason, 140),
    };
  }

  function normalizeProject(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map(normalizeTask).filter(Boolean);

    // Reindexa el orden dentro de cada columna para evitar huecos o duplicados.
    for (const status of STATUS_IDS) {
      sortByOrder(tasks.filter((task) => task.status === status)).forEach((task, position) => {
        task.order = position;
      });
    }

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid("p"),
      name: cleanText(raw.name, 60) || `Proyecto ${index + 1}`,
      description: cleanText(raw.description, 200),
      accent: /^#[0-9a-f]{6}$/i.test(String(raw.accent || "")) ? raw.accent : ACCENTS[index % ACCENTS.length],
      archived: Boolean(raw.archived),
      autoComplete: Boolean(raw.autoComplete),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      tasks,
    };
  }

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const projects = (Array.isArray(source.projects) ? source.projects : [])
      .map(normalizeProject)
      .filter(Boolean);

    // Evita ids repetidos (por ejemplo al importar un backup editado a mano).
    const seen = new Set();
    for (const project of projects) {
      if (seen.has(project.id)) project.id = uid("p");
      seen.add(project.id);
    }

    let activeProjectId = typeof source.activeProjectId === "string" ? source.activeProjectId : null;
    const active = projects.find((project) => project.id === activeProjectId && !project.archived);
    if (!active) {
      const fallback = projects.find((project) => !project.archived) || projects[0] || null;
      activeProjectId = fallback ? fallback.id : null;
    }

    return {
      version: VERSION,
      activeProjectId,
      createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
      projects,
    };
  }

  /* ---------------- Núcleo ---------------- */

  function emit(reason) {
    App.storage.saveState(state);
    for (const listener of listeners) {
      try {
        listener(state, reason);
      } catch (error) {
        console.error("[EstadoProyectos] listener:", error);
      }
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function load() {
    const result = App.storage.loadState();
    if (result.ok && result.data) {
      state = normalize(result.data);
    } else {
      state = normalize(App.seed.create());
    }
    emit("load");
    return { ok: result.ok, error: result.ok ? null : result.error };
  }

  function get() {
    return state;
  }

  function getProject(projectId) {
    if (!state) return null;
    return state.projects.find((project) => project.id === projectId) || null;
  }

  function activeProject() {
    return state ? getProject(state.activeProjectId) : null;
  }

  function statusLabel(statusId) {
    return STATUS_LABEL[statusId] || statusId;
  }

  function tasksByStatus(project, status) {
    if (!project) return [];
    return sortByOrder(project.tasks.filter((task) => task.status === status));
  }

  function nextOrder(project, status) {
    const list = tasksByStatus(project, status);
    return list.length ? list[list.length - 1].order + 1 : 0;
  }

  function findTask(project, taskId) {
    return project ? project.tasks.find((task) => task.id === taskId) || null : null;
  }

  function requireProject(projectId) {
    const project = getProject(projectId);
    if (!project) throw new Error("El proyecto no existe.");
    return project;
  }

  function requireTask(project, taskId) {
    const task = findTask(project, taskId);
    if (!task) throw new Error("La tarea no existe.");
    return task;
  }

  /* ---------------- Proyectos ---------------- */

  function addProject(data) {
    const source = data || {};
    const project = normalizeProject(
      {
        name: source.name,
        description: source.description,
        accent: source.accent,
        autoComplete: source.autoComplete,
        tasks: [],
      },
      state.projects.length
    );
    state.projects.push(project);
    state.activeProjectId = project.id;
    emit("project:add");
    return project;
  }

  function updateProject(projectId, patch) {
    const project = requireProject(projectId);
    if (!patch || typeof patch !== "object") return project;

    if ("name" in patch) project.name = cleanText(patch.name, 60) || project.name;
    if ("description" in patch) project.description = cleanText(patch.description, 200);
    if ("accent" in patch && /^#[0-9a-f]{6}$/i.test(String(patch.accent || ""))) project.accent = patch.accent;
    if ("autoComplete" in patch) project.autoComplete = Boolean(patch.autoComplete);

    emit("project:update");
    return project;
  }

  function setActiveProject(projectId) {
    const project = getProject(projectId);
    if (!project || project.archived) return false;
    if (state.activeProjectId === projectId) return true;
    state.activeProjectId = projectId;
    emit("project:select");
    return true;
  }

  function archiveProject(projectId) {
    const project = requireProject(projectId);
    project.archived = true;
    if (state.activeProjectId === projectId) {
      const next = state.projects.find((candidate) => !candidate.archived) || null;
      state.activeProjectId = next ? next.id : null;
    }
    emit("project:archive");
    return project;
  }

  function unarchiveProject(projectId) {
    const project = requireProject(projectId);
    project.archived = false;
    state.activeProjectId = project.id;
    emit("project:unarchive");
    return project;
  }

  function deleteProject(projectId) {
    const project = requireProject(projectId);
    state.projects = state.projects.filter((candidate) => candidate.id !== projectId);
    if (state.activeProjectId === projectId) {
      const next = state.projects.find((candidate) => !candidate.archived) || state.projects[0] || null;
      state.activeProjectId = next ? next.id : null;
    }
    emit("project:delete");
    return project;
  }

  /* ---------------- Tareas ---------------- */

  /**
   * Coloca una tarea en la columna y posición indicadas, recalculando el orden
   * de origen y destino. No emite eventos: lo usan las operaciones públicas.
   */
  function placeTask(project, task, toStatus, toIndex) {
    const fromStatus = task.status;
    const fromList = tasksByStatus(project, fromStatus).filter((item) => item.id !== task.id);
    const toList = fromStatus === toStatus ? fromList : tasksByStatus(project, toStatus);
    const index = toIndex === null || toIndex === undefined ? toList.length : clamp(toIndex, 0, toList.length);

    task.status = toStatus;
    if (toStatus === "done") {
      if (!task.completedAt) task.completedAt = new Date().toISOString();
    } else {
      task.completedAt = null;
      if (toStatus !== "blocked") task.blockedReason = "";
    }

    toList.splice(index, 0, task);
    toList.forEach((item, position) => {
      item.order = position;
    });
    if (fromStatus !== toStatus) {
      fromList.forEach((item, position) => {
        item.order = position;
      });
    }
    return true;
  }

  /** Si el proyecto lo permite, completa o reabre la tarea según sus subtareas. */
  function maybeAutoComplete(project, task) {
    if (!project.autoComplete || !task.subtasks.length) return false;
    const allDone = task.subtasks.every((subtask) => subtask.done);
    if (allDone && task.status !== "done") return placeTask(project, task, "done", null);
    if (!allDone && task.status === "done") return placeTask(project, task, "doing", null);
    return false;
  }

  function addTask(projectId, data) {
    const project = requireProject(projectId);
    const source = data || {};
    const status = isStatus(source.status) ? source.status : "todo";
    const task = normalizeTask(
      Object.assign({}, source, { status, order: nextOrder(project, status) }),
      project.tasks.length
    );
    project.tasks.push(task);
    maybeAutoComplete(project, task);
    emit("task:add");
    return task;
  }

  function updateTask(projectId, taskId, patch) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    const source = patch || {};

    if ("title" in source) task.title = cleanText(source.title, 120) || task.title;
    if ("notes" in source) task.notes = String(source.notes || "").slice(0, 4000);
    if ("priority" in source && isPriority(source.priority)) task.priority = source.priority;
    if ("tags" in source) task.tags = parseTags(source.tags);
    if ("estimate" in source) {
      const estimate = Number(source.estimate);
      task.estimate = Number.isFinite(estimate) ? clamp(Math.round(estimate * 2) / 2, 0, 999) : 0;
    }
    if ("dueDate" in source) task.dueDate = normalizeDate(source.dueDate);
    if ("blockedReason" in source) task.blockedReason = cleanText(source.blockedReason, 140);
    if ("subtasks" in source && Array.isArray(source.subtasks)) {
      task.subtasks = source.subtasks.map(normalizeSubtask).filter(Boolean).slice(0, 40);
      task.subtasks.forEach((subtask, index) => {
        subtask.order = index;
      });
    }

    if ("status" in source && isStatus(source.status)) {
      if (source.status !== task.status) placeTask(project, task, source.status, null);
    }

    maybeAutoComplete(project, task);
    emit("task:update");
    return task;
  }

  function moveTask(projectId, taskId, toStatus, toIndex) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    if (!isStatus(toStatus)) return false;
    if (toStatus === task.status && (toIndex === null || toIndex === undefined)) return false;

    placeTask(project, task, toStatus, toIndex);
    emit("task:move");
    return true;
  }

  function deleteTask(projectId, taskId) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    const list = tasksByStatus(project, task.status);
    const index = list.findIndex((item) => item.id === taskId);
    project.tasks = project.tasks.filter((item) => item.id !== taskId);
    list
      .filter((item) => item.id !== taskId)
      .forEach((item, position) => {
        item.order = position;
      });
    emit("task:delete");
    return { task: clone(task), index: Math.max(index, 0) };
  }

  function restoreTask(projectId, snapshot) {
    const project = requireProject(projectId);
    if (!snapshot || !snapshot.task) return false;
    const task = normalizeTask(snapshot.task, project.tasks.length);
    if (project.tasks.some((item) => item.id === task.id)) return false;
    project.tasks.push(task);
    placeTask(project, task, task.status, snapshot.index);
    emit("task:restore");
    return task;
  }

  /* ---------------- Subtareas ---------------- */

  function addSubtask(projectId, taskId, title) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    const clean = cleanText(title, 100);
    if (!clean || task.subtasks.length >= 40) return null;
    const subtask = { id: uid("s"), title: clean, done: false, order: task.subtasks.length };
    task.subtasks.push(subtask);
    maybeAutoComplete(project, task);
    emit("subtask:add");
    return subtask;
  }

  function toggleSubtask(projectId, taskId, subtaskId, done) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    const subtask = task.subtasks.find((item) => item.id === subtaskId);
    if (!subtask) return false;
    subtask.done = typeof done === "boolean" ? done : !subtask.done;
    maybeAutoComplete(project, task);
    emit("subtask:toggle");
    return subtask;
  }

  function deleteSubtask(projectId, taskId, subtaskId) {
    const project = requireProject(projectId);
    const task = requireTask(project, taskId);
    const before = task.subtasks.length;
    task.subtasks = task.subtasks.filter((item) => item.id !== subtaskId);
    if (task.subtasks.length === before) return false;
    task.subtasks.forEach((item, position) => {
      item.order = position;
    });
    maybeAutoComplete(project, task);
    emit("subtask:delete");
    return true;
  }

  /* ---------------- Métricas ---------------- */

  function stats(project) {
    const result = {
      total: 0,
      todo: 0,
      doing: 0,
      blocked: 0,
      done: 0,
      active: 0,
      percent: 0,
      overdue: 0,
      estimate: 0,
    };
    if (!project) return result;

    for (const task of project.tasks) {
      if (isStatus(task.status)) result[task.status] += 1;
      result.total += 1;
      if (task.status !== "done") {
        result.estimate += task.estimate || 0;
        if (isOverdue(task.dueDate)) result.overdue += 1;
      }
    }
    result.active = result.total - result.done;
    result.percent = percent(result.done, result.total);
    return result;
  }

  /* ---------------- Import / reset ---------------- */

  function replaceAll(raw) {
    state = normalize(raw);
    emit("replace");
    return state;
  }

  function exportData() {
    return clone(state);
  }

  function resetDemo() {
    state = normalize(App.seed.create());
    emit("reset");
    return state;
  }

  function wipe() {
    state = normalize({ projects: [], activeProjectId: null, createdAt: new Date().toISOString() });
    App.storage.clear();
    emit("wipe");
    return state;
  }

  App.state = {
    VERSION,
    STATUSES,
    STATUS_IDS,
    STATUS_LABEL,
    PRIORITIES,
    ACCENTS,
    // núcleo
    load,
    get,
    subscribe,
    emit,
    activeProject,
    getProject,
    findTask,
    tasksByStatus,
    statusLabel,
    stats,
    normalize,
    // proyectos
    addProject,
    updateProject,
    setActiveProject,
    archiveProject,
    unarchiveProject,
    deleteProject,
    // tareas
    addTask,
    updateTask,
    moveTask,
    deleteTask,
    restoreTask,
    // subtareas
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    // datos
    replaceAll,
    exportData,
    resetDemo,
    wipe,
    todayISO,
  };
})(window.App = window.App || {});
