"""
Standalone script to run inference for voice phishing detection.
Called from Node.js service.
"""

import sys
import json
import os
import traceback

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from model_inference import analyze_conversation

if __name__ == "__main__":
    if len(sys.argv) != 3:
        error_result = {
            'success': False,
            'error': 'Usage: python run_inference.py <input_json_path> <output_json_path>'
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        # Read input
        with open(input_path, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
        
        transcript = input_data.get('transcript', '')
        scenario_type = input_data.get('scenario_type', 'normal')
        model_type = input_data.get('model_type', 'auto')  # 'auto', 'ml', 'cnn_bilstm', 'ensemble'
        
        print(f"Running analysis with model_type: {model_type}", file=sys.stderr)
        
        # Run analysis with specified model type
        result = analyze_conversation(transcript, scenario_type, model_type=model_type)
        
        # Write output
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"Analysis completed successfully", file=sys.stderr)
        
    except Exception as e:
        error_msg = str(e)
        error_traceback = traceback.format_exc()
        
        print(f"Error in run_inference.py: {error_msg}", file=sys.stderr)
        print(f"Traceback: {error_traceback}", file=sys.stderr)
        
        error_result = {
            'success': False,
            'error': error_msg,
            'traceback': error_traceback
        }
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dumpjson.dump(error_result, f, indent=2)
        except:
            # If we can't write to output file, at least print to stderr
            print(json.dumps(error_result), file=sys.stderr)
        
        sys.exit(1)
