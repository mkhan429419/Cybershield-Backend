const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const Group = require('../models/Group');
const csv = require('csv-parser');
const { Readable } = require('stream');

// POST /api/orgs/:orgId/bulk-invite
const bulkInviteUsers = async (req, res) => {
  try {
    const { orgId } = req.params;
    let users = [];

    // Get organization details for the invitation
    const Organization = require('../models/Organization');
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Handle CSV file upload or JSON array
    if (req.file) {
      // Parse CSV file
      users = await parseCSV(req.file.buffer);
    } else if (req.body.users) {
      // JSON array
      users = req.body.users;
    } else {
      return res.status(400).json({ error: 'No users data provided' });
    }

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Invalid users data' });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const userData of users) {
      try {
        const { email, displayName, group } = userData;

        if (!email) {
          results.failed.push({ email: 'N/A', error: 'Email is required' });
          continue;
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          results.failed.push({ email, error: 'User already exists' });
          continue;
        }

        // Find or create group if specified
        let groupId = null;
        if (group) {
          let groupDoc = await Group.findOne({ orgId, name: group });
          if (!groupDoc) {
            groupDoc = new Group({
              orgId,
              name: group,
              memberCount: 0
            });
            await groupDoc.save();
          }
          groupId = groupDoc._id;
        }

        // Try to create invitation via Clerk
        let invitation = null;
        try {
          const invitationData = {
            emailAddress: email,
            publicMetadata: {
              role: 'affiliated',
              roleName: 'Member',
              orgId: orgId,
              organizationName: organization.name
            },
            redirectUrl: process.env.FRONTEND_URL + '/sign-up'
          };
          
          console.log('Creating Clerk invitation with data:', JSON.stringify(invitationData, null, 2));
          
          invitation = await clerkClient.invitations.createInvitation(invitationData);
        } catch (clerkError) {
          if (clerkError.errors && clerkError.errors[0]?.code === 'form_identifier_exists') {
            // User already exists in Clerk, try to link them
            try {
              const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
              if (clerkUsers.length > 0) {
                const clerkUser = clerkUsers[0];
                
                // Create user record directly and link with existing Clerk account
                const user = new User({
                  clerkId: clerkUser.id,
                  email,
                  displayName: displayName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email.split('@')[0],
                  role: 'affiliated',
                  orgId,
                  groupIds: groupId ? [groupId] : [],
                  status: 'active' // Since they already have a Clerk account
                });
                await user.save();

                // Update group member count
                if (groupId) {
                  await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: 1 } });
                }

                results.successful.push({
                  email,
                  userId: user._id,
                  inviteId: 'existing_clerk_user',
                  group: group || null,
                  note: 'Linked existing Clerk account'
                });
                continue;
              }
            } catch (getUserError) {
              console.error(`Error linking existing Clerk user ${email}:`, getUserError);
            }
            
            results.failed.push({
              email,
              error: 'Email already has a Clerk account but could not be linked'
            });
            continue;
          } else {
            throw clerkError; // Re-throw if it's a different error
          }
        }

        // Create user record (only if Clerk invitation was successful)
        if (invitation) {
          const user = new User({
            clerkId: null, // Will be filled when user accepts invitation
            email,
            displayName: displayName || email.split('@')[0],
            role: 'affiliated',
            orgId,
            groupIds: groupId ? [groupId] : [],
            status: 'invited'
          });
          await user.save();

          // Update group member count
          if (groupId) {
            await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: 1 } });
          }

          results.successful.push({
            email,
            userId: user._id,
            inviteId: invitation.id,
            group: group || null
          });
        }
      } catch (error) {
        console.error(`Error inviting user ${userData.email}:`, error);
        results.failed.push({
          email: userData.email,
          error: error.message
        });
      }
    }

    res.status(201).json({
      message: `Processed ${users.length} invitations`,
      successful: results.successful.length,
      failed: results.failed.length,
      results
    });
  } catch (error) {
    console.error('Error in bulk invite:', error);
    res.status(500).json({ error: 'Bulk invitation failed' });
  }
};

// POST /api/orgs/:orgId/invite
const inviteSingleUser = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { email, displayName, group } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get organization details for the invitation
    const Organization = require('../models/Organization');
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Find or create group if specified
    let groupId = null;
    if (group) {
      let groupDoc = await Group.findOne({ orgId, name: group });
      if (!groupDoc) {
        groupDoc = new Group({
          orgId,
          name: group,
          memberCount: 0
        });
        await groupDoc.save();
      }
      groupId = groupDoc._id;
    }

    // Try to create invitation via Clerk
    let invitation = null;
    let existingClerkUser = false;
    
    try {
      const invitationData = {
        emailAddress: email,
        publicMetadata: {
          role: 'affiliated',
          roleName: 'Member',
          orgId: orgId,
          organizationName: organization.name
        },
        redirectUrl: process.env.FRONTEND_URL + '/sign-up'
      };
      
      console.log('Creating Clerk invitation with data:', JSON.stringify(invitationData, null, 2));
      
      invitation = await clerkClient.invitations.createInvitation(invitationData);
    } catch (clerkError) {
      if (clerkError.errors && clerkError.errors[0]?.code === 'form_identifier_exists') {
        // User already exists in Clerk, try to link them
        try {
          const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
          if (clerkUsers.length > 0) {
            const clerkUser = clerkUsers[0];
            
            // Create user record directly and link with existing Clerk account
            const user = new User({
              clerkId: clerkUser.id,
              email,
              displayName: displayName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email.split('@')[0],
              role: 'affiliated',
              orgId,
              groupIds: groupId ? [groupId] : [],
              status: 'active' // Since they already have a Clerk account
            });
            await user.save();

            // Update group member count
            if (groupId) {
              await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: 1 } });
            }

            return res.status(201).json({
              message: 'User already had a Clerk account and has been added successfully',
              userId: user._id,
              inviteId: 'existing_clerk_user',
              group: group || null,
              existingClerkUser: true
            });
          }
        } catch (getUserError) {
          console.error('Error linking existing Clerk user:', getUserError);
        }
        
        return res.status(400).json({ 
          error: 'This email already has a Clerk account. Please ask them to sign in, or use a different email address.' 
        });
      } else {
        throw clerkError; // Re-throw if it's a different error
      }
    }

    // Create user record (only if Clerk invitation was successful)
    if (invitation) {
      const user = new User({
        clerkId: null, // Will be filled when user accepts invitation
        email,
        displayName: displayName || email.split('@')[0],
        role: 'affiliated',
        orgId,
        groupIds: groupId ? [groupId] : [],
        status: 'invited'
      });
      await user.save();

      // Update group member count
      if (groupId) {
        await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: 1 } });
      }

      res.status(201).json({
        message: 'Invitation sent successfully',
        userId: user._id,
        inviteId: invitation.id,
        group: group || null
      });
    }
  } catch (error) {
    console.error('Error inviting user:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

// GET /api/orgs/:orgId/invites
const getInviteStatus = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 50, status, group } = req.query;

    const query = { orgId };
    if (status) query.status = status;
    if (group) {
      const groupDoc = await Group.findOne({ orgId, name: group });
      if (groupDoc) {
        query.groupIds = groupDoc._id;
      }
    }

    const users = await User.find(query)
      .populate('groupIds', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(user => ({
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        groups: user.groupIds.map(g => g.name),
        createdAt: user.createdAt
      })),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching invites:', error);
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
};

// GET /api/orgs/:orgId/users
const getOrgUsers = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 50, role, status, group } = req.query;

    const query = { orgId };
    if (role) query.role = role;
    if (status) query.status = status;
    if (group) {
      const groupDoc = await Group.findOne({ orgId, name: group });
      if (groupDoc) {
        query.groupIds = groupDoc._id;
      }
    }

    const users = await User.find(query)
      .populate('groupIds', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(user => ({
        _id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        groups: user.groupIds.map(g => g.name),
        points: user.points,
        riskScore: user.riskScore,
        createdAt: user.createdAt
      })),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching org users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Helper function to parse CSV
const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

module.exports = {
  bulkInviteUsers,
  inviteSingleUser,
  getInviteStatus,
  getOrgUsers
};
