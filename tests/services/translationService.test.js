const mockTranslate = jest.fn();
const mockDetect = jest.fn();

jest.mock("@google-cloud/translate", () => ({
  v2: {
    Translate: jest.fn().mockImplementation(() => ({
      translate: mockTranslate,
      detect: mockDetect,
    })),
  },
}));

let translationService;

beforeEach(() => {
  jest.clearAllMocks();
  mockTranslate.mockReset();
  mockDetect.mockReset();

  jest.resetModules();
  process.env.GOOGLE_TRANSLATE_API_KEY = "test-key";

  translationService = require("../../src/services/translationService");
});

describe("TranslationService", () => {
  // -----------------------------------------------------------------------
  // detectLanguage
  // -----------------------------------------------------------------------

  describe("detectLanguage", () => {
    it("returns 'en' for empty text", async () => {
      const result = await translationService.detectLanguage("");
      expect(result).toBe("en");
    });

    it("returns 'en' for null text", async () => {
      const result = await translationService.detectLanguage(null);
      expect(result).toBe("en");
    });

    it("returns 'en' for whitespace-only text", async () => {
      const result = await translationService.detectLanguage("   ");
      expect(result).toBe("en");
    });

    it("returns detected language for valid text", async () => {
      mockDetect.mockResolvedValue([{ language: "hi" }]);

      const result = await translationService.detectLanguage("नमस्ते दुनिया");
      expect(result).toBe("hi");
      expect(mockDetect).toHaveBeenCalledWith("नमस्ते दुनिया");
    });

    it("returns 'en' when detection fails", async () => {
      mockDetect.mockRejectedValue(new Error("API error"));

      const result = await translationService.detectLanguage("some text");
      expect(result).toBe("en");
    });

    it("returns 'en' when detection result has no language", async () => {
      mockDetect.mockResolvedValue([{}]);

      const result = await translationService.detectLanguage("some text");
      expect(result).toBe("en");
    });
  });

  // -----------------------------------------------------------------------
  // translateToEnglish
  // -----------------------------------------------------------------------

  describe("translateToEnglish", () => {
    it("returns original text for empty input", async () => {
      const result = await translationService.translateToEnglish("");
      expect(result).toBe("");
    });

    it("returns original text for null input", async () => {
      const result = await translationService.translateToEnglish(null);
      expect(result).toBe(null);
    });

    it("returns original text for whitespace-only input", async () => {
      const result = await translationService.translateToEnglish("   ");
      expect(result).toBe("   ");
    });

    it("returns original if already English (auto-detect)", async () => {
      mockDetect.mockResolvedValue([{ language: "en" }]);

      const result = await translationService.translateToEnglish("Hello World");
      expect(result).toBe("Hello World");
      expect(mockTranslate).not.toHaveBeenCalled();
    });

    it("returns original if sourceLanguage is en", async () => {
      const result = await translationService.translateToEnglish("Hello", "en");
      expect(result).toBe("Hello");
      expect(mockTranslate).not.toHaveBeenCalled();
    });

    it("returns original if sourceLanguage is en-US", async () => {
      const result = await translationService.translateToEnglish("Hello", "en-US");
      expect(result).toBe("Hello");
    });

    it("returns original if sourceLanguage is en-GB", async () => {
      const result = await translationService.translateToEnglish("Hello", "en-GB");
      expect(result).toBe("Hello");
    });

    it("translates non-English text to English", async () => {
      mockDetect.mockResolvedValue([{ language: "ur" }]);
      mockTranslate.mockResolvedValue(["Hello World"]);

      const result = await translationService.translateToEnglish("ہیلو دنیا");
      expect(result).toBe("Hello World");
      expect(mockTranslate).toHaveBeenCalledWith("ہیلو دنیا", {
        from: "ur",
        to: "en",
      });
    });

    it("translates with provided source language", async () => {
      mockTranslate.mockResolvedValue(["Hello World"]);

      const result = await translationService.translateToEnglish("Hola Mundo", "es");
      expect(result).toBe("Hello World");
      expect(mockTranslate).toHaveBeenCalledWith("Hola Mundo", {
        from: "es",
        to: "en",
      });
    });

    it("returns original text on translation error", async () => {
      mockDetect.mockResolvedValue([{ language: "hi" }]);
      mockTranslate.mockRejectedValue(new Error("API error"));

      const result = await translationService.translateToEnglish("नमस्ते");
      expect(result).toBe("नमस्ते");
    });
  });

  // -----------------------------------------------------------------------
  // isNonEnglish
  // -----------------------------------------------------------------------

  describe("isNonEnglish", () => {
    it("returns false for empty text", async () => {
      const result = await translationService.isNonEnglish("");
      expect(result).toBe(false);
    });

    it("returns false for null text", async () => {
      const result = await translationService.isNonEnglish(null);
      expect(result).toBe(false);
    });

    it("returns false for English text", async () => {
      mockDetect.mockResolvedValue([{ language: "en" }]);

      const result = await translationService.isNonEnglish("Hello");
      expect(result).toBe(false);
    });

    it("returns true for non-English text", async () => {
      mockDetect.mockResolvedValue([{ language: "ur" }]);

      const result = await translationService.isNonEnglish("ہیلو");
      expect(result).toBe(true);
    });

    it("returns false for en-US variant", async () => {
      mockDetect.mockResolvedValue([{ language: "en-US" }]);

      const result = await translationService.isNonEnglish("Hello");
      expect(result).toBe(false);
    });

    it("returns false for en-GB variant", async () => {
      mockDetect.mockResolvedValue([{ language: "en-GB" }]);

      const result = await translationService.isNonEnglish("Hello");
      expect(result).toBe(false);
    });

    it("returns false on detection error", async () => {
      mockDetect.mockRejectedValue(new Error("API down"));

      const result = await translationService.isNonEnglish("text");
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // translateForMLAnalysis
  // -----------------------------------------------------------------------

  describe("translateForMLAnalysis", () => {
    it("returns original for empty transcript", async () => {
      const result = await translationService.translateForMLAnalysis("");
      expect(result).toEqual({
        translated: "",
        originalLanguage: "en",
        wasTranslated: false,
      });
    });

    it("returns original for null transcript", async () => {
      const result = await translationService.translateForMLAnalysis(null);
      expect(result).toEqual({
        translated: null,
        originalLanguage: "en",
        wasTranslated: false,
      });
    });

    it("returns original for whitespace-only transcript", async () => {
      const result = await translationService.translateForMLAnalysis("   ");
      expect(result).toEqual({
        translated: "   ",
        originalLanguage: "en",
        wasTranslated: false,
      });
    });

    it("returns original for English transcript", async () => {
      mockDetect.mockResolvedValue([{ language: "en" }]);

      const result = await translationService.translateForMLAnalysis(
        "This is an English transcript"
      );

      expect(result).toEqual({
        translated: "This is an English transcript",
        originalLanguage: "en",
        wasTranslated: false,
      });
    });

    it("translates non-English transcript for ML analysis", async () => {
      mockDetect.mockResolvedValue([{ language: "ur" }]);
      mockTranslate.mockResolvedValue(["Hello World"]);

      const result = await translationService.translateForMLAnalysis("ہیلو دنیا");

      expect(result).toEqual({
        translated: "Hello World",
        originalLanguage: "ur",
        wasTranslated: true,
      });
    });

    it("returns original on translation error but preserves detected language", async () => {
      mockDetect.mockResolvedValue([{ language: "hi" }]);
      mockTranslate.mockRejectedValue(new Error("API error"));

      const result = await translationService.translateForMLAnalysis("नमस्ते");

      expect(result.translated).toBe("नमस्ते");
      expect(result.originalLanguage).toBe("hi");
    });

    it("handles en-US as English", async () => {
      mockDetect.mockResolvedValue([{ language: "en-US" }]);

      const result = await translationService.translateForMLAnalysis("Hello");

      expect(result.wasTranslated).toBe(false);
      expect(result.originalLanguage).toBe("en");
    });

    it("handles en-GB as English", async () => {
      mockDetect.mockResolvedValue([{ language: "en-GB" }]);

      const result = await translationService.translateForMLAnalysis("Hello");

      expect(result.wasTranslated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Service initialization
  // -----------------------------------------------------------------------

  describe("initialization", () => {
    it("initializes with API key from environment", () => {
      expect(translationService.initialized).toBe(true);
    });

    it("initializes without API key using default credentials", () => {
      jest.resetModules();
      delete process.env.GOOGLE_TRANSLATE_API_KEY;

      const svc = require("../../src/services/translationService");
      expect(svc.initialized).toBe(true);
    });
  });
});
