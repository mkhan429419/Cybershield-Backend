const EmailRiskEvent = require("../models/EmailRiskEvent");
const User = require("../models/User");

const EMAIL_RISK_DECAY_RATE = 0.95; // Each day's influence decreases by 5%
const ELIGIBLE_ROLES = ["affiliated", "non_affiliated"];
// Max possible raw score (open 0.2 + click 0.5 + credentials 0.7) — used to normalize so "did not open" is reflected
const MAX_RAW_SCORE = 0.2 + 0.5 + 0.7; // 1.4

/**
 * Whether email risk scoring applies to this role (only affiliated and non_affiliated).
 */
function isEligibleForEmailRiskScoring(role) {
  return role && ELIGIBLE_ROLES.includes(role);
}

/**
 * Compute compounded email risk score from EmailRiskEvents with time decay.
 * Only opened, clicked, credentials_submitted are included.
 * Raw = sum(weight * DECAY_RATE^daysSinceEvent). Normalized to [0, 1] by dividing by MAX_RAW_SCORE (1.4)
 * so that "did not open" is reflected: e.g. click+credentials only = 1.2/1.4 ≈ 0.86, full chain = 1.0.
 */
async function computeEmailRiskScore(userId) {
  const events = await EmailRiskEvent.find({ userId }).sort({ createdAt: 1 }).lean();
  if (!events.length) {
    console.log("[EmailRisk] computeEmailRiskScore userId=", userId, "| no events, score=0");
    return 0;
  }

  const now = Date.now();
  let rawScore = 0;
  for (const ev of events) {
    const createdAt = ev.createdAt ? new Date(ev.createdAt).getTime() : now;
    const daysSince = (now - createdAt) / (1000 * 60 * 60 * 24);
    const decay = Math.pow(EMAIL_RISK_DECAY_RATE, Math.max(0, daysSince));
    const weight = ev.weight != null ? ev.weight : getEmailRiskWeight(ev.eventType);
    const contrib = weight * decay;
    rawScore += contrib;
    console.log("[EmailRisk]   event", ev.eventType, "weight=", weight, "daysSince=", daysSince.toFixed(2), "decay=", decay.toFixed(4), "contrib=", contrib.toFixed(4));
  }

  // Normalize by max possible raw (1.4) so score reflects which events occurred; then clamp to [0, 1]
  const normalized = Math.min(1, Math.max(0, rawScore / MAX_RAW_SCORE));
  const score = Math.round(normalized * 100) / 100;
  console.log("[EmailRisk] computeEmailRiskScore userId=", userId, "| events=", events.length, "rawScore=", rawScore.toFixed(4), "normalized=", score, "(raw/", MAX_RAW_SCORE, ")");
  return score;
}

function getEmailRiskWeight(eventType) {
  const weights = {
    email_opened: 0.2,
    email_clicked: 0.5,
    email_credentials_submitted: 0.7,
  };
  return weights[eventType] != null ? weights[eventType] : 0;
}

/**
 * Update stored email risk score on User model (only for eligible roles).
 */
async function updateUserEmailRiskScore(userId) {
  console.log("[EmailRisk] updateUserEmailRiskScore called for userId=", userId);
  const user = await User.findById(userId).select("role emailRiskScore").lean();
  if (!user) {
    console.log("[EmailRisk] updateUserEmailRiskScore skip: user not found", userId);
    return;
  }
  if (!isEligibleForEmailRiskScoring(user.role)) {
    console.log("[EmailRisk] updateUserEmailRiskScore skip: role not eligible", { userId, role: user.role });
    return;
  }
  const previousScore = user.emailRiskScore;
  const score = await computeEmailRiskScore(userId);
  await User.updateOne({ _id: userId }, { $set: { emailRiskScore: score } });
  console.log("[EmailRisk] updateUserEmailRiskScore done", { userId, previousScore, newScore: score });
}

module.exports = {
  isEligibleForEmailRiskScoring,
  computeEmailRiskScore,
  updateUserEmailRiskScore,
  EMAIL_RISK_DECAY_RATE,
  ELIGIBLE_ROLES,
};
