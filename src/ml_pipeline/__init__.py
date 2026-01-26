"""
ML Pipeline Module for Phishing Detection
Combines methodologies from multiple research papers:
1. Multi-Signal Model for Detecting Evasive Smishing
2. Hybrid Deep Learning Approaches to Smishing Attack Detection
3. Deep Learning with Adaptive Optimization for Email Phishing
"""

from .pipeline import PhishingDetectionPipeline
from .feature_extraction import MultiSignalFeatureExtractor

__all__ = ["PhishingDetectionPipeline", "MultiSignalFeatureExtractor"]
