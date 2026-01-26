import pickle
import numpy as np
import torch
from pathlib import Path
from typing import Dict, Any, List, Optional

from .feature_extraction.multi_signal_extractor import MultiSignalFeatureExtractor
from .feature_extraction.persuasion_cues import PersuasionCueExtractor
from .heuristic_engine import EmailHeuristicEngine
from .models.hybrid_model import HybridPhishingDetector
from .utils import to_float, correlate_stub


class EmailDetector:

    W_HEURISTIC, W_ML, W_DEEP = 0.12, 0.36, 0.36
    W_NEUTRAL = 0.12
    SCORE_COMPRESS = 0.78
    PHISHING_THRESHOLD = 0.52

    def __init__(
        self,
        ml_path: Optional[str] = None,
        deep_path: Optional[str] = None,
        deep_scaler_path: Optional[str] = None,
        models_dir: Optional[str] = None,
    ):
        _base = Path(__file__).resolve().parent
        self.models_dir = Path(models_dir) if models_dir else _base / "model_artifacts"
        self.ml_path = Path(ml_path) if ml_path else self.models_dir / "email_ml.pkl"
        self.deep_path = Path(deep_path) if deep_path else self.models_dir / "email_phishing_detector.pth"
        self.deep_scaler_path = Path(deep_scaler_path) if deep_scaler_path else self.models_dir / "email_phishing_detector_scaler.pkl"
        self.feature_extractor = MultiSignalFeatureExtractor()
        self.persuasion = PersuasionCueExtractor()
        self.heuristic = EmailHeuristicEngine()
        self._ml_clf = self._ml_scaler = self._ml_order = None
        self._deep_model = self._deep_scaler = self._deep_order = None
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._load()

    def _load(self):
        if self.ml_path.exists():
            with open(self.ml_path, "rb") as f:
                d = pickle.load(f)
            self._ml_clf, self._ml_scaler = d.get("clf"), d.get("scaler")
            self._ml_order = d.get("feature_order") or []
        if self.deep_path.exists() and self.deep_scaler_path.exists():
            with open(self.deep_scaler_path, "rb") as f:
                sd = pickle.load(f)
            self._deep_scaler = sd["scaler"] if isinstance(sd, dict) else sd
            self._deep_order = sd.get("feature_order") if isinstance(sd, dict) else None
            ck = torch.load(self.deep_path, map_location=self._device)
            cfg = ck.get("model_config", {})
            self._deep_model = HybridPhishingDetector(
                input_dim=cfg.get("input_dim", len(self._deep_order or [])),
                sequence_length=cfg.get("sequence_length", 1),
                num_classes=2,
            ).to(self._device)
            self._deep_model.load_state_dict(ck["model_state_dict"])
            self._deep_model.eval()
            if self._deep_order is None and "feature_order" in ck:
                self._deep_order = ck["feature_order"]

    @property
    def is_loaded(self) -> bool:
        return self._ml_clf is not None and self._deep_model is not None

    def _extract_features(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        return self.feature_extractor.extract(
            text=incident.get("text", ""),
            message_type="email",
            metadata=incident.get("metadata", {}),
            urls=incident.get("urls", []),
            html_content=incident.get("html_content"),
        )

    def _heuristic_score(self, incident: Dict[str, Any]) -> float:
        meta = incident.get("metadata") or {}
        return self.heuristic.compute(meta, subject=meta.get("subject", ""), sender=meta.get("from") or meta.get("from_email", ""))

    def _ml_proba(self, features: Dict[str, Any]) -> float:
        if not self._ml_clf or not self._ml_order:
            return 0.5
        vec = [to_float(features.get(k, 0.0)) for k in self._ml_order]
        X = np.nan_to_num(np.array([vec], dtype=np.float32), nan=0.0, posinf=1.0, neginf=-1.0)
        X = self._ml_scaler.transform(X)
        return float(self._ml_clf.predict_proba(X)[0, 1])

    def _deep_proba(self, features: Dict[str, Any]) -> float:
        if not self._deep_model or not self._deep_order:
            return 0.5
        vec = [to_float(features.get(k, 0.0)) for k in self._deep_order]
        X = np.nan_to_num(np.array([vec], dtype=np.float32), nan=0.0, posinf=1.0, neginf=-1.0)
        X = self._deep_scaler.transform(X).reshape(1, 1, -1)
        with torch.no_grad():
            probs = torch.softmax(self._deep_model(torch.FloatTensor(X).to(self._device)), dim=1)
        return float(probs[0, 1].cpu().numpy())

    def predict(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        if not self.is_loaded:
            return {"success": False, "error": "Email models not loaded. Train email model first.", "is_phishing": None,
                    "phishing_probability": None, "legitimate_probability": None, "confidence": None,
                    "persuasion_cues": [], "correlation": {}}
        try:
            text = incident.get("text", "") or ""
            f = self._extract_features(incident)
            h = self._heuristic_score(incident)
            ml = self._ml_proba(f)
            deep = self._deep_proba(f)
            raw = self.W_HEURISTIC * h + self.W_ML * ml + self.W_DEEP * deep + self.W_NEUTRAL * 0.5
            p = 0.5 + (min(1.0, max(0.0, raw)) - 0.5) * self.SCORE_COMPRESS
            p = min(1.0, max(0.0, p))
            return {
                "success": True,
                "is_phishing": p > self.PHISHING_THRESHOLD,
                "phishing_probability": round(p, 4),
                "legitimate_probability": round(1.0 - p, 4),
                "confidence": round(abs(p - 0.5) * 2.0, 4),
                "persuasion_cues": self.persuasion.extract_labels_only(text),
                "correlation": correlate_stub(incident),
            }
        except Exception as e:
            return {"success": False, "error": str(e), "is_phishing": None, "phishing_probability": None,
                    "legitimate_probability": None, "confidence": None, "persuasion_cues": [], "correlation": {}}


class MessagingDetector:

    W_NEUTRAL = 0.12
    SCORE_COMPRESS = 0.60
    PHISHING_THRESHOLD = 0.53

    def __init__(
        self,
        lexical_path: Optional[str] = None,
        structural_path: Optional[str] = None,
        deep_path: Optional[str] = None,
        deep_scaler_path: Optional[str] = None,
        models_dir: Optional[str] = None,
    ):
        _base = Path(__file__).resolve().parent
        self.models_dir = Path(models_dir) if models_dir else _base / "model_artifacts"
        self.lexical_path = Path(lexical_path) if lexical_path else self.models_dir / "whatsapp_lexical.pkl"
        self.structural_path = Path(structural_path) if structural_path else self.models_dir / "whatsapp_structural.pkl"
        self.deep_path = Path(deep_path) if deep_path else self.models_dir / "whatsapp_phishing_detector.pth"
        self.deep_scaler_path = Path(deep_scaler_path) if deep_scaler_path else self.models_dir / "whatsapp_phishing_detector_scaler.pkl"
        self.feature_extractor = MultiSignalFeatureExtractor()
        self.persuasion = PersuasionCueExtractor()
        self._lexical = self._structural = self._structural_order = None
        self._deep_model = self._deep_scaler = self._deep_order = None
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._load()

    def _load(self):
        if self.lexical_path.exists():
            with open(self.lexical_path, "rb") as f:
                self._lexical = pickle.load(f)
        if self.structural_path.exists():
            with open(self.structural_path, "rb") as f:
                d = pickle.load(f)
            self._structural = (d.get("clf"), d.get("scaler"))
            self._structural_order = d.get("feature_order") or []
        else:
            self._structural_order = []
        if self.deep_path.exists() and self.deep_scaler_path.exists():
            with open(self.deep_scaler_path, "rb") as f:
                sd = pickle.load(f)
            self._deep_scaler = sd["scaler"] if isinstance(sd, dict) else sd
            self._deep_order = sd.get("feature_order") if isinstance(sd, dict) else None
            ck = torch.load(self.deep_path, map_location=self._device)
            cfg = ck.get("model_config", {})
            self._deep_model = HybridPhishingDetector(
                input_dim=cfg.get("input_dim", len(self._deep_order or [])),
                sequence_length=cfg.get("sequence_length", 1),
                num_classes=2,
            ).to(self._device)
            self._deep_model.load_state_dict(ck["model_state_dict"])
            self._deep_model.eval()
            if self._deep_order is None and "feature_order" in ck:
                self._deep_order = ck["feature_order"]

    @property
    def is_loaded(self) -> bool:
        return (self._lexical is not None and self._structural is not None and self._structural[0] is not None
                and self._deep_model is not None)

    def _extract_features(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        return self.feature_extractor.extract(
            text=incident.get("text", ""),
            message_type="whatsapp",
            metadata=incident.get("metadata", {}),
            urls=incident.get("urls", []),
            html_content=incident.get("html_content"),
        )

    def _lexical_proba(self, text: str) -> float:
        if not self._lexical:
            return 0.5
        tfidf, clf = self._lexical.get("tfidf"), self._lexical.get("clf")
        if not tfidf or not clf:
            return 0.5
        proba = clf.predict_proba(tfidf.transform([text or ""]))[0]
        return float(proba[1])

    def _structural_proba(self, features: Dict[str, Any]) -> float:
        if not self._structural or not self._structural_order or self._structural[0] is None:
            return 0.5
        clf, scaler = self._structural
        vec = [to_float(features.get(k, 0.0)) for k in self._structural_order]
        X = scaler.transform(np.nan_to_num(np.array([vec], dtype=np.float32), nan=0.0, posinf=1.0, neginf=-1.0))
        return float(clf.predict_proba(X)[0, 1])

    def _deep_proba(self, features: Dict[str, Any]) -> float:
        if not self._deep_model or not self._deep_order:
            return 0.5
        vec = [to_float(features.get(k, 0.0)) for k in self._deep_order]
        X = self._deep_scaler.transform(np.nan_to_num(np.array([vec], dtype=np.float32), nan=0.0, posinf=1.0, neginf=-1.0)).reshape(1, 1, -1)
        with torch.no_grad():
            probs = torch.softmax(self._deep_model(torch.FloatTensor(X).to(self._device)), dim=1)
        return float(probs[0, 1].cpu().numpy())

    def predict(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        if not self.is_loaded:
            return {"success": False, "error": "Messaging models not loaded. Train WhatsApp model first.", "is_phishing": None,
                    "phishing_probability": None, "legitimate_probability": None, "confidence": None,
                    "persuasion_cues": [], "correlation": {}}
        try:
            text = incident.get("text", "") or ""
            f = self._extract_features(incident)
            lex = self._lexical_proba(text)
            struct = self._structural_proba(f)
            deep = self._deep_proba(f)
            raw = (lex + struct + deep) / 3.0
            raw = raw * (1.0 - self.W_NEUTRAL) + self.W_NEUTRAL * 0.5
            p = 0.5 + (min(1.0, max(0.0, raw)) - 0.5) * self.SCORE_COMPRESS
            p = min(1.0, max(0.0, p))
            return {
                "success": True,
                "is_phishing": p > self.PHISHING_THRESHOLD,
                "phishing_probability": round(p, 4),
                "legitimate_probability": round(1.0 - p, 4),
                "confidence": round(abs(p - 0.5) * 2.0, 4),
                "persuasion_cues": self.persuasion.extract_labels_only(text),
                "correlation": correlate_stub(incident),
            }
        except Exception as e:
            return {"success": False, "error": str(e), "is_phishing": None, "phishing_probability": None,
                    "legitimate_probability": None, "confidence": None, "persuasion_cues": [], "correlation": {}}
