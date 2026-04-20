const {
  formatEmailBodyToHtml,
  formatEmailForSending,
} = require("../../src/services/emailFormatter");

describe("emailFormatter service", () => {
  it("returns an empty string for missing content", () => {
    expect(formatEmailBodyToHtml("")).toBe("");
    expect(formatEmailBodyToHtml(null)).toBe("");
  });

  it("preserves line breaks and paragraph spacing for mixed content", () => {
    const html = formatEmailBodyToHtml("Hello <Team>\nLine 2\n\nNext paragraph");

    expect(html).toContain("<br>");
    expect(html).toContain("<p style=");
    expect(html).toContain("<html><body");
    expect(html).toContain("Next paragraph");
  });

  it("appends the learning disclaimer when formatting for sending", () => {
    const html = formatEmailForSending("Training email body");

    expect(html).toContain("For learning purposes only.");
    expect(html).toContain("</body></html>");
  });
});
