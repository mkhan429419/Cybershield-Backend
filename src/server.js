const app = require('./app');
const connectDB = require('./config/database');
const campaignController = require('./controllers/campaignController');
const whatsappCampaignController = require('./controllers/whatsappCampaignController');
const fusionMlService = require('./services/fusionMlService');

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

async function start() {
  // Connect to database first so schedulers don't run before DB is ready
  await connectDB();

  // Start campaign schedulers only after DB is connected (avoids buffering timeout)
  if (campaignController.startCampaignScheduler) campaignController.startCampaignScheduler();
  if (whatsappCampaignController.startCampaignScheduler) whatsappCampaignController.startCampaignScheduler();

  app.listen(PORT, () => {
    console.log(`🚀 CyberShield Backend running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Readiness (ML): http://localhost:${PORT}/health/ready`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Warm up fusion ML worker in background so models load before first user request (avoids cold-start failures on Render/Northflank)
    setImmediate(() => {
      fusionMlService.warmup().catch((err) => {
        console.warn('Fusion ML warmup failed (first ML request may be slow):', err.message);
      });
    });
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
