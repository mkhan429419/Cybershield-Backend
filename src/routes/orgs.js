const express = require('express');
const multer = require('multer');
const { requireAuth, getUserData, requireOrgAccess } = require('../middleware/auth');
const { 
  bulkInviteUsers, 
  inviteSingleUser, 
  getInviteStatus, 
  getOrgUsers 
} = require('../controllers/orgController');

const router = express.Router();

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Apply authentication middleware to all org routes
router.use(requireAuth);
router.use(getUserData);

// POST /api/orgs/:orgId/bulk-invite
router.post('/:orgId/bulk-invite', requireOrgAccess, upload.single('csvFile'), bulkInviteUsers);

// POST /api/orgs/:orgId/invite
router.post('/:orgId/invite', requireOrgAccess, inviteSingleUser);

// GET /api/orgs/:orgId/invites
router.get('/:orgId/invites', requireOrgAccess, getInviteStatus);

// GET /api/orgs/:orgId/users
router.get('/:orgId/users', requireOrgAccess, getOrgUsers);

module.exports = router;
