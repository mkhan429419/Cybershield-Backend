const mongoose = require("mongoose");

const emailTemplateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    emailTemplate: {
      subject: {
        type: String,
        required: true,
      },
      bodyContent: {
        type: String,
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
emailTemplateSchema.index({ category: 1, isActive: 1 });
emailTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);

