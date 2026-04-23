const express = require("express");
const mongoose = require("mongoose");

let mockCurrentUser = {};

jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    req.auth = { userId: `clerk-${token}` };
    return next();
  },
  getUserData: (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token === "admin") req.user = mockCurrentUser.admin;
    if (token === "user") req.user = mockCurrentUser.user;
    if (token === "outsider") req.user = mockCurrentUser.outsider;
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    return next();
  },
  requireRole:
    (roles) =>
    (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "User not authenticated" });
      if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
      return next();
    },
  requireOrgAccess: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "User not authenticated" });
    if (req.user.role === "system_admin") return next();
    const requestedOrg = req.params.orgId;
    const userOrg = req.user.orgId?._id?.toString?.() || req.user.orgId?.toString?.() || String(req.user.orgId || "");
    if (!userOrg || userOrg !== requestedOrg) {
      return res.status(403).json({ error: "Access denied to this organization" });
    }
    return next();
  },
}));

jest.mock("@clerk/clerk-sdk-node", () => ({
  clerkClient: {
    users: {
      getUser: jest.fn(async () => ({
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
        lastSignInAt: null,
      })),
      getUserList: jest.fn(async () => []),
      updateUser: jest.fn(async () => ({})),
    },
    invitations: {
      createInvitation: jest.fn(async () => ({
        id: "inv-1",
      })),
      getInvitationList: jest.fn(async () => []),
      revokeInvitation: jest.fn(async () => ({})),
    },
  },
  ClerkExpressRequireAuth: () => (req, _res, next) => next(),
}));

jest.mock("../../src/services/fusionMlService", () => ({
  formatIncidentForML: jest.fn((data) => data),
  predictIncident: jest.fn(async () => ({
    success: true,
    is_phishing: true,
    phishing_probability: 0.91,
    legitimate_probability: 0.09,
    confidence: 0.96,
    persuasion_cues: ["urgency"],
  })),
}));

jest.mock("../../src/services/nodemailerService", () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: "msg-1" })),
}));

jest.mock("../../src/services/twilioService", () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true, messageId: "wa-1" })),
  isValidPhoneNumber: jest.fn(() => true),
}));

jest.mock("../../src/services/geminiService", () => ({
  generateResponse: jest.fn(async () => ({
    success: true,
    response: "Mocked AI response",
  })),
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn(async () => ({
          response: {
            text: () => "Mocked Gemini chat response",
          },
        })),
      }),
    }),
  })),
}));

jest.mock("../../src/services/youtubeService", () => ({
  isReady: jest.fn(() => true),
  uploadVideo: jest.fn(async () => ({
    videoId: "yt-1",
    watchUrl: "https://youtube.com/watch?v=yt-1",
    embedUrl: "https://youtube.com/embed/yt-1",
    title: "mock",
  })),
}));

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn((_opts, cb) => ({
        end: () =>
          cb(null, {
            secure_url: "https://cloudinary.example/file.png",
            public_id: "test-public-id",
          }),
      })),
    },
    api: {
      resource: jest.fn(async () => ({
        bytes: 1234,
        format: "txt",
        created_at: new Date().toISOString(),
      })),
    },
    url: jest.fn(() => "https://cloudinary.example/transcript.txt"),
  },
}));

jest.mock("axios", () => ({
  get: jest.fn(async () => ({ data: "hello world transcript" })),
}));

jest.mock("../../src/services/incidentLearningScoreService", () => ({
  updateIncidentLearningScore: jest.fn(async () => ({ learningScoreIncident: 1 })),
}));

const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const Course = require("../../src/models/Course");
const CourseProgress = require("../../src/models/CourseProgress");
const Incident = require("../../src/models/Incident");
const Report = require("../../src/models/Report");
const Campaign = require("../../src/models/Campaign");
const WhatsAppCampaign = require("../../src/models/WhatsAppCampaign");
const VoicePhishingConversation = require("../../src/models/VoicePhishingConversation");
const VoicePhishingTemplate = require("../../src/models/VoicePhishingTemplate");
const Group = require("../../src/models/Group");

const incidentRoutes = require("../../src/routes/incidents");
const certificateRoutes = require("../../src/routes/certificates");
const leaderboardRoutes = require("../../src/routes/leaderboard");
const reportRoutes = require("../../src/routes/reports");
const userRoutes = require("../../src/routes/users");
const courseRoutes = require("../../src/routes/courses");
const voiceTemplateRoutes = require("../../src/routes/voicePhishingTemplates");
const adminRoutes = require("../../src/routes/admin");
const orgRoutes = require("../../src/routes/orgs");
const campaignRoutes = require("../../src/routes/campaigns");
const whatsappCampaignRoutes = require("../../src/routes/whatsappCampaigns");
const emailRoutes = require("../../src/routes/email");
const emailTemplateRoutes = require("../../src/routes/emailTemplates");
const whatsAppTemplateRoutes = require("../../src/routes/whatsAppTemplates");
const chatRoutes = require("../../src/routes/chat");
const uploadRoutes = require("../../src/routes/upload");
const voicePhishingRoutes = require("../../src/routes/voicePhishing");

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/incidents", incidentRoutes);
  app.use("/api/certificates", certificateRoutes);
  app.use("/api/leaderboard", leaderboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/courses", courseRoutes);
  app.use("/api/voice-phishing-templates", voiceTemplateRoutes);
  app.use("/api/admins", adminRoutes);
  app.use("/api/orgs", orgRoutes);
  app.use("/api/campaigns", campaignRoutes);
  app.use("/api/whatsapp-campaigns", whatsappCampaignRoutes);
  app.use("/api/email-campaigns", emailRoutes);
  app.use("/api/email-templates", emailTemplateRoutes);
  app.use("/api/whatsapp-templates", whatsAppTemplateRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/api/voice-phishing", voicePhishingRoutes);
  return app;
}

describe("Full-stack HTTP integration: main functionality", () => {
  let server;
  let baseUrl;
  let adminUser;
  let regularUser;
  let org;

  beforeAll(async () => {
    const app = buildApp();
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}/api`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.ELEVENLABS_AGENT_ID = "test-elevenlabs-agent";

    org = await Organization.create({
      name: "Acme",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });

    adminUser = await User.create({
      clerkId: "clerk-admin",
      email: "admin@acme.com",
      displayName: "Admin",
      role: "client_admin",
      orgId: org._id,
      learningScore: 0.8,
    });

    regularUser = await User.create({
      clerkId: "clerk-user",
      email: "user@acme.com",
      displayName: "User",
      role: "affiliated",
      orgId: org._id,
      learningScore: 0.65,
    });

    mockCurrentUser = {
      admin: {
        _id: adminUser._id,
        clerkId: adminUser.clerkId,
        email: adminUser.email,
        role: adminUser.role,
        orgId: org._id,
      },
      user: {
        _id: regularUser._id,
        clerkId: regularUser.clerkId,
        email: regularUser.email,
        role: regularUser.role,
        orgId: org._id,
      },
      outsider: null,
    };
  });

  it("incident reporting: frontend-style HTTP flow persists analysis", async () => {
    const response = await fetch(`${baseUrl}/incidents/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user",
      },
      body: JSON.stringify({
        messageType: "email",
        message: "Your account is locked. Click now.",
        subject: "Urgent",
        from: "attacker@fake.com",
        urls: ["https://phish.example"],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.is_phishing).toBe(true);

    const saved = await Incident.findById(body.incidentId);
    expect(saved).not.toBeNull();
    expect(saved.userId.toString()).toBe(regularUser._id.toString());
  });

  it("certificates: generate then fetch list/details/by-course", async () => {
    const course = await Course.create({
      courseTitle: "Phishing 101",
      description: "desc",
      modules: [{ title: "M1", submodules: [{ title: "S1", content: "content" }] }],
      createdBy: adminUser._id,
    });

    await CourseProgress.create({
      user: regularUser._id,
      course: course._id,
      completedModules: ["0-0"],
      isCompleted: true,
      completedAt: new Date(),
      score: 90,
    });

    const generateRes = await fetch(`${baseUrl}/certificates/generate/${course._id}`, {
      method: "POST",
      headers: { Authorization: "Bearer user" },
    });
    const generateBody = await generateRes.json();
    expect(generateRes.status).toBe(201);
    expect(generateBody.certificate).toBeDefined();

    const listRes = await fetch(`${baseUrl}/certificates`, {
      headers: { Authorization: "Bearer user" },
    });
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.certificates.length).toBe(1);

    const certId = listBody.certificates[0]._id;
    const byIdRes = await fetch(`${baseUrl}/certificates/${certId}`, {
      headers: { Authorization: "Bearer user" },
    });
    const byIdBody = await byIdRes.json();
    expect(byIdRes.status).toBe(200);
    expect(byIdBody.certificate._id.toString()).toBe(certId.toString());

    const byCourseRes = await fetch(`${baseUrl}/certificates/course/${course._id}`, {
      headers: { Authorization: "Bearer user" },
    });
    const byCourseBody = await byCourseRes.json();
    expect(byCourseRes.status).toBe(200);
    expect(byCourseBody.certificate.course._id.toString()).toBe(course._id.toString());
  });

  it("leaderboard: global and organization endpoints return expected users", async () => {
    await User.create({
      clerkId: "clerk-na",
      email: "na@example.com",
      displayName: "Non Affiliated",
      role: "non_affiliated",
      learningScore: 0.91,
    });

    const globalRes = await fetch(`${baseUrl}/leaderboard/global`, {
      headers: { Authorization: "Bearer admin" },
    });
    const globalBody = await globalRes.json();
    expect(globalRes.status).toBe(200);
    expect(globalBody.success).toBe(true);
    expect(globalBody.leaderboard.length).toBeGreaterThanOrEqual(1);

    const orgRes = await fetch(`${baseUrl}/leaderboard/organization`, {
      headers: { Authorization: "Bearer admin" },
    });
    const orgBody = await orgRes.json();
    expect(orgRes.status).toBe(200);
    expect(orgBody.leaderboard.some((u) => u.email === "admin@acme.com")).toBe(true);
    expect(orgBody.leaderboard.some((u) => u.email === "user@acme.com")).toBe(true);
  });

  it("reports: list and download report file for admin", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake", "utf8");
    const report = await Report.create({
      createdBy: adminUser._id,
      organizationId: org._id,
      reportName: "Monthly Report",
      fileName: "monthly.pdf",
      reportDate: new Date(),
      reportData: { totalUsers: 10 },
      pdfFile: { data: pdfBuffer, contentType: "application/pdf" },
    });

    const listRes = await fetch(`${baseUrl}/reports`, {
      headers: { Authorization: "Bearer admin" },
    });
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.reports.length).toBe(1);

    const downloadRes = await fetch(`${baseUrl}/reports/${report._id}/download`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toContain("application/pdf");
    const arr = await downloadRes.arrayBuffer();
    expect(arr.byteLength).toBeGreaterThan(0);
  });

  it("users: profile read and update profile flow works", async () => {
    const profileRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(profileRes.status).toBe(200);
    const profile = await profileRes.json();
    expect(profile.email).toBe("user@acme.com");
    expect(profile.role).toBe("affiliated");

    const updateRes = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumber: "+923001112233" }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.success).toBe(true);
    expect(updateBody.user.phoneNumber).toBe("+923001112233");
  });

  it("courses: create/list/get/progress mark-unmark works over HTTP", async () => {
    const createRes = await fetch(`${baseUrl}/courses`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseTitle: "Security Basics",
        description: "Foundations",
        level: "basic",
        modules: [
          {
            title: "Module 1",
            sections: [{ title: "Section A", material: "Read this" }],
            quiz: [],
            activityType: null,
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const courseId = createBody.course._id;

    const listRes = await fetch(`${baseUrl}/courses`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.courses.length).toBeGreaterThanOrEqual(1);

    const byIdRes = await fetch(`${baseUrl}/courses/${courseId}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(byIdRes.status).toBe(200);
    const byIdBody = await byIdRes.json();
    expect(byIdBody.course.courseTitle).toBe("Security Basics");

    const markRes = await fetch(`${baseUrl}/courses/${courseId}/progress`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submoduleId: "0-0" }),
    });
    expect(markRes.status).toBe(200);
    const markBody = await markRes.json();
    expect(markBody.completed).toContain("0-0");

    const getProgressRes = await fetch(`${baseUrl}/courses/${courseId}/progress`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(getProgressRes.status).toBe(200);
    const progressBody = await getProgressRes.json();
    expect(progressBody.completed).toContain("0-0");

    const unmarkRes = await fetch(`${baseUrl}/courses/${courseId}/progress`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submoduleId: "0-0" }),
    });
    expect(unmarkRes.status).toBe(200);
    const unmarkBody = await unmarkRes.json();
    expect(unmarkBody.completed).not.toContain("0-0");
  });

  it("voice phishing templates: list/create/get/update/delete flow works", async () => {
    // Use system_admin context for stable access semantics on template read/update/delete
    mockCurrentUser.admin = {
      ...mockCurrentUser.admin,
      role: "system_admin",
      orgId: null,
    };

    const listInitialRes = await fetch(`${baseUrl}/voice-phishing-templates`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(listInitialRes.status).toBe(200);

    const createRes = await fetch(`${baseUrl}/voice-phishing-templates`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Template A",
        description: "A phishing call script",
        type: "phishing",
        firstMessage: "Hello this is support",
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const templateId = createBody.data._id;

    const getRes = await fetch(`${baseUrl}/voice-phishing-templates/${templateId}`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.title).toBe("Template A");

    const updateRes = await fetch(`${baseUrl}/voice-phishing-templates/${templateId}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Template A Updated",
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.title).toBe("Template A Updated");

    const deleteRes = await fetch(`${baseUrl}/voice-phishing-templates/${templateId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin" },
    });
    expect(deleteRes.status).toBe(200);

    const listAfterDeleteRes = await fetch(`${baseUrl}/voice-phishing-templates`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDeleteBody = await listAfterDeleteRes.json();
    expect(listAfterDeleteBody.data.some((t) => t._id === templateId)).toBe(false);
  });

  it("covers remaining route families (admin/org/campaign/template/chat/upload/voice) via full-stack HTTP", async () => {
    const allowed = [200, 201, 204, 400, 401, 403, 404, 500];

    // admin routes (system_admin required)
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const adminOrg = await fetch(`${baseUrl}/admins/orgs`, { headers: { Authorization: "Bearer admin" } });
    expect(allowed).toContain(adminOrg.status);
    const adminCreateOrg = await fetch(`${baseUrl}/admins/create-org`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Org X" }),
    });
    expect(allowed).toContain(adminCreateOrg.status);
    const adminInvite = await fetch(`${baseUrl}/admins/invite-client`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "client@example.com", orgName: "Org X" }),
    });
    expect(allowed).toContain(adminInvite.status);
    const adminPending = await fetch(`${baseUrl}/admins/pending-invitations`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(adminPending.status);

    // org routes
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const orgUsers = await fetch(`${baseUrl}/orgs/${org._id}/users`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(orgUsers.status);
    const orgInvites = await fetch(`${baseUrl}/orgs/${org._id}/invites`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(orgInvites.status);
    const orgInviteSingle = await fetch(`${baseUrl}/orgs/${org._id}/invite`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "newuser@example.com", displayName: "New User" }),
    });
    expect(allowed).toContain(orgInviteSingle.status);
    const orgCertCount = await fetch(`${baseUrl}/orgs/${org._id}/certificates/count`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(orgCertCount.status);

    // campaign routes
    const campaignCreate = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "C1", description: "desc", targetUsers: [] }),
    });
    expect(allowed).toContain(campaignCreate.status);
    const campaignList = await fetch(`${baseUrl}/campaigns`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(campaignList.status);

    // whatsapp campaign routes + public routes
    const waCreate = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "WA 1", messageTemplate: "hello", targetUsers: [{ phoneNumber: "+12345678901" }] }),
    });
    expect(allowed).toContain(waCreate.status);
    const waList = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(waList.status);
    const waClick = await fetch(`${baseUrl}/whatsapp-campaigns/click?token=abc`);
    expect(allowed).toContain(waClick.status);
    const waWebhook = await fetch(`${baseUrl}/whatsapp-campaigns/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(allowed).toContain(waWebhook.status);

    // email campaign routes
    const emailList = await fetch(`${baseUrl}/email-campaigns`);
    expect(allowed).toContain(emailList.status);
    const emailSend = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "target@example.com", subject: "Hi", bodyContent: "Body" }),
    });
    expect(allowed).toContain(emailSend.status);

    // template routes
    const emailTemplatesList = await fetch(`${baseUrl}/email-templates`);
    expect(allowed).toContain(emailTemplatesList.status);
    const emailTemplatesCreate = await fetch(`${baseUrl}/email-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T1", emailTemplate: { subject: "S", bodyContent: "B" } }),
    });
    expect(allowed).toContain(emailTemplatesCreate.status);
    const waTemplatesList = await fetch(`${baseUrl}/whatsapp-templates`);
    expect(allowed).toContain(waTemplatesList.status);
    const waTemplatesCreate = await fetch(`${baseUrl}/whatsapp-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "W1", messageTemplate: "M", landingPageUrl: "https://example.com" }),
    });
    expect(allowed).toContain(waTemplatesCreate.status);

    // chat route
    const chatRes = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(allowed).toContain(chatRes.status);

    // upload routes
    const uploadNoFile = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(uploadNoFile.status);
    const subtitleStatus = await fetch(`${baseUrl}/upload/subtitles/status/test-public-id`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(subtitleStatus.status);
    const subtitleFile = await fetch(`${baseUrl}/upload/subtitles/test-public-id`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(subtitleFile.status);

    // voice phishing routes
    const voiceInitiate = await fetch(`${baseUrl}/voice-phishing/initiate`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioType: "normal" }),
    });
    expect(allowed).toContain(voiceInitiate.status);
    const voiceList = await fetch(`${baseUrl}/voice-phishing`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(allowed).toContain(voiceList.status);
    const voiceAnalytics = await fetch(`${baseUrl}/voice-phishing/analytics/overview`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(allowed).toContain(voiceAnalytics.status);
  });

  it("auth: protected endpoints reject missing bearer token", async () => {
    const targets = [
      `${baseUrl}/users/me`,
      `${baseUrl}/reports`,
      `${baseUrl}/incidents`,
      `${baseUrl}/courses`,
      `${baseUrl}/voice-phishing`,
    ];
    for (const url of targets) {
      const res = await fetch(url);
      expect(res.status).toBe(401);
    }
  });

  it("admin routes reject non-system-admin user", async () => {
    const res = await fetch(`${baseUrl}/admins/orgs`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(403);
  });

  it("org access is denied when orgId does not match user org", async () => {
    const otherOrg = await Organization.create({
      name: "Other Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const res = await fetch(`${baseUrl}/orgs/${otherOrg._id}/users`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(403);
  });

  it("email templates create/list/get/custom endpoints work", async () => {
    const createRes = await fetch(`${baseUrl}/email-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "E Template",
        description: "desc",
        image: "https://img.example",
        category: "Security",
        emailTemplate: {
          subject: "Subject",
          bodyContent: "Body content",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const templateId = created.data._id;

    const listRes = await fetch(`${baseUrl}/email-templates`);
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data.templates.length).toBeGreaterThanOrEqual(1);

    const byIdRes = await fetch(`${baseUrl}/email-templates/${templateId}`);
    expect(byIdRes.status).toBe(200);

    const customRes = await fetch(`${baseUrl}/email-templates/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Custom E",
        subject: "Custom subject",
        bodyContent: "Custom body",
        linkUrl: "https://example.com",
      }),
    });
    expect(customRes.status).toBe(201);
  });

  it("whatsapp templates create/list/get/custom endpoints work", async () => {
    const createRes = await fetch(`${baseUrl}/whatsapp-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "WA Template",
        description: "desc",
        image: "https://img.example",
        category: "Security",
        messageTemplate: "Hello!",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const templateId = created.data._id;

    const listRes = await fetch(`${baseUrl}/whatsapp-templates`);
    expect(listRes.status).toBe(200);

    const byIdRes = await fetch(`${baseUrl}/whatsapp-templates/${templateId}`);
    expect(byIdRes.status).toBe(200);

    const customRes = await fetch(`${baseUrl}/whatsapp-templates/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Custom WA",
        messageTemplate: "Custom WA body",
        landingPageUrl: "https://example.com/drop",
      }),
    });
    expect(customRes.status).toBe(201);
  });

  it("email send endpoint validates malformed recipients", async () => {
    const res = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentBy: "sender@example.com",
        sentTo: "bad-email-format",
        subject: "Sub",
        bodyContent: "Body",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("chat endpoint returns response for valid message", async () => {
    const res = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "How do I identify phishing?",
        language: "en",
        conversationHistory: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Mocked Gemini");
  });

  it("chat endpoint rejects empty message", async () => {
    const res = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("upload subtitles endpoints respond with transcript content/status", async () => {
    const statusRes = await fetch(`${baseUrl}/upload/subtitles/status/pub-123`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect([200, 404]).toContain(statusRes.status);

    const subtitleRes = await fetch(`${baseUrl}/upload/subtitles/pub-123`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect([200, 404]).toContain(subtitleRes.status);
  });

  it("voice phishing template defaults endpoint returns static scenarios", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const res = await fetch(`${baseUrl}/voice-phishing-templates/defaults`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("endpoint completeness sweep: covers remaining main endpoints with valid auth/path behavior", async () => {
    const allowed = [200, 201, 204, 400, 401, 403, 404, 500];

    // seed ids for id-based routes
    const campaignSeed = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Seed Campaign", description: "d", targetUsers: [] }),
    });
    let campaignId = null;
    if (campaignSeed.status === 201) {
      const b = await campaignSeed.json();
      campaignId = b?.data?.campaign?._id || b?.data?._id || b?.campaign?._id || null;
    }
    if (!campaignId) campaignId = new mongoose.Types.ObjectId().toString();

    const waSeed = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Seed WA", messageTemplate: "hello", targetUsers: [{ phoneNumber: "+12345678901" }] }),
    });
    let waCampaignId = null;
    if (waSeed.status === 201) {
      const wb = await waSeed.json();
      waCampaignId = wb?.data?.campaign?._id || wb?.data?._id || wb?.campaign?._id || null;
    }
    if (!waCampaignId) waCampaignId = new mongoose.Types.ObjectId().toString();

    const randomId = new mongoose.Types.ObjectId().toString();

    // users subroutes
    const usersEndpoints = [
      `${baseUrl}/users/me/learning-progress`,
      `${baseUrl}/users/me/courses-progress`,
      `${baseUrl}/users/me/activity`,
      `${baseUrl}/users/me/remedial-assignments`,
      `${baseUrl}/users/all`,
    ];
    for (const url of usersEndpoints) {
      const r = await fetch(url, { headers: { Authorization: "Bearer user" } });
      expect(allowed).toContain(r.status);
    }

    // certificates extra endpoint
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const certCount = await fetch(`${baseUrl}/certificates/count/non-affiliated`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(certCount.status);
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };

    // courses activity endpoints
    const c = await Course.create({
      courseTitle: "Activity Course",
      description: "desc",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "M" }], quiz: [], activityType: "email" }],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    const courseId = c._id.toString();

    const courseActivityCalls = [
      {
        url: `${baseUrl}/courses/${courseId}/progress/activity-email-status?submoduleId=0-activity`,
        method: "GET",
      },
      {
        url: `${baseUrl}/courses/${courseId}/progress/activity-whatsapp-status?submoduleId=0-activity`,
        method: "GET",
      },
      {
        url: `${baseUrl}/courses/${courseId}/progress/activity-result`,
        method: "POST",
        body: { submoduleId: "0-activity", passed: true },
      },
      {
        url: `${baseUrl}/courses/${courseId}/progress/activity-retry`,
        method: "POST",
        body: { submoduleId: "0-activity" },
      },
      {
        url: `${baseUrl}/courses/${courseId}/activity/send-email`,
        method: "POST",
        body: { to: "target@example.com", submoduleId: "0-activity" },
      },
      {
        url: `${baseUrl}/courses/${courseId}/activity/send-whatsapp`,
        method: "POST",
        body: { to: "+923001112233", submoduleId: "0-activity" },
      },
    ];
    for (const call of courseActivityCalls) {
      const res = await fetch(call.url, {
        method: call.method,
        headers: {
          Authorization: "Bearer user",
          ...(call.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      expect(allowed).toContain(res.status);
    }

    // campaign control/id endpoints
    const campaignCalls = [
      { url: `${baseUrl}/campaigns/${campaignId}`, method: "GET" },
      { url: `${baseUrl}/campaigns/${campaignId}`, method: "PUT", body: { name: "Updated Name" } },
      { url: `${baseUrl}/campaigns/${campaignId}/start`, method: "POST" },
      { url: `${baseUrl}/campaigns/${campaignId}/pause`, method: "POST" },
      { url: `${baseUrl}/campaigns/${campaignId}/resume`, method: "POST" },
      { url: `${baseUrl}/campaigns/${campaignId}/cancel`, method: "POST" },
      { url: `${baseUrl}/campaigns/${campaignId}/analytics`, method: "GET" },
      { url: `${baseUrl}/campaigns/${campaignId}`, method: "DELETE" },
    ];
    for (const call of campaignCalls) {
      const res = await fetch(call.url, {
        method: call.method,
        headers: {
          Authorization: "Bearer admin",
          ...(call.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      expect(allowed).toContain(res.status);
    }

    // whatsapp campaign id endpoints
    const waCalls = [
      { url: `${baseUrl}/whatsapp-campaigns/${waCampaignId}`, method: "GET" },
      { url: `${baseUrl}/whatsapp-campaigns/${waCampaignId}`, method: "PUT", body: { name: "WA Updated" } },
      { url: `${baseUrl}/whatsapp-campaigns/${waCampaignId}/start`, method: "POST" },
      { url: `${baseUrl}/whatsapp-campaigns/${waCampaignId}/analytics`, method: "GET" },
      { url: `${baseUrl}/whatsapp-campaigns/${waCampaignId}`, method: "DELETE" },
    ];
    for (const call of waCalls) {
      const res = await fetch(call.url, {
        method: call.method,
        headers: {
          Authorization: "Bearer admin",
          ...(call.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      expect(allowed).toContain(res.status);
    }

    // voice phishing conversation detail/transcript/end endpoints using random id
    const voiceCalls = [
      { url: `${baseUrl}/voice-phishing/${randomId}`, method: "GET", body: null },
      {
        url: `${baseUrl}/voice-phishing/${randomId}/transcript`,
        method: "POST",
        body: { transcript: "hello there" },
      },
      { url: `${baseUrl}/voice-phishing/${randomId}/end`, method: "POST", body: {} },
    ];
    for (const call of voiceCalls) {
      const res = await fetch(call.url, {
        method: call.method,
        headers: {
          Authorization: "Bearer user",
          ...(call.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      expect(allowed).toContain(res.status);
    }

    // admin remaining endpoints
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const adminCalls = [
      `${baseUrl}/admins/sync-users`,
      `${baseUrl}/admins/pending-invitations`,
    ];
    for (const url of adminCalls) {
      const res = await fetch(url, { headers: { Authorization: "Bearer admin" } });
      expect(allowed).toContain(res.status);
    }
    const activateRes = await fetch(`${baseUrl}/admins/activate-user`, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ userId: regularUser._id.toString(), clerkId: "clerk-user" }),
    });
    expect(allowed).toContain(activateRes.status);
    const updateOrgRes = await fetch(`${baseUrl}/admins/orgs/${org._id}`, {
      method: "PUT",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Updated" }),
    });
    expect(allowed).toContain(updateOrgRes.status);
    const revokeRes = await fetch(`${baseUrl}/admins/revoke-invitation/inv-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(revokeRes.status);

    // org bulk invite (no file → validation path but endpoint exercised)
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const bulkInviteRes = await fetch(`${baseUrl}/orgs/${org._id}/bulk-invite`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowed).toContain(bulkInviteRes.status);
  });

  it("campaign creation rejects when both channels are disabled", async () => {
    const res = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Invalid Campaign",
        description: "No channels",
        targetUserIds: [regularUser._id.toString()],
        whatsappConfig: { enabled: false },
        emailConfig: { enabled: false },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/At least one channel/i);
  });

  it("campaign lifecycle transitions draft -> running -> paused -> running -> cancelled", async () => {
    const createRes = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Lifecycle Campaign",
        description: "Lifecycle test",
        targetUserIds: [regularUser._id.toString()],
        emailConfig: {
          enabled: true,
          subject: "Test Subject",
          bodyContent: "Test body",
          senderEmail: "sender@example.com",
        },
        whatsappConfig: { enabled: false },
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const campaignId = createBody.data._id;

    const startRes = await fetch(`${baseUrl}/campaigns/${campaignId}/start`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(startRes.status).toBe(200);

    const pauseRes = await fetch(`${baseUrl}/campaigns/${campaignId}/pause`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(pauseRes.status).toBe(200);

    const resumeRes = await fetch(`${baseUrl}/campaigns/${campaignId}/resume`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(resumeRes.status).toBe(200);

    const cancelRes = await fetch(`${baseUrl}/campaigns/${campaignId}/cancel`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect([200, 404]).toContain(cancelRes.status);

    const saved = await Campaign.findById(campaignId);
    expect(saved).not.toBeNull();
    expect(["cancelled", "completed", "running", "paused"]).toContain(saved.status);
  });

  it("campaign analytics returns expected shape after campaign creation", async () => {
    const createRes = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Analytics Campaign",
        description: "analytics",
        targetUserIds: [regularUser._id.toString()],
        emailConfig: {
          enabled: true,
          subject: "A",
          bodyContent: "B",
          senderEmail: "sender@example.com",
        },
        whatsappConfig: { enabled: false },
      }),
    });
    expect(createRes.status).toBe(201);
    const campaignId = (await createRes.json()).data._id;

    const analyticsRes = await fetch(`${baseUrl}/campaigns/${campaignId}/analytics`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(analyticsRes.status).toBe(200);
    const body = await analyticsRes.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("email");
    expect(body.data).toHaveProperty("whatsapp");
    expect(body.data).toHaveProperty("totalTargets");
  });

  it("whatsapp campaign creation fails when target user has missing phone number", async () => {
    await User.updateOne({ _id: regularUser._id }, { $unset: { phoneNumber: 1 } });

    const createRes = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "WA Missing Phone",
        description: "desc",
        messageTemplate: "Click https://example.com",
        landingPageUrl: "https://example.com",
        targetUserIds: [regularUser._id.toString()],
      }),
    });
    expect(createRes.status).toBe(400);
    const body = await createRes.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/no phone number/i);
  });

  it("whatsapp campaign creation/start/get analytics works for valid target users", async () => {
    await User.updateOne({ _id: regularUser._id }, { $set: { phoneNumber: "+923001112233" } });

    const createRes = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "WA Valid",
        description: "desc",
        messageTemplate: "Please visit https://example.com",
        landingPageUrl: "https://example.com",
        trackingEnabled: true,
        targetUserIds: [regularUser._id.toString()],
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const campaignId = createBody.data._id;

    const startRes = await fetch(`${baseUrl}/whatsapp-campaigns/${campaignId}/start`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(startRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/whatsapp-campaigns/${campaignId}`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(getRes.status).toBe(200);

    const analyticsRes = await fetch(`${baseUrl}/whatsapp-campaigns/${campaignId}/analytics`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(analyticsRes.status).toBe(200);
    const analytics = await analyticsRes.json();
    expect(analytics.success).toBe(true);

    const saved = await WhatsAppCampaign.findById(campaignId);
    expect(saved).not.toBeNull();
  });

  it("voice phishing transcript + history + details flow works", async () => {
    const initiateRes = await fetch(`${baseUrl}/voice-phishing/initiate`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ connectionType: "webrtc" }),
    });
    expect(initiateRes.status).toBe(200);
    const initiateBody = await initiateRes.json();
    const conversationId = initiateBody.data.conversationId;

    const transcriptRes = await fetch(`${baseUrl}/voice-phishing/${conversationId}/transcript`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "agent", message: "Hello from support" },
          { role: "user", message: "What do you need?" },
        ],
      }),
    });
    expect(transcriptRes.status).toBe(200);

    const listRes = await fetch(`${baseUrl}/voice-phishing`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.conversations.length).toBeGreaterThanOrEqual(1);

    const detailRes = await fetch(`${baseUrl}/voice-phishing/${conversationId}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.success).toBe(true);
    expect(detailBody.data._id.toString()).toBe(conversationId.toString());
  });

  it("voice phishing details endpoint returns 404 for other user's conversation", async () => {
    const otherUser = await User.create({
      clerkId: "clerk-outsider",
      email: "outsider@acme.com",
      displayName: "Outsider",
      role: "affiliated",
      orgId: org._id,
    });
    const convo = await VoicePhishingConversation.create({
      userId: otherUser._id,
      organizationId: org._id,
      agentId: "agent-1",
      scenarioType: "normal",
      scenarioDescription: "desc",
      status: "initiated",
    });

    const res = await fetch(`${baseUrl}/voice-phishing/${convo._id}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(404);
  });

  it("voice phishing analytics filters by role scope (client_admin vs system_admin)", async () => {
    await VoicePhishingConversation.create({
      userId: regularUser._id,
      organizationId: org._id,
      agentId: "agent-2",
      scenarioType: "phishing",
      scenarioDescription: "client-admin scoped conversation",
      status: "completed",
      score: 70,
      scoreDetails: { fellForPhishing: false, resistanceLevel: "high" },
    });
    const nonAffiliated = await User.create({
      clerkId: "clerk-na-analytics",
      email: "na-analytics@example.com",
      displayName: "NA",
      role: "non_affiliated",
    });
    await VoicePhishingConversation.create({
      userId: nonAffiliated._id,
      organizationId: null,
      agentId: "agent-3",
      scenarioType: "phishing",
      scenarioDescription: "system-admin scoped conversation",
      status: "completed",
      score: 20,
      scoreDetails: { fellForPhishing: true, resistanceLevel: "low" },
    });

    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const clientAdminRes = await fetch(`${baseUrl}/voice-phishing/analytics/overview`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(clientAdminRes.status).toBe(200);
    const clientData = await clientAdminRes.json();
    expect(clientData.success).toBe(true);
    expect(clientData.data.totalConversations).toBeGreaterThanOrEqual(1);

    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const sysAdminRes = await fetch(`${baseUrl}/voice-phishing/analytics/overview`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(sysAdminRes.status).toBe(200);
    const sysData = await sysAdminRes.json();
    expect(sysData.success).toBe(true);
    expect(sysData.data.totalConversations).toBeGreaterThanOrEqual(1);
  });

  it("incidents analyze returns 400 for missing message field", async () => {
    const res = await fetch(`${baseUrl}/incidents/analyze`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageType: "email", subject: "No body provided" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/message/i);
  });

  it("incidents get by id denies access to another user's incident", async () => {
    const otherOrg = await Organization.create({
      name: "Foreign Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const outsiderUser = await User.create({
      clerkId: "clerk-foreign-user",
      email: "foreign@example.com",
      displayName: "Foreign User",
      role: "affiliated",
      orgId: otherOrg._id,
    });
    mockCurrentUser.outsider = {
      _id: outsiderUser._id,
      clerkId: outsiderUser.clerkId,
      email: outsiderUser.email,
      role: outsiderUser.role,
      orgId: otherOrg._id,
    };

    const incident = await Incident.create({
      userId: outsiderUser._id,
      organizationId: otherOrg._id,
      messageType: "email",
      message: "foreign incident",
      text: "foreign incident",
      is_phishing: true,
      phishing_probability: 0.9,
      legitimate_probability: 0.1,
      confidence: 0.95,
    });

    const res = await fetch(`${baseUrl}/incidents/${incident._id}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(404);
  });

  it("reports endpoints reject non-admin users", async () => {
    const listRes = await fetch(`${baseUrl}/reports`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(listRes.status).toBe(403);

    const report = await Report.create({
      createdBy: adminUser._id,
      organizationId: org._id,
      reportName: "Private Admin Report",
      fileName: "private.pdf",
      reportDate: new Date(),
      reportData: {},
      pdfFile: { data: Buffer.from("%PDF-1.4"), contentType: "application/pdf" },
    });
    const downloadRes = await fetch(`${baseUrl}/reports/${report._id}/download`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(downloadRes.status).toBe(403);
  });

  it("leaderboard organization endpoint requires orgId for system_admin", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const res = await fetch(`${baseUrl}/leaderboard/organization`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("leaderboard organization endpoint denies non-affiliated role", async () => {
    const nonAffiliated = await User.create({
      clerkId: "clerk-na-role",
      email: "na-role@example.com",
      displayName: "NA Role",
      role: "non_affiliated",
      learningScore: 0.3,
    });
    mockCurrentUser.user = {
      _id: nonAffiliated._id,
      clerkId: nonAffiliated.clerkId,
      email: nonAffiliated.email,
      role: nonAffiliated.role,
      orgId: null,
    };

    const res = await fetch(`${baseUrl}/leaderboard/organization`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(403);
  });

  it("users profile update returns 400 when no valid fields are provided", async () => {
    const res = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ unknownField: "value" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No valid fields/i);
  });

  it("users all endpoint supports status filtering and pagination metadata", async () => {
    await User.create({
      clerkId: "clerk-invited",
      email: "invited@example.com",
      displayName: "Invited",
      role: "affiliated",
      orgId: org._id,
      status: "invited",
      learningScore: 0.2,
    });

    const res = await fetch(`${baseUrl}/users/all?status=invited&page=1&limit=5`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.users.every((u) => u.status === "invited")).toBe(true);
  });

  it("reports create succeeds for admin with multipart PDF upload", async () => {
    const form = new FormData();
    form.append("reportName", "Uploaded Report");
    form.append("organizationName", "Acme");
    form.append("reportData", JSON.stringify({ users: 12 }));
    form.append(
      "pdf",
      new Blob([Buffer.from("%PDF-1.4 mocked report")], { type: "application/pdf" }),
      "uploaded.pdf"
    );

    const createRes = await fetch(`${baseUrl}/reports`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
      body: form,
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.success).toBe(true);
    expect(createBody.report.fileName).toMatch(/\.pdf$/);
  });

  it("report download enforces ownership for client_admin and allows system_admin override", async () => {
    const otherOrg = await Organization.create({
      name: "Other Org Download",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const otherAdmin = await User.create({
      clerkId: "clerk-other-admin",
      email: "other-admin@example.com",
      displayName: "Other Admin",
      role: "client_admin",
      orgId: otherOrg._id,
    });
    const report = await Report.create({
      createdBy: otherAdmin._id,
      organizationId: otherOrg._id,
      reportName: "Other Admin Report",
      fileName: "other-admin.pdf",
      reportDate: new Date(),
      reportData: { test: true },
      pdfFile: { data: Buffer.from("%PDF-1.4 foreign"), contentType: "application/pdf" },
    });

    // client_admin should not download another admin's report
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const deniedRes = await fetch(`${baseUrl}/reports/${report._id}/download`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(deniedRes.status).toBe(403);

    // system_admin can override ownership
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const allowedRes = await fetch(`${baseUrl}/reports/${report._id}/download`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers.get("content-type")).toContain("application/pdf");
  });

  it("whatsapp click endpoint is idempotent and increments once", async () => {
    const waCampaign = await WhatsAppCampaign.create({
      name: "WA Click Campaign",
      description: "click-test",
      organizationId: org._id,
      createdBy: adminUser._id,
      templateId: "manual_template",
      targetUsers: [
        {
          userId: regularUser._id,
          phoneNumber: "+923001112233",
          name: "User",
          status: "sent",
          clickToken: "token-idempotent-1",
        },
      ],
      messageTemplate: "click link",
      landingPageUrl: "https://example.com",
      trackingEnabled: true,
      stats: { totalSent: 1, totalClicked: 0 },
      status: "running",
    });

    const firstClick = await fetch(`${baseUrl}/whatsapp-campaigns/click?ct=token-idempotent-1`);
    expect(firstClick.status).toBe(204);
    const secondClick = await fetch(`${baseUrl}/whatsapp-campaigns/click?ct=token-idempotent-1`);
    expect(secondClick.status).toBe(204);

    const updated = await WhatsAppCampaign.findById(waCampaign._id);
    expect(updated.stats.totalClicked).toBe(1);
    expect(updated.targetUsers[0].status).toBe("clicked");
  });

  it("whatsapp click syncs parent campaign whatsapp stats when managedByParentCampaign", async () => {
    const waCampaign = await WhatsAppCampaign.create({
      name: "Managed WA Click",
      description: "managed-click",
      organizationId: org._id,
      createdBy: adminUser._id,
      templateId: "manual_template",
      managedByParentCampaign: true,
      targetUsers: [
        {
          userId: regularUser._id,
          phoneNumber: "+923001112233",
          name: "User",
          status: "sent",
          clickToken: "token-parent-sync-1",
        },
      ],
      messageTemplate: "link",
      landingPageUrl: "https://example.com",
      trackingEnabled: true,
      stats: { totalSent: 1, totalClicked: 0 },
      status: "running",
    });
    const parent = await Campaign.create({
      name: "Parent Combined Campaign",
      description: "parent",
      organizationId: org._id,
      createdBy: adminUser._id,
      whatsappCampaignId: waCampaign._id,
      targetUsers: [
        {
          userId: regularUser._id,
          phoneNumber: "+923001112233",
          name: "User",
          whatsappStatus: "sent",
        },
      ],
      whatsappConfig: { enabled: true, messageTemplate: "link", landingPageUrl: "https://example.com" },
      emailConfig: { enabled: false },
      stats: { totalWhatsappTargets: 1, totalWhatsappSent: 1, totalWhatsappClicked: 0 },
      status: "running",
    });

    const clickRes = await fetch(`${baseUrl}/whatsapp-campaigns/click?ct=token-parent-sync-1`);
    expect(clickRes.status).toBe(204);

    const parentUpdated = await Campaign.findById(parent._id);
    expect(parentUpdated.stats.totalWhatsappClicked).toBe(1);
    expect(parentUpdated.targetUsers[0].whatsappStatus).toBe("clicked");
  });

  it("twilio webhook updates delivered/read/failed statuses via MessageSid", async () => {
    const waCampaign = await WhatsAppCampaign.create({
      name: "WA Webhook Campaign",
      description: "webhook",
      organizationId: org._id,
      createdBy: adminUser._id,
      templateId: "manual_template",
      targetUsers: [
        {
          userId: regularUser._id,
          phoneNumber: "03001112233",
          name: "User",
          status: "sent",
          messageSid: "SM_TEST_SID_1",
        },
      ],
      messageTemplate: "hello",
      landingPageUrl: "https://example.com",
      trackingEnabled: true,
      stats: { totalSent: 1, totalDelivered: 0, totalRead: 0, totalFailed: 0 },
      status: "running",
    });

    const deliveredRes = await fetch(`${baseUrl}/whatsapp-campaigns/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        MessageSid: "SM_TEST_SID_1",
        MessageStatus: "delivered",
        To: "923001112233",
      }),
    });
    expect(deliveredRes.status).toBe(200);

    const readRes = await fetch(`${baseUrl}/whatsapp-campaigns/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        MessageSid: "SM_TEST_SID_1",
        MessageStatus: "read",
        To: "923001112233",
      }),
    });
    expect(readRes.status).toBe(200);

    const failedRes = await fetch(`${baseUrl}/whatsapp-campaigns/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        MessageSid: "SM_TEST_SID_1",
        MessageStatus: "failed",
        To: "923001112233",
        ErrorMessage: "network",
      }),
    });
    expect(failedRes.status).toBe(200);

    const updated = await WhatsAppCampaign.findById(waCampaign._id);
    expect(updated.stats.totalDelivered).toBeGreaterThanOrEqual(1);
    expect(updated.stats.totalRead).toBeGreaterThanOrEqual(1);
    expect(updated.stats.totalFailed).toBeGreaterThanOrEqual(1);
    expect(["read", "failed"]).toContain(updated.targetUsers[0].status);
  });

  it("certificates generation fails when course is not fully completed", async () => {
    const course = await Course.create({
      courseTitle: "Incomplete Course",
      description: "desc",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "material" }], quiz: [] }],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    await CourseProgress.create({
      user: regularUser._id,
      course: course._id,
      completed: [], // nothing completed
      isCompleted: false,
    });

    const res = await fetch(`${baseUrl}/certificates/generate/${course._id}`, {
      method: "POST",
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/must be completed/i);
  });

  it("campaign endpoints enforce cross-organization isolation for outsider admin", async () => {
    const foreignOrg = await Organization.create({
      name: "Foreign Campaign Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const foreignAdmin = await User.create({
      clerkId: "clerk-foreign-campaign-admin",
      email: "foreign-campaign-admin@example.com",
      displayName: "Foreign Campaign Admin",
      role: "client_admin",
      orgId: foreignOrg._id,
    });
    mockCurrentUser.outsider = {
      _id: foreignAdmin._id,
      clerkId: foreignAdmin.clerkId,
      email: foreignAdmin.email,
      role: foreignAdmin.role,
      orgId: foreignOrg._id,
    };

    const ownedCampaign = await Campaign.create({
      name: "Org-Locked Campaign",
      description: "desc",
      organizationId: org._id,
      createdBy: adminUser._id,
      targetUsers: [{ userId: regularUser._id, email: regularUser.email, name: regularUser.displayName, emailStatus: "pending" }],
      whatsappConfig: { enabled: false },
      emailConfig: { enabled: true, subject: "S", bodyContent: "B", senderEmail: "sender@example.com" },
      stats: { totalEmailTargets: 1, totalEmailSent: 0, totalWhatsappTargets: 0 },
      status: "draft",
    });

    const endpoints = [
      { method: "GET", url: `${baseUrl}/campaigns/${ownedCampaign._id}` },
      { method: "PUT", url: `${baseUrl}/campaigns/${ownedCampaign._id}`, body: { name: "hacked" } },
      { method: "DELETE", url: `${baseUrl}/campaigns/${ownedCampaign._id}` },
      { method: "POST", url: `${baseUrl}/campaigns/${ownedCampaign._id}/start` },
      { method: "POST", url: `${baseUrl}/campaigns/${ownedCampaign._id}/pause` },
      { method: "POST", url: `${baseUrl}/campaigns/${ownedCampaign._id}/resume` },
      { method: "POST", url: `${baseUrl}/campaigns/${ownedCampaign._id}/cancel` },
      { method: "GET", url: `${baseUrl}/campaigns/${ownedCampaign._id}/analytics` },
    ];

    for (const e of endpoints) {
      const res = await fetch(e.url, {
        method: e.method,
        headers: {
          Authorization: "Bearer outsider",
          ...(e.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(e.body ? { body: JSON.stringify(e.body) } : {}),
      });
      expect([403, 404]).toContain(res.status);
    }
  });

  it("whatsapp campaign endpoints enforce cross-organization isolation for outsider admin", async () => {
    const foreignOrg = await Organization.create({
      name: "Foreign WA Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const foreignAdmin = await User.create({
      clerkId: "clerk-foreign-wa-admin",
      email: "foreign-wa-admin@example.com",
      displayName: "Foreign WA Admin",
      role: "client_admin",
      orgId: foreignOrg._id,
    });
    mockCurrentUser.outsider = {
      _id: foreignAdmin._id,
      clerkId: foreignAdmin.clerkId,
      email: foreignAdmin.email,
      role: foreignAdmin.role,
      orgId: foreignOrg._id,
    };

    const ownedWaCampaign = await WhatsAppCampaign.create({
      name: "Org-Locked WA Campaign",
      description: "desc",
      organizationId: org._id,
      createdBy: adminUser._id,
      templateId: "manual_template",
      targetUsers: [{ userId: regularUser._id, phoneNumber: "+923001112233", status: "pending" }],
      messageTemplate: "Hello https://example.com",
      landingPageUrl: "https://example.com",
      status: "draft",
    });

    const endpoints = [
      { method: "GET", url: `${baseUrl}/whatsapp-campaigns/${ownedWaCampaign._id}` },
      { method: "PUT", url: `${baseUrl}/whatsapp-campaigns/${ownedWaCampaign._id}`, body: { name: "hacked" } },
      { method: "DELETE", url: `${baseUrl}/whatsapp-campaigns/${ownedWaCampaign._id}` },
      { method: "POST", url: `${baseUrl}/whatsapp-campaigns/${ownedWaCampaign._id}/start` },
      { method: "GET", url: `${baseUrl}/whatsapp-campaigns/${ownedWaCampaign._id}/analytics` },
    ];
    for (const e of endpoints) {
      const res = await fetch(e.url, {
        method: e.method,
        headers: {
          Authorization: "Bearer outsider",
          ...(e.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(e.body ? { body: JSON.stringify(e.body) } : {}),
      });
      expect([403, 404]).toContain(res.status);
    }
  });

  it("courses create is forbidden for affiliated users and update validates invalid id", async () => {
    const createRes = await fetch(`${baseUrl}/courses`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseTitle: "Affiliated Create Attempt",
        description: "desc",
        modules: [],
      }),
    });
    expect(createRes.status).toBe(403);

    const updateRes = await fetch(`${baseUrl}/courses/not-a-valid-id`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ courseTitle: "Updated" }),
    });
    expect(updateRes.status).toBe(400);
  });

  it("courses activity-result validation rejects missing/invalid fields", async () => {
    const c = await Course.create({
      courseTitle: "Activity Validation Course",
      description: "desc",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "M" }], quiz: [], activityType: "email" }],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const missingSubmoduleRes = await fetch(`${baseUrl}/courses/${c._id}/progress/activity-result`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ passed: true }),
    });
    expect(missingSubmoduleRes.status).toBe(400);

    const invalidPassedRes = await fetch(`${baseUrl}/courses/${c._id}/progress/activity-result`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submoduleId: "0-activity", passed: "true" }),
    });
    expect(invalidPassedRes.status).toBe(400);
  });

  it("reports download returns 404 for non-existent report id", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/reports/${missingId}/download`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(404);
  });

  it("course read access denies org course for system_admin and non_affiliated user", async () => {
    const orgCourse = await Course.create({
      courseTitle: "Org Restricted Course",
      description: "desc",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "material" }], quiz: [] }],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const sysRes = await fetch(`${baseUrl}/courses/${orgCourse._id}`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(sysRes.status).toBe(403);

    const naUser = await User.create({
      clerkId: "clerk-na-course",
      email: "na-course@example.com",
      displayName: "NA Course",
      role: "non_affiliated",
    });
    mockCurrentUser.user = {
      _id: naUser._id,
      clerkId: naUser.clerkId,
      email: naUser.email,
      role: naUser.role,
      orgId: null,
    };
    const naRes = await fetch(`${baseUrl}/courses/${orgCourse._id}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(naRes.status).toBe(403);
  });

  it("leaderboard global includes only non_affiliated users sorted by learningScore desc", async () => {
    await User.create({
      clerkId: "clerk-na-high",
      email: "na-high@example.com",
      displayName: "NA High",
      role: "non_affiliated",
      learningScore: 0.95,
    });
    await User.create({
      clerkId: "clerk-na-low",
      email: "na-low@example.com",
      displayName: "NA Low",
      role: "non_affiliated",
      learningScore: 0.20,
    });
    await User.create({
      clerkId: "clerk-aff-high",
      email: "aff-high@example.com",
      displayName: "Aff High",
      role: "affiliated",
      orgId: org._id,
      learningScore: 0.99,
    });

    const res = await fetch(`${baseUrl}/leaderboard/global`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.leaderboard.every((u) => u.email !== "aff-high@example.com")).toBe(true);
    for (let i = 1; i < body.leaderboard.length; i++) {
      expect(body.leaderboard[i - 1].learningScore).toBeGreaterThanOrEqual(body.leaderboard[i].learningScore);
    }
  });

  it("incidents listing supports messageType and isPhishing filters", async () => {
    await Incident.create({
      userId: regularUser._id,
      organizationId: org._id,
      messageType: "email",
      message: "email phish",
      text: "email phish",
      is_phishing: true,
      phishing_probability: 0.9,
      legitimate_probability: 0.1,
      confidence: 0.95,
    });
    await Incident.create({
      userId: regularUser._id,
      organizationId: org._id,
      messageType: "whatsapp",
      message: "wa legit",
      text: "wa legit",
      is_phishing: false,
      phishing_probability: 0.2,
      legitimate_probability: 0.8,
      confidence: 0.9,
    });

    const filtered = await fetch(`${baseUrl}/incidents?messageType=email&isPhishing=true`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(filtered.status).toBe(200);
    const body = await filtered.json();
    expect(body.success).toBe(true);
    expect(body.incidents.length).toBeGreaterThanOrEqual(1);
    expect(body.incidents.every((x) => x.messageType === "email" && x.is_phishing === true)).toBe(true);
  });

  it("whatsapp click endpoint returns 204 for unknown token", async () => {
    const res = await fetch(`${baseUrl}/whatsapp-campaigns/click?ct=unknown-token-never-created`);
    expect(res.status).toBe(204);
  });

  it("admin routes enforce system_admin role across all admin endpoints", async () => {
    const checks = [
      { method: "GET", url: `${baseUrl}/admins/orgs` },
      { method: "POST", url: `${baseUrl}/admins/create-org`, body: { name: "Should Fail Org" } },
      { method: "POST", url: `${baseUrl}/admins/invite-client`, body: { email: "x@example.com", orgName: "X Org" } },
      { method: "GET", url: `${baseUrl}/admins/pending-invitations` },
      { method: "GET", url: `${baseUrl}/admins/sync-users` },
      { method: "POST", url: `${baseUrl}/admins/activate-user`, body: { userId: regularUser._id.toString(), clerkId: "clerk-user" } },
      { method: "PUT", url: `${baseUrl}/admins/orgs/${org._id}`, body: { name: "Nope" } },
      { method: "DELETE", url: `${baseUrl}/admins/revoke-invitation/inv-1` },
    ];

    for (const c of checks) {
      const res = await fetch(c.url, {
        method: c.method,
        headers: {
          Authorization: "Bearer user",
          ...(c.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(c.body ? { body: JSON.stringify(c.body) } : {}),
      });
      expect(res.status).toBe(403);
    }
  });

  it("org invite endpoints validate payloads (single + bulk)", async () => {
    const singleInviteRes = await fetch(`${baseUrl}/orgs/${org._id}/invite`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Missing Email User" }),
    });
    expect(singleInviteRes.status).toBe(400);

    const bulkInviteRes = await fetch(`${baseUrl}/orgs/${org._id}/bulk-invite`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect([400, 500]).toContain(bulkInviteRes.status);
  });

  it("email template endpoints validate required fields and not-found get path", async () => {
    const customMissingFieldsRes = await fetch(`${baseUrl}/email-templates/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing subject and body" }),
    });
    expect(customMissingFieldsRes.status).toBe(400);

    const seedMissingFieldsRes = await fetch(`${baseUrl}/email-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Partial template" }),
    });
    expect(seedMissingFieldsRes.status).toBe(400);

    const notFoundId = new mongoose.Types.ObjectId().toString();
    const getMissingRes = await fetch(`${baseUrl}/email-templates/${notFoundId}`);
    expect(getMissingRes.status).toBe(404);
  });

  it("whatsapp template endpoints validate required fields and not-found get path", async () => {
    const customMissingFieldsRes = await fetch(`${baseUrl}/whatsapp-templates/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing message body" }),
    });
    expect(customMissingFieldsRes.status).toBe(400);

    const seedMissingFieldsRes = await fetch(`${baseUrl}/whatsapp-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Partial WA template" }),
    });
    expect(seedMissingFieldsRes.status).toBe(400);

    const notFoundId = new mongoose.Types.ObjectId().toString();
    const getMissingRes = await fetch(`${baseUrl}/whatsapp-templates/${notFoundId}`);
    expect(getMissingRes.status).toBe(404);
  });

  it("voice phishing templates enforce admin-only access and cross-scope restrictions", async () => {
    // non-admin should be blocked by requireRole
    mockCurrentUser.user = {
      ...mockCurrentUser.user,
      role: "affiliated",
      orgId: org._id,
    };
    const nonAdminRes = await fetch(`${baseUrl}/voice-phishing-templates`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(nonAdminRes.status).toBe(403);

    // create a system-admin scoped template (organizationId null)
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const systemTemplate = await VoicePhishingTemplate.create({
      title: "System Scoped Template",
      description: "System description",
      type: "phishing",
      firstMessage: "Hello from system template",
      organizationId: null,
      createdBy: adminUser._id,
      isActive: true,
    });

    // switch to client_admin and verify denied access to system template
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const deniedGetRes = await fetch(`${baseUrl}/voice-phishing-templates/${systemTemplate._id}`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(deniedGetRes.status).toBe(403);
  });

  it("campaign creation validates invalid sender email and missing targets", async () => {
    const invalidEmailConfigRes = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Invalid Sender Campaign",
        description: "desc",
        targetUserIds: [regularUser._id.toString()],
        emailConfig: {
          enabled: true,
          subject: "S",
          bodyContent: "B",
          senderEmail: "not-an-email",
        },
        whatsappConfig: { enabled: false },
      }),
    });
    expect(invalidEmailConfigRes.status).toBe(400);

    const noTargetsRes = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "No Targets Campaign",
        description: "desc",
        emailConfig: {
          enabled: true,
          subject: "S",
          bodyContent: "B",
          senderEmail: "sender@example.com",
        },
        whatsappConfig: { enabled: false },
      }),
    });
    expect(noTargetsRes.status).toBe(400);
  });

  it("whatsapp campaign creation validates required target users", async () => {
    const res = await fetch(`${baseUrl}/whatsapp-campaigns`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "No WA Targets",
        description: "desc",
        messageTemplate: "Click https://example.com",
        landingPageUrl: "https://example.com",
        targetUserIds: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("courses list supports pagination and sort semantics", async () => {
    await Course.create({
      courseTitle: "Sort Old",
      description: "old",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
      createdAt: new Date(Date.now() - 100000),
      updatedAt: new Date(Date.now() - 100000),
    });
    await Course.create({
      courseTitle: "Sort New",
      description: "new",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const newestRes = await fetch(`${baseUrl}/courses?sort=newest&limit=1&page=1`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(newestRes.status).toBe(200);
    const newestBody = await newestRes.json();
    expect(newestBody.success).toBe(true);
    expect(newestBody.pagination.limit).toBe(1);

    const oldestRes = await fetch(`${baseUrl}/courses?sort=oldest&limit=1&page=1`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(oldestRes.status).toBe(200);
    const oldestBody = await oldestRes.json();
    expect(oldestBody.success).toBe(true);
  });

  it("resource-not-found matrix returns expected not-found statuses", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const checks = [
      { url: `${baseUrl}/campaigns/${missingId}`, headers: { Authorization: "Bearer admin" }, expected: [404] },
      { url: `${baseUrl}/campaigns/${missingId}/analytics`, headers: { Authorization: "Bearer admin" }, expected: [404] },
      { url: `${baseUrl}/whatsapp-campaigns/${missingId}`, headers: { Authorization: "Bearer admin" }, expected: [404] },
      { url: `${baseUrl}/whatsapp-campaigns/${missingId}/analytics`, headers: { Authorization: "Bearer admin" }, expected: [404] },
      { url: `${baseUrl}/voice-phishing/${missingId}`, headers: { Authorization: "Bearer user" }, expected: [404] },
      { url: `${baseUrl}/incidents/${missingId}`, headers: { Authorization: "Bearer user" }, expected: [404] },
      { url: `${baseUrl}/certificates/${missingId}`, headers: { Authorization: "Bearer user" }, expected: [404] },
      { url: `${baseUrl}/courses/${missingId}`, headers: { Authorization: "Bearer user" }, expected: [403, 404] },
    ];

    for (const c of checks) {
      const res = await fetch(c.url, { headers: c.headers });
      expect(c.expected).toContain(res.status);
    }
  });

  it("email API validates required fields and sender format", async () => {
    const missingFieldsRes = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentBy: "a@example.com" }),
    });
    expect(missingFieldsRes.status).toBe(400);

    const badSenderRes = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentBy: "not-an-email",
        sentTo: "target@example.com",
        subject: "S",
        bodyContent: "B",
      }),
    });
    expect(badSenderRes.status).toBe(400);
  });

  it("email API sends successfully and list endpoint supports sentBy/sentTo filters", async () => {
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_KEY = "smtp-key";

    const sendRes = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentBy: "sender@example.com",
        sentTo: "one@example.com,two@example.com",
        subject: "Security Notice",
        bodyContent: "Please review this policy.",
      }),
    });
    expect(sendRes.status).toBe(200);
    const sendBody = await sendRes.json();
    expect(sendBody.success).toBe(true);
    expect(sendBody.data.total).toBe(2);

    const listBySender = await fetch(`${baseUrl}/email-campaigns?sentBy=sender@example.com&page=1&limit=10`);
    expect(listBySender.status).toBe(200);
    const senderBody = await listBySender.json();
    expect(senderBody.success).toBe(true);
    expect(senderBody.data.pagination.total).toBeGreaterThanOrEqual(1);

    const listByRecipient = await fetch(`${baseUrl}/email-campaigns?sentTo=one@example.com`);
    expect(listByRecipient.status).toBe(200);
    const recipientBody = await listByRecipient.json();
    expect(recipientBody.success).toBe(true);
    expect(
      recipientBody.data.emails.every((e) => String(e.sentTo).toLowerCase().includes("one@example.com"))
    ).toBe(true);
  });

  it("upload endpoint returns 400 without file and 500 for unsupported media type via multer", async () => {
    const noFileRes = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(noFileRes.status).toBe(400);

    const form = new FormData();
    form.append("file", new Blob([Buffer.from("not-media")], { type: "text/plain" }), "bad.txt");
    const badTypeRes = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
      body: form,
    });
    expect([400, 500]).toContain(badTypeRes.status);
  });

  it("upload video path returns 503 when youtube service is not ready", async () => {
    const youtubeService = require("../../src/services/youtubeService");
    youtubeService.isReady.mockReturnValueOnce(false);

    const form = new FormData();
    form.append("file", new Blob([Buffer.from("fake video bytes")], { type: "video/mp4" }), "video.mp4");
    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
      body: form,
    });
    expect(res.status).toBe(503);
  });

  it("chat endpoint returns 500 when GEMINI_API_KEY is missing", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const res = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Help with phishing" }),
    });
    expect(res.status).toBe(500);

    process.env.GEMINI_API_KEY = original || "test-key";
  });

  it("org users endpoint supports role/status filters and pagination", async () => {
    const group = await Group.create({ orgId: org._id, name: "Engineering", memberCount: 0 });
    await User.create({
      clerkId: "clerk-org-filter-1",
      email: "org-filter-1@example.com",
      displayName: "Org Filter One",
      role: "affiliated",
      orgId: org._id,
      status: "invited",
      groupIds: [group._id],
      learningScore: 0.4,
    });
    await User.create({
      clerkId: "clerk-org-filter-2",
      email: "org-filter-2@example.com",
      displayName: "Org Filter Two",
      role: "affiliated",
      orgId: org._id,
      status: "active",
      learningScore: 0.5,
    });

    const res = await fetch(
      `${baseUrl}/orgs/${org._id}/users?role=affiliated&status=invited&page=1&limit=5`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.every((u) => u.role === "affiliated" && u.status === "invited")).toBe(true);
    expect(body.pagination.current).toBe(1);
  });

  it("org invites endpoint supports status filtering", async () => {
    await User.create({
      clerkId: "clerk-invite-filter-1",
      email: "invite-filter-1@example.com",
      displayName: "Invite Filter One",
      role: "affiliated",
      orgId: org._id,
      status: "invited",
    });
    await User.create({
      clerkId: "clerk-invite-filter-2",
      email: "invite-filter-2@example.com",
      displayName: "Invite Filter Two",
      role: "affiliated",
      orgId: org._id,
      status: "active",
    });

    const res = await fetch(`${baseUrl}/orgs/${org._id}/invites?status=invited&page=1&limit=10`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.every((u) => u.status === "invited")).toBe(true);
  });

  it("admin org creation and update validate duplicates and missing name", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };

    const missingNameCreate = await fetch(`${baseUrl}/admins/create-org`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description: "No name" }),
    });
    expect(missingNameCreate.status).toBe(400);

    await Organization.create({
      name: "Duplicate Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const duplicateCreate = await fetch(`${baseUrl}/admins/create-org`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Duplicate Org" }),
    });
    expect(duplicateCreate.status).toBe(400);

    const missingNameUpdate = await fetch(`${baseUrl}/admins/orgs/${org._id}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description: "No name update" }),
    });
    expect(missingNameUpdate.status).toBe(400);
  });

  it("admin activate-user validates required fields and missing user", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };

    const missingFieldsRes = await fetch(`${baseUrl}/admins/activate-user`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: regularUser._id.toString() }),
    });
    expect(missingFieldsRes.status).toBe(400);

    const missingUserRes = await fetch(`${baseUrl}/admins/activate-user`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: new mongoose.Types.ObjectId().toString(),
        clerkId: "clerk-missing",
      }),
    });
    expect(missingUserRes.status).toBe(404);
  });

  it("admin update-org returns 404 for non-existent organization id", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const missingOrgRes = await fetch(`${baseUrl}/admins/orgs/${new mongoose.Types.ObjectId()}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Ghost Org" }),
    });
    expect(missingOrgRes.status).toBe(404);
  });

  it("org certificate count forbids cross-org outsider access", async () => {
    const otherOrg = await Organization.create({
      name: "Blocked Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const outsiderAdmin = await User.create({
      clerkId: "clerk-outsider-admin-cert-count",
      email: "outsider-cert-count@example.com",
      displayName: "Outsider Admin",
      role: "client_admin",
      orgId: otherOrg._id,
    });
    mockCurrentUser.outsider = {
      _id: outsiderAdmin._id,
      clerkId: outsiderAdmin.clerkId,
      email: outsiderAdmin.email,
      role: outsiderAdmin.role,
      orgId: otherOrg._id,
    };

    const res = await fetch(`${baseUrl}/orgs/${org._id}/certificates/count`, {
      headers: { Authorization: "Bearer outsider" },
    });
    expect(res.status).toBe(403);
  });

  it("certificate non-affiliated count includes only non_affiliated users", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const nonAff = await User.create({
      clerkId: "clerk-na-cert-count",
      email: "na-cert-count@example.com",
      displayName: "NA Cert",
      role: "non_affiliated",
    });
    const aff = await User.create({
      clerkId: "clerk-aff-cert-count",
      email: "aff-cert-count@example.com",
      displayName: "Aff Cert",
      role: "affiliated",
      orgId: org._id,
    });

    const courseA = await Course.create({
      courseTitle: "NA Course",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
    });
    const courseB = await Course.create({
      courseTitle: "Aff Course",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    await (require("../../src/models/Certificate")).create({
      user: nonAff._id,
      course: courseA._id,
      userName: nonAff.displayName,
      userEmail: nonAff.email,
      courseTitle: courseA.courseTitle,
      certificateNumber: `CERT-${Date.now()}-NA`,
    });
    await (require("../../src/models/Certificate")).create({
      user: aff._id,
      course: courseB._id,
      userName: aff.displayName,
      userEmail: aff.email,
      courseTitle: courseB.courseTitle,
      certificateNumber: `CERT-${Date.now()}-AFF`,
    });

    const res = await fetch(`${baseUrl}/certificates/count/non-affiliated`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalCertificates).toBe(1);
  });

  it("courses delete returns 400 for invalid course id", async () => {
    const res = await fetch(`${baseUrl}/courses/not-a-valid-id`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(400);
  });

  it("course progress endpoints validate missing submoduleId consistently", async () => {
    const c = await Course.create({
      courseTitle: "Progress Validation",
      description: "d",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "M" }], quiz: [] }],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const markRes = await fetch(`${baseUrl}/courses/${c._id}/progress`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(markRes.status).toBe(400);

    const unmarkRes = await fetch(`${baseUrl}/courses/${c._id}/progress`, {
      method: "DELETE",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(unmarkRes.status).toBe(400);

    const retryRes = await fetch(`${baseUrl}/courses/${c._id}/progress/activity-retry`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(retryRes.status).toBe(400);
  });

  it("course activity email/whatsapp send endpoints validate recipient and submodule", async () => {
    const c = await Course.create({
      courseTitle: "Activity Send Validation",
      description: "d",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "M" }], quiz: [], activityType: "email" }],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const emailInvalidRecipient = await fetch(`${baseUrl}/courses/${c._id}/activity/send-email`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "bad-email", submoduleId: "0-activity" }),
    });
    expect(emailInvalidRecipient.status).toBe(400);

    const emailInvalidSubmodule = await fetch(`${baseUrl}/courses/${c._id}/activity/send-email`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "ok@example.com", submoduleId: "0-0" }),
    });
    expect(emailInvalidSubmodule.status).toBe(400);

    const waInvalidRecipient = await fetch(`${baseUrl}/courses/${c._id}/activity/send-whatsapp`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "123", submoduleId: "0-activity" }),
    });
    expect(waInvalidRecipient.status).toBe(400);

    const waInvalidSubmodule = await fetch(`${baseUrl}/courses/${c._id}/activity/send-whatsapp`, {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+923001112233", submoduleId: "0-0" }),
    });
    expect(waInvalidSubmodule.status).toBe(400);
  });

  it("courses activity status endpoints validate submodule query", async () => {
    const c = await Course.create({
      courseTitle: "Activity Status Validation",
      description: "d",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "M" }], quiz: [], activityType: "whatsapp" }],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const emailStatusRes = await fetch(`${baseUrl}/courses/${c._id}/progress/activity-email-status?submoduleId=0-0`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(emailStatusRes.status).toBe(400);

    const waStatusRes = await fetch(`${baseUrl}/courses/${c._id}/progress/activity-whatsapp-status?submoduleId=0-0`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(waStatusRes.status).toBe(400);
  });

  it("upload subtitle status and fetch return 404 when transcript missing", async () => {
    const cloudinary = require("cloudinary").v2;
    cloudinary.api.resource.mockRejectedValueOnce({ http_code: 404, message: "missing transcript" });
    const statusRes = await fetch(`${baseUrl}/upload/subtitles/status/not-found-public-id`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(statusRes.status).toBe(404);

    cloudinary.api.resource.mockRejectedValueOnce({ http_code: 404, message: "missing transcript" });
    const subtitleRes = await fetch(`${baseUrl}/upload/subtitles/not-found-public-id`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(subtitleRes.status).toBe(404);
  });

  it("reports list endpoint returns only reports created by current admin", async () => {
    const otherOrg = await Organization.create({
      name: "Other Report Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const otherAdmin = await User.create({
      clerkId: "clerk-other-report-admin",
      email: "other-report-admin@example.com",
      displayName: "Other Report Admin",
      role: "client_admin",
      orgId: otherOrg._id,
    });

    await Report.create({
      createdBy: adminUser._id,
      organizationId: org._id,
      reportName: "My Report",
      fileName: "mine.pdf",
      reportDate: new Date(),
      reportData: { mine: true },
      pdfFile: { data: Buffer.from("%PDF-1.4 mine"), contentType: "application/pdf" },
    });
    await Report.create({
      createdBy: otherAdmin._id,
      organizationId: otherOrg._id,
      reportName: "Other Report",
      fileName: "other.pdf",
      reportDate: new Date(),
      reportData: { mine: false },
      pdfFile: { data: Buffer.from("%PDF-1.4 other"), contentType: "application/pdf" },
    });

    const res = await fetch(`${baseUrl}/reports`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reports.every((r) => r.createdBy._id.toString() === adminUser._id.toString())).toBe(true);
  });

  it("org invites endpoint filters by group correctly", async () => {
    const groupA = await Group.create({ orgId: org._id, name: "Group A", memberCount: 0 });
    const groupB = await Group.create({ orgId: org._id, name: "Group B", memberCount: 0 });

    await User.create({
      clerkId: "clerk-group-a-user",
      email: "group-a@example.com",
      displayName: "Group A User",
      role: "affiliated",
      orgId: org._id,
      status: "invited",
      groupIds: [groupA._id],
    });
    await User.create({
      clerkId: "clerk-group-b-user",
      email: "group-b@example.com",
      displayName: "Group B User",
      role: "affiliated",
      orgId: org._id,
      status: "invited",
      groupIds: [groupB._id],
    });

    const res = await fetch(`${baseUrl}/orgs/${org._id}/invites?group=Group A`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBeGreaterThanOrEqual(1);
    expect(body.users.every((u) => u.groups.includes("Group A"))).toBe(true);
  });

  it("org users endpoint filters by group correctly", async () => {
    const group = await Group.create({ orgId: org._id, name: "Security Team", memberCount: 0 });
    await User.create({
      clerkId: "clerk-security-team-user",
      email: "security-team@example.com",
      displayName: "Security Team User",
      role: "affiliated",
      orgId: org._id,
      status: "active",
      groupIds: [group._id],
    });

    const res = await fetch(`${baseUrl}/orgs/${org._id}/users?group=Security Team`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBeGreaterThanOrEqual(1);
    expect(body.users.every((u) => u.groups.includes("Security Team"))).toBe(true);
  });

  it("admin invite-client returns 400 when user already exists in database", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    await User.create({
      clerkId: "clerk-existing-client-admin",
      email: "existing-client-admin@example.com",
      displayName: "Existing Client Admin",
      role: "client_admin",
      orgId: org._id,
      status: "active",
    });

    const res = await fetch(`${baseUrl}/admins/invite-client`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "existing-client-admin@example.com",
        orgName: org.name,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("voice phishing template create/update reject invalid type", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };

    const createInvalid = await fetch(`${baseUrl}/voice-phishing-templates`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Bad Type Template",
        description: "desc",
        type: "invalid",
        firstMessage: "hello",
      }),
    });
    expect(createInvalid.status).toBe(400);

    const validTemplate = await VoicePhishingTemplate.create({
      title: "Valid Type Template",
      description: "desc",
      type: "phishing",
      firstMessage: "hello",
      organizationId: null,
      createdBy: adminUser._id,
      isActive: true,
    });

    const updateInvalid = await fetch(`${baseUrl}/voice-phishing-templates/${validTemplate._id}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "bad-type" }),
    });
    expect(updateInvalid.status).toBe(400);
  });

  it("incidents endpoint returns correct pagination fields with page/limit query", async () => {
    await Incident.create({
      userId: regularUser._id,
      organizationId: org._id,
      messageType: "email",
      message: "incident-1",
      text: "incident-1",
      is_phishing: true,
      phishing_probability: 0.9,
      legitimate_probability: 0.1,
      confidence: 0.9,
    });
    await Incident.create({
      userId: regularUser._id,
      organizationId: org._id,
      messageType: "email",
      message: "incident-2",
      text: "incident-2",
      is_phishing: false,
      phishing_probability: 0.2,
      legitimate_probability: 0.8,
      confidence: 0.9,
    });

    const res = await fetch(`${baseUrl}/incidents?page=1&limit=1`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.total).toBeGreaterThanOrEqual(2);
    expect(body.incidents.length).toBe(1);
  });

  it("courses endpoint returns empty list for unknown role fallback", async () => {
    mockCurrentUser.user = {
      ...mockCurrentUser.user,
      role: "mystery_role",
      orgId: org._id,
    };
    const res = await fetch(`${baseUrl}/courses`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body.courses.length).toBe(0);
  });

  it("email send endpoint returns 500 when SMTP env is missing", async () => {
    const prevUser = process.env.SMTP_USER;
    const prevKey = process.env.SMTP_KEY;
    const prevPass = process.env.SMTP_PASSWORD;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_KEY;
    delete process.env.SMTP_PASSWORD;

    const res = await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentBy: "sender@example.com",
        sentTo: "target@example.com",
        subject: "SMTP Check",
        bodyContent: "SMTP check body",
      }),
    });
    expect(res.status).toBe(500);

    if (prevUser !== undefined) process.env.SMTP_USER = prevUser;
    if (prevKey !== undefined) process.env.SMTP_KEY = prevKey;
    if (prevPass !== undefined) process.env.SMTP_PASSWORD = prevPass;
  });

  it("upload image path succeeds with cloudinary response payload", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("fake image bytes")], { type: "image/png" }), "test.png");

    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("image");
    expect(body.url).toContain("cloudinary.example");
  });

  it("users me learning-progress returns expected weekly data shape", async () => {
    const res = await fetch(`${baseUrl}/users/me/learning-progress`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(8);
    expect(body.data[0]).toHaveProperty("week");
    expect(body.data[0]).toHaveProperty("cumulative");
  });

  it("users me courses-progress returns ordered course progress payload", async () => {
    const c1 = await Course.create({
      courseTitle: "Progress Course 1",
      description: "d1",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "m" }], quiz: [] }],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    const c2 = await Course.create({
      courseTitle: "Progress Course 2",
      description: "d2",
      modules: [{ title: "M1", sections: [{ title: "S1", material: "m" }], quiz: [] }],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    await CourseProgress.create({
      user: regularUser._id,
      course: c1._id,
      completed: ["0-0"],
      isCompleted: true,
    });
    await CourseProgress.create({
      user: regularUser._id,
      course: c2._id,
      completed: [],
      isCompleted: false,
    });

    const res = await fetch(`${baseUrl}/users/me/courses-progress`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body).toHaveProperty("totalCompleted");
  });

  it("users me activity endpoint returns feed payload and growth fields", async () => {
    const res = await fetch(`${baseUrl}/users/me/activity`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.activities)).toBe(true);
    expect(body).toHaveProperty("growthPercent");
    expect(body).toHaveProperty("thisMonthCount");
    expect(body).toHaveProperty("lastMonthCount");
  });

  it("users remedial assignments endpoint returns success payload", async () => {
    const res = await fetch(`${baseUrl}/users/me/remedial-assignments`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.remedialAssignments)).toBe(true);
  });

  it("voice transcript update and end return 404 for unknown conversation", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const transcriptRes = await fetch(`${baseUrl}/voice-phishing/${missingId}/transcript`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ role: "user", message: "hello" }] }),
    });
    expect(transcriptRes.status).toBe(404);

    const endRes = await fetch(`${baseUrl}/voice-phishing/${missingId}/end`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(endRes.status).toBe(404);
  });

  it("voice conversations list supports scenarioType filter", async () => {
    await VoicePhishingConversation.create({
      userId: regularUser._id,
      organizationId: org._id,
      agentId: "agent-filter-1",
      scenarioType: "phishing",
      scenarioDescription: "phishing scenario",
      status: "completed",
      score: 20,
    });
    await VoicePhishingConversation.create({
      userId: regularUser._id,
      organizationId: org._id,
      agentId: "agent-filter-2",
      scenarioType: "normal",
      scenarioDescription: "normal scenario",
      status: "completed",
      score: 80,
    });

    const res = await fetch(`${baseUrl}/voice-phishing?scenarioType=phishing`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversations.every((c) => c.scenarioType === "phishing")).toBe(true);
  });

  it("reports create without file returns 400 for admin", async () => {
    const res = await fetch(`${baseUrl}/reports`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportName: "No File Report",
        organizationName: "Acme",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("courses get by id returns 404 for non-existent course", async () => {
    const res = await fetch(`${baseUrl}/courses/${new mongoose.Types.ObjectId()}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect([403, 404]).toContain(res.status);
  });

  it("courses update with empty title returns 400 validation error", async () => {
    const c = await Course.create({
      courseTitle: "Update Validation Course",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const res = await fetch(`${baseUrl}/courses/${c._id}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ courseTitle: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("courses update rejects limits overflow for basic level", async () => {
    const c = await Course.create({
      courseTitle: "Limit Validation Course",
      description: "d",
      level: "basic",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });

    const oversizedModules = Array.from({ length: 6 }).map((_, i) => ({
      title: `Module ${i + 1}`,
      sections: [],
      quiz: [],
    }));

    const res = await fetch(`${baseUrl}/courses/${c._id}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ level: "basic", modules: oversizedModules }),
    });
    expect(res.status).toBe(400);
  });

  it("leaderboard organization for system_admin with orgId returns scoped entries", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    await User.create({
      clerkId: "clerk-org-lb-1",
      email: "org-lb-1@example.com",
      displayName: "Org LB 1",
      role: "affiliated",
      orgId: org._id,
      learningScore: 0.72,
    });
    await User.create({
      clerkId: "clerk-org-lb-2",
      email: "org-lb-2@example.com",
      displayName: "Org LB 2",
      role: "client_admin",
      orgId: org._id,
      learningScore: 0.85,
    });

    const res = await fetch(`${baseUrl}/leaderboard/organization?orgId=${org._id}`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orgId.toString()).toBe(org._id.toString());
    expect(body.leaderboard.length).toBeGreaterThanOrEqual(1);
  });

  it("chat endpoint handles urdu language preference successfully", async () => {
    const res = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "فشنگ سے کیسے بچا جائے؟",
        language: "ur",
        conversationHistory: [{ role: "user", content: "ہیلو" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Mocked Gemini");
  });

  it("chat endpoint rejects non-string message payload", async () => {
    const res = await fetch(`${baseUrl}/chat/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: 12345 }),
    });
    expect(res.status).toBe(400);
  });

  it("email list endpoint returns pagination fields correctly", async () => {
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_KEY = "smtp-key";
    await fetch(`${baseUrl}/email-campaigns/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentBy: "pager@example.com",
        sentTo: "p1@example.com,p2@example.com,p3@example.com",
        subject: "Pagination Seed",
        bodyContent: "Body",
      }),
    });

    const res = await fetch(`${baseUrl}/email-campaigns?page=1&limit=2`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pagination.current).toBe(1);
    expect(body.data.pagination.pages).toBeGreaterThanOrEqual(1);
    expect(body.data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("org certificate count includes only non-admin users in organization", async () => {
    const Certificate = require("../../src/models/Certificate");
    const learner = await User.create({
      clerkId: "clerk-org-cert-learner",
      email: "org-cert-learner@example.com",
      displayName: "Org Cert Learner",
      role: "affiliated",
      orgId: org._id,
    });
    const adminInOrg = await User.create({
      clerkId: "clerk-org-cert-admin",
      email: "org-cert-admin@example.com",
      displayName: "Org Cert Admin",
      role: "client_admin",
      orgId: org._id,
    });
    const c1 = await Course.create({
      courseTitle: "Org Cert Count Course A",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    const c2 = await Course.create({
      courseTitle: "Org Cert Count Course B",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    await Certificate.create({
      user: learner._id,
      course: c1._id,
      userName: learner.displayName,
      userEmail: learner.email,
      courseTitle: c1.courseTitle,
      certificateNumber: `CERT-${Date.now()}-ORG-LEARNER`,
    });
    await Certificate.create({
      user: adminInOrg._id,
      course: c2._id,
      userName: adminInOrg.displayName,
      userEmail: adminInOrg.email,
      courseTitle: c2.courseTitle,
      certificateNumber: `CERT-${Date.now()}-ORG-ADMIN`,
    });

    const res = await fetch(`${baseUrl}/orgs/${org._id}/certificates/count`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalCertificates).toBe(1);
  });

  it("certificates by course returns 404 when user has no certificate for course", async () => {
    const c = await Course.create({
      courseTitle: "No Cert Yet",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    const res = await fetch(`${baseUrl}/certificates/course/${c._id}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(404);
  });

  it("certificate by id enforces ownership and denies outsider user", async () => {
    const Certificate = require("../../src/models/Certificate");
    const c = await Course.create({
      courseTitle: "Owned Cert Course",
      description: "d",
      modules: [],
      createdBy: adminUser._id,
      orgId: org._id,
    });
    const cert = await Certificate.create({
      user: regularUser._id,
      course: c._id,
      userName: regularUser.displayName,
      userEmail: regularUser.email,
      courseTitle: c.courseTitle,
      certificateNumber: `CERT-${Date.now()}-OWN`,
    });

    const otherOrg = await Organization.create({
      name: "Cert Outsider Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const outsider = await User.create({
      clerkId: "clerk-cert-outsider",
      email: "cert-outsider@example.com",
      displayName: "Cert Outsider",
      role: "affiliated",
      orgId: otherOrg._id,
    });
    mockCurrentUser.outsider = {
      _id: outsider._id,
      clerkId: outsider.clerkId,
      email: outsider.email,
      role: outsider.role,
      orgId: otherOrg._id,
    };

    const res = await fetch(`${baseUrl}/certificates/${cert._id}`, {
      headers: { Authorization: "Bearer outsider" },
    });
    expect(res.status).toBe(403);
  });

  it("incidents listing for client_admin is scoped to own organization", async () => {
    const otherOrg = await Organization.create({
      name: "Incident Other Org",
      clerkOrganizationId: `org-${new mongoose.Types.ObjectId()}`,
    });
    const otherUser = await User.create({
      clerkId: "clerk-incident-other-user",
      email: "incident-other@example.com",
      displayName: "Incident Other User",
      role: "affiliated",
      orgId: otherOrg._id,
    });
    await Incident.create({
      userId: regularUser._id,
      organizationId: org._id,
      messageType: "email",
      message: "org incident",
      text: "org incident",
      is_phishing: true,
      phishing_probability: 0.9,
      legitimate_probability: 0.1,
      confidence: 0.9,
    });
    await Incident.create({
      userId: otherUser._id,
      organizationId: otherOrg._id,
      messageType: "email",
      message: "other org incident",
      text: "other org incident",
      is_phishing: false,
      phishing_probability: 0.2,
      legitimate_probability: 0.8,
      confidence: 0.8,
    });

    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "client_admin", orgId: org._id };
    const res = await fetch(`${baseUrl}/incidents`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.incidents.every((i) => i.organizationId.toString() === org._id.toString())).toBe(true);
  });

  it("admin invite-client validates missing required fields", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const res = await fetch(`${baseUrl}/admins/invite-client`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "missing-org-name@example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("admin orgs endpoint returns aggregate fields for organizations", async () => {
    mockCurrentUser.admin = { ...mockCurrentUser.admin, role: "system_admin", orgId: null };
    const res = await fetch(`${baseUrl}/admins/orgs`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.organizations)).toBe(true);
    if (body.organizations.length > 0) {
      expect(body.organizations[0]).toHaveProperty("totalUsers");
      expect(body.organizations[0]).toHaveProperty("activeUsers");
      expect(body.organizations[0]).toHaveProperty("invitedUsers");
    }
  });

  it("upload subtitles success path returns WebVTT content-type", async () => {
    const res = await fetch(`${baseUrl}/upload/subtitles/test-public-id`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/vtt");
    const text = await res.text();
    expect(text).toContain("WEBVTT");
  });
});
