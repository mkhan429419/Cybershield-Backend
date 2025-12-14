const express = require("express");
const router = express.Router();
const { requireAuth, getUserData } = require("../middleware/auth");
const {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignAnalytics,
} = require("../controllers/campaignController");

// Apply authentication middleware to all routes
router.use(requireAuth);
router.use(getUserData);

// Campaign CRUD operations
router.post("/", createCampaign);
router.get("/", getCampaigns);
router.get("/:campaignId", getCampaign);
router.put("/:campaignId", updateCampaign);
router.delete("/:campaignId", deleteCampaign);

// Campaign control operations
router.post("/:campaignId/start", startCampaign);
router.post("/:campaignId/pause", pauseCampaign);
router.post("/:campaignId/resume", resumeCampaign);
router.post("/:campaignId/cancel", cancelCampaign);

// Campaign analytics
router.get("/:campaignId/analytics", getCampaignAnalytics);

module.exports = router;

