"""
Improved CNN-BiLSTM training script with focus on detecting "fell for it" cases.
"""

import os
import sys
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
from collections import Counter

try:
    import tensorflow as tf
    from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, CSVLogger
    from tensorflow.keras.utils import to_categorical
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    print("ERROR: TensorFlow is not installed!")
    sys.exit(1)

import warnings
warnings.filterwarnings('ignore')

from cnn_bilstm_model import (
    build_cnn_bilstm_attention_model,
    load_fasttext_embeddings,
    create_embedding_matrix,
    preprocess_text_for_cnn_bilstm
)
from preprocess_data import clean_text, tokenize_and_remove_stopwords

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)


def calculate_class_weights_for_keras(y):
    """Calculate balanced class weights for Keras model to distinguish all classes."""
    from collections import Counter
    class_counts = Counter(y)
    total = len(y)
    
    weights = {}
    for class_label, count in class_counts.items():
        weights[class_label] = total / (len(class_counts) * count)
    
    # For 3-class model: Balance weights to ensure all classes are learned properly
    # Don't over-emphasize class 1 - we need to distinguish it from class 2 (resisted)
    if len(class_counts) == 3:
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


def detect_language(texts):
    """Detect if texts are Korean or English."""
    sample_text = ' '.join(texts[:100]) if len(texts) > 100 else ' '.join(texts)
    has_korean = any('\uAC00' <= char <= '\uD7A3' for char in sample_text)
    return 'ko' if has_korean else 'en'


def train_cnn_bilstm_improved(
    data_path: str,
    use_enhanced_labels: bool = False,
    max_length: int = 200,
    max_words: int = 50000,
    embed_dim: int = 300,
    batch_size: int = 32,
    epochs: int = 100,  # Increased for maximum accuracy
    validation_split: float = 0.2
):
    """Train CNN-BiLSTM model with improved methodology."""
    print("=" * 60)
    print("Improved CNN-BiLSTM Model Training")
    print("Focus: Distinguishing resistance vs 'fell for it' cases")
    print("=" * 60)
    
    # Load data
    print("\n1. Loading training data...")
    df = load_training_data(data_path, use_enhanced_labels=use_enhanced_labels)
    print(f"   Loaded {len(df)} samples")
    print(f"   Class distribution:\n{df['label'].value_counts().sort_index()}")
    
    # Use English embeddings for English dataset (as requested)
    print("\n2. Setting language for embeddings...")
    # Check if we're using English dataset
    if 'training_data_english_generated.csv' in data_path or 'english' in data_path.lower():
        language = 'en'  # Force English embeddings for English dataset
        print(f"   Using ENGLISH FastText embeddings (dataset is English)")
    else:
        # Auto-detect for other datasets
        language = detect_language(df['transcript'].tolist())
        print(f"   Detected language: {language}")
    
    # Preprocess text
    print("\n3. Preprocessing text...")
    df['transcript'] = df['transcript'].apply(clean_text)
    df = df[df['transcript'].str.len() > 0].copy()
    df['transcript'] = df['transcript'].apply(tokenize_and_remove_stopwords)
    df = df[df['transcript'].str.len() > 0].copy()
    
    # Prepare texts and labels
    texts = df['transcript'].tolist()
    labels = df['label'].values
    
    # Determine number of classes
    num_classes = len(np.unique(labels))
    print(f"   Number of classes: {num_classes}")
    
    # Calculate class weights
    class_weights = calculate_class_weights_for_keras(labels)
    
    # Preprocess for CNN-BiLSTM
    print("\n4. Tokenizing and padding sequences...")
    sequences, tokenizer = preprocess_text_for_cnn_bilstm(
        texts,
        tokenizer=None,
        max_length=max_length,
        max_words=max_words
    )
    
    # Prepare labels
    if num_classes == 2:
        y = labels.astype(int)
    else:
        y = to_categorical(labels, num_classes=num_classes)
    
    # Split data
    print("\n5. Splitting data...")
    X_train, X_test, y_train, y_test = train_test_split(
        sequences, y, test_size=validation_split, random_state=42, stratify=labels
    )
    print(f"   Training samples: {len(X_train)}")
    print(f"   Test samples: {len(X_test)}")
    
    # Load FastText embeddings
    print("\n6. Loading FastText embeddings...")
    embeddings_index = load_fasttext_embeddings(language=language, embed_dim=embed_dim)
    
    if not embeddings_index:
        print("   Warning: Could not load FastText embeddings. Using random initialization.")
        embedding_matrix = np.random.rand(max_words, embed_dim)
    else:
        print("\n7. Creating embedding matrix...")
        embedding_matrix = create_embedding_matrix(
            tokenizer, embeddings_index, max_words, embed_dim
        )
    
    # Build model with improved architecture
    print("\n8. Building improved CNN-BiLSTM model...")
    model = build_cnn_bilstm_attention_model(
        embedding_matrix=embedding_matrix,
        max_length=max_length,
        max_words=max_words,
        embed_dim=embed_dim,
        num_classes=num_classes,
        learning_rate=0.0005  # Lower learning rate for better convergence
    )
    
    print("\nModel Summary:")
    model.summary()
    
    # Setup callbacks
    model_path = os.path.join(MODEL_DIR, 'cnn_bilstm_model.h5')
    checkpoint = ModelCheckpoint(
        model_path,
        monitor='val_loss',
        save_best_only=True,
        verbose=1
    )
    early_stopping = EarlyStopping(
        monitor='val_loss',
        patience=15,  # Increased patience to allow more learning with higher epochs
        restore_best_weights=True,
        verbose=1
    )
    csv_logger = CSVLogger(
        os.path.join(MODEL_DIR, 'cnn_bilstm_training.log')
    )
    
    # Prepare class weights for training
    class_weight_dict = class_weights if num_classes > 2 else None
    
    # Train model
    print("\n9. Training model with class weights...")
    history = model.fit(
        X_train, y_train,
        batch_size=batch_size,
        epochs=epochs,
        validation_data=(X_test, y_test),
        callbacks=[checkpoint, early_stopping, csv_logger],
        class_weight=class_weight_dict,
        verbose=1
    )
    
    # Evaluate model
    print("\n10. Evaluating model...")
    y_pred = model.predict(X_test)
    
    if num_classes == 2:
        y_pred_binary = (y_pred > 0.5).astype(int).flatten()
        y_test_binary = y_test.astype(int)
    else:
        y_pred_binary = np.argmax(y_pred, axis=1)
        y_test_binary = np.argmax(y_test, axis=1)
    
    accuracy = accuracy_score(y_test_binary, y_pred_binary)
    precision = precision_score(y_test_binary, y_pred_binary, average='weighted', zero_division=0)
    recall = recall_score(y_test_binary, y_pred_binary, average='weighted', zero_division=0)
    f1 = f1_score(y_test_binary, y_pred_binary, average='weighted', zero_division=0)
    
    # Calculate recall for each class - critical for distinguishing resistance vs fell for it
    recall_class_1 = 0.0
    recall_class_2 = 0.0
    if num_classes > 2:
        if 1 in y_test_binary:
            recall_class_1 = recall_score(y_test_binary == 1, y_pred_binary == 1, zero_division=0)
        if 2 in y_test_binary:
            recall_class_2 = recall_score(y_test_binary == 2, y_pred_binary == 2, zero_division=0)
    
    print(f"\nResults:")
    print(f"  Accuracy: {accuracy:.4f}")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall: {recall:.4f}")
    print(f"  F1-Score: {f1:.4f}")
    if recall_class_1 > 0:
        print(f"  Recall (Class 1 - Fell for it): {recall_class_1:.4f}")
    if recall_class_2 > 0:
        print(f"  Recall (Class 2 - Resisted): {recall_class_2:.4f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test_binary, y_pred_binary))
    
    # Save tokenizer
    import joblib
    tokenizer_path = os.path.join(MODEL_DIR, 'cnn_bilstm_tokenizer.pkl')
    joblib.dump(tokenizer, tokenizer_path)
    print(f"\nTokenizer saved to: {tokenizer_path}")
    
    # Save metadata
    metadata = {
        'model_type': 'cnn_bilstm_attention',
        'language': language,
        'max_length': max_length,
        'max_words': max_words,
        'embed_dim': embed_dim,
        'num_classes': num_classes,
        'training_methodology': 'improved',
        'focus': 'detecting_fell_for_it',
        'accuracy': float(accuracy),
        'precision': float(precision),
        'recall': float(recall),
        'f1_score': float(f1),
        'recall_class_1': float(recall_class_1) if recall_class_1 > 0 else None
    }
    
    import json
    metadata_path = os.path.join(MODEL_DIR, 'cnn_bilstm_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to: {metadata_path}")
    
    print("\n" + "=" * 60)
    print("Training completed successfully!")
    print("=" * 60)
    
    return model, tokenizer


def main():
    """Main training function."""
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
    
    try:
        train_cnn_bilstm_improved(
            data_path=data_path,
            use_enhanced_labels=use_enhanced,
            max_length=200,
            max_words=50000,
            batch_size=32,
            epochs=100  # Increased for maximum accuracy
        )
    except Exception as e:
        import traceback
        print(f"\n{'='*60}")
        print("ERROR: Training failed!")
        print(f"{'='*60}")
        print(f"Error: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
