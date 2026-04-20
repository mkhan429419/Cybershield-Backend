const mongoose = require("mongoose");
const User = require("../../src/models/User");
const Course = require("../../src/models/Course");
const RemedialAssignment = require("../../src/models/RemedialAssignment");
const {
  getDesiredRemedialReasons,
  ensureRemedialAssignments,
  getRemedialAssignmentsForUser,
  markRemedialAssignmentsCompletedForCourse,
  COURSE_RECOGNIZING_RISKS,
  COURSE_ADVANCED_PHISHING,
  COURSE_ADVANCED_DEFENSIVE,
} = require("../../src/services/remedialAssignmentService");

describe("remedialAssignmentService", () => {
  it("returns the expected remedial reasons for score combinations", () => {
    expect(getDesiredRemedialReasons(80, 0.2, 0.2)).toEqual([]);
    expect(getDesiredRemedialReasons(20, 0.2, 0.2)).toEqual([
      "remedial_recognizing_risks",
      "remedial_advanced_phishing",
    ]);
    expect(getDesiredRemedialReasons(50, 0.2, 0.2)).toEqual([
      "remedial_recognizing_risks",
      "remedial_advanced_phishing",
      "remedial_advanced_defensive",
    ]);
    expect(getDesiredRemedialReasons(50, 0.8, 0.8)).toEqual([
      "remedial_advanced_defensive",
    ]);
  });

  it("creates remedial assignments that match the user's scores", async () => {
    const author = await User.create({
      clerkId: "remedial-author-clerk",
      email: "remedial-author@example.com",
      displayName: "Remedial Author",
      role: "system_admin",
    });
    const user = await User.create({
      clerkId: "remedial-user-clerk",
      email: "remedial-user@example.com",
      displayName: "Remedial User",
      role: "non_affiliated",
      learningScore: 50,
      learningScoreEmail: 0.2,
      learningScoreWhatsapp: 0.2,
    });

    await Course.create([
      { courseTitle: COURSE_RECOGNIZING_RISKS, createdBy: author._id, modules: [] },
      { courseTitle: COURSE_ADVANCED_PHISHING, createdBy: author._id, modules: [] },
      { courseTitle: COURSE_ADVANCED_DEFENSIVE, createdBy: author._id, modules: [] },
    ]);

    await ensureRemedialAssignments(user._id);

    const assignments = await RemedialAssignment.find({ user: user._id }).sort({ reason: 1 }).lean();
    expect(assignments).toHaveLength(3);
    expect(assignments.every((item) => item.dueAt)).toBe(true);
  });

  it("hides assignments for high-score users and cancels active ones", async () => {
    const author = await User.create({
      clerkId: "high-author-clerk",
      email: "high-author@example.com",
      displayName: "High Author",
      role: "system_admin",
    });
    const user = await User.create({
      clerkId: "high-user-clerk",
      email: "high-user@example.com",
      displayName: "High User",
      role: "non_affiliated",
      learningScore: 90,
      learningScoreEmail: 0.9,
      learningScoreWhatsapp: 0.9,
    });
    const course = await Course.create({
      courseTitle: COURSE_RECOGNIZING_RISKS,
      createdBy: author._id,
      modules: [],
    });

    await RemedialAssignment.create({
      user: user._id,
      course: course._id,
      reason: "remedial_recognizing_risks",
    });

    await ensureRemedialAssignments(user._id);
    const visible = await getRemedialAssignmentsForUser(user._id);
    const stored = await RemedialAssignment.findOne({ user: user._id }).lean();

    expect(visible).toEqual([]);
    expect(stored.cancelledAt).toBeTruthy();
  });

  it("marks remedial assignments complete for a finished course", async () => {
    const author = await User.create({
      clerkId: "complete-author-clerk",
      email: "complete-author@example.com",
      displayName: "Complete Author",
      role: "system_admin",
    });
    const user = await User.create({
      clerkId: "complete-user-clerk",
      email: "complete-user@example.com",
      displayName: "Complete User",
      role: "non_affiliated",
      learningScore: 30,
      learningScoreEmail: 0.1,
      learningScoreWhatsapp: 0.1,
    });
    const course = await Course.create({
      courseTitle: COURSE_RECOGNIZING_RISKS,
      createdBy: author._id,
      modules: [],
    });

    await RemedialAssignment.create({
      user: user._id,
      course: course._id,
      reason: "remedial_recognizing_risks",
    });

    await markRemedialAssignmentsCompletedForCourse(user._id, course._id);

    const assignment = await RemedialAssignment.findOne({ user: user._id, course: course._id }).lean();
    expect(assignment.completedAt).toBeTruthy();
  });
});
