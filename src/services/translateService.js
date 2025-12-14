const axios = require("axios");

class TranslateService {
  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    this.baseUrl = "https://translation.googleapis.com/language/translate/v2";

    if (!this.apiKey) {
      console.warn(
        "GOOGLE_TRANSLATE_API_KEY not set in environment variables"
      );
    }
  }

  /**
   * Translate text to target language using Google Translate REST API
   * @param {string|string[]} text - Text or array of texts to translate
   * @param {string} targetLanguage - Target language code (e.g., 'ur' for Urdu, 'en' for English)
   * @param {string} sourceLanguage - Source language code (optional, auto-detected if not provided)
   * @returns {Promise<{success: boolean, translatedText?: string|string[], error?: string}>}
   */
  async translate(text, targetLanguage = "ur", sourceLanguage = null) {
    try {
      if (!this.apiKey) {
        throw new Error("Google Translate API key is not configured");
      }

      if (!text || (Array.isArray(text) && text.length === 0)) {
        throw new Error("Text to translate is required");
      }

      // Convert single string to array for API consistency
      const isArray = Array.isArray(text);
      const textArray = isArray ? text : [text];

      // Build request data - Google Translate API v2 accepts POST with data in body
      const requestData = {
        q: textArray,
        target: targetLanguage,
        format: "text",
      };

      // Add source language if provided
      if (sourceLanguage) {
        requestData.source = sourceLanguage;
      }

      // Make API request using POST method with API key as query parameter
      const response = await axios.post(
        this.baseUrl,
        requestData,
        {
          params: {
            key: this.apiKey,
          },
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
        }
      );

      if (
        response.data &&
        response.data.data &&
        response.data.data.translations
      ) {
        const translations = response.data.data.translations;
        const translatedTexts = translations.map((t) => t.translatedText);

        return {
          success: true,
          translatedText: isArray ? translatedTexts : translatedTexts[0],
        };
      } else {
        throw new Error("Invalid response from Google Translate API");
      }
    } catch (error) {
      console.error("Translation Error:", error);
      return {
        success: false,
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "Translation failed",
      };
    }
  }

  /**
   * Translate text to Urdu
   * @param {string|string[]} text - Text or array of texts to translate
   * @returns {Promise<{success: boolean, translatedText?: string|string[], error?: string}>}
   */
  async translateToUrdu(text) {
    return this.translate(text, "ur", "en");
  }

  /**
   * Translate text to English
   * @param {string|string[]} text - Text or array of texts to translate
   * @returns {Promise<{success: boolean, translatedText?: string|string[], error?: string}>}
   */
  async translateToEnglish(text) {
    return this.translate(text, "en", "ur");
  }
}

module.exports = new TranslateService();
