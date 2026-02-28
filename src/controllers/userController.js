const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const { transformBadgesFromLabels } = require('../utils/badgeMapping');
const { isEligibleForEmailRiskScoring, computeEmailRiskScore } = require('../services/emailRiskScoreService');

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
    
    // Email risk score: compounded from EmailRiskEvents only for affiliated / non_affiliated (decay applied).
    let emailRiskScore = 0;
    if (isEligibleForEmailRiskScoring(user.role)) {
      emailRiskScore = await computeEmailRiskScore(user._id);
    } else {
      emailRiskScore = user.emailRiskScore != null ? user.emailRiskScore : 0;
    }

    // Merge local and Clerk data
    const profile = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      orgId: user.orgId?._id?.toString() || user.orgId?.toString() || null, // Ensure it's a string ID
      orgName: user.orgId?.name || null,
      groupIds: user.groupIds,
      status: user.status,
      points: user.points,
      riskScore: user.riskScore,
      emailRiskScore,
      badges: transformedBadges,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Additional Clerk data if available
      profileImageUrl: clerkUser?.profileImageUrl || null,
      firstName: clerkUser?.firstName || null,
      lastName: clerkUser?.lastName || null,
      lastSignInAt: clerkUser?.lastSignInAt || null
    };

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
      .select('_id email displayName role status')
      .sort({ email: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(user => ({
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status
      })),
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

module.exports = {
  getUserProfile,
  getAllUsers
};
