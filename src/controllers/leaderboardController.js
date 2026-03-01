const User = require('../models/User');

/**
 * GET /api/leaderboard/global
 * Get global leaderboard (non-affiliated users only)
 * Accessible by: all authenticated users
 */
const getGlobalLeaderboard = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get all non-affiliated users, sorted by learning score
    const users = await User.find({ role: 'non_affiliated' })
      .select('_id email displayName learningScore')
      .sort({ learningScore: -1 })
      .lean();

    const leaderboard = users.map((user, index) => ({
      _id: user._id,
      position: index + 1,
      name: user.displayName || user.email,
      email: user.email,
      learningScore: user.learningScore || 0,
    }));

    res.json({
      success: true,
      leaderboard,
      total: leaderboard.length,
    });
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch global leaderboard' });
  }
};

/**
 * GET /api/leaderboard/organization
 * Get organization leaderboard (for affiliated users and client admins)
 * Accessible by: affiliated users (their own org), client_admin (their own org), system_admin (any org via query param)
 */
const getOrganizationLeaderboard = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Determine which organization to query
    let orgId = null;
    
    if (user.role === 'system_admin') {
      // System admins can specify orgId via query param
      orgId = req.query.orgId || null;
      if (!orgId) {
        return res.status(400).json({ success: false, error: 'orgId query parameter required for system admin' });
      }
    } else if (user.role === 'client_admin' || user.role === 'affiliated') {
      // Client admins and affiliated users can only see their own organization
      const userOrgId = user.orgId?._id?.toString() || user.orgId?.toString();
      if (!userOrgId) {
        return res.status(403).json({ success: false, error: 'User does not belong to an organization' });
      }
      orgId = userOrgId;
    } else {
      // Non-affiliated users don't have organizations
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    // Get all users in the organization (excluding system_admin)
    // Include affiliated users and client_admin (they belong to the org)
    const users = await User.find({ 
      orgId,
      role: { $in: ['affiliated', 'client_admin'] }
    })
      .select('_id email displayName learningScore role')
      .sort({ learningScore: -1 })
      .lean();

    const leaderboard = users.map((user, index) => ({
      _id: user._id,
      position: index + 1,
      name: user.displayName || user.email,
      email: user.email,
      learningScore: user.learningScore || 0,
      role: user.role,
    }));

    res.json({
      success: true,
      leaderboard,
      total: leaderboard.length,
      orgId,
    });
  } catch (error) {
    console.error('Error fetching organization leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch organization leaderboard' });
  }
};

module.exports = {
  getGlobalLeaderboard,
  getOrganizationLeaderboard,
};
