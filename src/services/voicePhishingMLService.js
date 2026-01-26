/**
 * Voice Phishing ML Service
 * Analyzes voice call transcripts using ML/CNN-BiLSTM models for phishing detection.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class VoicePhishingMLService {
  constructor() {
    this.pythonScriptPath = path.join(__dirname, 'mlPhishingService', 'run_inference.py');
    
    // Check for virtual environment Python first (has TensorFlow for CNN-BiLSTM)
    const venvPython = path.join(__dirname, 'mlPhishingService', 'venv_cnn_bilstm', 'bin', 'python3');
    const venvPythonExists = fs.existsSync(venvPython);
    
    // Use virtual environment Python if available, otherwise use env var or default
    if (venvPythonExists) {
      this.pythonExecutable = venvPython;
      console.log('Using virtual environment Python (has TensorFlow support)');
    } else {
    this.pythonExecutable = process.env.PYTHON_PATH || 'python3';
      if (process.env.PYTHON_PATH) {
        console.log('Using Python from PYTHON_PATH environment variable');
      } else {
        console.log('Using system Python (TensorFlow may not be available)');
      }
    }
  }

  /**
   * Analyze conversation transcript using ML model
   * @param {string} transcript - Full conversation transcript
   * @param {string} scenarioType - "phishing" or "normal"
   * @param {string} modelType - "ml", "cnn_bilstm", "ensemble", or "auto" (default: "auto")
   * @returns {Promise<Object>} Analysis results with score and details
   */
  async analyzeConversation(transcript, scenarioType, modelType = 'auto') {
    return new Promise((resolve, reject) => {
      try {
        console.log('Voice Phishing ML Service: Starting analysis...');
        console.log('Transcript length:', transcript?.length || 0);
        console.log('Scenario type:', scenarioType);
        console.log('Model type:', modelType);
        
        // Create input JSON file
        const inputData = {
          transcript: transcript || '',
          scenario_type: scenarioType || 'normal',
          model_type: modelType || 'auto' // Pass model type to Python script
        };
        
        // Use a directory that nodemon doesn't watch
        const tempDir = path.join(__dirname, 'mlPhishingService', '.temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const inputPath = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
        const outputPath = path.join(tempDir, `output_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
        
        console.log('Input path:', inputPath);
        console.log('Output path:', outputPath);
        console.log('Python executable:', this.pythonExecutable);
        console.log('Python script:', this.pythonScriptPath);
        
        // Write input file
        fs.writeFileSync(inputPath, JSON.stringify(inputData));
        console.log('Input file written successfully');

        // Run Python script
        const pythonProcess = spawn(
          this.pythonExecutable,
          [this.pythonScriptPath, inputPath, outputPath],
          {
            cwd: path.join(__dirname, 'mlPhishingService'),
            stdio: ['pipe', 'pipe', 'pipe']
          }
        );

        let stderr = '';

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
          console.error('Python stderr:', data.toString());
        });

        pythonProcess.stdout.on('data', (data) => {
          console.log('Python stdout:', data.toString());
        });

        // Add timeout (30 seconds)
        const timeout = setTimeout(() => {
          pythonProcess.kill();
          console.error('Python script timeout after 30 seconds');
          reject(new Error('ML model analysis timed out after 30 seconds'));
        }, 30000);

        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          
          // Clean up input file
          try {
            if (fs.existsSync(inputPath)) {
              fs.unlinkSync(inputPath);
            }
          } catch (err) {
            // Ignore cleanup errors
          }

          if (code !== 0) {
            console.error('Python script exited with code:', code);
            console.error('Python script stderr:', stderr);
            // Clean up output file if it exists
            try {
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
              }
            } catch (err) {
              // Ignore
            }
            return reject(new Error(`ML model analysis failed (exit code ${code}): ${stderr || 'Unknown error'}`));
          }

          try {
            // Read output file
            if (!fs.existsSync(outputPath)) {
              throw new Error('Output file not created');
            }
            
            const outputContent = fs.readFileSync(outputPath, 'utf8');
            const result = JSON.parse(outputContent);
            
            // Clean up output file
            try {
              fs.unlinkSync(outputPath);
            } catch (err) {
              // Ignore cleanup errors
            }
            
            if (!result.success) {
              return reject(new Error(result.error || 'ML model analysis failed'));
            }

            // Validate the response structure
            if (
              typeof result.analysis.fellForPhishing !== 'boolean' ||
              typeof result.analysis.providedSensitiveInfo !== 'boolean' ||
              !Array.isArray(result.analysis.sensitiveInfoTypes) ||
              !['high', 'medium', 'low'].includes(result.analysis.resistanceLevel) ||
              typeof result.analysis.score !== 'number' ||
              typeof result.analysis.analysisRationale !== 'string'
            ) {
              throw new Error('Invalid analysis response structure from ML model');
            }

            // Ensure score is within valid range
            result.analysis.score = Math.max(0, Math.min(100, Math.round(result.analysis.score)));

            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse ML model response:', parseError);
            reject(new Error(`Failed to parse ML model response: ${parseError.message}`));
          }
        });

        pythonProcess.on('error', (error) => {
          console.error('Failed to spawn Python process:', error);
          reject(new Error(`Failed to run ML model: ${error.message}. Make sure Python 3 is installed and accessible.`));
        });

      } catch (error) {
        console.error('Error in Voice Phishing ML Service:', error);
        reject(error);
      }
    });
  }
}

module.exports = new VoicePhishingMLService();
