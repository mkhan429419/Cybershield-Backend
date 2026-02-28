const VoicePhishingTemplate = require("../models/VoicePhishingTemplate");
const User = require("../models/User");
const { PHISHING_SCENARIOS, NORMAL_SCENARIOS } = require("./voicePhishingController");

/**
 * Get templates based on user role and organization
 * - System admins: see only templates for non-affiliated users (organizationId: null)
 * - Client admins: see only their organization's templates
 */
const getTemplates = async (req, res) => {
  try {
    const user = req.user;
    const { type } = req.query;

    let query = {};

    if (user.role === "client_admin") {
      // Client admins can only see templates for their organization
      if (!user.orgId) {
        return res.status(403).json({
          success: false,
          message: "User is not associated with an organization",
        });
      }
      query.organizationId = user.orgId;
    } else if (user.role === "system_admin") {
      // System admins can only see templates for non-affiliated users
      query.organizationId = null;
    } else {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    // Only get active templates
    query.isActive = true;

    const templates = await VoicePhishingTemplate.find(query)
      .populate("createdBy", "displayName email")
      .populate("organizationId", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error("Get Templates Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch templates",
      error: error.message,
    });
  }
};

/**
 * Get a single template by ID
 */
const getTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const user = req.user;

    const template = await VoicePhishingTemplate.findById(templateId)
      .populate("createdBy", "displayName email")
      .populate("organizationId", "name");

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Check permissions
    if (user.role === "client_admin") {
      if (!user.orgId || template.organizationId?.toString() !== user.orgId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else if (user.role === "system_admin") {
      // System admins can only access templates for non-affiliated users
      if (template.organizationId !== null) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Get Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch template",
      error: error.message,
    });
  }
};

/**
 * Create a new template
 * - Client admins: can only create templates for their organization
 * - System admins: can only create templates for non-affiliated users (organizationId: null)
 */
const createTemplate = async (req, res) => {
  try {
    const user = req.user;
    const { title, description, type, firstMessage } = req.body;

    if (!title || !description || !type || !firstMessage) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, description, type, firstMessage",
      });
    }

    if (!["phishing", "normal"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be either 'phishing' or 'normal'",
      });
    }

    let finalOrganizationId = null;

    if (user.role === "client_admin") {
      // Client admins can only create templates for their organization
      if (!user.orgId) {
        return res.status(403).json({
          success: false,
          message: "User is not associated with an organization",
        });
      }
      finalOrganizationId = user.orgId;
    } else if (user.role === "system_admin") {
      // System admins can only create templates for non-affiliated users
      finalOrganizationId = null;
    } else {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const template = new VoicePhishingTemplate({
      title,
      description,
      type,
      firstMessage,
      organizationId: finalOrganizationId,
      createdBy: user._id,
      isActive: true,
    });

    await template.save();

    const populatedTemplate = await VoicePhishingTemplate.findById(template._id)
      .populate("createdBy", "displayName email")
      .populate("organizationId", "name");

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: populatedTemplate,
    });
  } catch (error) {
    console.error("Create Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create template",
      error: error.message,
    });
  }
};

/**
 * Update a template
 */
const updateTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const user = req.user;
    const { title, description, type, firstMessage, isActive } = req.body;

    const template = await VoicePhishingTemplate.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Check permissions
    if (user.role === "client_admin") {
      if (!user.orgId || template.organizationId?.toString() !== user.orgId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else if (user.role === "system_admin") {
      // System admins can only access templates for non-affiliated users
      if (template.organizationId !== null) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    // Update fields
    if (title !== undefined) template.title = title;
    if (description !== undefined) template.description = description;
    if (type !== undefined) {
      if (!["phishing", "normal"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Type must be either 'phishing' or 'normal'",
        });
      }
      template.type = type;
    }
    if (firstMessage !== undefined) template.firstMessage = firstMessage;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();

    const populatedTemplate = await VoicePhishingTemplate.findById(template._id)
      .populate("createdBy", "displayName email")
      .populate("organizationId", "name");

    res.json({
      success: true,
      message: "Template updated successfully",
      data: populatedTemplate,
    });
  } catch (error) {
    console.error("Update Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update template",
      error: error.message,
    });
  }
};

/**
 * Delete a template (soft delete by setting isActive to false)
 */
const deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const user = req.user;

    const template = await VoicePhishingTemplate.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Check permissions
    if (user.role === "client_admin") {
      if (!user.orgId || template.organizationId?.toString() !== user.orgId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else if (user.role === "system_admin") {
      // System admins can only access templates for non-affiliated users
      if (template.organizationId !== null) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this template",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    // Soft delete
    template.isActive = false;
    await template.save();

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Delete Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete template",
      error: error.message,
    });
  }
};

/**
 * Get default scenarios (hard-coded scenarios from voicePhishingController)
 * These are the base scenarios that admins can add to their templates
 */
const getDefaultScenarios = async (req, res) => {
  try {
    // Combine phishing and normal scenarios
    const allDefaultScenarios = [
      ...PHISHING_SCENARIOS.map((scenario, index) => {
        // Extract title from description (format: "Title - Description")
        const parts = scenario.description.split(" - ");
        const title = parts.length > 1 ? parts[0] : scenario.description.substring(0, 50);
        
        return {
          id: `phishing-${index}`,
          title: title,
          description: scenario.description,
          type: scenario.type,
          firstMessage: scenario.firstMessage,
          isDefault: true,
        };
      }),
      ...NORMAL_SCENARIOS.map((scenario, index) => {
        // Extract title from description (format: "Title - Description")
        const parts = scenario.description.split(" - ");
        const title = parts.length > 1 ? parts[0] : scenario.description.substring(0, 50);
        
        return {
          id: `normal-${index}`,
          title: title,
          description: scenario.description,
          type: scenario.type,
          firstMessage: scenario.firstMessage,
          isDefault: true,
        };
      }),
    ];

    res.json({
      success: true,
      data: allDefaultScenarios,
    });
  } catch (error) {
    console.error("Get Default Scenarios Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch default scenarios",
      error: error.message,
    });
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultScenarios,
};
