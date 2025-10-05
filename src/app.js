const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// Import routes
const adminRoutes = require("./routes/admin");
const orgRoutes = require("./routes/orgs");
const userRoutes = require("./routes/users");
const whatsappCampaignRoutes = require("./routes/whatsappCampaigns");

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// API routes
app.use("/api/admins", adminRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api/users", userRoutes);
app.use("/api/whatsapp-campaigns", whatsappCampaignRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  // Multer errors
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File too large" });
  }

  if (error.message === "Only CSV files are allowed") {
    return res.status(400).json({ error: "Only CSV files are allowed" });
  }

  // Default error response
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

module.exports = app;
