"""
Extract features from an incident for debugging. Reads JSON from stdin, prints JSON to stdout.
"""
import sys
import json
from pathlib import Path

_src = Path(__file__).resolve().parent.parent
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from ml_pipeline.inference_service import PhishingInferenceService


def main() -> None:
    try:
        incident_json = sys.stdin.read()
        incident_data = json.loads(incident_json)
        service = PhishingInferenceService()
        result = service.extract_features(incident_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "features": None}))
        sys.exit(1)


if __name__ == "__main__":
    main()
