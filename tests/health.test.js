jest.mock("../src/routes/admin", () => require("express").Router());
jest.mock("../src/routes/orgs", () => require("express").Router());
jest.mock("../src/routes/users", () => require("express").Router());
jest.mock("../src/routes/whatsappCampaigns", () => require("express").Router());
jest.mock("../src/routes/voicePhishing", () => require("express").Router());
jest.mock("../src/routes/email", () => require("express").Router());
jest.mock("../src/routes/emailTemplates", () => require("express").Router());
jest.mock("../src/routes/whatsAppTemplates", () => require("express").Router());
jest.mock("../src/routes/voicePhishingTemplates", () => require("express").Router());
jest.mock("../src/routes/campaigns", () => require("express").Router());
jest.mock("../src/routes/incidents", () => require("express").Router());
jest.mock("../src/routes/chat", () => require("express").Router());
jest.mock("../src/routes/courses", () => require("express").Router());
jest.mock("../src/routes/certificates", () => require("express").Router());
jest.mock("../src/routes/reports", () => require("express").Router());
jest.mock("../src/routes/upload", () => require("express").Router());
jest.mock("../src/routes/leaderboard", () => require("express").Router());
jest.mock("../src/models/Email", () => ({ findById: jest.fn() }));
jest.mock("../src/models/Campaign", () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock("../src/models/WhatsAppCampaign", () => ({ findOne: jest.fn() }));
jest.mock("../src/models/EmailRiskEvent", () => ({ create: jest.fn() }));
jest.mock("../src/models/User", () => ({ findById: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock("../src/services/emailRiskScoreService", () => ({
  isEligibleForEmailRiskScoring: jest.fn(() => true),
  updateUserEmailRiskScore: jest.fn(),
}));
jest.mock("../src/services/whatsappRiskScoreService", () => ({
  recordWhatsAppRiskEvent: jest.fn(),
}));

const request = require("supertest");
const app = require("../src/app");

describe("Basic app routes", () => {
  it("GET / should return API metadata", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("CyberShield Backend API");
  });

  it("GET /health should return OK", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("OK");
  });

  it("unknown route should return 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Route not found");
  });
});
