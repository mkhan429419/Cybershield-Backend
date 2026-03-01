const User = require("../models/User");

// Weights for combined score (must sum to 1). All five scores are 0–1 (higher = better).
const WEIGHTS = {
  email: 0.2,
  whatsapp: 0.2,
  lms: 0.2,
  voice: 0.2,
  incident: 0.2,
};

/**
 * Compute combined learning score from email, whatsapp, lms, voice, incident (each 0–1).
 * Returns 0–100 for storage in user.learningScore.
 */
function computeCombinedLearningScore(scores) {
  const e = scores.email != null ? Math.max(0, Math.min(1, scores.email)) : 0;
  const w = scores.whatsapp != null ? Math.max(0, Math.min(1, scores.whatsapp)) : 0;
  const l = scores.lms != null ? Math.max(0, Math.min(1, scores.lms)) : 0;
  const v = scores.voice != null ? Math.max(0, Math.min(1, scores.voice)) : 0;
  const i = scores.incident != null ? Math.max(0, Math.min(1, scores.incident)) : 0;
  const combined = WEIGHTS.email * e + WEIGHTS.whatsapp * w + WEIGHTS.lms * l + WEIGHTS.voice * v + WEIGHTS.incident * i;
  return Math.round(combined * 1000) / 10; // 0–100, one decimal
}

/**
 * Recalculate and persist user.learningScore (0–100) from the five learning scores.
 * Call this whenever any of learningScoreEmail, learningScoreWhatsapp, learningScoreLms, learningScoreVoice, learningScoreIncident is updated.
 *
 * @param {string|ObjectId} userId - User _id
 * @param {Object} [overrides] - Optional: { email?, whatsapp?, lms?, voice?, incident? } — use these instead of re-reading from DB (avoids read-after-write and ensures we use the value just written)
 */
async function updateUserCombinedLearningScore(userId, overrides = {}) {
  if (!userId) {
    console.warn("[CombinedLearningScore] updateUserCombinedLearningScore skip: no userId");
    return;
  }
  const user = await User.findById(userId)
    .select("_id learningScoreEmail learningScoreWhatsapp learningScoreLms learningScoreVoice learningScoreIncident")
    .lean();
  if (!user) {
    console.warn("[CombinedLearningScore] updateUserCombinedLearningScore skip: user not found", userId?.toString?.());
    return;
  }
  // Use overrides for any score that was just updated, so we don't rely on read-after-write
  const scores = {
    email: overrides.email != null ? overrides.email : (user.learningScoreEmail != null ? user.learningScoreEmail : 0),
    whatsapp: overrides.whatsapp != null ? overrides.whatsapp : (user.learningScoreWhatsapp != null ? user.learningScoreWhatsapp : 0),
    lms: overrides.lms != null ? overrides.lms : (user.learningScoreLms != null ? user.learningScoreLms : 0),
    voice: overrides.voice != null ? overrides.voice : (user.learningScoreVoice != null ? user.learningScoreVoice : 0),
    incident: overrides.incident != null ? overrides.incident : (user.learningScoreIncident != null ? user.learningScoreIncident : 0),
  };
  const combined = computeCombinedLearningScore(scores);
  const id = user._id;
  const result = await User.updateOne({ _id: id }, { $set: { learningScore: combined } });
  if (result.modifiedCount === 0 && result.matchedCount === 0) {
    console.warn("[CombinedLearningScore] updateUserCombinedLearningScore: no document matched", id?.toString?.());
  } else {
    console.log("[CombinedLearningScore] updated", id?.toString?.(), "learningScore=", combined, "scores=", scores);
  }

  // Remedial: assign courses when email/WhatsApp scores are low or overall is mid/low (fire-and-forget)
  const { ensureRemedialAssignments } = require("./remedialAssignmentService");
  ensureRemedialAssignments(userId).catch((err) =>
    console.error("[CombinedLearningScore] ensureRemedialAssignments failed:", err.message)
  );
}

module.exports = {
  computeCombinedLearningScore,
  updateUserCombinedLearningScore,
  WEIGHTS,
};
