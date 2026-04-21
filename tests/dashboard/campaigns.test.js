const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

// ---------------------------------------------------------------------------
// Mutable test user
// ---------------------------------------------------------------------------
let mockCurrentUser = {};

// ---------------------------------------------------------------------------
// Top-level mocks — must come before any require of routes/controllers
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

jest.mock("../../src/services/nodemailerService", () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: "msg-123" })),
}));

jest.mock("../../src/services/emailFormatter", () => ({
  formatEmailForSending: jest.fn((t) => t),
}));

jest.mock("../../src/services/twilioService", () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true, sid: "SM123" })),
  isValidPhoneNumber: jest.fn(() => true),
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
jest.mock("../../src/services/whatsappRiskScoreService", () => ({
  isEligibleForWhatsAppRiskScoring: () => false,
  computeWhatsAppRiskScore: jest.fn(async () => 0),
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
const Campaign = require("../../src/models/Campaign");
const WhatsAppCampaign = require("../../src/models/WhatsAppCampaign");
const Email = require("../../src/models/Email");

// ---------------------------------------------------------------------------
// Routes & app
// ---------------------------------------------------------------------------
const campaignRoutes = require("../../src/routes/campaigns");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/campaigns", campaignRoutes);
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

async function seedCampaign(overrides = {}) {
  return Campaign.create({
    name: overrides.name || "Test Campaign",
    description: overrides.description || "A test campaign",
    organizationId: overrides.organizationId || null,
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    status: overrides.status || "draft",
    targetUsers: overrides.targetUsers || [],
    whatsappConfig: overrides.whatsappConfig || { enabled: false },
    emailConfig: overrides.emailConfig || { enabled: false },
    stats: overrides.stats || {},
    ...overrides,
  });
}

// ===================================================================
// CREATE CAMPAIGN
// ===================================================================

describe("Campaign CRUD — createCampaign", () => {
  let org, admin, targetUser;

  beforeEach(async () => {
    org = await seedOrg("CampaignOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@camp.com" });
    targetUser = await seedUser({
      role: "affiliated",
      orgId: org._id,
      email: "target@camp.com",
      phoneNumber: "+923001234567",
    });
    mockCurrentUser = admin;
  });

  it("creates email-only campaign (201)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Email Campaign",
        description: "Phishing email test",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: {
          enabled: true,
          subject: "Important Update",
          bodyContent: "<p>Click here</p>",
          senderEmail: "sender@test.com",
        },
        whatsappConfig: { enabled: false },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Campaign created successfully");
    expect(res.body.data.name).toBe("Email Campaign");
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.emailConfig.enabled).toBe(true);
    expect(res.body.data.whatsappConfig.enabled).toBe(false);
  });

  it("creates whatsapp-only campaign (201)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "WhatsApp Campaign",
        description: "WhatsApp phishing test",
        targetUserIds: [targetUser._id.toString()],
        whatsappConfig: {
          enabled: true,
          messageTemplate: "Click this: {{link}}",
          landingPageUrl: "https://example.com/phish",
        },
        emailConfig: { enabled: false },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.whatsappConfig.enabled).toBe(true);
    expect(res.body.data.whatsappCampaignId).toBeDefined();
  });

  it("creates dual-channel campaign (201)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Dual Campaign",
        description: "Both channels",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: {
          enabled: true,
          subject: "Test",
          bodyContent: "Body",
          senderEmail: "s@test.com",
        },
        whatsappConfig: {
          enabled: true,
          messageTemplate: "Test msg",
          landingPageUrl: "https://example.com",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.emailConfig.enabled).toBe(true);
    expect(res.body.data.whatsappConfig.enabled).toBe(true);
  });

  it("creates scheduled campaign", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Scheduled Campaign",
        description: "Scheduled",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "s@t.com" },
        whatsappConfig: { enabled: false },
        scheduleDate: futureDate,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("scheduled");
    expect(res.body.data.scheduleDate).toBeDefined();
  });

  it("returns 400 when no channel enabled", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "No Channel",
        description: "None",
        targetUserIds: [targetUser._id.toString()],
        whatsappConfig: { enabled: false },
        emailConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("At least one channel");
  });

  it("returns 400 when whatsapp config incomplete", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Bad WA",
        description: "Desc",
        targetUserIds: [targetUser._id.toString()],
        whatsappConfig: { enabled: true },
        emailConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("WhatsApp configuration requires");
  });

  it("returns 400 when email config incomplete", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Bad Email",
        description: "Desc",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: { enabled: true, subject: "S" },
        whatsappConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Email configuration requires");
  });

  it("returns 400 for invalid sender email", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Bad Sender",
        description: "Desc",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "not-an-email" },
        whatsappConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid sender email");
  });

  it("returns 400 when no target users", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "No Targets",
        description: "Desc",
        targetUserIds: [],
        emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "s@t.com" },
        whatsappConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at least one target user");
  });

  it("returns 400 when whatsapp target has no phone", async () => {
    const noPhoneUser = await seedUser({
      role: "affiliated",
      orgId: org._id,
      email: "nophone@camp.com",
      phoneNumber: null,
    });

    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "No Phone",
        description: "Desc",
        targetUserIds: [noPhoneUser._id.toString()],
        whatsappConfig: { enabled: true, messageTemplate: "M", landingPageUrl: "https://x.com" },
        emailConfig: { enabled: false },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("phone number");
  });

  it("sets correct target statuses per channel", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Status Check",
        description: "Desc",
        targetUserIds: [targetUser._id.toString()],
        emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "s@t.com" },
        whatsappConfig: { enabled: false },
      });

    expect(res.status).toBe(201);
    const target = res.body.data.targetUsers[0];
    expect(target.emailStatus).toBe("pending");
    expect(target.whatsappStatus).toBe("not_applicable");
  });
});

// ===================================================================
// GET CAMPAIGNS (LIST)
// ===================================================================

describe("Campaign CRUD — getCampaigns", () => {
  let org, admin, sysAdmin;

  beforeEach(async () => {
    org = await seedOrg("ListOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@list.com" });
    sysAdmin = await seedUser({ role: "system_admin", email: "sys@list.com" });
  });

  it("client_admin sees only their org campaigns", async () => {
    await seedCampaign({ name: "Org Campaign", organizationId: org._id, createdBy: admin._id });
    await seedCampaign({ name: "System Campaign", organizationId: null, createdBy: sysAdmin._id });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/campaigns");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.campaigns.some((c) => c.name === "Org Campaign")).toBe(true);
    expect(res.body.data.campaigns.some((c) => c.name === "System Campaign")).toBe(false);
  });

  it("system_admin sees only campaigns with null orgId", async () => {
    await seedCampaign({ name: "System Campaign", organizationId: null, createdBy: sysAdmin._id });
    await seedCampaign({ name: "Org Campaign", organizationId: org._id, createdBy: admin._id });

    mockCurrentUser = sysAdmin;
    const res = await request(app).get("/api/campaigns");

    expect(res.status).toBe(200);
    expect(res.body.data.campaigns.some((c) => c.name === "System Campaign")).toBe(true);
    expect(res.body.data.campaigns.some((c) => c.name === "Org Campaign")).toBe(false);
  });

  it("returns pagination info", async () => {
    await seedCampaign({ name: "C1", organizationId: org._id, createdBy: admin._id });
    await seedCampaign({ name: "C2", organizationId: org._id, createdBy: admin._id });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/campaigns?page=1&limit=1");

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.current).toBe(1);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.campaigns).toHaveLength(1);
  });

  it("filters by status", async () => {
    await seedCampaign({ name: "Draft", organizationId: org._id, createdBy: admin._id, status: "draft" });
    await seedCampaign({ name: "Running", organizationId: org._id, createdBy: admin._id, status: "running" });

    mockCurrentUser = admin;
    const res = await request(app).get("/api/campaigns?status=draft");

    expect(res.status).toBe(200);
    expect(res.body.data.campaigns.every((c) => c.status === "draft")).toBe(true);
  });
});

// ===================================================================
// GET SINGLE CAMPAIGN
// ===================================================================

describe("Campaign CRUD — getCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("SingleOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@single.com" });
    mockCurrentUser = admin;
  });

  it("returns campaign by id", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id });
    const res = await request(app).get(`/api/campaigns/${campaign._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Test Campaign");
  });

  it("returns 404 for non-existent campaign", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/campaigns/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Campaign not found");
  });
});

// ===================================================================
// UPDATE CAMPAIGN
// ===================================================================

describe("Campaign CRUD — updateCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("UpdateOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@upd.com" });
    mockCurrentUser = admin;
  });

  it("updates draft campaign name", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Name");
  });

  it("cannot update running campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .send({ name: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("cannot be updated");
  });

  it("sets status to scheduled when scheduleDate provided", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .send({ scheduleDate: future });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("scheduled");
  });
});

// ===================================================================
// DELETE CAMPAIGN
// ===================================================================

describe("Campaign CRUD — deleteCampaign", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("DeleteOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@del.com" });
    mockCurrentUser = admin;
  });

  it("deletes draft campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).delete(`/api/campaigns/${campaign._id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign deleted successfully");
    const deleted = await Campaign.findById(campaign._id);
    expect(deleted).toBeNull();
  });

  it("deletes associated WhatsApp campaign", async () => {
    const waCamp = await WhatsAppCampaign.create({
      name: "WA",
      description: "WA",
      createdBy: admin._id,
      templateId: "t1",
      messageTemplate: "M",
      landingPageUrl: "https://x.com",
      targetUsers: [],
    });
    const campaign = await seedCampaign({
      organizationId: org._id,
      createdBy: admin._id,
      whatsappCampaignId: waCamp._id,
    });

    await request(app).delete(`/api/campaigns/${campaign._id}`);
    const deletedWa = await WhatsAppCampaign.findById(waCamp._id);
    expect(deletedWa).toBeNull();
  });

  it("cannot delete running campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).delete(`/api/campaigns/${campaign._id}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("cannot be deleted");
  });
});

// ===================================================================
// CAMPAIGN LIFECYCLE (start / pause / resume / cancel)
// ===================================================================

describe("Campaign Lifecycle — start/pause/resume/cancel", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("LifecycleOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@life.com" });
    mockCurrentUser = admin;
  });

  it("starts a draft campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/start`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign started successfully");
    expect(["running", "completed"]).toContain(res.body.data.status);
    expect(res.body.data.startDate).toBeDefined();
  });

  it("starts a scheduled campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "scheduled" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/start`);

    expect(res.status).toBe(200);
    expect(["running", "completed"]).toContain(res.body.data.status);
  });

  it("cannot start a running campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/start`);

    expect(res.status).toBe(404);
  });

  it("pauses a running campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/pause`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign paused successfully");
    expect(res.body.data.status).toBe("paused");
  });

  it("cannot pause a draft campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/pause`);

    expect(res.status).toBe(404);
  });

  it("resumes a paused campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "paused" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/resume`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign resumed successfully");
    expect(["running", "completed"]).toContain(res.body.data.status);
  });

  it("cannot resume a non-paused campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "draft" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/resume`);

    expect(res.status).toBe(404);
  });

  it("cancels a running campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "running" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Campaign cancelled successfully");
    expect(res.body.data.status).toBe("cancelled");
  });

  it("cancels a scheduled campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "scheduled" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("cancelled");
  });

  it("cannot cancel a completed campaign", async () => {
    const campaign = await seedCampaign({ organizationId: org._id, createdBy: admin._id, status: "completed" });
    const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`);

    expect(res.status).toBe(404);
  });
});

// ===================================================================
// CAMPAIGN ANALYTICS
// ===================================================================

describe("Campaign Analytics", () => {
  let org, admin;

  beforeEach(async () => {
    org = await seedOrg("AnalyticsOrg");
    admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@anal.com" });
    mockCurrentUser = admin;
  });

  it("returns analytics for a campaign", async () => {
    const campaign = await seedCampaign({
      organizationId: org._id,
      createdBy: admin._id,
      status: "completed",
      targetUsers: [
        { email: "a@t.com", emailStatus: "sent", whatsappStatus: "not_applicable" },
        { email: "b@t.com", emailStatus: "opened", whatsappStatus: "not_applicable" },
      ],
      emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "s@t.com" },
      stats: { totalEmailTargets: 2, totalEmailSent: 2, totalEmailOpened: 1 },
    });

    const res = await request(app).get(`/api/campaigns/${campaign._id}/analytics`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.email).toBeDefined();
    expect(res.body.data.status).toBe("completed");
  });

  it("returns 404 for non-existent campaign", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/campaigns/${fakeId}/analytics`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Campaign not found");
  });
});
