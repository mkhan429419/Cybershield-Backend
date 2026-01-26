"""
Data preprocessing and augmentation pipeline for voice phishing detection.
Implements multilingual back-translation and text cleaning.
"""

import pandas as pd
import numpy as np
import re
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import time
from typing import List, Tuple

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

# Initialize translator - use deep-translator (more reliable, works with Python 3.13+)
TRANSLATOR_AVAILABLE = False
translator = None

try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
    print("Using deep-translator for back-translation")
except ImportError:
    try:
        # Fallback to googletrans (may not work on Python 3.13+)
        from googletrans import Translator
        translator = Translator()
        TRANSLATOR_AVAILABLE = True
        print("Using googletrans for back-translation")
    except (ImportError, Exception) as e:
        TRANSLATOR_AVAILABLE = False
        print(f"Warning: Translation libraries not available ({e}). Back-translation will be skipped.")
        print("Install deep-translator: pip install deep-translator")

# Stopwords - handle both English and Korean
try:
    stop_words = set(stopwords.words('english'))
    # Try to add Korean stopwords if available
    try:
        from konlpy.tag import Okt
        # Korean stopwords would be handled differently
        KOREAN_AVAILABLE = True
    except:
        KOREAN_AVAILABLE = False
except LookupError:
    nltk.download('stopwords', quiet=True)
    stop_words = set(stopwords.words('english'))
    KOREAN_AVAILABLE = False


def clean_text(text: str) -> str:
    """
    Clean and preprocess text transcript.
    Handles both English and Korean text.
    
    Args:
        text: Raw transcript text
        
    Returns:
        Cleaned text
    """
    if pd.isna(text) or not isinstance(text, str):
        return ""
    
    # Check if text contains Korean characters
    has_korean = any('\uAC00' <= char <= '\uD7A3' for char in text)
    
    if has_korean:
        # Korean text - minimal cleaning
        # Keep Korean characters, spaces, and basic punctuation
        text = re.sub(r'[^\uAC00-\uD7A3\s.,!?]', '', text)  # Keep Korean, spaces, punctuation
        text = re.sub(r'\s+', ' ', text)  # Remove extra whitespace
        text = text.strip()
    else:
        # English text - standard cleaning
        text = text.lower()
        # Remove special characters but keep spaces and basic punctuation
        text = re.sub(r'[^a-z0-9\s.,!?]', '', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
    
    return text


def tokenize_and_remove_stopwords(text: str) -> str:
    """
    Tokenize text and remove stopwords.
    Handles both English and Korean text.
    
    Args:
        text: Cleaned text
        
    Returns:
        Text with stopwords removed
    """
    if not text:
        return ""
    
    # Check if text contains Korean characters
    has_korean = any('\uAC00' <= char <= '\uD7A3' for char in text)
    
    if has_korean:
        # For Korean text, use simple word splitting (Korean doesn't use spaces)
        # Just return cleaned text - Korean tokenization is complex and requires specialized libraries
        # The TF-IDF vectorizer will handle Korean characters
        return text
    else:
        # English text - use standard tokenization
        tokens = word_tokenize(text)
        filtered_tokens = [word for word in tokens if word not in stop_words]
        return ' '.join(filtered_tokens)


def back_translate(text: str, intermediate_languages: List[str] = None) -> List[str]:
    """
    Perform back-translation: translate to intermediate language and back to original.
    This creates augmented versions of the text.
    
    Matches the Korean code approach:
    - Korean text → EN/CH/JA → Korean (same as Korean code)
    - English text → UR/AR/ES → English (for Pakistan context)
    
    Args:
        text: Original text (Korean or English)
        intermediate_languages: List of language codes to translate through
                               If None, auto-detects based on text language
        
    Returns:
        List of back-translated texts
    """
    if intermediate_languages is None:
        # Auto-detect language and use appropriate intermediate languages
        has_korean = any('\uAC00' <= char <= '\uD7A3' for char in text)
        if has_korean:
            # Korean text: use same languages as Korean code (EN, CH, JA)
            # Use zh-CN (Chinese Simplified) instead of zh (not supported by deep-translator)
            intermediate_languages = ['en', 'zh-CN', 'ja']  # English, Chinese Simplified, Japanese
            source_lang = 'ko'
        else:
            # English text: use languages relevant to Pakistan context
            intermediate_languages = ['ur', 'ar', 'es']  # Urdu, Arabic, Spanish
            source_lang = 'en'
    else:
        # Determine source language from text
        has_korean = any('\uAC00' <= char <= '\uD7A3' for char in text)
        source_lang = 'ko' if has_korean else 'en'
    
    # Normalize language codes for deep-translator
    # deep-translator uses 'zh-CN' for Chinese, not 'zh'
    normalized_languages = []
    for lang in intermediate_languages:
        if lang == 'zh':
            normalized_languages.append('zh-CN')  # Use Chinese Simplified
        else:
            normalized_languages.append(lang)
    intermediate_languages = normalized_languages
    if not TRANSLATOR_AVAILABLE:
        print("Warning: Translation not available. Skipping back-translation.")
        return []
    
    augmented_texts = []
    
    for lang in intermediate_languages:
        try:
            # Check text length (Google Translate API limit is 5000 characters)
            if len(text) > 5000:
                print(f"Warning: Text too long ({len(text)} chars), truncating to 5000 for translation")
                text_to_translate = text[:5000]
            else:
                text_to_translate = text
            
            # Use deep_translator (preferred, works with Python 3.13+)
            try:
                from deep_translator import GoogleTranslator
                # Translate to intermediate language
                translator_to = GoogleTranslator(source=source_lang, target=lang)
                translated = translator_to.translate(text_to_translate)
                time.sleep(0.2)  # Rate limiting
                
                # Translate back to original language
                translator_back = GoogleTranslator(source=lang, target=source_lang)
                back_translated = translator_back.translate(translated)
                time.sleep(0.2)  # Rate limiting
                
                if back_translated and back_translated != text and len(back_translated.strip()) > 0:
                    augmented_texts.append(back_translated)
            except Exception as e1:
                # Fallback to googletrans if deep_translator fails
                if translator is not None:
                    try:
                        # Translate to intermediate language
                        translated = translator.translate(text, src=source_lang, dest=lang)
                        time.sleep(0.2)  # Rate limiting
                        
                        # Translate back to original language
                        back_translated = translator.translate(translated.text, src=lang, dest=source_lang)
                        time.sleep(0.2)  # Rate limiting
                        
                        if back_translated.text and back_translated.text != text:
                            augmented_texts.append(back_translated.text)
                    except Exception as e2:
                        print(f"Error in back-translation through {lang} (googletrans): {e2}")
                        continue
                else:
                    print(f"Error in back-translation through {lang} (deep_translator): {e1}")
                    continue
        except Exception as e:
            print(f"Error in back-translation through {lang}: {e}")
            continue
    
    return augmented_texts


def augment_dataset(df: pd.DataFrame, augment_ratio: float = 0.5) -> pd.DataFrame:
    """
    Augment dataset using back-translation.
    Only augments the minority class (phishing samples).
    
    Args:
        df: DataFrame with 'transcript' and 'label' columns
        augment_ratio: Ratio of samples to augment (0.0 to 1.0)
        
    Returns:
        Augmented DataFrame
    """
    # Ensure id column exists (use index if not present)
    if 'id' not in df.columns:
        df = df.copy()
        df['id'] = df.index.astype(str)
    
    # Separate phishing (label=1) and normal (label=0) samples
    phishing_samples = df[df['label'] == 1].copy()
    normal_samples = df[df['label'] == 0].copy()
    
    # Determine how many phishing samples to augment
    num_to_augment = int(len(phishing_samples) * augment_ratio)
    
    if num_to_augment == 0:
        return df
    
    # Select random samples to augment
    samples_to_augment = phishing_samples.sample(n=min(num_to_augment, len(phishing_samples)), random_state=42)
    
    augmented_rows = []
    
    print(f"Augmenting {len(samples_to_augment)} samples using back-translation...")
    
    for idx, row in samples_to_augment.iterrows():
        transcript = row['transcript']
        
        # Perform back-translation
        augmented_texts = back_translate(transcript)
        
        # Add augmented samples
        for aug_text in augmented_texts:
            new_row = row.copy()
            new_row['transcript'] = aug_text
            # Handle id column - use index if id column doesn't exist
            if 'id' in row.index:
                new_row['id'] = f"{row['id']}_aug_{len(augmented_rows)}"
            else:
                # Use index as id if id column doesn't exist
                new_row['id'] = f"{idx}_aug_{len(augmented_rows)}"
            augmented_rows.append(new_row)
    
    # Combine original and augmented data
    augmented_df = pd.concat([df, pd.DataFrame(augmented_rows)], ignore_index=True)
    
    return augmented_df


def preprocess_dataset(df: pd.DataFrame, augment: bool = False) -> pd.DataFrame:
    """
    Complete preprocessing pipeline for the dataset.
    
    Args:
        df: Raw DataFrame with 'transcript' and 'label' columns
        augment: Whether to perform back-translation augmentation
        
    Returns:
        Preprocessed DataFrame
    """
    print("Starting data preprocessing...")
    
    # Clean text
    print("Cleaning text...")
    df['transcript'] = df['transcript'].apply(clean_text)
    
    # Remove empty transcripts
    df = df[df['transcript'].str.len() > 0].copy()
    
    # Tokenize and remove stopwords
    print("Tokenizing and removing stopwords...")
    df['transcript'] = df['transcript'].apply(tokenize_and_remove_stopwords)
    
    # Remove empty transcripts after processing
    df = df[df['transcript'].str.len() > 0].copy()
    
    # Augment if requested
    if augment:
        df = augment_dataset(df)
    
    print(f"Preprocessing complete. Final dataset size: {len(df)}")
    print(f"Class distribution:\n{df['label'].value_counts()}")
    
    return df


if __name__ == "__main__":
    # Example usage
    data = {
        'id': [1, 2, 3],
        'transcript': [
            "This is HBL bank. We need your account password to verify your identity.",
            "Hello, how can I help you today?",
            "Your account will be suspended. Please provide your CNIC number immediately."
        ],
        'label': [1, 0, 1]
    }
    
    df = pd.DataFrame(data)
    processed_df = preprocess_dataset(df, augment=False)
    print(processed_df)
