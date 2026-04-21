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

jest.mock("../../src/services/geminiService", () => ({
  analyzeConversation: jest.fn(async () => ({
    success: true,
    analysis: { score: 75, fellForPhishing: false, providedSensitiveInfo: false, sensitiveInfoTypes: [], resistanceLevel: "high", rationale: "Handled well" },
  })),
  getSummaryAndInfoTypes: jest.fn(async () => ({
    success: true,
    rationale: "Good resistance shown.",
    sensitiveInfoTypes: [],
  })),
}));

jest.mock("../../src/services/voicePhishingMLService", () => ({
  analyzeConversation: jest.fn(async () => ({
    success: true,
    analysis: { score: 80, fellForPhishing: false, providedSensitiveInfo: false },
    modelType: "cnn_bilstm",
  })),
}));

jest.mock("../../src/services/fusionMlService", () => ({
  analyzeVoiceConversation: jest.fn(async () => ({
    success: true,
    voice_prediction: 0,
    voice_probability: 0.85,
    fusion_prediction: 0,
    fusion_probability: 0.82,
    voice_raw_score: 85,
    details: {},
  })),
}));

jest.mock("../../src/services/translationService", () => ({
  translateForMLAnalysis: jest.fn(async (text) => ({
    translated: text,
    wasTranslated: false,
    originalLanguage: "en",
  })),
}));

jest.mock("../../src/services/elevenLabsService", () => ({
  getConversationRecording: jest.fn(async () => ({
    success: true,
    recordingUrl: "https://example.com/recording.mp3",
  })),
}));

jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn(async () => {}),
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
const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const VoicePhishingTemplate = require("../../src/models/VoicePhishingTemplate");
const VoicePhishingConversation = require("../../src/models/VoicePhishingConversation");

// ---------------------------------------------------------------------------
// Routes & app
// ---------------------------------------------------------------------------
const voicePhishingRoutes = require("../../src/routes/voicePhishing");
const voicePhishingTemplateRoutes = require("../../src/routes/voicePhishingTemplates");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/voice-phishing", voicePhishingRoutes);
  app.use("/api/voice-phishing-templates", voicePhishingTemplateRoutes);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedUser(overrides = {}) {
  return User.create({
    clerkId: overrides.clerkId || `clerk-${new mongoose.Types.ObjectId()}`,
    email: overrides.email || "test@test.com",
    displayName: overrides.displayName || "Test User",
    role: overrides.role || "client_admin",
    orgId: overrides.orgId || null,
    ...overrides,
  });
}

async function seedOrg(overrides = {}) {
  return Organization.create({
    name: overrides.name || "Test Org",
    clerkOrganizationId: overrides.clerkOrganizationId || `org-${new mongoose.Types.ObjectId()}`,
    ...overrides,
  });
}

async function seedTemplate(overrides = {}) {
  return VoicePhishingTemplate.create({
    title: overrides.title || "Test Template",
    description: overrides.description || "Test phishing scenario",
    type: overrides.type || "phishing",
    firstMessage: overrides.firstMessage || "Hello, this is a test phishing call.",
    organizationId: overrides.organizationId !== undefined ? overrides.organizationId : null,
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  });
}

async function seedConversation(overrides = {}) {
  return VoicePhishingConversation.create({
    userId: overrides.userId || new mongoose.Types.ObjectId(),
    organizationId: overrides.organizationId !== undefined ? overrides.organizationId : null,
    agentId: overrides.agentId || "agent-test-123",
    scenarioType: overrides.scenarioType || "phishing",
    scenarioDescription: overrides.scenarioDescription || "Test phishing scenario",
    status: overrides.status || "completed",
    score: overrides.score !== undefined ? overrides.score : 75,
    scoreDetails: overrides.scoreDetails || {
      fellForPhishing: false,
      providedSensitiveInfo: false,
      sensitiveInfoTypes: [],
      resistanceLevel: "high",
      analysisRationale: "Good resistance",
    },
    duration: overrides.duration || 120,
    transcript: overrides.transcript || [],
    fullTranscript: overrides.fullTranscript || "",
    ...overrides,
  });
}

// ===================================================================
// VOICE PHISHING TEMPLATES
// ===================================================================

describe("Voice Phishing Templates", () => {
  let org, adminUser;

  let sysAdmin;

  beforeEach(async () => {
    org = await seedOrg();
    adminUser = await seedUser({ role: "client_admin", orgId: org._id });
    sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
    mockCurrentUser = {
      _id: adminUser._id,
      clerkId: adminUser.clerkId,
      email: adminUser.email,
      role: "client_admin",
      orgId: org._id,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing-templates/defaults
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing-templates/defaults", () => {
    it("returns default scenarios for admins", async () => {
      const res = await request(app).get("/api/voice-phishing-templates/defaults");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const phishing = res.body.data.filter((s) => s.type === "phishing");
      const normal = res.body.data.filter((s) => s.type === "normal");
      expect(phishing.length).toBeGreaterThan(0);
      expect(normal.length).toBeGreaterThan(0);

      expect(res.body.data[0]).toHaveProperty("id");
      expect(res.body.data[0]).toHaveProperty("title");
      expect(res.body.data[0]).toHaveProperty("description");
      expect(res.body.data[0]).toHaveProperty("type");
      expect(res.body.data[0]).toHaveProperty("firstMessage");
      expect(res.body.data[0].isDefault).toBe(true);
    });

    it("blocks non-admin users", async () => {
      mockCurrentUser = { ...mockCurrentUser, role: "affiliated" };
      const res = await request(app).get("/api/voice-phishing-templates/defaults");
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing-templates
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing-templates", () => {
    it("returns active templates for client_admin's org", async () => {
      await seedTemplate({ title: "Org Template", organizationId: org._id, createdBy: adminUser._id });
      await seedTemplate({ title: "Other Org", organizationId: new mongoose.Types.ObjectId(), createdBy: adminUser._id });
      await seedTemplate({ title: "Inactive", organizationId: org._id, createdBy: adminUser._id, isActive: false });

      const res = await request(app).get("/api/voice-phishing-templates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe("Org Template");
    });

    it("system_admin sees only templates with organizationId=null", async () => {
      const sysAdmin = await seedUser({ role: "system_admin" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      await seedTemplate({ title: "System Template", organizationId: null, createdBy: sysAdmin._id });
      await seedTemplate({ title: "Org Only", organizationId: org._id, createdBy: adminUser._id });

      const res = await request(app).get("/api/voice-phishing-templates");

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe("System Template");
    });

    it("filters by type query parameter", async () => {
      await seedTemplate({ title: "Phish", type: "phishing", organizationId: org._id, createdBy: adminUser._id });
      await seedTemplate({ title: "Normal", type: "normal", organizationId: org._id, createdBy: adminUser._id });

      const res = await request(app).get("/api/voice-phishing-templates?type=phishing");

      expect(res.status).toBe(200);
      expect(res.body.data.every((t) => t.type === "phishing")).toBe(true);
    });

    it("returns empty array when no templates exist", async () => {
      const res = await request(app).get("/api/voice-phishing-templates");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it("returns 403 for client_admin without orgId", async () => {
      mockCurrentUser = { ...mockCurrentUser, orgId: undefined };
      const res = await request(app).get("/api/voice-phishing-templates");
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("not associated with an organization");
    });

    it("blocks non-admin users", async () => {
      mockCurrentUser = { ...mockCurrentUser, role: "affiliated" };
      const res = await request(app).get("/api/voice-phishing-templates");
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing-templates/:templateId
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing-templates/:templateId", () => {
    it("returns a single system template by ID (system_admin)", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const tpl = await seedTemplate({ title: "Get Me", organizationId: null, createdBy: sysAdmin._id });

      const res = await request(app).get(`/api/voice-phishing-templates/${tpl._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Get Me");
    });

    it("returns 404 for non-existent template", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/voice-phishing-templates/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when client_admin accesses another org template", async () => {
      const otherOrg = await seedOrg({ name: "Other" });
      const tpl = await seedTemplate({ organizationId: otherOrg._id, createdBy: adminUser._id });

      const res = await request(app).get(`/api/voice-phishing-templates/${tpl._id}`);
      expect(res.status).toBe(403);
    });

    it("system_admin cannot access org-specific templates", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const tpl = await seedTemplate({ organizationId: org._id, createdBy: adminUser._id });

      const res = await request(app).get(`/api/voice-phishing-templates/${tpl._id}`);
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/voice-phishing-templates
  // -----------------------------------------------------------------------

  describe("POST /api/voice-phishing-templates", () => {
    it("creates a template for client_admin's org (201)", async () => {
      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "Bank Phish",
        description: "Fake bank call",
        type: "phishing",
        firstMessage: "Hello, this is your bank.",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("Bank Phish");
      expect(res.body.data.type).toBe("phishing");
      expect(res.body.data.organizationId._id.toString()).toBe(org._id.toString());
    });

    it("system_admin creates template with null organizationId", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "System Template",
        description: "For non-affiliated",
        type: "normal",
        firstMessage: "Hello from the system.",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBeNull();
    });

    it("returns 400 for missing required fields", async () => {
      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "Incomplete",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Missing required fields");
    });

    it("returns 400 for invalid type", async () => {
      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "Bad Type",
        description: "Invalid",
        type: "spam",
        firstMessage: "Hello",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("phishing");
    });

    it("returns 403 for client_admin without orgId", async () => {
      mockCurrentUser = { ...mockCurrentUser, orgId: undefined };
      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "T", description: "D", type: "phishing", firstMessage: "M",
      });
      expect(res.status).toBe(403);
    });

    it("blocks non-admin users", async () => {
      mockCurrentUser = { ...mockCurrentUser, role: "affiliated" };
      const res = await request(app).post("/api/voice-phishing-templates").send({
        title: "T", description: "D", type: "phishing", firstMessage: "M",
      });
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/voice-phishing-templates/:templateId
  // -----------------------------------------------------------------------

  describe("PUT /api/voice-phishing-templates/:templateId", () => {
    it("updates a system template (system_admin)", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const tpl = await seedTemplate({ title: "Old Title", organizationId: null, createdBy: sysAdmin._id });

      const res = await request(app).put(`/api/voice-phishing-templates/${tpl._id}`).send({
        title: "New Title",
        description: "Updated description",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("New Title");
    });

    it("returns 404 for non-existent template", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).put(`/api/voice-phishing-templates/${fakeId}`).send({ title: "X" });
      expect(res.status).toBe(404);
    });

    it("returns 403 when client_admin edits another org template", async () => {
      const otherOrg = await seedOrg({ name: "Other" });
      const tpl = await seedTemplate({ organizationId: otherOrg._id, createdBy: adminUser._id });

      const res = await request(app).put(`/api/voice-phishing-templates/${tpl._id}`).send({ title: "Hack" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid type (system_admin)", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const tpl = await seedTemplate({ organizationId: null, createdBy: sysAdmin._id });

      const res = await request(app).put(`/api/voice-phishing-templates/${tpl._id}`).send({
        type: "invalid",
      });
      expect(res.status).toBe(400);
    });

    it("can update type to normal (system_admin)", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const tpl = await seedTemplate({ type: "phishing", organizationId: null, createdBy: sysAdmin._id });

      const res = await request(app).put(`/api/voice-phishing-templates/${tpl._id}`).send({
        type: "normal",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe("normal");
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/voice-phishing-templates/:templateId
  // -----------------------------------------------------------------------

  describe("DELETE /api/voice-phishing-templates/:templateId", () => {
    it("soft-deletes a system template (system_admin)", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      const tpl = await seedTemplate({ organizationId: null, createdBy: sysAdmin._id });

      const res = await request(app).delete(`/api/voice-phishing-templates/${tpl._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Template deleted successfully");

      const deleted = await VoicePhishingTemplate.findById(tpl._id);
      expect(deleted.isActive).toBe(false);
    });

    it("returns 404 for non-existent template", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).delete(`/api/voice-phishing-templates/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when client_admin deletes another org template", async () => {
      const otherOrg = await seedOrg({ name: "Other" });
      const tpl = await seedTemplate({ organizationId: otherOrg._id, createdBy: adminUser._id });

      const res = await request(app).delete(`/api/voice-phishing-templates/${tpl._id}`);
      expect(res.status).toBe(403);
    });

    it("system_admin cannot delete org-specific templates", async () => {
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const tpl = await seedTemplate({ organizationId: org._id, createdBy: adminUser._id });

      const res = await request(app).delete(`/api/voice-phishing-templates/${tpl._id}`);
      expect(res.status).toBe(403);
    });
  });
});

// ===================================================================
// VOICE PHISHING CONVERSATIONS
// ===================================================================

describe("Voice Phishing Conversations", () => {
  let org, user;

  beforeEach(async () => {
    org = await seedOrg();
    user = await seedUser({ role: "affiliated", orgId: org._id });
    mockCurrentUser = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      role: "affiliated",
      orgId: org._id,
    };
    process.env.ELEVENLABS_AGENT_ID = "agent-test-123";
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_AGENT_ID;
  });

  // -----------------------------------------------------------------------
  // POST /api/voice-phishing/initiate
  // -----------------------------------------------------------------------

  describe("POST /api/voice-phishing/initiate", () => {
    it("initiates a new conversation", async () => {
      const res = await request(app).post("/api/voice-phishing/initiate").send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBeDefined();
      expect(res.body.data.connectionType).toBe("webrtc");
      expect(res.body.data.scenario).toBeDefined();
      expect(["phishing", "normal"]).toContain(res.body.data.scenario.type);
      expect(res.body.data.scenario.description).toBeDefined();
      expect(res.body.data.scenario.firstMessage).toBeDefined();
      expect(res.body.data.scenario.variables).toBeDefined();
    });

    it("accepts custom connectionType", async () => {
      const res = await request(app).post("/api/voice-phishing/initiate").send({
        connectionType: "websocket",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.connectionType).toBe("websocket");
    });

    it("returns 500 when ELEVENLABS_AGENT_ID not set", async () => {
      delete process.env.ELEVENLABS_AGENT_ID;

      const res = await request(app).post("/api/voice-phishing/initiate").send({});

      expect(res.status).toBe(500);
      expect(res.body.message).toContain("ElevenLabs agent ID not configured");
    });

    it("saves conversation to database", async () => {
      const res = await request(app).post("/api/voice-phishing/initiate").send({});

      const saved = await VoicePhishingConversation.findById(res.body.data.conversationId);
      expect(saved).not.toBeNull();
      expect(saved.userId.toString()).toBe(user._id.toString());
      expect(saved.status).toBe("initiated");
      expect(saved.agentId).toBe("agent-test-123");
    });

    it("uses templates from database when available", async () => {
      await seedTemplate({
        title: "Custom Phish",
        description: "Custom phishing scenario for org",
        type: "phishing",
        firstMessage: "This is a custom phishing message.",
        organizationId: org._id,
        createdBy: user._id,
      });
      await seedTemplate({
        title: "Custom Normal",
        description: "Custom normal scenario for org",
        type: "normal",
        firstMessage: "This is a custom normal message.",
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app).post("/api/voice-phishing/initiate").send({});
      expect(res.status).toBe(200);
      expect(res.body.data.scenario).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/voice-phishing/:conversationId/transcript
  // -----------------------------------------------------------------------

  describe("POST /api/voice-phishing/:conversationId/transcript", () => {
    it("updates transcript with new messages", async () => {
      const conv = await seedConversation({ userId: user._id, status: "initiated", transcript: [], score: null });

      const res = await request(app)
        .post(`/api/voice-phishing/${conv._id}/transcript`)
        .send({
          messages: [
            { role: "agent", message: "Hello, this is your bank." },
            { role: "user", message: "I don't think so." },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript.length).toBe(2);
      expect(res.body.data.status).toBe("active");
      expect(res.body.data.fullTranscript).toContain("Agent: Hello, this is your bank.");
      expect(res.body.data.fullTranscript).toContain("User: I don't think so.");
    });

    it("deduplicates identical messages", async () => {
      const conv = await seedConversation({
        userId: user._id,
        status: "active",
        transcript: [{ role: "agent", message: "Hello", timestamp: new Date() }],
        score: null,
      });

      const res = await request(app)
        .post(`/api/voice-phishing/${conv._id}/transcript`)
        .send({
          messages: [
            { role: "agent", message: "Hello" },
            { role: "user", message: "Hi" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript.length).toBe(2);
    });

    it("sets elevenLabsConversationId when provided", async () => {
      const conv = await seedConversation({ userId: user._id, status: "initiated", score: null });

      const res = await request(app)
        .post(`/api/voice-phishing/${conv._id}/transcript`)
        .send({
          messages: [],
          conversationId: "el-conv-abc123",
        });

      expect(res.status).toBe(200);
      const updated = await VoicePhishingConversation.findById(conv._id);
      expect(updated.elevenLabsConversationId).toBe("el-conv-abc123");
    });

    it("returns 404 for conversation not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/voice-phishing/${fakeId}/transcript`)
        .send({ messages: [] });
      expect(res.status).toBe(404);
    });

    it("returns 404 when another user tries to update", async () => {
      const otherUser = await seedUser({ email: "other@test.com" });
      const conv = await seedConversation({ userId: otherUser._id, status: "active", score: null });

      const res = await request(app)
        .post(`/api/voice-phishing/${conv._id}/transcript`)
        .send({ messages: [{ role: "user", message: "hi" }] });
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/voice-phishing/:conversationId/end
  // -----------------------------------------------------------------------

  describe("POST /api/voice-phishing/:conversationId/end", () => {
    it("ends a conversation and returns analysis", async () => {
      const conv = await seedConversation({
        userId: user._id,
        status: "active",
        transcript: [
          { role: "agent", message: "This is your bank.", timestamp: new Date() },
          { role: "user", message: "I need to verify first.", timestamp: new Date() },
        ],
        fullTranscript: "Agent: This is your bank.\nUser: I need to verify first.",
        score: null,
      });

      const res = await request(app).post(`/api/voice-phishing/${conv._id}/end`).send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("completed");
      expect(res.body.data.score).toBeDefined();
    });

    it("returns existing data for already-completed conversation", async () => {
      const conv = await seedConversation({
        userId: user._id,
        status: "completed",
        score: 85,
      });

      const res = await request(app).post(`/api/voice-phishing/${conv._id}/end`).send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Conversation already completed");
      expect(res.body.data.score).toBe(85);
    });

    it("returns 404 for non-existent conversation", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).post(`/api/voice-phishing/${fakeId}/end`).send({});
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing", () => {
    it("returns user's conversations with pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await seedConversation({ userId: user._id, scenarioDescription: `Scenario ${i}` });
      }
      await seedConversation({ userId: new mongoose.Types.ObjectId() });

      const res = await request(app).get("/api/voice-phishing?page=1&limit=3");

      expect(res.status).toBe(200);
      expect(res.body.data.conversations.length).toBe(3);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.pages).toBe(2);
    });

    it("filters by scenarioType", async () => {
      await seedConversation({ userId: user._id, scenarioType: "phishing" });
      await seedConversation({ userId: user._id, scenarioType: "normal" });

      const res = await request(app).get("/api/voice-phishing?scenarioType=phishing");

      expect(res.status).toBe(200);
      expect(res.body.data.conversations.every((c) => c.scenarioType === "phishing")).toBe(true);
    });

    it("returns empty array when no conversations", async () => {
      const res = await request(app).get("/api/voice-phishing");

      expect(res.status).toBe(200);
      expect(res.body.data.conversations).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it("returns conversations sorted by createdAt descending", async () => {
      await seedConversation({ userId: user._id, scenarioDescription: "Old" });
      await new Promise((r) => setTimeout(r, 50));
      await seedConversation({ userId: user._id, scenarioDescription: "New" });

      const res = await request(app).get("/api/voice-phishing");

      expect(res.status).toBe(200);
      expect(res.body.data.conversations[0].scenarioDescription).toBe("New");
    });

    it("excludes transcript and fullTranscript from list view", async () => {
      await seedConversation({
        userId: user._id,
        transcript: [{ role: "agent", message: "Hello", timestamp: new Date() }],
        fullTranscript: "Agent: Hello",
      });

      const res = await request(app).get("/api/voice-phishing");

      expect(res.status).toBe(200);
      const conv = res.body.data.conversations[0];
      expect(conv.transcript).toBeUndefined();
      expect(conv.fullTranscript).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing/:conversationId
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing/:conversationId", () => {
    it("returns a specific conversation with full details", async () => {
      const conv = await seedConversation({
        userId: user._id,
        transcript: [{ role: "agent", message: "Hello", timestamp: new Date() }],
        fullTranscript: "Agent: Hello",
      });

      const res = await request(app).get(`/api/voice-phishing/${conv._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.scenarioDescription).toBe("Test phishing scenario");
      expect(res.body.data.transcript).toBeDefined();
      expect(res.body.data.score).toBe(75);
      expect(res.body.data.scoreDetails.resistanceLevel).toBe("high");
    });

    it("returns 404 for another user's conversation", async () => {
      const otherUser = await seedUser({ email: "other@test.com" });
      const conv = await seedConversation({ userId: otherUser._id });

      const res = await request(app).get(`/api/voice-phishing/${conv._id}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent conversation", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/voice-phishing/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/voice-phishing/analytics/overview
  // -----------------------------------------------------------------------

  describe("GET /api/voice-phishing/analytics/overview", () => {
    it("returns analytics for client_admin's org", async () => {
      mockCurrentUser = { ...mockCurrentUser, role: "client_admin" };

      await seedConversation({ userId: user._id, organizationId: org._id, scenarioType: "phishing", status: "completed", score: 80, scoreDetails: { fellForPhishing: false, resistanceLevel: "high" } });
      await seedConversation({ userId: user._id, organizationId: org._id, scenarioType: "phishing", status: "completed", score: 30, scoreDetails: { fellForPhishing: true, resistanceLevel: "low" } });
      await seedConversation({ userId: user._id, organizationId: org._id, scenarioType: "normal", status: "completed", score: 90, scoreDetails: { resistanceLevel: "high" } });

      const res = await request(app).get("/api/voice-phishing/analytics/overview");

      expect(res.status).toBe(200);
      expect(res.body.data.totalConversations).toBe(3);
      expect(res.body.data.completedConversations).toBe(3);
      expect(res.body.data.averageScore).toBeCloseTo(66.67, 0);
      expect(res.body.data.phishingScenarios.total).toBe(2);
      expect(res.body.data.phishingScenarios.fellForPhishing).toBe(1);
      expect(res.body.data.normalScenarios.total).toBe(1);
      expect(res.body.data.resistanceLevels.high).toBe(2);
      expect(res.body.data.resistanceLevels.low).toBe(1);
    });

    it("system_admin sees only non-affiliated user conversations", async () => {
      const sysAdmin = await seedUser({ role: "system_admin" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const nonAff = await seedUser({ role: "non_affiliated", email: "nonaff@test.com" });
      const affUser = await seedUser({ role: "affiliated", email: "aff@test.com", orgId: org._id });

      await seedConversation({ userId: nonAff._id, organizationId: null, status: "completed", score: 60 });
      await seedConversation({ userId: affUser._id, organizationId: org._id, status: "completed", score: 90 });

      const res = await request(app).get("/api/voice-phishing/analytics/overview");

      expect(res.status).toBe(200);
      expect(res.body.data.totalConversations).toBe(1);
    });
  });
});
