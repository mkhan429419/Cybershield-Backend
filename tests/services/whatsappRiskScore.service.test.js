jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn().mockResolvedValue(undefined),
}));

const mongoose = require("mongoose");
const User = require("../../src/models/User");
const WhatsAppRiskEvent = require("../../src/models/WhatsAppRiskEvent");
const {
  isEligibleForWhatsAppRiskScoring,
  computeWhatsAppRiskScore,
  updateUserWhatsAppRiskScore,
  recordWhatsAppRiskEvent,
  USER_FIELD_LEARNING_SCORE_WHATSAPP,
} = require("../../src/services/whatsappRiskScoreService");
const {
  updateUserCombinedLearningScore,
} = require("../../src/services/combinedLearningScoreService");

describe("whatsappRiskScoreService", () => {
  it("limits eligibility to affiliated and non_affiliated users", () => {
    expect(isEligibleForWhatsAppRiskScoring("affiliated")).toBe(true);
    expect(isEligibleForWhatsAppRiskScoring("non_affiliated")).toBe(true);
    expect(isEligibleForWhatsAppRiskScoring("client_admin")).toBe(false);
  });

  it("deduplicates duplicate events within the same campaign", async () => {
    const user = await User.create({
      clerkId: "wa-risk-clerk",
      email: "wa-risk@example.com",
      displayName: "WhatsApp Risk User",
      role: "affiliated",
    });
    const campaignId = new mongoose.Types.ObjectId();

    await WhatsAppRiskEvent.create([
      { userId: user._id, campaignId, eventType: "whatsapp_clicked", weight: 0.5 },
      { userId: user._id, campaignId, eventType: "whatsapp_clicked", weight: 0.5 },
      { userId: user._id, campaignId, eventType: "whatsapp_credentials_submitted", weight: 0.7 },
    ]);

    const score = await computeWhatsAppRiskScore(user._id);
    expect(score).toBeCloseTo(0.86, 2);
  });

  it("updates the dedicated WhatsApp learning score field and combined score", async () => {
    const user = await User.create({
      clerkId: "wa-update-clerk",
      email: "wa-update@example.com",
      displayName: "WhatsApp Update User",
      role: "non_affiliated",
      learningScoreWhatsapp: 0,
    });

    await WhatsAppRiskEvent.create([
      { userId: user._id, eventType: "whatsapp_read", weight: 0.2 },
      { userId: user._id, eventType: "whatsapp_clicked", weight: 0.5 },
    ]);

    await updateUserWhatsAppRiskScore(user._id);

    const updated = await User.findById(user._id).lean();
    expect(updated[USER_FIELD_LEARNING_SCORE_WHATSAPP]).toBeCloseTo(0.5, 1);
    expect(updateUserCombinedLearningScore).toHaveBeenCalledWith(
      user._id,
      expect.objectContaining({ whatsapp: expect.any(Number) })
    );
  });

  it("records a risk event for eligible users and ignores ineligible roles", async () => {
    const eligible = await User.create({
      clerkId: "eligible-wa-clerk",
      email: "eligible-wa@example.com",
      displayName: "Eligible WhatsApp User",
      role: "affiliated",
    });
    const ineligible = await User.create({
      clerkId: "ineligible-wa-clerk",
      email: "ineligible-wa@example.com",
      displayName: "Ineligible WhatsApp User",
      role: "client_admin",
    });

    await recordWhatsAppRiskEvent(eligible._id, "whatsapp_read");
    await recordWhatsAppRiskEvent(ineligible._id, "whatsapp_read");

    const eligibleEvents = await WhatsAppRiskEvent.countDocuments({ userId: eligible._id });
    const ineligibleEvents = await WhatsAppRiskEvent.countDocuments({ userId: ineligible._id });

    expect(eligibleEvents).toBe(1);
    expect(ineligibleEvents).toBe(0);
  });
});
