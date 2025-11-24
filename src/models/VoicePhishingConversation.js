const mongoose = require("mongoose");

const voicePhishingConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    elevenLabsConversationId: {
      type: String,
      required: false, // Will be set after frontend connects to ElevenLabs
      unique: true,
      sparse: true, // Allows multiple null/empty values for unique index
    },
    agentId: {
      type: String,
      required: true,
    },
    scenarioType: {
      type: String,
      enum: ["phishing", "normal"],
      required: true,
    },
    scenarioDescription: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["initiated", "active", "completed", "failed"],
      default: "initiated",
    },
    transcript: [
      {
        role: {
          type: String,
          enum: ["user", "agent"],
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    fullTranscript: {
      type: String,
      default: "",
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    scoreDetails: {
      fellForPhishing: {
        type: Boolean,
        default: false,
      },
      providedSensitiveInfo: {
        type: Boolean,
        default: false,
      },
      sensitiveInfoTypes: [String], // e.g., ["password", "credit_card", "ssn"]
      resistanceLevel: {
        type: String,
        enum: ["high", "medium", "low"],
        default: null,
      },
      analysisRationale: {
        type: String,
        default: "",
      },
    },
    duration: {
      type: Number, // Duration in seconds
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      userAgent: String,
      ipAddress: String,
      connectionType: String, // "webrtc" or "websocket"
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
voicePhishingConversationSchema.index({ userId: 1, createdAt: -1 });
voicePhishingConversationSchema.index({ organizationId: 1, status: 1 });
// Note: elevenLabsConversationId already has an index from unique: true, so we don't need to define it again
voicePhishingConversationSchema.index({ scenarioType: 1 });

module.exports = mongoose.model(
  "VoicePhishingConversation",
  voicePhishingConversationSchema
);

