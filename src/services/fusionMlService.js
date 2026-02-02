/**
 * Fusion ML Service
 * Uses the unified model fusion system that combines Email, WhatsApp, and Voice models.
 * Supports multiple fusion strategies including stacked_fusion (meta-learner).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class FusionMlService {
  constructor() {
    this.pythonScriptPath = path.join(__dirname, '..', 'ml_pipeline', 'run_fusion_inference.py');
    
    // Check for virtual environment Python first (has TensorFlow for voice model)
    const venvPython = path.join(__dirname, 'mlPhishingService', 'venv_cnn_bilstm', 'bin', 'python3');
    const venvPythonExists = fs.existsSync(venvPython);
    
    // Use virtual environment Python if available, otherwise use env var or default
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

  /**
   * Call Python fusion inference script
   * @private
   */
  async _callPythonFusionPredictor(inputData) {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const inputPath = path.join(tempDir, `fusion_input_${Date.now()}.json`);
      const outputPath = path.join(tempDir, `fusion_output_${Date.now()}.json`);

      // Write input JSON
      fs.writeFileSync(inputPath, JSON.stringify(inputData, null, 2), 'utf8');

      console.log('Spawning fusion Python process:', {
        python: this.pythonExecutable,
        script: this.pythonScriptPath,
        input: inputPath,
        output: outputPath
      });

      // Spawn Python process
      const pythonProcess = spawn(this.pythonExecutable, [
        this.pythonScriptPath,
        inputPath,
        outputPath
      ], {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env }
      });

      let stderrOutput = '';
      let stdoutOutput = '';

      // Set timeout (60 seconds) - must be defined before close handler
      const timeoutId = setTimeout(() => {
        try {
          pythonProcess.kill('SIGTERM');
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
          console.error('Error cleaning up after timeout:', e);
        }
        reject(new Error('Fusion prediction timed out after 60 seconds'));
      }, 60000);

      pythonProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
        // Log stderr for debugging
        console.log('Fusion Python stderr:', data.toString().trim());
      });
      
      pythonProcess.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
        console.log('Fusion Python stdout:', data.toString().trim());
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        try {
          if (code !== 0) {
            console.error('Fusion Python process failed:', {
              code,
              stderr: stderrOutput,
              inputPath,
              outputPath,
              pythonExecutable: this.pythonExecutable,
              scriptPath: this.pythonScriptPath
            });
            // Clean up temp files
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (e) {}

            reject(new Error(`Python process exited with code ${code}. Error: ${stderrOutput}`));
            return;
          }

          // Read output
          if (!fs.existsSync(outputPath)) {
            console.error('Fusion output file not found:', outputPath);
            console.error('Stderr output:', stderrOutput);
            console.error('Input file exists:', fs.existsSync(inputPath));
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            } catch (e) {}
            reject(new Error(`Python script did not produce output file. Stderr: ${stderrOutput}`));
            return;
          }

          const outputContent = fs.readFileSync(outputPath, 'utf8');
          console.log('Fusion output file content (first 500 chars):', outputContent.substring(0, 500));
          
          let outputData;
          try {
            outputData = JSON.parse(outputContent);
          } catch (parseError) {
            console.error('Failed to parse fusion output:', parseError);
            console.error('Output content (full):', outputContent);
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (e) {}
            reject(new Error(`Failed to parse Python output: ${parseError.message}`));
            return;
          }

          // Clean up temp files
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}

          if (!outputData.success) {
            console.error('Fusion prediction returned unsuccessful:', outputData);
            reject(new Error(outputData.error || 'Fusion prediction failed'));
            return;
          }

          resolve(outputData);
        } catch (error) {
          console.error('Error in fusion Python process close handler:', error);
          // Clean up temp files
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}

          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error('Fusion Python process spawn error:', error);
        // Clean up temp files
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}

        reject(new Error(`Failed to start Python process: ${error.message}. Python path: ${this.pythonExecutable}, Script: ${this.pythonScriptPath}`));
      });
    });
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
