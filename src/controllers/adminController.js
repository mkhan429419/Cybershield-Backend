const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const Organization = require('../models/Organization');

// POST /api/admins/invite-client
const inviteClientAdmin = async (req, res) => {
  try {
    const { email, orgName } = req.body;

    if (!email || !orgName) {
      return res.status(400).json({ error: 'Email and organization name are required' });
    }

    // Create or find organization
    let organization = await Organization.findOne({ name: orgName });
    if (!organization) {
      organization = new Organization({
        name: orgName,
        clientAdminIds: []
      });
      await organization.save();
    }

    // Check if user already exists in our database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.role === 'client_admin' && existingUser.orgId?.toString() === organization._id.toString()) {
        return res.status(400).json({ error: 'This user is already a client admin for this organization' });
      }
      return res.status(400).json({ error: 'User with this email already exists in the system' });
    }

    let invitation = null;
    let clerkUserExists = false;

    // Try to create invitation via Clerk
    try {
      const invitationData = {
        emailAddress: email,
        publicMetadata: {
          role: 'client_admin',
          roleName: 'Administrator',
          orgId: organization._id.toString(),
          organizationName: organization.name
        },
        redirectUrl: process.env.FRONTEND_URL + '/sign-up'
      };
      
      console.log('Creating Clerk invitation with data:', JSON.stringify(invitationData, null, 2));
      
      invitation = await clerkClient.invitations.createInvitation(invitationData);
      
      console.log('Clerk invitation created successfully:', {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        publicMetadata: invitation.publicMetadata,
        status: invitation.status
      });
    } catch (clerkError) {
      // Handle different Clerk error cases
      if (clerkError.errors && clerkError.errors[0]) {
        const errorCode = clerkError.errors[0].code;
        
        if (errorCode === 'form_identifier_exists') {
          clerkUserExists = true;
          console.log('User already exists in Clerk, will create database record only');
          
          // Try to get the existing Clerk user
          try {
            const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
            if (clerkUsers.length > 0) {
              const clerkUser = clerkUsers[0];
              
              // Create user record directly and link with existing Clerk account
              const user = new User({
                clerkId: clerkUser.id,
                email,
                displayName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email.split('@')[0],
                role: 'client_admin',
                orgId: organization._id,
                status: 'active' // Since they already have a Clerk account
              });
              await user.save();

              // Add user to organization's client admin list
              organization.clientAdminIds.push(user._id);
              await organization.save();

              return res.status(201).json({
                ok: true,
                message: 'User already had a Clerk account. They have been added as client admin.',
                orgId: organization._id,
                userId: user._id,
                existingClerkUser: true
              });
            }
          } catch (getUserError) {
            console.error('Error getting existing Clerk user:', getUserError);
          }
          
          return res.status(400).json({ 
            error: 'This email already has a Clerk account. Please ask them to sign in, or use a different email address.' 
          });
        } else if (errorCode === 'duplicate_record') {
          // There's already a pending invitation for this email
          console.log('Duplicate invitation found for email:', email);
          
          // Check if we already have a user record for this email
          const existingInvitedUser = await User.findOne({ email, status: 'invited' });
          if (existingInvitedUser) {
            return res.status(400).json({ 
              error: 'There is already a pending invitation for this email address. Please check if they have received the invitation email.' 
            });
          } else {
            // Create user record even though invitation already exists in Clerk
            const user = new User({
              clerkId: null,
              email,
              displayName: email.split('@')[0],
              role: 'client_admin',
              orgId: organization._id,
              status: 'invited'
            });
            await user.save();

            // Add user to organization's client admin list
            organization.clientAdminIds.push(user._id);
            await organization.save();

            return res.status(201).json({
              ok: true,
              message: 'Invitation already exists in Clerk. User record created in database.',
              orgId: organization._id,
              userId: user._id,
              duplicateInvitation: true
            });
          }
        }
      }
      
      throw clerkError; // Re-throw if it's a different error
    }

    // Create user record with invited status (only if Clerk invitation was successful)
    if (invitation) {
      const user = new User({
        clerkId: null, // Will be filled when user accepts invitation
        email,
        displayName: email.split('@')[0], // Temporary display name
        role: 'client_admin',
        orgId: organization._id,
        status: 'invited'
      });
      await user.save();

      // Add user to organization's client admin list
      organization.clientAdminIds.push(user._id);
      await organization.save();

      res.status(201).json({
        ok: true,
        inviteId: invitation.id,
        orgId: organization._id,
        userId: user._id,
        message: 'Invitation sent successfully'
      });
    }
  } catch (error) {
    console.error('Error inviting client admin:', error);
    
    // Provide more specific error messages
    if (error.clerkError) {
      const clerkErrorMessage = error.errors?.[0]?.message || 'Clerk API error';
      return res.status(400).json({ error: `Invitation failed: ${clerkErrorMessage}` });
    }
    
    res.status(500).json({ error: 'Failed to create invitation' });
  }
};

// GET /api/admins/orgs
const getOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'orgId',
          as: 'users'
        }
      },
      {
        $addFields: {
          totalUsers: { $size: '$users' },
          activeUsers: {
            $size: {
              $filter: {
                input: '$users',
                cond: { $eq: ['$$this.status', 'active'] }
              }
            }
          },
          invitedUsers: {
            $size: {
              $filter: {
                input: '$users',
                cond: { $eq: ['$$this.status', 'invited'] }
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          clientAdminIds: 1,
          totalUsers: 1,
          activeUsers: 1,
          invitedUsers: 1,
          createdAt: 1
        }
      }
    ]);

    res.json({ organizations });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
};

// GET /api/admins/sync-users - Manually sync users from Clerk
const syncUsersFromClerk = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    // Get users from Clerk
    const clerkUsers = await clerkClient.users.getUserList({ limit: parseInt(limit) });
    
    const results = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: []
    };

    for (const clerkUser of clerkUsers) {
      try {
        results.processed++;
        
        const primaryEmail = clerkUser.emailAddresses.find(
          email => email.id === clerkUser.primaryEmailAddressId
        );
        
        const email = primaryEmail?.emailAddress;
        const displayName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 
                           email?.split('@')[0] || 'User';

        // Check if user exists in our database
        let user = await User.findOne({ clerkId: clerkUser.id });
        
        if (user) {
          // Update existing user
          user.email = email;
          user.displayName = displayName;
          await user.save();
          results.updated++;
        } else {
          // Check if there's an invited user with this email
          user = await User.findOne({ email, status: 'invited' });
          
          if (user) {
            // Link invited user
            user.clerkId = clerkUser.id;
            user.displayName = displayName;
            user.status = 'active';
            await user.save();
            results.updated++;
          } else {
            // Create new user
            user = new User({
              clerkId: clerkUser.id,
              email,
              displayName,
              role: clerkUser.publicMetadata?.role || 'non_affiliated',
              orgId: clerkUser.publicMetadata?.orgId || null,
              status: 'active'
            });
            await user.save();
            results.created++;
          }
        }
      } catch (error) {
        results.errors.push({
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress,
          error: error.message
        });
      }
    }

    res.json({
      message: 'User sync completed',
      results
    });
  } catch (error) {
    console.error('Error syncing users from Clerk:', error);
    res.status(500).json({ error: 'Failed to sync users' });
  }
};

// POST /api/admins/activate-user - Manually activate an invited user
const activateUser = async (req, res) => {
  try {
    const { userId, clerkId } = req.body;

    if (!userId || !clerkId) {
      return res.status(400).json({ error: 'userId and clerkId are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user data from Clerk to update local record
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const primaryEmail = clerkUser.emailAddresses.find(
      email => email.id === clerkUser.primaryEmailAddressId
    );
    
    const email = primaryEmail?.emailAddress;
    const displayName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 
                       email?.split('@')[0] || user.displayName;

    user.clerkId = clerkId;
    user.email = email;
    user.displayName = displayName;
    user.status = 'active';
    await user.save();

    res.json({
      message: 'User activated successfully',
      user: {
        _id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
};

// POST /api/admins/create-org - Create a new organization
const createOrganization = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Check if organization already exists
    const existingOrg = await Organization.findOne({ name });
    if (existingOrg) {
      return res.status(400).json({ error: 'Organization with this name already exists' });
    }

    // Create new organization
    const organization = new Organization({
      name: name.trim(),
      description: description?.trim() || '',
      clientAdminIds: []
    });

    await organization.save();

    res.status(201).json({
      message: 'Organization created successfully',
      organization: {
        _id: organization._id,
        name: organization.name,
        description: organization.description,
        createdAt: organization.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
};

// PUT /api/admins/orgs/:orgId - Update organization
const updateOrganization = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Check if another organization with this name exists
    const existingOrg = await Organization.findOne({ 
      name: name.trim(), 
      _id: { $ne: orgId } 
    });
    
    if (existingOrg) {
      return res.status(400).json({ error: 'Organization with this name already exists' });
    }

    const organization = await Organization.findByIdAndUpdate(
      orgId,
      { 
        name: name.trim(),
        description: description?.trim() || ''
      },
      { new: true }
    );

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({
      message: 'Organization updated successfully',
      organization: {
        _id: organization._id,
        name: organization.name,
        description: organization.description,
        updatedAt: organization.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
};

// GET /api/admins/pending-invitations - Get pending invitations from Clerk
const getPendingInvitations = async (req, res) => {
  try {
    const invitations = await clerkClient.invitations.getInvitationList();
    
    res.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        emailAddress: inv.emailAddress,
        status: inv.status,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching pending invitations:', error);
    res.status(500).json({ error: 'Failed to fetch pending invitations' });
  }
};

// DELETE /api/admins/revoke-invitation/:invitationId - Revoke a pending invitation
const revokeInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    
    await clerkClient.invitations.revokeInvitation(invitationId);
    
    res.json({ message: 'Invitation revoked successfully' });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
};

module.exports = {
  inviteClientAdmin,
  getOrganizations,
  syncUsersFromClerk,
  activateUser,
  createOrganization,
  updateOrganization,
  getPendingInvitations,
  revokeInvitation
};
