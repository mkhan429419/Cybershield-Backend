const express = require("express");
const router = express.Router();
const { requireAuth, getUserData } = require("../middleware/auth");
const {
  initiateConversation,
  updateTranscript,
  endConversation,
  getConversations,
  getConversation,
  getConversationAnalytics,
} = require("../controllers/voicePhishingController");

// All routes require authentication
router.use(requireAuth);
router.use(getUserData);

// User routes
router.post("/initiate", initiateConversation);
router.post("/:conversationId/transcript", updateTranscript);
router.post("/:conversationId/end", endConversation);
router.get("/", getConversations);
router.get("/:conversationId", getConversation);

// Admin routes (analytics)
router.get("/analytics/overview", getConversationAnalytics);

module.exports = router;

