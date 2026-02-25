const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const { requireAuth, getUserData } = require('../middleware/auth');
const youtubeService = require('../services/youtubeService');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();

// Configure multer for image/video uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit (increased for videos)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'));
    }
  }
});

// Apply authentication middleware
router.use(requireAuth);
router.use(getUserData);

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    
    // For videos, upload to YouTube (which provides auto-subtitles)
    // For images, upload to Cloudinary (as before)
    if (resourceType === 'video') {
      try {
        // Check if YouTube service is ready
        if (!youtubeService.isReady()) {
          return res.status(503).json({
            error: 'YouTube service not available',
            message: 'YouTube upload service is not configured. Please set up YouTube API credentials (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN).'
          });
        }

        // Upload video to YouTube
        // YouTube videos are set to 'unlisted' by default (accessible via link but not searchable)
        const youtubeResult = await youtubeService.uploadVideo(
          req.file.buffer,
          req.file.originalname,
          req.file.originalname.replace(/\.[^/.]+$/, ''), // Use filename without extension as title
          'Uploaded via CyberShield Training Module',
          ['cybersecurity', 'training', 'education'],
          'unlisted' // Privacy: unlisted (accessible via link, not searchable)
        );

        // Log video information for easy access
        console.log(`📹 YouTube video ready:`);
        console.log(`   Video ID: ${youtubeResult.videoId}`);
        console.log(`   Watch URL: ${youtubeResult.watchUrl}`);
        console.log(`   Embed URL: ${youtubeResult.embedUrl}`);
        console.log(`   Title: ${youtubeResult.title}`);

        // Return YouTube video information
        // YouTube automatically generates subtitles, which react-player will handle
        res.json({
          url: youtubeResult.watchUrl, // Use watch URL for react-player (preferred format)
          youtubeId: youtubeResult.videoId, // Store YouTube ID for reference
          type: 'video',
          filename: req.file.originalname,
          // Note: No subtitleUrl needed - YouTube handles subtitles automatically
          // react-player will automatically show YouTube's auto-generated subtitles
        });
      } catch (youtubeError) {
        console.error('YouTube upload error:', youtubeError);
        return res.status(500).json({
          error: 'Failed to upload video to YouTube',
          message: process.env.NODE_ENV === 'development' ? youtubeError.message : 'An error occurred during video upload. Please try again.'
        });
      }
    } else {
      // For images, upload to Cloudinary (existing behavior)
      const UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes for images
      
      const uploadOptions = {
        resource_type: 'image',
        folder: 'cybershield/courses',
        use_filename: true,
        unique_filename: true,
        timeout: 300000, // 5 minutes timeout for Cloudinary
      };
      
      try {
        const result = await Promise.race([
          new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              uploadOptions,
              (error, result) => {
                if (error) {
                  console.error('Cloudinary upload error:', error);
                  reject(error);
                } else {
                  resolve(result);
                }
              }
            );
            uploadStream.end(req.file.buffer);
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Upload timeout: File upload took too long. Please try again with a smaller file or check your connection.'));
            }, UPLOAD_TIMEOUT);
          })
        ]);

        res.json({
          url: result.secure_url,
          publicId: result.public_id,
          type: 'image',
          filename: req.file.originalname
        });
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        
        // Handle timeout errors specifically
        if (uploadError.message && uploadError.message.includes('timeout')) {
          return res.status(408).json({ 
            error: 'Upload timeout',
            message: uploadError.message 
          });
        }
        
        // Handle Cloudinary timeout errors
        if (uploadError.http_code === 499 || uploadError.name === 'TimeoutError') {
          return res.status(408).json({ 
            error: 'Upload timeout',
            message: 'The upload request timed out. This may happen with large files or slow connections. Please try again or use a smaller file.'
          });
        }
        
        throw uploadError;
      }
    }
  } catch (error) {
    console.error('Upload error:', error);
    
    res.status(500).json({ 
      error: 'Failed to upload file',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during upload'
    });
  }
});

// GET /api/upload/subtitles/status/:publicId
// Check if transcript is ready
router.get('/subtitles/status/:publicId', requireAuth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const transcriptPublicId = `${publicId}.transcript`;
    
    console.log(`Checking transcript status for: ${publicId}`);
    console.log(`Looking for transcript file: ${transcriptPublicId}`);
    
    // Check if the transcript resource exists in Cloudinary
    try {
      const transcriptInfo = await cloudinary.api.resource(transcriptPublicId, {
        resource_type: 'raw'
      });
      
      console.log(`✅ Transcript found!`, {
        publicId: transcriptPublicId,
        size: transcriptInfo.bytes,
        format: transcriptInfo.format,
        createdAt: transcriptInfo.created_at
      });
      
      return res.json({ 
        ready: true,
        publicId: transcriptPublicId,
        size: transcriptInfo.bytes,
        format: transcriptInfo.format,
        createdAt: transcriptInfo.created_at,
        message: 'Transcript is ready'
      });
    } catch (checkError) {
      console.log(`❌ Transcript not found:`, {
        http_code: checkError.http_code,
        message: checkError.message,
        publicId: transcriptPublicId
      });
      
      // Also check the video resource to see its status
      try {
        const videoInfo = await cloudinary.api.resource(publicId, {
          resource_type: 'video'
        });
        console.log(`Video info:`, {
          publicId: publicId,
          format: videoInfo.format,
          bytes: videoInfo.bytes,
          duration: videoInfo.duration,
          createdAt: videoInfo.created_at
        });
      } catch (videoError) {
        console.error('Error fetching video info:', videoError);
      }
      
      return res.status(404).json({ 
        ready: false,
        error: 'Transcript not ready',
        message: 'The transcript is still being processed by Cloudinary. This usually takes 1-5 minutes. Please try again in a few minutes.',
        http_code: checkError.http_code
      });
    }
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      error: 'Failed to check transcript status',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
});

// GET /api/upload/subtitles/:publicId
// Fetch transcript and convert to WebVTT format for video player
// Also checks if transcript is ready
router.get('/subtitles/:publicId', requireAuth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const transcriptPublicId = `${publicId}.transcript`;
    
    console.log(`Fetching subtitles for: ${publicId}`);
    
    // First, check if the transcript resource exists in Cloudinary
    try {
      const transcriptInfo = await cloudinary.api.resource(transcriptPublicId, {
        resource_type: 'raw'
      });
      
      // If we get here, the transcript exists
      console.log(`✅ Transcript found for ${publicId}, size: ${transcriptInfo.bytes} bytes, format: ${transcriptInfo.format}`);
    } catch (checkError) {
      // Transcript doesn't exist yet or not accessible
      console.log(`❌ Transcript check failed:`, {
        http_code: checkError.http_code,
        message: checkError.message
      });
      
      if (checkError.http_code === 404) {
        return res.status(404).json({ 
          error: 'Transcript not ready',
          message: 'The transcript is still being processed by Cloudinary. This usually takes 1-5 minutes. Please try again in a few minutes.',
          ready: false
        });
      }
      // Other error - log it but continue to try fetching
      console.warn('Error checking transcript status:', checkError.message);
    }
    
    try {
      // Try to fetch the transcript file from Cloudinary
      const transcriptUrl = cloudinary.url(transcriptPublicId, {
        resource_type: 'raw',
        format: 'txt'
      });
      
      // Fetch the transcript content using axios
      const response = await axios.get(transcriptUrl, {
        responseType: 'text',
        timeout: 10000 // 10 second timeout
      });
      
      const transcriptText = response.data;
      
      // Convert Cloudinary transcript to WebVTT format
      // Cloudinary transcript format is typically JSON or plain text with timestamps
      // We need to parse it and convert to WebVTT
      const webvtt = convertTranscriptToWebVTT(transcriptText, transcriptPublicId);
      
      // Set proper headers for WebVTT
      res.setHeader('Content-Type', 'text/vtt');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(webvtt);
    } catch (fetchError) {
      console.error('Error fetching transcript:', fetchError);
      // Check if it's a 404 or timeout (transcript not ready)
      if (fetchError.response?.status === 404 || fetchError.code === 'ECONNABORTED') {
        return res.status(404).json({ 
          error: 'Transcript not ready',
          message: 'The transcript is still being processed by Cloudinary. This usually takes 1-5 minutes depending on video length. Please try again in a few minutes.',
          ready: false
        });
      }
      return res.status(404).json({ 
        error: 'Transcript not available',
        message: 'The transcript is still being processed or is not available.',
        ready: false
      });
    }
  } catch (error) {
    console.error('Subtitle endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch subtitles',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * Convert Cloudinary transcript to WebVTT format
 * Cloudinary Google AI Video Transcription typically returns JSON with segments
 */
function convertTranscriptToWebVTT(transcriptText, publicId) {
  try {
    // Try to parse as JSON first (most common format)
    let transcriptData;
    try {
      transcriptData = JSON.parse(transcriptText);
    } catch (e) {
      // If not JSON, try to parse as plain text with timestamps
      return parsePlainTextTranscript(transcriptText);
    }
    
    // WebVTT header
    let webvtt = 'WEBVTT\n\n';
    
    // Handle different transcript formats
    if (Array.isArray(transcriptData)) {
      // Array of segments with start, end, text
      transcriptData.forEach((segment, index) => {
        if (segment.text && segment.start !== undefined && segment.end !== undefined) {
          const startTime = formatVTTTime(segment.start);
          const endTime = formatVTTTime(segment.end);
          webvtt += `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n\n`;
        }
      });
    } else if (transcriptData.segments && Array.isArray(transcriptData.segments)) {
      // Object with segments array
      transcriptData.segments.forEach((segment, index) => {
        if (segment.text && segment.start !== undefined && segment.end !== undefined) {
          const startTime = formatVTTTime(segment.start);
          const endTime = formatVTTTime(segment.end);
          webvtt += `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n\n`;
        }
      });
    } else if (transcriptData.text) {
      // Single text block - create one subtitle for the entire duration
      // This is a fallback if we don't have timing information
      webvtt += `1\n00:00:00.000 --> 99:59:59.999\n${transcriptData.text}\n\n`;
    } else {
      // Unknown format, return as-is with basic formatting
      return parsePlainTextTranscript(transcriptText);
    }
    
    return webvtt;
  } catch (error) {
    console.error('Error converting transcript to WebVTT:', error);
    // Fallback: return basic WebVTT with the raw text
    return `WEBVTT\n\n1\n00:00:00.000 --> 99:59:59.999\n${transcriptText}\n\n`;
  }
}

/**
 * Parse plain text transcript (fallback)
 */
function parsePlainTextTranscript(text) {
  let webvtt = 'WEBVTT\n\n';
  // Split by lines and create basic subtitles
  const lines = text.split('\n').filter(line => line.trim());
  lines.forEach((line, index) => {
    // Estimate timing (5 seconds per line)
    const startSeconds = index * 5;
    const endSeconds = (index + 1) * 5;
    webvtt += `${index + 1}\n${formatVTTTime(startSeconds)} --> ${formatVTTTime(endSeconds)}\n${line.trim()}\n\n`;
  });
  return webvtt;
}

/**
 * Format seconds to WebVTT time format (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

module.exports = router;
