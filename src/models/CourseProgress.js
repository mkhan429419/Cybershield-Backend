const mongoose = require("mongoose");

const courseProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    completed: [{ type: String }], // submodule ids e.g. "0-0", "0-1", "0-quiz"
  },
  { timestamps: true }
);

courseProgressSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("CourseProgress", courseProgressSchema);
