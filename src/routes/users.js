const express = require('express');
const { requireAuth, getUserData } = require('../middleware/auth');
const { getUserProfile, getAllUsers, updateProfile } = require('../controllers/userController');

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(requireAuth);
router.use(getUserData);

// GET /api/users/me
router.get('/me', getUserProfile);
// PATCH /api/users/me - update profile (e.g. phoneNumber)
router.patch('/me', updateProfile);

// GET /api/users/all - Get all users
router.get('/all', getAllUsers);

module.exports = router;
