const express = require("express");
const router = express.Router();
const {
  createReport,
  getUserReports,
  downloadReport,
  uploadMiddleware,
} = require("../controllers/reportController");
const { requireAuth, getUserData } = require("../middleware/auth");

const authenticate = [requireAuth, getUserData];

// Apply authentication middleware to all report routes
router.use(requireAuth);
router.use(getUserData);

// POST /api/reports - Create a new report (with file upload)
router.post("/", uploadMiddleware, createReport);

// GET /api/reports - Get all reports for the current user
router.get("/", authenticate, getUserReports);

// GET /api/reports/:reportId/download - Download a specific report
router.get("/:reportId/download", authenticate, downloadReport);

module.exports = router;
