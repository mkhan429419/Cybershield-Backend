const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');

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

module.exports = {
  getUserProfile
};
