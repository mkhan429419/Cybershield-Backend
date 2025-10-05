const mongoose = require("mongoose");

const whatsAppCampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    templateId: {
      type: String,
      required: true,
    },
    targetUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        phoneNumber: {
          type: String,
          required: true,
        },
        name: String,
        status: {
          type: String,
          enum: [
            "pending",
            "sent",
            "delivered",
            "read",
            "clicked",
            "reported",
            "failed",
          ],
          default: "pending",
        },
        sentAt: Date,
        deliveredAt: Date,
        readAt: Date,
        clickedAt: Date,
        reportedAt: Date,
        failureReason: String,
      },
    ],
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "running",
        "completed",
        "paused",
        "cancelled",
      ],
      default: "draft",
    },
    scheduleDate: {
      type: Date,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    messageTemplate: {
      type: String,
      required: true,
    },
    landingPageUrl: {
      type: String,
      required: true,
    },
    trackingEnabled: {
      type: Boolean,
      default: true,
    },
    stats: {
      totalSent: { type: Number, default: 0 },
      totalDelivered: { type: Number, default: 0 },
      totalRead: { type: Number, default: 0 },
      totalClicked: { type: Number, default: 0 },
      totalReported: { type: Number, default: 0 },
      totalFailed: { type: Number, default: 0 },
    },
    settings: {
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 300000 },
      rateLimit: { type: Number, default: 100 },
    },
  },
  {
    timestamps: true,
  }
);
whatsAppCampaignSchema.index({ organizationId: 1, status: 1 });
whatsAppCampaignSchema.index({ createdBy: 1 });
whatsAppCampaignSchema.index({ scheduleDate: 1 });

module.exports = mongoose.model("WhatsAppCampaign", whatsAppCampaignSchema);
