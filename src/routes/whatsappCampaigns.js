const express = require("express");
const router = express.Router();
const { requireAuth, getUserData } = require("../middleware/auth");
const {
  createCampaign,
  getCampaigns,
  getCampaign,
  startCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignAnalytics,
  handleTwilioWebhook,
} = require("../controllers/whatsappCampaignController");

router.use((req, res, next) => {
  if (req.path === "/webhook") {
    next();
  } else {
    requireAuth(req, res, next);
  }
});

router.use((req, res, next) => {
  if (req.path === "/webhook") {
    next();
  } else {
    getUserData(req, res, next);
  }
});
router.post("/", createCampaign);
router.get("/", getCampaigns);
router.get("/:campaignId", getCampaign);
router.put("/:campaignId", updateCampaign);
router.delete("/:campaignId", deleteCampaign);
router.post("/:campaignId/start", startCampaign);
router.get("/:campaignId/analytics", getCampaignAnalytics);
router.post("/webhook", handleTwilioWebhook);

module.exports = router;
