/* ==========================================================================
   markdown.js — parser mínimo y seguro para las notas de las tareas
   Escapa el HTML *antes* de formatear, así que no se puede inyectar markup.
   ========================================================================== */
;(function (App) {
  "use strict";

  const { escapeHtml } = App.utils;

  function inline(text) {
    // El código en línea se aísla para no aplicar formato dentro de él.
    return text
      .split(/(`[^`]+`)/g)
      .map((part) => {
        if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
          return `<code>${part.slice(1, -1)}</code>`;
        }
        return part
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
          .replace(/~~([^~]+)~~/g, "<del>$1</del>")
          .replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
          );
      })
      .join("");
  }

  function render(text) {
    const source = escapeHtml(String(text || "").replace(/\r\n?/g, "\n"));
    if (!source.trim()) return "";

    const lines = source.split("\n");
    const out = [];
    let paragraph = [];
    let list = null; // { type: "ul" | "ol", items: [] }
    let code = null; // { lang, lines: [] }

    const flushParagraph = () => {
      if (!paragraph.length) return;
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!list) return;
      const items = list.items.map((item) => `<li>${inline(item)}</li>`).join("");
      out.push(`<${list.type}>${items}</${list.type}>`);
      list = null;
    };

    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+$/, "");

      if (code) {
        if (/^\s*```/.test(line)) {
          out.push(`<pre><code>${code.join("\n")}</code></pre>`);
          code = null;
        } else {
          code.push(line);
        }
        continue;
      }

      if (/^\s*```/.test(line)) {
        flushParagraph();
        flushList();
        code = [];
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
      if (unordered) {
        flushParagraph();
        if (!list || list.type !== "ul") {
          flushList();
          list = { type: "ul", items: [] };
        }
        list.items.push(unordered[1]);
        continue;
      }

      const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ordered) {
        flushParagraph();
        if (!list || list.type !== "ol") {
          flushList();
          list = { type: "ol", items: [] };
        }
        list.items.push(ordered[1]);
        continue;
      }

      const quote = line.match(/^&gt;\s?(.*)$/);
      if (quote) {
        flushParagraph();
        flushList();
        out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        continue;
      }

      flushList();
      paragraph.push(line.trim());
    }

    flushParagraph();
    flushList();
    if (code) out.push(`<pre><code>${code.join("\n")}</code></pre>`);

    return out.join("");
  }

  /** Texto plano (para previews y aria-labels). */
  function toPlain(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,3}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/[*_~>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  App.md = { render, toPlain };
})(window.App = window.App || {});
