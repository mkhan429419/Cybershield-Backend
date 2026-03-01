const crypto = require("crypto");
const Campaign = require("../models/Campaign");
const EmailTemplate = require("../models/EmailTemplate");
const User = require("../models/User");
const WhatsAppCampaign = require("../models/WhatsAppCampaign");
const Email = require("../models/Email");
const twilioService = require("../services/twilioService");
const nodemailerService = require("../services/nodemailerService");
const { formatEmailForSending } = require("../services/emailFormatter");

// Click tracking for combined campaign WhatsApp (same logic as whatsappCampaignController.sendCampaignMessages)
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
const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const injectTrackingLink = (messageTemplate, landingPageUrl, trackingUrl) => {
  if (!messageTemplate || !landingPageUrl || !trackingUrl) return messageTemplate;
  const normalized = (landingPageUrl || "").trim();
  if (!normalized) return messageTemplate;
  return messageTemplate.replace(new RegExp(escapeForRegex(normalized), "gi"), trackingUrl);
};

// Campaign scheduler - checks every minute for scheduled campaigns
const startCampaignScheduler = () => {
  setInterval(async () => {
    try {
      const now = new Date();
      const scheduledCampaigns = await Campaign.find({
        status: "scheduled",
        scheduleDate: { $lte: now },
      });

      for (const campaign of scheduledCampaigns) {
        console.log(`Starting scheduled campaign: ${campaign.name}`);
        campaign.status = "running";
        campaign.startDate = new Date();
        campaign.scheduleDate = null; // Clear schedule date once started
        await campaign.save();
        
        // Also update WhatsAppCampaign if it exists
        if (campaign.whatsappCampaignId) {
          await WhatsAppCampaign.findByIdAndUpdate(campaign.whatsappCampaignId, {
            scheduleDate: null, // Clear schedule
          });
        }
        
        // Execute campaign in background
        executeCampaign(campaign).catch((error) => {
          console.error(`Campaign Execution Error for ${campaign.name}:`, error);
          campaign.status = "cancelled";
          campaign.save();
        });
      }
    } catch (error) {
      console.error("Campaign Scheduler Error:", error);
    }
  }, 60000); // Check every minute
};

// Start the scheduler when this module is loaded
startCampaignScheduler();

/**
 * Create a new campaign
 */
const createCampaign = async (req, res) => {
  try {
    const {
      name,
      description,
      targetUserIds,
      manualUsers,
      whatsappConfig,
      emailConfig,
      scheduleDate,
      settings,
    } = req.body;

    const userId = req.user._id;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    // Validate that at least one channel is enabled
    if (!whatsappConfig?.enabled && !emailConfig?.enabled) {
      return res.status(400).json({
        success: false,
        message: "At least one channel (WhatsApp or Email) must be enabled",
      });
    }

    // Validate WhatsApp config if enabled
    if (whatsappConfig?.enabled) {
      if (!whatsappConfig.messageTemplate || !whatsappConfig.landingPageUrl) {
        return res.status(400).json({
          success: false,
          message: "WhatsApp configuration requires messageTemplate and landingPageUrl",
        });
      }
    }

    // Validate Email config if enabled
    if (emailConfig?.enabled) {
      if (!emailConfig.subject || !emailConfig.bodyContent || !emailConfig.senderEmail) {
        return res.status(400).json({
          success: false,
          message: "Email configuration requires subject, bodyContent, and senderEmail",
        });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailConfig.senderEmail)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sender email address format",
        });
      }
    }

    // Build target users list
    let campaignTargets = [];
    
    if (manualUsers && manualUsers.length > 0) {
      // Manual users with phone/email
      campaignTargets = manualUsers.map((user) => {
        const target = {
          phoneNumber: user.phoneNumber || "",
          email: user.email || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        };
        
        // Set initial status based on enabled channels
        target.whatsappStatus = whatsappConfig?.enabled && user.phoneNumber ? "pending" : "not_applicable";
        target.emailStatus = emailConfig?.enabled && user.email ? "pending" : "not_applicable";
        
        return target;
      });
    } else if (targetUserIds && targetUserIds.length > 0) {
      // Get users from database (include phoneNumber for WhatsApp campaigns)
      const targetUsers = await User.find({
        _id: { $in: targetUserIds },
        orgId: organizationId,
      }).select("_id displayName email phoneNumber").lean();

      if (targetUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid target users found in your organization",
        });
      }

      if (whatsappConfig?.enabled) {
        const withPhone = targetUsers.filter((u) => u.phoneNumber && String(u.phoneNumber).trim());
        if (withPhone.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one target user must have a phone number set for WhatsApp. Ask users to add their phone in Profile/Settings.",
          });
        }
      }

      campaignTargets = targetUsers.map((user) => {
        const target = {
          userId: user._id,
          email: user.email || "",
          phoneNumber: (user.phoneNumber && String(user.phoneNumber).trim()) || "",
          name: user.displayName,
        };
        
        // Set initial status based on enabled channels
        target.whatsappStatus = whatsappConfig?.enabled && target.phoneNumber ? "pending" : "not_applicable";
        target.emailStatus = emailConfig?.enabled && target.email ? "pending" : "not_applicable";
        
        return target;
      });
    }

    if (campaignTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please add at least one target user",
      });
    }

    // Calculate initial stats
    const stats = {
      totalEmailTargets: emailConfig?.enabled 
        ? campaignTargets.filter(t => t.email && t.emailStatus === "pending").length 
        : 0,
      totalWhatsappTargets: whatsappConfig?.enabled 
        ? campaignTargets.filter(t => t.phoneNumber && t.whatsappStatus === "pending").length 
        : 0,
    };

    // Create WhatsAppCampaign if WhatsApp is enabled
    let whatsappCampaignId = null;
    if (whatsappConfig?.enabled) {
      const whatsappTargets = campaignTargets
        .filter(t => t.phoneNumber && t.whatsappStatus === "pending")
        .map(t => ({
          userId: t.userId,
          phoneNumber: t.phoneNumber,
          name: t.name,
          status: "pending",
        }));

      const whatsappCampaign = new WhatsAppCampaign({
        name: `${name} - WhatsApp`,
        description,
        organizationId,
        createdBy: userId,
        templateId: whatsappConfig.templateId || "manual_template",
        targetUsers: whatsappTargets,
        messageTemplate: whatsappConfig.messageTemplate,
        landingPageUrl: whatsappConfig.landingPageUrl,
        trackingEnabled: settings?.trackingEnabled ?? true,
        scheduleDate: null, // Don't schedule - managed by parent Campaign
        status: "draft", // Always draft - managed by parent Campaign
        managedByParentCampaign: true, // Flag to prevent independent scheduler execution
      });

      await whatsappCampaign.save();
      whatsappCampaignId = whatsappCampaign._id;
    }

    // Create campaign
    const campaign = new Campaign({
      name,
      description,
      organizationId,
      createdBy: userId,
      targetUsers: campaignTargets,
      whatsappCampaignId,
      whatsappConfig: whatsappConfig || { enabled: false },
      emailConfig: emailConfig || { enabled: false },
      emailRecords: [],
      scheduleDate: scheduleDate ? new Date(scheduleDate) : null,
      status: scheduleDate ? "scheduled" : "draft",
      stats,
      settings: settings || {},
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

/**
 * Get all campaigns for an organization
 */
const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;
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

    const campaigns = await Campaign.find(query)
      .populate("createdBy", "displayName email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Campaign.countDocuments(query);

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

/**
 * Get a single campaign by ID
 */
const getCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = { _id: campaignId };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query)
      .populate("createdBy", "displayName email")
      .populate("emailConfig.templateId")
      .populate("whatsappCampaignId")
      .populate("emailRecords");

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

/**
 * Update a campaign (only if draft or scheduled)
 */
const updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;
    const updates = req.body;

    const query = {
      _id: campaignId,
      status: { $in: ["draft", "scheduled"] },
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be updated",
      });
    }

    // Allow updating specific fields
    const allowedUpdates = [
      "name",
      "description",
      "whatsappConfig",
      "emailConfig",
      "scheduleDate",
      "settings",
      "targetUsers",
    ];

    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        campaign[field] = updates[field];
      }
    });

    // Update status if schedule date changed
    if (updates.scheduleDate) {
      campaign.status = "scheduled";
    }

    // Update associated WhatsAppCampaign if it exists and whatsappConfig updated
    if (campaign.whatsappCampaignId && updates.whatsappConfig) {
      const whatsappCampaign = await WhatsAppCampaign.findById(campaign.whatsappCampaignId);
      if (whatsappCampaign) {
        if (updates.whatsappConfig.messageTemplate) {
          whatsappCampaign.messageTemplate = updates.whatsappConfig.messageTemplate;
        }
        if (updates.whatsappConfig.landingPageUrl) {
          whatsappCampaign.landingPageUrl = updates.whatsappConfig.landingPageUrl;
        }
        if (updates.name) {
          whatsappCampaign.name = `${updates.name} - WhatsApp`;
        }
        if (updates.description) {
          whatsappCampaign.description = updates.description;
        }
        // Don't update schedule - WhatsAppCampaign is managed by parent Campaign
        // Keep it as draft, parent Campaign controls execution
        await whatsappCampaign.save();
      }
    }

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

/**
 * Delete a campaign (only if draft or scheduled)
 */
const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = {
      _id: campaignId,
      status: { $in: ["draft", "scheduled"] },
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be deleted",
      });
    }

    // Delete associated WhatsAppCampaign if exists
    if (campaign.whatsappCampaignId) {
      await WhatsAppCampaign.deleteOne({ _id: campaign.whatsappCampaignId });
    }

    // Delete associated Email records if exists
    if (campaign.emailRecords && campaign.emailRecords.length > 0) {
      await Email.deleteMany({ _id: { $in: campaign.emailRecords } });
    }

    // Delete the campaign itself
    await Campaign.deleteOne({ _id: campaignId });

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

/**
 * Start a campaign immediately
 */
const startCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = {
      _id: campaignId,
      status: { $in: ["draft", "scheduled"] },
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be started",
      });
    }

    campaign.status = "running";
    campaign.startDate = new Date();
    campaign.scheduleDate = null; // Clear schedule date when manually started
    await campaign.save();

    // Also update WhatsAppCampaign if it exists
    if (campaign.whatsappCampaignId) {
      await WhatsAppCampaign.findByIdAndUpdate(campaign.whatsappCampaignId, {
        status: "draft", // Keep as draft, will be set to running by executeCampaign
        scheduleDate: null, // Clear schedule
      });
    }

    // Execute campaign in background
    executeCampaign(campaign).catch((error) => {
      console.error("Campaign Execution Error:", error);
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

/**
 * Pause a running campaign
 */
const pauseCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = {
      _id: campaignId,
      status: "running",
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or is not running",
      });
    }

    campaign.status = "paused";
    await campaign.save();

    // Pause associated WhatsAppCampaign if exists
    if (campaign.whatsappCampaignId) {
      await WhatsAppCampaign.findByIdAndUpdate(campaign.whatsappCampaignId, {
        status: "paused",
      });
    }

    res.json({
      success: true,
      message: "Campaign paused successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Pause Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pause campaign",
      error: error.message,
    });
  }
};

/**
 * Resume a paused campaign
 */
const resumeCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = {
      _id: campaignId,
      status: "paused",
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or is not paused",
      });
    }

    campaign.status = "running";
    await campaign.save();

    // Resume associated WhatsAppCampaign if exists
    if (campaign.whatsappCampaignId) {
      await WhatsAppCampaign.findByIdAndUpdate(campaign.whatsappCampaignId, {
        status: "running",
      });
    }

    // Continue executing campaign
    executeCampaign(campaign).catch((error) => {
      console.error("Campaign Execution Error:", error);
    });

    res.json({
      success: true,
      message: "Campaign resumed successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Resume Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resume campaign",
      error: error.message,
    });
  }
};

/**
 * Cancel a campaign
 */
const cancelCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = {
      _id: campaignId,
      status: { $in: ["scheduled", "running", "paused"] },
    };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be cancelled",
      });
    }

    campaign.status = "cancelled";
    campaign.endDate = new Date();
    await campaign.save();

    // Cancel associated WhatsAppCampaign if exists
    if (campaign.whatsappCampaignId) {
      await WhatsAppCampaign.findByIdAndUpdate(campaign.whatsappCampaignId, {
        status: "cancelled",
        endDate: new Date(),
      });
    }

    res.json({
      success: true,
      message: "Campaign cancelled successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Cancel Campaign Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel campaign",
      error: error.message,
    });
  }
};

/**
 * Get campaign analytics
 */
const getCampaignAnalytics = async (req, res) => {
  try {
    const { campaignId } = req.params;
    // Handle both populated and non-populated orgId
    const organizationId = req.user.orgId?._id || req.user.orgId || null;

    const query = { _id: campaignId };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const campaign = await Campaign.findOne(query);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Calculate analytics
    const analytics = {
      // Overall stats
      totalTargets: campaign.targetUsers.length,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      
      // Email analytics (report rate omitted for combined campaign analytics)
      email: {
        enabled: campaign.emailConfig.enabled,
        totalTargets: campaign.stats.totalEmailTargets,
        totalSent: campaign.stats.totalEmailSent,
        totalOpened: campaign.stats.totalEmailOpened,
        totalClicked: campaign.stats.totalEmailClicked,
        totalReported: campaign.stats.totalEmailReported,
        totalFailed: campaign.stats.totalEmailFailed,
        openRate: campaign.stats.totalEmailSent > 0
          ? ((campaign.stats.totalEmailOpened / campaign.stats.totalEmailSent) * 100).toFixed(2)
          : 0,
        clickRate: campaign.stats.totalEmailSent > 0
          ? ((campaign.stats.totalEmailClicked / campaign.stats.totalEmailSent) * 100).toFixed(2)
          : 0,
      },
      
      // WhatsApp analytics (report rate omitted for combined campaign analytics)
      whatsapp: {
        enabled: campaign.whatsappConfig.enabled,
        totalTargets: campaign.stats.totalWhatsappTargets,
        totalSent: campaign.stats.totalWhatsappSent,
        totalDelivered: campaign.stats.totalWhatsappDelivered,
        totalRead: campaign.stats.totalWhatsappRead,
        totalClicked: campaign.stats.totalWhatsappClicked,
        totalReported: campaign.stats.totalWhatsappReported,
        totalFailed: campaign.stats.totalWhatsappFailed,
        deliveryRate: campaign.stats.totalWhatsappSent > 0
          ? ((campaign.stats.totalWhatsappDelivered / campaign.stats.totalWhatsappSent) * 100).toFixed(2)
          : 0,
        readRate: campaign.stats.totalWhatsappSent > 0
          ? ((campaign.stats.totalWhatsappRead / campaign.stats.totalWhatsappSent) * 100).toFixed(2)
          : 0,
        clickRate: campaign.stats.totalWhatsappSent > 0
          ? ((campaign.stats.totalWhatsappClicked / campaign.stats.totalWhatsappSent) * 100).toFixed(2)
          : 0,
      },
    };

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Get Campaign Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};

/**
 * Execute campaign - send messages via WhatsApp and/or Email
 */
const executeCampaign = async (campaign) => {
  try {
    console.log(`Executing campaign: ${campaign.name}`);
    
    // Execute WhatsApp Campaign if enabled
    if (campaign.whatsappConfig.enabled && campaign.whatsappCampaignId) {
      const whatsappCampaign = await WhatsAppCampaign.findById(campaign.whatsappCampaignId);
      if (whatsappCampaign) {
        console.log(`Starting WhatsApp sub-campaign for: ${campaign.name}`);
        whatsappCampaign.status = "running";
        whatsappCampaign.startDate = new Date();
        await whatsappCampaign.save();
        
        // Execute WhatsApp campaign
        await executeWhatsAppCampaign(whatsappCampaign, campaign);
      }
    }

    // Execute Email Campaign if enabled
    if (campaign.emailConfig.enabled) {
      console.log(`Starting Email sub-campaign for: ${campaign.name}`);
      await executeEmailCampaign(campaign);
    }

    // Mark campaign as completed
    campaign.status = "completed";
    campaign.endDate = new Date();
    await campaign.save();
    
    console.log(`Campaign ${campaign.name} completed successfully`);
  } catch (error) {
    console.error("Campaign Execution Error:", error);
    campaign.status = "cancelled";
    await campaign.save();
  }
};

/**
 * Execute WhatsApp sub-campaign
 */
const executeWhatsAppCampaign = async (whatsappCampaign, parentCampaign) => {
  try {
    console.log(`Executing WhatsApp sub-campaign ${whatsappCampaign._id}, current status: ${whatsappCampaign.status}`);
    
    // Skip if already completed
    if (whatsappCampaign.status === "completed") {
      console.log(`WhatsAppCampaign ${whatsappCampaign._id} already completed, skipping...`);
      return;
    }
    
    // Mark as running to prevent duplicate execution
    whatsappCampaign.status = "running";
    whatsappCampaign.startDate = new Date();
    whatsappCampaign.scheduleDate = null; // Clear any schedule
    whatsappCampaign.managedByParentCampaign = true; // Ensure flag is set
    await whatsappCampaign.save();
    
    const pendingTargets = whatsappCampaign.targetUsers.filter(
      (target) => target.status === "pending"
    );

    const messageTemplate = whatsappCampaign.messageTemplate;
    const landingPageUrl = (whatsappCampaign.landingPageUrl || "").trim();
    const trackingEnabled = whatsappCampaign.trackingEnabled !== false && landingPageUrl;
    console.log("[Combined Campaign WhatsApp] Executing for parent:", parentCampaign.name, "| targets:", pendingTargets.length, "| trackingEnabled:", trackingEnabled, "| landingPageUrl:", landingPageUrl ? landingPageUrl.substring(0, 60) + "..." : "(empty)");

    for (const target of pendingTargets) {
      try {
        if (!twilioService.isValidPhoneNumber(target.phoneNumber)) {
          target.status = "failed";
          target.failureReason = "Invalid phone number";
          whatsappCampaign.stats.totalFailed += 1;
          const parentTarget = parentCampaign.targetUsers.find((t) => t.phoneNumber === target.phoneNumber);
          if (parentTarget) {
            parentTarget.whatsappStatus = "failed";
            parentTarget.whatsappFailureReason = "Invalid phone number";
            parentCampaign.stats.totalWhatsappFailed += 1;
          }
          console.log("[Combined Campaign WhatsApp] Target invalid phone:", target.phoneNumber);
        } else {
          let messageToSend = messageTemplate;
          let clickToken = null;
          if (trackingEnabled) {
            clickToken = crypto.randomBytes(24).toString("hex");
            const trackingUrl = addTrackingParam(landingPageUrl, clickToken);
            messageToSend = injectTrackingLink(messageTemplate, landingPageUrl, trackingUrl);
            const wasReplaced = messageToSend !== messageTemplate;
            console.log("[Combined Campaign WhatsApp] Click tracking for", target.phoneNumber, "| token:", clickToken.substring(0, 8) + "...", "| linkReplaced:", wasReplaced);
          } else {
            console.log("[Combined Campaign WhatsApp] No tracking (missing landingPageUrl or tracking disabled) for", target.phoneNumber);
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
            whatsappCampaign.stats.totalSent += 1;

            const parentTarget = parentCampaign.targetUsers.find((t) => t.phoneNumber === target.phoneNumber);
            if (parentTarget) {
              parentTarget.whatsappStatus = "sent";
              parentTarget.whatsappSentAt = new Date();
              parentCampaign.stats.totalWhatsappSent += 1;
            }
            console.log("[Combined Campaign WhatsApp] Sent to", target.phoneNumber, "| messageSid:", target.messageSid ? target.messageSid.substring(0, 12) + "..." : "(none)", "| clickToken:", clickToken ? "yes" : "no");
          } else {
            target.status = "failed";
            target.failureReason = result.error;
            whatsappCampaign.stats.totalFailed += 1;
            const parentTarget = parentCampaign.targetUsers.find((t) => t.phoneNumber === target.phoneNumber);
            if (parentTarget) {
              parentTarget.whatsappStatus = "failed";
              parentTarget.whatsappFailureReason = result.error;
              parentCampaign.stats.totalWhatsappFailed += 1;
            }
            console.log("[Combined Campaign WhatsApp] Send failed for", target.phoneNumber, "| error:", result.error);
          }
        }

        await whatsappCampaign.save();
        await parentCampaign.save();

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("[Combined Campaign WhatsApp] Send exception for", target.phoneNumber, ":", error.message);
        target.status = "failed";
        target.failureReason = error.message;
        whatsappCampaign.stats.totalFailed += 1;
        await whatsappCampaign.save();
        await parentCampaign.save();
      }
    }
    
    whatsappCampaign.status = "completed";
    whatsappCampaign.endDate = new Date();
    await whatsappCampaign.save();
  } catch (error) {
    console.error("WhatsApp Campaign Execution Error:", error);
    whatsappCampaign.status = "cancelled";
    await whatsappCampaign.save();
  }
};

/**
 * Execute Email sub-campaign
 */
const executeEmailCampaign = async (campaign) => {
  try {
    const pendingTargets = campaign.targetUsers.filter(
      (target) => target.emailStatus === "pending" && target.email
    );

    for (const target of pendingTargets) {
      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(target.email)) {
          target.emailStatus = "failed";
          target.emailFailureReason = "Invalid email address";
          campaign.stats.totalEmailFailed += 1;
          
          // Create failed Email record
          const emailRecord = new Email({
            sentBy: campaign.emailConfig.senderEmail,
            sentTo: target.email,
            subject: campaign.emailConfig.subject,
            bodyContent: campaign.emailConfig.bodyContent,
            status: "failed",
            error: "Invalid email address",
            campaignId: campaign._id,
          });
          await emailRecord.save();
          campaign.emailRecords.push(emailRecord._id);
        } else {
          // Create Email record first so we have an id for the open-tracking pixel
          const emailRecord = new Email({
            sentBy: campaign.emailConfig.senderEmail,
            sentTo: target.email,
            subject: campaign.emailConfig.subject,
            bodyContent: campaign.emailConfig.bodyContent,
            status: "pending",
            campaignId: campaign._id,
          });
          await emailRecord.save();
          campaign.emailRecords.push(emailRecord._id);

          // Format email body and send with tracking pixel (pixel URL includes emailRecord._id)
          const emailHtml = formatEmailForSending(campaign.emailConfig.bodyContent);
          const result = await nodemailerService.sendEmail({
            to: target.email,
            from: campaign.emailConfig.senderEmail,
            subject: campaign.emailConfig.subject,
            html: emailHtml,
            trackingEmailId: emailRecord._id,
          });

          // Update Email record with send result
          emailRecord.messageId = result.success ? result.messageId : null;
          emailRecord.status = result.success ? "sent" : "failed";
          emailRecord.error = result.success ? null : result.error;
          await emailRecord.save();

          if (result.success) {
            target.emailStatus = "sent";
            target.emailSentAt = new Date();
            campaign.stats.totalEmailSent += 1;
          } else {
            target.emailStatus = "failed";
            target.emailFailureReason = result.error;
            campaign.stats.totalEmailFailed += 1;
          }
        }
        
        await campaign.save();
        
        // Delay between messages
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Email send failed for ${target.email}:`, error);
        target.emailStatus = "failed";
        target.emailFailureReason = error.message;
        campaign.stats.totalEmailFailed += 1;
        
        // Create failed Email record
        try {
          const emailRecord = new Email({
            sentBy: campaign.emailConfig.senderEmail,
            sentTo: target.email,
            subject: campaign.emailConfig.subject,
            bodyContent: campaign.emailConfig.bodyContent,
            status: "failed",
            error: error.message,
            campaignId: campaign._id,
          });
          await emailRecord.save();
          campaign.emailRecords.push(emailRecord._id);
          await campaign.save();
        } catch (recordError) {
          console.error("Failed to create Email record:", recordError);
        }
      }
    }
  } catch (error) {
    console.error("Email Campaign Execution Error:", error);
  }
};

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignAnalytics,
};

