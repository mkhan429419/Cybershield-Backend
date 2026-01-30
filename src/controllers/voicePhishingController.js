const VoicePhishingConversation = require("../models/VoicePhishingConversation");
const geminiService = require("../services/geminiService");
const voicePhishingMLService = require("../services/voicePhishingMLService");
const translationService = require("../services/translationService");
const User = require("../models/User");

// Configuration: Set to 'ml' to use ML model, 'gemini' to use Gemini AI
const ANALYSIS_METHOD = process.env.VOICE_PHISHING_ANALYSIS_METHOD || 'ml';
// Model type: 'ml', 'cnn_bilstm', 'ensemble', or 'auto' (auto-selects best available)
// Default: 'cnn_bilstm' - uses CNN-BiLSTM model only
const MODEL_TYPE = process.env.VOICE_PHISHING_MODEL_TYPE || 'cnn_bilstm';

// Phishing scenarios - Pakistan context
// Note: The prompt is set in ElevenLabs dashboard with variables like {{scenario_type}} and {{scenario_description}}
const PHISHING_SCENARIOS = [
  {
    type: "phishing",
    description: "HBL Bank Security Alert - Suspicious activity detected on your account. Verify your identity immediately.",
    firstMessage: "Assalam-o-Alaikum, this is HBL security department. We detected suspicious activity on your account. Can you verify your identity with your account password?",
  },
  {
    type: "phishing",
    description: "UBL Account Suspension - Your account will be suspended if you don't verify it now.",
    firstMessage: "Hello, this is UBL. Your account will be suspended in 2 hours if you don't verify it. Please provide your CNIC number and ATM PIN to verify.",
  },
  {
    type: "phishing",
    description: "Meezan Bank OTP Verification - We need to verify your account with an OTP code.",
    firstMessage: "Assalam-o-Alaikum, this is Meezan Bank. We need to verify your account. Please share the OTP code we just sent to your phone.",
  },
  {
    type: "phishing",
    description: "Daraz Parcel Delivery - You have a parcel waiting. Verify your details to receive it.",
    firstMessage: "Hello, you have a parcel from Daraz waiting for delivery. To confirm delivery, we need your CNIC number and address verification.",
  },
  {
    type: "phishing",
    description: "Jeeto Pakistan Prize - You've won a prize! Claim it by providing your details.",
    firstMessage: "Congratulations! You've won 50,000 rupees in Jeeto Pakistan. To claim your prize, we need your CNIC number and bank account details.",
  },
  {
    type: "phishing",
    description: "Police Case - A complaint has been filed against you. Verify your identity.",
    firstMessage: "This is the police station. A complaint has been filed against you. We need your CNIC number and address to verify your identity.",
  },
  {
    type: "phishing",
    description: "PTCL Tech Support - Your internet has been compromised. We need your account details.",
    firstMessage: "This is PTCL technical support. We detected suspicious activity on your internet connection. We need your account password and CNIC to secure it.",
  },
  {
    type: "phishing",
    description: "NADRA Verification - Your CNIC needs verification. Provide your details.",
    firstMessage: "This is NADRA. Your CNIC needs immediate verification. Please provide your CNIC number, date of birth, and mother's name.",
  },
  {
    type: "phishing",
    description: "FIA Investigation - You're under investigation. Provide information to clear your name.",
    firstMessage: "This is FIA. You're under investigation for suspicious transactions. To clear your name, we need your bank account details and CNIC number.",
  },
  {
    type: "phishing",
    description: "Easypaisa Account Verification - Your account needs verification to continue using services.",
    firstMessage: "This is Easypaisa. Your account needs verification. Please share your mobile wallet PIN and CNIC number.",
  },
  {
    type: "phishing",
    description: "JazzCash Security Alert - Unusual activity detected. Verify your account.",
    firstMessage: "This is JazzCash security. We detected unusual activity on your account. Please verify with your account PIN and CNIC number.",
  },
  {
    type: "phishing",
    description: "Jazz SIM Verification - Your SIM needs verification to avoid deactivation.",
    firstMessage: "This is Jazz. Your SIM card will be deactivated in 24 hours if you don't verify it. Please provide your CNIC number and the OTP we sent.",
  },
  {
    type: "phishing",
    description: "Telenor SIM Verification - Verify your SIM to continue service.",
    firstMessage: "This is Telenor. Your SIM needs verification. Please share your CNIC number and the verification code we sent.",
  },
  {
    type: "phishing",
    description: "Allied Bank Account Blocked - Your account has been blocked. Unblock it by verifying.",
    firstMessage: "This is Allied Bank. Your account has been blocked due to suspicious activity. To unblock it, provide your CNIC and account password.",
  },
];

const NORMAL_SCENARIOS = [
  {
    type: "normal",
    description: "HBL Customer Service - General inquiry about account services.",
    firstMessage: "Assalam-o-Alaikum, this is HBL customer service. How can I help you today?",
  },
  {
    type: "normal",
    description: "UBL Account Information - Informing about account features.",
    firstMessage: "Hello, this is UBL. We're calling to inform you about new mobile banking features. Would you like to know more?",
  },
  {
    type: "normal",
    description: "Meezan Bank Service Update - Informing about new services.",
    firstMessage: "Assalam-o-Alaikum, this is Meezan Bank. We're calling to inform you about our new Islamic banking products. Would you like to know more?",
  },
  {
    type: "normal",
    description: "Appointment Confirmation - Confirming your scheduled appointment.",
    firstMessage: "Hello, I'm calling to confirm your appointment scheduled for tomorrow. Can you confirm the time?",
  },
  {
    type: "normal",
    description: "Daraz Order Update - Updating you about your order status.",
    firstMessage: "Hello, this is Daraz. We're calling to update you that your order has been shipped. It will arrive in 2-3 days.",
  },
  {
    type: "normal",
    description: "PTCL Service Inquiry - General information about internet packages.",
    firstMessage: "Hello, this is PTCL. We're calling to inform you about our new internet packages. Would you like to hear about them?",
  },
];

/**
 * Get a random scenario with weighted selection
 * 70% chance of phishing scenario, 30% chance of normal scenario
 */
function getRandomScenario() {
  const random = Math.random();
  
  // 70% chance for phishing, 30% chance for normal
  if (random < 0.7) {
    // Select random phishing scenario
    return PHISHING_SCENARIOS[Math.floor(Math.random() * PHISHING_SCENARIOS.length)];
  } else {
    // Select random normal scenario
    return NORMAL_SCENARIOS[Math.floor(Math.random() * NORMAL_SCENARIOS.length)];
  }
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
      // elevenLabsConversationId will be undefined initially (sparse unique index allows multiple undefined values)
      // It will be set after frontend connects to ElevenLabs
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
    console.log("End conversation request received");
    const { conversationId } = req.params;
    const userId = req.user._id;

    console.log("Looking for conversation:", conversationId, "for user:", userId);

    const conversation = await VoicePhishingConversation.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      console.error("Conversation not found:", conversationId);
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    console.log("Conversation found, status:", conversation.status);

    if (conversation.status === "completed") {
      console.log("Conversation already completed, returning existing data");
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
    
    console.log("Full transcript length:", fullTranscript?.length || 0);
    console.log("Transcript preview:", fullTranscript?.substring(0, 100) || "empty");

    // Translate transcript to English for ML model analysis (ML models are trained on English)
    // The CNN-BiLSTM and other ML models only understand English, so we need to translate Hindi transcripts
    let translatedTranscript = fullTranscript;
    let translationInfo = { wasTranslated: false, originalLanguage: 'en' };
    
    try {
      const translationResult = await translationService.translateForMLAnalysis(fullTranscript);
      translatedTranscript = translationResult.translated;
      translationInfo = {
        wasTranslated: translationResult.wasTranslated,
        originalLanguage: translationResult.originalLanguage
      };
      
      if (translationInfo.wasTranslated) {
        console.log(`📝 Translated transcript from ${translationInfo.originalLanguage} to English for ML analysis`);
        console.log(`Original preview: ${fullTranscript.substring(0, 100)}...`);
        console.log(`Translated preview: ${translatedTranscript.substring(0, 100)}...`);
      }
    } catch (translationError) {
      console.warn("⚠️  Translation failed, using original transcript:", translationError.message);
      // Continue with original transcript if translation fails
      translatedTranscript = fullTranscript;
    }

    // Analyze conversation using ML model or Gemini AI service
    let analysis;
    try {
      if (ANALYSIS_METHOD === 'ml') {
        console.log("Using ML model for analysis...");
        console.log("Transcript length:", fullTranscript?.length || 0);
        console.log("Scenario type:", conversation.scenarioType);
        console.log("Model type:", MODEL_TYPE);
        
        // Hybrid approach: Use CNN-BiLSTM for score/resistance, Gemini for summary/info types
        if (MODEL_TYPE === 'cnn_bilstm') {
          console.log("Using hybrid approach: CNN-BiLSTM + Gemini");
          
          // Get CNN-BiLSTM results (score, resistance, fellForPhishing)
          // Use translated transcript for ML model (trained on English)
          const analysisPromise = voicePhishingMLService.analyzeConversation(
            translatedTranscript,
            conversation.scenarioType,
            MODEL_TYPE
          );
          
          // Set a timeout of 60 seconds for ML analysis
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('ML analysis timed out after 60 seconds')), 60000);
          });
          
          const cnnAnalysis = await Promise.race([analysisPromise, timeoutPromise]);
          
          // Get Gemini results (summary, info types)
          // Use translated transcript for Gemini to ensure consistent analysis
          // Gemini can handle multiple languages, but using English ensures better consistency
          const geminiResult = await geminiService.getSummaryAndInfoTypes(
            translatedTranscript,
            conversation.scenarioType
          );
          
          // Combine results: CNN-BiLSTM for score/resistance, Gemini for summary/info types
          if (cnnAnalysis.success && geminiResult.success) {
            // Use Gemini's info types to determine if sensitive info was provided
            const hasSensitiveInfo = geminiResult.sensitiveInfoTypes && geminiResult.sensitiveInfoTypes.length > 0;
            
            // Calculate nuanced score based on:
            // 1. CNN-BiLSTM base prediction
            // 2. What info was actually provided (from Gemini)
            // 3. Amount of resistance shown
            let finalScore = cnnAnalysis.analysis.score;
            let finalResistanceLevel = cnnAnalysis.analysis.resistanceLevel;
            let finalFellForPhishing = cnnAnalysis.analysis.fellForPhishing;
            
            // Define criticality of info types (higher = more critical)
            const infoCriticality = {
              'password': 10,
              'atm_pin': 10,
              'cnic': 9,
              'credit_card': 8,
              'bank_account': 7,
              'otp': 6,
              'mobile_wallet_pin': 6,
              'personal_info': 4,  // Date of birth, mother's name - less critical
              'address': 3,
              'other': 2
            };
            
            // Calculate total criticality of provided info
            const totalCriticality = (geminiResult.sensitiveInfoTypes || []).reduce((sum, type) => {
              return sum + (infoCriticality[type] || 2);
            }, 0);
            
            // Adjust score based on what was provided and resistance shown
            if (hasSensitiveInfo) {
              // User provided some info - adjust score based on:
              // 1. How critical the info is
              // 2. How much resistance was shown (from CNN-BiLSTM)
              
              const baseScore = cnnAnalysis.analysis.score;
              const resistanceScore = cnnAnalysis.analysis.resistanceLevel === 'high' ? 3 : 
                                     cnnAnalysis.analysis.resistanceLevel === 'medium' ? 2 : 1;
              
              // Calculate adjusted score:
              // - Start from base score (0-20 if fell for it, 60-80 if resisted)
              // - If base is very low (0-20), it means model thinks they fell for it
              // - Add points for resistance shown
              // - Subtract points based on criticality of info provided
              
              if (baseScore <= 20) {
                // Model predicted "fell for it" - but check if there was resistance
                // Score range: 0-20 (very poor)
                // Adjust: Add points for resistance, but still penalize for providing info
                const resistanceBonus = resistanceScore * 5; // 5-15 points for resistance
                const criticalityPenalty = Math.min(totalCriticality * 2, 15); // Penalty based on criticality
                
                // Final score: base + resistance bonus - criticality penalty
                // But cap it appropriately for partial resistance cases
                finalScore = Math.max(0, Math.min(50, baseScore + resistanceBonus - criticalityPenalty));
                
                // If score is in the 20-50 range, it's partial resistance
                if (finalScore > 20 && finalScore < 50) {
                  finalResistanceLevel = 'medium';
                  finalFellForPhishing = true; // They did provide info, but showed resistance
                } else if (finalScore <= 20) {
                  finalResistanceLevel = 'low';
                  finalFellForPhishing = true;
                }
              } else if (baseScore >= 60) {
                // Model predicted "resisted" - but check if info was actually provided
                // If info was provided, this is a misclassification - adjust score down
                if (totalCriticality > 5) {
                  // Critical info provided - adjust score down significantly
                  finalScore = Math.max(20, baseScore - 30 - (totalCriticality * 2));
                  finalResistanceLevel = 'medium';
                  finalFellForPhishing = true;
                } else if (totalCriticality > 0) {
                  // Non-critical info provided - moderate adjustment
                  finalScore = Math.max(30, baseScore - 20 - totalCriticality);
                  finalResistanceLevel = 'medium';
                  finalFellForPhishing = true;
                }
                // If no info provided, keep the high score
              }
            } else {
              // No sensitive info provided - user resisted
              // If model predicted "fell for it" but no info, it's likely a misclassification
              if (cnnAnalysis.analysis.score <= 20) {
                // Model predicted "fell for it" but no info - likely resistance
                finalScore = Math.max(60, 60 + (cnnAnalysis.analysis.modelConfidence * 20));
                finalResistanceLevel = 'high';
                finalFellForPhishing = false;
              }
              // If model predicted "resisted" and no info, keep the high score
            }
            
            // Ensure score is in valid range
            finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
            
            analysis = {
              success: true,
              analysis: {
                // Adjusted scores based on hybrid analysis
                score: finalScore,
                fellForPhishing: finalFellForPhishing,
                resistanceLevel: finalResistanceLevel,
                // Keep original model info for reference
                modelPrediction: cnnAnalysis.analysis.modelPrediction,
                modelConfidence: cnnAnalysis.analysis.modelConfidence,
                modelType: 'cnn_bilstm_hybrid',
                // From Gemini (summary and info type detection)
                providedSensitiveInfo: hasSensitiveInfo,
                sensitiveInfoTypes: geminiResult.sensitiveInfoTypes || [],
                analysisRationale: geminiResult.analysisRationale,
              }
            };
            console.log("Hybrid analysis completed successfully");
            console.log("CNN-BiLSTM base score:", cnnAnalysis.analysis.score);
            console.log("CNN-BiLSTM resistance:", cnnAnalysis.analysis.resistanceLevel);
            console.log("Gemini info types:", geminiResult.sensitiveInfoTypes);
            console.log("Total criticality:", totalCriticality);
            console.log("Final adjusted score:", finalScore);
          } else {
            // Fallback to CNN-BiLSTM only if Gemini fails
            console.warn("Gemini failed, using CNN-BiLSTM results only");
            analysis = cnnAnalysis;
          }
        } else {
          // For other model types (ml, ensemble, auto), use standard approach
          // Use translated transcript for ML model (trained on English)
          const analysisPromise = voicePhishingMLService.analyzeConversation(
            translatedTranscript,
            conversation.scenarioType,
            MODEL_TYPE
          );
          
          // Set a timeout of 60 seconds for ML analysis
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('ML analysis timed out after 60 seconds')), 60000);
          });
          
          analysis = await Promise.race([analysisPromise, timeoutPromise]);
          console.log("ML analysis completed successfully");
        }
      } else {
        console.log("Using Gemini AI for analysis...");
        // Use translated transcript for Gemini to ensure consistent analysis
        analysis = await geminiService.analyzeConversation(
          translatedTranscript,
          conversation.scenarioType
        );
      }
    } catch (error) {
      console.error("Analysis error:", error);
      console.error("Error stack:", error.stack);
      analysis = {
        success: false,
        error: error.message || "Analysis failed",
      };
    }

    if (!analysis || !analysis.success) {
      console.error("Analysis failed:", analysis?.error || "Unknown error");
      console.error("Full analysis object:", JSON.stringify(analysis, null, 2));
      
      // Fallback to Gemini if ML model fails
      if (ANALYSIS_METHOD === 'ml') {
        console.log("ML model failed, falling back to Gemini...");
        try {
          // Use translated transcript for Gemini fallback too
          analysis = await geminiService.analyzeConversation(
            translatedTranscript,
            conversation.scenarioType
          );
          console.log("Gemini fallback successful");
        } catch (geminiError) {
          console.error("Gemini fallback also failed:", geminiError);
        }
      }
      
      // If still no analysis, mark as completed without score
      if (!analysis || !analysis.success) {
        conversation.status = "completed";
        conversation.endedAt = new Date();
        const duration = Math.floor((conversation.endedAt - conversation.startedAt) / 1000);
        conversation.duration = duration;
        await conversation.save();

        return res.status(500).json({
          success: false,
          message: "Failed to analyze conversation",
          error: analysis?.error || "Analysis service unavailable",
          data: conversation,
        });
      }
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
    
    // Store translation metadata if transcript was translated
    if (translationInfo.wasTranslated) {
      if (!conversation.metadata) {
        conversation.metadata = {};
      }
      conversation.metadata.translation = {
        wasTranslated: true,
        originalLanguage: translationInfo.originalLanguage,
        translatedAt: new Date(),
      };
    }

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

    console.log("Conversation analysis complete, sending response");
    res.json({
      success: true,
      data: conversation,
      message: "Conversation completed and analyzed",
    });
  } catch (error) {
    console.error("End Conversation Error:", error);
    console.error("Error stack:", error.stack);
    
    // Make sure we send a response even if there's an error
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to end conversation",
        error: error.message || "Unknown error occurred",
      });
    }
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

