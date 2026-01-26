"""
Feature extraction for phishing detection. MultiSignalFeatureExtractor aggregates all signals.
"""

from .multi_signal_extractor import MultiSignalFeatureExtractor
from .persuasion_cues import PersuasionCueExtractor

__all__ = ["MultiSignalFeatureExtractor", "PersuasionCueExtractor"]
