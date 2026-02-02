"""
Standalone script to run fusion inference.
Can be called from Node.js or used directly.
"""

import sys
import json
import os
from pathlib import Path

# Add backend directory to path
_backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_backend_dir))

from src.ml_pipeline.fusion_inference_service import get_fusion_inference_service


def main():
    """Main function for fusion inference."""
    if len(sys.argv) < 2:
        print("Usage: python run_fusion_inference.py <input_json_path> [output_json_path]")
        print("\nInput JSON format:")
        print(json.dumps({
            "text": "Email or message text",
            "message_type": "email|whatsapp|voice|None",
            "transcript": "Voice conversation transcript (optional)",
            "metadata": {},
            "urls": [],
            "html_content": None,
            "scenario_type": "normal"
        }, indent=2))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        # Read input
        with open(input_path, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
        
        # Get fusion service
        service = get_fusion_inference_service(
            fusion_strategy=input_data.get("fusion_strategy", "weighted_ensemble")
        )
        
        # Run prediction
        result = service.predict_incident(input_data, use_fusion=True)
        
        # Write output
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
        else:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        
        print(f"\nFusion prediction completed successfully", file=sys.stderr)
        print(f"Result: is_phishing={result.get('is_phishing')}, "
              f"probability={result.get('phishing_probability')}, "
              f"confidence={result.get('confidence')}", file=sys.stderr)
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(error_result, f, indent=2)
        else:
            print(json.dumps(error_result, indent=2))
        
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
