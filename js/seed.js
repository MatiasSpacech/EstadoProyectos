/* ==========================================================================
   seed.js — datos de ejemplo para el primer arranque
   ========================================================================== */
;(function (App) {
  "use strict";

  const { uid, addDays } = App.utils;

  function makeTask(data) {
    const subtasks = (data.subtasks || []).map((item) => {
      const subtask = typeof item === "string" ? { title: item } : item;
      return { id: uid("s"), title: subtask.title, done: Boolean(subtask.done) };
    });

    return {
      id: uid("t"),
      title: data.title,
      notes: data.notes || "",
      status: data.status || "todo",
      priority: data.priority || "media",
      tags: data.tags || [],
      estimate: data.estimate || 0,
      dueDate: data.dueDate || null,
      subtasks,
      order: data.order || 0,
      createdAt: new Date().toISOString(),
      completedAt: data.status === "done" ? new Date().toISOString() : null,
      blockedReason: data.blockedReason || "",
    };
  }

  function makeProject(data) {
    return {
      id: uid("p"),
      name: data.name,
      description: data.description || "",
      accent: data.accent,
      archived: Boolean(data.archived),
      autoComplete: Boolean(data.autoComplete),
      createdAt: new Date().toISOString(),
      tasks: (data.tasks || []).map(makeTask),
    };
  }

  /** @returns {object} estado inicial completo */
  function create() {
    const portal = makeProject({
      name: "Portal de clientes",
      description: "Rediseño del portal de autogestión y su API",
      accent: "#22e6ff",
      autoComplete: true,
      tasks: [
        makeTask({
          title: "Definir arquitectura de la API",
          status: "doing",
          priority: "alta",
          tags: ["api", "backend"],
          estimate: 8,
          dueDate: addDays(2),
          notes: "Usar **REST** con versionado en la URL.\n\n- `/v1/auth`\n- `/v1/invoices`\n\nValidar con `npm test`.",
          subtasks: [{ title: "Modelo de datos", done: true }, { title: "Endpoints de facturas" }, { title: "Contrato OpenAPI" }],
          order: 0,
        }),
        makeTask({
          title: "Maquetar pantalla de login",
          status: "todo",
          priority: "media",
          tags: ["ui", "frontend"],
          estimate: 4,
          dueDate: addDays(6),
          subtasks: ["Estados de error", "Responsive"],
          order: 0,
        }),
        makeTask({
          title: "Migrar base de datos a producción",
          status: "blocked",
          priority: "alta",
          tags: ["infra"],
          estimate: 6,
          dueDate: addDays(-2),
          blockedReason: "Esperando accesos de producción del cliente",
          order: 0,
        }),
        makeTask({
          title: "Configurar CI/CD",
          status: "done",
          priority: "media",
          tags: ["infra", "devops"],
          estimate: 3,
          notes: "Pipeline con *lint*, tests y deploy automático a staging.",
          order: 0,
        }),
        makeTask({
          title: "Documentar endpoints",
          status: "todo",
          priority: "baja",
          tags: ["docs"],
          estimate: 2,
          dueDate: addDays(12),
          order: 1,
        }),
      ],
    });

    const turnos = makeProject({
      name: "App de turnos",
      description: "Reserva de turnos para el consultorio",
      accent: "#ff3ec8",
      tasks: [
        makeTask({
          title: "Integrar calendario semanal",
          status: "doing",
          priority: "alta",
          tags: ["ui", "calendario"],
          estimate: 10,
          dueDate: addDays(4),
          subtasks: [{ title: "Vista semanal", done: true }, { title: "Arrastrar turnos" }],
          order: 0,
        }),
        makeTask({
          title: "Notificaciones por WhatsApp",
          status: "todo",
          priority: "media",
          tags: ["api"],
          estimate: 5,
          dueDate: addDays(9),
          order: 0,
        }),
        makeTask({
          title: "Definir reglas de cancelación",
          status: "blocked",
          priority: "media",
          tags: ["producto"],
          estimate: 1,
          blockedReason: "Falta confirmación de la dueña del consultorio",
          order: 0,
        }),
      ],
    });

    const landing = makeProject({
      name: "Landing del estudio",
      description: "Sitio de una página con portfolio y contacto",
      accent: "#a8ff3e",
      tasks: [
        makeTask({
          title: "Elegir tipografías y paleta",
          status: "done",
          priority: "baja",
          tags: ["diseño"],
          estimate: 2,
          order: 0,
        }),
        makeTask({
          title: "Sección de portfolio con filtros",
          status: "todo",
          priority: "media",
          tags: ["ui"],
          estimate: 4,
          dueDate: addDays(15),
          order: 0,
        }),
        makeTask({
          title: "Formulario de contacto",
          status: "todo",
          priority: "media",
          tags: ["frontend"],
          estimate: 2,
          order: 1,
        }),
      ],
    });

    const facturacion = makeProject({
      name: "Sistema de facturación",
      description: "Facturación electrónica para PyMEs",
      accent: "#9a6bff",
      archived: true,
      tasks: [
        makeTask({
          title: "Investigar normativa AFIP",
          status: "done",
          priority: "alta",
          tags: ["legal"],
          estimate: 6,
          order: 0,
        }),
        makeTask({
          title: "Prototipo de comprobantes",
          status: "done",
          priority: "media",
          tags: ["ui"],
          estimate: 4,
          order: 1,
        }),
      ],
    });

    const projects = [portal, turnos, landing, facturacion];

    return {
      version: 1,
      activeProjectId: portal.id,
      createdAt: new Date().toISOString(),
      projects,
    };
  }

  App.seed = { create };
})(window.App = window.App || {});
