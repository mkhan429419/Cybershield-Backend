"""
Attention-Based 1D CNN-BiLSTM Hybrid Model Enhanced with FastText Word Embedding
for Voice Phishing Detection.

Based on: "Attention-Based 1D CNN-BiLSTM Hybrid Model Enhanced with FastText Word Embedding 
for Korean Voice Phishing Detection"
"""

import os
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    Input, Embedding, Conv1D, Bidirectional, LSTM, Dense, 
    Dropout, SpatialDropout1D, MaxPooling1D, Attention as KerasAttention
)
from tensorflow.keras import initializers, regularizers, constraints
from tensorflow.keras import backend as K
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.utils import to_categorical
import warnings
warnings.filterwarnings('ignore')

# Try to import fasttext (optional - for loading pre-trained embeddings)
try:
    import fasttext
    FASTTEXT_AVAILABLE = True
except ImportError:
    FASTTEXT_AVAILABLE = False
    print("Warning: fasttext library not available. Will use pre-downloaded embeddings.")


class AttentionWithContext(tf.keras.layers.Layer):
    """
    Attention operation with a context/query vector for temporal data.
    Based on: "Hierarchical Attention Networks for Document Classification"
    by Yang et al. (https://www.cs.cmu.edu/~diyiy/docs/naacl16.pdf)
    """
    
    def __init__(self, **kwargs):
        self.supports_masking = True
        self.init = initializers.get('glorot_uniform')
        super(AttentionWithContext, self).__init__(**kwargs)
    
    def build(self, input_shape):
        assert len(input_shape) == 3
        self.W = self.add_weight(
            shape=(input_shape[-1],),
            initializer=self.init,
            name='{}_W'.format(self.name)
        )
        self.b = self.add_weight(
            shape=(input_shape[1],),
            initializer='zero',
            name='{}_b'.format(self.name)
        )
        self.u = self.add_weight(
            shape=(input_shape[-1],),
            initializer=self.init,
            name='{}_u'.format(self.name)
        )
        super(AttentionWithContext, self).build(input_shape)
    
    def call(self, x, mask=None):
        # x shape: (batch_size, timesteps, features)
        # Based on: "Hierarchical Attention Networks for Document Classification"
        # uit = tanh(x * W + b) where W is (features,) and b is (timesteps,)
        # Compute: uit = tanh(sum(x * W) + b) for each timestep
        uit = tf.reduce_sum(x * self.W, axis=-1)  # (batch, timesteps)
        uit = uit + self.b  # (batch, timesteps) + (timesteps,) -> (batch, timesteps)
        uit = tf.tanh(uit)  # (batch, timesteps)
        
        # ait = u^T * uit, where u is context vector (features,)
        # Since uit is (batch, timesteps) and u is (features,), we need to compute
        # attention score using the context vector u
        # The original implementation uses: ait = uit (as attention scores)
        # Then applies softmax: ait = exp(ait) / sum(exp(ait))
        ait = uit  # (batch, timesteps) - attention scores before normalization
        ait = tf.exp(ait)  # (batch, timesteps)
        
        if mask is not None:
            ait *= tf.cast(mask, tf.float32)
        
        # Normalize attention weights (softmax)
        ait_sum = tf.reduce_sum(ait, axis=1, keepdims=True)  # (batch, 1)
        ait = ait / (ait_sum + tf.keras.backend.epsilon())  # (batch, timesteps)
        ait = tf.expand_dims(ait, axis=-1)  # (batch, timesteps, 1)
        
        # Apply attention weights: weighted sum over timesteps
        weighted_input = x * ait  # (batch, timesteps, features)
        output = tf.reduce_sum(weighted_input, axis=1)  # (batch, features)
        return output
    
    def compute_output_shape(self, input_shape):
        return (input_shape[0], input_shape[-1])


def load_fasttext_embeddings(language='ko', embed_dim=300):
    """
    Load FastText word embeddings.
    
    Args:
        language: 'ko' for Korean, 'en' for English
        embed_dim: Embedding dimension (300 for FastText)
        
    Returns:
        Dictionary mapping words to embedding vectors
    """
    embeddings_index = {}
    
    # FastText pre-trained model URLs
    fasttext_urls = {
        'ko': 'https://dl.fbaipublicfiles.com/fasttext/vectors-wiki/wiki.ko.vec',
        'en': 'https://dl.fbaipublicfiles.com/fasttext/vectors-wiki/wiki.en.vec'
    }
    
    # Local file paths
    data_dir = os.path.join(os.path.dirname(__file__), 'data', 'embeddings')
    os.makedirs(data_dir, exist_ok=True)
    
    embedding_file = os.path.join(data_dir, f'wiki.{language}.vec')
    
    # Download if not exists
    if not os.path.exists(embedding_file):
        print(f"Downloading FastText embeddings for {language}...")
        import urllib.request
        try:
            urllib.request.urlretrieve(fasttext_urls[language], embedding_file)
            print(f"Downloaded to {embedding_file}")
        except Exception as e:
            print(f"Error downloading embeddings: {e}")
            print("Please download manually from:")
            print(f"  {fasttext_urls[language]}")
            return {}
    
    # Load embeddings
    print(f"Loading FastText embeddings from {embedding_file}...")
    try:
        with open(embedding_file, 'r', encoding='utf-8', errors='ignore') as f:
            # Skip first line (header: vocab_size dim)
            next(f)
            for line in f:
                values = line.rstrip().split(' ')
                if len(values) == embed_dim + 1:
                    word = values[0]
                    coefs = np.asarray(values[1:], dtype='float32')
                    embeddings_index[word] = coefs
        
        print(f"Loaded {len(embeddings_index)} word vectors")
        return embeddings_index
    except Exception as e:
        print(f"Error loading embeddings: {e}")
        return {}


def create_embedding_matrix(tokenizer, embeddings_index, max_words, embed_dim=300):
    """
    Create embedding matrix from FastText embeddings.
    
    Args:
        tokenizer: Keras Tokenizer object
        embeddings_index: Dictionary of word embeddings
        max_words: Maximum number of words
        embed_dim: Embedding dimension
        
    Returns:
        Embedding matrix (numpy array)
    """
    word_index = tokenizer.word_index
    embedding_matrix = np.zeros((max_words, embed_dim))
    
    for word, i in word_index.items():
        if i >= max_words:
            continue
        embedding_vector = embeddings_index.get(word)
        if embedding_vector is not None and len(embedding_vector) > 0:
            embedding_matrix[i] = embedding_vector
    
    null_embeddings = np.sum(np.sum(embedding_matrix, axis=1) == 0)
    print(f"Number of null word embeddings: {null_embeddings}")
    print(f"Coverage: {(max_words - null_embeddings) / max_words * 100:.2f}%")
    
    return embedding_matrix


def build_cnn_bilstm_attention_model(
    embedding_matrix,
    max_length=200,
    max_words=50000,
    embed_dim=300,
    num_filters=32,
    kernel_size=3,
    lstm_units_1=64,
    lstm_units_2=64,
    dense_units=128,
    dropout_ratio=0.3,
    spatial_dropout=0.2,
    num_classes=2,
    learning_rate=0.001
):
    """
    Build Attention-Based CNN-BiLSTM model.
    
    Architecture:
    1. Embedding layer (FastText)
    2. Spatial Dropout
    3. 1D CNN layer
    4. Max Pooling
    5. Bidirectional LSTM layers
    6. Attention layer
    7. Dense layers
    8. Output layer
    
    Args:
        embedding_matrix: Pre-trained embedding matrix
        max_length: Maximum sequence length
        max_words: Maximum vocabulary size
        embed_dim: Embedding dimension (300 for FastText)
        num_filters: Number of CNN filters
        kernel_size: CNN kernel size
        lstm_units_1: First BiLSTM units
        lstm_units_2: Second BiLSTM units
        dense_units: Dense layer units
        dropout_ratio: Dropout rate
        spatial_dropout: Spatial dropout rate
        num_classes: Number of output classes (2 for binary, 3 for multi-class)
        learning_rate: Learning rate
        
    Returns:
        Compiled Keras model
    """
    model_input = Input(shape=(max_length,))
    
    # Embedding layer with FastText weights
    x = Embedding(
        max_words,
        embed_dim,
        input_length=max_length,
        weights=[embedding_matrix],
        trainable=False,  # Keep FastText embeddings frozen
        name="embedding"
    )(model_input)
    
    # Spatial dropout (drops entire feature maps)
    x = SpatialDropout1D(spatial_dropout)(x)
    
    # 1D CNN layer
    conv = Conv1D(
        filters=num_filters,
        kernel_size=kernel_size,
        padding="valid",
        activation='relu',
        kernel_initializer=initializers.glorot_uniform(seed=42)
    )(x)
    x = MaxPooling1D(pool_size=2)(conv)
    x = Dropout(dropout_ratio)(x)
    
    # Bidirectional LSTM layers
    x = Bidirectional(
        LSTM(
            lstm_units_1,
            return_sequences=True,
            kernel_initializer=initializers.glorot_uniform(seed=42)
        )
    )(x)
    x = Bidirectional(
        LSTM(
            lstm_units_2,
            return_sequences=True,
            kernel_initializer=initializers.glorot_uniform(seed=42)
        )
    )(x)
    
    # Attention layer
    x = AttentionWithContext()(x)
    
    # Dense layers
    x = Dense(
        dense_units,
        activation='relu',
        kernel_initializer=initializers.glorot_uniform(seed=42)
    )(x)
    x = Dropout(dropout_ratio)(x)
    
    # Output layer
    if num_classes == 2:
        model_output = Dense(1, activation="sigmoid")(x)
        loss = 'binary_crossentropy'
    else:
        model_output = Dense(num_classes, activation="softmax")(x)
        loss = 'categorical_crossentropy'
    
    model = Model(inputs=model_input, outputs=model_output)
    
    # Compile model
    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    metrics = ['accuracy']
    if num_classes > 2:
        metrics.append('top_k_categorical_accuracy')
    
    model.compile(
        loss=loss,
        optimizer=optimizer,
        metrics=metrics
    )
    
    return model


def preprocess_text_for_cnn_bilstm(
    texts,
    tokenizer=None,
    max_length=200,
    max_words=50000
):
    """
    Preprocess texts for CNN-BiLSTM model.
    
    Args:
        texts: List of text strings
        tokenizer: Keras Tokenizer (will create new if None)
        max_length: Maximum sequence length
        max_words: Maximum vocabulary size
        
    Returns:
        (sequences, tokenizer): Padded sequences and tokenizer
    """
    if tokenizer is None:
        tokenizer = Tokenizer(num_words=max_words, oov_token="<OOV>")
        tokenizer.fit_on_texts(texts)
    
    sequences = tokenizer.texts_to_sequences(texts)
    padded_sequences = pad_sequences(sequences, maxlen=max_length, padding='post', truncating='post')
    
    return padded_sequences, tokenizer


if __name__ == "__main__":
    # Test the model
    print("Testing CNN-BiLSTM model...")
    
    # Create dummy embedding matrix
    max_words = 10000
    embed_dim = 300
    dummy_embedding = np.random.rand(max_words, embed_dim)
    
    # Build model
    model = build_cnn_bilstm_attention_model(
        embedding_matrix=dummy_embedding,
        max_length=200,
        max_words=max_words,
        num_classes=2
    )
    
    print("\nModel Summary:")
    model.summary()
    
    print("\nModel created successfully!")
