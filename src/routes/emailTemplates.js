const express = require("express");
const router = express.Router();
const {
  getEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
} = require("../controllers/emailTemplateController");

// Get all email templates
router.get("/", getEmailTemplates);

// Get single email template by ID
router.get("/:templateId", getEmailTemplate);

// Create email template (for admin/seeding)
router.post("/", createEmailTemplate);

module.exports = router;

