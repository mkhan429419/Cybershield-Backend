const express = require('express');
const { requireAuth, getUserData } = require('../middleware/auth');
const { getUserProfile, getLearningProgress, getCoursesProgress, getUserActivity, getAllUsers, updateProfile, getMyRemedialAssignments } = require('../controllers/userController');

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(requireAuth);
router.use(getUserData);

// GET /api/users/me
router.get('/me', getUserProfile);
// GET /api/users/me/learning-progress
router.get('/me/learning-progress', getLearningProgress);
// GET /api/users/me/courses-progress
router.get('/me/courses-progress', getCoursesProgress);
// GET /api/users/me/activity
router.get('/me/activity', getUserActivity);
// GET /api/users/me/remedial-assignments
router.get('/me/remedial-assignments', getMyRemedialAssignments);
// PATCH /api/users/me - update profile (e.g. phoneNumber)
router.patch('/me', updateProfile);

// GET /api/users/all - Get all users
router.get('/all', getAllUsers);

module.exports = router;
