const mongoose = require("mongoose");

/**
 * Records email phishing simulation events per user for email risk scoring.
 * Used to track: email_opened, email_clicked, email_credentials_submitted.
 * Weights: opened 0.2, clicked 0.5, credentials 0.7.
 */
const emailRiskEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventType: {
      type: String,
      enum: [
        "email_opened",
        "email_clicked",
        "email_credentials_submitted",
      ],
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: false,
    },
    emailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Email",
      required: false,
    },
    weight: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

emailRiskEventSchema.index({ userId: 1, createdAt: -1 });
emailRiskEventSchema.index({ campaignId: 1, eventType: 1 });

module.exports = mongoose.model("EmailRiskEvent", emailRiskEventSchema);
