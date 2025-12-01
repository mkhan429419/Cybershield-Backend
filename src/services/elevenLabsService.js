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

