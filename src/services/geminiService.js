const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      console.warn("GEMINI_API_KEY not set in environment variables");
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    }
  }

  /**
   * Analyze conversation transcript and calculate phishing score using Gemini AI
   * @param {string} transcript - Full conversation transcript
   * @param {string} scenarioType - "phishing" or "normal"
   * @returns {Promise<Object>} Analysis results with score and details
   */
  async analyzeConversation(transcript, scenarioType) {
    try {
      if (!this.apiKey || !this.genAI) {
        return {
          success: false,
          error: "Gemini API key is not configured",
        };
      }

      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const analysisPrompt = `You are a cybersecurity expert analyzing a phone conversation transcript from a security awareness training exercise in Pakistan. Your task is to evaluate how well the user resisted a potential phishing attempt.

**Context:**
- Scenario Type: ${scenarioType === "phishing" ? "PHISHING ATTEMPT" : "NORMAL customer service call"}
- Location: Pakistan
- This is a training exercise to test the user's security awareness

**Conversation Transcript:**
${transcript}

**CRITICAL: Read the transcript carefully and distinguish between:**
- What the AGENT asked for (requests, questions, demands)
- What the USER actually provided (explicitly stated information, numbers, details they shared)
- What the USER refused or declined to provide
- What the USER questioned or expressed discomfort about

**IMPORTANT: Only count information that the USER explicitly provided. Do NOT count:**
- Information that was only requested by the agent
- Information the user questioned or refused to provide
- Information the user expressed discomfort about sharing
- If the user said "I don't feel comfortable sharing it" or similar, they did NOT provide that information

**Your Analysis Task:**

Analyze this conversation and determine:

1. **Did the user provide sensitive information?** 
   Look ONLY at what the USER explicitly stated/shared, NOT what was requested:
   - Passwords, passcodes, PINs
   - CNIC numbers (look for phrases like "my CNIC is", "my number is" when referring to CNIC)
   - Credit/debit card details (card number, CVV, expiry date)
   - Bank account numbers (look for phrases like "my account number is", "my bank account is")
   - OTP codes
   - Mobile wallet PINs (Easypaisa, JazzCash)
   - Personal identification details
   - Any other sensitive verification information
   
   **Be precise**: If the agent asked for bank account number but the user only provided CNIC, count ONLY CNIC. If the user refused to provide something, they did NOT provide it.

2. **What was the user's resistance level?**
   - **High**: User questioned the request, showed skepticism, refused to provide information, asked to verify, or expressed suspicion
   - **Medium**: User showed some hesitation or asked clarifying questions but may have provided some non-critical information
   - **Low**: User readily provided sensitive information without much resistance

3. **Did the user fall for the phishing attempt?** (Only relevant if scenarioType is "phishing")
   - True if: User provided sensitive information that could be used maliciously
   - False if: User resisted and did not provide sensitive information

4. **What types of sensitive information were provided?** (if any)
   Categories: password, cnic, credit_card, bank_account, atm_pin, otp, mobile_wallet_pin, personal_info, address, other
   
   **IMPORTANT**: Only list information types that the USER actually provided. Be careful to distinguish:
   - CNIC number vs bank account number (they are different - CNIC is a 13-digit identity card number, bank account is a different number)
   - If user said "my number is 123456789" in response to CNIC request, that's CNIC, NOT bank account
   - If user refused to provide something, do NOT include it in this list

5. **Calculate a score from 0-100:**
   - **100**: Perfect - No sensitive info shared, high resistance, recognized the threat
   - **90-99**: Excellent - No sensitive info shared, showed good awareness
   - **75-89**: Good - Minimal or non-critical info shared, medium-high resistance
   - **50-74**: Fair - Some sensitive info shared, medium resistance, showed some awareness
   - **25-49**: Poor - Significant sensitive info shared, low resistance
   - **0-24**: Very Poor - Critical sensitive info shared (passwords, PINs, CNIC), very low resistance

6. **Provide a detailed rationale** explaining your analysis, what the user did well or poorly, and specific examples from the conversation.
   
   **In your rationale, clearly state:**
   - What sensitive information the user ACTUALLY provided (with exact quotes from the transcript)
   - What information the user REFUSED to provide (if any)
   - What information was only REQUESTED but not provided
   - Be precise and accurate - do not confuse what was asked for with what was actually given

**Important Notes:**
- Consider the Pakistani context (CNIC instead of SSN, local banks like HBL, UBL, Meezan, services like Easypaisa, JazzCash)
- Be strict about what constitutes sensitive information
- Consider the user's tone, hesitation, and questioning as signs of awareness
- If scenarioType is "normal", the user should NOT be penalized for normal interactions

**Return your analysis in valid JSON format ONLY (no markdown, no code blocks, just the JSON object):**
{
  "fellForPhishing": boolean,
  "providedSensitiveInfo": boolean,
  "sensitiveInfoTypes": ["type1", "type2"],
  "resistanceLevel": "high" | "medium" | "low",
  "score": number (0-100),
  "analysisRationale": "detailed explanation with specific examples from the conversation"
}`;

      const result = await model.generateContent(analysisPrompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON from response (remove markdown code blocks if present)
      let jsonText = text.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/```\n?/g, "").trim();
      }

      const analysis = JSON.parse(jsonText);

      // Validate the response structure
      if (
        typeof analysis.fellForPhishing !== "boolean" ||
        typeof analysis.providedSensitiveInfo !== "boolean" ||
        !Array.isArray(analysis.sensitiveInfoTypes) ||
        !["high", "medium", "low"].includes(analysis.resistanceLevel) ||
        typeof analysis.score !== "number" ||
        typeof analysis.analysisRationale !== "string"
      ) {
        throw new Error("Invalid analysis response structure from Gemini");
      }

      // Ensure score is within valid range
      analysis.score = Math.max(0, Math.min(100, Math.round(analysis.score)));

      return {
        success: true,
        analysis: {
          fellForPhishing: analysis.fellForPhishing,
          providedSensitiveInfo: analysis.providedSensitiveInfo,
          sensitiveInfoTypes: analysis.sensitiveInfoTypes,
          resistanceLevel: analysis.resistanceLevel,
          score: analysis.score,
          analysisRationale: analysis.analysisRationale,
        },
      };
    } catch (error) {
      console.error("Error analyzing conversation with Gemini:", error);
      
      // If JSON parsing fails, try to extract JSON from the response
      if (error.message.includes("JSON") || error instanceof SyntaxError) {
        console.error("Failed to parse Gemini response as JSON. Raw response:", error.message);
      }

      return {
        success: false,
        error: error.message || "Failed to analyze conversation",
      };
    }
  }
}

module.exports = new GeminiService();

