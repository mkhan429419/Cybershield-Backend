/**
 * WhatsApp & Email ML Detection Service
 * Integrates Python ML pipeline (EmailDetector / MessagingDetector) with Node.js backend.
 * Uses model_artifacts in ml_pipeline for email and WhatsApp phishing models.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUNNER_SCRIPT = path.join(__dirname, '..', 'ml_pipeline', 'run_inference.py');
const BACKEND_ROOT = path.join(__dirname, '..', '..');

class WhatsappEmailMlService {
  constructor() {
    // Determine Python executable - prefer python3, fallback to python
    this.pythonExecutable = process.env.PYTHON_PATH || 'python3';
    
    // Verify Python is available
    try {
      const { execSync } = require('child_process');
      execSync(`${this.pythonExecutable} --version`, { stdio: 'ignore' });
    } catch (error) {
      // Try python as fallback
      try {
        execSync('python --version', { stdio: 'ignore' });
        this.pythonExecutable = 'python';
      } catch (e) {
        console.warn(`Warning: Python executable not found. Using: ${this.pythonExecutable}`);
      }
    }
  }

  /**
   * Predict phishing probability for a user-reported incident using ML pipeline only.
   * @param {Object} incidentData - Formatted incident (use formatIncidentForML on raw report)
   * @returns {Promise<Object>} { success, is_phishing, phishing_probability, confidence, error? }
   */
  async predictIncident(incidentData) {
    try {
      const result = await this._callPythonPredictor(incidentData);
      return result;
    } catch (error) {
      console.error('ML Prediction Error:', error);
      return {
        success: false,
        error: error.message,
        is_phishing: null,
        phishing_probability: null,
        confidence: null,
      };
    }
  }

  /**
   * Call Python ML pipeline via run_inference.py script.
   * @private
   */
  _callPythonPredictor(incidentData) {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonExecutable, [RUNNER_SCRIPT], {
        cwd: BACKEND_ROOT,
        env: { ...process.env, PYTHONPATH: path.join(BACKEND_ROOT, 'src') },
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });

      python.stdin.write(JSON.stringify(incidentData));
      python.stdin.end();
    });
  }

  /**
   * Extract features from incident (for analysis/debugging). Uses ML pipeline.
   * @param {Object} incidentData - Formatted incident data
   * @returns {Promise<Object>} Extracted features
   */
  async extractFeatures(incidentData) {
    const extractScript = path.join(__dirname, '..', 'ml_pipeline', 'run_extract_features.py');
    try {
      const python = spawn(this.pythonExecutable, [extractScript], {
        cwd: BACKEND_ROOT,
        env: { ...process.env, PYTHONPATH: path.join(BACKEND_ROOT, 'src') },
      });
      let stdout = '';
      let stderr = '';
      python.stdout.on('data', (d) => { stdout += d.toString(); });
      python.stderr.on('data', (d) => { stderr += d.toString(); });
      return new Promise((resolve, reject) => {
        python.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Python exited ${code}: ${stderr}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (e) {
            reject(new Error(`Failed to parse output: ${stdout}`));
          }
        });
        python.on('error', (e) => reject(new Error(`Spawn failed: ${e.message}`)));
        python.stdin.write(JSON.stringify(incidentData));
        python.stdin.end();
      });
    } catch (error) {
      console.error('Feature Extraction Error:', error);
      return { success: false, error: error.message, features: null };
    }
  }

  /**
   * Format incident for ML pipeline. Matches training:
   * - Email: text = subject + body, metadata from/subject/date; urls.
   * - WhatsApp: text = message, metadata timestamp/from_phone/has_url; urls.
   */
  formatIncidentForML(reportData) {
    const msgType = (reportData.messageType || reportData.message_type || 'email').toLowerCase();
    const isEmail = msgType !== 'whatsapp' && msgType !== 'sms' && msgType !== 'messaging';
    const body = reportData.message || reportData.text || '';
    const subject = reportData.subject || '';
    const fromVal = reportData.from || reportData.sender || '';
    const urls = reportData.urls || reportData.links || [];
    const dateOrTs = reportData.date || reportData.timestamp || new Date().toISOString();

    const text = isEmail
      ? (subject ? `${subject} ${body}`.trim() : body)
      : body;

    const baseMetadata = {
      from: fromVal,
      to: reportData.to || [],
      cc: reportData.cc || [],
      bcc: reportData.bcc || [],
      headers: reportData.headers || {},
      ...(reportData.metadata || {})
    };

    if (isEmail) {
      return {
        text,
        message_type: 'email',
        metadata: {
          ...baseMetadata,
          from_email: reportData.fromEmail || reportData.sender_email || fromVal || '',
          subject,
          date: dateOrTs,
        },
        urls,
        html_content: reportData.htmlContent || reportData.html_content || null
      };
    }

    return {
      text,
      message_type: 'whatsapp',
      metadata: {
        ...baseMetadata,
        from_phone: reportData.from_phone || reportData.from || reportData.sender || '',
        timestamp: dateOrTs,
        has_url: urls.length > 0 ? true : !!reportData.has_url,
        has_email: !!reportData.has_email,
        has_phone: !!reportData.has_phone,
      },
      urls,
      html_content: null
    };
  }
}

module.exports = new WhatsappEmailMlService();
