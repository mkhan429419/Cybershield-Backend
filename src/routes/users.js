const express = require('express');
const { requireAuth, getUserData } = require('../middleware/auth');
const { getUserProfile, getAllUsers } = require('../controllers/userController');

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(requireAuth);
router.use(getUserData);

// GET /api/users/me
router.get('/me', getUserProfile);

// GET /api/users/all - Get all users
router.get('/all', getAllUsers);

module.exports = router;
