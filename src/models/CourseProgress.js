const mongoose = require("mongoose");

const courseProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    completed: [{ type: String }], // submodule ids e.g. "0-0", "0-1", "0-quiz"
    // For email activity: submoduleId (e.g. "0-activity") -> Email _id sent to user (used to check open/click/credentials)
    activityEmailIds: { type: Map, of: mongoose.Schema.Types.ObjectId, default: () => new Map() },
    // For WhatsApp activity: submoduleId -> WhatsAppCampaign _id (used to check stats.totalClicked / totalReported)
    activityWhatsAppCampaignIds: { type: Map, of: mongoose.Schema.Types.ObjectId, default: () => new Map() },
    // For email/WhatsApp activity: submoduleId -> { passed: Boolean, attemptedAt: Date } when time is up
    activityAttempts: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => new Map() },
  },
  { timestamps: true }
);

courseProgressSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("CourseProgress", courseProgressSchema);
