const express = require("express");
const router = express.Router();
const { sendEmail } = require("../controllers/emailController");

// Simple send email route - no auth required
router.post("/send", sendEmail);

module.exports = router;

