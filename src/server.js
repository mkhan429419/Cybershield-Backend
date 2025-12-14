const app = require('./app');
const connectDB = require('./config/database');

const PORT = process.env.PORT || 5001;

// Handle uncaught exceptions from async operations (like Google Translate initialization)
process.on('uncaughtException', (error) => {
  // Check if this is the Google Translate callback error
  if (error.message && error.message.includes('callback is not a function') && 
      error.stack && error.stack.includes('@google-cloud/translate')) {
    console.warn('⚠️  Google Translate library initialization error (non-fatal):', error.message);
    console.warn('Translation features will be unavailable until this is resolved.');
    // Don't exit - allow server to continue running
    return;
  }
  // For other uncaught exceptions, log and exit
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Connect to database
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CyberShield Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
