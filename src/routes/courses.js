const express = require("express");
const router = express.Router();
const { getCourses, getCourseById, createCourse, updateCourse, deleteCourse, getProgress, markComplete, unmarkComplete } = require("../controllers/courseController");
const { requireAuth, getUserData } = require("../middleware/auth");

const authenticate = [requireAuth, getUserData];

router.get("/", authenticate, getCourses);
router.get("/:courseId/progress", authenticate, getProgress);
router.post("/:courseId/progress", authenticate, markComplete);
router.delete("/:courseId/progress", authenticate, unmarkComplete);
router.get("/:id", authenticate, getCourseById);
router.put("/:id", authenticate, updateCourse);
router.delete("/:id", authenticate, deleteCourse);
router.post("/", authenticate, createCourse);

module.exports = router;
