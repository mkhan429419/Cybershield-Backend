const VoicePhishingConversation = require("../models/VoicePhishingConversation");
const elevenlabsService = require("../services/elevenlabsService");
const User = require("../models/User");

// Phishing scenarios (mix of phishing and normal)
// Note: The prompt is set in ElevenLabs dashboard with variables like {{scenario_type}} and {{scenario_description}}
const PHISHING_SCENARIOS = [
  {
    type: "phishing",
    description: "Bank Security Alert - Someone is trying to access your account. Please verify your identity.",
    firstMessage: "Hello, this is your bank's security department. We've detected suspicious activity on your account. Can you verify your identity by providing your account password?",
  },
  {
    type: "phishing",
    description: "Tech Support - Your computer has been infected. We need your login credentials to fix it.",
    firstMessage: "Hello, this is Microsoft Tech Support. We've detected a virus on your computer. We need your login credentials to fix it remotely. Can you provide your password?",
  },
  {
    type: "phishing",
    description: "IRS Tax Refund - You're eligible for a tax refund. Please provide your SSN and bank details.",
    firstMessage: "Hello, this is the IRS. You're eligible for a tax refund. To process your refund, we need your Social Security Number and bank account details. Can you provide that information?",
  },
  {
    type: "normal",
    description: "Customer Service - General inquiry about account services and features.",
    firstMessage: "Hello, this is customer service. How can I help you today?",
  },
  {
    type: "normal",
    description: "Appointment Confirmation - Confirming your scheduled appointment.",
    firstMessage: "Hello, this is calling to confirm your scheduled appointment. Can you confirm the date and time?",
  },
];

/**
 * Get a random scenario (mix of phishing and normal)
 */
function getRandomScenario() {
  return PHISHING_SCENARIOS[Math.floor(Math.random() * PHISHING_SCENARIOS.length)];
}

/**
 * Initialize a new voice phishing conversation
 * This endpoint just creates a conversation record and returns scenario info.
 * The frontend will use the React SDK directly to connect to ElevenLabs.
 */
const initiateConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const connectionType = req.body.connectionType || "webrtc"; // "webrtc" or "websocket"

    // Get a random scenario
    const scenario = getRandomScenario();
    
    // Use single agent ID from environment (just for reference, frontend will use it)
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    
    if (!agentId) {
      return res.status(500).json({
        success: false,
        message: "ElevenLabs agent ID not configured",
        error: "ELEVENLABS_AGENT_ID environment variable is required",
      });
    }

    // Create conversation record (ElevenLabs conversation ID will be updated later)
    const conversation = new VoicePhishingConversation({
      userId,
      organizationId: req.user.orgId || null,
      elevenLabsConversationId: "", // Will be updated after frontend connects
      agentId: agentId,
      scenarioType: scenario.type,
      scenarioDescription: scenario.description,
      status: "initiated",
      metadata: {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip || req.connection.remoteAddress,
        connectionType,
      },
    });

    await conversation.save();

    res.json({
      success: true,
      data: {
        conversationId: conversation._id.toString(),
        connectionType,
        scenario: {
          type: scenario.type,
          description: scenario.description,
          firstMessage: scenario.firstMessage,
          // Variables to pass to ElevenLabs agent via React SDK overrides
          variables: {
            scenario_type: scenario.type,
            scenario_description: scenario.description,
          },
        },
      },
    });
  } catch (error) {
    console.error("Initiate Conversation Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate conversation",
      error: error.message,
    });
  }
};

/**
 * Update conversation with transcript messages (called from frontend in real-time)
 */
const updateTranscript = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messages, conversationId: elevenLabsConversationId } = req.body;
    const userId = req.user._id;

    const conversation = await VoicePhishingConversation.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Update ElevenLabs conversation ID if provided (from frontend React SDK)
    if (elevenLabsConversationId && !conversation.elevenLabsConversationId) {
      conversation.elevenLabsConversationId = elevenLabsConversationId;
    }

    // Update transcript
    if (messages && Array.isArray(messages)) {
      // Add new messages that don't already exist
      messages.forEach((msg) => {
        const exists = conversation.transcript.some(
          (t) => t.message === msg.message && t.role === msg.role
        );
        if (!exists) {
          conversation.transcript.push({
            role: msg.role,
            message: msg.message,
            timestamp: new Date(),
          });
        }
      });

      // Update full transcript
      conversation.fullTranscript = conversation.transcript
        .map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.message}`)
        .join("\n");
    }

    conversation.status = "active";
    await conversation.save();

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Update Transcript Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update transcript",
      error: error.message,
    });
  }
};

/**
 * End conversation and calculate score
 */
const endConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await VoicePhishingConversation.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (conversation.status === "completed") {
      return res.json({
        success: true,
        data: conversation,
        message: "Conversation already completed",
      });
    }

    // Get full transcript
    const fullTranscript = conversation.fullTranscript || 
      conversation.transcript
        .map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.message}`)
        .join("\n");

    // Analyze conversation using ElevenLabs service
    let analysis;
    try {
      analysis = await elevenlabsService.analyzeConversation(
        fullTranscript,
        conversation.scenarioType
      );
    } catch (error) {
      console.error("Analysis error:", error);
      analysis = {
        success: false,
        error: error.message || "Analysis failed",
      };
    }

    if (!analysis || !analysis.success) {
      console.error("Analysis failed:", analysis?.error || "Unknown error");
      // Still mark as completed even if analysis fails
      conversation.status = "completed";
      conversation.endedAt = new Date();
      const duration = Math.floor((conversation.endedAt - conversation.startedAt) / 1000);
      conversation.duration = duration;
      await conversation.save();

      return res.status(500).json({
        success: false,
        message: "Failed to analyze conversation",
        error: analysis.error,
        data: conversation,
      });
    }

    // Update conversation with analysis results
    conversation.status = "completed";
    conversation.endedAt = new Date();
    const duration = Math.floor((conversation.endedAt - conversation.startedAt) / 1000);
    conversation.duration = duration;
    conversation.score = analysis.analysis.score;
    conversation.scoreDetails = {
      fellForPhishing: analysis.analysis.fellForPhishing,
      providedSensitiveInfo: analysis.analysis.providedSensitiveInfo,
      sensitiveInfoTypes: analysis.analysis.sensitiveInfoTypes,
      resistanceLevel: analysis.analysis.resistanceLevel,
      analysisRationale: analysis.analysis.analysisRationale,
    };

    await conversation.save();

    // Update user's risk score based on performance
    const user = await User.findById(userId);
    if (user) {
      // Simple risk score update (can be enhanced)
      // Lower score = higher risk
      const riskAdjustment = analysis.analysis.score < 50 ? 10 : analysis.analysis.score < 75 ? 5 : -5;
      user.riskScore = Math.max(0, Math.min(100, (user.riskScore || 0) + riskAdjustment));
      
      // Update points based on performance
      const pointsEarned = Math.floor(analysis.analysis.score / 10);
      user.points = (user.points || 0) + pointsEarned;
      
      await user.save();
    }

    res.json({
      success: true,
      data: conversation,
      message: "Conversation completed and analyzed",
    });
  } catch (error) {
    console.error("End Conversation Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end conversation",
      error: error.message,
    });
  }
};

/**
 * Get user's conversation history
 */
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, scenarioType } = req.query;

    const query = { userId };
    if (scenarioType) {
      query.scenarioType = scenarioType;
    }

    const conversations = await VoicePhishingConversation.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-transcript -fullTranscript"); // Exclude full transcript for list view

    const total = await VoicePhishingConversation.countDocuments(query);

    res.json({
      success: true,
      data: {
        conversations,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Get Conversations Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

/**
 * Get a specific conversation with full details
 */
const getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await VoicePhishingConversation.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Get Conversation Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
      error: error.message,
    });
  }
};

/**
 * Get conversation analytics for admins
 */
const getConversationAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const userRole = req.user.role;

    let query = {};
    
    // Client admins can only see their org's data
    if (userRole === "client_admin" && organizationId) {
      query.organizationId = organizationId;
    }
    // System admins can see all data (no filter)

    const conversations = await VoicePhishingConversation.find(query);

    const analytics = {
      totalConversations: conversations.length,
      completedConversations: conversations.filter((c) => c.status === "completed").length,
      averageScore: 0,
      phishingScenarios: {
        total: conversations.filter((c) => c.scenarioType === "phishing").length,
        fellForPhishing: conversations.filter(
          (c) => c.scenarioType === "phishing" && c.scoreDetails?.fellForPhishing
        ).length,
      },
      normalScenarios: {
        total: conversations.filter((c) => c.scenarioType === "normal").length,
      },
      resistanceLevels: {
        high: conversations.filter((c) => c.scoreDetails?.resistanceLevel === "high").length,
        medium: conversations.filter((c) => c.scoreDetails?.resistanceLevel === "medium").length,
        low: conversations.filter((c) => c.scoreDetails?.resistanceLevel === "low").length,
      },
    };

    const completedWithScores = conversations.filter(
      (c) => c.status === "completed" && c.score !== null
    );
    if (completedWithScores.length > 0) {
      analytics.averageScore =
        completedWithScores.reduce((sum, c) => sum + c.score, 0) / completedWithScores.length;
    }

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Get Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};

module.exports = {
  initiateConversation,
  updateTranscript,
  endConversation,
  getConversations,
  getConversation,
  getConversationAnalytics,
};

