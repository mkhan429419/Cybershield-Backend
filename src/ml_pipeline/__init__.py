"""
ML Pipeline Module for Phishing Detection
Combines methodologies from multiple research papers:
1. Multi-Signal Model for Detecting Evasive Smishing
2. Hybrid Deep Learning Approaches to Smishing Attack Detection
3. Deep Learning with Adaptive Optimization for Email Phishing
4. FusionBench: Deep Model Fusion for Multi-Task Learning
"""

from .pipeline import PhishingDetectionPipeline
from .feature_extraction import MultiSignalFeatureExtractor
from .model_fusion import UnifiedPhishingFusion, FusionStrategy, get_fusion_service
from .fusion_inference_service import FusionInferenceService, get_fusion_inference_service

__all__ = [
    "PhishingDetectionPipeline",
    "MultiSignalFeatureExtractor",
    "UnifiedPhishingFusion",
    "FusionStrategy",
    "get_fusion_service",
    "FusionInferenceService",
    "get_fusion_inference_service"
]
