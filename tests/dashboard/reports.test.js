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
const Report = require("../../src/models/Report");

const reportRoutes = require("../../src/routes/reports");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/reports", reportRoutes);
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
    displayName: overrides.displayName || "Test Admin",
    role: overrides.role || "client_admin",
    orgId: overrides.orgId || null,
    ...overrides,
  });
}

async function seedReport(overrides = {}) {
  return Report.create({
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    organizationId: overrides.organizationId || null,
    reportName: overrides.reportName || "Analytics Report",
    organizationName: overrides.organizationName || "Test Org",
    reportDate: overrides.reportDate || "April 21, 2026",
    fileName: overrides.fileName || "report.pdf",
    pdfFile: overrides.pdfFile || {
      data: Buffer.from("%PDF-1.4 test content"),
      contentType: "application/pdf",
    },
    reportData: overrides.reportData || {},
    ...overrides,
  });
}

// ===================================================================
// REPORTS
// ===================================================================

describe("Reports API", () => {
  let org, adminUser;

  beforeEach(async () => {
    org = await seedOrg();
    adminUser = await seedUser({ role: "client_admin", orgId: org._id, email: "admin@test.com" });
    mockCurrentUser = {
      _id: adminUser._id,
      clerkId: adminUser.clerkId,
      email: adminUser.email,
      role: "client_admin",
      orgId: org._id,
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/reports
  // -----------------------------------------------------------------------

  describe("POST /api/reports", () => {
    it("creates a report with PDF upload (client_admin)", async () => {
      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "Test Report")
        .field("organizationName", "Test Org")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "test-report.pdf")
        .field("reportData", JSON.stringify({ userSummary: { totalUsers: 10 } }))
        .attach("pdf", Buffer.from("%PDF-1.4 test"), { filename: "test.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.report.reportName).toBe("Test Report");
      expect(res.body.report.fileName).toBe("test-report.pdf");
    });

    it("system_admin can create reports", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "System Report")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "sys-report.pdf")
        .attach("pdf", Buffer.from("%PDF-1.4 sys"), { filename: "sys.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(201);
      expect(res.body.report.reportName).toBe("System Report");
    });

    it("returns 400 when no PDF file is provided", async () => {
      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "No PDF")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "nopdf.pdf");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("PDF file is required");
    });

    it("returns 403 for affiliated users", async () => {
      const affUser = await seedUser({ role: "affiliated", orgId: org._id, email: "aff@test.com" });
      mockCurrentUser = { _id: affUser._id, clerkId: affUser.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "Blocked")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "blocked.pdf")
        .attach("pdf", Buffer.from("%PDF-1.4"), { filename: "b.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("admins");
    });

    it("returns 403 for non_affiliated users", async () => {
      const nonAff = await seedUser({ role: "non_affiliated", email: "na@test.com" });
      mockCurrentUser = { _id: nonAff._id, clerkId: nonAff.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "Blocked")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "blocked.pdf")
        .attach("pdf", Buffer.from("%PDF-1.4"), { filename: "b.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(403);
    });

    it("returns 401 when not authenticated", async () => {
      mockCurrentUser = {};

      const res = await request(app)
        .post("/api/reports")
        .field("reportName", "Unauth")
        .attach("pdf", Buffer.from("%PDF-1.4"), { filename: "u.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(401);
    });

    it("uses default reportName when not provided", async () => {
      const res = await request(app)
        .post("/api/reports")
        .field("organizationName", "MyOrg")
        .field("reportDate", "April 21, 2026")
        .field("fileName", "default-name.pdf")
        .attach("pdf", Buffer.from("%PDF-1.4"), { filename: "d.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(201);
      expect(res.body.report.reportName).toContain("Analytics Report");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/reports
  // -----------------------------------------------------------------------

  describe("GET /api/reports", () => {
    it("returns admin's reports sorted by createdAt desc", async () => {
      await seedReport({ createdBy: adminUser._id, reportName: "Report A", organizationId: org._id });
      await new Promise((r) => setTimeout(r, 50));
      await seedReport({ createdBy: adminUser._id, reportName: "Report B", organizationId: org._id });

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reports.length).toBe(2);
      expect(res.body.reports[0].reportName).toBe("Report B");
    });

    it("returns only the current admin's reports", async () => {
      const otherAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "other@test.com" });
      await seedReport({ createdBy: adminUser._id, reportName: "Mine" });
      await seedReport({ createdBy: otherAdmin._id, reportName: "Others" });

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports.length).toBe(1);
      expect(res.body.reports[0].reportName).toBe("Mine");
    });

    it("excludes pdfFile from list response", async () => {
      await seedReport({ createdBy: adminUser._id });

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports[0].pdfFile).toBeUndefined();
    });

    it("returns empty array when no reports exist", async () => {
      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports).toEqual([]);
    });

    it("returns 403 for affiliated users", async () => {
      const affUser = await seedUser({ role: "affiliated", orgId: org._id, email: "aff2@test.com" });
      mockCurrentUser = { _id: affUser._id, clerkId: affUser.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(403);
    });

    it("returns 403 for non_affiliated users", async () => {
      const nonAff = await seedUser({ role: "non_affiliated", email: "na2@test.com" });
      mockCurrentUser = { _id: nonAff._id, clerkId: nonAff.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(403);
    });

    it("populates createdBy in reports", async () => {
      await seedReport({ createdBy: adminUser._id });

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      const report = res.body.reports[0];
      expect(report.createdBy).toBeDefined();
      expect(report.createdBy.displayName).toBe("Test Admin");
    });

    it("system_admin can list their reports", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys2@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };
      await seedReport({ createdBy: sysAdmin._id, reportName: "Sys Report" });

      const res = await request(app).get("/api/reports");

      expect(res.status).toBe(200);
      expect(res.body.reports.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/reports/:reportId/download
  // -----------------------------------------------------------------------

  describe("GET /api/reports/:reportId/download", () => {
    it("downloads a PDF report (owner)", async () => {
      const report = await seedReport({ createdBy: adminUser._id, fileName: "test-download.pdf" });

      const res = await request(app).get(`/api/reports/${report._id}/download`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("test-download.pdf");
    });

    it("system_admin can download any report", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys3@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const report = await seedReport({ createdBy: adminUser._id, fileName: "other-report.pdf" });

      const res = await request(app).get(`/api/reports/${report._id}/download`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });

    it("returns 403 when client_admin downloads another admin's report", async () => {
      const otherAdmin = await seedUser({ role: "client_admin", orgId: org._id, email: "other2@test.com" });
      const report = await seedReport({ createdBy: otherAdmin._id });

      const res = await request(app).get(`/api/reports/${report._id}/download`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Access denied");
    });

    it("returns 404 for non-existent report", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).get(`/api/reports/${fakeId}/download`);

      expect(res.status).toBe(404);
    });

    it("returns 404 when report has no pdfFile data", async () => {
      const report = await seedReport({ createdBy: adminUser._id });
      await Report.updateOne({ _id: report._id }, { $unset: { "pdfFile.data": 1 } });

      const res = await request(app).get(`/api/reports/${report._id}/download`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("PDF file not found");
    });

    it("returns 403 for affiliated user", async () => {
      const affUser = await seedUser({ role: "affiliated", orgId: org._id, email: "aff3@test.com" });
      mockCurrentUser = { _id: affUser._id, clerkId: affUser.clerkId, role: "affiliated", orgId: org._id };

      const report = await seedReport({ createdBy: adminUser._id });

      const res = await request(app).get(`/api/reports/${report._id}/download`);

      expect(res.status).toBe(403);
    });

    it("returns correct file content", async () => {
      const pdfContent = Buffer.from("%PDF-1.4 specific test content here");
      const report = await seedReport({ createdBy: adminUser._id, pdfFile: { data: pdfContent, contentType: "application/pdf" } });

      const res = await request(app).get(`/api/reports/${report._id}/download`).buffer(true);

      expect(res.status).toBe(200);
      expect(Buffer.from(res.body).toString()).toContain("%PDF-1.4 specific test content here");
    });
  });
});
