const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');

// Clerk authentication middleware
const requireAuth = ClerkExpressRequireAuth();

// Custom middleware to get user data from database
const getUserData = async (req, res, next) => {
  try {
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let user = await User.findOne({ clerkId: req.auth.userId }).populate('orgId');
    
    // If user doesn't exist in our database, create them automatically
    if (!user) {
      user = await createUserFromClerk(req.auth.userId);
    }

    if (!user) {
      return res.status(404).json({ error: 'Unable to create or find user' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to create user from Clerk data
const createUserFromClerk = async (clerkId) => {
  try {
    const { clerkClient } = require('@clerk/clerk-sdk-node');
    
    // Get user data from Clerk
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const primaryEmail = clerkUser.emailAddresses.find(
      email => email.id === clerkUser.primaryEmailAddressId
    );
    
    const email = primaryEmail?.emailAddress;
    const displayName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 
                       email?.split('@')[0] || 'User';

    // Check if there's an existing invited user with this email
    let user = await User.findOne({ email, status: 'invited' });
    
    if (user) {
      // Link the invited user with Clerk ID
      user.clerkId = clerkId;
      user.displayName = displayName;
      user.status = 'active';
      await user.save();
      console.log('Linked invited user with Clerk ID:', user._id);
      return await User.findById(user._id).populate('orgId');
    } else {
      // Create new non-affiliated user
      user = new User({
        clerkId,
        email,
        displayName,
        role: clerkUser.publicMetadata?.role || 'non_affiliated',
        orgId: clerkUser.publicMetadata?.orgId || null,
        status: 'active'
      });
      await user.save();
      console.log('Created new user from Clerk data:', user._id);
      return await User.findById(user._id).populate('orgId');
    }
  } catch (error) {
    console.error('Error creating user from Clerk:', error);
    return null;
  }
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Organization-specific authorization
const requireOrgAccess = (req, res, next) => {
  const { orgId } = req.params;
  
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  // System admins can access any organization
  if (req.user.role === 'system_admin') {
    return next();
  }

  // Client admins can only access their own organization
  if (req.user.role === 'client_admin') {
    // Handle both populated and non-populated orgId
    const userOrgId = req.user.orgId?._id?.toString() || req.user.orgId?.toString();
    
    if (!userOrgId || userOrgId !== orgId) {
      console.log('Access denied - User orgId:', userOrgId, 'Requested orgId:', orgId);
      return res.status(403).json({ error: 'Access denied to this organization' });
    }
    return next();
  }

  // Other roles don't have org-level access
  return res.status(403).json({ error: 'Insufficient permissions' });
};

module.exports = {
  requireAuth,
  getUserData,
  requireRole,
  requireOrgAccess
};
