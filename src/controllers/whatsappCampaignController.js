const crypto = require("crypto");
const WhatsAppCampaign = require("../models/WhatsAppCampaign");
const Campaign = require("../models/Campaign");
const twilioService = require("../services/twilioService");
const User = require("../models/User");
const { recordWhatsAppRiskEvent } = require("../services/whatsappRiskScoreService");

// Add invisible click-tracking param to URL (landing page will call backend with it, then strip from URL)
const addTrackingParam = (url, token) => {
  if (!url || !token) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("ct", token);
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + "ct=" + encodeURIComponent(token);
  }
};

// Replace landing page URL in message body with tracking URL so we know which target clicked
const injectTrackingLink = (messageTemplate, landingPageUrl, trackingUrl) => {
  if (!messageTemplate || !landingPageUrl || !trackingUrl) return messageTemplate;
  const normalized = (landingPageUrl || "").trim();
  if (!normalized) return messageTemplate;
  return messageTemplate.replace(new RegExp(escapeForRegex(normalized), "gi"), trackingUrl);
};

const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startCampaignScheduler = () => {
  setInterval(async () => {
    try {
      const now = new Date();
      const scheduledCampaigns = await WhatsAppCampaign.find({
        status: "scheduled",
        scheduleDate: { $lte: now },
        managedByParentCampaign: { $ne: true }, // Only schedule independent campaigns
      });

      for (const campaign of scheduledCampaigns) {
        console.log(`Starting scheduled WhatsApp campaign: ${campaign.name}`);
        campaign.status = "running";
        campaign.startDate = new Date();
        await campaign.save();
        sendCampaignMessages(campaign).catch((error) => {
          console.error(`Campaign Send Error for ${campaign.name}:`, error);
          campaign.status = "cancelled";
          campaign.save();
        });
      }
    } catch (error) {
      console.error("Campaign Scheduler Error:", error);
    }
  }, 60000);
};
// Scheduler is started from server.js after DB connection (do not run on module load)
const createCampaign = async (req, res) => {
  try {
    const {
      name,
      description,
      messageTemplate,
      landingPageUrl,
      targetUserIds,
      scheduleDate,
      trackingEnabled = true,
    } = req.body;

    const userId = req.user._id;
    const organizationId = req.user.orgId?._id || req.user.orgId;

    // WhatsApp campaigns: only platform users (targetUserIds). Each must have a valid phone number for sending and risk scoring.
    if (!targetUserIds || targetUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one target user from your organization.",
      });
    }

    const targetUsers = await User.find({
      _id: { $in: targetUserIds },
      orgId: organizationId,
    }).select("_id displayName email phoneNumber").lean();

    if (targetUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid target users found. Users must belong to your organization.",
      });
    }

    const missingPhone = targetUsers.filter((u) => !u.phoneNumber || !String(u.phoneNumber).trim());
    if (missingPhone.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following users have no phone number set and cannot receive WhatsApp campaigns: ${missingPhone.map((u) => u.email || u.displayName).join(", ")}. Ask them to add their phone number in Profile/Settings.`,
      });
    }

    const validTargets = targetUsers.filter((u) => twilioService.isValidPhoneNumber(u.phoneNumber));
    if (validTargets.length !== targetUsers.length) {
      const invalid = targetUsers.filter((u) => !twilioService.isValidPhoneNumber(u.phoneNumber));
      return res.status(400).json({
        success: false,
        message: `Invalid phone number format for: ${invalid.map((u) => u.email || u.displayName).join(", ")}. Use a valid format (e.g. +923001234567).`,
      });
    }

    const campaignTargets = targetUsers.map((user) => ({
      userId: user._id,
      phoneNumber: String(user.phoneNumber).trim(),
      name: user.displayName,
      status: "pending",
    }));
    const campaign = new WhatsAppCampaign({
      name,
      description,
      organizationId,
      createdBy: userId,
      templateId: "manual_template",
      targetUsers: campaignTargets,
      messageTemplate,
      landingPageUrl,
      trackingEnabled,
      scheduleDate: scheduleDate ? new Date(scheduleDate) : null,
      status: scheduleDate ? "scheduled" : "draft",
    });
    await campaign.save();
    res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Create Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create campaign",
      error: error.message,
    });
  }
};
const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    // Handle both populated and non-populated orgId (auth middleware populates orgId)
    const organizationId = req.user.orgId?._id || req.user.orgId;
    const userRole = req.user.role;

    let query = {};
    
    // Client admins: only their org's campaigns
    if (userRole === "client_admin" && organizationId) {
      query.organizationId = organizationId;
    }
    // System admins: only campaigns for non-affiliated users (orgId = null)
    else if (userRole === "system_admin") {
      query.organizationId = null;
    }
    // Other roles: their org's campaigns
    else if (organizationId) {
      query.organizationId = organizationId;
    }
    
    if (status) {
      query.status = status;
    }

    const campaigns = await WhatsAppCampaign.find(query)
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WhatsAppCampaign.countDocuments(query);

    res.json({
      success: true,
      data: {
        campaigns,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Get Campaigns Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
      error: error.message,
    });
  }
};
const getCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const organizationId = req.user.orgId?._id || req.user.orgId;

    const query = { _id: campaignId };
    if (organizationId) query.organizationId = organizationId;
    const campaign = await WhatsAppCampaign.findOne(query).populate(
      "createdBy",
      "firstName lastName email"
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error("Get Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign",
      error: error.message,
    });
  }
};
const startCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const organizationId = req.user.orgId?._id || req.user.orgId;

    let campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      ...(organizationId && { organizationId }),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be started",
      });
    }

    // Already running or completed (e.g. started from unified campaign) – return success so frontend doesn't show error
    if (campaign.status === "running" || campaign.status === "completed") {
      return res.json({
        success: true,
        message: "Campaign was already started",
        data: campaign,
      });
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Campaign cannot be started in its current status",
      });
    }

    campaign.status = "running";
    campaign.startDate = new Date();
    await campaign.save();
    sendCampaignMessages(campaign).catch((error) => {
      console.error("Campaign Send Error:", error);
    });

    res.json({
      success: true,
      message: "Campaign started successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Start Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start campaign",
      error: error.message,
    });
  }
};
const sendCampaignMessages = async (campaign) => {
  try {
    const pendingTargets = campaign.targetUsers.filter(
      (target) => target.status === "pending"
    );

    const messageTemplate = campaign.messageTemplate;
    const landingPageUrl = (campaign.landingPageUrl || "").trim();
    const trackingEnabled = campaign.trackingEnabled && landingPageUrl;
    if (pendingTargets.length > 0) {
      console.log("[Campaign Send] trackingEnabled:", trackingEnabled, "landingPageUrl:", landingPageUrl || "(empty)");
    }

    for (const target of pendingTargets) {
      try {
        if (!twilioService.isValidPhoneNumber(target.phoneNumber)) {
          target.status = "failed";
          target.failureReason = "Invalid phone number";
          continue;
        }
        let messageToSend = messageTemplate;
        let clickToken = null;
        if (trackingEnabled) {
          clickToken = crypto.randomBytes(24).toString("hex");
          const trackingUrl = addTrackingParam(landingPageUrl, clickToken);
          messageToSend = injectTrackingLink(messageTemplate, landingPageUrl, trackingUrl);
          const wasReplaced = messageToSend !== messageTemplate;
          console.log("[Campaign Send] Click tracking: token", clickToken.substring(0, 8) + "...", "trackingUrl:", trackingUrl.substring(0, 70) + (trackingUrl.length > 70 ? "..." : ""), "linkInMessageReplaced:", wasReplaced);
        }
        const result = await twilioService.sendWhatsAppMessage(
          target.phoneNumber,
          messageToSend
        );

        if (result.success) {
          target.status = "sent";
          target.sentAt = new Date();
          if (result.messageId) target.messageSid = result.messageId;
          if (clickToken) target.clickToken = clickToken;
          campaign.stats.totalSent += 1;
          if (clickToken) console.log("[Campaign Send] Stored clickToken for target. Test click URL: .../click?t=" + clickToken.substring(0, 12) + "...");
        } else {
          target.status = "failed";
          target.failureReason = result.error;
          campaign.stats.totalFailed += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to send to ${target.phoneNumber}:`, error);
        target.status = "failed";
        target.failureReason = error.message;
        campaign.stats.totalFailed += 1;
      }
    }
    campaign.status = "completed";
    campaign.endDate = new Date();
    await campaign.save();
  } catch (error) {
    console.error("Campaign Send Error:", error);
    campaign.status = "cancelled";
    await campaign.save();
  }
};
const updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const organizationId = req.user.orgId?._id || req.user.orgId;
    const updates = req.body;

    const query = { _id: campaignId };
    if (organizationId) query.organizationId = organizationId;
    query.status = { $in: ["draft", "scheduled"] };
    const campaign = await WhatsAppCampaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be updated",
      });
    }
    const allowedUpdates = [
      "name",
      "description",
      "messageTemplate",
      "landingPageUrl",
      "scheduleDate",
    ];

    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        campaign[field] = updates[field];
      }
    });

    await campaign.save();

    res.json({
      success: true,
      message: "Campaign updated successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Update Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update campaign",
      error: error.message,
    });
  }
};
const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const organizationId = req.user.orgId?._id || req.user.orgId;

    const query = { _id: campaignId };
    if (organizationId) query.organizationId = organizationId;
    query.status = { $in: ["draft", "scheduled"] };
    const campaign = await WhatsAppCampaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be deleted",
      });
    }

    await WhatsAppCampaign.deleteOne({ _id: campaignId });

    res.json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error("Delete Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete campaign",
      error: error.message,
    });
  }
};
const getCampaignAnalytics = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const organizationId = req.user.orgId?._id || req.user.orgId;

    const query = { _id: campaignId };
    if (organizationId) query.organizationId = organizationId;
    const campaign = await WhatsAppCampaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Calculate additional analytics
    const analytics = {
      ...campaign.stats,
      totalTargets: campaign.targetUsers.length,
      deliveryRate:
        campaign.stats.totalSent > 0
          ? (
              (campaign.stats.totalDelivered / campaign.stats.totalSent) *
              100
            ).toFixed(2)
          : 0,
      readRate:
        campaign.stats.totalSent > 0
          ? (
              (campaign.stats.totalRead / campaign.stats.totalSent) *
              100
            ).toFixed(2)
          : 0,
      clickRate:
        campaign.stats.totalSent > 0
          ? (
              (campaign.stats.totalClicked / campaign.stats.totalSent) *
              100
            ).toFixed(2)
          : 0,
      reportRate:
        campaign.stats.totalSent > 0
          ? (
              (campaign.stats.totalReported / campaign.stats.totalSent) *
              100
            ).toFixed(2)
          : 0,
    };

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Get Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};
// Normalize phone for matching so Twilio "923337335588" matches stored "03337335588"
const normalizePhoneForMatch = (phone) => {
  const digits = (phone || "").replace(/\D/g, "");
  // Pakistan: 0XXXXXXXXXX (11 digits) => 92XXXXXXXXXX so it matches Twilio's To
  if (digits.length === 11 && digits.startsWith("0")) {
    return "92" + digits.substring(1);
  }
  // Already 92... or other country code
  return digits;
};

const handleTwilioWebhook = async (req, res) => {
  // Log every webhook request (visible in Vercel Functions logs)
  const body = req.body || {};
  const MessageSid = body.MessageSid;
  const MessageStatus = body.MessageStatus;
  const To = body.To;
  const From = body.From;
  console.log("[Twilio Webhook] Received:", {
    MessageSid,
    MessageStatus,
    To,
    From,
    bodyKeys: Object.keys(body),
  });

  try {
    const toDigits = normalizePhoneForMatch(To || "");

    // 1) Prefer exact match by MessageSid so the correct campaign is updated when the same number is in multiple campaigns.
    let campaign = null;
    let target = null;
    if (MessageSid) {
      campaign = await WhatsAppCampaign.findOne({ "targetUsers.messageSid": MessageSid });
      if (campaign) {
        target = campaign.targetUsers.find((t) => t.messageSid === MessageSid) || null;
      }
    }

    // 2) Fallback: match by phone (for sends that didn't store messageSid, or legacy data).
    if (!campaign || !target) {
      const campaigns = await WhatsAppCampaign.find({
        "targetUsers.status": { $in: ["sent", "delivered"] },
      });
      for (const c of campaigns) {
        const t = c.targetUsers.find(
          (x) => (x.status === "sent" || x.status === "delivered") && normalizePhoneForMatch(x.phoneNumber) === toDigits
        );
        if (t) {
          campaign = c;
          target = t;
          break;
        }
      }
    }

    if (!campaign || !target) {
      console.log("[Twilio Webhook] No matching campaign/target for MessageSid:", MessageSid, "To:", To, "digits:", toDigits, "- ensure messageSid was stored when sending (e.g. combined campaign now stores it)");
    } else {
      const matchType = target.messageSid ? "MessageSid" : "phone";
      console.log("[Twilio Webhook] Matched campaign:", campaign._id, "by", matchType, "target phone:", toDigits, "current status:", target.status, "updating to:", MessageStatus);
      let didUpdate = false;
      switch (MessageStatus) {
        case "delivered":
          if (target.status === "sent") {
            target.status = "delivered";
            target.deliveredAt = new Date();
            campaign.stats.totalDelivered += 1;
            didUpdate = true;
          }
          break;
        case "read":
          if (target.status !== "read") {
            target.status = "read";
            target.readAt = new Date();
            campaign.stats.totalRead += 1;
            didUpdate = true;
            if (target.userId) {
              console.log("[WhatsAppRisk] Webhook read: recording risk event for target.userId", target.userId.toString());
              await recordWhatsAppRiskEvent(target.userId, "whatsapp_read", campaign._id, 0.2);
            } else {
              console.log("[WhatsAppRisk] Webhook read: target has no userId – WhatsApp risk not recorded. Phone:", toDigits);
            }
          }
          break;
        case "failed":
          target.status = "failed";
          target.failureReason = body.ErrorMessage;
          campaign.stats.totalFailed += 1;
          didUpdate = true;
          break;
        default:
          console.log("[Twilio Webhook] Unhandled MessageStatus:", MessageStatus);
      }
      if (didUpdate) {
        await campaign.save();
        console.log("[Twilio Webhook] Saved. Stats now - delivered:", campaign.stats.totalDelivered, "read:", campaign.stats.totalRead);
        // Sync to parent Campaign when this WhatsApp campaign is managed by campaign page (combined email+whatsapp)
        if (campaign.managedByParentCampaign) {
          const updatePayload = {};
          if (MessageStatus === "delivered") {
            updatePayload.$inc = { "stats.totalWhatsappDelivered": 1 };
            updatePayload.$set = {
              "targetUsers.$[elem].whatsappStatus": "delivered",
              "targetUsers.$[elem].whatsappDeliveredAt": target.deliveredAt,
            };
          } else if (MessageStatus === "read") {
            updatePayload.$inc = { "stats.totalWhatsappRead": 1 };
            updatePayload.$set = {
              "targetUsers.$[elem].whatsappStatus": "read",
              "targetUsers.$[elem].whatsappReadAt": target.readAt,
            };
          } else if (MessageStatus === "failed") {
            updatePayload.$inc = { "stats.totalWhatsappFailed": 1 };
            updatePayload.$set = {
              "targetUsers.$[elem].whatsappStatus": "failed",
              "targetUsers.$[elem].whatsappFailureReason": target.failureReason || body.ErrorMessage || "",
            };
          }
          if (Object.keys(updatePayload).length) {
            const parentResult = await Campaign.updateOne(
              { whatsappCampaignId: campaign._id },
              updatePayload,
              { arrayFilters: [{ "elem.phoneNumber": target.phoneNumber }] }
            );
            console.log("[Twilio Webhook] Parent campaign sync (combined): status=", MessageStatus, "| matched:", parentResult.modifiedCount, "| phone:", target.phoneNumber);
          }
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("[Twilio Webhook] Error:", error);
    res.status(500).send("Error");
  }
};

// Public endpoint: landing pages call this when user opens link with ?ct=TOKEN (no auth).
// Local testing with DEPLOYED (HTTPS) landing page: do NOT use http://localhost — browsers block
// mixed content (HTTPS page cannot fetch HTTP). Use ngrok: run "ngrok http 5001" and set campaign
// landing URL to e.g. https://yoursite.vercel.app/dropbx?cybershield_api=https://YOUR-NGROK-URL.ngrok-free.app
const recordClick = async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const token = (req.query.t || req.query.ct || "").trim();
  console.log("[Click] Request received. Query:", { t: req.query.t, ct: req.query.ct }, "token length:", token?.length || 0, "token preview:", token ? token.substring(0, 8) + "..." : "(empty)");
  if (!token) {
    console.log("[Click] No token in query – returning 204");
    return res.status(204).end();
  }
  try {
    const campaign = await WhatsAppCampaign.findOne({ "targetUsers.clickToken": token });
    if (!campaign) {
      console.log("[Click] No campaign found with clickToken:", token.substring(0, 8) + "... (link must contain ?ct=TOKEN; combined campaigns now inject this when sending)");
      return res.status(204).end();
    }
    console.log("[Click] Campaign found:", campaign._id, "| managedByParentCampaign:", !!campaign.managedByParentCampaign);
    const target = campaign.targetUsers.find((t) => t.clickToken === token);
    if (!target) {
      console.log("[Click] Campaign", campaign._id, "found but no target with this clickToken – returning 204");
      return res.status(204).end();
    }
    if (target.status === "clicked") {
      console.log("[Click] Target already clicked (idempotent). Campaign:", campaign._id, "totalClicked:", campaign.stats.totalClicked);
      return res.status(204).end();
    }
    target.status = "clicked";
    target.clickedAt = new Date();
    campaign.stats.totalClicked += 1;
    await campaign.save();
    if (campaign.managedByParentCampaign) {
      const parentResult = await Campaign.updateOne(
        { whatsappCampaignId: campaign._id },
        {
          $inc: { "stats.totalWhatsappClicked": 1 },
          $set: {
            "targetUsers.$[elem].whatsappStatus": "clicked",
            "targetUsers.$[elem].whatsappClickedAt": target.clickedAt,
          },
        },
        { arrayFilters: [{ "elem.phoneNumber": target.phoneNumber }] }
      );
      console.log("[Click] Parent campaign sync (combined): matched:", parentResult.modifiedCount, "| campaignId:", campaign._id, "| phone:", target.phoneNumber);
    }
    if (target.userId) {
      console.log("[WhatsAppRisk] Click: recording risk event for target.userId", target.userId.toString());
      await recordWhatsAppRiskEvent(target.userId, "whatsapp_clicked", campaign._id, 0.5);
    } else {
      console.log("[WhatsAppRisk] Click: target has no userId – WhatsApp risk not recorded. Target phone:", target.phoneNumber, "| Ensure campaign was created with platform users (targetUserIds), not manual entries.");
    }
    console.log("[Click] OK – campaign:", campaign._id, "target status -> clicked, totalClicked:", campaign.stats.totalClicked);
    res.status(204).end();
  } catch (error) {
    console.error("[Click] Error:", error);
    res.status(204).end();
  }
};

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaign,
  startCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignAnalytics,
  handleTwilioWebhook,
  recordClick,
  startCampaignScheduler,
};
