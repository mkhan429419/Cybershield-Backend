const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT);

  // FIX: Only use secure for port 465
  const smtpSecure = smtpPort === 465;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  return transporter;
};


const sendEmail = async (emailData) => {
  try {
    const { to, from, subject, html } = emailData;

    if (!to || !from || !subject || !html) {
      throw new Error("Missing required fields: to, from, subject, html");
    }

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: from,
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
