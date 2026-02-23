const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    // User metadata
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    // Course metadata
    courseTitle: {
      type: String,
      required: true,
    },
    courseDescription: {
      type: String,
      default: "",
    },
    // Certificate details
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
    },
    issuedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Additional metadata
    completionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
certificateSchema.index({ user: 1, course: 1 }, { unique: true });
certificateSchema.index({ user: 1, issuedDate: -1 });
certificateSchema.index({ certificateNumber: 1 });

module.exports = mongoose.model("Certificate", certificateSchema);
