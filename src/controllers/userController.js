const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const { transformBadgesFromLabels } = require('../utils/badgeMapping');
const { isEligibleForEmailRiskScoring, computeEmailRiskScore } = require('../services/emailRiskScoreService');
const { isEligibleForWhatsAppRiskScoring, computeWhatsAppRiskScore } = require('../services/whatsappRiskScoreService');
const { isEligibleForLmsRiskScoring, computeLmsRiskScore } = require('../services/lmsRiskScoreService');
const { getRemedialAssignmentsForUser, ensureRemedialAssignments } = require('../services/remedialAssignmentService');
const { updateUserCombinedLearningScore, computeCombinedLearningScore } = require('../services/combinedLearningScoreService');

// GET /api/users/me
const getUserProfile = async (req, res) => {
  try {
    const user = req.user; // Set by getUserData middleware

    // Get additional Clerk data
    let clerkUser = null;
    try {
      clerkUser = await clerkClient.users.getUser(user.clerkId);
    } catch (error) {
      console.error('Error fetching Clerk user data:', error);
    }

    // Ensure user.badges is properly loaded (in case it's not populated)
    const userBadges = Array.isArray(user.badges) ? user.badges : [];
    
    // Transform badges from labels (or IDs) to objects with labels
    // Handles both cases: badges stored as labels or as IDs
    let transformedBadges = [];
    try {
      transformedBadges = transformBadgesFromLabels(userBadges);
    } catch (badgeError) {
      console.error('Error transforming badges:', badgeError);
      // Fallback to empty array if transformation fails
      transformedBadges = [];
    }
    
    // Learning scores (0–1, higher = better). Email/WhatsApp: no events = 1; with events = 1 - risk (decreases on open/click/credentials).
    let emailScore = 0;
    if (isEligibleForEmailRiskScoring(user.role)) {
      const rawRisk = await computeEmailRiskScore(user._id);
      emailScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
    } else {
      emailScore = user.learningScoreEmail != null ? user.learningScoreEmail : 0;
    }

    let whatsappScore = 0;
    if (isEligibleForWhatsAppRiskScoring(user.role)) {
      const rawRisk = await computeWhatsAppRiskScore(user._id);
      whatsappScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
    } else {
      whatsappScore = user.learningScoreWhatsapp != null ? user.learningScoreWhatsapp : 0;
    }

    let lmsScore = 0;
    if (isEligibleForLmsRiskScoring(user.role)) {
      lmsScore = await computeLmsRiskScore(user._id);
    } else {
      lmsScore = user.learningScoreLms != null ? user.learningScoreLms : 0;
    }

    const voiceScore = user.learningScoreVoice != null ? user.learningScoreVoice : 0;
    const incidentScore = user.learningScoreIncident != null ? user.learningScoreIncident : 0;
    const learningScores = {
      email: Math.round(emailScore * 100) / 100,
      whatsapp: Math.round(whatsappScore * 100) / 100,
      lms: Math.round(lmsScore * 100) / 100,
      voice: Math.round((voiceScore ?? 0) * 100) / 100,
      incident: Math.round((incidentScore ?? 0) * 100) / 100
    };

    // Merge local and Clerk data
    const profile = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber != null ? user.phoneNumber : null,
      role: user.role,
      orgId: user.orgId?._id?.toString() || user.orgId?.toString() || null, // Ensure it's a string ID
      orgName: user.orgId?.name || null,
      groupIds: user.groupIds,
      status: user.status,
      learningScore: user.learningScore,
      learningScores,
      badges: transformedBadges,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Additional Clerk data if available
      profileImageUrl: clerkUser?.profileImageUrl || null,
      firstName: clerkUser?.firstName || null,
      lastName: clerkUser?.lastName || null,
      lastSignInAt: clerkUser?.lastSignInAt || null
    };

    // Include remedial assignments (courses assigned due to low/mid learning scores)
    try {
      if (user.role === 'affiliated' || user.role === 'non_affiliated') {
        // Persist current computed scores to User so remedial logic sees the same scores as profile
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              learningScoreEmail: emailScore,
              learningScoreWhatsapp: whatsappScore,
              learningScoreLms: lmsScore,
              learningScoreVoice: voiceScore,
              learningScoreIncident: incidentScore,
            },
          }
        );
        await updateUserCombinedLearningScore(user._id, {
          email: emailScore,
          whatsapp: whatsappScore,
          lms: lmsScore,
          voice: voiceScore,
          incident: incidentScore,
        });
        await ensureRemedialAssignments(user._id);
        profile.learningScore = computeCombinedLearningScore({
          email: emailScore,
          whatsapp: whatsappScore,
          lms: lmsScore,
          voice: voiceScore,
          incident: incidentScore,
        });
      }
      const remedialAssignments = await getRemedialAssignmentsForUser(user._id);
      profile.remedialAssignments = remedialAssignments;
    } catch (remedialErr) {
      console.error('Error fetching remedial assignments:', remedialErr);
      profile.remedialAssignments = [];
    }

    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// GET /api/users/all - Get all users (for email campaigns, etc.)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 1000, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const users = await User.find(query)
      .select('_id email displayName role status learningScore learningScoreEmail learningScoreWhatsapp learningScoreLms learningScoreVoice learningScoreIncident badges')
      .sort({ email: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // For system admin dashboard, we need to compute learningScores similar to getOrgUsers
    const { isEligibleForEmailRiskScoring, computeEmailRiskScore } = require('../services/emailRiskScoreService');
    const { isEligibleForWhatsAppRiskScoring, computeWhatsAppRiskScore } = require('../services/whatsappRiskScoreService');

    const usersWithScores = await Promise.all(users.map(async (user) => {
      let emailScore = user.learningScoreEmail != null ? user.learningScoreEmail : 0;
      let whatsappScore = user.learningScoreWhatsapp != null ? user.learningScoreWhatsapp : 0;
      if (isEligibleForEmailRiskScoring(user.role)) {
        const rawRisk = await computeEmailRiskScore(user._id);
        emailScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
      }
      if (isEligibleForWhatsAppRiskScoring(user.role)) {
        const rawRisk = await computeWhatsAppRiskScore(user._id);
        whatsappScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
      }
      return {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        learningScore: user.learningScore || 0,
        learningScores: {
          email: Math.round(emailScore * 100) / 100,
          whatsapp: Math.round(whatsappScore * 100) / 100,
          lms: user.learningScoreLms != null ? user.learningScoreLms : 0,
          voice: user.learningScoreVoice != null ? user.learningScoreVoice : 0,
          incident: user.learningScoreIncident != null ? user.learningScoreIncident : 0
        },
        badges: Array.isArray(user.badges) ? user.badges : []
      };
    }));

    res.json({
      users: usersWithScores,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// PATCH /api/users/me - update current user profile (e.g. phone number for WhatsApp campaigns)
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { phoneNumber } = req.body || {};
    const updates = {};
    if (typeof phoneNumber === "string") {
      updates.phoneNumber = phoneNumber.trim() || null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update (e.g. phoneNumber)." });
    }
    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select("_id email displayName phoneNumber role")
      .lean();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
};

// GET /api/users/me/remedial-assignments - get current user's remedial course assignments
const getMyRemedialAssignments = async (req, res) => {
  try {
    const userId = req.user._id;
    const assignments = await getRemedialAssignmentsForUser(userId);
    res.json({ success: true, remedialAssignments: assignments });
  } catch (error) {
    console.error('Error fetching remedial assignments:', error);
    res.status(500).json({ error: 'Failed to fetch remedial assignments' });
  }
};

module.exports = {
  getUserProfile,
  getAllUsers,
  updateProfile,
  getMyRemedialAssignments
};
