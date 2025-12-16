const WhatsAppTemplate = require("../models/WhatsAppTemplate");

// Get all WhatsApp templates
const getWhatsAppTemplates = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    
    const query = {};
    if (category) {
      query.category = category;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      query.isActive = true; // Default to active templates only
    }

    const templates = await WhatsAppTemplate.find(query)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        templates,
        count: templates.length,
      },
    });
  } catch (error) {
    console.error("Get WhatsApp Templates Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp templates",
      error: error.message,
    });
  }
};

// Get single WhatsApp template by ID
const getWhatsAppTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await WhatsAppTemplate.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "WhatsApp template not found",
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Get WhatsApp Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp template",
      error: error.message,
    });
  }
};

// Create WhatsApp template (for admin/seeding)
const createWhatsAppTemplate = async (req, res) => {
  try {
    const { title, description, image, category, messageTemplate } = req.body;

    if (!title || !description || !image || !category || !messageTemplate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const template = new WhatsAppTemplate({
      title,
      description,
      image,
      category,
      messageTemplate,
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: "WhatsApp template created successfully",
      data: template,
    });
  } catch (error) {
    console.error("Create WhatsApp Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create WhatsApp template",
      error: error.message,
    });
  }
};

module.exports = {
  getWhatsAppTemplates,
  getWhatsAppTemplate,
  createWhatsAppTemplate,
};

