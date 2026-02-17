const mongoose = require("mongoose");

const voicePhishingTemplateSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["phishing", "normal"],
      required: true,
    },
    firstMessage: {
      type: String,
      required: true,
    },
    // Organization ID - null means it's a system admin template for non-affiliated users
    // If set, it's a client admin template for that organization
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    // Created by user ID
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
voicePhishingTemplateSchema.index({ organizationId: 1, type: 1, isActive: 1 });
voicePhishingTemplateSchema.index({ createdAt: -1 });
voicePhishingTemplateSchema.index({ createdBy: 1 });

module.exports = mongoose.model("VoicePhishingTemplate", voicePhishingTemplateSchema);
