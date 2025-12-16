const express = require("express");
const router = express.Router();
const {
  getWhatsAppTemplates,
  getWhatsAppTemplate,
  createWhatsAppTemplate,
} = require("../controllers/whatsAppTemplateController");

// Get all WhatsApp templates
router.get("/", getWhatsAppTemplates);

// Get single WhatsApp template by ID
router.get("/:templateId", getWhatsAppTemplate);

// Create WhatsApp template (for admin/seeding)
router.post("/", createWhatsAppTemplate);

module.exports = router;

