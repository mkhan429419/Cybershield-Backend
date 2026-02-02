"""
Fusion Inference Service
Provides unified API for fused model predictions.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

from .model_fusion import UnifiedPhishingFusion, FusionStrategy, get_fusion_service


class FusionInferenceService:
    """
    Unified inference service that uses fused models for predictions.
    """
    
    def __init__(
        self,
        models_dir: Optional[str] = None,
        fusion_strategy: str = "weighted_ensemble",
        model_weights: Optional[Dict[str, float]] = None,
    ):
        """
        Initialize fusion inference service.
        
        Args:
            models_dir: Directory containing model artifacts
            fusion_strategy: Fusion strategy name ("ensemble_average", "weighted_ensemble", 
                           "confidence_weighted", "max_voting", "stacked_fusion")
            model_weights: Optional weights for each model
        """
        # Map strategy string to enum
        strategy_map = {
            "ensemble_average": FusionStrategy.ENSEMBLE_AVERAGE,
            "weighted_ensemble": FusionStrategy.WEIGHTED_ENSEMBLE,
            "confidence_weighted": FusionStrategy.CONFIDENCE_WEIGHTED,
            "max_voting": FusionStrategy.MAX_VOTING,
            "stacked_fusion": FusionStrategy.STACKED_FUSION,
            "advanced_fusion": FusionStrategy.ADVANCED_FUSION,
        }
        
        strategy = strategy_map.get(fusion_strategy.lower(), FusionStrategy.ADVANCED_FUSION)  # Default to advanced fusion
        
        self.fusion_service = UnifiedPhishingFusion(
            models_dir=models_dir,
            fusion_strategy=strategy,
            model_weights=model_weights
        )
    
    def predict_incident(
        self,
        incident_data: Dict[str, Any],
        use_fusion: bool = True
    ) -> Dict[str, Any]:
        """
        Predict phishing probability for an incident using fused models.
        
        Args:
            incident_data: Incident data dictionary with:
                - text: Text content
                - message_type: "email", "whatsapp", "voice", or None for all
                - metadata: Additional metadata
                - urls: List of URLs
                - html_content: HTML content
                - transcript: Conversation transcript (for voice)
                - scenario_type: Scenario type (for voice)
            use_fusion: Whether to use fusion (True) or individual model (False)
            
        Returns:
            Prediction result dictionary
        """
        if not use_fusion:
            # Fallback to individual model prediction
            from .inference_service import PhishingInferenceService
            service = PhishingInferenceService(models_dir=self.fusion_service.models_dir)
            return service.predict_incident(incident_data)
        
        try:
            text = incident_data.get("text", "")
            message_type = incident_data.get("message_type")
            transcript = incident_data.get("transcript")
            scenario_type = incident_data.get("scenario_type", "normal")
            
            # Use fusion service
            result = self.fusion_service.predict_unified(
                text=text,
                message_type=message_type,
                transcript=transcript,
                metadata=incident_data.get("metadata", {}),
                urls=incident_data.get("urls", []),
                html_content=incident_data.get("html_content"),
                scenario_type=scenario_type
            )
            
            return {
                "success": result.get("success", True),
                "is_phishing": result.get("is_phishing"),
                "phishing_probability": result.get("phishing_probability"),
                "legitimate_probability": result.get("legitimate_probability"),
                "confidence": result.get("confidence"),
                "fusion_method": result.get("fusion_method"),
                "model_predictions": result.get("model_predictions", {}),
                "model_weights": result.get("model_weights", {}),
                "features_extracted": True
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "is_phishing": None,
                "phishing_probability": None,
                "legitimate_probability": None,
                "confidence": None
            }
    
    def predict_voice_conversation(
        self,
        transcript: str,
        scenario_type: str = "normal",
        include_text_models: bool = True
    ) -> Dict[str, Any]:
        """
        Predict phishing probability for a voice conversation.
        
        Args:
            transcript: Conversation transcript
            scenario_type: Scenario type
            include_text_models: Whether to also use email/whatsapp models on transcript text
            
        Returns:
            Prediction result dictionary
        """
        incident_data = {
            "text": transcript if include_text_models else "",
            "message_type": "voice",
            "transcript": transcript,
            "scenario_type": scenario_type
        }
        
        return self.predict_incident(incident_data, use_fusion=True)
    
    def extract_features(self, incident_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract features from incident data.
        
        Args:
            incident_data: Incident data dictionary
            
        Returns:
            Features dictionary
        """
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


# Global service instance
_fusion_inference_service = None


def get_fusion_inference_service(
    models_dir: Optional[str] = None,
    fusion_strategy: str = "weighted_ensemble",
    model_weights: Optional[Dict[str, float]] = None
) -> FusionInferenceService:
    """Get or create global fusion inference service instance."""
    global _fusion_inference_service
    if _fusion_inference_service is None:
        _fusion_inference_service = FusionInferenceService(
            models_dir=models_dir,
            fusion_strategy=fusion_strategy,
            model_weights=model_weights
        )
    return _fusion_inference_service


def predict_incident_json(incident_json: str, use_fusion: bool = True) -> str:
    """
    Predict phishing probability from JSON string.
    
    Args:
        incident_json: JSON string containing incident data
        use_fusion: Whether to use fusion
        
    Returns:
        JSON string with prediction results
    """
    try:
        incident_data = json.loads(incident_json)
        service = get_fusion_inference_service()
        result = service.predict_incident(incident_data, use_fusion=use_fusion)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e), "is_phishing": None})
