/**
 * Converts plain-text email body to well-formatted HTML.
 * - Double newlines become paragraphs (<p>) with spacing
 * - Single newlines become line breaks (<br>)
 * - Already HTML content is passed through with minimal wrapping
 */
function formatEmailBodyToHtml(bodyContent) {
  if (!bodyContent || typeof bodyContent !== "string") return "";

  const trimmed = bodyContent.trim();
  if (!trimmed) return "";

  // Split into paragraphs (double newline or more)
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim());

  const htmlParagraphs = paragraphs.map((para) => {
    const oneLine = para.trim();
    const withBreaks = oneLine.replace(/\n/g, "<br>\n");
    const safe = oneLine.includes("<") ? withBreaks : escapeHtml(oneLine).replace(/\n/g, "<br>\n");
    return `<p style="margin: 0 0 1em 0; line-height: 1.5;">${safe}</p>`;
  });

  const bodyHtml = htmlParagraphs.join("\n");
  return wrapInEmailShell(bodyHtml);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapInEmailShell(innerHtml) {
  return `<html><body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333; max-width: 600px;">${innerHtml}</body></html>`;
}

/**
 * Appends the learning disclaimer and returns full HTML for sending.
 */
function formatEmailForSending(bodyContent) {
  const html = formatEmailBodyToHtml(bodyContent);
  const disclaimer = '<p style="font-size:9px;color:#888;margin-top:24px;">For learning purposes only.</p>';
  if (html.includes("</body>")) {
    return html.replace("</body>", disclaimer + "</body>");
  }
  return html + disclaimer;
}

module.exports = { formatEmailBodyToHtml, formatEmailForSending };
