const WhatsAppCampaign = require("../models/WhatsAppCampaign");
const twilioService = require("../services/twilioService");
const User = require("../models/User");

const startCampaignScheduler = () => {
  setInterval(async () => {
    try {
      const now = new Date();
      const scheduledCampaigns = await WhatsAppCampaign.find({
        status: "scheduled",
        scheduleDate: { $lte: now },
      });

      for (const campaign of scheduledCampaigns) {
        console.log(`Starting scheduled campaign: ${campaign.name}`);
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
startCampaignScheduler();
const createCampaign = async (req, res) => {
  try {
    const {
      name,
      description,
      messageTemplate,
      landingPageUrl,
      targetUserIds,
      manualUsers,
      scheduleDate,
      trackingEnabled = true,
    } = req.body;

    const userId = req.user._id;

    let campaignTargets = [];
    if (manualUsers && manualUsers.length > 0) {
      campaignTargets = manualUsers.map((user) => ({
        phoneNumber: user.phoneNumber,
        name: `${user.firstName} ${user.lastName}`,
        status: "pending",
      }));
    } else if (targetUserIds && targetUserIds.length > 0) {
      // Get target users from database
      const targetUsers = await User.find({
        _id: { $in: targetUserIds },
        orgId: req.user.orgId,
      }).select("_id displayName email");

      if (targetUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No valid target users found. Please select users with valid phone numbers.",
        });
      }
      campaignTargets = targetUsers.map((user) => ({
        userId: user._id,
        phoneNumber: "",
        name: user.displayName,
        status: "pending",
      }));
    }
    if (campaignTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please add at least one target user.",
      });
    }
    const campaign = new WhatsAppCampaign({
      name,
      description,
      organizationId: req.user.orgId,
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
    const organizationId = req.user.orgId;

    const query = { organizationId };
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
    const organizationId = req.user.orgId;

    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      organizationId,
    }).populate("createdBy", "firstName lastName email");

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
    const organizationId = req.user.orgId;

    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      organizationId,
      status: { $in: ["draft", "scheduled"] },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or cannot be started",
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

    for (const target of pendingTargets) {
      try {
        if (!twilioService.isValidPhoneNumber(target.phoneNumber)) {
          target.status = "failed";
          target.failureReason = "Invalid phone number";
          continue;
        }
        const result = await twilioService.sendWhatsAppMessage(
          target.phoneNumber,
          campaign.messageTemplate
        );

        if (result.success) {
          target.status = "sent";
          target.sentAt = new Date();
          campaign.stats.totalSent += 1;
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
    const organizationId = req.user.orgId;
    const updates = req.body;

    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      organizationId,
      status: { $in: ["draft", "scheduled"] },
    });

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
    const organizationId = req.user.orgId;

    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      organizationId,
      status: { $in: ["draft", "scheduled"] },
    });

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
    const organizationId = req.user.orgId;

    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      organizationId,
    });

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
const handleTwilioWebhook = async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, From } = req.body;

    // Find campaign with this message
    const campaign = await WhatsAppCampaign.findOne({
      targetUsers: {
        $elemMatch: {
          phoneNumber: { $regex: To.replace("whatsapp:", "") },
          status: "sent",
        },
      },
    });

    if (campaign) {
      const target = campaign.targetUsers.find((t) =>
        t.phoneNumber.includes(To.replace("whatsapp:", ""))
      );

      if (target) {
        switch (MessageStatus) {
          case "delivered":
            target.status = "delivered";
            target.deliveredAt = new Date();
            campaign.stats.totalDelivered += 1;
            break;
          case "read":
            target.status = "read";
            target.readAt = new Date();
            campaign.stats.totalRead += 1;
            break;
          case "failed":
            target.status = "failed";
            target.failureReason = req.body.ErrorMessage;
            campaign.stats.totalFailed += 1;
            break;
        }

        await campaign.save();
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).send("Error");
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
};
