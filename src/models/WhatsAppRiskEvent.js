const mongoose = require("mongoose");

/**
 * Records WhatsApp phishing simulation events per user for WhatsApp risk scoring.
 * Used to track: whatsapp_read, whatsapp_clicked, whatsapp_credentials_submitted.
 * Weights: read 0.2, clicked 0.5, credentials 0.7.
 */
const whatsAppRiskEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventType: {
      type: String,
      enum: [
        "whatsapp_read",
        "whatsapp_clicked",
        "whatsapp_credentials_submitted",
      ],
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppCampaign",
      required: false,
    },
    weight: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

whatsAppRiskEventSchema.index({ userId: 1, createdAt: -1 });
whatsAppRiskEventSchema.index({ campaignId: 1, eventType: 1 });

module.exports = mongoose.model("WhatsAppRiskEvent", whatsAppRiskEventSchema);
