/**
 * Fusion ML Service
 * Uses the unified model fusion system that combines Email, WhatsApp, and Voice models.
 * Prefers a long-lived Python worker (models loaded once); falls back to spawn-per-request.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const USE_FUSION_WORKER = process.env.USE_FUSION_WORKER !== 'false';
const FUSION_TIMEOUT_MS = Math.min(300000, Math.max(30000, parseInt(process.env.FUSION_TIMEOUT_MS, 10) || 120000));

class FusionMlService {
  constructor() {
    this.pythonScriptPath = path.join(__dirname, '..', 'ml_pipeline', 'run_fusion_inference.py');
    this.workerScriptPath = path.join(__dirname, '..', 'ml_pipeline', 'fusion_worker.py');

    // Check for virtual environment Python first (has TensorFlow for voice model)
    const venvPython = path.join(__dirname, 'mlPhishingService', 'venv_cnn_bilstm', 'bin', 'python3');
    const venvPythonExists = fs.existsSync(venvPython);

    if (venvPythonExists) {
      this.pythonExecutable = venvPython;
      console.log('Fusion ML Service: Using virtual environment Python (has TensorFlow support)');
    } else {
      this.pythonExecutable = process.env.PYTHON_PATH || 'python3';
      if (process.env.PYTHON_PATH) {
        console.log('Fusion ML Service: Using Python from PYTHON_PATH environment variable');
      } else {
        console.log('Fusion ML Service: Using system Python (TensorFlow may not be available)');
      }
    }

    // Long-lived worker state (models loaded once in Python, reuse for all requests)
    this._workerProcess = null;
    this._requestQueue = [];
    this._currentRequest = null;
    this._stdoutBuffer = '';
  }

  /**
   * Format incident data for ML pipeline
   * @param {Object} reportData - Raw incident data
   * @returns {Object} Formatted data for ML pipeline
   */
  formatIncidentForML(reportData) {
    return {
      text: reportData.text || reportData.message || '',
      message_type: reportData.messageType || 'email',
      metadata: {
        subject: reportData.subject || '',
        from: reportData.from || reportData.from_email || '',
        from_email: reportData.from_email || reportData.from || '',
        date: reportData.date || reportData.timestamp || '',
        to: reportData.to || []
      },
      urls: Array.isArray(reportData.urls) ? reportData.urls : (reportData.urls ? [reportData.urls] : []),
      html_content: reportData.html_content || null,
      fusion_strategy: process.env.FUSION_STRATEGY || 'advanced_fusion' // Use advanced fusion by default (attention-based meta-learner)
    };
  }

  /**
   * Format voice conversation for ML pipeline
   * @param {string} transcript - Conversation transcript
   * @param {string} scenarioType - Scenario type
   * @returns {Object} Formatted data for ML pipeline
   */
  formatVoiceForML(transcript, scenarioType = 'normal') {
    return {
      text: transcript,
      message_type: 'voice',
      transcript: transcript,
      metadata: {},
      urls: [],
      html_content: null,
      scenario_type: scenarioType,
      fusion_strategy: process.env.FUSION_STRATEGY || 'advanced_fusion'
    };
  }

  _startWorker() {
    if (this._workerProcess) return;
    if (!fs.existsSync(this.workerScriptPath)) {
      throw new Error('Fusion worker script not found: ' + this.workerScriptPath);
    }
    this._workerProcess = spawn(this.pythonExecutable, [this.workerScriptPath], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._stdoutBuffer = '';
    this._workerProcess.stderr.on('data', (data) => {
      console.log('Fusion worker stderr:', data.toString().trim());
    });
    this._workerProcess.stdout.on('data', (data) => {
      this._stdoutBuffer += data.toString();
      let idx;
      while ((idx = this._stdoutBuffer.indexOf('\n')) !== -1) {
        const line = this._stdoutBuffer.slice(0, idx).trim();
        this._stdoutBuffer = this._stdoutBuffer.slice(idx + 1);
        if (line) this._onWorkerStdoutLine(line);
      }
    });
    this._workerProcess.on('close', (code) => {
      this._workerProcess = null;
      if (this._currentRequest) {
        this._currentRequest.reject(new Error(`Fusion worker exited with code ${code}`));
        this._currentRequest = null;
      }
      this._requestQueue.forEach((r) => r.reject(new Error('Fusion worker exited')));
      this._requestQueue = [];
    });
    this._workerProcess.on('error', (err) => {
      this._workerProcess = null;
      if (this._currentRequest) {
        this._currentRequest.reject(err);
        this._currentRequest = null;
      }
    });
    console.log('Fusion ML Service: started long-lived worker (models load once)');
  }

  _stopWorker() {
    if (!this._workerProcess) return;
    try {
      this._workerProcess.stdin.write('exit\n');
      this._workerProcess.stdin.end();
      this._workerProcess.kill('SIGTERM');
    } catch (e) {}
    this._workerProcess = null;
    this._currentRequest = null;
    this._requestQueue = [];
  }

  _onWorkerStdoutLine(line) {
    const req = this._currentRequest;
    if (!req) return;
    if (req.timeoutId) clearTimeout(req.timeoutId);
    this._currentRequest = null;
    try {
      const outputData = JSON.parse(line);
      if (!outputData.success && outputData.error) {
        req.reject(new Error(outputData.error));
      } else {
        req.resolve(outputData);
      }
    } catch (e) {
      req.reject(new Error('Invalid worker output: ' + line.slice(0, 200)));
    }
    this._processQueue();
  }

  _processQueue() {
    if (this._currentRequest || this._requestQueue.length === 0) return;
    const { inputData, resolve, reject } = this._requestQueue.shift();
    this._currentRequest = { resolve, reject, inputData, timeoutId: null };
    const timeoutId = setTimeout(() => {
      if (this._currentRequest && this._currentRequest.timeoutId === timeoutId) {
        this._currentRequest = null;
        this._stopWorker();
        reject(new Error(`Fusion prediction timed out after ${FUSION_TIMEOUT_MS / 1000} seconds`));
        this._processQueue();
      }
    }, FUSION_TIMEOUT_MS);
    this._currentRequest.timeoutId = timeoutId; // so _onWorkerStdoutLine can clearTimeout
    try {
      this._workerProcess.stdin.write(JSON.stringify(inputData) + '\n');
    } catch (e) {
      clearTimeout(timeoutId);
      this._currentRequest = null;
      this._workerProcess = null;
      reject(e);
      this._processQueue();
    }
  }

  /**
   * Call fusion via long-lived worker (models already in memory).
   * @private
   */
  _callPythonFusionPredictorViaWorker(inputData) {
    return new Promise((resolve, reject) => {
      this._requestQueue.push({ inputData, resolve, reject });
      try {
        if (!this._workerProcess) this._startWorker();
        this._processQueue();
      } catch (e) {
        this._requestQueue.pop();
        reject(e);
      }
    });
  }

  /**
   * Call Python fusion inference script (spawn per request, loads models every time).
   * @private
   */
  _callPythonFusionPredictorSpawn(inputData) {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const inputPath = path.join(tempDir, `fusion_input_${Date.now()}.json`);
      const outputPath = path.join(tempDir, `fusion_output_${Date.now()}.json`);
      fs.writeFileSync(inputPath, JSON.stringify(inputData, null, 2), 'utf8');

      const pythonProcess = spawn(
        this.pythonExecutable,
        [this.pythonScriptPath, inputPath, outputPath],
        { cwd: BACKEND_ROOT, env: { ...process.env } }
      );

      let stderrOutput = '';
      const timeoutId = setTimeout(() => {
        try {
          pythonProcess.kill('SIGTERM');
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}
        reject(new Error(`Fusion prediction timed out after ${FUSION_TIMEOUT_MS / 1000} seconds`));
      }, FUSION_TIMEOUT_MS);

      pythonProcess.stderr.on('data', (data) => { stderrOutput += data.toString(); });
      pythonProcess.stdout.on('data', () => {});

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        try {
          if (code !== 0) {
            try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
            reject(new Error(`Python process exited with code ${code}. ${stderrOutput}`));
            return;
          }
          if (!fs.existsSync(outputPath)) {
            try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}
            reject(new Error('Fusion script did not produce output file. ' + stderrOutput));
            return;
          }
          const outputContent = fs.readFileSync(outputPath, 'utf8');
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}
          const outputData = JSON.parse(outputContent);
          if (!outputData.success) {
            reject(new Error(outputData.error || 'Fusion prediction failed'));
            return;
          }
          resolve(outputData);
        } catch (error) {
          try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
        reject(new Error('Failed to start Python process: ' + error.message));
      });
    });
  }

  /**
   * Call Python fusion predictor: use long-lived worker if enabled, else spawn per request.
   * @private
   */
  async _callPythonFusionPredictor(inputData) {
    if (USE_FUSION_WORKER) {
      try {
        return await this._callPythonFusionPredictorViaWorker(inputData);
      } catch (e) {
        console.warn('Fusion worker failed, falling back to spawn-per-request:', e.message);
        this._stopWorker();
      }
    }
    return this._callPythonFusionPredictorSpawn(inputData);
  }

  /**
   * Predict phishing probability using fused models
   * @param {Object} incidentData - Formatted incident data
   * @returns {Promise<Object>} Prediction results
   */
  async predictIncident(incidentData) {
    try {
      const result = await this._callPythonFusionPredictor(incidentData);
      
      return {
        success: result.success || true,
        is_phishing: result.is_phishing,
        phishing_probability: result.phishing_probability,
        legitimate_probability: result.legitimate_probability || (1 - (result.phishing_probability || 0)),
        confidence: result.confidence,
        fusion_method: result.fusion_method,
        model_predictions: result.model_predictions || {},
        error: result.error || null,
        persuasion_cues: result.persuasion_cues || []
      };
    } catch (error) {
      console.error('Fusion ML Prediction Error:', error);
      return {
        success: false,
        error: error.message,
        is_phishing: null,
        phishing_probability: null,
        legitimate_probability: null,
        confidence: null
      };
    }
  }

  /**
   * Analyze voice conversation using fused models
   * @param {string} transcript - Conversation transcript
   * @param {string} scenarioType - Scenario type
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeVoiceConversation(transcript, scenarioType = 'normal') {
    try {
      const inputData = this.formatVoiceForML(transcript, scenarioType);
      console.log('Fusion Voice Analysis - Input data:', JSON.stringify(inputData, null, 2).substring(0, 500));
      
      const result = await this._callPythonFusionPredictor(inputData);
      console.log('Fusion Voice Analysis - Result:', JSON.stringify(result, null, 2).substring(0, 500));
      
      if (!result || !result.success) {
        throw new Error(result?.error || 'Fusion analysis returned unsuccessful result');
      }
      
      return {
        success: result.success || true,
        is_phishing: result.is_phishing,
        phishing_probability: result.phishing_probability,
        legitimate_probability: result.legitimate_probability || (1 - (result.phishing_probability || 0)),
        confidence: result.confidence,
        fusion_method: result.fusion_method,
        model_predictions: result.model_predictions || {},
        error: result.error || null
      };
    } catch (error) {
      console.error('Fusion Voice Analysis Error:', error);
      console.error('Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Unknown error',
        is_phishing: null,
        phishing_probability: null,
        legitimate_probability: null,
        confidence: null
      };
    }
  }
}

module.exports = new FusionMlService();
