# EstadoProyectos

Tablero kanban para llevar el control del estado de mis proyectos de software: qué está pendiente,
qué está en proceso, qué está bloqueado y qué está terminado.

- **Sin dependencias en runtime**: solo HTML, CSS y JavaScript (scripts clásicos, sin build).
- **Dark con acentos neón**: cada proyecto tiene su propio color.
- **Drag & drop** con ratón, táctil y teclado.
- **Persistencia local** (`localStorage`) + exportar/importar JSON como backup.

## Cómo abrirlo

Doble clic en `index.html`. No hace falta servidor ni instalación.

## Estructura

```
index.html          # markup y plantillas
css/                # theme, base, layout y componentes
js/                 # utils, storage, seed, state, markdown, render, dragdrop, modals, app
tests/              # suite E2E con Playwright
```

## Tests

```bash
npm install
npm test
```

La app se sirve automáticamente en `http://127.0.0.1:4173` para los tests.

## Backups

Desde el pie del sidebar: **Exportar** descarga `estadoproyectos-AAAA-MM-DD.json`;
**Importar** reemplaza el estado actual previa confirmación.
