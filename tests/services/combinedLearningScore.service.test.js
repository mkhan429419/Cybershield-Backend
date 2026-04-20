jest.mock("../../src/services/remedialAssignmentService", () => ({
  ensureRemedialAssignments: jest.fn().mockResolvedValue(undefined),
}));

const User = require("../../src/models/User");
const {
  computeCombinedLearningScore,
  updateUserCombinedLearningScore,
} = require("../../src/services/combinedLearningScoreService");
const {
  ensureRemedialAssignments,
} = require("../../src/services/remedialAssignmentService");

describe("combinedLearningScoreService", () => {
  it("computes a weighted combined score and clamps out-of-range values", () => {
    const score = computeCombinedLearningScore({
      email: 1,
      whatsapp: 0.5,
      lms: 2,
      voice: -1,
      incident: 0.75,
    });

    expect(score).toBe(65);
  });

  it("updates the stored learningScore using overrides and triggers remedial checks", async () => {
    const user = await User.create({
      clerkId: "combined-clerk",
      email: "combined@example.com",
      displayName: "Combined User",
      role: "affiliated",
      learningScoreEmail: 0.2,
      learningScoreWhatsapp: 0.4,
      learningScoreLms: 0.6,
      learningScoreVoice: 0.8,
      learningScoreIncident: 1,
    });

    await updateUserCombinedLearningScore(user._id, { email: 1 });

    const updated = await User.findById(user._id).lean();
    expect(updated.learningScore).toBe(76);
    expect(ensureRemedialAssignments).toHaveBeenCalledWith(user._id);
  });

  it("returns early when no userId is provided", async () => {
    await expect(updateUserCombinedLearningScore(null)).resolves.toBeUndefined();
  });
});
