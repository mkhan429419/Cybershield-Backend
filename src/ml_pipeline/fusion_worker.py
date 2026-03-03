"""
Long-lived fusion inference worker.
Loads models once at startup, then serves predictions via stdin/stdout (one JSON line per request).
This avoids loading PyTorch/TensorFlow and model weights on every request.
"""

import sys
import json
from pathlib import Path

# Backend root on path (same as run_fusion_inference.py)
_backend_dir = Path(__file__).resolve().parent.parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Load fusion service once at startup (models load here)
def _warmup():
    import os
    from src.ml_pipeline.fusion_inference_service import get_fusion_inference_service
    strategy = os.environ.get("FUSION_STRATEGY", "advanced_fusion")
    return get_fusion_inference_service(fusion_strategy=strategy)


def main():
    print("Fusion worker: loading models...", file=sys.stderr, flush=True)
    try:
        service = _warmup()
        print("Fusion worker: ready (models in memory)", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"Fusion worker: failed to load models: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    # One JSON line per request on stdin; one JSON line per response on stdout
    for line in sys.stdin:
        line = line.strip()
        if not line or line == "exit":
            break
        try:
            input_data = json.loads(line)
            result = service.predict_incident(input_data, use_fusion=True)
        except Exception as e:
            result = {
                "success": False,
                "error": str(e),
                "is_phishing": None,
                "phishing_probability": None,
                "legitimate_probability": None,
                "confidence": None,
            }
        # Single line JSON so Node can readline()
        out = json.dumps(result, ensure_ascii=False)
        print(out, flush=True)


if __name__ == "__main__":
    main()
