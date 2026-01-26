"""
Standalone runner for ML phishing inference.
Reads JSON incident from stdin, writes JSON result to stdout.
Called by Node.js mlPhishingService.
"""
import sys
import json
from pathlib import Path

# Add backend src to path so "ml_pipeline" can be imported as a package
_src = Path(__file__).resolve().parent.parent
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from ml_pipeline.inference_service import PhishingInferenceService


def main() -> None:
    try:
        incident_json = sys.stdin.read()
        incident_data = json.loads(incident_json)
        service = PhishingInferenceService()
        result = service.predict_incident(incident_data)
        print(json.dumps(result))
    except Exception as e:
        out = {
            "success": False,
            "error": str(e),
            "is_phishing": None,
            "phishing_probability": None,
            "legitimate_probability": None,
            "confidence": None,
        }
        print(json.dumps(out))
        sys.exit(1)


if __name__ == "__main__":
    main()
