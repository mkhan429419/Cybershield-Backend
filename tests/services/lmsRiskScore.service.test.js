jest.mock("../../src/services/combinedLearningScoreService", () => ({
  updateUserCombinedLearningScore: jest.fn().mockResolvedValue(undefined),
}));

const mongoose = require("mongoose");
const User = require("../../src/models/User");
const Course = require("../../src/models/Course");
const CourseProgress = require("../../src/models/CourseProgress");
const {
  isEligibleForLmsRiskScoring,
  computeLmsRiskScore,
  updateUserLmsRiskScore,
  getTotalSubmodulesForCourse,
  getCourseFilterForUser,
} = require("../../src/services/lmsRiskScoreService");
const {
  updateUserCombinedLearningScore,
} = require("../../src/services/combinedLearningScoreService");

describe("lmsRiskScoreService", () => {
  it("counts sections, quizzes, and activities when totaling submodules", () => {
    const total = getTotalSubmodulesForCourse({
      modules: [
        {
          sections: [{}, {}],
          quiz: [{ question: "Q1" }],
          activityType: "email",
        },
      ],
    });

    expect(total).toBe(4);
  });

  it("builds an org-based course filter for supported roles", () => {
    const orgId = new mongoose.Types.ObjectId();

    expect(getCourseFilterForUser({ role: "system_admin" })).toEqual({ orgId: null });
    expect(getCourseFilterForUser({ role: "non_affiliated" })).toEqual({ orgId: null });
    expect(
      getCourseFilterForUser({ role: "affiliated", orgId })
    ).toEqual({ orgId: orgId.toString() });
    expect(isEligibleForLmsRiskScoring("client_admin")).toBe(false);
  });

  it("computes LMS score from assigned-course progress only", async () => {
    const author = await User.create({
      clerkId: "author-clerk-1",
      email: "author@example.com",
      displayName: "Course Author",
      role: "system_admin",
    });
    const learner = await User.create({
      clerkId: "learner-clerk-1",
      email: "learner@example.com",
      displayName: "Learner",
      role: "non_affiliated",
    });

    const assignedCourse = await Course.create({
      courseTitle: "Assigned Course",
      createdBy: author._id,
      modules: [
        {
          title: "Module 1",
          sections: [{ title: "A" }, { title: "B" }],
          quiz: [{ question: "Quiz 1", choices: ["A"], correctIndex: 0 }],
          activityType: "email",
        },
      ],
    });

    const otherOrgCourse = await Course.create({
      courseTitle: "Other Org Course",
      createdBy: author._id,
      orgId: new mongoose.Types.ObjectId(),
      modules: [{ title: "Module 2", sections: [{ title: "A" }], quiz: [] }],
    });

    await CourseProgress.create([
      {
        user: learner._id,
        course: assignedCourse._id,
        completed: ["0-0", "0-1"],
      },
      {
        user: learner._id,
        course: otherOrgCourse._id,
        completed: ["0-0"],
      },
    ]);

    const score = await computeLmsRiskScore(learner._id);
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("updates the user's LMS score and combined score", async () => {
    const author = await User.create({
      clerkId: "author-clerk-2",
      email: "author2@example.com",
      displayName: "Course Author 2",
      role: "system_admin",
    });
    const learner = await User.create({
      clerkId: "learner-clerk-2",
      email: "learner2@example.com",
      displayName: "Learner 2",
      role: "affiliated",
      orgId: new mongoose.Types.ObjectId(),
      learningScoreLms: 0,
    });

    const course = await Course.create({
      courseTitle: "Org Course",
      createdBy: author._id,
      orgId: learner.orgId,
      modules: [{ title: "Module 1", sections: [{ title: "Only section" }], quiz: [] }],
    });

    await CourseProgress.create({
      user: learner._id,
      course: course._id,
      completed: ["0-0"],
    });

    await updateUserLmsRiskScore(learner._id);

    const updated = await User.findById(learner._id).lean();
    expect(updated.learningScoreLms).toBe(1);
    expect(updateUserCombinedLearningScore).toHaveBeenCalledWith(
      learner._id,
      expect.objectContaining({ lms: 1 })
    );
  });
});
