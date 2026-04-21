const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

// ---------------------------------------------------------------------------
// Mutable test user — prefix with "mock" so Jest permits it in jest.mock()
// ---------------------------------------------------------------------------
let mockCurrentUser = {};

// ---------------------------------------------------------------------------
// Top-level mocks (shared mongoose connection from setup.js)
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
    if (!roles.includes(req.user.role)) {
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

const mockCreateInvitation = jest.fn();
const mockGetUserList = jest.fn();

jest.mock("@clerk/clerk-sdk-node", () => ({
  ClerkExpressRequireAuth: () => (_req, _res, next) => next(),
  clerkClient: {
    invitations: { createInvitation: (...args) => mockCreateInvitation(...args) },
    users: {
      getUser: jest.fn(async () => ({
        profileImageUrl: null,
        firstName: "Test",
        lastName: "User",
        lastSignInAt: null,
        emailAddresses: [],
      })),
      getUserList: (...args) => mockGetUserList(...args),
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

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const User = require("../../src/models/User");
const Organization = require("../../src/models/Organization");
const Group = require("../../src/models/Group");

// ---------------------------------------------------------------------------
// Routes (loaded once — share the test mongoose connection)
// ---------------------------------------------------------------------------
const orgRoutes = require("../../src/routes/orgs");
const adminRoutes = require("../../src/routes/admin");

// ---------------------------------------------------------------------------
// Express apps
// ---------------------------------------------------------------------------
function buildApp(routePath, routeModule) {
  const app = express();
  app.use(express.json());
  app.use(routePath, routeModule);
  return app;
}

const orgApp = buildApp("/api/orgs", orgRoutes);
const adminApp = buildApp("/api/admins", adminRoutes);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
async function seedOrg(name = "TestOrg", description = "") {
  return Organization.create({ name, description });
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

// ===================================================================
// BACKEND TESTS: Client Admin — Organization Management
// ===================================================================

describe("Client Admin — Invite Single User", () => {
  let org, clientAdmin;

  beforeEach(async () => {
    jest.clearAllMocks();
    org = await seedOrg("ClientOrg");
    clientAdmin = await seedUser({
      role: "client_admin",
      orgId: org._id,
      email: "ca@test.com",
    });
  });

  it("successfully invites a new user", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_123",
      emailAddress: "newuser@test.com",
    });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "newuser@test.com" });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("Invitation sent successfully");
    expect(res.body.userId).toBeDefined();
    expect(res.body.inviteId).toBe("inv_123");
  });

  it("returns 400 when email is missing", async () => {
    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Email is required");
  });

  it("returns 400 when user already exists in org", async () => {
    await seedUser({ email: "existing@test.com", orgId: org._id });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "existing@test.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User already exists");
  });

  it("handles existing Clerk user (form_identifier_exists)", async () => {
    const clerkError = new Error("Clerk error");
    clerkError.errors = [{ code: "form_identifier_exists" }];
    mockCreateInvitation.mockRejectedValue(clerkError);
    mockGetUserList.mockResolvedValue(
      [{ id: "clerk_existing", firstName: "Clerk", lastName: "User", emailAddresses: [{ emailAddress: "clerkuser@test.com" }] }]
    );

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "clerkuser@test.com" });

    expect(res.status).toBe(201);
    expect(res.body.existingClerkUser).toBe(true);
  });

  it("denies affiliated user from inviting", async () => {
    const affiliated = await seedUser({ role: "affiliated", orgId: org._id });
    mockCurrentUser = affiliated;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "test@test.com" });

    expect(res.status).toBe(403);
  });

  it("denies client_admin from inviting to a different org", async () => {
    const otherOrg = await seedOrg("OtherOrg");
    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${otherOrg._id}/invite`)
      .send({ email: "test@test.com" });

    expect(res.status).toBe(403);
  });

  it("system_admin can invite to any org", async () => {
    const sysAdmin = await seedUser({ role: "system_admin", email: "sa@test.com" });
    mockCreateInvitation.mockResolvedValue({
      id: "inv_sa",
      emailAddress: "invited@test.com",
    });

    mockCurrentUser = sysAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "invited@test.com" });

    expect(res.status).toBe(201);
  });

  it("creates user in database with invited status", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_db",
      emailAddress: "dbuser@test.com",
    });

    mockCurrentUser = clientAdmin;
    await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "dbuser@test.com" });

    const dbUser = await User.findOne({ email: "dbuser@test.com" });
    expect(dbUser).toBeDefined();
    expect(dbUser.status).toBe("invited");
    expect(dbUser.role).toBe("affiliated");
    expect(dbUser.orgId.toString()).toBe(org._id.toString());
  });

  it("assigns user to group when provided", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_grp",
      emailAddress: "grouped@test.com",
    });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/invite`)
      .send({ email: "grouped@test.com", group: "Engineering" });

    expect(res.status).toBe(201);
    const group = await Group.findOne({ orgId: org._id, name: "Engineering" });
    expect(group).toBeDefined();
  });
});

describe("Client Admin — Bulk Invite Users", () => {
  let org, clientAdmin;

  beforeEach(async () => {
    jest.clearAllMocks();
    org = await seedOrg("BulkOrg");
    clientAdmin = await seedUser({
      role: "client_admin",
      orgId: org._id,
      email: "ca-bulk@test.com",
    });
  });

  it("successfully bulk invites multiple users", async () => {
    mockCreateInvitation.mockResolvedValue({ id: "inv_bulk", emailAddress: "test@test.com" });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({
        users: [
          { email: "bulk1@test.com" },
          { email: "bulk2@test.com" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(res.body.results.successful).toHaveLength(2);
  });

  it("returns 400 when no users data provided", async () => {
    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No users data provided");
  });

  it("returns 400 when users array is empty", async () => {
    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({ users: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid users data");
  });

  it("handles partial failures in bulk invite", async () => {
    mockCreateInvitation
      .mockResolvedValueOnce({ id: "inv_ok", emailAddress: "good@test.com" })
      .mockRejectedValueOnce(new Error("Clerk error for bad email"));

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({
        users: [
          { email: "good@test.com" },
          { email: "bad@test.com" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toBe(1);
  });

  it("reports row without email as failed", async () => {
    mockCreateInvitation.mockResolvedValue({ id: "inv_ok" });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({
        users: [
          { email: "valid@test.com" },
          { displayName: "No Email User" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.failed).toBe(1);
    expect(res.body.results.failed[0].error).toContain("Email is required");
  });

  it("denies non-admin from bulk inviting", async () => {
    const affiliated = await seedUser({ role: "affiliated", orgId: org._id });
    mockCurrentUser = affiliated;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({ users: [{ email: "test@test.com" }] });

    expect(res.status).toBe(403);
  });

  it("assigns users to groups during bulk invite", async () => {
    mockCreateInvitation.mockResolvedValue({ id: "inv_grp" });

    mockCurrentUser = clientAdmin;
    const res = await request(orgApp)
      .post(`/api/orgs/${org._id}/bulk-invite`)
      .send({
        users: [
          { email: "grp1@test.com", group: "Sales" },
          { email: "grp2@test.com", group: "Sales" },
        ],
      });

    expect(res.status).toBe(201);
    const group = await Group.findOne({ orgId: org._id, name: "Sales" });
    expect(group).toBeDefined();
  });
});

describe("Client Admin — View Users & Pending Invites", () => {
  let org, clientAdmin;

  beforeEach(async () => {
    org = await seedOrg("ViewOrg");
    clientAdmin = await seedUser({
      role: "client_admin",
      orgId: org._id,
      email: "ca-view@test.com",
    });
  });

  describe("GET /api/orgs/:orgId/users", () => {
    it("client_admin can view org users with learning scores", async () => {
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "member@test.com",
        displayName: "Member",
        learningScoreLms: 0.8,
      });

      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      const member = res.body.users.find((u) => u.email === "member@test.com");
      expect(member).toBeDefined();
      expect(member.learningScores).toBeDefined();
      expect(member.learningScores.lms).toBe(0.8);
    });

    it("includes badges in user response", async () => {
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "badged@test.com",
        badges: ["Badge1", "Badge2"],
      });

      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      const user = res.body.users.find((u) => u.email === "badged@test.com");
      expect(user.badges).toEqual(expect.arrayContaining(["Badge1", "Badge2"]));
    });

    it("returns paginated results", async () => {
      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.current).toBe(1);
    });

    it("affiliated user cannot view org users", async () => {
      const affiliated = await seedUser({ role: "affiliated", orgId: org._id });
      mockCurrentUser = affiliated;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/users`);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/orgs/:orgId/invites", () => {
    it("client_admin can view pending invites", async () => {
      await seedUser({
        role: "affiliated",
        orgId: org._id,
        email: "invited@test.com",
        status: "invited",
        displayName: "Invited Person",
      });

      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/invites`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination).toBeDefined();
    });

    it("filters by status when provided", async () => {
      await seedUser({ role: "affiliated", orgId: org._id, status: "invited", email: "inv1@test.com" });
      await seedUser({ role: "affiliated", orgId: org._id, status: "active", email: "act1@test.com" });

      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${org._id}/invites?status=invited`);

      expect(res.status).toBe(200);
      const statuses = res.body.users.map((u) => u.status);
      expect(statuses.every((s) => s === "invited")).toBe(true);
    });

    it("client_admin cannot view invites for different org", async () => {
      const otherOrg = await seedOrg("OtherOrg2");
      mockCurrentUser = clientAdmin;
      const res = await request(orgApp).get(`/api/orgs/${otherOrg._id}/invites`);

      expect(res.status).toBe(403);
    });
  });
});

// ===================================================================
// BACKEND TESTS: System Admin — Organizations Management
// ===================================================================

describe("System Admin — Create Organization", () => {
  let sysAdmin;

  beforeEach(async () => {
    jest.clearAllMocks();
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-create@test.com" });
  });

  it("successfully creates a new organization", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({ name: "New Org", description: "A test org" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Organization created successfully");
    expect(res.body.organization.name).toBe("New Org");
    expect(res.body.organization.description).toBe("A test org");
    expect(res.body.organization._id).toBeDefined();
  });

  it("creates organization with empty description", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({ name: "No Desc Org" });

    expect(res.status).toBe(201);
    expect(res.body.organization.name).toBe("No Desc Org");
  });

  it("returns 400 when name is missing", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Organization name is required");
  });

  it("returns 400 when organization name already exists", async () => {
    await seedOrg("Duplicate Org");
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({ name: "Duplicate Org" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists");
  });

  it("denies client_admin from creating organizations", async () => {
    const org = await seedOrg("SomeOrg");
    const ca = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-deny@test.com" });
    mockCurrentUser = ca;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({ name: "Unauthorized Org" });

    expect(res.status).toBe(403);
  });

  it("denies affiliated user from creating organizations", async () => {
    const affiliated = await seedUser({ role: "affiliated", email: "aff-deny@test.com" });
    mockCurrentUser = affiliated;
    const res = await request(adminApp)
      .post("/api/admins/create-org")
      .send({ name: "Unauthorized Org" });

    expect(res.status).toBe(403);
  });
});

describe("System Admin — Invite Client Admin", () => {
  let sysAdmin, org;

  beforeEach(async () => {
    jest.clearAllMocks();
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-invite@test.com" });
    org = await seedOrg("InviteOrg");
  });

  it("successfully invites a client admin to existing org", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_ca",
      emailAddress: "newadmin@test.com",
    });

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "newadmin@test.com", orgName: org.name });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain("Invitation sent successfully");
    expect(res.body.orgId).toBeDefined();
    expect(res.body.userId).toBeDefined();
  });

  it("creates organization if it doesn't exist", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_new_org",
      emailAddress: "admin@neworg.com",
    });

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "admin@neworg.com", orgName: "Brand New Org" });

    expect(res.status).toBe(201);
    const newOrg = await Organization.findOne({ name: "Brand New Org" });
    expect(newOrg).toBeDefined();
  });

  it("creates invited user as client_admin in database", async () => {
    mockCreateInvitation.mockResolvedValue({
      id: "inv_dbca",
      emailAddress: "dbadmin@test.com",
    });

    mockCurrentUser = sysAdmin;
    await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "dbadmin@test.com", orgName: org.name });

    const dbUser = await User.findOne({ email: "dbadmin@test.com" });
    expect(dbUser).toBeDefined();
    expect(dbUser.role).toBe("client_admin");
    expect(dbUser.status).toBe("invited");
    expect(dbUser.orgId.toString()).toBe(org._id.toString());
  });

  it("returns 400 when email is missing", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ orgName: org.name });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Email and organization name are required");
  });

  it("returns 400 when orgName is missing", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "test@test.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Email and organization name are required");
  });

  it("returns 400 when user already exists as client admin for this org", async () => {
    await seedUser({
      email: "existing-ca@test.com",
      role: "client_admin",
      orgId: org._id,
    });

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "existing-ca@test.com", orgName: org.name });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already a client admin");
  });

  it("returns 400 when user exists with different role", async () => {
    await seedUser({ email: "existing-user@test.com", role: "affiliated" });

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "existing-user@test.com", orgName: org.name });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists in the system");
  });

  it("handles existing Clerk user (form_identifier_exists)", async () => {
    const clerkError = new Error("Clerk error");
    clerkError.errors = [{ code: "form_identifier_exists" }];
    mockCreateInvitation.mockRejectedValue(clerkError);
    mockGetUserList.mockResolvedValue(
      [{ id: "clerk_ca", firstName: "Clerk", lastName: "Admin", emailAddresses: [{ emailAddress: "clerkca@test.com" }] }]
    );

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "clerkca@test.com", orgName: org.name });

    expect(res.status).toBe(201);
    expect(res.body.existingClerkUser).toBe(true);
  });

  it("denies non-system_admin from inviting client admins", async () => {
    const ca = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-noperm@test.com" });
    mockCurrentUser = ca;
    const res = await request(adminApp)
      .post("/api/admins/invite-client")
      .send({ email: "test@test.com", orgName: org.name });

    expect(res.status).toBe(403);
  });
});

describe("System Admin — List Organizations", () => {
  let sysAdmin;

  beforeEach(async () => {
    sysAdmin = await seedUser({ role: "system_admin", email: "sa-list@test.com" });
  });

  it("returns all organizations with user counts", async () => {
    const org1 = await seedOrg("Org Alpha");
    const org2 = await seedOrg("Org Beta");
    await seedUser({ role: "affiliated", orgId: org1._id, status: "active", email: "a1@test.com" });
    await seedUser({ role: "affiliated", orgId: org1._id, status: "invited", email: "a2@test.com" });
    await seedUser({ role: "affiliated", orgId: org2._id, status: "active", email: "b1@test.com" });

    mockCurrentUser = sysAdmin;
    const res = await request(adminApp).get("/api/admins/orgs");

    expect(res.status).toBe(200);
    expect(res.body.organizations.length).toBeGreaterThanOrEqual(2);

    const alpha = res.body.organizations.find((o) => o.name === "Org Alpha");
    expect(alpha).toBeDefined();
    expect(alpha.totalUsers).toBe(2);
    expect(alpha.activeUsers).toBe(1);
    expect(alpha.invitedUsers).toBe(1);
  });

  it("returns empty array when no organizations exist", async () => {
    mockCurrentUser = sysAdmin;
    const res = await request(adminApp).get("/api/admins/orgs");

    expect(res.status).toBe(200);
    expect(res.body.organizations).toEqual([]);
  });

  it("denies client_admin from listing all organizations", async () => {
    const org = await seedOrg("DenyOrg");
    const ca = await seedUser({ role: "client_admin", orgId: org._id, email: "ca-list@test.com" });
    mockCurrentUser = ca;
    const res = await request(adminApp).get("/api/admins/orgs");

    expect(res.status).toBe(403);
  });
});
