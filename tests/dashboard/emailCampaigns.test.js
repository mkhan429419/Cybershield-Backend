const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------

jest.mock("../../src/services/nodemailerService", () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: "msg-test-123" })),
}));

jest.mock("../../src/services/emailFormatter", () => ({
  formatEmailForSending: jest.fn((text) => `<p>${text}</p>`),
}));

jest.mock("@clerk/clerk-sdk-node", () => ({
  ClerkExpressRequireAuth: () => (_req, _res, next) => next(),
  clerkClient: {
    invitations: { createInvitation: jest.fn() },
    users: { getUser: jest.fn(async () => ({})), getUserList: jest.fn(async () => []) },
  },
}));

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const Email = require("../../src/models/Email");
const EmailTemplate = require("../../src/models/EmailTemplate");

// ---------------------------------------------------------------------------
// Routes & app
// ---------------------------------------------------------------------------
const emailRoutes = require("../../src/routes/email");
const emailTemplateRoutes = require("../../src/routes/emailTemplates");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/email-campaigns", emailRoutes);
  app.use("/api/email-templates", emailTemplateRoutes);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedEmail(overrides = {}) {
  return Email.create({
    sentBy: overrides.sentBy || "sender@test.com",
    sentTo: overrides.sentTo || "recipient@test.com",
    subject: overrides.subject || "Test Subject",
    bodyContent: overrides.bodyContent || "<p>Test body</p>",
    status: overrides.status || "sent",
    messageId: overrides.messageId || "msg-id-1",
    openedAt: overrides.openedAt || null,
    clickedAt: overrides.clickedAt || null,
    credentialsEnteredAt: overrides.credentialsEnteredAt || null,
    ...overrides,
  });
}

async function seedEmailTemplate(overrides = {}) {
  return EmailTemplate.create({
    title: overrides.title || "Test Template",
    description: overrides.description || "A phishing template",
    image: overrides.image || "https://example.com/img.jpg",
    category: overrides.category || "Banking",
    emailTemplate: overrides.emailTemplate || {
      subject: "Account Alert",
      bodyContent: "Your account needs verification. Click here.",
      linkUrl: "https://example.com/phish",
    },
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  });
}

// ===================================================================
// EMAIL TEMPLATES
// ===================================================================

describe("Email Templates", () => {
  describe("GET /api/email-templates", () => {
    it("returns active templates by default", async () => {
      await seedEmailTemplate({ title: "Active Template", isActive: true });
      await seedEmailTemplate({ title: "Inactive Template", isActive: false });

      const res = await request(app).get("/api/email-templates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templates.length).toBe(1);
      expect(res.body.data.templates[0].title).toBe("Active Template");
      expect(res.body.data.count).toBe(1);
    });

    it("filters by category", async () => {
      await seedEmailTemplate({ title: "Banking Alert", category: "Banking" });
      await seedEmailTemplate({ title: "Password Reset", category: "Security" });

      const res = await request(app).get("/api/email-templates?category=Banking");

      expect(res.status).toBe(200);
      expect(res.body.data.templates.every((t) => t.category === "Banking")).toBe(true);
    });

    it("returns inactive templates when isActive=false", async () => {
      await seedEmailTemplate({ title: "Inactive", isActive: false });

      const res = await request(app).get("/api/email-templates?isActive=false");

      expect(res.status).toBe(200);
      expect(res.body.data.templates.length).toBe(1);
      expect(res.body.data.templates[0].title).toBe("Inactive");
    });

    it("returns empty array when no templates exist", async () => {
      const res = await request(app).get("/api/email-templates");

      expect(res.status).toBe(200);
      expect(res.body.data.templates).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });
  });

  describe("GET /api/email-templates/:templateId", () => {
    it("returns a single template", async () => {
      const template = await seedEmailTemplate({ title: "Password Reset" });

      const res = await request(app).get(`/api/email-templates/${template._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Password Reset");
      expect(res.body.data.emailTemplate.subject).toBe("Account Alert");
    });

    it("returns 404 for non-existent template", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/email-templates/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Email template not found");
    });
  });

  describe("POST /api/email-templates", () => {
    it("creates a new template with all fields (201)", async () => {
      const res = await request(app).post("/api/email-templates").send({
        title: "Delivery Notice",
        description: "Fake delivery notification",
        image: "https://img.com/delivery.jpg",
        category: "Delivery",
        emailTemplate: {
          subject: "Your package is waiting",
          bodyContent: "Track your package here: {{link}}",
          linkUrl: "https://phish.example.com",
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Email template created successfully");
      expect(res.body.data.title).toBe("Delivery Notice");
      expect(res.body.data.emailTemplate.subject).toBe("Your package is waiting");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await request(app).post("/api/email-templates").send({
        title: "Incomplete",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Missing required fields");
    });
  });

  describe("POST /api/email-templates/custom", () => {
    it("creates a custom template with subject and body (201)", async () => {
      const res = await request(app).post("/api/email-templates/custom").send({
        subject: "Urgent: Verify your account",
        bodyContent: "Click the link below to verify your account.",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Custom email template created successfully");
      expect(res.body.data.category).toBe("Custom");
      expect(res.body.data.title).toBe("Custom Email Template");
      expect(res.body.data.emailTemplate.subject).toBe("Urgent: Verify your account");
    });

    it("creates a custom template with optional title and linkUrl", async () => {
      const res = await request(app).post("/api/email-templates/custom").send({
        title: "My Custom Phish",
        subject: "Important Notice",
        bodyContent: "Please review this document.",
        linkUrl: "https://phish.example.com/doc",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe("My Custom Phish");
      expect(res.body.data.emailTemplate.linkUrl).toBe("https://phish.example.com/doc");
    });

    it("returns 400 when subject is missing", async () => {
      const res = await request(app).post("/api/email-templates/custom").send({
        bodyContent: "Body only",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Subject and body content are required");
    });

    it("returns 400 when bodyContent is missing", async () => {
      const res = await request(app).post("/api/email-templates/custom").send({
        subject: "Subject only",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Subject and body content are required");
    });
  });
});

// ===================================================================
// EMAIL SENDING
// ===================================================================

describe("Email Sending — POST /api/email-campaigns/send", () => {
  const nodemailerService = require("../../src/services/nodemailerService");

  beforeEach(() => {
    nodemailerService.sendEmail.mockClear();
    nodemailerService.sendEmail.mockResolvedValue({ success: true, messageId: "msg-test-123" });
    process.env.SMTP_USER = "test@smtp.com";
    process.env.SMTP_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_KEY;
  });

  it("sends email to a single recipient (200)", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@company.com",
      sentTo: "target@victim.com",
      subject: "Account Alert",
      bodyContent: "Please verify your account.",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.successful).toBe(1);
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.total).toBe(1);

    const saved = await Email.findOne({ sentTo: "target@victim.com" });
    expect(saved).not.toBeNull();
    expect(saved.status).toBe("sent");
    expect(saved.subject).toBe("Account Alert");
  });

  it("sends email to multiple comma-separated recipients", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@company.com",
      sentTo: "user1@test.com, user2@test.com, user3@test.com",
      subject: "Bulk Test",
      bodyContent: "Bulk phishing test",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.successful).toBe(3);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Missing required fields");
  });

  it("returns 400 for invalid sender email", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "not-an-email",
      sentTo: "target@test.com",
      subject: "Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid sender email");
  });

  it("returns 400 for empty recipient", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "",
      subject: "Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when sentTo has only whitespace/commas (no valid emails)", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: " , , ",
      subject: "Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("No valid recipient");
  });

  it("returns 400 for invalid recipient email format", async () => {
    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "not-valid-email",
      subject: "Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid email address format");
  });

  it("returns 500 when SMTP config is missing", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_KEY;
    delete process.env.SMTP_PASSWORD;

    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "target@test.com",
      subject: "Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain("SMTP configuration missing");
  });

  it("handles partial send failures", async () => {
    nodemailerService.sendEmail
      .mockResolvedValueOnce({ success: true, messageId: "msg-1" })
      .mockResolvedValueOnce({ success: false, error: "Inbox full" });

    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "good@test.com, bad@test.com",
      subject: "Mixed Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.successful).toBe(1);
    expect(res.body.data.failed).toBe(1);
  });

  it("returns 500 when all sends fail", async () => {
    nodemailerService.sendEmail.mockResolvedValue({ success: false, error: "SMTP down" });

    const res = await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "fail@test.com",
      subject: "Fail Test",
      bodyContent: "Body",
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("All emails failed");
  });

  it("saves Email records to database with correct status", async () => {
    nodemailerService.sendEmail.mockResolvedValue({ success: true, messageId: "msg-saved" });

    await request(app).post("/api/email-campaigns/send").send({
      sentBy: "admin@test.com",
      sentTo: "saved@test.com",
      subject: "DB Save Test",
      bodyContent: "Testing persistence",
    });

    const record = await Email.findOne({ sentTo: "saved@test.com" });
    expect(record).not.toBeNull();
    expect(record.status).toBe("sent");
    expect(record.messageId).toBe("msg-saved");
    expect(record.sentBy).toBe("admin@test.com");
    expect(record.subject).toBe("DB Save Test");
  });
});

// ===================================================================
// EMAIL LIST — GET /api/email-campaigns
// ===================================================================

describe("Email List — GET /api/email-campaigns", () => {
  it("returns emails with default pagination", async () => {
    await seedEmail({ sentTo: "a@test.com" });
    await seedEmail({ sentTo: "b@test.com" });

    const res = await request(app).get("/api/email-campaigns");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emails.length).toBe(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("respects page and limit params", async () => {
    for (let i = 0; i < 6; i++) {
      await seedEmail({ sentTo: `user${i}@test.com` });
    }

    const res = await request(app).get("/api/email-campaigns?page=1&limit=3");

    expect(res.status).toBe(200);
    expect(res.body.data.emails.length).toBe(3);
    expect(res.body.data.pagination.total).toBe(6);
    expect(res.body.data.pagination.pages).toBe(2);
  });

  it("filters by sentBy", async () => {
    await seedEmail({ sentBy: "admin@company.com", sentTo: "a@t.com" });
    await seedEmail({ sentBy: "other@company.com", sentTo: "b@t.com" });

    const res = await request(app).get("/api/email-campaigns?sentBy=admin");

    expect(res.status).toBe(200);
    expect(res.body.data.emails.length).toBe(1);
    expect(res.body.data.emails[0].sentBy).toContain("admin");
  });

  it("filters by sentTo", async () => {
    await seedEmail({ sentTo: "victim@org.com" });
    await seedEmail({ sentTo: "other@org.com" });

    const res = await request(app).get("/api/email-campaigns?sentTo=victim");

    expect(res.status).toBe(200);
    expect(res.body.data.emails.length).toBe(1);
  });

  it("returns empty array when no emails exist", async () => {
    const res = await request(app).get("/api/email-campaigns");

    expect(res.status).toBe(200);
    expect(res.body.data.emails).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("returns emails with tracking data (openedAt, clickedAt, credentialsEnteredAt)", async () => {
    const now = new Date();
    await seedEmail({
      sentTo: "tracked@test.com",
      openedAt: now,
      clickedAt: now,
      credentialsEnteredAt: now,
    });

    const res = await request(app).get("/api/email-campaigns");

    expect(res.status).toBe(200);
    const email = res.body.data.emails[0];
    expect(email.openedAt).toBeDefined();
    expect(email.clickedAt).toBeDefined();
    expect(email.credentialsEnteredAt).toBeDefined();
  });

  it("returns emails sorted by createdAt descending", async () => {
    await seedEmail({ sentTo: "old@test.com" });
    await new Promise((r) => setTimeout(r, 50));
    await seedEmail({ sentTo: "new@test.com" });

    const res = await request(app).get("/api/email-campaigns");

    expect(res.status).toBe(200);
    expect(res.body.data.emails[0].sentTo).toBe("new@test.com");
    expect(res.body.data.emails[1].sentTo).toBe("old@test.com");
  });
});
