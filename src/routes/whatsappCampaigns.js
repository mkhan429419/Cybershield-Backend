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
  recordClick,
} = require("../controllers/whatsappCampaignController");

const publicPaths = ["/webhook", "/click"];
router.use((req, res, next) => {
  if (publicPaths.includes(req.path)) {
    next();
  } else {
    requireAuth(req, res, next);
  }
});

router.use((req, res, next) => {
  if (publicPaths.includes(req.path)) {
    next();
  } else {
    getUserData(req, res, next);
  }
});
router.post("/", createCampaign);
router.get("/", getCampaigns);

// Public routes (no auth) – must be before /:campaignId so "click" and "webhook" are not treated as IDs
router.options("/click", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Max-Age", "86400");
  res.sendStatus(204);
});
router.get("/click", recordClick);
router.post("/webhook", handleTwilioWebhook);

router.get("/:campaignId", getCampaign);
router.put("/:campaignId", updateCampaign);
router.delete("/:campaignId", deleteCampaign);
router.post("/:campaignId/start", startCampaign);
router.get("/:campaignId/analytics", getCampaignAnalytics);

module.exports = router;
