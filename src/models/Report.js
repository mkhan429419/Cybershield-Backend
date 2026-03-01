const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    reportName: {
      type: String,
      required: true,
    },
    organizationName: {
      type: String,
      required: false,
    },
    reportDate: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    pdfFile: {
      data: Buffer,
      contentType: String,
    },
    reportData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
reportSchema.index({ createdBy: 1, createdAt: -1 });
reportSchema.index({ organizationId: 1, createdAt: -1 });

const Report = mongoose.model("Report", reportSchema);

module.exports = Report;
