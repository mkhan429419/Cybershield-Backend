const express = require("express");
const router = express.Router();
const {
  getWhatsAppTemplates,
  getWhatsAppTemplate,
  createWhatsAppTemplate,
  createCustomWhatsAppTemplate,
} = require("../controllers/whatsAppTemplateController");

// Get all WhatsApp templates
router.get("/", getWhatsAppTemplates);

// Create custom WhatsApp template (user-provided URL + message body)
router.post("/custom", createCustomWhatsAppTemplate);

// Get single WhatsApp template by ID
router.get("/:templateId", getWhatsAppTemplate);

// Create WhatsApp template (for admin/seeding)
router.post("/", createWhatsAppTemplate);

module.exports = router;

