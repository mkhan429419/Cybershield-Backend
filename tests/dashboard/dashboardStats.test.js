const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

// ---------------------------------------------------------------------------
// Mutable test user — changed per test to simulate different roles
// Variable prefixed with "mock" so Jest allows it inside jest.mock() factories
// ---------------------------------------------------------------------------
let mockCurrentUser = {};

// ---------------------------------------------------------------------------
// Top-level mocks (share the same mongoose connection from setup.js)
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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  },
  requireOrgAccess: (req, res, next) => {
    const { orgId } = req.params;
    if (!req.user) return res.status(401).json({ error: "User not authenticated" });
    if (req.user.role === "system_admin") return next();
    if (req.user.role === "client_admin") {
      const userOrgId = req.user.orgId?._id?.toString() || req.user.orgId?.toString();
      if (!userOrgId || userOrgId !== orgId) {
        return res.status(403).json({ error: "Access denied to this organization" });
      }
      return next();
    }
    return res.status(403).json({ error: "Insufficient permissions" });
  },
}));

jest.mock("@clerk/clerk-sdk-node", () => ({
  ClerkExpressRequireAuth: () => (_req, _res, next) => next(),
  clerkClient: {
    users: {
      getUser: jest.fn(async () => ({
        profileImageUrl: null,
        firstName: "Test",
        lastName: "User",
        lastSignInAt: null,
        emailAddresses: [],
      })),
    },
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
  isEligibleForLmsRiskScoring: () => false,
  computeLmsRiskScore: jest.fn(async () => 0),
  getCourseFilterForUser: (user) => {
    if (user.role === "non_affiliated") return { level: "basic" };
    if (user.role === "affiliated") return {};
    return {};
  },
  getTotalSubmodulesForCourse: (course) => {
    let total = 0;
    for (const mod of course.modules || []) {
      total += (mod.sections || []).length;
      if ((mod.quiz || []).length > 0) total++;
      if (mod.activityType) total++;
    }
    return total;
  },
}));

jest.mock("../../src/services/combinedLearningScoreService", () => ({
  computeCombinedLearningScore: () => 0,
  updateUserCombinedLearningScore: jest.fn(async () => {}),
}));

jest.mock("../../src/services/remedialAssignmentService", () => ({
  getRemedialAssignmentsForUser: jest.fn(async () => []),
  ensureRemedialAssignments: jest.fn(async () => {}),
}));

jest.mock("../../src/utils/badgeMapping", () => ({
  transformBadgesFromLabels: (badges) =>
    (badges || []).map((b) => ({ id: b, label: b })),
  getBadgeLabel: (id) => id,
}));

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const Certificate = require("../../src/models/Certificate");
const Course = require("../../src/models/Course");
const CourseProgress = require("../../src/models/CourseProgress");
const Report = require("../../src/models/Report");

// ---------------------------------------------------------------------------
// Routes (loaded ONCE — they share the test mongoose connection)
// ---------------------------------------------------------------------------
const reportRoutes = require("../../src/routes/reports");
const leaderboardRoutes = require("../../src/routes/leaderboard");
const orgRoutes = require("../../src/routes/orgs");
const userRoutes = require("../../src/routes/users");

// ---------------------------------------------------------------------------
// App builders (thin wrappers around express + routes)
// ---------------------------------------------------------------------------
function buildApp(routePath, routeModule) {
  const app = express();
  app.use(express.json());
  app.use(routePath, routeModule);
  return app;
}

const reportApp = buildApp("/api/reports", reportRoutes);
const leaderboardApp = buildApp("/api/leaderboard", leaderboardRoutes);
const orgApp = buildApp("/api/orgs", orgRoutes);
const userApp = buildApp("/api/users", userRoutes);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
async function seedOrg(name = "TestOrg") {
  return Organization.create({ name, description: "Test organization" });
}

async function seedUser(overrides = {}) {
  return User.create({
    clerkId: overrides.clerkId || `clerk-${new mongoose.Types.ObjectId()}`,
    email: overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    displayName: overrides.displayName || "Test User",
    role: overrides.role || "affiliated",
    orgId: overrides.orgId || null,
    status: overrides.status || "active",
    learningScore: overrides.learningScore || 0,
    learningScoreEmail: overrides.learningScoreEmail || 0,
    learningScoreWhatsapp: overrides.learningScoreWhatsapp || 0,
    learningScoreLms: overrides.learningScoreLms || 0,
    learningScoreVoice: overrides.learningScoreVoice || 0,
    learningScoreIncident: overrides.learningScoreIncident || 0,
    badges: overrides.badges || [],
    ...overrides,
  });
}

async function seedCourse(overrides = {}) {
  return Course.create({
    courseTitle: overrides.courseTitle || "Test Course",
    description: overrides.description || "A test course",
    level: overrides.level || "basic",
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    modules: overrides.modules || [
      {
        title: "Module 1",
        sections: [
          { title: "Section 1", content: "Content 1", type: "text" },
          { title: "Section 2", content: "Content 2", type: "text" },
        ],
        quiz: [
          { question: "Q1?", options: ["A", "B", "C", "D"], correctAnswer: 0 },
        ],
      },
    ],
    badges: overrides.badges || [],
    ...overrides,
  });
}

async function seedCertificate(userId, courseId, overrides = {}) {
  return Certificate.create({
    user: userId,
    course: courseId,
    userName: overrides.userName || "Test User",
    userEmail: overrides.userEmail || "test@test.com",
    courseTitle: overrides.courseTitle || "Test Course",
    certificateNumber:
      overrides.certificateNumber ||
      `CERT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    completionDate: overrides.completionDate || new Date(),
    issuedDate: overrides.issuedDate || new Date(),
  });
}

// ---------------------------------------------------------------------------
// Test: Reports controller — role-based access
// ---------------------------------------------------------------------------
describe("Reports Controller — role-based access", () => {
  let org, systemAdminUser, clientAdminUser, affiliatedUser;

  beforeEach(async () => {
    org = await seedOrg("ReportOrg");
    systemAdminUser = await seedUser({
      role: "system_admin",
      email: "sysadmin@test.com",
      displayName: "System Admin",
    });
    clientAdminUser = await seedUser({
      role: "client_admin",
      email: "clientadmin@test.com",
      displayName: "Client Admin",
      orgId: org._id,
    });
    affiliatedUser = await seedUser({
      role: "affiliated",
      email: "affiliated@test.com",
      displayName: "Affiliated User",
      orgId: org._id,
    });
  });

  describe("POST /api/reports — createReport", () => {
    it("allows system_admin to create a report", async () => {
      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp)
        .post("/api/reports")
        .attach("pdf", Buffer.from("fake-pdf-content"), {
          filename: "report.pdf",
          contentType: "application/pdf",
        })
        .field("reportName", "System Admin Report")
        .field("reportDate", "2026-04-20");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.report.reportName).toBe("System Admin Report");
    });

    it("allows client_admin to create a report", async () => {
      mockCurrentUser = clientAdminUser;
      const res = await request(reportApp)
        .post("/api/reports")
        .attach("pdf", Buffer.from("fake-pdf"), {
          filename: "report.pdf",
          contentType: "application/pdf",
        })
        .field("reportName", "Client Admin Report")
        .field("reportDate", "2026-04-20");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("denies affiliated user from creating a report", async () => {
      mockCurrentUser = affiliatedUser;
      const res = await request(reportApp)
        .post("/api/reports")
        .attach("pdf", Buffer.from("fake-pdf"), {
          filename: "report.pdf",
          contentType: "application/pdf",
        })
        .field("reportName", "Unauthorized Report")
        .field("reportDate", "2026-04-20");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when no PDF file is provided", async () => {
      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp)
        .post("/api/reports")
        .field("reportName", "No PDF Report")
        .field("reportDate", "2026-04-20");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("PDF file is required");
    });
  });

  describe("GET /api/reports — getUserReports", () => {
    it("system_admin can list their reports", async () => {
      await Report.create({
        createdBy: systemAdminUser._id,
        reportName: "SA Report",
        reportDate: "2026-04-20",
        fileName: "sa.pdf",
        pdfFile: { data: Buffer.from("pdf"), contentType: "application/pdf" },
      });

      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reports).toHaveLength(1);
      expect(res.body.reports[0].reportName).toBe("SA Report");
    });

    it("client_admin can list their reports", async () => {
      await Report.create({
        createdBy: clientAdminUser._id,
        reportName: "CA Report",
        reportDate: "2026-04-20",
        fileName: "ca.pdf",
        pdfFile: { data: Buffer.from("pdf"), contentType: "application/pdf" },
      });

      mockCurrentUser = clientAdminUser;
      const res = await request(reportApp).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports).toHaveLength(1);
    });

    it("affiliated user is denied from listing reports", async () => {
      mockCurrentUser = affiliatedUser;
      const res = await request(reportApp).get("/api/reports");

      expect(res.status).toBe(403);
    });

    it("returns empty array when admin has no reports", async () => {
      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports).toHaveLength(0);
    });
  });

  describe("GET /api/reports/:reportId/download — downloadReport", () => {
    it("system_admin can download their own report", async () => {
      const report = await Report.create({
        createdBy: systemAdminUser._id,
        reportName: "Download Test",
        reportDate: "2026-04-20",
        fileName: "download.pdf",
        pdfFile: {
          data: Buffer.from("pdf-binary-content"),
          contentType: "application/pdf",
        },
      });

      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp).get(
        `/api/reports/${report._id}/download`
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });

    it("system_admin can download another admin's report", async () => {
      const report = await Report.create({
        createdBy: clientAdminUser._id,
        reportName: "Other Admin Report",
        reportDate: "2026-04-20",
        fileName: "other.pdf",
        pdfFile: {
          data: Buffer.from("pdf-content"),
          contentType: "application/pdf",
        },
      });

      mockCurrentUser = systemAdminUser;
      const res = await request(reportApp).get(
        `/api/reports/${report._id}/download`
      );

      expect(res.status).toBe(200);
    });

    it("client_admin cannot download another admin's report", async () => {
      const report = await Report.create({
        createdBy: systemAdminUser._id,
        reportName: "SA Only Report",
        reportDate: "2026-04-20",
        fileName: "sa-only.pdf",
        pdfFile: { data: Buffer.from("pdf"), contentType: "application/pdf" },
      });

      mockCurrentUser = clientAdminUser;
      const res = await request(reportApp).get(
        `/api/reports/${report._id}/download`
      );

      expect(res.status).toBe(403);
    });

    it("affiliated user is denied from downloading any report", async () => {
      const report = await Report.create({
        createdBy: systemAdminUser._id,
        reportName: "Blocked Report",
        reportDate: "2026-04-20",
        fileName: "blocked.pdf",
        pdfFile: { data: Buffer.from("pdf"), contentType: "application/pdf" },
      });

      mockCurrentUser = affiliatedUser;
      const res = await request(reportApp).get(
        `/api/reports/${report._id}/download`
      );

      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent report", async () => {
      mockCurrentUser = systemAdminUser;
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(reportApp).get(
        `/api/reports/${fakeId}/download`
      );

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// Test: Leaderboard — role-based access
// ---------------------------------------------------------------------------
describe("Leaderboard Controller — role-based access", () => {
  let org;

  beforeEach(async () => {
    org = await seedOrg("LeaderOrg");
  });

  describe("GET /api/leaderboard/global", () => {
    it("returns non-affiliated users sorted by learning score", async () => {
      await seedUser({ role: "non_affiliated", displayName: "User A", learningScore: 80 });
      await seedUser({ role: "non_affiliated", displayName: "User B", learningScore: 90 });
      await seedUser({
        role: "affiliated",
        displayName: "Affiliated",
        learningScore: 95,
        orgId: org._id,
      });

      const requester = await seedUser({ role: "non_affiliated", displayName: "Requester" });
      mockCurrentUser = requester;
      const res = await request(leaderboardApp).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.leaderboard.length).toBeGreaterThanOrEqual(2);
      expect(res.body.leaderboard[0].learningScore).toBeGreaterThanOrEqual(
        res.body.leaderboard[1].learningScore
      );
      const names = res.body.leaderboard.map((u) => u.name);
      expect(names).not.toContain("Affiliated");
    });

    it("any authenticated user can access global leaderboard", async () => {
      const admin = await seedUser({ role: "system_admin", displayName: "Admin" });
      mockCurrentUser = admin;
      const res = await request(leaderboardApp).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("GET /api/leaderboard/organization", () => {
    it("client_admin sees their own org leaderboard", async () => {
      await seedUser({
        role: "affiliated",
        displayName: "Org User 1",
        learningScore: 70,
        orgId: org._id,
      });
      await seedUser({
        role: "affiliated",
        displayName: "Org User 2",
        learningScore: 50,
        orgId: org._id,
      });

      const admin = await seedUser({
        role: "client_admin",
        displayName: "CA",
        orgId: org._id,
      });
      mockCurrentUser = admin;
      const res = await request(leaderboardApp).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.leaderboard.length).toBeGreaterThanOrEqual(2);
    });

    it("system_admin requires orgId query param", async () => {
      const admin = await seedUser({ role: "system_admin", displayName: "SA" });
      mockCurrentUser = admin;
      const res = await request(leaderboardApp).get("/api/leaderboard/organization");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("orgId");
    });

    it("system_admin can query any organization", async () => {
      await seedUser({
        role: "affiliated",
        displayName: "Org User",
        learningScore: 60,
        orgId: org._id,
      });

      const admin = await seedUser({ role: "system_admin", displayName: "SA" });
      mockCurrentUser = admin;
      const res = await request(leaderboardApp).get(
        `/api/leaderboard/organization?orgId=${org._id}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("non_affiliated user is denied organization leaderboard", async () => {
      const user = await seedUser({ role: "non_affiliated", displayName: "Non-Aff" });
      mockCurrentUser = user;
      const res = await request(leaderboardApp).get("/api/leaderboard/organization");

      expect(res.status).toBe(403);
    });

    it("affiliated user without org gets 403", async () => {
      const user = await seedUser({
        role: "affiliated",
        displayName: "No Org",
        orgId: null,
      });
      mockCurrentUser = user;
      const res = await request(leaderboardApp).get("/api/leaderboard/organization");

      expect(res.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// Test: Org Controller — certificate count, org users (stats for admin)
// ---------------------------------------------------------------------------
describe("Organization Controller — admin stats", () => {
  let org, otherOrg;

  beforeEach(async () => {
    org = await seedOrg("OrgA");
    otherOrg = await seedOrg("OrgB");
  });

  describe("GET /api/orgs/:orgId/certificates/count", () => {
    it("client_admin can get certificate count for their org", async () => {
      const u1 = await seedUser({ role: "affiliated", orgId: org._id, email: "u1@test.com" });
      const course = await seedCourse();
      await seedCertificate(u1._id, course._id, {
        userName: u1.displayName,
        userEmail: u1.email,
      });
      await seedCertificate(
        u1._id,
        (await seedCourse({ courseTitle: "Course 2" }))._id,
        { userName: u1.displayName, userEmail: u1.email }
      );

      const admin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca@test.com" });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/certificates/count`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalCertificates).toBe(2);
    });

    it("client_admin cannot access another org's certificate count", async () => {
      const admin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca2@test.com" });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${otherOrg._id}/certificates/count`);

      expect(res.status).toBe(403);
    });

    it("system_admin can access any org's certificate count", async () => {
      const u = await seedUser({ role: "affiliated", orgId: otherOrg._id, email: "u3@test.com" });
      const course = await seedCourse({ courseTitle: "Course 3" });
      await seedCertificate(u._id, course._id, {
        userName: u.displayName,
        userEmail: u.email,
      });

      const admin = await seedUser({ role: "system_admin", email: "sa@test.com" });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${otherOrg._id}/certificates/count`);

      expect(res.status).toBe(200);
      expect(res.body.totalCertificates).toBe(1);
    });

    it("excludes admin users from certificate count", async () => {
      const adminInOrg = await seedUser({
        role: "client_admin",
        orgId: org._id,
        email: "admin-in-org@test.com",
      });
      const course = await seedCourse({ courseTitle: "Admin Course" });
      await seedCertificate(adminInOrg._id, course._id, {
        userName: adminInOrg.displayName,
        userEmail: adminInOrg.email,
      });

      const admin = await seedUser({ role: "system_admin", email: "sa2@test.com" });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/certificates/count`);

      expect(res.status).toBe(200);
      expect(res.body.totalCertificates).toBe(0);
    });
  });

  describe("GET /api/orgs/:orgId/users — org user stats", () => {
    it("client_admin gets users with learning scores for their org", async () => {
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "aff1@test.com",
        displayName: "Aff1",
        learningScore: 75,
        learningScoreLms: 0.8,
      });
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "aff2@test.com",
        displayName: "Aff2",
        learningScore: 60,
      });

      const admin = await seedUser({
        role: "client_admin",
        orgId: org._id,
        email: "ca-users@test.com",
      });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
      const user = res.body.users.find((u) => u.email === "aff1@test.com");
      expect(user).toBeDefined();
      expect(user.learningScores).toBeDefined();
      expect(user.learningScores.lms).toBe(0.8);
    });

    it("system_admin can access any org's users", async () => {
      await seedUser({
        role: "affiliated",
        orgId: otherOrg._id,
        email: "other-aff@test.com",
        displayName: "OtherAff",
      });

      const admin = await seedUser({ role: "system_admin", email: "sa-users@test.com" });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${otherOrg._id}/users`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });

    it("client_admin cannot access another org's users", async () => {
      const admin = await seedUser({
        role: "client_admin",
        orgId: org._id,
        email: "ca-blocked@test.com",
      });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${otherOrg._id}/users`);

      expect(res.status).toBe(403);
    });

    it("affiliated user is denied access to org users", async () => {
      const user = await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "aff-blocked@test.com",
      });
      mockCurrentUser = user;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      expect(res.status).toBe(403);
    });

    it("users response includes badges array", async () => {
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "badged@test.com",
        displayName: "Badged",
        badges: ["Phishing Expert", "Course Champion"],
      });

      const admin = await seedUser({
        role: "client_admin",
        orgId: org._id,
        email: "ca-badges@test.com",
      });
      mockCurrentUser = admin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      const user = res.body.users.find((u) => u.email === "badged@test.com");
      expect(user.badges).toEqual(
        expect.arrayContaining(["Phishing Expert", "Course Champion"])
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Test: User Controller — profile, learning progress, courses progress
// ---------------------------------------------------------------------------
describe("User Controller — dashboard stats (own user)", () => {
  describe("GET /api/users/me — getUserProfile", () => {
    it("affiliated user gets their own profile with learning scores", async () => {
      const user = await seedUser({
        role: "affiliated",
        email: "aff-profile@test.com",
        displayName: "Aff Profile",
        learningScore: 65,
        learningScoreEmail: 0.7,
        learningScoreWhatsapp: 0.6,
        learningScoreLms: 0.5,
        learningScoreVoice: 0.8,
        badges: ["Phishing Expert"],
      });

      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me");

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("aff-profile@test.com");
      expect(res.body.role).toBe("affiliated");
      expect(res.body.learningScores).toBeDefined();
      expect(res.body.badges).toBeDefined();
    });

    it("system_admin gets their own profile", async () => {
      const user = await seedUser({
        role: "system_admin",
        email: "sa-profile@test.com",
        displayName: "SA Profile",
      });

      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me");

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("system_admin");
    });

    it("client_admin gets their own profile with orgId", async () => {
      const profileOrg = await seedOrg("ProfileOrg");
      const user = await seedUser({
        role: "client_admin",
        email: "ca-profile@test.com",
        displayName: "CA Profile",
        orgId: profileOrg._id,
      });

      // Populate orgId for the test user (since getUserProfile reads user.orgId.name)
      const populated = await User.findById(user._id).populate("orgId");
      mockCurrentUser = populated;
      const res = await request(userApp).get("/api/users/me");

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("client_admin");
      expect(res.body.orgId).toBeDefined();
    });

    it("non_affiliated user gets own stats", async () => {
      const user = await seedUser({
        role: "non_affiliated",
        email: "na@test.com",
        displayName: "NA User",
        learningScore: 40,
      });

      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me");

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("non_affiliated");
    });
  });

  describe("GET /api/users/me/learning-progress", () => {
    it("returns weekly learning progress data", async () => {
      const user = await seedUser({ role: "affiliated", email: "lp@test.com" });
      const course = await seedCourse({ courseTitle: "LP Course" });
      await seedCertificate(user._id, course._id, {
        userName: user.displayName,
        userEmail: user.email,
        completionDate: new Date(),
      });

      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me/learning-progress");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(8);
      expect(res.body.totalCompletions).toBeGreaterThanOrEqual(1);
    });

    it("returns zero completions for user with no certificates", async () => {
      const user = await seedUser({ role: "non_affiliated", email: "nolp@test.com" });
      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me/learning-progress");

      expect(res.status).toBe(200);
      expect(res.body.totalCompletions).toBe(0);
      expect(res.body.data.every((w) => w.completions === 0)).toBe(true);
    });
  });

  describe("GET /api/users/me/courses-progress", () => {
    it("returns course progress for the user", async () => {
      const user = await seedUser({ role: "non_affiliated", email: "cp@test.com" });
      const course = await seedCourse({ courseTitle: "Progress Course", level: "basic" });
      await CourseProgress.create({
        user: user._id,
        course: course._id,
        completed: ["0-0"],
      });

      mockCurrentUser = user;
      const res = await request(userApp).get("/api/users/me/courses-progress");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.courses.length).toBeGreaterThanOrEqual(1);
      const c = res.body.courses.find((x) => x.courseTitle === "Progress Course");
      expect(c).toBeDefined();
      expect(c.completedSubmodules).toBe(1);
    });
  });

  describe("GET /api/users/all — getAllUsers (system admin dashboard)", () => {
    it("returns all users with learning scores", async () => {
      await seedUser({ role: "non_affiliated", email: "all1@test.com", learningScore: 55 });
      await seedUser({ role: "affiliated", email: "all2@test.com", learningScore: 70 });

      const admin = await seedUser({ role: "system_admin", email: "sa-all@test.com" });
      mockCurrentUser = admin;
      const res = await request(userApp).get("/api/users/all");

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
      const u = res.body.users.find((x) => x.email === "all1@test.com");
      expect(u.learningScores).toBeDefined();
      expect(u.badges).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Test: Auth middleware — requireOrgAccess (unit test, no HTTP)
// ---------------------------------------------------------------------------
describe("Auth Middleware — requireOrgAccess (unit)", () => {
  const { requireOrgAccess } = jest.requireActual("../../src/middleware/auth");

  function makeMockRes() {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
      },
    };
    return res;
  }

  it("system_admin can access any organization", () => {
    const req = { user: { role: "system_admin" }, params: { orgId: "any-org-id" } };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("client_admin can access their own organization", () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const req = {
      user: {
        role: "client_admin",
        orgId: { _id: { toString: () => orgId }, toString: () => orgId },
      },
      params: { orgId },
    };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("client_admin cannot access a different organization", () => {
    const req = {
      user: {
        role: "client_admin",
        orgId: { _id: { toString: () => "org-1" }, toString: () => "org-1" },
      },
      params: { orgId: "org-2" },
    };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("affiliated user is denied org access", () => {
    const req = { user: { role: "affiliated" }, params: { orgId: "some-org-id" } };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("non_affiliated user is denied org access", () => {
    const req = { user: { role: "non_affiliated" }, params: { orgId: "some-org-id" } };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated request returns 401", () => {
    const req = { user: null, params: { orgId: "some-org-id" } };
    const res = makeMockRes();
    const next = jest.fn();
    requireOrgAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Test: requireRole middleware (unit test, no HTTP)
// ---------------------------------------------------------------------------
describe("Auth Middleware — requireRole (unit)", () => {
  const { requireRole } = jest.requireActual("../../src/middleware/auth");

  it("allows user with matching role", () => {
    const middleware = requireRole(["system_admin"]);
    const req = { user: { role: "system_admin" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("denies user with non-matching role", () => {
    const middleware = requireRole(["system_admin"]);
    const req = { user: { role: "affiliated" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("denies unauthenticated request", () => {
    const middleware = requireRole(["system_admin"]);
    const req = { user: null };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("allows any of multiple roles", () => {
    const middleware = requireRole(["system_admin", "client_admin"]);
    const req = { user: { role: "client_admin" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
