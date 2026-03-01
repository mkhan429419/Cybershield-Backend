const Report = require("../models/Report");
const multer = require("multer");

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// Middleware to handle file upload
const uploadMiddleware = upload.single("pdf");

/**
 * POST /api/reports
 * Create a new report
 */
async function createReport(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Only allow system_admin and client_admin
    if (req.user.role !== "system_admin" && req.user.role !== "client_admin") {
      return res.status(403).json({ success: false, error: "Access denied. Only admins can create reports." });
    }

    const { reportName, organizationName, reportDate, fileName, reportData } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: "PDF file is required" });
    }

    const report = new Report({
      createdBy: userId,
      organizationId: req.user.orgId || null,
      reportName: reportName || `Analytics Report - ${organizationName || "Organization"}`,
      organizationName: organizationName || null,
      reportDate: reportDate || new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      fileName: fileName || `report-${Date.now()}.pdf`,
      pdfFile: {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      },
      reportData: reportData ? JSON.parse(reportData) : {},
    });

    await report.save();

    return res.status(201).json({
      success: true,
      report: {
        _id: report._id,
        reportName: report.reportName,
        organizationName: report.organizationName,
        reportDate: report.reportDate,
        fileName: report.fileName,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error("createReport error:", error);
    return res.status(500).json({ success: false, error: "Failed to create report" });
  }
}

/**
 * GET /api/reports
 * Get all reports for the current user
 */
async function getUserReports(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Only allow system_admin and client_admin
    if (req.user.role !== "system_admin" && req.user.role !== "client_admin") {
      return res.status(403).json({ success: false, error: "Access denied. Only admins can view reports." });
    }

    const reports = await Report.find({ createdBy: userId })
      .populate("createdBy", "displayName email")
      .sort({ createdAt: -1 })
      .select("-pdfFile") // Don't send PDF data in list
      .lean();

    return res.status(200).json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("getUserReports error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch reports" });
  }
}

/**
 * GET /api/reports/:reportId/download
 * Download a specific report PDF
 */
async function downloadReport(req, res) {
  try {
    const userId = req.user?._id;
    const { reportId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Only allow system_admin and client_admin
    if (req.user.role !== "system_admin" && req.user.role !== "client_admin") {
      return res.status(403).json({ success: false, error: "Access denied. Only admins can download reports." });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    // Check if user owns the report or is a system admin
    if (report.createdBy.toString() !== userId.toString() && req.user.role !== "system_admin") {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    if (!report.pdfFile || !report.pdfFile.data) {
      return res.status(404).json({ success: false, error: "PDF file not found" });
    }

    res.setHeader("Content-Type", report.pdfFile.contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    res.send(report.pdfFile.data);
  } catch (error) {
    console.error("downloadReport error:", error);
    return res.status(500).json({ success: false, error: "Failed to download report" });
  }
}

module.exports = {
  createReport,
  getUserReports,
  downloadReport,
  uploadMiddleware,
};
