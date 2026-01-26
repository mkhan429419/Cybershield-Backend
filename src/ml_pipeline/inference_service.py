import json
from pathlib import Path
from typing import Dict, Any, Optional

from .detectors import EmailDetector, MessagingDetector


class PhishingInferenceService:

    def __init__(
        self,
        model_path: Optional[str] = None,
        scaler_path: Optional[str] = None,
        models_dir: Optional[str] = None,
    ):
        _base = Path(__file__).resolve().parent
        md = Path(models_dir) if models_dir else _base / "model_artifacts"
        self.models_dir = md
        self.email_detector = EmailDetector(models_dir=str(md))
        self.messaging_detector = MessagingDetector(models_dir=str(md))

    def predict_incident(self, incident_data: Dict[str, Any]) -> Dict[str, Any]:
        incident = {
            "text": incident_data.get("text", ""),
            "message_type": incident_data.get("message_type", "email"),
            "metadata": incident_data.get("metadata", {}),
            "urls": incident_data.get("urls", []),
            "html_content": incident_data.get("html_content", None),
        }
        msg_type = (incident["message_type"] or "email").lower().strip()
        if msg_type == "whatsapp" or msg_type == "sms" or msg_type == "messaging":
            out = self.messaging_detector.predict(incident)
        else:
            out = self.email_detector.predict(incident)

        if not out.get("success"):
            return {
                "success": False,
                "error": out.get("error", "Prediction failed."),
                "is_phishing": None,
                "phishing_probability": None,
                "legitimate_probability": None,
                "confidence": None,
                "features_extracted": False,
            }
        return {
            "success": True,
            "is_phishing": out["is_phishing"],
            "phishing_probability": out["phishing_probability"],
            "legitimate_probability": out["legitimate_probability"],
            "confidence": out["confidence"],
            "features_extracted": True,
            "persuasion_cues": out.get("persuasion_cues", []),
            "correlation": out.get("correlation", {}),
        }

    def extract_features(self, incident_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from .feature_extraction.multi_signal_extractor import MultiSignalFeatureExtractor

            extractor = MultiSignalFeatureExtractor()
            features = extractor.extract(
                text=incident_data.get("text", ""),
                message_type=incident_data.get("message_type", "email"),
                metadata=incident_data.get("metadata", {}),
                urls=incident_data.get("urls", []),
                html_content=incident_data.get("html_content", None),
            )
            return {"success": True, "features": features, "feature_count": len(features)}
        except Exception as e:
            return {"success": False, "error": str(e), "features": None}


_inference_service = None


def get_inference_service(
    model_path: Optional[str] = None,
    scaler_path: Optional[str] = None,
    models_dir: Optional[str] = None,
) -> PhishingInferenceService:
    global _inference_service
    if _inference_service is None:
        _inference_service = PhishingInferenceService(
            model_path=model_path,
            scaler_path=scaler_path,
            models_dir=models_dir,
        )
    return _inference_service


def predict_incident_json(incident_json: str) -> str:
    try:
        incident_data = json.loads(incident_json)
        service = get_inference_service()
        result = service.predict_incident(incident_data)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e), "is_phishing": None})
