import re
import string
from typing import Dict, List, Any
from collections import Counter
import numpy as np


class TextFeatureExtractor:

    def __init__(self):
        self.phishing_keywords = [
            'urgent', 'verify', 'account', 'suspended', 'security', 'click',
            'update', 'confirm', 'immediately', 'limited time', 'winner',
            'prize', 'congratulations', 'claim', 'expire',
            'password', 'login', 'bank', 'payment', 'invoice', 'refund',
            'unauthorized', 'locked', 'restricted', 'action required'
        ]
        self.suspicious_patterns = [
            r'\b\d{4,}\b',
            r'\b[A-Z]{2,}\b',
            r'[!]{2,}',
            r'[?]{2,}',
            r'http[s]?://',
            r'www\.',
        ]

    def extract(self, text: str, message_type: str = "email") -> Dict[str, Any]:
        if not text:
            text = ""
        text_lower = text.lower()
        text_length = len(text)
        word_count = len(text.split())
        char_count = len(text.replace(' ', ''))
        features = {
            'text_length': text_length,
            'word_count': word_count,
            'char_count': char_count,
            'avg_word_length': char_count / word_count if word_count > 0 else 0,
            'sentence_count': len(re.split(r'[.!?]+', text)),
            'paragraph_count': len([p for p in text.split('\n') if p.strip()]),
        }
        # Total occurrences (more keywords => higher count => stronger effect on output)
        total_occurrences = 0
        for keyword in self.phishing_keywords:
            total_occurrences += len(re.findall(r'\b' + re.escape(keyword) + r'\b', text_lower))
        features['phishing_keyword_count'] = total_occurrences
        features['phishing_keyword_ratio'] = total_occurrences / word_count if word_count > 0 else 0
        pattern_matches = {}
        for pattern in self.suspicious_patterns:
            matches = len(re.findall(pattern, text, re.IGNORECASE))
            pattern_name = pattern.replace('\\b', '').replace('\\', '').replace('[', '').replace(']', '')
            pattern_matches[f'pattern_{pattern_name}'] = matches
        features.update(pattern_matches)
        features['uppercase_ratio'] = sum(1 for c in text if c.isupper()) / text_length if text_length > 0 else 0
        features['digit_ratio'] = sum(1 for c in text if c.isdigit()) / text_length if text_length > 0 else 0
        features['special_char_ratio'] = sum(1 for c in text if c in string.punctuation) / text_length if text_length > 0 else 0
        features['whitespace_ratio'] = sum(1 for c in text if c.isspace()) / text_length if text_length > 0 else 0
        features['exclamation_count'] = text.count('!')
        features['question_count'] = text.count('?')
        features['all_caps_words'] = sum(1 for word in text.split() if word.isupper() and len(word) > 1)
        url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        urls = re.findall(url_pattern, text)
        features['url_count'] = len(urls)
        features['has_url'] = 1 if len(urls) > 0 else 0
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, text)
        features['email_count'] = len(emails)
        features['has_email'] = 1 if len(emails) > 0 else 0
        phone_pattern = r'[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}'
        phones = re.findall(phone_pattern, text)
        features['phone_count'] = len(phones)
        features['has_phone'] = 1 if len(phones) > 0 else 0
        if text_length > 0:
            char_freq = Counter(text.lower())
            entropy = -sum((freq / text_length) * np.log2(freq / text_length)
                          for freq in char_freq.values() if freq > 0)
            features['entropy'] = entropy
        else:
            features['entropy'] = 0
        if message_type == "whatsapp":
            features['has_emoji'] = 1 if any(ord(char) > 127 for char in text) else 0
            features['has_forward_indicator'] = 1 if 'forwarded' in text_lower or 'fwd' in text_lower else 0
        return features
