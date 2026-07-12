// Escapes HTML then applies only **bold** formatting.
// Replaces raw dangerouslySetInnerHTML on AI output — the model echoes back
// user-controlled data (tickers, notes, tags), so unescaped HTML is injectable.

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ESCAPE[ch]);
}

/**
 * Escape all HTML, then convert **text** into a styled <strong>.
 * Safe to pass to dangerouslySetInnerHTML.
 */
export function boldOnly(line: string, color = "#f0f6fc"): string {
  return escapeHtml(line).replace(
    /\*\*(.+?)\*\*/g,
    `<strong style="color:${color}">$1</strong>`
  );
}
