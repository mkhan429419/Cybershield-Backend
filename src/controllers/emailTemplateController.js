const EmailTemplate = require("../models/EmailTemplate");

// Get all email templates
const getEmailTemplates = async (req, res) => {
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

    const templates = await EmailTemplate.find(query)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        templates,
        count: templates.length,
      },
    });
  } catch (error) {
    console.error("Get Email Templates Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email templates",
      error: error.message,
    });
  }
};

// Get single email template by ID
const getEmailTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await EmailTemplate.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Get Email Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email template",
      error: error.message,
    });
  }
};

// Create email template (for seeding initial data)
const createEmailTemplate = async (req, res) => {
  try {
    const { title, description, image, category, emailTemplate } = req.body;

    if (!title || !description || !image || !category || !emailTemplate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const template = new EmailTemplate({
      title,
      description,
      image,
      category,
      emailTemplate,
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: "Email template created successfully",
      data: template,
    });
  } catch (error) {
    console.error("Create Email Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create email template",
      error: error.message,
    });
  }
};

const DEFAULT_EMAIL_TEMPLATE_IMAGE =
  "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";

// Create custom email template (user-provided URL + subject + body)
const createCustomEmailTemplate = async (req, res) => {
  try {
    const { title, subject, bodyContent, linkUrl } = req.body;

    if (!subject || !bodyContent) {
      return res.status(400).json({
        success: false,
        message: "Subject and body content are required",
      });
    }

    const template = new EmailTemplate({
      title: title || "Custom Email Template",
      description: "Custom phishing email template created by user",
      image: DEFAULT_EMAIL_TEMPLATE_IMAGE,
      category: "Custom",
      emailTemplate: {
        subject,
        bodyContent,
        linkUrl: linkUrl || "",
      },
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: "Custom email template created successfully",
      data: template,
    });
  } catch (error) {
    console.error("Create Custom Email Template Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create custom email template",
      error: error.message,
    });
  }
};

module.exports = {
  getEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  createCustomEmailTemplate,
};

