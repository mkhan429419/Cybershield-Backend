const mongoose = require("mongoose");
const Course = require("../models/Course");
const CourseProgress = require("../models/CourseProgress");
const User = require("../models/User");
const { isCourseCompleted, generateCertificateNumber } = require("./certificateController");
const Certificate = require("../models/Certificate");

/**
 * GET /api/courses
 * List courses (all or filtered). Optionally by createdBy.
 */
async function getCourses(req, res) {
  try {
    const { createdBy, sort = "newest", limit = "50", page = "1" } = req.query;
    const filter = {};
    if (createdBy) filter.createdBy = createdBy;

    const sortOption = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Course.countDocuments(filter),
    ]);

    const needUserLookup = courses.filter(
      (c) => (c.createdByName == null || c.createdByName === "") && (c.createdByEmail == null || c.createdByEmail === "") && c.createdBy
    );
    const userIds = [...new Set(needUserLookup.map((c) => c.createdBy.toString()))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select("displayName email").lean()
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const coursesWithCreator = courses.map((c) => {
      const hasStored = c.createdByName != null || c.createdByEmail != null;
      if (hasStored) {
        return {
          ...c,
          createdBy: { _id: c.createdBy, displayName: c.createdByName || "", email: c.createdByEmail || "" },
        };
      }
      const u = c.createdBy ? userMap[c.createdBy.toString()] : null;
      return {
        ...c,
        createdBy: u
          ? { _id: c.createdBy, displayName: u.displayName || "", email: u.email || "" }
          : { _id: c.createdBy, displayName: "", email: "" },
      };
    });

    return res.status(200).json({
      success: true,
      courses: coursesWithCreator,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("getCourses error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch courses" });
  }
}

/**
 * GET /api/courses/:id
 * Get a single course by id.
 */
async function getCourseById(req, res) {
  try {
    const course = await Course.findById(req.params.id).lean();

    if (!course) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }

    const hasStored = course.createdByName != null || course.createdByEmail != null;
    let createdByPayload;
    if (hasStored) {
      createdByPayload = { _id: course.createdBy, displayName: course.createdByName || "", email: course.createdByEmail || "" };
    } else if (course.createdBy) {
      const u = await User.findById(course.createdBy).select("displayName email").lean();
      createdByPayload = u ? { _id: course.createdBy, displayName: u.displayName || "", email: u.email || "" } : { _id: course.createdBy, displayName: "", email: "" };
    } else {
      createdByPayload = { _id: null, displayName: "", email: "" };
    }

    const courseWithCreator = { ...course, createdBy: createdByPayload };

    return res.status(200).json({ success: true, course: courseWithCreator });
  } catch (error) {
    console.error("getCourseById error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch course" });
  }
}

/**
 * POST /api/courses
 * Create a new course. Body: { courseTitle, description, modules }.
 * createdBy set from req.user._id.
 */
async function createCourse(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { courseTitle, description, modules, badges, level } = req.body || {};
    if (!courseTitle || typeof courseTitle !== "string" || !courseTitle.trim()) {
      return res.status(400).json({
        success: false,
        error: "courseTitle is required",
      });
    }

    const normalizedModules = Array.isArray(modules)
      ? modules.map((m) => ({
          title: (m.title || "").trim(),
          sections: Array.isArray(m.sections)
            ? m.sections
                .map((s) => ({
                  title: (s.title || "").trim(),
                  material: (s.material || "").trim(),
                  urls: Array.isArray(s.urls) ? s.urls.map((u) => String(u).trim()).filter(Boolean) : [],
                  media: Array.isArray(s.media)
                    ? s.media
                        .map((m) => ({
                          type: m.type === 'video' ? 'video' : 'image',
                          url: String(m.url || "").trim(),
                          alt: String(m.alt || "").trim(),
                          caption: String(m.caption || "").trim(),
                          publicId: String(m.publicId || "").trim(),
                          subtitleUrl: String(m.subtitleUrl || "").trim(),
                          youtubeId: String(m.youtubeId || "").trim(), // YouTube video ID
                        }))
                        .filter((m) => m.url)
                    : [],
                }))
                .filter((s) => s.title || s.material || s.urls.length > 0 || s.media.length > 0)
            : [],
          quiz: Array.isArray(m.quiz)
            ? m.quiz
                .map((q) => ({
                  question: (q.question || "").trim(),
                  choices: Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()).filter(Boolean) : [],
                  correctIndex: Math.max(0, parseInt(q.correctIndex, 10) || 0),
                }))
                .filter((q) => q.question && q.choices.length > 0)
            : [],
        }))
      : [];

    const user = await User.findById(userId).select("displayName email").lean();
    const createdByName = (user && user.displayName) ? user.displayName : "";
    const createdByEmail = (user && user.email) ? user.email : "";

    const normalizedBadges = Array.isArray(badges)
      ? badges.map((b) => String(b).trim()).filter(Boolean)
      : [];

    const normalizedLevel =
      level === "advanced" || level === "basic" ? level : "basic";

    const course = new Course({
      courseTitle: courseTitle.trim(),
      description: (description || "").trim(),
      level: normalizedLevel,
      modules: normalizedModules,
      createdBy: userId,
      createdByName,
      createdByEmail,
      badges: normalizedBadges,
    });

    await course.save();
    const saved = await Course.findById(course._id).lean();
    const courseResponse = {
      ...saved,
      createdBy: { _id: saved.createdBy, displayName: saved.createdByName || "", email: saved.createdByEmail || "" },
    };

    return res.status(201).json({ success: true, course: courseResponse });
  } catch (error) {
    console.error("createCourse error:", error);
    return res.status(500).json({ success: false, error: "Failed to create course" });
  }
}

/**
 * PUT /api/courses/:id
 * Update a course. Body: { courseTitle, description, modules, badges }.
 */
async function updateCourse(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const courseId = req.params.id;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, error: "Invalid course id" });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }
    const { courseTitle, description, modules, badges, level } = req.body || {};
    if (courseTitle !== undefined) {
      if (typeof courseTitle !== "string" || !courseTitle.trim()) {
        return res.status(400).json({ success: false, error: "courseTitle must be a non-empty string" });
      }
      course.courseTitle = courseTitle.trim();
    }
    if (description !== undefined) course.description = (description || "").trim();
    if (level === "advanced" || level === "basic") course.level = level;
    if (Array.isArray(badges)) {
      course.badges = badges.map((b) => String(b).trim()).filter(Boolean);
    }
    if (Array.isArray(modules)) {
      course.modules = modules.map((m) => ({
        title: (m.title || "").trim(),
        sections: Array.isArray(m.sections)
          ? m.sections
              .map((s) => ({
                title: (s.title || "").trim(),
                material: (s.material || "").trim(),
                urls: Array.isArray(s.urls) ? s.urls.map((u) => String(u).trim()).filter(Boolean) : [],
                media: Array.isArray(s.media)
                  ? s.media
                      .map((m) => ({
                        type: m.type === 'video' ? 'video' : 'image',
                        url: String(m.url || "").trim(),
                        alt: String(m.alt || "").trim(),
                        caption: String(m.caption || "").trim(),
                        publicId: String(m.publicId || "").trim(),
                        subtitleUrl: String(m.subtitleUrl || "").trim(),
                        youtubeId: String(m.youtubeId || "").trim(), // YouTube video ID
                      }))
                      .filter((m) => m.url)
                  : [],
              }))
              .filter((s) => s.title || s.material || (s.urls && s.urls.length > 0) || (s.media && s.media.length > 0))
          : [],
        quiz: Array.isArray(m.quiz)
          ? m.quiz
              .map((q) => ({
                question: (q.question || "").trim(),
                choices: Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()).filter(Boolean) : [],
                correctIndex: Math.max(0, parseInt(q.correctIndex, 10) || 0),
              }))
              .filter((q) => q.question && q.choices && q.choices.length > 0)
          : [],
      }));
    }
    await course.save();
    const saved = await Course.findById(course._id).lean();
    const courseResponse = {
      ...saved,
      createdBy: {
        _id: saved.createdBy,
        displayName: saved.createdByName || "",
        email: saved.createdByEmail || "",
      },
    };
    return res.status(200).json({ success: true, course: courseResponse });
  } catch (error) {
    console.error("updateCourse error:", error);
    return res.status(500).json({ success: false, error: "Failed to update course" });
  }
}

/**
 * DELETE /api/courses/:id
 * Delete a course and all its progress records.
 */
async function deleteCourse(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const courseId = req.params.id;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, error: "Invalid course id" });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }
    await CourseProgress.deleteMany({ course: courseId });
    await Course.findByIdAndDelete(courseId);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("deleteCourse error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete course" });
  }
}

/**
 * GET /api/courses/:courseId/progress
 * Get current user's progress for a course (completed submodule ids).
 */
async function getProgress(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const { courseId } = req.params;
    const progress = await CourseProgress.findOne({ user: userId, course: courseId }).lean();
    const completed = progress?.completed ?? [];
    return res.status(200).json({ success: true, completed });
  } catch (error) {
    console.error("getProgress error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch progress" });
  }
}

/**
 * POST /api/courses/:courseId/progress
 * Mark a submodule as complete. Body: { submoduleId } (e.g. "0-0", "0-quiz").
 */
async function markComplete(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const { courseId } = req.params;
    const { submoduleId } = req.body || {};
    if (!submoduleId || typeof submoduleId !== "string" || !submoduleId.trim()) {
      return res.status(400).json({ success: false, error: "submoduleId is required" });
    }
    const id = submoduleId.trim();
    const progress = await CourseProgress.findOneAndUpdate(
      { user: userId, course: courseId },
      { $addToSet: { completed: id } },
      { new: true, upsert: true }
    ).lean();
    
    // Check if course is now completed and generate certificate if needed
    const completed = await isCourseCompleted(userId, courseId);
    let certificateGenerated = false;
    if (completed) {
      // Check if certificate already exists
      const existingCert = await Certificate.findOne({ user: userId, course: courseId }).lean();
      if (!existingCert) {
        // Auto-generate certificate
        try {
          const course = await Course.findById(courseId).lean();
          const user = await User.findById(userId).select("displayName email").lean();
          if (course && user) {
            const certificate = new Certificate({
              user: userId,
              course: courseId,
              userName: user.displayName || "User",
              userEmail: user.email,
              courseTitle: course.courseTitle,
              courseDescription: course.description || "",
              certificateNumber: generateCertificateNumber(),
              issuedDate: new Date(),
              completionDate: new Date(),
            });
            await certificate.save();
            certificateGenerated = true;
          }
        } catch (certError) {
          console.error("Error auto-generating certificate:", certError);
          // Don't fail the request if certificate generation fails
        }
      }
    }
    
    return res.status(200).json({ 
      success: true, 
      completed: progress.completed,
      certificateGenerated 
    });
  } catch (error) {
    console.error("markComplete error:", error);
    return res.status(500).json({ success: false, error: "Failed to update progress" });
  }
}

/**
 * DELETE /api/courses/:courseId/progress
 * Unmark a submodule as complete. Body: { submoduleId } (e.g. "0-0", "0-quiz").
 */
async function unmarkComplete(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const { courseId } = req.params;
    const { submoduleId } = req.body || {};
    if (!submoduleId || typeof submoduleId !== "string" || !submoduleId.trim()) {
      return res.status(400).json({ success: false, error: "submoduleId is required" });
    }
    const id = submoduleId.trim();
    const progress = await CourseProgress.findOneAndUpdate(
      { user: userId, course: courseId },
      { $pull: { completed: id } },
      { new: true, upsert: true }
    ).lean();
    return res.status(200).json({ success: true, completed: progress.completed });
  } catch (error) {
    console.error("unmarkComplete error:", error);
    return res.status(500).json({ success: false, error: "Failed to update progress" });
  }
}

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getProgress,
  markComplete,
  unmarkComplete,
};
