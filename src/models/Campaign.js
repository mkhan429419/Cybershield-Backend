const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
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
    // Target users for the campaign
    targetUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        email: {
          type: String,
          required: false,
        },
        phoneNumber: {
          type: String,
          required: false,
        },
        name: String,
        // Email status tracking
        emailStatus: {
          type: String,
          enum: [
            "pending",
            "sent",
            "delivered",
            "opened",
            "clicked",
            "reported",
            "failed",
            "not_applicable"
          ],
          default: "not_applicable",
        },
        emailSentAt: Date,
        emailDeliveredAt: Date,
        emailOpenedAt: Date,
        emailClickedAt: Date,
        emailReportedAt: Date,
        emailFailureReason: String,
        // WhatsApp status tracking
        whatsappStatus: {
          type: String,
          enum: [
            "pending",
            "sent",
            "delivered",
            "read",
            "clicked",
            "reported",
            "failed",
            "not_applicable"
          ],
          default: "not_applicable",
        },
        whatsappSentAt: Date,
        whatsappDeliveredAt: Date,
        whatsappReadAt: Date,
        whatsappClickedAt: Date,
        whatsappReportedAt: Date,
        whatsappFailureReason: String,
      },
    ],
    // WhatsApp Campaign Reference
    whatsappCampaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppCampaign",
      required: false,
    },
    // WhatsApp configuration
    whatsappConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      templateId: {
        type: String,
      },
      messageTemplate: {
        type: String,
      },
      landingPageUrl: {
        type: String,
      },
    },
    // Email Records (references to Email model)
    emailRecords: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Email",
      },
    ],
    // Email configuration
    emailConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EmailTemplate",
      },
      subject: {
        type: String,
      },
      bodyContent: {
        type: String,
      },
      senderEmail: {
        type: String,
      },
      landingPageUrl: {
        type: String,
      },
    },
    // Campaign status
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
    // Scheduling
    scheduleDate: {
      type: Date,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    // Statistics
    stats: {
      // Email stats
      totalEmailTargets: { type: Number, default: 0 },
      totalEmailSent: { type: Number, default: 0 },
      totalEmailDelivered: { type: Number, default: 0 },
      totalEmailOpened: { type: Number, default: 0 },
      totalEmailClicked: { type: Number, default: 0 },
      totalEmailReported: { type: Number, default: 0 },
      totalEmailFailed: { type: Number, default: 0 },
      // WhatsApp stats
      totalWhatsappTargets: { type: Number, default: 0 },
      totalWhatsappSent: { type: Number, default: 0 },
      totalWhatsappDelivered: { type: Number, default: 0 },
      totalWhatsappRead: { type: Number, default: 0 },
      totalWhatsappClicked: { type: Number, default: 0 },
      totalWhatsappReported: { type: Number, default: 0 },
      totalWhatsappFailed: { type: Number, default: 0 },
    },
    // Settings
    settings: {
      trackingEnabled: { type: Boolean, default: true },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 300000 }, // 5 minutes in ms
      rateLimit: { type: Number, default: 100 }, // messages per minute
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
campaignSchema.index({ organizationId: 1, status: 1 });
campaignSchema.index({ createdBy: 1 });
campaignSchema.index({ scheduleDate: 1 });
campaignSchema.index({ status: 1, scheduleDate: 1 });

module.exports = mongoose.model("Campaign", campaignSchema);

