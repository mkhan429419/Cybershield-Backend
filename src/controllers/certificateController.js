const Certificate = require("../models/Certificate");
const Course = require("../models/Course");
const CourseProgress = require("../models/CourseProgress");
const User = require("../models/User");

/**
 * Generate a unique certificate number
 */
function generateCertificateNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-${timestamp}-${random}`;
}

/**
 * Check if a user has completed all modules and sections of a course
 */
async function isCourseCompleted(userId, courseId) {
  try {
    const course = await Course.findById(courseId).lean();
    if (!course) return false;

    const progress = await CourseProgress.findOne({ user: userId, course: courseId }).lean();
    if (!progress) return false;

    const completed = new Set(progress.completed || []);
    const modules = course.modules || [];

    // Check each module
    for (let modIdx = 0; modIdx < modules.length; modIdx++) {
      const module = modules[modIdx];
      const sections = module.sections || [];
      const hasQuiz = (module.quiz || []).length > 0;

      // Check all sections
      for (let secIdx = 0; secIdx < sections.length; secIdx++) {
        const sectionId = `${modIdx}-${secIdx}`;
        if (!completed.has(sectionId)) {
          return false;
        }
      }

      // Check quiz if it exists
      if (hasQuiz) {
        const quizId = `${modIdx}-quiz`;
        if (!completed.has(quizId)) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking course completion:", error);
    return false;
  }
}

/**
 * POST /api/certificates/generate/:courseId
 * Generate and save a certificate for a completed course
 */
async function generateCertificate(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { courseId } = req.params;
    if (!courseId) {
      return res.status(400).json({ success: false, error: "Course ID is required" });
    }

    // Check if course exists
    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }

    // Check if course is completed
    const completed = await isCourseCompleted(userId, courseId);
    if (!completed) {
      return res.status(400).json({
        success: false,
        error: "Course must be completed before generating a certificate",
      });
    }

    // Check if certificate already exists
    const existingCert = await Certificate.findOne({ user: userId, course: courseId }).lean();
    if (existingCert) {
      return res.status(200).json({
        success: true,
        certificate: existingCert,
        message: "Certificate already exists",
      });
    }

    // Get user data
    const user = await User.findById(userId).select("displayName email").lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Generate certificate
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

    // Populate references for response
    const populatedCert = await Certificate.findById(certificate._id)
      .populate("user", "displayName email")
      .populate("course", "courseTitle description level createdByName")
      .lean();

    return res.status(201).json({
      success: true,
      certificate: populatedCert,
    });
  } catch (error) {
    console.error("generateCertificate error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate certificate" });
  }
}

/**
 * GET /api/certificates
 * Get all certificates for the current user
 */
async function getUserCertificates(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const certificates = await Certificate.find({ user: userId })
      .populate("course", "courseTitle description level createdByName")
      .sort({ issuedDate: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      certificates,
    });
  } catch (error) {
    console.error("getUserCertificates error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch certificates" });
  }
}

/**
 * GET /api/certificates/:certificateId
 * Get a specific certificate by ID
 */
async function getCertificateById(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { certificateId } = req.params;
    const certificate = await Certificate.findById(certificateId)
      .populate("user", "displayName email")
      .populate("course", "courseTitle description level createdByName")
      .lean();

    if (!certificate) {
      return res.status(404).json({ success: false, error: "Certificate not found" });
    }

    // Verify the certificate belongs to the user
    if (certificate.user._id.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    return res.status(200).json({
      success: true,
      certificate,
    });
  } catch (error) {
    console.error("getCertificateById error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch certificate" });
  }
}

/**
 * GET /api/certificates/course/:courseId
 * Check if user has a certificate for a specific course
 */
async function getCertificateByCourse(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { courseId } = req.params;
    const certificate = await Certificate.findOne({ user: userId, course: courseId })
      .populate("course", "courseTitle description level createdByName")
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        certificate: null,
        message: "Certificate not found for this course",
      });
    }

    return res.status(200).json({
      success: true,
      certificate,
    });
  } catch (error) {
    console.error("getCertificateByCourse error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch certificate" });
  }
}

module.exports = {
  generateCertificate,
  getUserCertificates,
  getCertificateById,
  getCertificateByCourse,
  isCourseCompleted,
  generateCertificateNumber,
};
