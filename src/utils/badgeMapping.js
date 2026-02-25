/**
 * Badge mapping utility - maps badge IDs to badge objects with labels
 * This mirrors the frontend's AVAILABLE_BADGES structure
 */

const AVAILABLE_BADGES = [
  { id: "award", label: "Course Complete" },
  { id: "network", label: "Network Security" },
  { id: "bug", label: "Threat Awareness" },
  { id: "key", label: "Access Control" },
  { id: "shield", label: "Security Awareness" },
  { id: "lock", label: "Data Protection" },
  { id: "target", label: "Phishing Defense" },
  { id: "zap", label: "Quick Learner" },
  { id: "book-open", label: "Knowledge Builder" },
  { id: "file-check", label: "Quiz Master" },
];

// Create a map for quick lookup by ID
const badgeMap = new Map(AVAILABLE_BADGES.map(badge => [badge.id, badge]));

// Create a reverse map for lookup by label
const badgeLabelMap = new Map(AVAILABLE_BADGES.map(badge => [badge.label, badge]));

/**
 * Transform badge IDs to badge objects with labels
 * @param {string[]} badgeIds - Array of badge IDs
 * @returns {Array<{id: string, label: string}>} Array of badge objects
 */
function transformBadges(badgeIds) {
  if (!Array.isArray(badgeIds)) {
    return [];
  }

  return badgeIds
    .map(id => {
      const badge = badgeMap.get(id);
      return badge ? { id: badge.id, label: badge.label } : null;
    })
    .filter(badge => badge !== null); // Filter out invalid badge IDs
}

/**
 * Get badge label by ID
 * @param {string} badgeId - Badge ID
 * @returns {string|null} Badge label or null if not found
 */
function getBadgeLabel(badgeId) {
  const badge = badgeMap.get(badgeId);
  return badge ? badge.label : null;
}

/**
 * Transform badge labels (or IDs) to badge objects with labels
 * Handles both badge IDs and badge labels
 * @param {string[]} badgeValues - Array of badge IDs or labels
 * @returns {Array<{id: string, label: string}>} Array of badge objects
 */
function transformBadgesFromLabels(badgeValues) {
  if (!Array.isArray(badgeValues)) {
    return [];
  }

  return badgeValues
    .map(value => {
      // First try to find by label (in case badges are stored as labels)
      let badge = badgeLabelMap.get(value);
      // If not found by label, try by ID (backward compatibility)
      if (!badge) {
        badge = badgeMap.get(value);
      }
      return badge ? { id: badge.id, label: badge.label } : null;
    })
    .filter(badge => badge !== null); // Filter out invalid badge values
}

module.exports = {
  AVAILABLE_BADGES,
  transformBadges,
  getBadgeLabel,
  transformBadgesFromLabels,
};
