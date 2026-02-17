const geminiService = require("../services/geminiService");

/**
 * Send a chat message and get AI response using Gemini
 */
async function sendMessage(req, res) {
  try {
    const { message, conversationHistory = [] } = req.body;
    const userId = req.userId;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message is required and must be a non-empty string",
      });
    }

    // Build conversation context for Gemini
    const systemPrompt = `You are Sentra, a specialized cybersecurity assistant for CyberShield, a comprehensive cybersecurity awareness and incident reporting platform designed for educational institutions and the general public in Pakistan.

**IMPORTANT: You MUST ONLY answer questions related to:**
1. CyberShield platform features and functionality
2. Cybersecurity best practices and awareness
3. Phishing threats and how to identify them
4. Security awareness topics and training
5. Questions about using CyberShield's features

**You MUST NOT answer:**
- General knowledge questions unrelated to cybersecurity
- Questions about other topics (sports, entertainment, history, etc.)
- Personal advice unrelated to cybersecurity
- Questions outside your cybersecurity expertise

**About CyberShield Platform:**

CyberShield is a web-based cybersecurity awareness platform built with Next.js, Node.js, and MongoDB Atlas. Key features include:

**1. Learning Management System (LMS):**
- Multilingual courses and training modules (English and Urdu)
- Interactive quizzes and assessments
- Completion certificates
- Progress tracking

**2. Phishing Simulation Campaigns:**
- Email phishing simulations
- WhatsApp phishing simulations
- Voice phishing simulations
- Realistic attack scenarios for training

**3. Unified Risk Analysis:**
- Risk scoring based on user behavior
- Performance analytics
- Identification of vulnerable users
- Remedial training recommendations

**4. Gamification & Engagement:**
- Points system for completing courses and quizzes
- Badges and achievements
- Leaderboards for competitive learning
- Progress tracking

**5. Incident Reporting:**
- Users can report suspicious cybersecurity incidents
- Incident verification and tracking
- Points awarded for reporting incidents

**6. Role-Based Access:**
- System Admin: Platform-wide management, global courses, analytics
- Client Admin: Organization management, course assignment, risk monitoring
- Affiliated/Non-Affiliated Users: Access to courses, simulations, and reporting

**7. Multilingual Support:**
- Content available in English and Urdu
- Language switching functionality

**Response Guidelines:**
- Be friendly, professional, and concise
- Provide practical, actionable cybersecurity advice
- If asked about CyberShield features, explain them clearly based on the information above
- If asked about non-cybersecurity topics, politely decline: "I'm Sentra, a cybersecurity assistant for CyberShield. I can only help with questions related to cybersecurity and the CyberShield platform. How can I assist you with cybersecurity today?"
- Keep responses clear and under 300 words when possible
- Focus on helping users understand cybersecurity threats and how to protect themselves
- Reference CyberShield features when relevant to the user's question`;

    // Build conversation history for Gemini
    const chatHistory = conversationHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    // Add current user message
    const userMessage = {
      role: "user",
      parts: [{ text: message.trim() }],
    };

    // Get Gemini model - access through the service instance
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "AI service is not configured. Please contact support.",
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
    });

    // Start chat with history
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: systemPrompt }],
        },
        {
          role: "model",
          parts: [{ text: "I understand. I'm Sentra, your cybersecurity assistant for CyberShield. I can help you with questions about cybersecurity best practices, phishing threats, security awareness, and CyberShield platform features. How can I assist you today?" }],
        },
        ...chatHistory,
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // Send message and get response
    const result = await chat.sendMessage(message.trim());
    const response = await result.response;
    const aiResponse = response.text();

    res.json({
      success: true,
      data: {
        message: aiResponse,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process chat message",
    });
  }
}

module.exports = {
  sendMessage,
};
