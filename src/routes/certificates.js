const express = require("express");
const router = express.Router();
const {
  generateCertificate,
  getUserCertificates,
  getCertificateById,
  getCertificateByCourse,
  getNonAffiliatedCertificateCount,
} = require("../controllers/certificateController");
const { requireAuth, getUserData } = require("../middleware/auth");

const authenticate = [requireAuth, getUserData];

router.get("/", authenticate, getUserCertificates);
router.get("/course/:courseId", authenticate, getCertificateByCourse);
router.get("/count/non-affiliated", authenticate, getNonAffiliatedCertificateCount);
router.get("/:certificateId", authenticate, getCertificateById);
router.post("/generate/:courseId", authenticate, generateCertificate);

module.exports = router;
