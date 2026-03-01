/**
 * Incident learning score: 0–1, higher = better.
 * Based on reported incidents: correct reports (classified as phishing) increase the score,
 * false reports (classified as not phishing) decrease it.
 * Score = (count of incidents where is_phishing === true) / (total incidents by user).
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Incident = require("../models/Incident");
const { updateUserCombinedLearningScore } = require("./combinedLearningScoreService");

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return null;
}

/**
 * Recompute and persist user.learningScoreIncident from their incident history,
 * then recalculate overall learningScore.
 * Call after saving a new incident for that user.
 *
 * @param {string|ObjectId} userId - User _id (required)
 * @returns {Promise<{ learningScoreIncident: number } | null>} New score or null if no user
 */
async function updateIncidentLearningScore(userId) {
  const uid = toObjectId(userId);
  if (!uid) {
    console.warn("[IncidentLearningScore] updateIncidentLearningScore skip: invalid userId", userId);
    return null;
  }

  const total = await Incident.countDocuments({ userId: uid });
  if (total === 0) {
    // No incidents: leave existing score or set 0
    const user = await User.findById(uid).select("learningScoreIncident").lean();
    if (!user) {
      console.warn("[IncidentLearningScore] user not found", uid.toString());
      return null;
    }
    const score = user.learningScoreIncident != null ? user.learningScoreIncident : 0;
    const updateResult = await User.updateOne({ _id: uid }, { $set: { learningScoreIncident: score } });
    if (updateResult.matchedCount === 0) {
      console.warn("[IncidentLearningScore] User.updateOne matched 0 documents for _id=", uid.toString());
    }
    await updateUserCombinedLearningScore(uid, { incident: score }).catch((err) =>
      console.error("[IncidentLearningScore] updateUserCombinedLearningScore failed:", err.message)
    );
    return { learningScoreIncident: score };
  }

  const correct = await Incident.countDocuments({ userId: uid, is_phishing: true });
  const learningScoreIncident = Math.round((correct / total) * 100) / 100; // 0–1, 2 decimals

  const updateResult = await User.updateOne({ _id: uid }, { $set: { learningScoreIncident } });
  if (updateResult.matchedCount === 0) {
    console.warn("[IncidentLearningScore] User.updateOne matched 0 documents for _id=", uid.toString());
  } else {
    console.log("[IncidentLearningScore] updated", uid.toString(), "learningScoreIncident=", learningScoreIncident, "correct=", correct, "total=", total);
  }

  await updateUserCombinedLearningScore(uid, { incident: learningScoreIncident }).catch((err) =>
    console.error("[IncidentLearningScore] updateUserCombinedLearningScore failed:", err.message)
  );

  return { learningScoreIncident };
}

module.exports = {
  updateIncidentLearningScore,
};
