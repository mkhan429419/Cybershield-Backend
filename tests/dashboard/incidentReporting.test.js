const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

let mockCurrentUser = {};

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
  requireOrgAccess: (req, res, next) => next(),
}));

jest.mock("@clerk/clerk-sdk-node", () => ({
  ClerkExpressRequireAuth: () => (_req, _res, next) => next(),
  clerkClient: {
    users: { getUser: jest.fn(async () => ({})), getUserList: jest.fn(async () => []) },
  },
}));

const mockFusionPredict = jest.fn();
const mockFusionFormat = jest.fn();

jest.mock("../../src/services/fusionMlService", () => ({
  predictIncident: mockFusionPredict,
  formatIncidentForML: mockFusionFormat,
  analyzeVoiceConversation: jest.fn(),
  formatVoiceForML: jest.fn(),
}));

jest.mock("../../src/services/whatsappEmailMlService", () => ({
  predictIncident: jest.fn(),
  formatIncidentForML: jest.fn((d) => d),
}));

jest.mock("../../src/services/incidentLearningScoreService", () => ({
  updateIncidentLearningScore: jest.fn(async () => ({ learningScoreIncident: 0.5 })),
}));

jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn(async () => {}),
}));

const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const Incident = require("../../src/models/Incident");

const incidentRoutes = require("../../src/routes/incidents");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/incidents", incidentRoutes);
  return app;
}

const app = buildApp();

async function seedOrg(overrides = {}) {
  return Organization.create({
    name: overrides.name || "Test Org",
    clerkOrganizationId: overrides.clerkOrganizationId || `org-${new mongoose.Types.ObjectId()}`,
    ...overrides,
  });
}

async function seedUser(overrides = {}) {
  return User.create({
    clerkId: overrides.clerkId || `clerk-${new mongoose.Types.ObjectId()}`,
    email: overrides.email || `user-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`,
    displayName: overrides.displayName || "Test User",
    role: overrides.role || "affiliated",
    orgId: overrides.orgId || null,
    ...overrides,
  });
}

async function seedIncident(overrides = {}) {
  return Incident.create({
    userId: overrides.userId || new mongoose.Types.ObjectId(),
    organizationId: overrides.organizationId || null,
    messageType: overrides.messageType || "email",
    message: overrides.message || "Test suspicious email content",
    text: overrides.text || "Test suspicious email content",
    subject: overrides.subject || "Urgent: Verify your account",
    from: overrides.from || "phisher@evil.com",
    urls: overrides.urls || ["https://evil-site.com"],
    is_phishing: overrides.is_phishing !== undefined ? overrides.is_phishing : true,
    phishing_probability: overrides.phishing_probability !== undefined ? overrides.phishing_probability : 0.92,
    legitimate_probability: overrides.legitimate_probability !== undefined ? overrides.legitimate_probability : 0.08,
    confidence: overrides.confidence !== undefined ? overrides.confidence : 0.95,
    persuasion_cues: overrides.persuasion_cues || ["urgency", "authority"],
    ...overrides,
  });
}

// ===================================================================
// INCIDENT REPORTING
// ===================================================================

describe("Incident Reporting API", () => {
  let org, user;

  beforeEach(async () => {
    jest.clearAllMocks();
    org = await seedOrg();
    user = await seedUser({ role: "affiliated", orgId: org._id, email: "user@test.com" });
    mockCurrentUser = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      role: "affiliated",
      orgId: org._id,
    };

    mockFusionFormat.mockImplementation((d) => ({
      text: d.text || d.message || "",
      message_type: d.messageType || "email",
      metadata: {},
      urls: d.urls || [],
    }));

    mockFusionPredict.mockResolvedValue({
      success: true,
      is_phishing: true,
      phishing_probability: 0.92,
      legitimate_probability: 0.08,
      confidence: 0.95,
      persuasion_cues: ["urgency", "authority"],
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/incidents/analyze
  // -----------------------------------------------------------------------

  describe("POST /api/incidents/analyze", () => {
    it("analyzes an email incident and returns phishing result", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Your account has been compromised. Click here to verify.",
        subject: "Urgent Security Alert",
        from: "security@fakebank.com",
        urls: ["https://fakebank-login.com"],
        date: "2026-04-21T10:00:00Z",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.is_phishing).toBe(true);
      expect(res.body.phishing_probability).toBe(0.92);
      expect(res.body.legitimate_probability).toBe(0.08);
      expect(res.body.confidence).toBe(0.95);
      expect(res.body.incidentId).toBeDefined();
      expect(res.body.persuasion_cues).toEqual(["urgency", "authority"]);
    });

    it("analyzes a WhatsApp incident", async () => {
      mockFusionPredict.mockResolvedValue({
        success: true,
        is_phishing: false,
        phishing_probability: 0.15,
        legitimate_probability: 0.85,
        confidence: 0.88,
        persuasion_cues: [],
      });

      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "whatsapp",
        message: "Hey, check out this cool link!",
        from: "+1234567890",
        urls: ["https://example.com"],
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.is_phishing).toBe(false);
      expect(res.body.phishing_probability).toBe(0.15);
    });

    it("saves incident to database after analysis", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Click here to win a prize!",
        subject: "You Won!",
        from: "prize@scam.com",
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved).not.toBeNull();
      expect(saved.userId.toString()).toBe(user._id.toString());
      expect(saved.messageType).toBe("email");
      expect(saved.is_phishing).toBe(true);
      expect(saved.message).toBe("Click here to win a prize!");
    });

    it("returns 400 when message is missing", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        subject: "No message",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("message");
      expect(res.body.is_phishing).toBeNull();
    });

    it("returns 400 when message is empty string", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "",
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("defaults messageType to email when not provided", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        message: "Some suspicious content",
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved.messageType).toBe("email");
    });

    it("uses text field as fallback for message", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        text: "Fallback text content",
        subject: "Test",
        from: "test@test.com",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("handles ML service failure gracefully", async () => {
      mockFusionPredict.mockRejectedValue(new Error("ML model unavailable"));

      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Test message",
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.is_phishing).toBeNull();
    });

    it("handles ML returning non-phishing result", async () => {
      mockFusionPredict.mockResolvedValue({
        success: true,
        is_phishing: false,
        phishing_probability: 0.05,
        legitimate_probability: 0.95,
        confidence: 0.98,
        persuasion_cues: [],
      });

      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Hi, here are the meeting notes from today.",
        subject: "Meeting Notes",
        from: "colleague@company.com",
      });

      expect(res.status).toBe(200);
      expect(res.body.is_phishing).toBe(false);
      expect(res.body.phishing_probability).toBe(0.05);
      expect(res.body.confidence).toBe(0.98);
    });

    it("stores URLs from the request", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Visit these links",
        urls: ["https://link1.com", "https://link2.com"],
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved.urls.length).toBe(2);
    });

    it("filters empty URLs before saving", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Some message",
        urls: ["https://valid.com", "", "  "],
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved.urls.length).toBe(1);
    });

    it("calls fusionMlService by default", async () => {
      await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Test fusion path",
      });

      expect(mockFusionFormat).toHaveBeenCalled();
      expect(mockFusionPredict).toHaveBeenCalled();
    });

    it("updates incident learning score after analysis", async () => {
      const { updateIncidentLearningScore } = require("../../src/services/incidentLearningScoreService");

      await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Test score update",
      });

      expect(updateIncidentLearningScore).toHaveBeenCalledWith(user._id);
    });

    it("saves organizationId from user context", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "email",
        message: "Org context test",
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved.organizationId.toString()).toBe(org._id.toString());
    });

    it("handles WhatsApp with from_phone field", async () => {
      const res = await request(app).post("/api/incidents/analyze").send({
        messageType: "whatsapp",
        message: "WhatsApp message",
        from: "+923001234567",
        from_phone: "+923001234567",
      });

      expect(res.status).toBe(200);
      const saved = await Incident.findById(res.body.incidentId);
      expect(saved.from_phone).toBe("+923001234567");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/incidents
  // -----------------------------------------------------------------------

  describe("GET /api/incidents", () => {
    it("returns user's own incidents with pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await seedIncident({ userId: user._id, organizationId: org._id, message: `Incident ${i}` });
      }
      await seedIncident({ userId: new mongoose.Types.ObjectId(), message: "Other user's incident" });

      const res = await request(app).get("/api/incidents?page=1&limit=3");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.incidents.length).toBe(3);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.pages).toBe(2);
    });

    it("admin sees org-wide incidents", async () => {
      const admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@test.com" });
      mockCurrentUser = { _id: admin._id, clerkId: admin.clerkId, role: "client_admin", orgId: org._id };

      await seedIncident({ userId: user._id, organizationId: org._id, message: "User incident" });
      await seedIncident({ userId: admin._id, organizationId: org._id, message: "Admin incident" });
      const otherOrg = await seedOrg({ name: "Other" });
      await seedIncident({ userId: new mongoose.Types.ObjectId(), organizationId: otherOrg._id, message: "Other org" });

      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBe(2);
    });

    it("system_admin sees org-wide incidents", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: org._id };

      await seedIncident({ userId: user._id, organizationId: org._id });
      await seedIncident({ userId: user._id, organizationId: org._id });

      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBe(2);
    });

    it("filters by messageType", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id, messageType: "email" });
      await seedIncident({ userId: user._id, organizationId: org._id, messageType: "whatsapp" });

      const res = await request(app).get("/api/incidents?messageType=email");

      expect(res.status).toBe(200);
      expect(res.body.incidents.every((i) => i.messageType === "email")).toBe(true);
    });

    it("filters by isPhishing=true", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id, is_phishing: true });
      await seedIncident({ userId: user._id, organizationId: org._id, is_phishing: false });

      const res = await request(app).get("/api/incidents?isPhishing=true");

      expect(res.status).toBe(200);
      expect(res.body.incidents.every((i) => i.is_phishing === true)).toBe(true);
    });

    it("filters by isPhishing=false", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id, is_phishing: true });
      await seedIncident({ userId: user._id, organizationId: org._id, is_phishing: false });

      const res = await request(app).get("/api/incidents?isPhishing=false");

      expect(res.status).toBe(200);
      expect(res.body.incidents.every((i) => i.is_phishing === false)).toBe(true);
    });

    it("returns empty array when no incidents", async () => {
      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(res.body.incidents).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("returns incidents sorted by createdAt descending", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id, message: "Old" });
      await new Promise((r) => setTimeout(r, 50));
      await seedIncident({ userId: user._id, organizationId: org._id, message: "New" });

      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(res.body.incidents[0].message).toBe("New");
    });

    it("populates userId with displayName and email", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id });

      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      const incident = res.body.incidents[0];
      expect(incident.userId).toBeDefined();
      expect(incident.userId.displayName).toBe("Test User");
    });

    it("handles combined messageType and isPhishing filters", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id, messageType: "email", is_phishing: true });
      await seedIncident({ userId: user._id, organizationId: org._id, messageType: "email", is_phishing: false });
      await seedIncident({ userId: user._id, organizationId: org._id, messageType: "whatsapp", is_phishing: true });

      const res = await request(app).get("/api/incidents?messageType=email&isPhishing=true");

      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBe(1);
      expect(res.body.incidents[0].messageType).toBe("email");
      expect(res.body.incidents[0].is_phishing).toBe(true);
    });

    it("ignores invalid messageType filter values", async () => {
      await seedIncident({ userId: user._id, organizationId: org._id });

      const res = await request(app).get("/api/incidents?messageType=sms");

      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/incidents/:id
  // -----------------------------------------------------------------------

  describe("GET /api/incidents/:id", () => {
    it("returns a specific incident by ID", async () => {
      const incident = await seedIncident({
        userId: user._id,
        organizationId: org._id,
        message: "Specific incident",
        subject: "Test Subject",
        is_phishing: true,
        phishing_probability: 0.88,
      });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.incident.message).toBe("Specific incident");
      expect(res.body.incident.subject).toBe("Test Subject");
      expect(res.body.incident.is_phishing).toBe(true);
      expect(res.body.incident.phishing_probability).toBe(0.88);
    });

    it("returns 404 for non-existent incident", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).get(`/api/incidents/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });

    it("regular user cannot access another user's incident", async () => {
      const otherUser = await seedUser({ email: "other@test.com" });
      const incident = await seedIncident({ userId: otherUser._id, organizationId: org._id });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(404);
    });

    it("admin can access org incidents", async () => {
      const admin = await seedUser({ role: "client_admin", orgId: org._id, email: "admin2@test.com" });
      mockCurrentUser = { _id: admin._id, clerkId: admin.clerkId, role: "client_admin", orgId: org._id };

      const incident = await seedIncident({ userId: user._id, organizationId: org._id, message: "Org incident" });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(200);
      expect(res.body.incident.message).toBe("Org incident");
    });

    it("system_admin can access any org incident", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys2@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: org._id };

      const incident = await seedIncident({ userId: user._id, organizationId: org._id });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(200);
    });

    it("populates userId in response", async () => {
      const incident = await seedIncident({ userId: user._id, organizationId: org._id });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(200);
      expect(res.body.incident.userId.displayName).toBe("Test User");
      expect(res.body.incident.userId.email).toBe("user@test.com");
    });

    it("returns persuasion_cues in incident detail", async () => {
      const incident = await seedIncident({
        userId: user._id,
        organizationId: org._id,
        persuasion_cues: ["urgency", "fear", "authority"],
      });

      const res = await request(app).get(`/api/incidents/${incident._id}`);

      expect(res.status).toBe(200);
      expect(res.body.incident.persuasion_cues).toEqual(["urgency", "fear", "authority"]);
    });
  });
});
