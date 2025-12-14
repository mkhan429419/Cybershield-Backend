const express = require("express");
const router = express.Router();
const { sendEmail, getEmails } = require("../controllers/emailController");

// Get all emails
router.get("/", getEmails);

// Send email route
router.post("/send", sendEmail);

module.exports = router;

