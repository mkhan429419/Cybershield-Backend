const express = require("express");
const router = express.Router();
const { getCourses, getCourseById, createCourse, updateCourse, deleteCourse, getProgress, getActivityEmailStatus, getActivityWhatsAppStatus, recordActivityResult, activityRetry, markComplete, unmarkComplete, sendActivityEmail, sendActivityWhatsApp } = require("../controllers/courseController");
const { requireAuth, getUserData } = require("../middleware/auth");

const authenticate = [requireAuth, getUserData];

router.get("/", authenticate, getCourses);
router.get("/:courseId/progress/activity-email-status", authenticate, getActivityEmailStatus);
router.get("/:courseId/progress/activity-whatsapp-status", authenticate, getActivityWhatsAppStatus);
router.post("/:courseId/progress/activity-result", authenticate, recordActivityResult);
router.post("/:courseId/progress/activity-retry", authenticate, activityRetry);
router.get("/:courseId/progress", authenticate, getProgress);
router.post("/:courseId/progress", authenticate, markComplete);
router.delete("/:courseId/progress", authenticate, unmarkComplete);
router.post("/:courseId/activity/send-email", authenticate, sendActivityEmail);
router.post("/:courseId/activity/send-whatsapp", authenticate, sendActivityWhatsApp);
router.get("/:id", authenticate, getCourseById);
router.put("/:id", authenticate, updateCourse);
router.delete("/:id", authenticate, deleteCourse);
router.post("/", authenticate, createCourse);

module.exports = router;
