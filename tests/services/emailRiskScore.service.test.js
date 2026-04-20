jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn().mockResolvedValue(undefined),
}));

const User = require("../../src/models/User");
const EmailRiskEvent = require("../../src/models/EmailRiskEvent");
const {
  isEligibleForEmailRiskScoring,
  computeEmailRiskScore,
  updateUserEmailRiskScore,
} = require("../../src/services/emailRiskScoreService");
const {
  updateUserCombinedLearningScore,
} = require("../../src/services/combinedLearningScoreService");

describe("emailRiskScoreService", () => {
  it("limits eligibility to affiliated and non_affiliated users", () => {
    expect(isEligibleForEmailRiskScoring("affiliated")).toBe(true);
    expect(isEligibleForEmailRiskScoring("non_affiliated")).toBe(true);
    expect(isEligibleForEmailRiskScoring("client_admin")).toBe(false);
  });

  it("computes the normalized email risk score from recorded events", async () => {
    const user = await User.create({
      clerkId: "email-risk-clerk",
      email: "email-risk@example.com",
      displayName: "Email Risk User",
      role: "affiliated",
    });

    await EmailRiskEvent.create([
      { userId: user._id, eventType: "email_opened", weight: 0.2 },
      { userId: user._id, eventType: "email_clicked", weight: 0.5 },
      { userId: user._id, eventType: "email_credentials_submitted", weight: 0.7 },
    ]);

    const score = await computeEmailRiskScore(user._id);
    expect(score).toBeCloseTo(1, 2);
  });

  it("updates the user's learningScoreEmail and combined score", async () => {
    const user = await User.create({
      clerkId: "email-update-clerk",
      email: "email-update@example.com",
      displayName: "Email Update User",
      role: "non_affiliated",
      learningScoreEmail: 0,
    });

    await EmailRiskEvent.create([
      { userId: user._id, eventType: "email_clicked", weight: 0.5 },
      { userId: user._id, eventType: "email_credentials_submitted", weight: 0.7 },
    ]);

    await updateUserEmailRiskScore(user._id);

    const updated = await User.findById(user._id).lean();
    expect(updated.learningScoreEmail).toBeCloseTo(0.14, 2);
    expect(updateUserCombinedLearningScore).toHaveBeenCalledWith(
      user._id,
      expect.objectContaining({ email: expect.any(Number) })
    );
  });

  it("does not update ineligible users", async () => {
    const user = await User.create({
      clerkId: "admin-clerk",
      email: "admin@example.com",
      displayName: "Admin User",
      role: "system_admin",
      learningScoreEmail: 0.42,
    });

    await updateUserEmailRiskScore(user._id);

    const updated = await User.findById(user._id).lean();
    expect(updated.learningScoreEmail).toBe(0.42);
  });
});
