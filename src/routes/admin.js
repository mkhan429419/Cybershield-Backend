const express = require('express');
const { requireAuth, getUserData, requireRole } = require('../middleware/auth');
const { inviteClientAdmin, getOrganizations, syncUsersFromClerk, activateUser, createOrganization, updateOrganization, getPendingInvitations, revokeInvitation } = require('../controllers/adminController');

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(requireAuth);
router.use(getUserData);
router.use(requireRole(['system_admin']));

// POST /api/admins/invite-client
router.post('/invite-client', inviteClientAdmin);

// GET /api/admins/orgs
router.get('/orgs', getOrganizations);

// GET /api/admins/sync-users
router.get('/sync-users', syncUsersFromClerk);

// POST /api/admins/activate-user
router.post('/activate-user', activateUser);

// POST /api/admins/create-org
router.post('/create-org', createOrganization);

// PUT /api/admins/orgs/:orgId
router.put('/orgs/:orgId', updateOrganization);

// GET /api/admins/pending-invitations
router.get('/pending-invitations', getPendingInvitations);

// DELETE /api/admins/revoke-invitation/:invitationId
router.delete('/revoke-invitation/:invitationId', revokeInvitation);

module.exports = router;
