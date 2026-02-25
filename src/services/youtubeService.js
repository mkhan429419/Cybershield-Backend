/**
 * YouTube Upload Service
 * Handles uploading videos to YouTube and retrieving video information
 * 
 * Note: Requires googleapis package to be installed:
 * npm install googleapis
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class YouTubeService {
  constructor() {
    this.initialized = false;
    this.youtube = null;
    
    try {
      // Initialize YouTube Data API v3
      // Supports multiple authentication methods:
      // 1. OAuth2 client credentials via env vars (recommended)
      // 2. Service account credentials
      
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
      const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/youtube/oauth2callback';
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      
      if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );
        
        oauth2Client.setCredentials({
          refresh_token: refreshToken
        });
        
        this.youtube = google.youtube({
          version: 'v3',
          auth: oauth2Client
        });
        
        this.initialized = true;
        console.log('✅ YouTube Service initialized with OAuth2 credentials');
      } else {
        console.warn('⚠️  YouTube Service not initialized: Missing credentials');
        console.warn('Required env vars: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN');
        this.initialized = false;
      }
    } catch (error) {
      console.warn('⚠️  YouTube Service initialization error (non-fatal):', error.message);
      console.warn('Video uploads to YouTube will be disabled until credentials are configured');
      this.initialized = false;
    }
  }

  /**
   * Upload a video to YouTube
   * @param {Buffer} videoBuffer - Video file buffer
   * @param {string} filename - Original filename
   * @param {string} title - Video title
   * @param {string} description - Video description
   * @param {Array<string>} tags - Video tags
   * @param {string} privacyStatus - 'private', 'unlisted', or 'public' (default: 'unlisted')
   * @returns {Promise<Object>} YouTube video information with videoId and embedUrl
   */
  async uploadVideo(videoBuffer, filename, title, description = '', tags = [], privacyStatus = 'unlisted') {
    if (!this.initialized) {
      throw new Error('YouTube Service is not initialized. Please configure YouTube API credentials.');
    }

    try {
      // Create a temporary file for the video
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `youtube_upload_${Date.now()}_${filename}`);
      
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, videoBuffer);

      try {
        // Prepare video metadata
        const videoMetadata = {
          snippet: {
            title: title || filename.replace(/\.[^/.]+$/, ''), // Use filename without extension as title
            description: description || 'Uploaded via CyberShield Training Module',
            tags: tags.length > 0 ? tags : ['cybersecurity', 'training', 'education'],
            categoryId: '27', // Education category
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en'
          },
          status: {
            privacyStatus: privacyStatus, // 'unlisted' so it's accessible via link but not searchable
            selfDeclaredMadeForKids: false
          }
        };

        // Upload video
        const response = await this.youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: videoMetadata,
          media: {
            body: fs.createReadStream(tempFilePath),
            mimeType: this._getMimeType(filename)
          }
        });

        const videoId = response.data.id;
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

        console.log(`✅ Video uploaded to YouTube: ${videoId}`);
        console.log(`   Watch URL: ${watchUrl}`);
        console.log(`   Embed URL: ${embedUrl}`);

        // YouTube automatically generates captions, but it may take a few minutes
        // We can check for captions later or just let react-player handle it

        return {
          videoId: videoId,
          embedUrl: embedUrl,
          watchUrl: watchUrl,
          title: response.data.snippet.title,
          description: response.data.snippet.description,
          thumbnailUrl: response.data.snippet.thumbnails?.default?.url || null
        };
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    } catch (error) {
      console.error('YouTube upload error:', error);
      
      if (error.response) {
        const errorDetails = error.response.data?.error;
        throw new Error(
          `YouTube upload failed: ${errorDetails?.message || error.message}`
        );
      }
      
      throw new Error(`YouTube upload failed: ${error.message}`);
    }
  }

  /**
   * Get video information by video ID
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} Video information
   */
  async getVideoInfo(videoId) {
    if (!this.initialized) {
      throw new Error('YouTube Service is not initialized');
    }

    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'status', 'contentDetails'],
        id: [videoId]
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        return {
          videoId: video.id,
          embedUrl: `https://www.youtube.com/embed/${video.id}`,
          watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: video.snippet.thumbnails?.default?.url || null,
          privacyStatus: video.status.privacyStatus
        };
      }

      throw new Error('Video not found');
    } catch (error) {
      console.error('Error fetching YouTube video info:', error);
      throw new Error(`Failed to fetch video info: ${error.message}`);
    }
  }

  /**
   * Check if captions are available for a video
   * YouTube automatically generates captions, but this checks if they're ready
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if captions are available
   */
  async hasCaptions(videoId) {
    if (!this.initialized) {
      return false;
    }

    try {
      const response = await this.youtube.captions.list({
        part: ['snippet'],
        videoId: videoId
      });

      return response.data.items && response.data.items.length > 0;
    } catch (error) {
      console.error('Error checking captions:', error);
      return false;
    }
  }

  /**
   * Get MIME type from filename
   * @private
   */
  _getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska'
    };
    return mimeTypes[ext] || 'video/mp4';
  }

  /**
   * Check if the service is initialized and ready
   * @returns {boolean}
   */
  isReady() {
    return this.initialized;
  }
}

// Export singleton instance
module.exports = new YouTubeService();
