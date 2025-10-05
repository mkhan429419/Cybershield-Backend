const express = require('express');
const { requireAuth, getUserData, requireOrgAccess, requireRole } = require('../middleware/auth');
const { 
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMemberToGroup,
  removeMemberFromGroup
} = require('../controllers/groupController');

const router = express.Router();

// Apply authentication middleware to all group routes
router.use(requireAuth);
router.use(getUserData);

// Middleware to ensure only client admins can access group functionality
const requireClientAdmin = requireRole(['client_admin']);

// POST /api/orgs/:orgId/groups - Create a new group
router.post('/:orgId/groups', requireOrgAccess, requireClientAdmin, createGroup);

// GET /api/orgs/:orgId/groups - Get all groups for an organization
router.get('/:orgId/groups', requireOrgAccess, requireClientAdmin, getGroups);

// GET /api/orgs/:orgId/groups/:groupId - Get a specific group with members
router.get('/:orgId/groups/:groupId', requireOrgAccess, requireClientAdmin, getGroupById);

// PUT /api/orgs/:orgId/groups/:groupId - Update a group
router.put('/:orgId/groups/:groupId', requireOrgAccess, requireClientAdmin, updateGroup);

// DELETE /api/orgs/:orgId/groups/:groupId - Delete a group
router.delete('/:orgId/groups/:groupId', requireOrgAccess, requireClientAdmin, deleteGroup);

// POST /api/orgs/:orgId/groups/:groupId/members - Add a member to a group
router.post('/:orgId/groups/:groupId/members', requireOrgAccess, requireClientAdmin, addMemberToGroup);

// DELETE /api/orgs/:orgId/groups/:groupId/members/:userId - Remove a member from a group
router.delete('/:orgId/groups/:groupId/members/:userId', requireOrgAccess, requireClientAdmin, removeMemberFromGroup);

module.exports = router;
