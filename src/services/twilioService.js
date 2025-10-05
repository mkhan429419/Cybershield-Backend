const twilio = require("twilio");

class TwilioService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.whatsAppNumber =
      process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";
  }
  async sendWhatsAppMessage(to, message, mediaUrl = null) {
    try {
      const formattedTo = this.formatPhoneNumber(to);
      const messageOptions = {
        from: this.whatsAppNumber,
        to: formattedTo,
        body: message,
      };
      if (mediaUrl) {
        messageOptions.mediaUrl = [mediaUrl];
      }
      const messageResponse = await this.client.messages.create(messageOptions);
      return {
        success: true,
        messageId: messageResponse.sid,
        status: messageResponse.status,
        data: messageResponse,
      };
    } catch (error) {
      console.error("Twilio WhatsApp Error:", error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }
  async sendPhishingSimulation(to, templateType, variables = {}) {
    const phishingMessages = {
      banking: `Your UBL account will be blocked within 24 hours due to incomplete verification.
Click the link below to verify now:
🔗 ubl-verification-pk.com/login

Helpline: +92-301-1234567

⚠️ This is a phishing simulation for security awareness training.`,

      lottery: `You have won Rs. 50,000 through the Jazz Daily Lucky Draw.
Please send your CNIC number and JazzCash number to claim your prize!
📞 Contact: 0345-9876543

⚠️ This is a phishing simulation for security awareness training.`,

      job: `You have been shortlisted for a job interview.
Please pay Rs. 2000 for form verification to confirm your slot.
Send via Easypaisa: 0333-7654321
Form link: nestle-careerpk.com

⚠️ This is a phishing simulation for security awareness training.`,

      delivery: `Your parcel is held due to incorrect address.
Please click below to update details and pay Rs. 150 handling charges.
🔗 tcs-tracking-pk.net

⚠️ This is a phishing simulation for security awareness training.`,
    };

    const message = phishingMessages[templateType] || phishingMessages.banking;

    return await this.sendWhatsAppMessage(to, message);
  }
  async sendWhatsAppTemplateMessage(to, contentSid, contentVariables = {}) {
    try {
      const formattedTo = this.formatPhoneNumber(to);

      const messageOptions = {
        from: this.whatsAppNumber,
        to: formattedTo,
        contentSid: contentSid,
        contentVariables: JSON.stringify(contentVariables),
      };

      const messageResponse = await this.client.messages.create(messageOptions);

      return {
        success: true,
        messageId: messageResponse.sid,
        status: messageResponse.status,
        data: messageResponse,
      };
    } catch (error) {
      console.error("Twilio Template Error:", error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }
  async sendWhatsAppTemplate(to, templateName, parameters = []) {
    try {
      const formattedTo = this.formatPhoneNumber(to);
      const messageBody = this.buildTemplateMessage(templateName, parameters);

      const messageResponse = await this.client.messages.create({
        from: this.whatsAppNumber,
        to: formattedTo,
        body: messageBody,
      });

      return {
        success: true,
        messageId: messageResponse.sid,
        status: messageResponse.status,
        data: messageResponse,
      };
    } catch (error) {
      console.error("Twilio Template Error:", error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }
  async getMessageStatus(messageSid) {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        success: true,
        status: message.status,
        data: message,
      };
    } catch (error) {
      console.error("Twilio Status Error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  async createMessageTemplate(name, category, language, components) {
    try {
      console.log(
        "Template creation should be done through WhatsApp Business Manager"
      );
      return {
        success: true,
        message: "Template creation initiated",
      };
    } catch (error) {
      console.error("Template Creation Error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, "");

    // Handle Pakistan numbers
    if (cleaned.startsWith("92")) {
      // Already has country code
      return `whatsapp:+${cleaned}`;
    } else if (cleaned.startsWith("0")) {
      // Remove leading 0 and add Pakistan country code
      return `whatsapp:+92${cleaned.substring(1)}`;
    } else if (cleaned.length === 10) {
      // Assume it's a Pakistan number without country code
      return `whatsapp:+92${cleaned}`;
    } else {
      // Assume it has country code but missing +
      return `whatsapp:+${cleaned}`;
    }
  }
  buildTemplateMessage(templateName, parameters) {
    // Common phishing simulation templates for Twilio sandbox
    const templates = {
      security_verification: `🔐 Security Verification Required

Dear {{1}},

We detected unusual activity on your account. Please verify your identity immediately.

Verification link: {{2}}

This is a phishing simulation for security awareness training.

- CyberShield Security Team`,

      urgent_update: `⚠️ Urgent: Account Verification Required

Hello {{1}},

Your account requires immediate security verification. Please verify your identity.

Verify now: {{2}}

Note: This is a security awareness test.

- CyberShield Platform`,

      suspicious_login: `🚨 Suspicious Login Detected

Hi {{1}},

We detected a login attempt from an unknown device. Please verify your account.

Secure Account: {{2}}

This is a phishing simulation for security awareness.

Best regards,
CyberShield Security`,
    };

    let message =
      templates[templateName] || "Security awareness message from CyberShield";

    // Replace parameters
    parameters.forEach((param, index) => {
      message = message.replace(`{{param${index + 1}}}`, param);
    });

    return message;
  }
  isValidPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, "");
    // Pakistan mobile numbers are typically 11-13 digits
    return cleaned.length >= 11 && cleaned.length <= 13;
  }
}

module.exports = new TwilioService();
