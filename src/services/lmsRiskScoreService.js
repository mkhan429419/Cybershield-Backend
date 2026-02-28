const Course = require("../models/Course");
const CourseProgress = require("../models/CourseProgress");
const User = require("../models/User");

const ELIGIBLE_ROLES = ["affiliated", "non_affiliated"];

function isEligibleForLmsRiskScoring(role) {
  return role && ELIGIBLE_ROLES.includes(role);
}

/**
 * Count total submodules in a course (sections + quiz per module, + activity if activityType set).
 * Matches the structure used in isCourseCompleted / certificateController.
 */
function getTotalSubmodulesForCourse(course) {
  if (!course || !Array.isArray(course.modules)) return 0;
  let total = 0;
  for (const module of course.modules) {
    const sections = module.sections || [];
    const hasQuiz = (module.quiz || []).length > 0;
    const hasActivity = !!(module.activityType && String(module.activityType).trim());
    total += sections.length + (hasQuiz ? 1 : 0) + (hasActivity ? 1 : 0);
  }
  return total;
}

/**
 * Get course filter for a user (same logic as getCourses RBAC).
 */
function getCourseFilterForUser(user) {
  if (!user) return null;
  const filter = {};
  if (user.role === "system_admin") {
    filter.orgId = null;
  } else if (user.role === "client_admin" || user.role === "affiliated") {
    const orgId = user.orgId?._id?.toString() || user.orgId?.toString();
    if (!orgId) return null;
    filter.orgId = orgId;
  } else if (user.role === "non_affiliated") {
    filter.orgId = null;
  } else {
    return null;
  }
  return filter;
}

/**
 * Compute LMS risk score for a user: completed submodules / total available submodules.
 * Starts at 0 (no learning). The more you learn, the higher the score. Completing all assigned courses = 1.
 * Only for affiliated / non_affiliated. Uses courses the user has access to (by org/role).
 */
async function computeLmsRiskScore(userId) {
  const user = await User.findById(userId).select("role orgId").lean();
  if (!user || !isEligibleForLmsRiskScoring(user.role)) return 0;

  const filter = getCourseFilterForUser(user);
  if (!filter) return 0;

  const courses = await Course.find(filter).select("_id modules").lean();
  const assignedCourseIds = new Set(courses.map((c) => c._id.toString()));
  let totalAvailable = 0;
  for (const course of courses) {
    totalAvailable += getTotalSubmodulesForCourse(course);
  }
  if (totalAvailable === 0) return 0;

  // Only count progress for courses that are in the assigned set (same as totalAvailable)
  const progressList = await CourseProgress.find({ user: userId }).select("course completed").lean();
  let totalCompleted = 0;
  for (const progress of progressList) {
    const courseId = progress.course && progress.course.toString();
    if (!courseId || !assignedCourseIds.has(courseId)) continue;
    totalCompleted += (progress.completed && progress.completed.length) ? progress.completed.length : 0;
  }

  const ratio = totalCompleted / totalAvailable;
  const score = Math.round(Math.min(1, ratio) * 100) / 100;
  return Math.max(0, Math.min(1, score));
}

async function updateUserLmsRiskScore(userId) {
  const user = await User.findById(userId).select("role lmsRiskScore").lean();
  if (!user || !isEligibleForLmsRiskScoring(user.role)) return;
  const score = await computeLmsRiskScore(userId);
  await User.updateOne({ _id: userId }, { $set: { lmsRiskScore: score } });
}

module.exports = {
  isEligibleForLmsRiskScoring,
  computeLmsRiskScore,
  updateUserLmsRiskScore,
  getTotalSubmodulesForCourse,
  ELIGIBLE_ROLES,
};
