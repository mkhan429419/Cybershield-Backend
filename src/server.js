const app = require('./app');
const connectDB = require('./config/database');

const PORT = process.env.PORT || 5001;

// Connect to database
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CyberShield Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
