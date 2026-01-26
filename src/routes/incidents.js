const express = require("express");
const router = express.Router();
const { analyzeIncident, getIncidents, getIncidentById } = require("../controllers/incidentController");
const { requireAuth, getUserData } = require("../middleware/auth");

// Combine requireAuth and getUserData for authentication
const authenticate = [requireAuth, getUserData];

router.post("/analyze", authenticate, analyzeIncident);
router.get("/", authenticate, getIncidents);
router.get("/:id", authenticate, getIncidentById);

module.exports = router;
