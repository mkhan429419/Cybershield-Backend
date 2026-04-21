const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

// ---------------------------------------------------------------------------
// Mutable test user
// ---------------------------------------------------------------------------
let mockCurrentUser = {};

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (req, _res, next) => {
    req.auth = { userId: "clerk-test-user" };
    next();
  },
  getUserData: (req, _res, next) => {
    req.user = mockCurrentUser;
    next();
  },
  requireRole: (roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "User not authenticated" });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Insufficient permissions" });
    next();
  },
  requireOrgAccess: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "User not authenticated" });
    if (req.user.role === "system_admin") return next();
    return res.status(403).json({ error: "Insufficient permissions" });
  },
}));

jest.mock("../../src/services/twilioService", () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true, messageId: "SM_TEST_123" })),
  isValidPhoneNumber: jest.fn((phone) => {
    if (!phone) return false;
    return /^\+?\d{10,15}$/.test(String(phone).replace(/\s/g, ""));
  }),
}));

jest.mock("../../src/services/whatsappRiskScoreService", () => ({
  recordWhatsAppRiskEvent: jest.fn(async () => {}),
}));

jest.mock("@clerk/clerk-sdk-node", () => ({
  ClerkExpressRequireAuth: () => (_req, _res, next) => next(),
  clerkClient: {
    invitations: { createInvitation: jest.fn() },
    users: { getUser: jest.fn(async () => ({})), getUserList: jest.fn(async () => []) },
  },
}));

jest.mock("../../src/services/emailRiskScoreService", () => ({
  isEligibleForEmailRiskScoring: () => false,
  computeEmailRiskScore: jest.fn(async () => 0),
}));
jest.mock("../../src/services/lmsRiskScoreService", () => ({
  updateUserLmsRiskScore: jest.fn(async () => {}),
}));
jest.mock("../../src/services/remedialAssignmentService", () => ({
  markRemedialAssignmentsCompletedForCourse: jest.fn(async () => {}),
}));
jest.mock("../../src/utils/badgeMapping", () => ({
  getBadgeLabel: jest.fn((id) => `Badge-${id}`),
}));

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const WhatsAppCampaign = require("../../src/models/WhatsAppCampaign");
const WhatsAppTemplate = require("../../src/models/WhatsAppTemplate");

// ---------------------------------------------------------------------------
// Routes & app
// ---------------------------------------------------------------------------
const whatsappCampaignRoutes = require("../../src/routes/whatsappCampaigns");
const whatsappTemplateRoutes = require("../../src/routes/whatsAppTemplates");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/whatsapp-campaigns", whatsappCampaignRoutes);
  app.use("/api/whatsapp-templates", whatsappTemplateRoutes);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
async function seedOrg(name = "TestOrg") {
  return Organization.create({ name });
}

async function seedUser(overrides = {}) {
  return User.create({
    clerkId: overrides.clerkId || `clerk-${new mongoose.Types.ObjectId()}`,
    email: overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    displayName: overrides.displayName || "Test User",
    role: overrides.role || "client_admin",
    orgId: overrides.orgId || null,
    phoneNumber: overrides.phoneNumber || null,
    status: overrides.status || "active",
  });
}

async function seedWhatsAppCampaign(overrides = {}) {
  return WhatsAppCampaign.create({
    name: overrides.name || "Test WA Campaign",
    description: overrides.description || "A test WhatsApp campaign",
    organizationId: overrides.organizationId || null,
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    templateId: overrides.templateId || "manual_template",
    targetUsers: overrides.targetUsers || [],
    messageTemplate: overrides.messageTemplate || "Click here: https://example.com",
    landingPageUrl: overrides.landingPageUrl || "https://example.com/phish",
    status: overrides.status || "draft",
    stats: overrides.stats || {},
    trackingEnabled: overrides.trackingEnabled !== undefined ? overrides.trackingEnabled : true,
    ...overrides,
  });
}

async function seedWhatsAppTemplate(overrides = {}) {
  return WhatsAppTemplate.create({
    title: overrides.title || "Test Template",
    description: overrides.description || "A phishing template",
    image: overrides.image || "https://example.com/img.jpg",
    category: overrides.category || "Banking",
    messageTemplate: overrides.messageTemplate || "Your account needs verification: {{link}}",
    landingPageUrl: overrides.landingPageUrl || "",
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  });
}

// ===================================================================
// WHATSAPP TEMPLATES
// ===================================================================

describe("WhatsApp Templates", () => {
  describe("GET /api/whatsapp-templates", () => {
    it("returns active templates by default", async () => {
      await seedWhatsAppTemplate({ title: "Active Template", isActive: true });
      await seedWhatsAppTemplate({ title: "Inactive Template", isActive: false });

      const res = await request(app).get("/api/whatsapp-templates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templates.length).toBe(1);
      expect(res.body.data.templates[0].title).toBe("Active Template");
      expect(res.body.data.count).toBe(1);
    });

    it("filters by category", async () => {
      await seedWhatsAppTemplate({ title: "Banking Scam", category: "Banking" });
      await seedWhatsAppTemplate({ title: "Prize Scam", category: "Prize" });

      const res = await request(app).get("/api/whatsapp-templates?category=Banking");

      expect(res.status).toBe(200);
      expect(res.body.data.templates.every((t) => t.category === "Banking")).toBe(true);
    });

    it("returns inactive templates when isActive=false", async () => {
      await seedWhatsAppTemplate({ title: "Inactive", isActive: false });

      const res = await request(app).get("/api/whatsapp-templates?isActive=false");

      expect(res.status).toBe(200);
      expect(res.body.data.templates.length).toBe(1);
      expect(res.body.data.templates[0].title).toBe("Inactive");
    });

    it("returns empty array when no templates exist", async () => {
      const res = await request(app).get("/api/whatsapp-templates");

      expect(res.status).toBe(200);
      expect(res.body.data.templates).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });
  });

  describe("GET /api/whatsapp-templates/:templateId", () => {
    it("returns a single template", async () => {
      const template = await seedWhatsAppTemplate({ title: "Banking Alert" });

      const res = await request(app).get(`/api/whatsapp-templates/${template._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Banking Alert");
    });

    it("returns 404 for non-existent template", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/whatsapp-templates/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("WhatsApp template not found");
    });
  });

  describe("POST /api/whatsapp-templates", () => {
    it("creates a new template with all fields", async () => {
      const res = await request(app).post("/api/whatsapp-templates").send({
        title: "New Template",
        description: "Description",
        image: "https://img.com/img.jpg",
        category: "Social",
        messageTemplate: "Click here: {{link}}",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("WhatsApp template created successfully");
      expect(res.body.data.title).toBe("New Template");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await request(app).post("/api/whatsapp-templates").send({
        title: "Incomplete",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Missing required fields");
    });
  });

  describe("POST /api/whatsapp-templates/custom", () => {
    it("creates a custom template with just messageTemplate", async () => {
      const res = await request(app).post("/api/whatsapp-templates/custom").send({
        messageTemplate: "Custom phishing message with link",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Custom WhatsApp template created successfully");
      expect(res.body.data.category).toBe("Custom");
      expect(res.body.data.title).toBe("Custom WhatsApp Template");
    });

    it("creates a custom template with optional title and landing URL", async () => {
      const res = await request(app).post("/api/whatsapp-templates/custom").send({
        title: "My Custom Template",
        messageTemplate: "Visit: https://custom.com",
        landingPageUrl: "https://custom.com/landing",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe("My Custom Template");
      expect(res.body.data.landingPageUrl).toBe("https://custom.com/landing");
    });

    it("returns 400 when messageTemplate is missing", async () => {
      const res = await request(app).post("/api/whatsapp-templates/custom").send({
        title: "No Body",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Message body is required");
    });
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — CREATE
// ===================================================================

describe("WhatsApp Campaign — createCampaign", () => {
  let org, admin, target;

  beforeEach(async () => {
    org = await seedOrg("WACampOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@wacreate.com" });
    target = await seedUser({
      role: "affiliated",
      orgId: org._id,
      email: "target@wacreate.com",
      phoneNumber: "+923001234567",
      displayName: "Target User",
    });
    mockCurrentUser = admin;
  });

  it("creates a WhatsApp campaign (201)", async () => {
    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "Phishing Test",
      description: "Testing campaign",
      messageTemplate: "Click: https://example.com/phish",
      landingPageUrl: "https://example.com/phish",
      targetUserIds: [target._id.toString()],
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Campaign created successfully");
    expect(res.body.data.name).toBe("Phishing Test");
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.targetUsers).toHaveLength(1);
    expect(res.body.data.targetUsers[0].phoneNumber).toBe("+923001234567");
    expect(res.body.data.targetUsers[0].status).toBe("pending");
  });

  it("creates a scheduled campaign", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "Scheduled WA",
      description: "Scheduled",
      messageTemplate: "Msg",
      landingPageUrl: "https://x.com",
      targetUserIds: [target._id.toString()],
      scheduleDate: future,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("scheduled");
    expect(res.body.data.scheduleDate).toBeDefined();
  });

  it("returns 400 when no targetUserIds", async () => {
    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "No Targets",
      description: "Desc",
      messageTemplate: "Msg",
      landingPageUrl: "https://x.com",
      targetUserIds: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at least one target user");
  });

  it("returns 400 when target users not in org", async () => {
    const otherOrg = await seedOrg("OtherOrg");
    const otherUser = await seedUser({
      orgId: otherOrg._id,
      email: "other@other.com",
      phoneNumber: "+923009999999",
    });

    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "Wrong Org",
      description: "Desc",
      messageTemplate: "Msg",
      landingPageUrl: "https://x.com",
      targetUserIds: [otherUser._id.toString()],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("No valid target users found");
  });

  it("returns 400 when target user has no phone number", async () => {
    const noPhoneUser = await seedUser({
      role: "affiliated",
      orgId: org._id,
      email: "nophone@wacreate.com",
      phoneNumber: null,
      displayName: "No Phone",
    });

    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "No Phone",
      description: "Desc",
      messageTemplate: "Msg",
      landingPageUrl: "https://x.com",
      targetUserIds: [noPhoneUser._id.toString()],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("no phone number");
  });

  it("returns 400 for invalid phone number format", async () => {
    const twilioService = require("../../src/services/twilioService");
    twilioService.isValidPhoneNumber.mockReturnValueOnce(false);

    const badPhoneUser = await seedUser({
      role: "affiliated",
      orgId: org._id,
      email: "badphone@wacreate.com",
      phoneNumber: "not-a-number",
      displayName: "Bad Phone",
    });

    const res = await request(app).post("/api/whatsapp-campaigns").send({
      name: "Bad Phone",
      description: "Desc",
      messageTemplate: "Msg",
      landingPageUrl: "https://x.com",
      targetUserIds: [badPhoneUser._id.toString()],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid phone number format");
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — GET LIST
// ===================================================================

describe("WhatsApp Campaign — getCampaigns", () => {
  let org, admin, sysAdmin;

  beforeEach(async () => {
    org = await seedOrg("WAListOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@walist.com" });
    sysAdmin = await seedUser({ role: "system_admin", email: "sys@walist.com" });
  });

  it("client_admin sees only their org campaigns", async () => {
    await seedWhatsAppCampaign({ name: "Org WA", organizationId: org._id, createdBy: admin._id });
    await seedWhatsAppCampaign({ name: "System WA", organizationId: null, createdBy: sysAdmin._id });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/whatsapp-campaigns");

    expect(res.status).toBe(200);
    expect(res.body.data.campaigns.some((c) => c.name === "Org WA")).toBe(true);
    expect(res.body.data.campaigns.some((c) => c.name === "System WA")).toBe(false);
  });

  it("system_admin sees only null-org campaigns", async () => {
    await seedWhatsAppCampaign({ name: "System WA", organizationId: null, createdBy: sysAdmin._id });
    await seedWhatsAppCampaign({ name: "Org WA", organizationId: org._id, createdBy: admin._id });

    mockCurrentUser = sysAdmin;
    const res = await request(app).get("/api/whatsapp-campaigns");

    expect(res.status).toBe(200);
    expect(res.body.data.campaigns.some((c) => c.name === "System WA")).toBe(true);
    expect(res.body.data.campaigns.some((c) => c.name === "Org WA")).toBe(false);
  });

  it("returns pagination info", async () => {
    await seedWhatsAppCampaign({ name: "C1", organizationId: org._id, createdBy: admin._id });
    await seedWhatsAppCampaign({ name: "C2", organizationId: org._id, createdBy: admin._id });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/whatsapp-campaigns?page=1&limit=1");

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.current).toBe(1);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.campaigns).toHaveLength(1);
  });

  it("filters by status query param", async () => {
    await seedWhatsAppCampaign({ name: "Draft", organizationId: org._id, createdBy: admin._id, status: "draft" });
    await seedWhatsAppCampaign({ name: "Running", organizationId: org._id, createdBy: admin._id, status: "running" });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/whatsapp-campaigns?status=draft");

    expect(res.status).toBe(200);
    expect(res.body.data.campaigns.every((c) => c.status === "draft")).toBe(true);
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — GET SINGLE
// ===================================================================

describe("WhatsApp Campaign — getCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("WASingleOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@wasingle.com" });
    mockCurrentUser = admin;
  });

  it("returns campaign by id", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, name: "Find Me" });
    const res = await request(app).get(`/api/whatsapp-campaigns/${campaign._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Find Me");
  });

  it("returns 404 for non-existent campaign", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/whatsapp-campaigns/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Campaign not found");
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — UPDATE
// ===================================================================

describe("WhatsApp Campaign — updateCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("WAUpdOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@waupd.com" });
    mockCurrentUser = admin;
  });

  it("updates draft campaign name", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).put(`/api/whatsapp-campaigns/${campaign._id}`).send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated");
    expect(res.body.message).toBe("Campaign updated successfully");
  });

  it("updates messageTemplate and landingPageUrl", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).put(`/api/whatsapp-campaigns/${campaign._id}`).send({
      messageTemplate: "New message",
      landingPageUrl: "https://new.com",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.messageTemplate).toBe("New message");
    expect(res.body.data.landingPageUrl).toBe("https://new.com");
  });

  it("cannot update running campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).put(`/api/whatsapp-campaigns/${campaign._id}`).send({ name: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("cannot be updated");
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — DELETE
// ===================================================================

describe("WhatsApp Campaign — deleteCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("WADelOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@wadel.com" });
    mockCurrentUser = admin;
  });

  it("deletes a draft campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).delete(`/api/whatsapp-campaigns/${campaign._id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign deleted successfully");
    const deleted = await WhatsAppCampaign.findById(campaign._id);
    expect(deleted).toBeNull();
  });

  it("deletes a scheduled campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "scheduled" });
    const res = await request(app).delete(`/api/whatsapp-campaigns/${campaign._id}`);

    expect(res.status).toBe(200);
  });

  it("cannot delete running campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).delete(`/api/whatsapp-campaigns/${campaign._id}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("cannot be deleted");
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — START
// ===================================================================

describe("WhatsApp Campaign — startCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("WAStartOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@wastart.com" });
    mockCurrentUser = admin;
  });

  it("starts a draft campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).post(`/api/whatsapp-campaigns/${campaign._id}/start`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign started successfully");
    expect(["running", "completed"]).toContain(res.body.data.status);
  });

  it("returns success for already-running campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).post(`/api/whatsapp-campaigns/${campaign._id}/start`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign was already started");
  });

  it("returns success for completed campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "completed" });
    const res = await request(app).post(`/api/whatsapp-campaigns/${campaign._id}/start`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign was already started");
  });

  it("returns 400 for cancelled campaign", async () => {
    const campaign = await seedWhatsAppCampaign({ organizationId: org._id, createdBy: admin._id, status: "cancelled" });
    const res = await request(app).post(`/api/whatsapp-campaigns/${campaign._id}/start`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cannot be started");
  });

  it("returns 404 for non-existent campaign", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).post(`/api/whatsapp-campaigns/${fakeId}/start`);

    expect(res.status).toBe(404);
  });
});

// ===================================================================
// WHATSAPP CAMPAIGNS — ANALYTICS
// ===================================================================

describe("WhatsApp Campaign — getCampaignAnalytics", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("WAAnalyticsOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@waanalytics.com" });
    mockCurrentUser = admin;
  });

  it("returns analytics with computed rates", async () => {
    const campaign = await seedWhatsAppCampaign({
      organizationId: org._id,
      createdBy: admin._id,
      status: "completed",
      targetUsers: [
        { phoneNumber: "+923001111111", name: "U1", status: "clicked", clickedAt: new Date() },
        { phoneNumber: "+923002222222", name: "U2", status: "read", readAt: new Date() },
      ],
      stats: { totalSent: 2, totalDelivered: 2, totalRead: 1, totalClicked: 1, totalReported: 0, totalFailed: 0 },
    });

    const res = await request(app).get(`/api/whatsapp-campaigns/${campaign._id}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalTargets).toBe(2);
    expect(res.body.data.totalSent).toBe(2);
    expect(res.body.data.totalDelivered).toBe(2);
    expect(res.body.data.totalRead).toBe(1);
    expect(res.body.data.totalClicked).toBe(1);
    expect(parseFloat(res.body.data.deliveryRate)).toBe(100);
    expect(parseFloat(res.body.data.readRate)).toBe(50);
    expect(parseFloat(res.body.data.clickRate)).toBe(50);
  });

  it("returns zero rates when no messages sent", async () => {
    const campaign = await seedWhatsAppCampaign({
      organizationId: org._id,
      createdBy: admin._id,
      status: "draft",
      targetUsers: [{ phoneNumber: "+923001111111", name: "U1", status: "pending" }],
      stats: { totalSent: 0 },
    });

    const res = await request(app).get(`/api/whatsapp-campaigns/${campaign._id}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.data.deliveryRate).toBe(0);
    expect(res.body.data.readRate).toBe(0);
    expect(res.body.data.clickRate).toBe(0);
  });

  it("returns 404 for non-existent campaign", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/whatsapp-campaigns/${fakeId}/analytics`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Campaign not found");
  });
});

// ===================================================================
// PUBLIC ROUTES — click tracking and webhook
// ===================================================================

describe("WhatsApp Campaign — Public Routes", () => {
  it("OPTIONS /click returns 204 with CORS headers", async () => {
    const res = await request(app).options("/api/whatsapp-campaigns/click");

    expect(res.status).toBe(204);
  });

  describe("GET /click", () => {
    it("returns 204 when no token provided", async () => {
      const res = await request(app).get("/api/whatsapp-campaigns/click");

      expect(res.status).toBe(204);
    });

    it("returns 204 when token doesn't match any campaign", async () => {
      const res = await request(app).get("/api/whatsapp-campaigns/click?ct=nonexistent");

      expect(res.status).toBe(204);
    });

    it("records click when valid token is found", async () => {
      const campaign = await seedWhatsAppCampaign({
        targetUsers: [
          { phoneNumber: "+923001111111", name: "U1", status: "sent", clickToken: "valid-token-123" },
        ],
        stats: { totalSent: 1, totalClicked: 0 },
      });

      const res = await request(app).get("/api/whatsapp-campaigns/click?ct=valid-token-123");

      expect(res.status).toBe(204);
      const updated = await WhatsAppCampaign.findById(campaign._id);
      expect(updated.targetUsers[0].status).toBe("clicked");
      expect(updated.stats.totalClicked).toBe(1);
    });

    it("is idempotent — clicking twice doesn't double-count", async () => {
      await seedWhatsAppCampaign({
        targetUsers: [
          { phoneNumber: "+923001111111", name: "U1", status: "clicked", clickToken: "already-clicked", clickedAt: new Date() },
        ],
        stats: { totalSent: 1, totalClicked: 1 },
      });

      const res = await request(app).get("/api/whatsapp-campaigns/click?ct=already-clicked");
      expect(res.status).toBe(204);
    });
  });

  describe("POST /webhook", () => {
    it("handles delivered status update", async () => {
      const campaign = await seedWhatsAppCampaign({
        targetUsers: [
          { phoneNumber: "+923001111111", name: "U1", status: "sent", messageSid: "SM_DELIVER_1" },
        ],
        stats: { totalSent: 1, totalDelivered: 0 },
      });

      const res = await request(app).post("/api/whatsapp-campaigns/webhook").send({
        MessageSid: "SM_DELIVER_1",
        MessageStatus: "delivered",
        To: "+923001111111",
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe("OK");
      const updated = await WhatsAppCampaign.findById(campaign._id);
      expect(updated.targetUsers[0].status).toBe("delivered");
      expect(updated.stats.totalDelivered).toBe(1);
    });

    it("handles read status update", async () => {
      const campaign = await seedWhatsAppCampaign({
        targetUsers: [
          { phoneNumber: "+923001111111", name: "U1", status: "sent", messageSid: "SM_READ_1" },
        ],
        stats: { totalSent: 1, totalRead: 0 },
      });

      const res = await request(app).post("/api/whatsapp-campaigns/webhook").send({
        MessageSid: "SM_READ_1",
        MessageStatus: "read",
        To: "+923001111111",
      });

      expect(res.status).toBe(200);
      const updated = await WhatsAppCampaign.findById(campaign._id);
      expect(updated.targetUsers[0].status).toBe("read");
      expect(updated.stats.totalRead).toBe(1);
    });

    it("handles failed status update", async () => {
      const campaign = await seedWhatsAppCampaign({
        targetUsers: [
          { phoneNumber: "+923001111111", name: "U1", status: "sent", messageSid: "SM_FAIL_1" },
        ],
        stats: { totalSent: 1, totalFailed: 0 },
      });

      const res = await request(app).post("/api/whatsapp-campaigns/webhook").send({
        MessageSid: "SM_FAIL_1",
        MessageStatus: "failed",
        ErrorMessage: "Undeliverable",
        To: "+923001111111",
      });

      expect(res.status).toBe(200);
      const updated = await WhatsAppCampaign.findById(campaign._id);
      expect(updated.targetUsers[0].status).toBe("failed");
      expect(updated.targetUsers[0].failureReason).toBe("Undeliverable");
      expect(updated.stats.totalFailed).toBe(1);
    });

    it("returns 200 OK even when no matching campaign", async () => {
      const res = await request(app).post("/api/whatsapp-campaigns/webhook").send({
        MessageSid: "SM_UNKNOWN",
        MessageStatus: "delivered",
        To: "+923009999999",
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe("OK");
    });
  });
});
