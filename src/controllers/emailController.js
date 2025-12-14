const nodemailerService = require("../services/nodemailerService");
const Email = require("../models/Email");

// Helper function to validate email format
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// Helper function to parse comma-separated emails
const parseEmails = (emailString) => {
  if (!emailString) return [];
  return emailString
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);
};

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

    // Validate sender email format
    if (!isValidEmail(sentBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sender email address format",
      });
    }

    // Parse and validate recipient emails
    const recipientEmails = parseEmails(sentTo);
    
    if (recipientEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid recipient email addresses found",
      });
    }

    // Validate all recipient emails before sending
    const invalidEmails = recipientEmails.filter(email => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid email address format: ${invalidEmails.join(', ')}. Please check the email syntax.`,
      });
    }

    const smtpUser = process.env.SMTP_USER; 
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpUser || !smtpPassword) {
      return res.status(500).json({
        success: false,
        message: "SMTP configuration missing. Please set SMTP_USER and SMTP_PASSWORD in .env file",
      });
    }

    // Format email body - convert plain text to HTML
    let emailHtml = bodyContent;
    if (!emailHtml.includes("<")) {
      emailHtml = emailHtml.replace(/\n/g, "<br>");
      emailHtml = `<html><body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${emailHtml}</body></html>`;
    }

    // Send emails to all recipients sequentially
    const results = {
      total: recipientEmails.length,
      successful: 0,
      failed: 0,
      details: [],
    };

    for (let i = 0; i < recipientEmails.length; i++) {
      const recipientEmail = recipientEmails[i];
      
      try {
        // Add delay between emails (500ms) to avoid rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const result = await nodemailerService.sendEmail({
          to: recipientEmail,
          from: sentBy,
          subject: subject,
          html: emailHtml,
        });

        // Save email to database
        try {
          const emailRecord = new Email({
            sentBy,
            sentTo: recipientEmail,
            subject,
            bodyContent,
            messageId: result.success ? result.messageId : null,
            status: result.success ? "sent" : "failed",
            error: result.success ? null : result.error,
          });

          await emailRecord.save();
        } catch (dbError) {
          console.error("Failed to save email to database:", dbError);
        }

        if (result.success) {
          results.successful++;
          results.details.push({
            email: recipientEmail,
            status: "sent",
            messageId: result.messageId,
          });
        } else {
          results.failed++;
          results.details.push({
            email: recipientEmail,
            status: "failed",
            error: result.error,
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          email: recipientEmail,
          status: "failed",
          error: error.message,
        });
      }
    }

    // Return summary
    if (results.successful > 0) {
      res.json({
        success: true,
        message: `Emails sent: ${results.successful} successful, ${results.failed} failed out of ${results.total} total`,
        data: {
          total: results.total,
          successful: results.successful,
          failed: results.failed,
          details: results.details,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: `All emails failed to send (${results.failed} failed)`,
        data: {
          total: results.total,
          successful: results.successful,
          failed: results.failed,
          details: results.details,
        },
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

// Get all emails
const getEmails = async (req, res) => {
  try {
    const { page = 1, limit = 5, sentBy, sentTo } = req.query;
    
    const query = {};
    if (sentBy) {
      query.sentBy = { $regex: sentBy, $options: 'i' };
    }
    if (sentTo) {
      query.sentTo = { $regex: sentTo, $options: 'i' };
    }

    const emails = await Email.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Email.countDocuments(query);

    res.json({
      success: true,
      data: {
        emails,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Get Emails Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch emails",
      error: error.message,
    });
  }
};

module.exports = { sendEmail, getEmails };

