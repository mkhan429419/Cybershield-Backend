import re
from typing import Dict, Any
from collections import Counter
import string


class LinguisticFeatureExtractor:

    def __init__(self):
        self.urgency_words = ['urgent', 'immediate', 'asap', 'now', 'hurry', 'limited time', 'expire']
        self.authority_words = ['official', 'security', 'verify', 'confirm', 'validate', 'account']
        self.fear_words = ['suspended', 'locked', 'closed', 'terminated', 'violation', 'unauthorized']
        self.reward_words = ['winner', 'prize', 'congratulations', 'free', 'bonus', 'reward']
        self.personal_pronouns = ['i', 'you', 'we', 'they', 'he', 'she', 'me', 'us', 'them', 'my', 'your', 'our', 'their']
        self.function_words = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']

    def extract(self, text: str) -> Dict[str, Any]:
        if not text:
            text = ""
        text_lower = text.lower()
        words = text_lower.split()
        word_count = len(words)
        features = {}
        urgency_count = sum(1 for word in self.urgency_words if word in text_lower)
        features['urgency_word_count'] = urgency_count
        features['urgency_ratio'] = urgency_count / word_count if word_count > 0 else 0
        authority_count = sum(1 for word in self.authority_words if word in text_lower)
        features['authority_word_count'] = authority_count
        features['authority_ratio'] = authority_count / word_count if word_count > 0 else 0
        fear_count = sum(1 for word in self.fear_words if word in text_lower)
        features['fear_word_count'] = fear_count
        features['fear_ratio'] = fear_count / word_count if word_count > 0 else 0
        reward_count = sum(1 for word in self.reward_words if word in text_lower)
        features['reward_word_count'] = reward_count
        features['reward_ratio'] = reward_count / word_count if word_count > 0 else 0
        pronoun_count = sum(1 for word in words if word in self.personal_pronouns)
        features['pronoun_count'] = pronoun_count
        features['pronoun_ratio'] = pronoun_count / word_count if word_count > 0 else 0
        function_count = sum(1 for word in words if word in self.function_words)
        features['function_word_count'] = function_count
        features['function_word_ratio'] = function_count / word_count if word_count > 0 else 0
        unique_words = len(set(words))
        features['unique_word_count'] = unique_words
        features['vocabulary_richness'] = unique_words / word_count if word_count > 0 else 0
        if words:
            word_lengths = [len(word) for word in words]
            features['avg_word_length'] = sum(word_lengths) / len(word_lengths)
            features['max_word_length'] = max(word_lengths)
            features['min_word_length'] = min(word_lengths)
        else:
            features['avg_word_length'] = 0
            features['max_word_length'] = 0
            features['min_word_length'] = 0
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        features['sentence_count'] = len(sentences)
        if sentences:
            sentence_lengths = [len(s.split()) for s in sentences]
            features['avg_sentence_length'] = sum(sentence_lengths) / len(sentence_lengths)
            features['max_sentence_length'] = max(sentence_lengths)
            features['min_sentence_length'] = min(sentence_lengths)
        else:
            features['avg_sentence_length'] = 0
            features['max_sentence_length'] = 0
            features['min_sentence_length'] = 0
        features['exclamation_density'] = text.count('!') / word_count if word_count > 0 else 0
        features['question_density'] = text.count('?') / word_count if word_count > 0 else 0
        features['period_density'] = text.count('.') / word_count if word_count > 0 else 0
        all_caps_words = [w for w in text.split() if w.isupper() and len(w) > 1]
        features['all_caps_word_count'] = len(all_caps_words)
        features['all_caps_ratio'] = len(all_caps_words) / word_count if word_count > 0 else 0
        mixed_case_words = [w for w in text.split() if not w.isupper() and not w.islower() and w.isalpha()]
        features['mixed_case_word_count'] = len(mixed_case_words)
        features['mixed_case_ratio'] = len(mixed_case_words) / word_count if word_count > 0 else 0
        word_freq = Counter(words)
        repeated_words = [word for word, count in word_freq.items() if count > 2]
        features['repeated_word_count'] = len(repeated_words)
        features['repetition_ratio'] = len(repeated_words) / unique_words if unique_words > 0 else 0
        suspicious_patterns = [
            r'[a-z]{10,}',
            r'[a-z]*[0-9]+[a-z]*',
            r'[a-z]*[A-Z]+[a-z]*',
        ]
        suspicious_count = sum(len(re.findall(pattern, text)) for pattern in suspicious_patterns)
        features['suspicious_pattern_count'] = suspicious_count
        if words:
            vowel_count = sum(len(re.findall(r'[aeiouy]', word)) for word in words)
            features['avg_vowels_per_word'] = vowel_count / word_count
        else:
            features['avg_vowels_per_word'] = 0
        formal_words = ['please', 'kindly', 'regards', 'sincerely', 'respectfully']
        formal_count = sum(1 for word in formal_words if word in text_lower)
        features['formal_word_count'] = formal_count
        features['formality_ratio'] = formal_count / word_count if word_count > 0 else 0
        greetings = ['hello', 'hi', 'dear', 'greetings', 'good morning', 'good afternoon']
        has_greeting = any(greeting in text_lower[:50] for greeting in greetings)
        features['has_greeting'] = 1 if has_greeting else 0
        closings = ['regards', 'sincerely', 'best', 'thanks', 'thank you', 'yours']
        has_closing = any(closing in text_lower[-100:] for closing in closings)
        features['has_closing'] = 1 if has_closing else 0
        return features
