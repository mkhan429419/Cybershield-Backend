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

const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const Certificate = require("../../src/models/Certificate");
const Course = require("../../src/models/Course");
const CourseProgress = require("../../src/models/CourseProgress");

const certificateRoutes = require("../../src/routes/certificates");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/certificates", certificateRoutes);
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
    email: overrides.email || `user-${Date.now()}@test.com`,
    displayName: overrides.displayName || "Test User",
    role: overrides.role || "affiliated",
    orgId: overrides.orgId || null,
    ...overrides,
  });
}

async function seedCourse(overrides = {}) {
  return Course.create({
    courseTitle: overrides.courseTitle || "Test Course",
    description: overrides.description || "A test course",
    level: overrides.level || "basic",
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    createdByName: overrides.createdByName || "Admin",
    modules: overrides.modules || [
      {
        title: "Module 1",
        sections: [{ title: "Section 1", material: "Content" }],
        quiz: [],
      },
    ],
    orgId: overrides.orgId || null,
    ...overrides,
  });
}

async function seedCertificate(overrides = {}) {
  return Certificate.create({
    user: overrides.user || new mongoose.Types.ObjectId(),
    course: overrides.course || new mongoose.Types.ObjectId(),
    userName: overrides.userName || "Test User",
    userEmail: overrides.userEmail || "test@test.com",
    courseTitle: overrides.courseTitle || "Test Course",
    courseDescription: overrides.courseDescription || "Description",
    certificateNumber: overrides.certificateNumber || `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    issuedDate: overrides.issuedDate || new Date(),
    completionDate: overrides.completionDate || new Date(),
    ...overrides,
  });
}

// ===================================================================
// CERTIFICATES
// ===================================================================

describe("Certificates API", () => {
  let org, user;

  beforeEach(async () => {
    org = await seedOrg();
    user = await seedUser({ role: "affiliated", orgId: org._id, displayName: "John Doe", email: "john@test.com" });
    mockCurrentUser = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      role: "affiliated",
      orgId: org._id,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/certificates
  // -----------------------------------------------------------------------

  describe("GET /api/certificates", () => {
    it("returns user's certificates sorted by issuedDate desc", async () => {
      const course1 = await seedCourse({ courseTitle: "Course A", createdBy: user._id, orgId: org._id });
      const course2 = await seedCourse({ courseTitle: "Course B", createdBy: user._id, orgId: org._id });
      await seedCertificate({ user: user._id, course: course1._id, userName: "John Doe", userEmail: "john@test.com", courseTitle: "Course A", issuedDate: new Date("2025-01-01") });
      await seedCertificate({ user: user._id, course: course2._id, userName: "John Doe", userEmail: "john@test.com", courseTitle: "Course B", issuedDate: new Date("2025-06-01") });

      const res = await request(app).get("/api/certificates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.certificates.length).toBe(2);
      expect(res.body.certificates[0].courseTitle).toBe("Course B");
    });

    it("returns only the authenticated user's certificates", async () => {
      const otherUser = await seedUser({ email: "other@test.com" });
      const course = await seedCourse({ createdBy: user._id });
      await seedCertificate({ user: user._id, course: course._id, userName: "John", userEmail: "john@test.com" });
      await seedCertificate({ user: otherUser._id, course: course._id, userName: "Other", userEmail: "other@test.com", certificateNumber: `CERT-OTHER-${Date.now()}` });

      const res = await request(app).get("/api/certificates");

      expect(res.status).toBe(200);
      expect(res.body.certificates.length).toBe(1);
      expect(res.body.certificates[0].userName).toBe("John");
    });

    it("returns empty array when user has no certificates", async () => {
      const res = await request(app).get("/api/certificates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.certificates).toEqual([]);
    });

    it("populates course data in certificates", async () => {
      const course = await seedCourse({ courseTitle: "Security 101", level: "advanced", createdByName: "Admin", createdBy: user._id, orgId: org._id });
      await seedCertificate({ user: user._id, course: course._id, userName: "John", userEmail: "john@test.com", courseTitle: "Security 101" });

      const res = await request(app).get("/api/certificates");

      expect(res.status).toBe(200);
      const cert = res.body.certificates[0];
      expect(cert.course).toBeDefined();
      expect(cert.course.courseTitle).toBe("Security 101");
      expect(cert.course.level).toBe("advanced");
    });

    it("returns 401 when user is not authenticated", async () => {
      mockCurrentUser = {};

      const res = await request(app).get("/api/certificates");

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/certificates/:certificateId
  // -----------------------------------------------------------------------

  describe("GET /api/certificates/:certificateId", () => {
    it("returns a specific certificate by ID", async () => {
      const course = await seedCourse({ createdBy: user._id });
      const cert = await seedCertificate({ user: user._id, course: course._id, userName: "John Doe", userEmail: "john@test.com", courseTitle: "Test Course" });

      const res = await request(app).get(`/api/certificates/${cert._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.certificate.certificateNumber).toBe(cert.certificateNumber);
    });

    it("returns 404 for non-existent certificate", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/certificates/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it("returns 403 when accessing another user's certificate", async () => {
      const otherUser = await seedUser({ email: "other@test.com" });
      const course = await seedCourse({ createdBy: user._id });
      const cert = await seedCertificate({ user: otherUser._id, course: course._id, userName: "Other", userEmail: "other@test.com" });

      const res = await request(app).get(`/api/certificates/${cert._id}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Access denied");
    });

    it("populates user and course data", async () => {
      const course = await seedCourse({ courseTitle: "Phishing 101", createdBy: user._id });
      const cert = await seedCertificate({ user: user._id, course: course._id, userName: "John", userEmail: "john@test.com", courseTitle: "Phishing 101" });

      const res = await request(app).get(`/api/certificates/${cert._id}`);

      expect(res.status).toBe(200);
      expect(res.body.certificate.user).toBeDefined();
      expect(res.body.certificate.course).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/certificates/course/:courseId
  // -----------------------------------------------------------------------

  describe("GET /api/certificates/course/:courseId", () => {
    it("returns certificate for a specific course", async () => {
      const course = await seedCourse({ createdBy: user._id });
      await seedCertificate({ user: user._id, course: course._id, userName: "John", userEmail: "john@test.com", courseTitle: "Test" });

      const res = await request(app).get(`/api/certificates/course/${course._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.certificate).toBeDefined();
    });

    it("returns 404 when no certificate exists for course", async () => {
      const course = await seedCourse({ createdBy: user._id });

      const res = await request(app).get(`/api/certificates/course/${course._id}`);

      expect(res.status).toBe(404);
      expect(res.body.certificate).toBeNull();
    });

    it("returns 401 when not authenticated", async () => {
      mockCurrentUser = {};
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).get(`/api/certificates/course/${fakeId}`);

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/certificates/generate/:courseId
  // -----------------------------------------------------------------------

  describe("POST /api/certificates/generate/:courseId", () => {
    it("generates a certificate for a completed course", async () => {
      const course = await seedCourse({
        courseTitle: "Completed Course",
        createdBy: user._id,
        modules: [{ title: "M1", sections: [{ title: "S1", material: "C" }], quiz: [] }],
      });
      await CourseProgress.create({
        user: user._id,
        course: course._id,
        completed: ["0-0"],
      });

      const res = await request(app).post(`/api/certificates/generate/${course._id}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.certificate).toBeDefined();
      expect(res.body.certificate.certificateNumber).toMatch(/^CERT-/);
      expect(res.body.certificate.courseTitle).toBe("Completed Course");
    });

    it("returns existing certificate if already generated", async () => {
      const course = await seedCourse({
        createdBy: user._id,
        modules: [{ title: "M1", sections: [{ title: "S1", material: "C" }], quiz: [] }],
      });
      await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0"] });
      await seedCertificate({ user: user._id, course: course._id, userName: "John", userEmail: "john@test.com", courseTitle: "Test" });

      const res = await request(app).post(`/api/certificates/generate/${course._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Certificate already exists");
    });

    it("returns 404 for non-existent course", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).post(`/api/certificates/generate/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Course not found");
    });

    it("returns 400 when course is not completed", async () => {
      const course = await seedCourse({
        createdBy: user._id,
        modules: [
          { title: "M1", sections: [{ title: "S1", material: "C" }, { title: "S2", material: "C2" }], quiz: [] },
        ],
      });
      await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0"] });

      const res = await request(app).post(`/api/certificates/generate/${course._id}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("completed");
    });

    it("returns 400 when no progress exists", async () => {
      const course = await seedCourse({ createdBy: user._id });

      const res = await request(app).post(`/api/certificates/generate/${course._id}`);

      expect(res.status).toBe(400);
    });

    it("handles course with quiz in completion check", async () => {
      const course = await seedCourse({
        createdBy: user._id,
        modules: [{
          title: "M1",
          sections: [{ title: "S1", material: "C" }],
          quiz: [{ question: "Q1?", choices: ["A", "B"], correctIndex: 0 }],
        }],
      });
      await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0", "0-quiz"] });

      const res = await request(app).post(`/api/certificates/generate/${course._id}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("returns 401 when not authenticated", async () => {
      mockCurrentUser = {};
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).post(`/api/certificates/generate/${fakeId}`);

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/certificates/count/non-affiliated
  // -----------------------------------------------------------------------

  describe("GET /api/certificates/count/non-affiliated", () => {
    it("returns certificate count for non-affiliated users (system_admin)", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const nonAff1 = await seedUser({ role: "non_affiliated", email: "na1@test.com" });
      const nonAff2 = await seedUser({ role: "non_affiliated", email: "na2@test.com" });
      const affiliated = await seedUser({ role: "affiliated", email: "aff@test.com", orgId: org._id });

      const course = await seedCourse({ createdBy: sysAdmin._id });
      await seedCertificate({ user: nonAff1._id, course: course._id, userName: "NA1", userEmail: "na1@test.com" });
      await seedCertificate({ user: nonAff2._id, course: course._id, userName: "NA2", userEmail: "na2@test.com", certificateNumber: `CERT-NA2-${Date.now()}` });
      await seedCertificate({ user: affiliated._id, course: course._id, userName: "Aff", userEmail: "aff@test.com", certificateNumber: `CERT-AFF-${Date.now()}` });

      const res = await request(app).get("/api/certificates/count/non-affiliated");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalCertificates).toBe(2);
    });

    it("returns 403 for non-system_admin users", async () => {
      const res = await request(app).get("/api/certificates/count/non-affiliated");

      expect(res.status).toBe(403);
    });

    it("returns 0 when no non-affiliated users have certificates", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const res = await request(app).get("/api/certificates/count/non-affiliated");

      expect(res.status).toBe(200);
      expect(res.body.totalCertificates).toBe(0);
    });
  });
});
