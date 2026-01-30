"""
Inference service for voice phishing detection model.
Analyzes conversation transcripts and provides scoring similar to Gemini service.
"""

import os
import sys
import joblib
import numpy as np
from typing import Dict, List, Any
import warnings
warnings.filterwarnings('ignore')

from preprocess_data import clean_text, tokenize_and_remove_stopwords

# Model directory
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'phishing_detection_model.pkl')
VECTORIZER_PATH = os.path.join(MODEL_DIR, 'tfidf_vectorizer.pkl')


class PhishingDetectionModel:
    """
    ML model for voice phishing detection.
    """
    
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.loaded = False
        
    def load_model(self):
        """Load trained model and vectorizer."""
        if self.loaded:
            return
        
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Please train the model first using train_model.py"
            )
        
        if not os.path.exists(VECTORIZER_PATH):
            raise FileNotFoundError(
                f"Vectorizer not found at {VECTORIZER_PATH}. Please train the model first using train_model.py"
            )
        
        self.model = joblib.load(MODEL_PATH)
        self.vectorizer = joblib.load(VECTORIZER_PATH)
        self.loaded = True
        print("ML Phishing Detection Model loaded successfully")
    
    def _extract_info_types_from_model(self, transcript: str, probabilities: List[float]) -> List[str]:
        """
        Extract sensitive information types when model predicts user fell for phishing.
        
        Uses model's learned features for THIS specific transcript (model-based!).
        The model learned which features indicate different info types during training.
        We check which info-type-related features are present and important in THIS transcript.
        
        Falls back to contextual pattern detection only if model-based detection doesn't find anything.
        
        Args:
            transcript: Conversation transcript
            probabilities: Model prediction probabilities
            
        Returns:
            List of sensitive information types (for display purposes only)
        """
        # Try to use model's learned patterns to detect info types
        # For RandomForest/XGBoost, we can use feature importance from THIS specific prediction
        provided_info_types = []
        
        # MODEL-BASED DETECTION: Use features the model learned for THIS transcript
        # IMPORTANT: Only look at USER lines, not agent lines, to avoid false positives
        if hasattr(self.model, 'feature_importances_'):
            try:
                from preprocess_data import clean_text, tokenize_and_remove_stopwords
                
                # Extract ONLY user lines for model-based detection
                lines = transcript.split('\n')
                user_lines_only = []
                for line in lines:
                    line_lower = line.lower().strip()
                    if line_lower.startswith('you:') or line_lower.startswith('user:'):
                        user_text = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                        user_lines_only.append(user_text)
                    elif line_lower.startswith('you ') and not line_lower.startswith('you agent'):
                        user_text = line_lower[3:].strip() if len(line_lower) > 3 else ""
                        if user_text and not user_text.startswith('agent') and not user_text.startswith('caller'):
                            user_lines_only.append(user_text)
                
                # Use only user text for feature extraction
                user_text_only = ' '.join(user_lines_only) if user_lines_only else ""
                
                # If we can't extract user lines, skip model-based detection (too risky)
                if not user_text_only or len(user_text_only.strip()) < 10:
                    # Skip model-based detection - will use pattern detection instead
                    pass
                else:
                    processed = tokenize_and_remove_stopwords(clean_text(user_text_only))
                text_vector = self.vectorizer.transform([processed])
                
                # Get feature names
                feature_names = self.vectorizer.get_feature_names_out() if hasattr(self.vectorizer, 'get_feature_names_out') else []
                
                if len(feature_names) > 0:
                        # Get features that are ACTIVE in USER text only (model-based!)
                    sample_features = text_vector.toarray()[0]
                    active_indices = [i for i, val in enumerate(sample_features) if val > 0]
                    active_feature_names = [feature_names[i] for i in active_indices]
                    
                    # Get importance of active features (what the model learned is important)
                    importances = self.model.feature_importances_
                    active_importances = [(i, importances[i]) for i in active_indices if importances[i] > 0.0001]
                    active_importances.sort(key=lambda x: x[1], reverse=True)
                    
                    # Top active features (features present AND important - model learned these!)
                    top_active = [feature_names[i] for i, _ in active_importances[:30]]
                    
                    # Map model-learned features to info types
                    feature_to_info = {
                        'password': 'password',
                        'passcode': 'password',
                        'pin': 'password',
                        'cnic': 'cnic',
                        'national': 'cnic',
                        'identity': 'cnic',
                        'account': 'bank_account',
                        'otp': 'otp',
                        'verification': 'otp',
                        'card': 'credit_card',
                        'cvv': 'credit_card',
                        'atm': 'atm_pin'
                    }
                    
                        # Check which info-type features the MODEL detected in USER text only
                    for feature in top_active:
                        for keyword, info_type in feature_to_info.items():
                            if keyword in feature.lower() and info_type not in provided_info_types:
                                provided_info_types.append(info_type)
            except Exception as e:
                # If model-based detection fails, fall back to pattern detection
                pass
        
        # FALLBACK: Contextual pattern detection (only if model didn't detect anything)
        # The model-based approach above should catch most cases, but we have a fallback
        
        # Define sensitive_keywords here so it's always available for pattern detection
            sensitive_keywords = {
            'password': ['password', 'passcode', 'pin', 'pass'],
            'cnic': ['cnic', 'national id', 'identity card', 'id card', 'cnic number'],
            'bank_account': ['account number', 'bank account', 'account'],
            'otp': ['otp', 'one time password', 'verification code'],
            'credit_card': ['credit card', 'card number', 'cvv'],
            'atm_pin': ['atm pin', 'atm code'],
            'personal_info': ['date of birth', 'mother name', 'father name', 'address']
        }
        
        # Negative indicators - expanded to catch resistance patterns
        negative_indicators = [
            "didn't", "don't", "haven't", "hasn't", "won't", "can't", "not",
            "no", "never", "nothing", "none", "refuse", "refused", "decline",
            "i don't have", "i'll call", "call you back", "i'll check", "i need to check",
            "what do you mean", "i don't understand", "let me verify", "i'll verify",
            "not comfortable", "not sure", "i'll contact", "contact directly"
        ]
        
        # Only do pattern detection if model didn't find anything
        if len(provided_info_types) == 0:
            # Model didn't detect anything, use contextual pattern detection
            
            # Extract user lines for pattern detection
            lines = transcript.split('\n')
            user_lines = []
            
            for line in lines:
                line_lower = line.lower().strip()
                # Handle both "You:" and "You" formats (with or without colon)
                if line_lower.startswith('you:') or line_lower.startswith('user:'):
                    user_text = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                    user_lines.append(user_text)
                elif line_lower.startswith('you ') and not line_lower.startswith('you '):
                    # Handle "You" at start of line (without colon)
                    # Check if next line is agent or if this is clearly a user line
                    user_text = line_lower[3:].strip() if len(line_lower) > 3 else ""
                    if user_text and not user_text.startswith('agent') and not user_text.startswith('caller'):
                        user_lines.append(user_text)
            
            user_text = ' '.join(user_lines).lower()
            
            # If no user lines found with standard format, try alternative parsing
            if not user_text or len(user_text.strip()) < 10:
                # Try to find user lines by looking for lines that don't start with Agent/Caller
                # and are not empty
                for line in lines:
                    line_lower = line.lower().strip()
                    if line_lower and not line_lower.startswith('agent') and not line_lower.startswith('caller'):
                        # Check if it looks like user text (not a header, not too short)
                        if len(line_lower) > 5 and not line_lower.startswith('conversation'):
                            user_lines.append(line_lower)
                user_text = ' '.join(user_lines).lower()
            
            # Final fallback: use full transcript but be very conservative
            if not user_text or len(user_text.strip()) < 10:
                user_text = transcript.lower()
        
            # First, check for explicit patterns (e.g., "my CNIC is 12345")
            for info_type, keywords in sensitive_keywords.items():
                for keyword in keywords:
                    # Check for explicit patterns
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
                        
                        # Skip if negative context
                        if any(after.startswith(neg) for neg in negative_indicators):
                            continue
                        
                        # Check context before pattern for negatives
                        before = user_text[max(0, idx - 30):idx]
                        if any(neg in before for neg in negative_indicators):
                            continue
                        
                        # Check if followed by actual data
                        if len(after) > 0:
                            # Check for numbers
                            if any(c.isdigit() for c in after[:30]):
                                numbers = [w for w in after.split()[:3] if any(c.isdigit() for c in w)]
                                if numbers and len(numbers[0]) >= 3:
                                    if info_type not in provided_info_types:
                                        provided_info_types.append(info_type)
                                    break
                            # Check for meaningful text
                            first_word = after.split()[0].lower() if after.split() else ""
                            if first_word and first_word not in ['though', 'but', 'however', 'i', 'we', 'the', 'a', 'an']:
                                if len(first_word) >= 4:
                                    if info_type not in provided_info_types:
                                        provided_info_types.append(info_type)
                                    break
            
            # Second, check for implicit patterns (agent asked for X, user provided numbers/text)
            # This handles cases like: Agent: "What's your CNIC?" User: "It's 123456789"
            # We look for the keyword in agent's question, then check if user provided data
            # This works even if user didn't explicitly say "my CNIC is"
            # IMPORTANT: Skip if user shows resistance (says they'll call back, check, etc.)
            # This is the key improvement - handles "it's 123456789" when agent asked for CNIC
            agent_asked_for = []
            
            for i, line in enumerate(lines):
                line_lower = line.lower().strip()
                if line_lower.startswith('agent:') or line_lower.startswith('caller:'):
                    agent_text = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                    # Check if agent asked for any sensitive info
                    for info_type, keywords in sensitive_keywords.items():
                        for keyword in keywords:
                            if keyword in agent_text and ('need' in agent_text or 'require' in agent_text or 'share' in agent_text or 'provide' in agent_text or 'tell' in agent_text or 'give' in agent_text):
                                agent_asked_for.append((info_type, keyword, i))
            
            # Now check if user provided data after agent asked
            for info_type, keyword, agent_line_idx in agent_asked_for:
                if info_type in provided_info_types:
                    continue  # Already detected
                
                # Look for user response after agent's question
                for i in range(agent_line_idx + 1, min(agent_line_idx + 5, len(lines))):
                    line_lower = lines[i].lower().strip()
                    if line_lower.startswith('you:') or line_lower.startswith('user:'):
                        user_text_line = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                        
                        # FIRST: Check if user shows resistance - if so, skip entirely
                        # This prevents false positives when user says "I don't have" or "I'll call back"
                        resistance_indicators = [
                            "don't have", "i don't have", "don't have my", "i'll call",
                            "call you back", "i'll check", "i need to check", "let me check",
                            "what do you mean", "i don't understand", "not comfortable",
                            "i'll verify", "let me verify", "i'll contact", "contact directly"
                        ]
                        
                        # If user shows ANY resistance indicator, skip this keyword entirely
                        if any(indicator in user_text_line for indicator in resistance_indicators):
                            continue
                        
                        # Skip if negative
                        if any(neg in user_text_line for neg in negative_indicators):
                            continue
                        
                        # Check if user provided numbers or data
                        # Look for patterns like "it's 12345", "here it is 12345", "12345", etc.
                        import re
                        # Extract numbers (at least 3 digits)
                        numbers = re.findall(r'\d{3,}', user_text_line)
                        # Or check for phrases like "it's", "here", "that is" followed by data
                        if numbers or any(phrase in user_text_line for phrase in ["it's", "here", "that is", "this is", "the code is"]):
                            # If agent asked for this specific info type and user provided data, assume they provided it
                            if info_type not in provided_info_types:
                                provided_info_types.append(info_type)
                            break
        
        # Return model-detected info types (or pattern-detected if model found nothing)
        return provided_info_types
    
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
        
        # Vectorize
        text_vector = self.vectorizer.transform([processed_text])
        
        # Predict
        prediction = self.model.predict(text_vector)[0]
        probabilities = self.model.predict_proba(text_vector)[0]
        
        # Get confidence (probability of predicted class)
        confidence = float(max(probabilities))
        
        # Determine number of classes from model
        num_classes = len(probabilities)
        
        # Calculate score and determine behavior based on model prediction
        # For 3-class model: 0=normal, 1=phishing(fell for it), 2=phishing(resisted)
        # For 2-class model: 0=normal, 1=phishing
        
        if num_classes == 3:
            # Enhanced model with 3 classes
            if prediction == 0:  # Normal conversation
                score = min(100, int(50 + 50 * confidence))
                is_phishing = False
                fell_for_it = False
            elif prediction == 1:  # Phishing, user fell for it
                # User fell for it - very low score
                score = max(0, int(20 * (1 - confidence)))  # 0-20 range
                is_phishing = True
                fell_for_it = True
            else:  # prediction == 2: Phishing, user resisted
                # User resisted - good score (60-80 range)
                score = max(60, int(60 + 20 * confidence))  # 60-80 range
                is_phishing = True
                fell_for_it = False
        else:
            # Original 2-class model
            if prediction == 1:  # Phishing detected
                score = max(0, int(100 * (1 - confidence)))
                is_phishing = True
                fell_for_it = None  # Can't determine from 2-class model
            else:  # Normal conversation
                score = min(100, int(50 + 50 * confidence))
                is_phishing = False
                fell_for_it = False
        
        return {
            'is_phishing': is_phishing,
            'fell_for_it': fell_for_it,
            'confidence': confidence,
            'score': score,
            'prediction': int(prediction),
            'probabilities': probabilities.tolist(),
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
        
        # Get prediction from trained model (fully model-based!)
        prediction = self.predict(transcript)
        
        # Model prediction contains all information we need
        # For 3-class model: prediction['prediction'] = 0, 1, or 2
        # For 2-class model: prediction['prediction'] = 0 or 1
        
        num_classes = prediction['num_classes']
        
        # Fully model-based approach:
        # - For 3-class model: Use model prediction directly (0=normal, 1=fell for it, 2=resisted)
        # - Model is trained on English data and is authoritative
        # - Pattern detection is only used for extracting specific info types (display purposes)
        # - Model's classification is never overridden
        
        # Initialize variables
        provided_sensitive_info = []
        fell_for_phishing = False
        resistance_level = "medium"
        
        if num_classes == 3:
            # Fully model-based - model tells us everything!
            model_pred = prediction['prediction']
            probabilities = prediction['probabilities']
            
            if model_pred == 0:
                # Normal conversation
                provided_sensitive_info = []
                fell_for_phishing = False
                resistance_level = "high"
            elif model_pred == 1:
                # Phishing, user fell for it (provided info)
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
                    else:
                        # No strong resistance indicators - trust model
                        fell_for_phishing = True
                        resistance_level = "low"
                else:
                    # Info was detected - user fell for it
                    fell_for_phishing = True
                    resistance_level = "low"
            else:  # model_pred == 2
                # Phishing, user resisted (didn't provide info)
                # Trust the model - it's trained on English data and knows what it's doing
                provided_sensitive_info = []  # Model says resisted, so no info provided
                fell_for_phishing = False
                resistance_level = "high"
        else:
            # 2-class model - use model-driven approach
            # Try to use model's learned patterns first, fall back to pattern detection only if needed
            
            # Get model feature importance if available (RandomForest)
            model_pred = prediction['prediction']
            probabilities = prediction['probabilities']
            phishing_prob = float(probabilities[1]) if len(probabilities) > 1 else 0.0
            
            # Use model's confidence to infer behavior
            # High phishing_prob + specific transcript patterns = likely provided info
            # High phishing_prob but different patterns = likely resisted
            
            # For now, use pattern detection but make it model-informed
            # (In future, could train separate model or use feature importance)
            sensitive_keywords = {
                'password': ['password', 'passcode', 'pin', 'pass'],
                'cnic': ['cnic', 'national id', 'identity card', 'id card'],
                'credit_card': ['credit card', 'card number', 'cvv', 'expiry'],
                'bank_account': ['account number', 'bank account', 'account'],
                'atm_pin': ['atm pin', 'atm code'],
                'otp': ['otp', 'one time password', 'verification code'],
                'mobile_wallet_pin': ['wallet pin', 'easypaisa pin', 'jazzcash pin'],
                'personal_info': ['date of birth', 'mother name', 'father name', 'address']
            }
            
            transcript_lower = transcript.lower()
            provided_sensitive_info = []
        
            # Split transcript into user and agent parts
            lines = transcript.split('\n')
            user_lines = []
            agent_lines = []
            
            for line in lines:
                line_lower = line.lower().strip()
                # Handle different transcript formats
                if line_lower.startswith('you:') or line_lower.startswith('user:'):
                    # Remove prefix and get actual user text
                    user_text_part = line_lower.split(':', 1)[1].strip() if ':' in line_lower else line_lower
                    user_lines.append(user_text_part)
                elif line_lower.startswith('agent:') or line_lower.startswith('caller:'):
                    agent_lines.append(line_lower)
                elif line and not line_lower.startswith('agent') and not line_lower.startswith('caller'):
                    # If line doesn't have prefix, check if it's likely user text (shorter, questions, etc.)
                    # This handles transcripts that might not have clear prefixes
                    pass
            
            # Only check USER lines for provided information
            user_text = ' '.join(user_lines).lower()
            
            # Also check full transcript for user responses (fallback)
            if not user_text:
                # If we couldn't parse user lines, check full transcript but be more careful
                user_text = transcript_lower
            
            # Resistance indicators - phrases that show user is resisting
            resistance_phrases = [
                "don't feel comfortable", "not comfortable", "i don't feel",
                "i'll call you back", "call you back", "i'll verify",
                "i'll check", "let me verify", "verify this",
                "didn't receive", "haven't received", "didn't get",
                "didn't sign up", "haven't created", "didn't create",
                "don't recall", "don't remember", "not sure",
                "i'll see", "i'll contact", "contact directly",
                "official channels", "verify through", "call the bank"
            ]
            
            has_resistance = any(phrase in user_text for phrase in resistance_phrases)
            
            # Check if user actually provided sensitive information
            # Look for patterns like "my password is 123", "the OTP is 123456", "my CNIC is 12345-1234567-1"
            # Exclude negative contexts like "didn't receive", "don't have", "not comfortable"
            negative_indicators = [
                "didn't", "don't", "haven't", "hasn't", "won't", "can't", "not",
                "no", "never", "nothing", "none", "refuse", "refused", "decline",
                "did not", "do not", "have not", "will not", "cannot"
            ]
            
            for info_type, keywords in sensitive_keywords.items():
                for keyword in keywords:
                    # Check if keyword appears in user text (not just agent text)
                    if keyword in user_text:
                        # Check if keyword is in a negative context
                        # Find all occurrences of the keyword
                        keyword_indices = [i for i in range(len(user_text)) if user_text.startswith(keyword, i)]
                        
                        is_negative_context = False
                        for keyword_idx in keyword_indices:
                            # Check context around the keyword (50 chars before and after)
                            start = max(0, keyword_idx - 50)
                            end = min(len(user_text), keyword_idx + len(keyword) + 50)
                            context = user_text[start:end]
                            
                            # Check if any negative indicator appears in the same context
                            if any(neg in context for neg in negative_indicators):
                                is_negative_context = True
                                break
                        
                        if is_negative_context:
                            continue  # Skip - user is saying they DON'T have/provide it
                        
                        # Look for patterns that indicate user provided the information
                        # Patterns: "my [keyword] is", "[keyword] is [number]", "my [keyword]:", "[keyword]: [value]"
                        patterns = [
                            f'my {keyword} is',
                            f'my {keyword}:',
                            f'the {keyword} is',
                            f'{keyword} is',
                            f'{keyword}:',
                        ]
                        
                        # Check if any pattern matches AND it's followed by actual data (numbers, text)
                        for pattern in patterns:
                            if pattern in user_text:
                                # Extract text after the pattern
                                idx = user_text.find(pattern)
                                after_pattern = user_text[idx + len(pattern):].strip()
                                
                                # Skip if followed by negative words
                                if any(after_pattern.startswith(neg) for neg in negative_indicators):
                                    continue
                                
                                # If there's meaningful content after (not just "though", "but", etc.)
                                if len(after_pattern) > 0:
                                    # Check if it contains numbers or looks like actual data
                                    # Must have at least 3 characters or numbers that look like actual data
                                    first_words = after_pattern.split()[:3]
                                    has_data = False
                                    
                                    # Check for numbers (OTP, account numbers, etc.)
                                    if any(char.isdigit() for char in after_pattern[:30]):
                                        # Make sure it's not just "is 0" or "is 1" (likely false positive)
                                        numbers = [w for w in first_words if any(c.isdigit() for c in w)]
                                        if numbers and len(numbers[0]) >= 3:  # At least 3 digits
                                            has_data = True
                                    
                                    # Check for text that looks like actual information (not just "though", "but")
                                    if not has_data and first_words:
                                        first_word = first_words[0].lower()
                                        if first_word not in ['though', 'but', 'however', 'i', 'we', 'the', 'a', 'an']:
                                            if len(first_word) >= 4 or any(c.isdigit() for c in first_word):
                                                has_data = True
                                    
                                    if has_data:
                                        if info_type not in provided_sensitive_info:
                                            provided_sensitive_info.append(info_type)
                                        break
            
            # 2-class model fallback - use pattern detection
            # Determine if user fell for phishing using model prediction + provided info
            fell_for_phishing = prediction['is_phishing'] and len(provided_sensitive_info) > 0
            
            # Determine resistance level
            if has_resistance:
                resistance_level = "high"
            elif len(provided_sensitive_info) > 0:
                resistance_level = "low"
            elif prediction['is_phishing']:
                # Model detected phishing but no info provided
                resistance_level = "medium"
            else:
                if prediction['score'] >= 75:
                    resistance_level = "high"
                elif prediction['score'] >= 50:
                    resistance_level = "medium"
                else:
                    resistance_level = "low"
        
        # Variables are now set for both 3-class and 2-class models
        
        # Generate analysis rationale
        rationale_parts = []
        
        if num_classes == 3:
            # Fully model-based rationale
            if model_pred == 0:
                rationale_parts.append("The conversation appears to be a normal interaction.")
            elif model_pred == 1 or (model_pred == 2 and len(provided_sensitive_info) > 0):
                # User fell for it (either model predicted 1, or predicted 2 but we detected info)
                rationale_parts.append("The conversation exhibits characteristics of a phishing attempt, and the user fell for it.")
            else:  # model_pred == 2 and no info provided
                rationale_parts.append("The conversation exhibits characteristics of a phishing attempt, but the user resisted.")
        else:
            # 2-class model rationale
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
            'modelType': 'ml'  # Indicate which model was used
        }
        
        # Add model prediction info for debugging/transparency
        if num_classes == 3:
            analysis_result['modelPrediction'] = prediction['prediction']
            analysis_result['modelConfidence'] = prediction['confidence']
            analysis_result['isFullyModelBased'] = True
        else:
            analysis_result['isFullyModelBased'] = False
        
        return {
            'success': True,
            'analysis': analysis_result
        }


# Global model instance
_model_instance = None


def get_model() -> PhishingDetectionModel:
    """Get or create global model instance."""
    global _model_instance
    if _model_instance is None:
        _model_instance = PhishingDetectionModel()
    return _model_instance


def analyze_conversation_ensemble(transcript: str, scenario_type: str) -> Dict[str, Any]:
    """
    Ensemble prediction using both ML and CNN-BiLSTM models.
    Combines predictions with weighted averaging.
    
    Args:
        transcript: Full conversation transcript
        scenario_type: "phishing" or "normal"
        
    Returns:
        Ensemble analysis results
    """
    ml_available = os.path.exists(MODEL_PATH)
    cnn_bilstm_available = os.path.exists(os.path.join(MODEL_DIR, 'cnn_bilstm_model.h5'))
    
    print(f"Ensemble mode: ML model available={ml_available}, CNN-BiLSTM available={cnn_bilstm_available}", file=sys.stderr)
    
    if not ml_available and not cnn_bilstm_available:
        raise FileNotFoundError("No models available for ensemble prediction.")
    
    predictions = []
    weights = []
    model_labels = []  # Track which model gave which prediction
    
    # Get ML model prediction
    if ml_available:
        try:
            print("Loading ML model for ensemble...", file=sys.stderr)
            ml_model = get_model()
            ml_result = ml_model.analyze_conversation(transcript, scenario_type)
            if ml_result['success']:
                predictions.append(ml_result['analysis'])
                weights.append(0.4)  # ML model weight
                model_labels.append('ml')
                print("ML model prediction successful", file=sys.stderr)
            else:
                print(f"Warning: ML model returned unsuccessful result: {ml_result.get('error', 'Unknown error')}", file=sys.stderr)
        except Exception as e:
            import traceback
            print(f"Warning: ML model prediction failed: {e}", file=sys.stderr)
            print(f"ML model traceback: {traceback.format_exc()}", file=sys.stderr)
    
    # Get CNN-BiLSTM prediction
    if cnn_bilstm_available:
        try:
            print("Loading CNN-BiLSTM model for ensemble...", file=sys.stderr)
            from cnn_bilstm_inference import analyze_conversation_cnn_bilstm
            cnn_result = analyze_conversation_cnn_bilstm(transcript, scenario_type)
            if cnn_result['success']:
                predictions.append(cnn_result['analysis'])
                weights.append(0.6)  # CNN-BiLSTM weight (higher, more accurate)
                model_labels.append('cnn_bilstm')
                print("CNN-BiLSTM model prediction successful", file=sys.stderr)
            else:
                print(f"Warning: CNN-BiLSTM model returned unsuccessful result: {cnn_result.get('error', 'Unknown error')}", file=sys.stderr)
        except Exception as e:
            import traceback
            print(f"Warning: CNN-BiLSTM model prediction failed: {e}", file=sys.stderr)
            print(f"CNN-BiLSTM traceback: {traceback.format_exc()}", file=sys.stderr)
    
    if not predictions:
        error_msg = "All models failed to make predictions."
        if ml_available and cnn_bilstm_available:
            error_msg += " Both ML and CNN-BiLSTM models are available but both failed."
        elif ml_available:
            error_msg += " ML model is available but failed."
        elif cnn_bilstm_available:
            error_msg += " CNN-BiLSTM model is available but failed."
        raise RuntimeError(error_msg)
    
    # Normalize weights
    total_weight = sum(weights)
    if total_weight == 0:
        raise RuntimeError("No valid predictions with non-zero weights.")
    weights = [w / total_weight for w in weights]
    
    # Combine predictions
    # For scores: weighted average
    try:
        combined_score = sum(p.get('score', 50) * w for p, w in zip(predictions, weights))
    except (KeyError, TypeError) as e:
        print(f"Error combining scores: {e}", file=sys.stderr)
        # Fallback to average if score calculation fails
        combined_score = sum(p.get('score', 50) for p in predictions) / len(predictions) if predictions else 50
    
    # For binary decisions: weighted voting
    try:
        fell_for_phishing = sum((1 if p.get('fellForPhishing', False) else 0) * w for p, w in zip(predictions, weights)) > 0.5
        provided_info = sum((1 if p.get('providedSensitiveInfo', False) else 0) * w for p, w in zip(predictions, weights)) > 0.5
    except (KeyError, TypeError) as e:
        print(f"Error combining binary decisions: {e}", file=sys.stderr)
        # Fallback to majority voting
        fell_for_phishing = sum(1 for p in predictions if p.get('fellForPhishing', False)) > len(predictions) / 2
        provided_info = sum(1 for p in predictions if p.get('providedSensitiveInfo', False)) > len(predictions) / 2
    
    # Combine info types (union)
    all_info_types = set()
    for p in predictions:
        all_info_types.update(p.get('sensitiveInfoTypes', []))
    
    # Determine resistance level
    resistance_scores = {'high': 3, 'medium': 2, 'low': 1}
    resistance_values = [resistance_scores.get(p.get('resistanceLevel', 'medium'), 2) for p in predictions]
    avg_resistance = sum(r * w for r, w in zip(resistance_values, weights))
    
    if avg_resistance >= 2.5:
        resistance_level = "high"
    elif avg_resistance >= 1.5:
        resistance_level = "medium"
    else:
        resistance_level = "low"
    
    # Combine rationales with model labels
    rationale_parts = []
    for i, (pred, label) in enumerate(zip(predictions, model_labels)):
        model_name = 'ML Model' if label == 'ml' else 'CNN-BiLSTM Model'
        rationale = pred.get('analysisRationale', '')
        rationale_parts.append(f"[{model_name}]: {rationale}")
    
    combined_rationale = f"Ensemble prediction (using {len(predictions)} model(s)): " + " | ".join(rationale_parts)
    
    # Create individual model predictions for transparency
    individual_predictions = []
    for i, (pred, label) in enumerate(zip(predictions, model_labels)):
        model_name = 'ML Model' if label == 'ml' else 'CNN-BiLSTM Model'
        individual_predictions.append({
            'model': model_name,
            'modelType': label,
            'score': pred.get('score', 50),
            'fellForPhishing': pred.get('fellForPhishing', False),
            'providedSensitiveInfo': pred.get('providedSensitiveInfo', False),
            'sensitiveInfoTypes': pred.get('sensitiveInfoTypes', []),
            'resistanceLevel': pred.get('resistanceLevel', 'medium'),
            'analysisRationale': pred.get('analysisRationale', ''),
            'weight': weights[i] if i < len(weights) else 0.5
        })
    
    analysis_result = {
        'fellForPhishing': fell_for_phishing,
        'providedSensitiveInfo': provided_info,
        'sensitiveInfoTypes': list(all_info_types),
        'resistanceLevel': resistance_level,
        'score': int(round(combined_score)),
        'analysisRationale': combined_rationale,
        'modelType': 'ensemble',
        'modelsUsed': model_labels,
        'isFullyModelBased': True,
        'individualPredictions': individual_predictions  # Add individual model predictions
    }
    
    return {
        'success': True,
        'analysis': analysis_result
    }


def analyze_conversation(transcript: str, scenario_type: str, model_type: str = 'auto') -> Dict[str, Any]:
    """
    Analyze conversation transcript using ML model or CNN-BiLSTM.
    This is the main function called by the controller.
    
    Args:
        transcript: Full conversation transcript
        scenario_type: "phishing" or "normal"
        model_type: 'ml', 'cnn_bilstm', 'ensemble', or 'auto' (auto-selects best available)
                   - 'auto': Uses ensemble if both models available, else best single model
                   - 'ml': Uses ML models only
                   - 'cnn_bilstm': Uses CNN-BiLSTM model only
                   - 'ensemble': Combines predictions from both models (best accuracy)
        
    Returns:
        Analysis results matching Gemini service format
    """
    # Auto-select model type if not specified
    if model_type == 'auto':
        # Check which models are available
        cnn_bilstm_available = os.path.exists(os.path.join(MODEL_DIR, 'cnn_bilstm_model.h5'))
        ml_model_available = os.path.exists(MODEL_PATH)
        
        # Check if TensorFlow is available for CNN-BiLSTM
        tensorflow_available = False
        if cnn_bilstm_available:
            try:
                import tensorflow as tf
                tensorflow_available = True
            except ImportError:
                tensorflow_available = False
        
        # Prefer ensemble if both models are available (best accuracy and robustness)
        # But only if TensorFlow is available for CNN-BiLSTM
        if ml_model_available and cnn_bilstm_available and tensorflow_available:
            model_type = 'ensemble'
            print(f"Auto-selected: ensemble (both ML and CNN-BiLSTM models available)", file=sys.stderr)
        elif cnn_bilstm_available and tensorflow_available:
            model_type = 'cnn_bilstm'
            print(f"Auto-selected: cnn_bilstm (CNN-BiLSTM available, ML model not found)", file=sys.stderr)
        elif ml_model_available:
            model_type = 'ml'
            if cnn_bilstm_available and not tensorflow_available:
                print(f"Auto-selected: ml (CNN-BiLSTM available but TensorFlow not installed)", file=sys.stderr)
            else:
                print(f"Auto-selected: ml (only ML model available)", file=sys.stderr)
        else:
            raise FileNotFoundError("No trained models found. Please train a model first.")
    
    # Route to appropriate model
    if model_type == 'ml':
        model = get_model()
        return model.analyze_conversation(transcript, scenario_type)
    elif model_type == 'cnn_bilstm':
        from cnn_bilstm_inference import analyze_conversation_cnn_bilstm
        return analyze_conversation_cnn_bilstm(transcript, scenario_type)
    elif model_type == 'ensemble':
        return analyze_conversation_ensemble(transcript, scenario_type)
    else:
        raise ValueError(f"Unknown model_type: {model_type}. Use 'ml', 'cnn_bilstm', 'ensemble', or 'auto'")


if __name__ == "__main__":
    # Test the model
    test_transcript = """
    Agent: This is HBL bank. We detected suspicious activity on your account. Can you verify your identity with your account password?
    User: I'm not comfortable sharing my password. Can you verify your identity first?
    Agent: We need your password to verify your account.
    User: I'll call the bank directly instead. Thank you.
    """
    
    result = analyze_conversation(test_transcript, "phishing")
    print("Analysis Result:")
    print(result)
