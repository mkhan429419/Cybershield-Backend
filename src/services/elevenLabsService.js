const axios = require("axios");

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseURL = "https://api.elevenlabs.io/v1";
    
    if (!this.apiKey) {
      console.warn("ELEVENLABS_API_KEY not set in environment variables");
    }
  }

  /**
   * Get a signed URL for WebSocket connection
   */
  async getSignedUrl(agentId, userId = null) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: "ElevenLabs API key is not configured",
        };
      }

      const url = `${this.baseURL}/convai/conversation/get-signed-url`;
      const params = new URLSearchParams({ agent_id: agentId });
      
      if (userId) {
        params.append("user_id", userId);
      }

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      return {
        success: true,
        signedUrl: response.data.signed_url,
      };
    } catch (error) {
      console.error("Error getting signed URL:", error.message);
      
      let errorMessage = error.message;
      if (error.response?.data) {
        if (error.response.data.detail?.message) {
          errorMessage = error.response.data.detail.message;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      }
      
      return {
        success: false,
        error: errorMessage || `Request failed with status code ${error.response?.status || 'unknown'}`,
      };
    }
  }

  /**
   * Get a conversation token for WebRTC connection
   * @param {string} agentId - The agent ID
   * @param {string} userId - Optional user ID
   * @param {object} variables - Optional variables to pass to the agent (e.g., {scenario_type: "phishing"})
   */
  async getConversationToken(agentId, userId = null, variables = null) {
    try {
      // Check if API key is set
      if (!this.apiKey) {
        return {
          success: false,
          error: "ElevenLabs API key is not configured",
        };
      }

      // The baseURL already includes /v1, so we just need /convai
      const url = `${this.baseURL}/convai/conversation/get-conversation-token`;
      
      const payload = {
        agent_id: agentId,
      };
      
      if (userId) {
        payload.user_id = userId;
      }

      // Add variables if provided (for use in prompt templates)
      if (variables) {
        payload.variables = variables;
      }

      const response = await axios.post(url, payload, {
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        conversationToken: response.data.conversation_token,
      };
    } catch (error) {
      console.error("Error getting conversation token:", error.message);
      
      // Provide more detailed error message
      let errorMessage = error.message;
      if (error.response?.data) {
        if (error.response.data.detail?.message) {
          errorMessage = error.response.data.detail.message;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        }
      }
      
      return {
        success: false,
        error: errorMessage || `Request failed with status code ${error.response?.status || 'unknown'}`,
      };
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId) {
    try {
      const url = `${this.baseURL}/convai/conversation/history/${conversationId}`;

      const response = await axios.get(url, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error getting conversation history:", error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail?.message || error.message,
      };
    }
  }

  /**
   * Analyze conversation transcript and calculate phishing score
   * Uses ElevenLabs evaluation criteria to determine if user fell for phishing
   */
  async analyzeConversation(transcript, scenarioType) {
    try {
      // Use ElevenLabs API to analyze the conversation
      // For now, we'll use a simple analysis, but this can be enhanced with ElevenLabs evaluation criteria
      
      const analysisPrompt = `Analyze the following conversation transcript and determine if the user fell for a phishing attempt. 
      
Scenario Type: ${scenarioType === "phishing" ? "This is a PHISHING scenario" : "This is a NORMAL scenario"}

Transcript:
${transcript}

Please analyze:
1. Did the user provide any sensitive information? (passwords, credit cards, SSN, personal details, etc.)
2. What was the user's resistance level? (high, medium, low)
3. Did the user fall for the phishing attempt? (only relevant if scenarioType is "phishing")
4. What types of sensitive information were provided (if any)?
5. Provide a score from 0-100 where:
   - 100 = Perfect (no sensitive info shared, high resistance)
   - 75-99 = Good (minimal info shared, medium-high resistance)
   - 50-74 = Fair (some info shared, medium resistance)
   - 25-49 = Poor (significant info shared, low resistance)
   - 0-24 = Very Poor (critical info shared, very low resistance)

Return your analysis in JSON format with the following structure:
{
  "fellForPhishing": boolean,
  "providedSensitiveInfo": boolean,
  "sensitiveInfoTypes": ["type1", "type2"],
  "resistanceLevel": "high" | "medium" | "low",
  "score": number (0-100),
  "analysisRationale": "detailed explanation"
}`;

      // For now, we'll use a simple keyword-based analysis
      // In production, you would use ElevenLabs evaluation criteria or an LLM API
      const sensitiveKeywords = [
        "password", "passcode", "pin", "ssn", "social security",
        "credit card", "card number", "cvv", "expiry",
        "bank account", "routing number", "account number",
        "date of birth", "dob", "mother's maiden name",
        "security question", "otp", "verification code"
      ];

      const transcriptLower = transcript.toLowerCase();
      const providedSensitiveInfo = sensitiveKeywords.some(keyword => 
        transcriptLower.includes(keyword)
      );

      // Simple scoring logic (can be enhanced with ElevenLabs evaluation)
      let score = 100;
      let resistanceLevel = "high";
      const sensitiveInfoTypes = [];

      if (providedSensitiveInfo) {
        score -= 50;
        resistanceLevel = "low";
        
        if (transcriptLower.includes("password") || transcriptLower.includes("passcode")) {
          sensitiveInfoTypes.push("password");
          score -= 20;
        }
        if (transcriptLower.includes("credit card") || transcriptLower.includes("card number")) {
          sensitiveInfoTypes.push("credit_card");
          score -= 20;
        }
        if (transcriptLower.includes("ssn") || transcriptLower.includes("social security")) {
          sensitiveInfoTypes.push("ssn");
          score -= 20;
        }
        if (transcriptLower.includes("bank account")) {
          sensitiveInfoTypes.push("bank_account");
          score -= 15;
        }
      }

      // Check for signs of resistance
      const resistanceKeywords = [
        "i don't think", "i'm not sure", "let me verify", "this seems suspicious",
        "i need to check", "i'll call back", "this doesn't sound right"
      ];
      
      const showedResistance = resistanceKeywords.some(keyword => 
        transcriptLower.includes(keyword)
      );

      if (showedResistance && !providedSensitiveInfo) {
        resistanceLevel = "high";
        score = Math.max(score, 90);
      } else if (showedResistance && providedSensitiveInfo) {
        resistanceLevel = "medium";
        score = Math.max(score, 60);
      }

      // Ensure score is between 0 and 100
      score = Math.max(0, Math.min(100, score));

      const fellForPhishing = scenarioType === "phishing" && providedSensitiveInfo;

      return {
        success: true,
        analysis: {
          fellForPhishing,
          providedSensitiveInfo,
          sensitiveInfoTypes,
          resistanceLevel,
          score,
          analysisRationale: `User ${providedSensitiveInfo ? "provided" : "did not provide"} sensitive information. Resistance level: ${resistanceLevel}. ${fellForPhishing ? "User fell for the phishing attempt." : "User resisted the phishing attempt."}`,
        },
      };
    } catch (error) {
      console.error("Error analyzing conversation:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get agent details
   */
  async getAgent(agentId) {
    try {
      const url = `${this.baseURL}/convai/agents/${agentId}`;

      const response = await axios.get(url, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      return {
        success: true,
        agent: response.data,
      };
    } catch (error) {
      console.error("Error getting agent:", error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail?.message || error.message,
      };
    }
  }
}

module.exports = new ElevenLabsService();

