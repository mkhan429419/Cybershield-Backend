const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// Import routes
const adminRoutes = require("./routes/admin");
const orgRoutes = require("./routes/orgs");
const userRoutes = require("./routes/users");
const whatsappCampaignRoutes = require("./routes/whatsappCampaigns");
const voicePhishingRoutes = require("./routes/voicePhishing");
const emailRoutes = require("./routes/email");
const emailTemplateRoutes = require("./routes/emailTemplates");
const whatsAppTemplateRoutes = require("./routes/whatsAppTemplates");
const voicePhishingTemplateRoutes = require("./routes/voicePhishingTemplates");
const campaignRoutes = require("./routes/campaigns");
const incidentRoutes = require("./routes/incidents");
const chatRoutes = require("./routes/chat");
const courseRoutes = require("./routes/courses");
const certificateRoutes = require("./routes/certificates");
const reportRoutes = require("./routes/reports");
const uploadRoutes = require("./routes/upload");
const leaderboardRoutes = require("./routes/leaderboard");
const Email = require("./models/Email");
const Campaign = require("./models/Campaign");
const WhatsAppCampaign = require("./models/WhatsAppCampaign");
const EmailRiskEvent = require("./models/EmailRiskEvent");
const User = require("./models/User");
const { isEligibleForEmailRiskScoring, updateUserEmailRiskScore } = require("./services/emailRiskScoreService");
const { recordWhatsAppRiskEvent } = require("./services/whatsappRiskScoreService");

const app = express();

// Email risk event weights (opened 0.2, clicked 0.5, credentials 0.7). Only recorded for affiliated/non_affiliated users.
const RECORD_EMAIL_RISK_EVENT = async (campaignId, sentToEmail, eventType, weight, emailId = null) => {
  console.log("[EmailRisk] Called (campaign path)", { eventType, campaignId: String(campaignId), sentTo: sentToEmail, weight, emailId: emailId || null });
  try {
    const campaign = await Campaign.findById(campaignId).select("targetUsers").lean();
    if (!campaign) {
      console.log("[EmailRisk] Skip: campaign not found", campaignId);
      return;
    }
    const targets = campaign.targetUsers || [];
    console.log("[EmailRisk] Campaign has", targets.length, "target(s); matching by email");
    const target = targets.find(
      (t) => (t.email || "").toLowerCase() === (sentToEmail || "").toLowerCase()
    );
    if (!target) {
      console.log("[EmailRisk] Skip: no target for email", sentToEmail, "| target emails:", targets.map((t) => t.email).join(", ") || "(none)");
      return;
    }
    if (!target.userId) {
      console.log("[EmailRisk] Skip: target has no userId (use org users, not manual email only)", sentToEmail);
      return;
    }
    console.log("[EmailRisk] Target found userId=", target.userId, "| looking up user role");
    const user = await User.findById(target.userId).select("role").lean();
    if (!user) {
      console.log("[EmailRisk] Skip: user not found", target.userId);
      return;
    }
    if (!isEligibleForEmailRiskScoring(user.role)) {
      console.log("[EmailRisk] Skip: user role not eligible for email risk", { role: user.role, sentTo: sentToEmail });
      return;
    }
    await EmailRiskEvent.create({
      userId: target.userId,
      eventType,
      campaignId,
      emailId: emailId || undefined,
      weight,
    });
    console.log("[EmailRisk] EmailRiskEvent created; updating user score for", target.userId);
    await updateUserEmailRiskScore(target.userId);
    console.log("[EmailRisk] Recorded (campaign path)", eventType, "for", sentToEmail, "userId", target.userId);
  } catch (err) {
    console.error("[EmailRisk] Record failed:", err.message, err.stack);
  }
};

// Fallback when Email has no campaignId (e.g. sent from email phishing page /api/email-campaigns/send).
// Look up user by recipient email; if affiliated/non_affiliated, record event and update score.
const RECORD_EMAIL_RISK_EVENT_BY_EMAIL = async (sentToEmail, eventType, weight, emailId = null) => {
  if (!sentToEmail || typeof sentToEmail !== "string") {
    console.log("[EmailRisk] By-email skip: invalid sentToEmail", sentToEmail);
    return;
  }
  const normalized = sentToEmail.trim().toLowerCase();
  if (!normalized) {
    console.log("[EmailRisk] By-email skip: empty email after trim");
    return;
  }
  console.log("[EmailRisk] By-email fallback", { eventType, sentTo: normalized, weight, emailId: emailId || null });
  try {
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, role: { $in: ["affiliated", "non_affiliated"] } }).select("_id role email").lean();
    if (!user) {
      console.log("[EmailRisk] Skip: no affiliated/non_affiliated user found for email", normalized, "| check User exists with this email and role in [affiliated, non_affiliated]");
      return;
    }
    console.log("[EmailRisk] By-email user found", { userId: user._id, role: user.role, email: user.email });
    await EmailRiskEvent.create({
      userId: user._id,
      eventType,
      campaignId: undefined,
      emailId: emailId || undefined,
      weight,
    });
    console.log("[EmailRisk] EmailRiskEvent created (no campaignId); updating user score for", user._id);
    await updateUserEmailRiskScore(user._id);
    console.log("[EmailRisk] Recorded (by email)", eventType, "for", normalized, "userId", user._id);
  } catch (err) {
    console.error("[EmailRisk] By-email record failed:", err.message, err.stack);
  }
};

// 1x1 transparent GIF for email open tracking (Buffer method – no file read)
const TRACKING_PIXEL_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
  0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x2c,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
  0x02, 0x44, 0x01, 0x00, 0x3b,
]);

// Security middleware
app.use(helmet());

// CORS configuration: allow dashboard (FRONTEND_URL) and landing pages (www) so credential tracking works
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  process.env.LANDING_PAGE_URL || "https://cybershieldlearningportal.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, origin);
      // Allow any localhost for local credential-tracking tests
      if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, origin);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Root – so visiting the backend URL shows something instead of 404
app.get("/", (req, res) => {
  res.json({
    message: "CyberShield Backend API",
    health: "/health",
    docs: "Use /api/* routes (e.g. /api/campaigns, /api/users)",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Email open tracking: middleware logs the request, then handler serves 1x1 GIF
app.use(
  "/track/open/:id",
  (req, res, next) => {
    if (req.method !== "GET") return next();
    console.log("Email open tracking: request for image", { id: req.params.id });
    next();
  },
  async (req, res, next) => {
    if (req.method !== "GET") return next();
    const id = req.params.id;
    try {
      const doc = await Email.findById(id);
      if (!doc) {
        next();
        return;
      }
      const wasAlreadyOpened = !!doc.openedAt;
      if (!wasAlreadyOpened) {
        const sentTime = doc.createdAt || new Date();
        const secondsSinceSent = (Date.now() - new Date(sentTime).getTime()) / 1000;
        // For campaign emails: ignore opens within 90s (mail scanners often prefetch images).
        // For course activity emails (no campaignId): always record so training telemetry works immediately.
        const gracePeriodSec = doc.campaignId ? 90 : 0;
        if (secondsSinceSent >= gracePeriodSec) {
          doc.openedAt = new Date();
          await doc.save();
          if (doc.campaignId) {
            console.log("[EmailRisk] Open: Email has campaignId, using campaign path");
            await Campaign.updateOne(
              { _id: doc.campaignId },
              {
                $inc: { "stats.totalEmailOpened": 1 },
                $set: {
                  "targetUsers.$[elem].emailStatus": "opened",
                  "targetUsers.$[elem].emailOpenedAt": doc.openedAt,
                },
              },
              { arrayFilters: [{ "elem.email": doc.sentTo }] }
            );
            await RECORD_EMAIL_RISK_EVENT(doc.campaignId, doc.sentTo, "email_opened", 0.2, doc._id);
          } else {
            console.log("[EmailRisk] Open: Email has no campaignId, using by-email path");
            await RECORD_EMAIL_RISK_EVENT_BY_EMAIL(doc.sentTo, "email_opened", 0.2, doc._id);
          }
          console.log("Email open recorded", { id, sentTo: doc.sentTo });
        }
      }
    } catch (err) {
      console.error("Email open tracking DB update failed:", err.message);
    }
    next();
  }
);
app.get("/track/open/:id", (req, res) => {
  res.writeHead(200, { "Content-Type": "image/gif" });
  res.end(TRACKING_PIXEL_GIF, "binary");
});

// Email click tracking: redirect through backend to record click, then redirect to destination
const CLICK_GRACE_SECONDS = 90;
const FALLBACK_REDIRECT = "https://www.google.com";

app.get("/track/click/:id", async (req, res) => {
  const id = req.params.id;
  const rawUrl = req.query.url;
  let destination = typeof rawUrl === "string" ? decodeURIComponent(rawUrl.trim()) : "";
  if (!destination || !/^https?:\/\//i.test(destination)) {
    destination = FALLBACK_REDIRECT;
  }
  // Append email id so landing page can report "credentials entered" for this email
  const sep = destination.indexOf("?") >= 0 ? "&" : "?";
  destination = `${destination}${sep}e=${encodeURIComponent(id)}`;
  try {
    const doc = await Email.findById(id);
    if (doc) {
      const wasAlreadyClicked = !!doc.clickedAt;
      if (!wasAlreadyClicked) {
        const sentTime = doc.createdAt || new Date();
        const secondsSinceSent = (Date.now() - new Date(sentTime).getTime()) / 1000;
        // For campaign emails: 90s grace to avoid prefetcher false positives. For course activity: record immediately.
        const gracePeriodSec = doc.campaignId ? CLICK_GRACE_SECONDS : 0;
        if (secondsSinceSent >= gracePeriodSec) {
          doc.clickedAt = new Date();
          await doc.save();
          if (doc.campaignId) {
            console.log("[EmailRisk] Click: Email has campaignId, using campaign path");
            await Campaign.updateOne(
              { _id: doc.campaignId },
              {
                $inc: { "stats.totalEmailClicked": 1 },
                $set: {
                  "targetUsers.$[elem].emailStatus": "clicked",
                  "targetUsers.$[elem].emailClickedAt": doc.clickedAt,
                },
              },
              { arrayFilters: [{ "elem.email": doc.sentTo }] }
            );
            await RECORD_EMAIL_RISK_EVENT(doc.campaignId, doc.sentTo, "email_clicked", 0.5, doc._id);
          } else {
            console.log("[EmailRisk] Click: Email has no campaignId, using by-email path");
            await RECORD_EMAIL_RISK_EVENT_BY_EMAIL(doc.sentTo, "email_clicked", 0.5, doc._id);
          }
          console.log("Email click recorded", { id, sentTo: doc.sentTo });
        }
      }
    }
  } catch (err) {
    console.error("Email click tracking DB update failed:", err.message);
  }
  res.redirect(302, destination);
});

// Email credentials-entered tracking (landing page form submit – no credentials stored, just that user submitted)
// CORS preflight: OPTIONS must be handled so the landing page (different origin) can POST
app.options("/track/credentials", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
});

app.post("/track/credentials", express.json(), async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const emailId = (req.body && req.body.emailId) || (req.query && req.query.e);
  const clickToken = (req.body && req.body.clickToken) || (req.query && req.query.ct);

  // Email phishing: record credentials entered for this email
  if (emailId) {
    try {
      const doc = await Email.findById(emailId);
      if (!doc) {
        return res.status(404).json({ success: false, message: "Email not found" });
      }
      const alreadyRecorded = !!doc.credentialsEnteredAt;
      if (!alreadyRecorded) {
        doc.credentialsEnteredAt = new Date();
        await doc.save();
        if (doc.campaignId) {
          console.log("[EmailRisk] Credentials: Email has campaignId, using campaign path");
          await Campaign.updateOne(
            { _id: doc.campaignId },
            {
              $inc: { "stats.totalEmailReported": 1 },
              $set: {
                "targetUsers.$[elem].emailStatus": "reported",
                "targetUsers.$[elem].emailReportedAt": doc.credentialsEnteredAt,
              },
            },
            { arrayFilters: [{ "elem.email": doc.sentTo }] }
          );
          await RECORD_EMAIL_RISK_EVENT(doc.campaignId, doc.sentTo, "email_credentials_submitted", 0.7, doc._id);
        } else {
          console.log("[EmailRisk] Credentials: Email has no campaignId, using by-email path");
          await RECORD_EMAIL_RISK_EVENT_BY_EMAIL(doc.sentTo, "email_credentials_submitted", 0.7, doc._id);
        }
        console.log("Email credentials entered recorded", { id: emailId, sentTo: doc.sentTo });
      }
      return res.status(200).json({ success: true, recorded: !alreadyRecorded });
    } catch (err) {
      console.error("Credentials tracking failed (email):", err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // WhatsApp phishing: record credentials entered for this target (clickToken from landing URL ?ct=)
  if (clickToken) {
    try {
      const campaign = await WhatsAppCampaign.findOne({ "targetUsers.clickToken": clickToken });
      if (!campaign) {
        return res.status(404).json({ success: false, message: "Campaign target not found" });
      }
      const target = campaign.targetUsers.find((t) => t.clickToken === clickToken);
      if (!target) {
        return res.status(404).json({ success: false, message: "Target not found" });
      }
      const alreadyRecorded = target.status === "reported";
      if (!alreadyRecorded) {
        target.status = "reported";
        target.reportedAt = new Date();
        campaign.stats.totalReported = (campaign.stats.totalReported || 0) + 1;
        await campaign.save();
        if (target.userId) {
          console.log("[WhatsAppRisk] Credentials: recording risk event for target.userId", target.userId.toString());
          await recordWhatsAppRiskEvent(target.userId, "whatsapp_credentials_submitted", campaign._id, 0.7);
        } else {
          console.log("[WhatsAppRisk] Credentials: target has no userId – WhatsApp risk not recorded. Phone:", target.phoneNumber);
        }
        console.log("WhatsApp credentials entered recorded", { campaignId: campaign._id, phoneNumber: target.phoneNumber });
        if (campaign.managedByParentCampaign) {
          await Campaign.updateOne(
            { whatsappCampaignId: campaign._id },
            {
              $inc: { "stats.totalWhatsappReported": 1 },
              $set: {
                "targetUsers.$[elem].whatsappStatus": "reported",
                "targetUsers.$[elem].whatsappReportedAt": target.reportedAt,
              },
            },
            { arrayFilters: [{ "elem.phoneNumber": target.phoneNumber }] }
          );
        }
      }
      return res.status(200).json({ success: true, recorded: !alreadyRecorded });
    } catch (err) {
      console.error("Credentials tracking failed (whatsapp):", err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }

  return res.status(400).json({ success: false, message: "Missing emailId or clickToken" });
});

// API routes
app.use("/api/admins", adminRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api/users", userRoutes);
app.use("/api/whatsapp-campaigns", whatsappCampaignRoutes);
app.use("/api/voice-phishing", voicePhishingRoutes);
app.use("/api/email-campaigns", emailRoutes);
app.use("/api/email-templates", emailTemplateRoutes);
app.use("/api/whatsapp-templates", whatsAppTemplateRoutes);
app.use("/api/voice-phishing-templates", voicePhishingTemplateRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  // Multer errors
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File too large. Maximum size is 100MB." });
  }

  if (error.message === "Only CSV files are allowed") {
    return res.status(400).json({ error: "Only CSV files are allowed" });
  }

  // Default error response
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

module.exports = app;
