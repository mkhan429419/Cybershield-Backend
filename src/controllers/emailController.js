const nodemailerService = require("../services/nodemailerService");
const Email = require("../models/Email");

const sendEmail = async (req, res) => {
  try {
    const { sentBy, sentTo, subject, bodyContent } = req.body;

    // Validate required fields
    if (!sentBy || !sentTo || !subject || !bodyContent) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: sentBy, sentTo, subject, bodyContent",
      });
    }

    
    const smtpUser = process.env.SMTP_USER; 
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT);
    const smtpSecure = process.env.SMTP_SECURE;

    if (!smtpUser || !smtpPassword) {
      return res.status(500).json({
        success: false,
        message: "SMTP configuration missing. Please set SMTP_USER and SMTP_PASSWORD in .env file or update the hardcoded values in emailController.js",
      });
    }

    // Format email body - convert plain text to HTML
    let emailHtml = bodyContent;
    if (!emailHtml.includes("<")) {
      // Convert line breaks to <br>
      emailHtml = emailHtml.replace(/\n/g, "<br>");
      emailHtml = `<html><body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${emailHtml}</body></html>`;
    }

    // Send email
    const result = await nodemailerService.sendEmail({
      to: sentTo,
      from: sentBy,
      subject: subject,
      html: emailHtml,
    });

    // Save email to database (optional - don't fail if DB save fails)
    try {
      const emailRecord = new Email({
        sentBy,
        sentTo,
        subject,
        bodyContent,
        messageId: result.success ? result.messageId : null,
        status: result.success ? "sent" : "failed",
        error: result.success ? null : result.error,
      });

      await emailRecord.save();
    } catch (dbError) {
      console.error("Failed to save email to database:", dbError);
      // Continue even if database save fails
    }

    if (result.success) {
      res.json({
        success: true,
        message: "Email sent successfully",
        data: {
          messageId: result.messageId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send email",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Send Email Error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.message,
    });
  }
};

module.exports = { sendEmail };

