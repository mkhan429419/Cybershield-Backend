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
    if (req.user.role === "client_admin") {
      const userOrgId = req.user.orgId?._id?.toString() || req.user.orgId?.toString();
      if (!userOrgId || userOrgId !== req.params.orgId)
        return res.status(403).json({ error: "Access denied to this organization" });
      return next();
    }
    return res.status(403).json({ error: "Insufficient permissions" });
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
  getTotalSubmodulesForCourse: jest.fn(() => 0),
}));

jest.mock("../../src/services/remedialAssignmentService", () => ({
  markRemedialAssignmentsCompletedForCourse: jest.fn(async () => {}),
}));

jest.mock("../../src/utils/badgeMapping", () => ({
  getBadgeLabel: jest.fn((id) => `Badge-${id}`),
}));

jest.mock("../../src/services/nodemailerService", () => ({
  sendEmail: jest.fn(async () => ({ success: true })),
}));

jest.mock("../../src/services/emailFormatter", () => ({
  formatEmailForSending: jest.fn((t) => t),
}));

jest.mock("../../src/services/twilioService", () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true })),
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
const Course = require("../../src/models/Course");
const CourseProgress = require("../../src/models/CourseProgress");
const Certificate = require("../../src/models/Certificate");

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const courseRoutes = require("../../src/routes/courses");
const certRoutes = require("../../src/routes/certificates");

// ---------------------------------------------------------------------------
// Express apps
// ---------------------------------------------------------------------------
function buildApp(path, routes) {
  const app = express();
  app.use(express.json());
  app.use(path, routes);
  return app;
}

const courseApp = buildApp("/api/courses", courseRoutes);
const certApp = buildApp("/api/certificates", certRoutes);

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
    role: overrides.role || "affiliated",
    orgId: overrides.orgId || null,
    status: overrides.status || "active",
    ...overrides,
  });
}

async function seedCourse(overrides = {}) {
  return Course.create({
    courseTitle: overrides.courseTitle || "Test Course",
    description: overrides.description || "A test course",
    level: overrides.level || "basic",
    modules: overrides.modules || [
      {
        title: "Module 1",
        sections: [{ title: "Section 1", material: "Content here" }],
        quiz: [{ question: "What is 1+1?", choices: ["1", "2", "3"], correctIndex: 1 }],
      },
    ],
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    createdByName: overrides.createdByName || "Creator",
    createdByEmail: overrides.createdByEmail || "creator@test.com",
    badges: overrides.badges || [],
    orgId: overrides.orgId === undefined ? null : overrides.orgId,
  });
}

// ===================================================================
// COURSE CRUD
// ===================================================================

describe("Course CRUD — getCourses", () => {
  let org, sysAdmin, clientAdmin, affiliated;

  beforeEach(async () => {
    org = await seedOrg("CourseOrg");
    sysAdmin = await seedUser({ role: "system_admin", email: "sa@test.com" });
    clientAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca@test.com" });
    affiliated = await seedUser({ role: "affiliated", orgId: org._id, email: "aff@test.com" });
  });

  it("system_admin sees only courses with orgId=null", async () => {
    await seedCourse({ courseTitle: "System Course", orgId: null, createdBy: sysAdmin._id });
    await seedCourse({ courseTitle: "Org Course", orgId: org._id, createdBy: clientAdmin._id });

    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.courses.every((c) => c.orgId === null)).toBe(true);
    expect(res.body.courses.some((c) => c.courseTitle === "System Course")).toBe(true);
    expect(res.body.courses.some((c) => c.courseTitle === "Org Course")).toBe(false);
  });

  it("client_admin sees only their org's courses", async () => {
    await seedCourse({ courseTitle: "My Org Course", orgId: org._id, createdBy: clientAdmin._id });
    await seedCourse({ courseTitle: "Other Course", orgId: null, createdBy: sysAdmin._id });

    mockCurrentUser = clientAdmin;
    const res = await request(courseApp).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body.courses.some((c) => c.courseTitle === "My Org Course")).toBe(true);
    expect(res.body.courses.some((c) => c.courseTitle === "Other Course")).toBe(false);
  });

  it("affiliated user sees only their org's courses", async () => {
    await seedCourse({ courseTitle: "Org Course", orgId: org._id, createdBy: clientAdmin._id });
    await seedCourse({ courseTitle: "System Course", orgId: null, createdBy: sysAdmin._id });

    mockCurrentUser = affiliated;
    const res = await request(courseApp).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body.courses.some((c) => c.courseTitle === "Org Course")).toBe(true);
    expect(res.body.courses.some((c) => c.courseTitle === "System Course")).toBe(false);
  });

  it("returns pagination info", async () => {
    await seedCourse({ courseTitle: "C1", orgId: null, createdBy: sysAdmin._id });
    await seedCourse({ courseTitle: "C2", orgId: null, createdBy: sysAdmin._id });

    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).get("/api/courses?page=1&limit=1");

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.pages).toBe(2);
    expect(res.body.courses).toHaveLength(1);
  });

  it("returns empty for affiliated with no orgId", async () => {
    const noOrgUser = await seedUser({ role: "affiliated", orgId: null, email: "noorg@test.com" });
    mockCurrentUser = noOrgUser;
    const res = await request(courseApp).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body.courses).toEqual([]);
  });

  it("supports sort=oldest", async () => {
    await seedCourse({ courseTitle: "First", orgId: null, createdBy: sysAdmin._id });
    await new Promise((r) => setTimeout(r, 50));
    await seedCourse({ courseTitle: "Second", orgId: null, createdBy: sysAdmin._id });

    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).get("/api/courses?sort=oldest");

    expect(res.status).toBe(200);
    expect(res.body.courses[0].courseTitle).toBe("First");
  });
});

describe("Course CRUD — getCourseById", () => {
  let org, sysAdmin, clientAdmin, affiliated;

  beforeEach(async () => {
    org = await seedOrg("DetailOrg");
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-detail@test.com" });
    clientAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-detail@test.com" });
    affiliated = await seedUser({ role: "affiliated", orgId: org._id, email: "aff-detail@test.com" });
  });

  it("returns course with createdBy object", async () => {
    const course = await seedCourse({ orgId: null, createdBy: sysAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).get(`/api/courses/${course._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.course.courseTitle).toBe("Test Course");
    expect(res.body.course.createdBy).toBeDefined();
    expect(res.body.course.createdBy._id).toBeDefined();
  });

  it("returns 404 for non-existent course", async () => {
    mockCurrentUser = sysAdmin;
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(courseApp).get(`/api/courses/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Course not found");
  });

  it("system_admin cannot access org course", async () => {
    const orgCourse = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).get(`/api/courses/${orgCourse._id}`);

    expect(res.status).toBe(403);
  });

  it("affiliated user cannot access another org's course", async () => {
    const otherOrg = await seedOrg("OtherOrg");
    const otherCourse = await seedCourse({ orgId: otherOrg._id, createdBy: new mongoose.Types.ObjectId() });
    mockCurrentUser = affiliated;
    const res = await request(courseApp).get(`/api/courses/${otherCourse._id}`);

    expect(res.status).toBe(403);
  });

  it("affiliated user can access their org's course", async () => {
    const orgCourse = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = affiliated;
    const res = await request(courseApp).get(`/api/courses/${orgCourse._id}`);

    expect(res.status).toBe(200);
    expect(res.body.course.courseTitle).toBe("Test Course");
  });
});

describe("Course CRUD — createCourse", () => {
  let org, sysAdmin, clientAdmin, affiliated;

  beforeEach(async () => {
    org = await seedOrg("CreateOrg");
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-create@test.com" });
    clientAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-create@test.com" });
    affiliated = await seedUser({ role: "affiliated", orgId: org._id, email: "aff-create@test.com" });
  });

  it("system_admin creates course with orgId=null", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .post("/api/courses")
      .send({
        courseTitle: "New Course",
        description: "A new course",
        modules: [{ title: "M1", sections: [{ title: "S1", material: "Content" }], quiz: [] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.course.courseTitle).toBe("New Course");
    expect(res.body.course.orgId).toBeNull();
  });

  it("client_admin creates course with their orgId", async () => {
    mockCurrentUser = clientAdmin;
    const res = await request(courseApp)
      .post("/api/courses")
      .send({
        courseTitle: "Org Course",
        modules: [{ title: "M1", sections: [{ title: "S1", material: "Content" }] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.course.orgId.toString()).toBe(org._id.toString());
  });

  it("returns 400 when courseTitle is missing", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).post("/api/courses").send({ description: "No title" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("courseTitle is required");
  });

  it("affiliated user cannot create courses", async () => {
    mockCurrentUser = affiliated;
    const res = await request(courseApp)
      .post("/api/courses")
      .send({ courseTitle: "Unauthorized" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Insufficient permissions");
  });

  it("validates course limits for basic level", async () => {
    mockCurrentUser = sysAdmin;
    const modules = Array.from({ length: 6 }, (_, i) => ({
      title: `Module ${i}`,
      sections: [{ title: "S", material: "C" }],
    }));
    const res = await request(courseApp)
      .post("/api/courses")
      .send({ courseTitle: "Too Many Modules", level: "basic", modules });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Basic course limit: max 5 modules");
  });

  it("creates course with badges", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .post("/api/courses")
      .send({
        courseTitle: "Badged Course",
        badges: ["phishing_expert", "security_champion"],
        modules: [{ title: "M1", sections: [{ title: "S1", material: "C" }] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.course.badges).toEqual(["phishing_expert", "security_champion"]);
  });

  it("creates advanced course", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .post("/api/courses")
      .send({
        courseTitle: "Advanced Course",
        level: "advanced",
        modules: [{ title: "M1", sections: [{ title: "S1", material: "C" }] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.course.level).toBe("advanced");
  });
});

describe("Course CRUD — updateCourse", () => {
  let org, sysAdmin, clientAdmin;

  beforeEach(async () => {
    org = await seedOrg("UpdateOrg");
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-upd@test.com" });
    clientAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-upd@test.com" });
  });

  it("system_admin updates a system course", async () => {
    const course = await seedCourse({ orgId: null, createdBy: sysAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .put(`/api/courses/${course._id}`)
      .send({ courseTitle: "Updated Title" });

    expect(res.status).toBe(200);
    expect(res.body.course.courseTitle).toBe("Updated Title");
  });

  it("client_admin updates their org course", async () => {
    const course = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = clientAdmin;
    const res = await request(courseApp)
      .put(`/api/courses/${course._id}`)
      .send({ description: "Updated desc" });

    expect(res.status).toBe(200);
    expect(res.body.course.description).toBe("Updated desc");
  });

  it("system_admin cannot update org course", async () => {
    const orgCourse = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .put(`/api/courses/${orgCourse._id}`)
      .send({ courseTitle: "Hacked" });

    expect(res.status).toBe(403);
  });

  it("client_admin cannot update another org's course", async () => {
    const otherOrg = await seedOrg("OtherOrg");
    const otherCourse = await seedCourse({ orgId: otherOrg._id, createdBy: new mongoose.Types.ObjectId() });
    mockCurrentUser = clientAdmin;
    const res = await request(courseApp)
      .put(`/api/courses/${otherCourse._id}`)
      .send({ courseTitle: "Hacked" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent course", async () => {
    mockCurrentUser = sysAdmin;
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(courseApp)
      .put(`/api/courses/${fakeId}`)
      .send({ courseTitle: "Ghost" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for empty courseTitle", async () => {
    const course = await seedCourse({ orgId: null, createdBy: sysAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp)
      .put(`/api/courses/${course._id}`)
      .send({ courseTitle: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("courseTitle must be a non-empty string");
  });
});

describe("Course CRUD — deleteCourse", () => {
  let org, sysAdmin, clientAdmin, affiliated;

  beforeEach(async () => {
    org = await seedOrg("DeleteOrg");
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-del@test.com" });
    clientAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-del@test.com" });
    affiliated = await seedUser({ role: "affiliated", orgId: org._id, email: "aff-del@test.com" });
  });

  it("system_admin deletes a system course and its progress", async () => {
    const course = await seedCourse({ orgId: null, createdBy: sysAdmin._id });
    await CourseProgress.create({ user: sysAdmin._id, course: course._id, completed: ["0-0"] });

    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).delete(`/api/courses/${course._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const deleted = await Course.findById(course._id);
    expect(deleted).toBeNull();
    const progress = await CourseProgress.findOne({ course: course._id });
    expect(progress).toBeNull();
  });

  it("client_admin deletes their org course", async () => {
    const course = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = clientAdmin;
    const res = await request(courseApp).delete(`/api/courses/${course._id}`);

    expect(res.status).toBe(200);
  });

  it("affiliated user cannot delete courses", async () => {
    const course = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = affiliated;
    const res = await request(courseApp).delete(`/api/courses/${course._id}`);

    expect(res.status).toBe(403);
  });

  it("system_admin cannot delete org course", async () => {
    const orgCourse = await seedCourse({ orgId: org._id, createdBy: clientAdmin._id });
    mockCurrentUser = sysAdmin;
    const res = await request(courseApp).delete(`/api/courses/${orgCourse._id}`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent course", async () => {
    mockCurrentUser = sysAdmin;
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(courseApp).delete(`/api/courses/${fakeId}`);

    expect(res.status).toBe(404);
  });
});

// ===================================================================
// COURSE PROGRESS
// ===================================================================

describe("Course Progress — mark/unmark/get", () => {
  let user, course;

  beforeEach(async () => {
    const org = await seedOrg("ProgressOrg");
    user = await seedUser({ role: "affiliated", orgId: org._id, email: "prog@test.com" });
    course = await seedCourse({
      courseTitle: "Progress Course",
      orgId: org._id,
      createdBy: new mongoose.Types.ObjectId(),
      modules: [
        {
          title: "Module 1",
          sections: [
            { title: "Section 1", material: "Content 1" },
            { title: "Section 2", material: "Content 2" },
          ],
          quiz: [{ question: "Q?", choices: ["A", "B"], correctIndex: 0 }],
        },
      ],
      badges: ["phishing_expert"],
    });
  });

  it("getProgress returns empty array initially", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp).get(`/api/courses/${course._id}/progress`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.completed).toEqual([]);
  });

  it("markComplete adds submodule to completed", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress`)
      .send({ submoduleId: "0-0" });

    expect(res.status).toBe(200);
    expect(res.body.completed).toContain("0-0");
    expect(res.body.certificateGenerated).toBe(false);
  });

  it("markComplete is idempotent (addToSet)", async () => {
    mockCurrentUser = user;
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-0" });
    const res = await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-0" });

    expect(res.status).toBe(200);
    expect(res.body.completed.filter((c) => c === "0-0")).toHaveLength(1);
  });

  it("unmarkComplete removes submodule from completed", async () => {
    mockCurrentUser = user;
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-0" });
    const res = await request(courseApp)
      .delete(`/api/courses/${course._id}/progress`)
      .send({ submoduleId: "0-0" });

    expect(res.status).toBe(200);
    expect(res.body.completed).not.toContain("0-0");
  });

  it("markComplete returns 400 when submoduleId is missing", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp).post(`/api/courses/${course._id}/progress`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("submoduleId is required");
  });

  it("completing all sections + quiz generates certificate and assigns badges", async () => {
    mockCurrentUser = user;
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-0" });
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-1" });
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress`)
      .send({ submoduleId: "0-quiz" });

    expect(res.status).toBe(200);
    expect(res.body.certificateGenerated).toBe(true);

    const cert = await Certificate.findOne({ user: user._id, course: course._id });
    expect(cert).toBeDefined();
    expect(cert.courseTitle).toBe("Progress Course");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.badges).toContain("Badge-phishing_expert");
  });

  it("getProgress shows all completed items after marking", async () => {
    mockCurrentUser = user;
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-0" });
    await request(courseApp).post(`/api/courses/${course._id}/progress`).send({ submoduleId: "0-1" });
    const res = await request(courseApp).get(`/api/courses/${course._id}/progress`);

    expect(res.status).toBe(200);
    expect(res.body.completed).toContain("0-0");
    expect(res.body.completed).toContain("0-1");
  });
});

// ===================================================================
// CERTIFICATES
// ===================================================================

describe("Certificates — generate and retrieve", () => {
  let user, course;

  beforeEach(async () => {
    const org = await seedOrg("CertOrg");
    user = await seedUser({ role: "affiliated", orgId: org._id, email: "cert@test.com" });
    course = await seedCourse({
      courseTitle: "Cert Course",
      orgId: org._id,
      createdBy: new mongoose.Types.ObjectId(),
      modules: [
        {
          title: "Module 1",
          sections: [{ title: "Section 1", material: "Content" }],
          quiz: [],
        },
      ],
    });
  });

  it("generates certificate for completed course", async () => {
    await CourseProgress.create({
      user: user._id,
      course: course._id,
      completed: ["0-0"],
    });

    mockCurrentUser = user;
    const res = await request(certApp).post(`/api/certificates/generate/${course._id}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.certificate.courseTitle).toBe("Cert Course");
    expect(res.body.certificate.certificateNumber).toMatch(/^CERT-/);
    expect(res.body.certificate.userName).toBe("Test User");
  });

  it("returns existing certificate if already generated", async () => {
    await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0"] });
    mockCurrentUser = user;

    await request(certApp).post(`/api/certificates/generate/${course._id}`);
    const res = await request(certApp).post(`/api/certificates/generate/${course._id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Certificate already exists");
  });

  it("returns 400 for incomplete course", async () => {
    mockCurrentUser = user;
    const res = await request(certApp).post(`/api/certificates/generate/${course._id}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Course must be completed");
  });

  it("returns 404 for non-existent course", async () => {
    mockCurrentUser = user;
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(certApp).post(`/api/certificates/generate/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Course not found");
  });

  it("getUserCertificates returns user's certificates", async () => {
    await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0"] });
    mockCurrentUser = user;
    await request(certApp).post(`/api/certificates/generate/${course._id}`);

    const res = await request(certApp).get("/api/certificates");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.certificates.length).toBeGreaterThanOrEqual(1);
  });

  it("getCertificateByCourse returns certificate for specific course", async () => {
    await CourseProgress.create({ user: user._id, course: course._id, completed: ["0-0"] });
    mockCurrentUser = user;
    await request(certApp).post(`/api/certificates/generate/${course._id}`);

    const res = await request(certApp).get(`/api/certificates/course/${course._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.certificate.courseTitle).toBe("Cert Course");
  });

  it("getCertificateByCourse returns 404 when no cert exists", async () => {
    mockCurrentUser = user;
    const res = await request(certApp).get(`/api/certificates/course/${course._id}`);

    expect(res.status).toBe(404);
    expect(res.body.certificate).toBeNull();
  });
});

// ===================================================================
// ACTIVITY RESULT & RETRY
// ===================================================================

describe("Course Activities — recordActivityResult & activityRetry", () => {
  let user, course;

  beforeEach(async () => {
    const org = await seedOrg("ActivityOrg");
    user = await seedUser({ role: "affiliated", orgId: org._id, email: "act@test.com" });
    course = await seedCourse({
      orgId: org._id,
      createdBy: new mongoose.Types.ObjectId(),
      modules: [{ title: "M1", sections: [{ title: "S1", material: "C" }], activityType: "email" }],
    });
  });

  it("records activity result with passed=true", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ submoduleId: "0-activity", passed: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("records activity result with passed=false", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ submoduleId: "0-activity", passed: false });

    expect(res.status).toBe(200);
  });

  it("returns 400 when submoduleId is missing", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ passed: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("submoduleId is required");
  });

  it("returns 400 when passed is not boolean", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ submoduleId: "0-activity", passed: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("passed (boolean) is required");
  });

  it("returns 400 when submoduleId doesn't end with -activity", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ submoduleId: "0-0", passed: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("submoduleId must end with -activity");
  });

  it("activityRetry clears activity data", async () => {
    mockCurrentUser = user;
    await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-result`)
      .send({ submoduleId: "0-activity", passed: false });

    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-retry`)
      .send({ submoduleId: "0-activity" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("activityRetry returns 400 for invalid submoduleId", async () => {
    mockCurrentUser = user;
    const res = await request(courseApp)
      .post(`/api/courses/${course._id}/progress/activity-retry`)
      .send({ submoduleId: "0-quiz" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("submoduleId must end with -activity");
  });
});
