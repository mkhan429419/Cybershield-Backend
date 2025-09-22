const express = require('express');
const { requireAuth, getUserData } = require('../middleware/auth');
const { getUserProfile } = require('../controllers/userController');

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(requireAuth);
router.use(getUserData);

// GET /api/users/me
router.get('/me', getUserProfile);

module.exports = router;
