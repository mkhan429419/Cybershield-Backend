const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const smtpUser = process.env.SMTP_USER;
  // Brevo uses SMTP_KEY; fallback to SMTP_PASSWORD for other providers
  const smtpPass = process.env.SMTP_KEY || process.env.SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT, 10);

  const smtpSecure = smtpPort === 465;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
};


const sendEmail = async (emailData) => {
  try {
    const { to, subject, html } = emailData;

    if (!to || !subject || !html) {
      throw new Error("Missing required fields: to, subject, html");
    }

    // Brevo: SMTP_USER = SMTP login (auth); SMTP_FROM = verified sender (visible "from"). Fallback to SMTP_USER if SMTP_FROM not set.
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!fromAddress) {
      throw new Error("SMTP_USER or SMTP_FROM must be set in .env");
    }

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: fromAddress,
      to: to,
      subject: subject,
      html: html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = { sendEmail };
