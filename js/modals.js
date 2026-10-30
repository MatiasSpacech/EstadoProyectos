/* ==========================================================================
   modals.js — diálogos (proyecto, tarea, confirmación), menús y avisos
   ========================================================================== */
;(function (App) {
  "use strict";

  const { $, el, uid, clone, parseTags, escapeHtml } = App.utils;

  const root = () => document.getElementById("dialog-root");

  let menu = null;
  let menuCleanup = null;
  let menuAnchor = null;
  let initialized = false;

  /* ---------------- Infraestructura de diálogos ---------------- */

  function fromTemplate(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
  }

  /** Elementos enfocables visibles dentro de un contenedor. */
  function focusableElements(container) {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      'input:not([disabled]):not([type="hidden"])',
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    return Array.from(container.querySelectorAll(selector)).filter(
      (element) => element.getClientRects().length > 0 && !element.closest("[hidden]")
    );
  }

  /** Mantiene el foco dentro del diálogo (algunos navegadores lo sueltan en <body>). */
  function trapFocus(dialog) {
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusables = focusableElements(dialog);
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function openDialog(dialog, onClose) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const titleElement = dialog.querySelector(".dialog__title");
    if (titleElement) {
      if (!titleElement.id) titleElement.id = uid("dialog-title");
      dialog.setAttribute("aria-labelledby", titleElement.id);
    }
    const textElement = dialog.querySelector(".dialog__text");
    if (textElement) {
      if (!textElement.id) textElement.id = uid("dialog-text");
      dialog.setAttribute("aria-describedby", textElement.id);
    }

    const finalize = (value) => {
      if (dialog.__finalized) return;
      dialog.__finalized = true;
      dialog.remove();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      if (typeof onClose === "function") onClose(value);
    };

    // Cierra y limpia en el mismo tick: el evento nativo "close" es asíncrono
    // y dejaba el foco atrapado dentro de un diálogo ya cerrado.
    dialog.__finish = (value) => {
      if (dialog.__finishing) return;
      dialog.__finishing = true;
      try {
        if (dialog.open) dialog.close(value || "");
      } finally {
        finalize(value || "");
      }
    };

    dialog.addEventListener("close", () => finalize(dialog.returnValue));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.__finish("cancel");
    });

    trapFocus(dialog);

    // Clic en el fondo = cerrar.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.__finish("dismiss");
    });

    root().append(dialog);
    dialog.showModal();
    return dialog;
  }

  function closeDialog(dialog, value) {
    if (!dialog) return;
    if (typeof dialog.__finish === "function") dialog.__finish(value);
    else if (dialog.open) dialog.close(value || "");
  }

  function isOpen() {
    const container = root();
    return Boolean(container && container.querySelector("dialog[open]"));
  }

  function setFieldError(input, message) {
    const field = input.closest(".field") || input.closest("label");
    input.setAttribute("aria-invalid", "true");
    if (!field) {
      input.focus();
      return;
    }
    field.classList.add("is-invalid");
    let error = field.querySelector(".field__error");
    if (!error) {
      error = el("p", { class: "field__error" });
      field.append(error);
    }
    error.textContent = message;
    input.focus();
  }

  function clearFieldError(input) {
    const field = input.closest(".field") || input.closest("label");
    input.removeAttribute("aria-invalid");
    if (!field) return;
    field.classList.remove("is-invalid");
    const error = field.querySelector(".field__error");
    if (error) error.remove();
  }

  function watchField(input) {
    input.addEventListener("input", () => clearFieldError(input), { once: true });
  }

  /* ---------------- Avisos (toasts) ---------------- */

  function toast(message, options) {
    const settings = options || {};
    const list = document.getElementById("toast-root");
    if (!list) return null;

    const node = fromTemplate("tpl-toast");
    node.querySelector(".toast__text").textContent = message;
    node.classList.toggle("toast--danger", settings.tone === "danger");
    if (settings.tone === "success") node.classList.add("toast--success");

    let timer = 0;
    const dismiss = () => {
      window.clearTimeout(timer);
      if (!node.isConnected) return;
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 220);
    };

    const action = node.querySelector(".toast__action");
    if (settings.actionLabel && typeof settings.onAction === "function") {
      action.hidden = false;
      action.textContent = settings.actionLabel;
      action.addEventListener("click", () => {
        dismiss();
        settings.onAction();
      });
    }

    node.querySelector(".toast__close").addEventListener("click", dismiss);
    list.append(node);

    while (list.children.length > 4) list.firstElementChild.remove();
    timer = window.setTimeout(dismiss, settings.duration || (settings.actionLabel ? 9000 : 5000));

    return { dismiss, node };
  }

  /* ---------------- Menú flotante ---------------- */

  function closeMenu(restoreFocus) {
    if (!menu) return;
    if (menuCleanup) menuCleanup();
    menu.remove();
    menu = null;
    menuCleanup = null;
    if (menuAnchor) {
      menuAnchor.setAttribute("aria-expanded", "false");
      if (restoreFocus && menuAnchor.isConnected) menuAnchor.focus({ preventScroll: true });
    }
    menuAnchor = null;
  }

  function openMenu(anchor, items) {
    closeMenu();
    if (!anchor || !items || !items.length) return;

    const node = el("div", { class: "menu", attrs: { role: "menu", "aria-label": "Opciones" } });
    for (const item of items) {
      const button = el("button", {
        class: "menu__item" + (item.danger ? " menu__item--danger" : ""),
        type: "button",
        text: item.label,
        attrs: { role: "menuitem", tabindex: "-1" },
      });
      button.addEventListener("click", () => {
        closeMenu();
        item.onSelect();
      });
      node.append(button);
    }

    document.body.append(node);
    const rect = anchor.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const top = Math.min(rect.bottom + 6, window.innerHeight - nodeRect.height - 8);
    const left = Math.min(Math.max(8, rect.right - nodeRect.width), window.innerWidth - nodeRect.width - 8);
    node.style.top = `${Math.max(8, top)}px`;
    node.style.left = `${left}px`;

    menu = node;
    menuAnchor = anchor;
    menuAnchor.setAttribute("aria-expanded", "true");

    const buttons = Array.from(node.querySelectorAll(".menu__item"));
    if (buttons[0]) buttons[0].focus({ preventScroll: true });

    const onOutside = (event) => {
      if (!node.contains(event.target)) closeMenu();
    };
    const onKey = (event) => {
      const index = buttons.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        buttons[(index + 1) % buttons.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        buttons[(index - 1 + buttons.length) % buttons.length].focus();
      } else if (event.key === "Tab") {
        closeMenu();
      }
    };

    window.setTimeout(() => document.addEventListener("click", onOutside), 0);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    menuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }

  /* ---------------- Confirmación ---------------- */

  function confirmAction(options) {
    const settings = options || {};
    return new Promise((resolve) => {
      const dialog = fromTemplate("tpl-dialog-confirm");
      dialog.querySelector(".dialog__title").textContent = settings.title || "Confirmar";
      dialog.querySelector(".dialog__text").textContent = settings.message || "";

      const submit = dialog.querySelector('button[type="submit"]');
      submit.textContent = settings.confirmLabel || "Confirmar";
      submit.classList.toggle("btn--danger", Boolean(settings.danger));
      submit.classList.toggle("btn--primary", !settings.danger);
      dialog.querySelector('[data-action="close-dialog"]').textContent =
        settings.cancelLabel || "Cancelar";

      const extraWrap = dialog.querySelector("[data-confirm-extra]");
      if (settings.extraLabel) {
        extraWrap.hidden = false;
        extraWrap.querySelector("span").textContent = settings.extraLabel;
      }

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      dialog.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        finish({
          confirmed: true,
          extra: extraWrap.hidden ? false : extraWrap.querySelector("input").checked,
        });
        closeDialog(dialog, "confirm");
      });

      openDialog(dialog, (value) => {
        if (value !== "confirm") finish({ confirmed: false, extra: false });
      });

      submit.focus({ preventScroll: true });
    });
  }

  /* ---------------- Proyecto ---------------- */

  function openProject(projectId) {
    const project = projectId ? App.state.getProject(projectId) : null;
    const dialog = fromTemplate("tpl-dialog-project");
    const form = dialog.querySelector("form");
    const title = dialog.querySelector(".dialog__title");

    title.textContent = project ? "Editar proyecto" : "Nuevo proyecto";

    form.elements.name.value = project ? project.name : "";
    form.elements.description.value = project ? project.description : "";
    form.elements.autoComplete.checked = project ? project.autoComplete : false;

    let accent = project
      ? project.accent
      : App.state.ACCENTS[App.state.get().projects.length % App.state.ACCENTS.length];

    const swatches = dialog.querySelector("[data-swatches]");
    for (const color of App.state.ACCENTS) {
      const swatch = el("button", {
        class: "swatch",
        type: "button",
        style: { "--swatch": color },
        attrs: {
          "aria-label": `Color ${color}`,
          "aria-pressed": String(color === accent),
          title: color,
        },
      });
      swatch.addEventListener("click", () => {
        accent = color;
        for (const other of swatches.children) {
          other.setAttribute("aria-pressed", String(other === swatch));
        }
      });
      swatches.append(swatch);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) {
        setFieldError(form.elements.name, "Poné un nombre para el proyecto.");
        watchField(form.elements.name);
        return;
      }

      const payload = {
        name,
        description: form.elements.description.value.trim(),
        accent,
        autoComplete: form.elements.autoComplete.checked,
      };

      if (project) {
        App.state.updateProject(project.id, payload);
        toast("Proyecto actualizado.", { tone: "success" });
      } else {
        App.state.addProject(payload);
        toast("Proyecto creado. ¡A cargar tareas!", { tone: "success" });
      }

      closeDialog(dialog, "saved");
    });

    openDialog(dialog);
    form.elements.name.focus({ preventScroll: true });
    form.elements.name.select();
  }

  /* ---------------- Tarea ---------------- */

  function openTask(taskId, options) {
    const settings = options || {};
    const project = settings.projectId
      ? App.state.getProject(settings.projectId)
      : App.state.activeProject();
    if (!project) {
      toast("Primero creá un proyecto.", { tone: "danger" });
      return;
    }

    const task = taskId ? App.state.findTask(project, taskId) : null;
    if (taskId && !task) return;

    const dialog = fromTemplate("tpl-dialog-task");
    const form = dialog.querySelector("form");
    const isEdit = Boolean(task);
    const draft = {
      subtasks: task ? clone(task.subtasks) : [],
    };

    dialog.querySelector(".dialog__title").textContent = isEdit ? "Editar tarea" : "Nueva tarea";

    form.elements.title.value = task ? task.title : "";
    form.elements.notes.value = task ? task.notes : "";
    form.elements.priority.value = task ? task.priority : "media";
    form.elements.estimate.value = task && task.estimate ? String(task.estimate) : "";
    form.elements.dueDate.value = task && task.dueDate ? task.dueDate : "";
    form.elements.tags.value = task ? task.tags.join(", ") : "";
    form.elements.blockedReason.value = task ? task.blockedReason : "";

    const statusSelect = form.elements.status;
    for (const status of App.state.STATUSES) {
      statusSelect.append(new Option(status.label, status.id));
    }
    statusSelect.value = task ? task.status : settings.status || "todo";

    const blockedField = dialog.querySelector("[data-blocked-field]");
    const syncBlocked = () => {
      blockedField.hidden = statusSelect.value !== "blocked";
    };
    statusSelect.addEventListener("change", syncBlocked);
    syncBlocked();

    /* --- Subtareas (se editan en borrador) --- */

    const subtaskList = dialog.querySelector("[data-subtasks]");
    const subtaskInput = dialog.querySelector("[data-subtask-input]");
    const subtaskButton = dialog.querySelector('[data-action="add-subtask"]');

    function renderSubtasks() {
      const fragment = document.createDocumentFragment();
      for (const subtask of draft.subtasks) {
        const row = fromTemplate("tpl-subtask-row");
        row.dataset.subtaskId = subtask.id;
        row.classList.toggle("is-done", subtask.done);
        row.querySelector(".subtask__title").textContent = subtask.title;

        const checkbox = row.querySelector("[data-subtask-toggle]");
        checkbox.checked = Boolean(subtask.done);
        checkbox.setAttribute("aria-label", subtask.title);
        checkbox.addEventListener("change", () => {
          subtask.done = checkbox.checked;
          row.classList.toggle("is-done", subtask.done);
        });

        row.querySelector('[data-action="remove-subtask"]').addEventListener("click", () => {
          draft.subtasks = draft.subtasks.filter((item) => item.id !== subtask.id);
          renderSubtasks();
        });

        fragment.append(row);
      }

      if (!draft.subtasks.length) {
        fragment.append(el("li", { class: "subtask subtask--empty", text: "Todavía no hay subtareas." }));
      }
      subtaskList.replaceChildren(fragment);
    }

    function addDraftSubtask() {
      const title = subtaskInput.value.trim();
      if (!title || draft.subtasks.length >= 40) return;
      draft.subtasks.push({ id: uid("s"), title: title.slice(0, 100), done: false });
      subtaskInput.value = "";
      renderSubtasks();
      subtaskInput.focus();
    }

    subtaskButton.addEventListener("click", addDraftSubtask);
    subtaskInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addDraftSubtask();
    });

    renderSubtasks();

    /* --- Preview de notas --- */

    const notesInput = form.elements.notes;
    const preview = dialog.querySelector("[data-notes-preview]");
    const updatePreview = () => {
      const value = notesInput.value.trim();
      preview.hidden = !value;
      preview.innerHTML = value ? App.md.render(value) : "";
    };
    const debouncedPreview = App.utils.debounce(updatePreview, 140);
    notesInput.addEventListener("input", debouncedPreview);
    updatePreview();

    /* --- Eliminar (solo al editar) --- */

    const deleteButton = dialog.querySelector('[data-action="delete-task"]');
    if (isEdit) {
      deleteButton.hidden = false;
      deleteButton.addEventListener("click", async () => {
        closeDialog(dialog, "delete");
        const result = await confirmAction({
          title: "Eliminar tarea",
          message: `Se va a eliminar “${task.title}”. Podés deshacerlo desde el aviso.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!result.confirmed) return;
        const snapshot = App.state.deleteTask(project.id, task.id);
        toast("Tarea eliminada.", {
          actionLabel: "Deshacer",
          onAction: () => App.state.restoreTask(project.id, snapshot),
        });
      });
    }

    /* --- Guardar --- */

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = form.elements.title.value.trim();
      if (!title) {
        setFieldError(form.elements.title, "La tarea necesita un título.");
        watchField(form.elements.title);
        return;
      }

      if (statusSelect.value === "blocked" && !form.elements.blockedReason.value.trim()) {
        blockedField.hidden = false;
        setFieldError(form.elements.blockedReason, "Contá por qué está bloqueada.");
        watchField(form.elements.blockedReason);
        return;
      }

      const payload = {
        title,
        notes: notesInput.value,
        status: statusSelect.value,
        priority: form.elements.priority.value,
        tags: parseTags(form.elements.tags.value),
        estimate: Number(form.elements.estimate.value) || 0,
        dueDate: form.elements.dueDate.value || null,
        blockedReason: form.elements.blockedReason.value.trim(),
        subtasks: draft.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          done: subtask.done,
        })),
      };

      if (isEdit) {
        App.state.updateTask(project.id, task.id, payload);
        toast("Tarea actualizada.", { tone: "success" });
      } else {
        App.state.addTask(project.id, payload);
        toast("Tarea creada.", { tone: "success" });
      }

      closeDialog(dialog, "saved");
    });

    openDialog(dialog);

    if (isEdit && settings.focusField === "blockedReason") {
      form.elements.blockedReason.focus({ preventScroll: true });
    } else {
      form.elements.title.focus({ preventScroll: true });
      form.elements.title.select();
    }
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (initialized) return;
    initialized = true;

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeButton = target.closest('[data-action="close-dialog"]');
      if (closeButton) {
        const dialog = closeButton.closest("dialog");
        closeDialog(dialog, "cancel");
      }
    });
  }

  App.modals = {
    init,
    openProject,
    openTask,
    confirmAction,
    openMenu,
    closeMenu,
    closeDialog,
    isOpen,
  };
  App.toast = toast;
})(window.App = window.App || {});
