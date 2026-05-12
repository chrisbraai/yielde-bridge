import "server-only";

/**
 * Minimal markdown → HTML renderer for SKILL.md bodies.
 * Intentionally tiny + dependency-free for Phase 0. Phase 1 swaps in
 * a real renderer (marked / remark) when we add syntax highlighting.
 *
 * Supports: H1-H3, paragraphs, ordered/unordered lists, `inline code`,
 * fenced ```code``` blocks, bold, italics, links, simple tables, blockquotes, hr.
 */
export function renderMarkdown(src: string): string {
  if (!src) return "";

  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<pre><code class="lang-${escapeAttr(lang)}">${escapeHtml(buf.join("\n"))}</code></pre>`
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 3);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---\s*$/.test(line)) {
      out.push("<hr/>");
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s*/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // Table (very simple: header | --- | rows)
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const headHtml = header.map((c) => `<th>${inline(c)}</th>`).join("");
      const bodyHtml = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    // Blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — accumulate until blank
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|>|[-*]\s|\d+\.\s|\|)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  return out.join("\n");
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // Inline code
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic (single underscore or asterisk, but be careful not to match bold)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    return `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">${t}</a>`;
  });
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
