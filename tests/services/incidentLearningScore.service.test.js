jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn().mockResolvedValue(undefined),
}));

const User = require("../../src/models/User");
const Incident = require("../../src/models/Incident");
const {
  updateIncidentLearningScore,
} = require("../../src/services/incidentLearningScoreService");
const {
  updateUserCombinedLearningScore,
} = require("../../src/services/combinedLearningScoreService");

describe("incidentLearningScoreService", () => {
  it("returns null for an invalid userId", async () => {
    const result = await updateIncidentLearningScore("not-an-object-id");
    expect(result).toBeNull();
  });

  it("updates the incident learning score from incident history", async () => {
    const user = await User.create({
      clerkId: "incident-clerk",
      email: "incident@example.com",
      displayName: "Incident User",
      role: "affiliated",
    });

    await Incident.create([
      { userId: user._id, messageType: "email", message: "a", is_phishing: true },
      { userId: user._id, messageType: "email", message: "b", is_phishing: true },
      { userId: user._id, messageType: "whatsapp", message: "c", is_phishing: false },
    ]);

    const result = await updateIncidentLearningScore(user._id);

    expect(result.learningScoreIncident).toBeCloseTo(0.67, 2);
    const updated = await User.findById(user._id).lean();
    expect(updated.learningScoreIncident).toBeCloseTo(0.67, 2);
    expect(updateUserCombinedLearningScore).toHaveBeenCalledWith(
      user._id,
      expect.objectContaining({ incident: 0.67 })
    );
  });

  it("keeps the existing score when the user has no incidents", async () => {
    const user = await User.create({
      clerkId: "no-incident-clerk",
      email: "no-incidents@example.com",
      displayName: "No Incident User",
      role: "affiliated",
      learningScoreIncident: 0.4,
    });

    const result = await updateIncidentLearningScore(user._id);

    expect(result.learningScoreIncident).toBe(0.4);
  });
});
