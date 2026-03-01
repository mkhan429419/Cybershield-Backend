const express = require('express');
const router = express.Router();
const { requireAuth, getUserData } = require('../middleware/auth');
const {
  getGlobalLeaderboard,
  getOrganizationLeaderboard,
} = require('../controllers/leaderboardController');

// Apply authentication middleware to all leaderboard routes
router.use(requireAuth);
router.use(getUserData);

// GET /api/leaderboard/global
router.get('/global', getGlobalLeaderboard);

// GET /api/leaderboard/organization
router.get('/organization', getOrganizationLeaderboard);

module.exports = router;
