"""
CNN-BiLSTM model inference wrapper.
Provides same interface as ML model for seamless integration.
"""

import os
import joblib
import numpy as np
import tensorflow as tf
from typing import Dict, List, Any
import warnings
warnings.filterwarnings('ignore')

from cnn_bilstm_model import preprocess_text_for_cnn_bilstm
from preprocess_data import clean_text, tokenize_and_remove_stopwords

# Model directory
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
CNN_BILSTM_MODEL_PATH = os.path.join(MODEL_DIR, 'cnn_bilstm_model.h5')
CNN_BILSTM_TOKENIZER_PATH = os.path.join(MODEL_DIR, 'cnn_bilstm_tokenizer.pkl')
CNN_BILSTM_METADATA_PATH = os.path.join(MODEL_DIR, 'cnn_bilstm_metadata.json')


class CNNBiLSTMModel:
    """
    CNN-BiLSTM model for voice phishing detection.
    """
    
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.metadata = None
        self.loaded = False
        
    def load_model(self):
        """Load trained CNN-BiLSTM model, tokenizer, and metadata."""
        if self.loaded:
            return
        
        if not os.path.exists(CNN_BILSTM_MODEL_PATH):
            raise FileNotFoundError(
                f"CNN-BiLSTM model not found at {CNN_BILSTM_MODEL_PATH}. "
                f"Please train the model first using train_cnn_bilstm.py"
            )
        
        if not os.path.exists(CNN_BILSTM_TOKENIZER_PATH):
            raise FileNotFoundError(
                f"CNN-BiLSTM tokenizer not found at {CNN_BILSTM_TOKENIZER_PATH}. "
                f"Please train the model first using train_cnn_bilstm.py"
            )
        
        # Import AttentionWithContext for custom object
        from cnn_bilstm_model import AttentionWithContext
        
        # Load model with custom objects
        self.model = tf.keras.models.load_model(
            CNN_BILSTM_MODEL_PATH,
            custom_objects={'AttentionWithContext': AttentionWithContext}
        )
        
        # Load tokenizer
        self.tokenizer = joblib.load(CNN_BILSTM_TOKENIZER_PATH)
        
        # Load metadata
        if os.path.exists(CNN_BILSTM_METADATA_PATH):
            import json
            with open(CNN_BILSTM_METADATA_PATH, 'r') as f:
                self.metadata = json.load(f)
        
        self.loaded = True
        print("CNN-BiLSTM Model loaded successfully")
    
    def preprocess_transcript(self, transcript: str) -> str:
        """
        Preprocess transcript for inference.
        
        Args:
            transcript: Raw conversation transcript
            
        Returns:
            Preprocessed text
        """
        # Clean text
        cleaned = clean_text(transcript)
        
        # Tokenize and remove stopwords
        processed = tokenize_and_remove_stopwords(cleaned)
        
        return processed
    
    def predict(self, transcript: str) -> Dict[str, Any]:
        """
        Predict if transcript is phishing and calculate score.
        
        Args:
            transcript: Conversation transcript
            
        Returns:
            Dictionary with prediction results
        """
        if not self.loaded:
            self.load_model()
        
        # Preprocess
        processed_text = self.preprocess_transcript(transcript)
        
        if not processed_text or len(processed_text.strip()) == 0:
            return {
                'is_phishing': False,
                'confidence': 0.5,
                'score': 50
            }
        
        # Get metadata
        max_length = self.metadata.get('max_length', 200) if self.metadata else 200
        num_classes = self.metadata.get('num_classes', 2) if self.metadata else 2
        
        # Preprocess for CNN-BiLSTM
        sequences, _ = preprocess_text_for_cnn_bilstm(
            [processed_text],
            tokenizer=self.tokenizer,
            max_length=max_length
        )
        
        # Predict
        prediction_probs = self.model.predict(sequences, verbose=0)[0]
        
        if num_classes == 2:
            # Binary classification
            phishing_prob = float(prediction_probs[0])
            prediction = 1 if phishing_prob > 0.5 else 0
            confidence = phishing_prob if prediction == 1 else (1 - phishing_prob)
            probabilities = [1 - phishing_prob, phishing_prob]
        else:
            # Multi-class classification
            prediction = int(np.argmax(prediction_probs))
            confidence = float(max(prediction_probs))
            probabilities = prediction_probs.tolist()
        
        # Calculate score
        if num_classes == 3:
            if prediction == 0:  # Normal
                score = min(100, int(50 + 50 * confidence))
                is_phishing = False
                fell_for_it = False
            elif prediction == 1:  # Fell for it
                score = max(0, int(20 * (1 - confidence)))
                is_phishing = True
                fell_for_it = True
            else:  # Resisted
                score = max(60, int(60 + 20 * confidence))
                is_phishing = True
                fell_for_it = False
        else:
            # Binary classification
            if prediction == 1:  # Phishing
                score = max(0, int(100 * (1 - confidence)))
                is_phishing = True
                fell_for_it = None
            else:  # Normal
                score = min(100, int(50 + 50 * confidence))
                is_phishing = False
                fell_for_it = False
        
        return {
            'is_phishing': is_phishing,
            'fell_for_it': fell_for_it,
            'confidence': confidence,
            'score': score,
            'prediction': int(prediction),
            'probabilities': probabilities,
            'num_classes': num_classes
        }
    
    def analyze_conversation(self, transcript: str, scenario_type: str) -> Dict[str, Any]:
        """
        Analyze conversation transcript and provide detailed analysis.
        This method mimics the Gemini service output format.
        
        Args:
            transcript: Full conversation transcript
            scenario_type: "phishing" or "normal"
            
        Returns:
            Analysis results matching Gemini service format
        """
        if not self.loaded:
            self.load_model()
        
        # Get prediction from CNN-BiLSTM model
        prediction = self.predict(transcript)
        
        num_classes = prediction['num_classes']
        
        # Initialize variables
        provided_sensitive_info = []
        fell_for_phishing = False
        resistance_level = "medium"
        
        if num_classes == 3:
            # 3-class model
            model_pred = prediction['prediction']
            probabilities = prediction['probabilities']
            
            if model_pred == 0:
                # Normal conversation
                provided_sensitive_info = []
                fell_for_phishing = False
                resistance_level = "high"
            elif model_pred == 1:
                # Phishing, user fell for it
                # BUT: Double-check with pattern detection to verify user actually provided info
                # This prevents false positives when model misclassifies resistance as "fell for it"
                provided_sensitive_info = self._extract_info_types_from_model(transcript, probabilities)
                
                # If pattern detection found NO info provided, but model says "fell for it",
                # this might be a misclassification - check for resistance indicators
                if len(provided_sensitive_info) == 0:
                    # Model predicted "fell for it" but no info detected - might be resistance
                    # Check for strong resistance indicators
                    lines = transcript.split('\n')
                    user_text = ' '.join([
                        line.split(':', 1)[1].strip() if ':' in line else line
                        for line in lines
                        if line.lower().strip().startswith('you') or line.lower().strip().startswith('user')
                    ]).lower()
                    
                    strong_resistance = any(indicator in user_text for indicator in [
                        "i'll call you back", "call you back", "i don't have", "don't have",
                        "already verified", "what are you talking about", "why will",
                        "i'll check", "let me verify", "not comfortable"
                    ])
                    
                    if strong_resistance:
                        # Model misclassified - user actually resisted
                        # Override to "resisted" (class 2 behavior)
                        fell_for_phishing = False
                        resistance_level = "high"
                        provided_sensitive_info = []
                        # Adjust score to reflect resistance
                        prediction['score'] = max(60, int(60 + 20 * prediction['confidence']))
                    else:
                        # No strong resistance indicators - trust model
                        fell_for_phishing = True
                        resistance_level = "low"
                else:
                    # Info was detected - user fell for it
                    fell_for_phishing = True
                    resistance_level = "low"
            else:  # model_pred == 2
                # Phishing, user resisted
                provided_sensitive_info = self._extract_info_types_from_model(transcript, probabilities)
                
                if len(provided_sensitive_info) > 0:
                    # User actually provided info - override
                    fell_for_phishing = True
                    resistance_level = "low"
                    prediction['score'] = max(0, int(20 * (1 - prediction['confidence'])))
                else:
                    # User truly resisted
                    fell_for_phishing = False
                    resistance_level = "high"
        else:
            # 2-class model - use pattern detection
            model_pred = prediction['prediction']
            probabilities = prediction['probabilities']
            
            provided_sensitive_info = self._extract_info_types_from_model(transcript, probabilities)
            fell_for_phishing = prediction['is_phishing'] and len(provided_sensitive_info) > 0
            
            if len(provided_sensitive_info) > 0:
                resistance_level = "low"
            elif prediction['is_phishing']:
                resistance_level = "medium"
            else:
                resistance_level = "high"
        
        # Generate rationale
        rationale_parts = []
        
        if num_classes == 3:
            if model_pred == 0:
                rationale_parts.append("The conversation appears to be a normal interaction.")
            elif model_pred == 1 or (model_pred == 2 and len(provided_sensitive_info) > 0):
                rationale_parts.append("The conversation exhibits characteristics of a phishing attempt, and the user fell for it.")
            else:
                rationale_parts.append("The conversation exhibits characteristics of a phishing attempt, but the user resisted.")
        else:
            if prediction['is_phishing']:
                rationale_parts.append("The conversation exhibits characteristics of a phishing attempt.")
            else:
                rationale_parts.append("The conversation appears to be a normal interaction.")
        
        if provided_sensitive_info:
            rationale_parts.append(f"The user provided sensitive information: {', '.join(provided_sensitive_info)}.")
        else:
            rationale_parts.append("The user did not provide sensitive information.")
        
        if resistance_level == "high":
            rationale_parts.append("The user showed high resistance to potential phishing attempts.")
        elif resistance_level == "medium":
            rationale_parts.append("The user showed moderate resistance to potential phishing attempts.")
        else:
            rationale_parts.append("The user showed low resistance to potential phishing attempts.")
        
        analysis_rationale = " ".join(rationale_parts)
        
        analysis_result = {
            'fellForPhishing': fell_for_phishing,
            'providedSensitiveInfo': len(provided_sensitive_info) > 0,
            'sensitiveInfoTypes': provided_sensitive_info,
            'resistanceLevel': resistance_level,
            'score': prediction['score'],
            'analysisRationale': analysis_rationale,
            'modelPrediction': prediction['prediction'],
            'modelConfidence': prediction['confidence'],
            'modelType': 'cnn_bilstm',
            'isFullyModelBased': True
        }
        
        return {
            'success': True,
            'analysis': analysis_result
        }
    
    def _extract_info_types_from_model(self, transcript: str, probabilities: List[float]) -> List[str]:
        """
        Extract sensitive information types (same logic as ML model).
        """
        lines = transcript.split('\n')
        user_lines = []
        
        for line in lines:
            line_lower = line.lower().strip()
            if line_lower.startswith('you:') or line_lower.startswith('user:'):
                user_text = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                user_lines.append(user_text)
        
        user_text = ' '.join(user_lines).lower()
        
        if not user_text:
            user_text = transcript.lower()
        
        sensitive_keywords = {
            'password': ['password', 'passcode', 'pin', 'pass'],
            'cnic': ['cnic', 'national id', 'identity card', 'id card', 'cnic number'],
            'bank_account': ['account number', 'bank account', 'account'],
            'otp': ['otp', 'one time password', 'verification code'],
            'credit_card': ['credit card', 'card number', 'cvv'],
            'atm_pin': ['atm pin', 'atm code'],
            'personal_info': ['date of birth', 'mother name', 'father name', 'address']
        }
        
        negative_indicators = [
            "didn't", "don't", "haven't", "hasn't", "won't", "can't", "not",
            "no", "never", "nothing", "none", "refuse", "refused", "decline"
        ]
        
        provided_info_types = []
        for info_type, keywords in sensitive_keywords.items():
            for keyword in keywords:
                patterns = [
                    f'my {keyword} is',
                    f'my {keyword}:',
                    f'the {keyword} is',
                    f'{keyword} is',
                    f'{keyword}:',
                    f'my {keyword}',
                ]
                
                for pattern in patterns:
                    if pattern in user_text:
                        idx = user_text.find(pattern)
                        after = user_text[idx + len(pattern):].strip()
                        
                        if any(after.startswith(neg) for neg in negative_indicators):
                            continue
                        
                        before = user_text[max(0, idx - 30):idx]
                        if any(neg in before for neg in negative_indicators):
                            continue
                        
                        if len(after) > 0:
                            if any(c.isdigit() for c in after[:30]):
                                numbers = [w for w in after.split()[:3] if any(c.isdigit() for c in w)]
                                if numbers and len(numbers[0]) >= 3:
                                    if info_type not in provided_info_types:
                                        provided_info_types.append(info_type)
                                    break
                            
                            first_word = after.split()[0].lower() if after.split() else ""
                            if first_word and first_word not in ['though', 'but', 'however', 'i', 'we', 'the', 'a', 'an']:
                                if len(first_word) >= 4:
                                    if info_type not in provided_info_types:
                                        provided_info_types.append(info_type)
                                    break
        
        return provided_info_types


# Global model instance
_cnn_bilstm_instance = None


def get_cnn_bilstm_model() -> CNNBiLSTMModel:
    """Get or create global CNN-BiLSTM model instance."""
    global _cnn_bilstm_instance
    if _cnn_bilstm_instance is None:
        _cnn_bilstm_instance = CNNBiLSTMModel()
    return _cnn_bilstm_instance


def analyze_conversation_cnn_bilstm(transcript: str, scenario_type: str) -> Dict[str, Any]:
    """
    Analyze conversation transcript using CNN-BiLSTM model.
    
    Args:
        transcript: Full conversation transcript
        scenario_type: "phishing" or "normal"
        
    Returns:
        Analysis results matching Gemini service format
    """
    model = get_cnn_bilstm_model()
    return model.analyze_conversation(transcript, scenario_type)
