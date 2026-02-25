const mongoose = require("mongoose");

const mediaItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    publicId: { type: String, default: "" }, // Cloudinary public ID (for images or legacy videos)
    subtitleUrl: { type: String, default: "" }, // URL with subtitle overlay (for legacy Cloudinary videos)
    youtubeId: { type: String, default: "" }, // YouTube video ID (for videos uploaded to YouTube)
  },
  { _id: false }
);

const moduleSectionSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    material: { type: String, default: "" },
    urls: [{ type: String }],
    media: [mediaItemSchema],
  },
  { _id: true }
);

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    choices: [{ type: String }],
    correctIndex: { type: Number, default: 0 },
  },
  { _id: true }
);

const courseModuleSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    sections: [moduleSectionSchema],
    quiz: [quizQuestionSchema],
  },
  { _id: true }
);

const courseSchema = new mongoose.Schema(
  {
    courseTitle: { type: String, required: true },
    description: { type: String, default: "" },
    level: { type: String, enum: ["basic", "advanced"], default: "basic" },
    modules: [courseModuleSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByName: { type: String, default: "" },
    createdByEmail: { type: String, default: "" },
    badges: [{ type: String }],
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null, // null for system admin courses (visible to non-affiliated users)
    },
  },
  { timestamps: true }
);

courseSchema.index({ createdBy: 1, createdAt: -1 });
courseSchema.index({ courseTitle: "text", description: "text" });
courseSchema.index({ orgId: 1 }); // Index for organization-based queries

module.exports = mongoose.model("Course", courseSchema);
