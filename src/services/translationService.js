/**
 * Translation Service
 * Handles translation of transcripts from Hindi to English for ML model analysis
 */
const { Translate } = require('@google-cloud/translate').v2;

class TranslationService {
  constructor() {
    // Initialize Google Cloud Translate client
    // Supports multiple authentication methods:
    // 1. API Key via GOOGLE_TRANSLATE_API_KEY env var (easiest)
    // 2. Service account via GOOGLE_APPLICATION_CREDENTIALS env var
    // 3. Default credentials (if running on GCP)
    try {
      const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
      
      if (apiKey) {
        // Use API key authentication (simplest method)
        this.translate = new Translate({
          key: apiKey
        });
        this.initialized = true;
        console.log('✅ Google Cloud Translate initialized with API key');
      } else {
        // Try service account credentials or default credentials
        this.translate = new Translate();
        this.initialized = true;
        console.log('✅ Google Cloud Translate initialized with service account/default credentials');
      }
    } catch (error) {
      console.warn('⚠️  Google Cloud Translate initialization error (non-fatal):', error.message);
      console.warn('Translation will be skipped if credentials are not configured');
      console.warn('To enable translation, set GOOGLE_TRANSLATE_API_KEY or GOOGLE_APPLICATION_CREDENTIALS');
      this.initialized = false;
    }
  }

  /**
   * Detect the language of the text
   * @param {string} text - Text to detect language for
   * @returns {Promise<string>} Language code (e.g., 'en', 'hi')
   */
  async detectLanguage(text) {
    if (!this.initialized || !text || text.trim().length === 0) {
      return 'en'; // Default to English if service not available or empty text
    }

    try {
      const [detection] = await this.translate.detect(text);
      return detection.language || 'en';
    } catch (error) {
      console.error('Error detecting language:', error.message);
      // Default to English on error
      return 'en';
    }
  }

  /**
   * Translate text from Hindi (or any language) to English
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code (optional, will auto-detect if not provided)
   * @returns {Promise<string>} Translated text in English
   */
  async translateToEnglish(text, sourceLanguage = null) {
    if (!text || text.trim().length === 0) {
      return text;
    }

    if (!this.initialized) {
      console.warn('Translation service not initialized, returning original text');
      return text;
    }

    try {
      // If source language not provided, detect it first
      let detectedLanguage = sourceLanguage;
      if (!detectedLanguage) {
        detectedLanguage = await this.detectLanguage(text);
      }

      // If already English, return as-is
      if (detectedLanguage === 'en' || detectedLanguage === 'en-US' || detectedLanguage === 'en-GB') {
        return text;
      }

      // Translate to English
      const [translation] = await this.translate.translate(text, {
        from: detectedLanguage,
        to: 'en'
      });

      return translation;
    } catch (error) {
      console.error('Error translating text:', error.message);
      // Return original text on error to avoid breaking the flow
      return text;
    }
  }

  /**
   * Check if text contains Hindi (or other non-English content)
   * @param {string} text - Text to check
   * @returns {Promise<boolean>} True if text is not English
   */
  async isNonEnglish(text) {
    if (!text || text.trim().length === 0) {
      return false;
    }

    if (!this.initialized) {
      return false; // Assume English if service not available
    }

    try {
      const language = await this.detectLanguage(text);
      return language !== 'en' && language !== 'en-US' && language !== 'en-GB';
    } catch (error) {
      console.error('Error checking language:', error.message);
      return false; // Default to English
    }
  }

  /**
   * Translate transcript for ML model analysis
   * Only translates if the text is not in English
   * @param {string} transcript - Full conversation transcript
   * @returns {Promise<{translated: string, originalLanguage: string, wasTranslated: boolean}>}
   */
  async translateForMLAnalysis(transcript) {
    if (!transcript || transcript.trim().length === 0) {
      return {
        translated: transcript,
        originalLanguage: 'en',
        wasTranslated: false
      };
    }

    if (!this.initialized) {
      console.warn('Translation service not initialized, using original transcript');
      return {
        translated: transcript,
        originalLanguage: 'en',
        wasTranslated: false
      };
    }

    try {
      // Detect language
      const detectedLanguage = await this.detectLanguage(transcript);

      // If already English, return as-is
      if (detectedLanguage === 'en' || detectedLanguage === 'en-US' || detectedLanguage === 'en-GB') {
        return {
          translated: transcript,
          originalLanguage: 'en',
          wasTranslated: false
        };
      }

      // Translate to English
      const translated = await this.translateToEnglish(transcript, detectedLanguage);

      console.log(`Translated transcript from ${detectedLanguage} to English for ML analysis`);
      console.log(`Original length: ${transcript.length}, Translated length: ${translated.length}`);

      return {
        translated,
        originalLanguage: detectedLanguage,
        wasTranslated: true
      };
    } catch (error) {
      console.error('Error in translateForMLAnalysis:', error.message);
      // Return original transcript on error
      return {
        translated: transcript,
        originalLanguage: 'en',
        wasTranslated: false
      };
    }
  }
}

module.exports = new TranslationService();
