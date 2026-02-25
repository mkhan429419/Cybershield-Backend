/**
 * Helper script to get YouTube OAuth2 refresh token
 * 
 * Usage:
 * 1. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env or as environment variables
 * 2. Run: node scripts/get-youtube-refresh-token.js
 * 3. Follow the prompts to complete OAuth flow
 * 4. Copy the refresh token to your .env file
 */

const { google } = require('googleapis');
const readline = require('readline');
const http = require('http');
const url = require('url');
require('dotenv').config();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/youtube/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env file');
  console.error('\nPlease add these to your .env file:');
  console.error('YOUTUBE_CLIENT_ID=your_client_id_here');
  console.error('YOUTUBE_CLIENT_SECRET=your_client_secret_here');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes needed for YouTube upload
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

async function getRefreshToken() {
  return new Promise((resolve, reject) => {
    // Generate the authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to get refresh token
      scope: SCOPES,
      prompt: 'consent' // Force consent screen to ensure refresh token is returned
    });

    console.log('\n📋 Step 1: Authorize this application');
    console.log('=====================================');
    console.log('\nOpen this URL in your browser:');
    console.log('\n' + authUrl + '\n');
    console.log('You will be asked to:');
    console.log('  1. Sign in with your Google account');
    console.log('  2. Grant permissions to upload videos to YouTube');
    console.log('  3. You will be redirected to a localhost URL');
    console.log('\n⚠️  Make sure your redirect URI is set to:', REDIRECT_URI);
    console.log('   in Google Cloud Console\n');

    // Start a temporary HTTP server to receive the callback
    const server = http.createServer(async (req, res) => {
      try {
        const queryObject = url.parse(req.url, true).query;
        
        if (queryObject.error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
                <p>Error: ${queryObject.error}</p>
                <p>${queryObject.error_description || ''}</p>
                <p style="margin-top: 30px; color: #666;">You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`Authorization failed: ${queryObject.error}`));
          return;
        }

        if (!queryObject.code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1 style="color: #d32f2f;">❌ No authorization code received</h1>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          return;
        }

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(queryObject.code);
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h1 style="color: #2e7d32;">✅ Authorization Successful!</h1>
              <p style="margin-top: 20px;">You can close this window.</p>
              <p style="margin-top: 10px; color: #666;">Check your terminal for the refresh token.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(tokens);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h1 style="color: #d32f2f;">❌ Error</h1>
              <p>${error.message}</p>
              <p style="margin-top: 30px; color: #666;">You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        reject(error);
      }
    });

    // Extract port from redirect URI
    const port = new URL(REDIRECT_URI).port || 5001;
    
    server.listen(port, () => {
      console.log(`\n📡 Listening for OAuth callback on ${REDIRECT_URI}`);
      console.log('   (Make sure this matches your Google Cloud Console redirect URI)\n');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${port} is already in use.`);
        console.error('   Please either:');
        console.error(`   1. Stop the process using port ${port}`);
        console.error(`   2. Change YOUTUBE_REDIRECT_URI in .env to use a different port`);
        reject(error);
      } else {
        reject(error);
      }
    });
  });
}

async function main() {
  try {
    console.log('\n🔐 YouTube OAuth2 Refresh Token Generator');
    console.log('========================================\n');

    const tokens = await getRefreshToken();

    if (!tokens.refresh_token) {
      console.error('\n❌ No refresh token received!');
      console.error('\nThis can happen if:');
      console.error('  1. You already authorized this app before (Google only gives refresh token on first authorization)');
      console.error('  2. The "prompt" parameter was not set to "consent"');
      console.error('\nSolution:');
      console.error('  1. Go to: https://myaccount.google.com/permissions');
      console.error('  2. Find this app and click "Remove access"');
      console.error('  3. Run this script again\n');
      
      if (tokens.access_token) {
        console.log('✅ Access token received (but no refresh token)');
        console.log('   Access token:', tokens.access_token.substring(0, 20) + '...');
      }
      
      process.exit(1);
    }

    console.log('\n✅ Success! Here are your tokens:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Add this to your .env file:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Setup complete! Your YouTube upload service should now work.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'EADDRINUSE') {
      console.error('\n💡 Tip: Make sure your backend server is not running on the same port.');
    }
    process.exit(1);
  }
}

main();
