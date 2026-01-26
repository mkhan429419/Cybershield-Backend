import numpy as np
import torch
from typing import Dict, Any, List, Optional, Tuple
import pickle
from pathlib import Path

from .feature_extraction.multi_signal_extractor import MultiSignalFeatureExtractor
from .models.hybrid_model import HybridPhishingDetector
from .training.trainer import ModelTrainer, PhishingDataset
from .utils import to_float
from torch.utils.data import DataLoader
from sklearn.preprocessing import StandardScaler, LabelEncoder
import warnings
warnings.filterwarnings('ignore')


class PhishingDetectionPipeline:

    def __init__(self, model_path: Optional[str] = None, scaler_path: Optional[str] = None):
        self.feature_extractor = MultiSignalFeatureExtractor()
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.feature_order = None
        
        if model_path:
            self.load_model(model_path, scaler_path)
    
    def prepare_features(self,
                       incidents: List[Dict[str, Any]],
                       fit_scaler: bool = True) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        all_features = []
        labels = []
        for incident in incidents:
            features = self.feature_extractor.extract(
                text=incident.get('text', ''),
                message_type=incident.get('message_type', 'email'),
                metadata=incident.get('metadata', {}),
                urls=incident.get('urls', []),
                html_content=incident.get('html_content', None)
            )
            if self.feature_order is None:
                self.feature_order = sorted(features.keys())
            
            feature_vector = [to_float(features.get(feat, 0.0)) for feat in self.feature_order]
            all_features.append(feature_vector)
            if 'label' in incident:
                labels.append(incident['label'])
        
        features_array = np.array(all_features, dtype=np.float32)
        features_array = np.nan_to_num(features_array, nan=0.0, posinf=1.0, neginf=-1.0)
        if fit_scaler:
            features_array = self.scaler.fit_transform(features_array)
        else:
            features_array = self.scaler.transform(features_array)
        
        if labels:
            labels_array = self.label_encoder.fit_transform(labels) if fit_scaler else self.label_encoder.transform(labels)
            return features_array, labels_array
        else:
            return features_array, None
    
    def train(self,
              train_incidents: List[Dict[str, Any]],
              val_incidents: Optional[List[Dict[str, Any]]] = None,
              val_split: float = 0.2,
              batch_size: int = 32,
              epochs: int = 50,
              learning_rate: float = 0.001,
              use_adaptive_optimizer: bool = True,
              model_save_path: str = 'models/phishing_detector.pth',
              input_dim: Optional[int] = None) -> Dict[str, Any]:
        print("Preparing features...")
        X_train, y_train = self.prepare_features(train_incidents, fit_scaler=True)
        if val_incidents:
            X_val, y_val = self.prepare_features(val_incidents, fit_scaler=False)
        else:
            n_val = int(len(X_train) * val_split)
            indices = np.random.permutation(len(X_train))
            val_indices = indices[:n_val]
            train_indices = indices[n_val:]
            
            X_val = X_train[val_indices]
            y_val = y_train[val_indices]
            X_train = X_train[train_indices]
            y_train = y_train[train_indices]
        
        print(f"Training samples: {len(X_train)}, Validation samples: {len(X_val)}")
        print(f"Feature dimension: {X_train.shape[1]}")
        if input_dim is None:
            input_dim = X_train.shape[1]
        X_train_seq = X_train.reshape(X_train.shape[0], 1, X_train.shape[1])
        X_val_seq = X_val.reshape(X_val.shape[0], 1, X_val.shape[1])
        train_dataset = PhishingDataset(X_train_seq, y_train)
        val_dataset = PhishingDataset(X_val_seq, y_val)
        
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        print("Initializing model...")
        self.model = HybridPhishingDetector(
            input_dim=input_dim,
            sequence_length=1,
            num_classes=len(np.unique(y_train))
        ).to(self.device)
        trainer = ModelTrainer(
            model=self.model,
            device=self.device,
            optimizer_type='adam',
            learning_rate=learning_rate,
            use_adaptive=use_adaptive_optimizer
        )
        print("Starting training...")
        results = trainer.train(
            train_loader=train_loader,
            val_loader=val_loader,
            epochs=epochs,
            save_path=model_save_path,
            early_stopping_patience=10
        )
        self.save_scaler_and_features(model_save_path.replace('.pth', '_scaler.pkl'))
        
        print("Training completed!")
        return results
    
    def predict(self, incidents: List[Dict[str, Any]], return_proba: bool = False) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model not loaded. Please load a trained model first.")
        X, _ = self.prepare_features(incidents, fit_scaler=False)
        X_seq = X.reshape(X.shape[0], 1, X.shape[1])
        X_tensor = torch.FloatTensor(X_seq).to(self.device)
        self.model.eval()
        with torch.no_grad():
            if return_proba:
                probs = self.model.predict_proba(X_tensor)
                return probs.cpu().numpy()
            else:
                preds = self.model.predict(X_tensor)
                labels = self.label_encoder.inverse_transform(preds.cpu().numpy())
                return labels
    
    def predict_single(self, incident: Dict[str, Any], return_proba: bool = False) -> Dict[str, Any]:
        results = self.predict([incident], return_proba=return_proba)
        if return_proba:
            return {
                'is_phishing': results[0][1] > 0.5,
                'phishing_probability': float(results[0][1]),
                'legitimate_probability': float(results[0][0]),
                'confidence': float(abs(results[0][1] - 0.5) * 2)
            }
        else:
            return {
                'prediction': results[0],
                'is_phishing': results[0] == 'phishing' or results[0] == 1
            }
    
    def save_scaler_and_features(self, scaler_path: str):
        Path(scaler_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(scaler_path, 'wb') as f:
            pickle.dump({
                'scaler': self.scaler,
                'feature_order': self.feature_order,
                'label_encoder': self.label_encoder,
            }, f)
        
        print(f"Scaler and features saved to {scaler_path}")
    
    def load_model(self, model_path: str, scaler_path: Optional[str] = None):
        checkpoint = torch.load(model_path, map_location=self.device)
        if 'model_config' in checkpoint:
            config = checkpoint['model_config']
            input_dim = config['input_dim']
            sequence_length = config.get('sequence_length', 1)
        else:
            if scaler_path:
                with open(scaler_path, 'rb') as f:
                    scaler_data = pickle.load(f)
                    if isinstance(scaler_data, dict):
                        self.feature_order = scaler_data.get('feature_order')
                    else:
                        self.scaler = scaler_data
                if self.feature_order:
                    input_dim = len(self.feature_order)
                else:
                    raise ValueError("Cannot determine input_dim. Please provide scaler_path with feature_order.")
            else:
                raise ValueError("Cannot determine input_dim. Please provide scaler_path.")
            sequence_length = 1
        self.model = HybridPhishingDetector(
            input_dim=input_dim,
            sequence_length=sequence_length,
            num_classes=2
        ).to(self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()
        if 'feature_order' in checkpoint:
            self.feature_order = checkpoint['feature_order']
        if 'label_encoder' in checkpoint:
            self.label_encoder = checkpoint['label_encoder']
        if scaler_path:
            with open(scaler_path, 'rb') as f:
                scaler_data = pickle.load(f)
                if isinstance(scaler_data, dict):
                    self.scaler = scaler_data['scaler']
                    if 'feature_order' in scaler_data:
                        self.feature_order = scaler_data['feature_order']
                    if 'label_encoder' in scaler_data:
                        self.label_encoder = scaler_data['label_encoder']
                else:
                    self.scaler = scaler_data
        
        print(f"Model loaded from {model_path}")
