"""
Improved training script for voice phishing detection model.
Focuses on better detection of when users provide sensitive information.

Key improvements:
1. Class weights to emphasize detecting "fell for it" cases
2. Focused metrics on recall for class 1 (user provided info)
3. Better feature engineering for detecting info provision patterns
4. Enhanced data augmentation for minority class
"""

import pandas as pd
import numpy as np
import os
import sys
import joblib
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
from imblearn.over_sampling import SMOTE
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

# Try to import optional ML libraries
XGBClassifier = None
LGBMClassifier = None

try:
    from xgboost import XGBClassifier
    XGB_AVAILABLE = True
except (ImportError, Exception) as e:
    XGB_AVAILABLE = False
    print(f"Warning: XGBoost not available ({e}). Will skip XGBoost model.")

try:
    from lightgbm import LGBMClassifier
    LGBM_AVAILABLE = True
except (ImportError, Exception) as e:
    LGBM_AVAILABLE = False
    print(f"Warning: LightGBM not available ({e}). Will skip LightGBM model.")

from preprocess_data import preprocess_dataset

# Model directory
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)


def calculate_class_weights(y):
    """
    Calculate balanced class weights to properly distinguish all classes.
    
    Args:
        y: Array of class labels
        
    Returns:
        Dictionary of class weights
    """
    from collections import Counter
    class_counts = Counter(y)
    total = len(y)
    
    # Calculate inverse frequency weights (balanced approach)
    weights = {}
    for class_label, count in class_counts.items():
        # Standard inverse frequency weighting
        weights[class_label] = total / (len(class_counts) * count)
    
    # For 3-class model: Balance weights to ensure all classes are learned properly
    # Don't over-emphasize class 1 - we need to distinguish it from class 2 (resisted)
    if len(class_counts) == 3:
        # Slight boost for minority classes, but keep balanced
        # Class 1 (fell for it) should be distinguishable from class 2 (resisted)
        if 1 in weights and 2 in weights:
            # Ensure class 1 and 2 have similar weights so model learns to distinguish them
            avg_weight = (weights[1] + weights[2]) / 2
            weights[1] = avg_weight * 1.2  # Slight boost for class 1
            weights[2] = avg_weight * 1.1  # Slight boost for class 2
    
    print(f"Class weights: {weights}")
    print(f"Class distribution: {class_counts}")
    return weights


def load_training_data(data_path: str, use_enhanced_labels: bool = False) -> pd.DataFrame:
    """Load training data from CSV file."""
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Training data not found at {data_path}")
    
    df = pd.read_csv(data_path)
    
    if use_enhanced_labels:
        if 'enhanced_label' not in df.columns:
            raise ValueError("Enhanced labels not found. Run enhance_training_data.py first.")
        df['label'] = df['enhanced_label']
        print("Using enhanced labels: 0=normal, 1=phishing(fell for it), 2=phishing(resisted)")
    else:
        if 'label' not in df.columns:
            raise ValueError("Missing required column: 'label'")
        print("Using original labels: 0=normal, 1=phishing")
    
    if 'transcript' not in df.columns:
        raise ValueError("Missing required column: 'transcript'")
    
    return df[['transcript', 'label']]


def train_models_improved(X_train: np.ndarray, y_train: np.ndarray, X_test: np.ndarray, y_test: np.ndarray, num_classes: int = 2):
    """
    Train models with improved methodology focusing on detecting "fell for it" cases.
    
    Key improvements:
    - Class weights to emphasize class 1 (fell for it)
    - Focused metrics on recall for class 1
    - Better SMOTE configuration
    """
    # Calculate class weights
    class_weights = calculate_class_weights(y_train)
    
    # Build models with class weights - focus on distinguishing resistance vs fell for it
    models = {
        'random_forest': RandomForestClassifier(
            n_estimators=300,  # Increased to learn more patterns
            max_depth=30,      # Deeper to capture resistance patterns
            min_samples_split=2,  # More sensitive to patterns
            min_samples_leaf=1,   # More sensitive
            class_weight=class_weights,
            random_state=42,
            n_jobs=-1,
            criterion='gini'  # Use gini for better class separation
        )
    }
    
    # Add XGBoost if available
    if XGB_AVAILABLE and XGBClassifier is not None:
        # XGBoost uses scale_pos_weight for binary, sample_weight for multi-class
        if num_classes == 2:
            # Binary classification
            pos_count = sum(y_train == 1)
            neg_count = sum(y_train == 0)
            scale_pos_weight = neg_count / pos_count if pos_count > 0 else 1.0
            models['xgboost'] = XGBClassifier(
                n_estimators=300,
                max_depth=15,  # Deeper to learn resistance patterns
                learning_rate=0.03,  # Lower learning rate for better generalization
                scale_pos_weight=scale_pos_weight,
                random_state=42,
                eval_metric='logloss',
                min_child_weight=1,  # More sensitive
                gamma=0.1  # Minimum loss reduction for split
            )
        else:
            # Multi-class: use sample_weight - focus on distinguishing all classes
            models['xgboost'] = XGBClassifier(
                n_estimators=300,
                max_depth=15,  # Deeper to learn resistance patterns
                learning_rate=0.03,  # Lower learning rate
                random_state=42,
                eval_metric='mlogloss',
                min_child_weight=1,
                gamma=0.1
            )
    
    # Add LightGBM if available
    if LGBM_AVAILABLE and LGBMClassifier is not None:
        models['lightgbm'] = LGBMClassifier(
            n_estimators=300,
            max_depth=15,  # Deeper to learn resistance patterns
            learning_rate=0.03,  # Lower learning rate
            class_weight=class_weights if num_classes > 2 else None,
            random_state=42,
            verbose=-1,
            min_child_samples=1,  # More sensitive
            num_leaves=31  # More leaves for better pattern capture
        )
    
    if len(models) == 0:
        raise RuntimeError("No ML models available.")
    
    best_model = None
    best_score = 0
    best_model_name = None
    
    results = {}
    
    for name, model in models.items():
        print(f"\nTraining {name}...")
        
        # Apply SMOTE with better configuration
        class_counts = Counter(y_train)
        minority_class_size = min(class_counts.values())
        k_neighbors = min(5, max(1, minority_class_size - 1))
        
        if k_neighbors < 1:
            print(f"   Skipping SMOTE: minority class too small ({minority_class_size} samples)")
            X_train_resampled, y_train_resampled = X_train, y_train
        else:
            # Use SMOTE with better sampling strategy
            smote = SMOTE(
                random_state=42,
                k_neighbors=k_neighbors,
                sampling_strategy='auto'  # Balance all classes
            )
            X_train_resampled, y_train_resampled = smote.fit_resample(X_train, y_train)
            print(f"   After SMOTE: {Counter(y_train_resampled)}")
        
        # Prepare sample weights for XGBoost (multi-class)
        sample_weight = None
        if name == 'xgboost' and num_classes > 2:
            sample_weight = np.array([class_weights[y] for y in y_train_resampled])
        
        # Train model
        if sample_weight is not None:
            model.fit(X_train_resampled, y_train_resampled, sample_weight=sample_weight)
        else:
            model.fit(X_train_resampled, y_train_resampled)
        
        # Evaluate
        y_pred = model.predict(X_test)
        
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        
        # Calculate recall for each class - critical for distinguishing resistance vs fell for it
        recall_class_1 = 0.0
        recall_class_2 = 0.0
        if num_classes > 2:
            if 1 in y_test:
                recall_class_1 = recall_score(y_test == 1, y_pred == 1, zero_division=0)
            if 2 in y_test:
                recall_class_2 = recall_score(y_test == 2, y_pred == 2, zero_division=0)
        
        results[name] = {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'recall_class_1': recall_class_1,  # Recall for "fell for it"
            'recall_class_2': recall_class_2,  # Recall for "resisted" - important!
            'model': model
        }
        
        print(f"{name} - Accuracy: {accuracy:.4f}, F1: {f1:.4f}, Recall(Class 1): {recall_class_1:.4f}, Recall(Class 2): {recall_class_2:.4f}")
        
        # Select best model based on balanced metrics
        # We need good recall for BOTH class 1 (fell for it) AND class 2 (resisted)
        if num_classes > 2 and recall_class_1 > 0 and recall_class_2 > 0:
            # Use harmonic mean of both recalls - ensures both are good
            score = 2 * (recall_class_1 * recall_class_2) / (recall_class_1 + recall_class_2) if (recall_class_1 + recall_class_2) > 0 else f1
        elif recall_class_1 > 0:
            score = recall_class_1
        else:
            score = f1
        if score > best_score:
            best_score = score
            best_model = model
            best_model_name = name
    
    print(f"\nBest model: {best_model_name} with score: {best_score:.4f}")
    
    # Print detailed classification report
    print("\nDetailed Classification Report:")
    print(classification_report(y_test, best_model.predict(X_test)))
    
    return best_model, best_model_name, results


def main():
    """Main training pipeline with improved methodology."""
    print("=" * 60)
    print("Improved Voice Phishing Detection Model Training")
    print("Focus: Better detection of 'fell for it' cases")
    print("=" * 60)
    
    # Configuration - USE ONLY ENGLISH DATASET
    use_enhanced_labels = os.environ.get('USE_ENHANCED_LABELS', 'true').lower() == 'true'
    
    # Priority: English dataset FIRST (as requested)
    english_enhanced_path = os.path.join(os.path.dirname(__file__), 'data', 'training_data_english_generated.csv')
    
    # Fallback options (only if English dataset doesn't exist)
    korean_enhanced_path = os.path.join(os.path.dirname(__file__), 'data', 'training_data_korean_enhanced.csv')
    korean_direct_path = os.environ.get('KOREAN_DATASET_PATH', None)
    korean_data_path = os.path.join(os.path.dirname(__file__), 'data', 'training_data_korean.csv')
    sample_data_path = os.path.join(os.path.dirname(__file__), 'data', 'training_data.csv')
    
    # Use English dataset FIRST (has enhanced labels)
    if os.path.exists(english_enhanced_path):
        data_path = english_enhanced_path
        use_enhanced = True
        print(f"Using ENGLISH dataset: {english_enhanced_path}")
    elif use_enhanced_labels and os.path.exists(korean_enhanced_path):
        data_path = korean_enhanced_path
        use_enhanced = True
        print(f"Using enhanced Korean dataset: {korean_enhanced_path}")
    elif korean_direct_path and os.path.exists(korean_direct_path):
        data_path = korean_direct_path
        use_enhanced = False
        print(f"Using Korean dataset directly: {korean_direct_path}")
    elif os.path.exists(korean_data_path):
        data_path = korean_data_path
        use_enhanced = False
        print("Using Korean Voice Phishing Dataset (KorCCVi) - converted version")
    else:
        data_path = sample_data_path
        use_enhanced = False
        print("Using sample training data")
    
    # Load and preprocess data
    print("\n1. Loading training data...")
    df = load_training_data(data_path, use_enhanced_labels=use_enhanced)
    print(f"   Loaded {len(df)} samples")
    print(f"   Class distribution:\n{df['label'].value_counts().sort_index()}")
    
    print("\n2. Preprocessing data...")
    df_processed = preprocess_dataset(df, augment=False)  # Disable augmentation for now
    
    # Prepare features and labels
    X = df_processed['transcript'].values
    y = df_processed['label'].values
    
    # Determine number of classes
    num_classes = len(np.unique(y))
    print(f"   Number of classes: {num_classes}")
    
    # Split data
    print("\n3. Splitting data into train/test sets...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"   Training samples: {len(X_train)}")
    print(f"   Test samples: {len(X_test)}")
    print(f"   Training class distribution: {Counter(y_train)}")
    
    # Vectorize text with improved features
    print("\n4. Vectorizing text with TF-IDF (enhanced features for resistance detection)...")
    vectorizer = TfidfVectorizer(
        max_features=15000,  # Increased to capture more resistance patterns
        ngram_range=(1, 3),  # Trigrams to capture patterns like "it's 12345678" and "i'll call you back"
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,  # Use sublinear TF scaling for better performance
        analyzer='word'  # Word-level analysis
    )
    
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)
    
    print(f"   Feature matrix shape: {X_train_vec.shape}")
    
    # Train models
    print("\n5. Training models with improved methodology...")
    best_model, best_model_name, results = train_models_improved(
        X_train_vec, y_train, X_test_vec, y_test, num_classes=num_classes
    )
    
    # Save best model and vectorizer
    print("\n6. Saving model and vectorizer...")
    model_path = os.path.join(MODEL_DIR, 'phishing_detection_model.pkl')
    vectorizer_path = os.path.join(MODEL_DIR, 'tfidf_vectorizer.pkl')
    
    joblib.dump(best_model, model_path)
    joblib.dump(vectorizer, vectorizer_path)
    
    print(f"   Model saved to: {model_path}")
    print(f"   Vectorizer saved to: {vectorizer_path}")
    
    # Save metadata
    metadata = {
        'model_name': best_model_name,
        'training_samples': len(X_train),
        'test_samples': len(X_test),
        'features': X_train_vec.shape[1],
        'num_classes': num_classes,
        'training_methodology': 'improved',
        'focus': 'distinguishing_resistance_vs_fell_for_it',
        'results': {k: {m: float(v[m]) for m in ['accuracy', 'precision', 'recall', 'f1', 'recall_class_1'] if m in v} 
                   for k, v in results.items()}
    }
    
    import json
    metadata_path = os.path.join(MODEL_DIR, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"   Metadata saved to: {metadata_path}")
    
    print("\n" + "=" * 60)
    print("Training completed successfully!")
    print("=" * 60)
    print("\nKey improvements:")
    print("  - Class weights to emphasize detecting 'fell for it' cases")
    print("  - Increased model complexity (more trees, deeper)")
    print("  - Enhanced features (trigrams, more features)")
    print("  - Focus on recall for class 1 (user provided info)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\n{'='*60}")
        print("ERROR: Training failed!")
        print(f"{'='*60}")
        print(f"Error: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        sys.exit(1)
