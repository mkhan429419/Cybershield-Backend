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

// Admin routes (analytics) - must be before /:conversationId to avoid route conflicts
router.get("/analytics/overview", getConversationAnalytics);

// Get specific conversation - must be last to avoid conflicts with other routes
router.get("/:conversationId", getConversation);

module.exports = router;

