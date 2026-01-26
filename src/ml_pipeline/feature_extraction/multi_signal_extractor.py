from typing import Dict, Any, List, Optional

from .text_features import TextFeatureExtractor
from .url_features import URLFeatureExtractor
from .metadata_features import MetadataFeatureExtractor
from .linguistic_features import LinguisticFeatureExtractor
from .structural_features import StructuralFeatureExtractor


class MultiSignalFeatureExtractor:

    def __init__(self):
        self.text_extractor = TextFeatureExtractor()
        self.url_extractor = URLFeatureExtractor()
        self.metadata_extractor = MetadataFeatureExtractor()
        self.linguistic_extractor = LinguisticFeatureExtractor()
        self.structural_extractor = StructuralFeatureExtractor()

    def _apply_feature_weights(self, all_features):
        """Reduce rigidity: scale down url/link/keyword features so we don't over-flag phishing."""
        w_url = 0.5
        w_link = 0.5
        w_kw = 0.8
        for k in list(all_features.keys()):
            if k.startswith('url_'):
                v = all_features[k]
                try:
                    all_features[k] = float(v) * w_url
                except (TypeError, ValueError):
                    pass
        for k in ('text_has_url', 'text_url_count'):
            if k in all_features:
                v = all_features[k]
                try:
                    all_features[k] = float(v) * w_link
                except (TypeError, ValueError):
                    pass
        for k in list(all_features.keys()):
            if k.startswith('text_pattern_') and 'http' in k:
                v = all_features[k]
                try:
                    all_features[k] = float(v) * w_link
                except (TypeError, ValueError):
                    pass
        for k in ('text_phishing_keyword_count', 'text_phishing_keyword_ratio'):
            if k in all_features:
                v = all_features[k]
                try:
                    all_features[k] = float(v) * w_kw
                except (TypeError, ValueError):
                    pass

    def extract(self,
                text: str,
                message_type: str = "email",
                metadata: Optional[Dict[str, Any]] = None,
                urls: Optional[List[str]] = None,
                html_content: Optional[str] = None) -> Dict[str, Any]:
        all_features = {}
        text_features = self.text_extractor.extract(text, message_type)
        all_features.update({f'text_{k}': v for k, v in text_features.items()})
        if urls:
            url_features = self.url_extractor.extract_all(urls)
            all_features.update({f'url_{k}': v for k, v in url_features.items()})
        else:
            import re
            url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
            found_urls = re.findall(url_pattern, text)
            if found_urls:
                url_features = self.url_extractor.extract_all(found_urls)
                all_features.update({f'url_{k}': v for k, v in url_features.items()})
            else:
                empty_url_features = self.url_extractor._empty_features()
                all_features.update({f'url_{k}': v for k, v in empty_url_features.items()})
                all_features['url_count'] = 0
        self._apply_feature_weights(all_features)
        if metadata:
            metadata_features = self.metadata_extractor.extract(metadata, message_type)
            all_features.update({f'metadata_{k}': v for k, v in metadata_features.items()})
        else:
            empty_metadata = {}
            if message_type == "email":
                empty_metadata = {
                    'sender_length': 0, 'sender_email_length': 0, 'has_sender_name': 0,
                    'sender_domain_length': 0, 'sender_has_subdomain': 0, 'sender_is_free_email': 0,
                    'recipient_count': 0, 'cc_count': 0, 'bcc_count': 0,
                    'subject_length': 0, 'subject_word_count': 0, 'subject_has_urgent': 0,
                    'subject_all_caps': 0, 'hour_sent': 0, 'day_of_week': 0,
                    'is_weekend': 0, 'is_business_hours': 0, 'header_count': 0,
                    'has_reply_to': 0, 'has_return_path': 0, 'spf_pass': 0,
                    'dkim_pass': 0, 'dmarc_pass': 0, 'has_message_id': 0,
                    'message_id_length': 0, 'is_high_priority': 0, 'is_low_priority': 0,
                    'attachment_count': 0, 'has_attachments': 0, 'message_size': 0,
                    'is_large_message': 0
                }
            else:
                empty_metadata = {
                    'sender_length': 0, 'sender_phone_length': 0, 'phone_digit_count': 0,
                    'is_international': 0, 'has_country_code': 0, 'is_group_message': 0,
                    'group_size': 0, 'hour_sent': 0, 'day_of_week': 0,
                    'is_weekend': 0, 'is_business_hours': 0, 'is_forwarded': 0,
                    'is_starred': 0, 'has_media': 0, 'media_type': '',
                    'has_location': 0, 'has_url': 0, 'has_email': 0, 'has_phone': 0
                }
            all_features.update({f'metadata_{k}': v for k, v in empty_metadata.items()})
        linguistic_features = self.linguistic_extractor.extract(text)
        all_features.update({f'linguistic_{k}': v for k, v in linguistic_features.items()})
        structural_features = self.structural_extractor.extract(text, html_content, message_type)
        all_features.update({f'structural_{k}': v for k, v in structural_features.items()})
        return all_features
