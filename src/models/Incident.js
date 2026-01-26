const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Allow saving even if user not found (for edge cases)
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    messageType: {
      type: String,
      enum: ["email", "whatsapp"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: false,
    },
    subject: {
      type: String,
      required: false,
    },
    from: {
      type: String,
      required: false,
    },
    from_phone: {
      type: String,
      required: false,
    },
    urls: [{
      type: String,
    }],
    date: {
      type: Date,
      required: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    // ML Analysis Results
    is_phishing: {
      type: Boolean,
      required: false,
    },
    phishing_probability: {
      type: Number,
      required: false,
    },
    legitimate_probability: {
      type: Number,
      required: false,
    },
    confidence: {
      type: Number,
      required: false,
    },
    persuasion_cues: [{
      type: String,
    }],
    analysis_error: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
incidentSchema.index({ userId: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, createdAt: -1 });
incidentSchema.index({ messageType: 1 });
incidentSchema.index({ is_phishing: 1 });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Incident", incidentSchema);
