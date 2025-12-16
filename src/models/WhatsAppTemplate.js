const mongoose = require("mongoose");

const whatsAppTemplateSchema = new mongoose.Schema(
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
    messageTemplate: {
      type: String,
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
whatsAppTemplateSchema.index({ category: 1, isActive: 1 });
whatsAppTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("WhatsAppTemplate", whatsAppTemplateSchema);

