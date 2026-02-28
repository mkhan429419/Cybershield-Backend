const express = require("express");
const router = express.Router();
const { requireAuth, getUserData, requireRole } = require("../middleware/auth");
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultScenarios,
} = require("../controllers/voicePhishingTemplateController");

// All routes require authentication and admin role
router.use(requireAuth);
router.use(getUserData);
router.use(requireRole(["system_admin", "client_admin"]));

// Get default scenarios (available to add as templates)
router.get("/defaults", getDefaultScenarios);

// Get all templates
router.get("/", getTemplates);

// Get single template by ID
router.get("/:templateId", getTemplate);

// Create template
router.post("/", createTemplate);

// Update template
router.put("/:templateId", updateTemplate);

// Delete template
router.delete("/:templateId", deleteTemplate);

module.exports = router;
