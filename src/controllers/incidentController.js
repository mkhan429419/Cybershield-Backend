const whatsappEmailMlService = require("../services/whatsappEmailMlService");
const fusionMlService = require("../services/fusionMlService");
const Incident = require("../models/Incident");

// Use fusion model by default, can be overridden with USE_FUSION_MODEL=false
const USE_FUSION_MODEL = process.env.USE_FUSION_MODEL !== 'false';

/**
 * Analyze a reported incident (email or WhatsApp) using ML pipeline only.
 * POST /api/incidents/analyze
 * Body: { messageType, message, subject?, from?, urls?, date?, text? }
 */
async function analyzeIncident(req, res) {
  try {
    const body = req.body || {};
    const messageType = (body.messageType || "email").toLowerCase();
    const message = body.message || body.text || "";

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing required field: message",
        is_phishing: null,
      });
    }

    const urls = Array.isArray(body.urls) ? body.urls : body.urls ? [body.urls] : [];
    const reportData = {
      messageType: messageType === "whatsapp" ? "whatsapp" : "email",
      message,
      text: body.text || message,
      subject: body.subject || "",
      from: body.from || "",
      from_phone: body.from_phone || body.from || "",
      urls,
      date: body.date || new Date().toISOString(),
      timestamp: body.timestamp || body.date || new Date().toISOString(),
    };

    // Use fusion model if enabled, otherwise use individual model
    let result;
    if (USE_FUSION_MODEL) {
      const formatted = fusionMlService.formatIncidentForML(reportData);
      result = await fusionMlService.predictIncident(formatted);
    } else {
      const formatted = whatsappEmailMlService.formatIncidentForML(reportData);
      result = await whatsappEmailMlService.predictIncident(formatted);
    }

    // Save incident to MongoDB database
    const userId = req.user?._id || null;
    const organizationId = req.user?.orgId || null;

    const incident = new Incident({
      userId,
      organizationId,
      messageType: reportData.messageType,
      message: reportData.message,
      text: reportData.text,
      subject: reportData.subject,
      from: reportData.from,
      from_phone: reportData.from_phone,
      urls: reportData.urls.filter(url => url && url.trim()),
      date: reportData.date ? new Date(reportData.date) : new Date(),
      timestamp: reportData.timestamp ? new Date(reportData.timestamp) : new Date(),
      is_phishing: result.is_phishing,
      phishing_probability: result.phishing_probability,
      legitimate_probability: result.legitimate_probability,
      confidence: result.confidence,
      persuasion_cues: result.persuasion_cues || [],
      analysis_error: result.error || null,
    });

    try {
      await incident.save();
    } catch (saveError) {
      console.error("Error saving incident to MongoDB:", saveError);
      // Continue with response even if save fails - don't break the user experience
    }

    return res.status(200).json({
      success: result.success,
      is_phishing: result.is_phishing,
      phishing_probability: result.phishing_probability,
      legitimate_probability: result.legitimate_probability,
      confidence: result.confidence,
      error: result.error || undefined,
      persuasion_cues: result.persuasion_cues,
      incidentId: incident._id,
    });
  } catch (err) {
    console.error("Incident analyze error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Analysis failed",
      is_phishing: null,
    });
  }
}

/**
 * Get all incidents for the authenticated user
 * GET /api/incidents
 */
async function getIncidents(req, res) {
  try {
    const userId = req.user?._id;
    const organizationId = req.user?.orgId;
    const { page = 1, limit = 50, messageType, isPhishing } = req.query;

    const query = {};
    
    // Filter by user or organization
    if (req.user?.role === "system_admin" || req.user?.role === "client_admin") {
      // Admins can see all incidents in their organization
      if (organizationId) {
        query.organizationId = organizationId;
      }
    } else {
      // Regular users can only see their own incidents
      if (userId) {
        query.userId = userId;
      }
    }

    // Optional filters
    if (messageType && (messageType === "email" || messageType === "whatsapp")) {
      query.messageType = messageType;
    }
    if (isPhishing !== undefined) {
      query.is_phishing = isPhishing === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const incidents = await Incident.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("userId", "displayName email")
      .lean();

    const total = await Incident.countDocuments(query);

    return res.status(200).json({
      success: true,
      incidents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get incidents error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch incidents",
    });
  }
}

/**
 * Get a single incident by ID
 * GET /api/incidents/:id
 */
async function getIncidentById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    const organizationId = req.user?.orgId;

    const query = { _id: id };
    
    // Check permissions
    if (req.user?.role !== "system_admin" && req.user?.role !== "client_admin") {
      query.userId = userId;
    } else if (organizationId) {
      query.organizationId = organizationId;
    }

    const incident = await Incident.findOne(query)
      .populate("userId", "displayName email")
      .lean();

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: "Incident not found",
      });
    }

    return res.status(200).json({
      success: true,
      incident,
    });
  } catch (err) {
    console.error("Get incident error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch incident",
    });
  }
}

module.exports = { analyzeIncident, getIncidents, getIncidentById };
