/* ==========================================================================
   utils.js — helpers compartidos (sin dependencias)
   ========================================================================== */
;(function (App) {
  "use strict";

  const utils = {};

  /** Identificador corto y único para proyectos, tareas y subtareas. */
  utils.uid = function uid(prefix) {
    const random = Math.random().toString(36).slice(2, 7);
    return `${prefix || "id"}_${Date.now().toString(36)}${random}`;
  };

  utils.$ = function $selector(selector, root) {
    return (root || document).querySelector(selector);
  };

  utils.$$ = function $$selector(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  };

  /**
   * Crea un elemento.
   * props admite: class, text, dataset, style (objeto), attrs (objeto),
   * on* (listeners) y cualquier propiedad del DOM.
   */
  utils.el = function el(tag, props, children) {
    const node = document.createElement(tag);
    const options = props || {};

    for (const key of Object.keys(options)) {
      const value = options[key];
      if (value === null || value === undefined || value === false) continue;

      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else if (key === "attrs") {
        for (const attr of Object.keys(value)) {
          const attrValue = value[attr];
          if (attrValue === null || attrValue === undefined || attrValue === false) continue;
          node.setAttribute(attr, attrValue === true ? "" : attrValue);
        }
      } else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    }

    const list = Array.isArray(children) ? children : children === undefined ? [] : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }

    return node;
  };

  /** Delegación de eventos: handler(event, elementoQueCoincide). */
  utils.on = function on(root, type, selector, handler, options) {
    root.addEventListener(
      type,
      function (event) {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest(selector);
        if (!target || !root.contains(target)) return;
        handler(event, target);
      },
      options
    );
  };

  utils.debounce = function debounce(fn, wait) {
    let timer = 0;
    const debounced = function (...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), wait || 0);
    };
    debounced.cancel = () => window.clearTimeout(timer);
    return debounced;
  };

  utils.escapeHtml = function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  utils.clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  utils.clone = function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  };

  /* ---------------- Fechas ---------------- */

  utils.todayISO = function todayISO() {
    const now = new Date();
    return utils.toISODate(now);
  };

  utils.toISODate = function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  utils.addDays = function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return utils.toISODate(date);
  };

  /** "2025-03-12" → Date local a medianoche. */
  utils.parseISODate = function parseISODate(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  utils.formatDate = function formatDate(value) {
    const date = utils.parseISODate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(date);
  };

  utils.formatDateFull = function formatDateFull(value) {
    const date = utils.parseISODate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  utils.daysUntil = function daysUntil(value) {
    const date = utils.parseISODate(value);
    if (!date) return null;
    const today = utils.parseISODate(utils.todayISO());
    return Math.round((date - today) / 86400000);
  };

  utils.isOverdue = function isOverdue(value) {
    const days = utils.daysUntil(value);
    return days !== null && days < 0;
  };

  utils.isDueSoon = function isDueSoon(value) {
    const days = utils.daysUntil(value);
    return days !== null && days >= 0 && days <= 2;
  };

  /* ---------------- Varios ---------------- */

  utils.slugify = function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
  };

  /** "ui, API, ui" → ["ui", "api"] sin vacíos ni duplicados. */
  utils.parseTags = function parseTags(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    const tags = [];
    for (const item of raw) {
      const tag = utils.slugify(item);
      if (!tag || seen.has(tag) || tags.length >= 8) continue;
      seen.add(tag);
      tags.push(tag);
    }
    return tags;
  };

  utils.sortByOrder = function sortByOrder(tasks) {
    return tasks.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

  utils.percent = function percent(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  };

  utils.plural = function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm || singular + "s"}`;
  };

  utils.prefersReducedMotion = function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  App.utils = utils;
})(window.App = window.App || {});
