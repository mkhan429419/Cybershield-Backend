const express = require("express");
const router = express.Router();
const { requireAuth, getUserData } = require("../middleware/auth");
const { sendMessage } = require("../controllers/chatController");

// All routes require authentication
router.use(requireAuth);
router.use(getUserData);

// Send chat message
router.post("/message", sendMessage);

module.exports = router;
