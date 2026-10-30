/* ==========================================================================
   dragdrop.js — arrastrar y soltar con ratón, táctil y teclado
   ========================================================================== */
;(function (App) {
  "use strict";

  const { el, on, clamp } = App.utils;

  let initialized = false;
  let dragging = null; // { taskId, projectId, status, height }
  let placeholder = null;
  let lastTarget = null; // { status, index }
  let touch = null;
  let suppressClickUntil = 0;
  let autoScrollFrame = 0;

  /* ---------------- Utilidades de zona ---------------- */

  function zoneOf(column) {
    return column ? column.querySelector("[data-dropzone]") : null;
  }

  function statusOf(column) {
    return column ? column.dataset.status : null;
  }

  function cardsIn(zone) {
    return Array.from(zone.querySelectorAll(".task:not(.is-dragging)"));
  }

  /** Índice de inserción según la posición vertical del puntero. */
  function indexAt(zone, clientY) {
    // Se oculta el placeholder para medir sin el desplazamiento que provoca,
    // si no la propia previsualización empuja las tarjetas y el índice oscila.
    const hidePlaceholder = placeholder && placeholder.parentNode === zone && !placeholder.hidden;
    if (hidePlaceholder) placeholder.hidden = true;

    const cards = cardsIn(zone);
    let index = cards.length;
    for (let position = 0; position < cards.length; position += 1) {
      const rect = cards[position].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = position;
        break;
      }
    }

    if (hidePlaceholder) placeholder.hidden = false;
    return index;
  }

  function ensurePlaceholder(zone, index) {
    if (!placeholder) {
      placeholder = el("div", { class: "task-placeholder", attrs: { "aria-hidden": "true" } });
    }
    if (dragging) placeholder.style.height = `${Math.round(dragging.height)}px`;
    const reference = cardsIn(zone)[index] || null;
    if (reference) zone.insertBefore(placeholder, reference);
    else zone.append(placeholder);
  }

  function highlight(column) {
    for (const zone of document.querySelectorAll(".column__body.is-drop-target")) {
      if (zone !== zoneOf(column)) zone.classList.remove("is-drop-target");
    }
    const zone = zoneOf(column);
    if (zone) zone.classList.add("is-drop-target");
  }

  function clearHighlight() {
    for (const zone of document.querySelectorAll(".column__body.is-drop-target")) {
      zone.classList.remove("is-drop-target");
    }
  }

  /* ---------------- Auto-scroll ---------------- */

  function scrollStep(x, y) {
    const margin = 64;
    const board = document.getElementById("board");

    if (board && board.scrollWidth > board.clientWidth + 4) {
      const rect = board.getBoundingClientRect();
      if (x > rect.right - margin) board.scrollLeft += 14;
      else if (x < rect.left + margin) board.scrollLeft -= 14;
    }

    if (y > window.innerHeight - margin) window.scrollBy(0, 14);
    else if (y < margin + 40) window.scrollBy(0, -14);
  }

  function startAutoScroll(x, y) {
    scrollStep(x, y);
    if (autoScrollFrame) return;
    const tick = () => {
      if (!dragging) {
        autoScrollFrame = 0;
        return;
      }
      autoScrollFrame = window.requestAnimationFrame(tick);
    };
    autoScrollFrame = window.requestAnimationFrame(tick);
  }

  /* ---------------- Ciclo de arrastre ---------------- */

  function beginDrag(card) {
    const project = App.state.activeProject();
    if (!project) return false;
    const task = App.state.findTask(project, card.dataset.taskId);
    if (!task) return false;

    const rect = card.getBoundingClientRect();
    dragging = {
      taskId: task.id,
      projectId: project.id,
      status: task.status,
      height: rect.height,
    };
    card.classList.add("is-dragging");
    document.body.classList.add("is-dragging-task");
    return true;
  }

  function cleanup() {
    if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    placeholder = null;
    if (autoScrollFrame) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
    }
    for (const card of document.querySelectorAll(".task.is-dragging")) card.classList.remove("is-dragging");
    for (const ghost of document.querySelectorAll(".task--ghost")) ghost.remove();
    clearHighlight();
    document.body.classList.remove("is-dragging-task", "is-touch-dragging");
    dragging = null;
    lastTarget = null;
  }

  function commit(status, index) {
    const info = dragging;
    cleanup();
    if (!info || !status) return false;

    const moved = App.state.moveTask(info.projectId, info.taskId, status, index);
    if (!moved) return false;

    suppressClickUntil = performance.now() + 350;
    App.render.announce(`Tarea movida a ${App.state.statusLabel(status)}.`);
    return true;
  }

  function suppressAccidentalClick() {
    return performance.now() < suppressClickUntil;
  }

  /* ---------------- Ratón (HTML5 drag & drop) ---------------- */

  function bindMouseEvents() {
    on(document, "dragstart", ".task", (event, card) => {
      if (!beginDrag(card)) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.taskId);
      suppressClickUntil = performance.now() + 400;
    });

    on(document, "dragover", ".column", (event, column) => {
      if (!dragging) return;
      const zone = zoneOf(column);
      if (!zone) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const index = indexAt(zone, event.clientY);
      ensurePlaceholder(zone, index);
      highlight(column);
      lastTarget = { status: statusOf(column), index };
      startAutoScroll(event.clientX, event.clientY);
    });

    on(document, "drop", ".column", (event, column) => {
      if (!dragging) return;
      const zone = zoneOf(column);
      if (!zone) return;

      event.preventDefault();
      const index = indexAt(zone, event.clientY);
      commit(statusOf(column), index);
    });

    on(document, "dragend", ".task", () => {
      cleanup();
    });
  }

  /* ---------------- Táctil (pointer events + long press) ---------------- */

  function removeTouchListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", cancelTouch);
  }

  function cancelTouch() {
    if (!touch) return;
    window.clearTimeout(touch.timer);
    removeTouchListeners();
    if (touch.active) cleanup();
    touch = null;
  }

  function beginTouchDrag() {
    if (!touch || touch.active) return;
    const card = touch.card;
    if (!card.isConnected || !beginDrag(card)) {
      cancelTouch();
      return;
    }

    const rect = card.getBoundingClientRect();
    touch.active = true;
    touch.height = rect.height;

    const ghost = card.cloneNode(true);
    ghost.classList.add("task--ghost");
    ghost.removeAttribute("data-action");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    });
    document.body.append(ghost);
    touch.ghost = ghost;
    touch.offsetX = touch.startX - rect.left;
    touch.offsetY = touch.startY - rect.top;

    document.body.classList.add("is-touch-dragging");
    const zone = card.closest("[data-dropzone]");
    if (zone) {
      ensurePlaceholder(zone, cardsIn(zone).indexOf(card));
      highlight(zone.closest(".column"));
    }
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function onPointerMove(event) {
    if (!touch) return;

    if (!touch.active) {
      const distance = Math.hypot(event.clientX - touch.startX, event.clientY - touch.startY);
      if (distance > 10) cancelTouch();
      return;
    }

    event.preventDefault();
    touch.ghost.style.left = `${event.clientX - touch.offsetX}px`;
    touch.ghost.style.top = `${event.clientY - touch.offsetY}px`;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const column = element && element.closest ? element.closest(".column") : null;
    if (column) {
      const zone = zoneOf(column);
      if (zone) {
        const index = indexAt(zone, event.clientY);
        ensurePlaceholder(zone, index);
        highlight(column);
        lastTarget = { status: statusOf(column), index };
      }
    }

    startAutoScroll(event.clientX, event.clientY);
  }

  function onPointerUp() {
    if (!touch) return;
    const active = touch.active;
    const target = lastTarget;

    window.clearTimeout(touch.timer);
    removeTouchListeners();
    touch = null;

    if (!active) return;
    if (!target || !commit(target.status, target.index)) cleanup();
  }

  function bindTouchEvents() {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "mouse" || event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("button")) return;

        const card = target.closest(".task");
        if (!card) return;

        touch = {
          card,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
          timer: window.setTimeout(beginTouchDrag, 180),
        };

        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", cancelTouch);
      },
      { passive: true }
    );

    document.addEventListener("contextmenu", (event) => {
      if (touch && touch.active) event.preventDefault();
    });
  }

  /* ---------------- Teclado y botones ---------------- */

  function moveByStatus(project, task, direction) {
    const statuses = App.state.STATUS_IDS;
    const from = statuses.indexOf(task.status);
    const to = clamp(from + direction, 0, statuses.length - 1);
    if (to === from) return false;

    const destination = statuses[to];
    const length = App.state.tasksByStatus(project, destination).length;
    const moved = App.state.moveTask(project.id, task.id, destination, clamp(task.order, 0, length));
    if (moved) App.render.announce(`Tarea movida a ${App.state.statusLabel(destination)}.`);
    return moved;
  }

  function moveWithinColumn(project, task, direction) {
    const list = App.state.tasksByStatus(project, task.status);
    const withoutTask = list.filter((item) => item.id !== task.id);
    const position = list.findIndex((item) => item.id === task.id);
    const to = clamp(position + direction, 0, withoutTask.length);
    if (to === position) return false;

    App.state.moveTask(project.id, task.id, task.status, to);
    App.render.announce(`Tarea reordenada en ${App.state.statusLabel(task.status)}.`);
    return true;
  }

  function bindKeyboardAndButtons() {
    on(document, "click", '[data-action="move-prev"], [data-action="move-next"]', (event, button) => {
      event.stopPropagation();
      const card = button.closest(".task");
      const project = App.state.activeProject();
      if (!card || !project) return;
      const task = App.state.findTask(project, card.dataset.taskId);
      if (task) moveByStatus(project, task, button.dataset.action === "move-next" ? 1 : -1);
    });

    document.addEventListener("keydown", (event) => {
      if (!event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".task");
      if (!card) return;

      const project = App.state.activeProject();
      if (!project) return;
      const task = App.state.findTask(project, card.dataset.taskId);
      if (!task) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveByStatus(project, task, event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        moveWithinColumn(project, task, event.key === "ArrowDown" ? 1 : -1);
      }
    });

    // Evita el clic fantasma que algunos navegadores disparan al soltar un arrastre.
    document.addEventListener(
      "click",
      (event) => {
        if (!suppressAccidentalClick()) return;
        suppressClickUntil = 0;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (initialized) return;
    initialized = true;
    bindMouseEvents();
    bindTouchEvents();
    bindKeyboardAndButtons();
  }

  App.dnd = {
    init,
    isDragging: () => Boolean(dragging),
    indexAt,
    commit,
    cleanup,
  };
})(window.App = window.App || {});
