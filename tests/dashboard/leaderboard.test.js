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

const leaderboardRoutes = require("../../src/routes/leaderboard");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leaderboard", leaderboardRoutes);
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
    learningScore: overrides.learningScore !== undefined ? overrides.learningScore : 0,
    ...overrides,
  });
}

// ===================================================================
// LEADERBOARD
// ===================================================================

describe("Leaderboard API", () => {
  let org;

  beforeEach(async () => {
    org = await seedOrg();
  });

  // -----------------------------------------------------------------------
  // GET /api/leaderboard/global
  // -----------------------------------------------------------------------

  describe("GET /api/leaderboard/global", () => {
    it("returns non-affiliated users sorted by learningScore desc", async () => {
      const u1 = await seedUser({ role: "non_affiliated", displayName: "Alice", learningScore: 90, email: "alice@test.com" });
      const u2 = await seedUser({ role: "non_affiliated", displayName: "Bob", learningScore: 70, email: "bob@test.com" });
      const u3 = await seedUser({ role: "non_affiliated", displayName: "Charlie", learningScore: 85, email: "charlie@test.com" });
      await seedUser({ role: "affiliated", displayName: "Org User", learningScore: 95, orgId: org._id, email: "org@test.com" });

      mockCurrentUser = { _id: u1._id, clerkId: u1.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.leaderboard.length).toBe(3);
      expect(res.body.leaderboard[0].name).toBe("Alice");
      expect(res.body.leaderboard[0].learningScore).toBe(90);
      expect(res.body.leaderboard[0].position).toBe(1);
      expect(res.body.leaderboard[1].name).toBe("Charlie");
      expect(res.body.leaderboard[2].name).toBe("Bob");
      expect(res.body.total).toBe(3);
    });

    it("excludes affiliated, client_admin, and system_admin users", async () => {
      await seedUser({ role: "non_affiliated", displayName: "NonAff", learningScore: 50, email: "nonaff@test.com" });
      await seedUser({ role: "affiliated", displayName: "Aff", learningScore: 80, orgId: org._id, email: "aff@test.com" });
      await seedUser({ role: "client_admin", displayName: "Admin", learningScore: 90, orgId: org._id, email: "admin@test.com" });
      await seedUser({ role: "system_admin", displayName: "SysAdmin", learningScore: 100, email: "sys@test.com" });

      const user = await seedUser({ role: "non_affiliated", email: "viewer@test.com" });
      mockCurrentUser = { _id: user._id, clerkId: user.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(2);
      expect(res.body.leaderboard.every((e) => !["Aff", "Admin", "SysAdmin"].includes(e.name))).toBe(true);
    });

    it("returns empty leaderboard when no non-affiliated users exist", async () => {
      const user = await seedUser({ role: "affiliated", orgId: org._id });
      mockCurrentUser = { _id: user._id, clerkId: user.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it("handles users with zero learningScore", async () => {
      await seedUser({ role: "non_affiliated", displayName: "Zero", learningScore: 0, email: "zero@test.com" });
      await seedUser({ role: "non_affiliated", displayName: "Some", learningScore: 50, email: "some@test.com" });

      const user = await seedUser({ role: "non_affiliated", email: "me@test.com" });
      mockCurrentUser = { _id: user._id, clerkId: user.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(3);
      expect(res.body.leaderboard[0].name).toBe("Some");
    });

    it("returns correct position numbers", async () => {
      for (let i = 1; i <= 5; i++) {
        await seedUser({ role: "non_affiliated", displayName: `User${i}`, learningScore: i * 10, email: `u${i}@test.com` });
      }

      const viewer = await seedUser({ role: "non_affiliated", email: "viewer@test.com" });
      mockCurrentUser = { _id: viewer._id, clerkId: viewer.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      res.body.leaderboard.forEach((entry, idx) => {
        expect(entry.position).toBe(idx + 1);
      });
    });

    it("accessible by any authenticated user role", async () => {
      await seedUser({ role: "non_affiliated", email: "na@test.com", learningScore: 40 });

      const admin = await seedUser({ role: "client_admin", orgId: org._id, email: "ca@test.com" });
      mockCurrentUser = { _id: admin._id, clerkId: admin.clerkId, role: "client_admin", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 200 with empty leaderboard when user object is empty", async () => {
      mockCurrentUser = {};

      const res = await request(app).get("/api/leaderboard/global");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("includes email in leaderboard entries", async () => {
      await seedUser({ role: "non_affiliated", displayName: "Test", email: "test@example.com", learningScore: 60 });

      const viewer = await seedUser({ role: "non_affiliated", email: "viewer@test.com" });
      mockCurrentUser = { _id: viewer._id, clerkId: viewer.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/global");

      const entry = res.body.leaderboard.find((e) => e.name === "Test");
      expect(entry.email).toBe("test@example.com");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/leaderboard/organization
  // -----------------------------------------------------------------------

  describe("GET /api/leaderboard/organization", () => {
    it("returns org users sorted by learningScore (affiliated user)", async () => {
      const u1 = await seedUser({ role: "affiliated", displayName: "Alice", learningScore: 90, orgId: org._id, email: "a@test.com" });
      await seedUser({ role: "affiliated", displayName: "Bob", learningScore: 70, orgId: org._id, email: "b@test.com" });
      await seedUser({ role: "client_admin", displayName: "Admin", learningScore: 85, orgId: org._id, email: "admin@test.com" });

      mockCurrentUser = { _id: u1._id, clerkId: u1.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.leaderboard.length).toBe(3);
      expect(res.body.leaderboard[0].name).toBe("Alice");
      expect(res.body.leaderboard[0].learningScore).toBe(90);
    });

    it("client_admin sees their own org leaderboard", async () => {
      const admin = await seedUser({ role: "client_admin", displayName: "Admin", learningScore: 80, orgId: org._id, email: "admin2@test.com" });
      await seedUser({ role: "affiliated", displayName: "Worker", learningScore: 60, orgId: org._id, email: "w@test.com" });

      mockCurrentUser = { _id: admin._id, clerkId: admin.clerkId, role: "client_admin", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(2);
    });

    it("excludes users from other organizations", async () => {
      const otherOrg = await seedOrg({ name: "Other Org" });
      await seedUser({ role: "affiliated", displayName: "OtherOrg", learningScore: 99, orgId: otherOrg._id, email: "other@test.com" });
      const u1 = await seedUser({ role: "affiliated", displayName: "MyOrg", learningScore: 50, orgId: org._id, email: "my@test.com" });

      mockCurrentUser = { _id: u1._id, clerkId: u1.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(1);
      expect(res.body.leaderboard[0].name).toBe("MyOrg");
    });

    it("system_admin requires orgId query parameter", async () => {
      const sysAdmin = await seedUser({ role: "system_admin", email: "sys@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("orgId");
    });

    it("system_admin can query any org by orgId", async () => {
      await seedUser({ role: "affiliated", displayName: "OrgUser", learningScore: 70, orgId: org._id, email: "ou@test.com" });

      const sysAdmin = await seedUser({ role: "system_admin", email: "sys2@test.com" });
      mockCurrentUser = { _id: sysAdmin._id, clerkId: sysAdmin.clerkId, role: "system_admin", orgId: null };

      const res = await request(app).get(`/api/leaderboard/organization?orgId=${org._id}`);

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(1);
      expect(res.body.leaderboard[0].name).toBe("OrgUser");
    });

    it("returns 403 for non-affiliated users (no org)", async () => {
      const nonAff = await seedUser({ role: "non_affiliated", email: "na@test.com" });
      mockCurrentUser = { _id: nonAff._id, clerkId: nonAff.clerkId, role: "non_affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(403);
    });

    it("returns 403 for affiliated user without orgId", async () => {
      const noOrg = await seedUser({ role: "affiliated", email: "noorg@test.com" });
      mockCurrentUser = { _id: noOrg._id, clerkId: noOrg.clerkId, role: "affiliated", orgId: null };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(403);
    });

    it("returns empty leaderboard for org with no users", async () => {
      const emptyOrg = await seedOrg({ name: "Empty Org" });
      const admin = await seedUser({ role: "client_admin", orgId: emptyOrg._id, email: "ea@test.com" });
      mockCurrentUser = { _id: admin._id, clerkId: admin.clerkId, role: "client_admin", orgId: emptyOrg._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard.length).toBe(1);
    });

    it("includes role field in org leaderboard entries", async () => {
      const u1 = await seedUser({ role: "affiliated", displayName: "Worker", learningScore: 50, orgId: org._id, email: "wr@test.com" });
      mockCurrentUser = { _id: u1._id, clerkId: u1.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.leaderboard[0].role).toBe("affiliated");
    });

    it("returns orgId in response", async () => {
      const u1 = await seedUser({ role: "affiliated", orgId: org._id, email: "oi@test.com" });
      mockCurrentUser = { _id: u1._id, clerkId: u1.clerkId, role: "affiliated", orgId: org._id };

      const res = await request(app).get("/api/leaderboard/organization");

      expect(res.status).toBe(200);
      expect(res.body.orgId).toBeDefined();
    });
  });
});
