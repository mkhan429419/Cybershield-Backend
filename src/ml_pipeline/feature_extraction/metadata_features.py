from typing import Dict, Any, Optional
from datetime import datetime
import re


class MetadataFeatureExtractor:

    def __init__(self):
        pass

    def extract_email_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        features = {}
        sender = metadata.get('from', '')
        sender_email = metadata.get('from_email', '')
        features['sender_length'] = len(sender) if sender else 0
        features['sender_email_length'] = len(sender_email) if sender_email else 0
        features['has_sender_name'] = 1 if sender and '@' not in sender else 0
        if sender_email and '@' in sender_email:
            domain = sender_email.split('@')[1].lower()
            features['sender_domain_length'] = len(domain)
            features['sender_has_subdomain'] = 1 if '.' in domain.split('.')[0] else 0
            features['sender_is_free_email'] = 1 if any(provider in domain for provider in
                ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'mail']) else 0
        else:
            features['sender_domain_length'] = 0
            features['sender_has_subdomain'] = 0
            features['sender_is_free_email'] = 0
        recipients = metadata.get('to', [])
        if isinstance(recipients, str):
            recipients = [recipients]
        features['recipient_count'] = len(recipients) if recipients else 0
        cc = metadata.get('cc', [])
        bcc = metadata.get('bcc', [])
        features['cc_count'] = len(cc) if cc else 0
        features['bcc_count'] = len(bcc) if bcc else 0
        subject = metadata.get('subject', '')
        features['subject_length'] = len(subject) if subject else 0
        features['subject_word_count'] = len(subject.split()) if subject else 0
        features['subject_has_urgent'] = 1 if any(word in subject.lower() for word in
            ['urgent', 'immediate', 'asap', 'important', 'action required']) else 0
        features['subject_all_caps'] = 1 if subject and subject.isupper() else 0
        date_sent = metadata.get('date', None)
        if date_sent:
            try:
                if isinstance(date_sent, str):
                    date_sent = datetime.fromisoformat(date_sent.replace('Z', '+00:00'))
                features['hour_sent'] = date_sent.hour
                features['day_of_week'] = date_sent.weekday()
                features['is_weekend'] = 1 if date_sent.weekday() >= 5 else 0
                features['is_business_hours'] = 1 if 9 <= date_sent.hour <= 17 else 0
            except Exception:
                features['hour_sent'] = 0
                features['day_of_week'] = 0
                features['is_weekend'] = 0
                features['is_business_hours'] = 0
        else:
            features['hour_sent'] = 0
            features['day_of_week'] = 0
            features['is_weekend'] = 0
            features['is_business_hours'] = 0
        headers = metadata.get('headers', {})
        features['header_count'] = len(headers) if headers else 0
        features['has_reply_to'] = 1 if 'reply-to' in headers or 'Reply-To' in headers else 0
        features['has_return_path'] = 1 if 'return-path' in headers or 'Return-Path' in headers else 0
        features['spf_pass'] = 1 if metadata.get('spf', '').lower() == 'pass' else 0
        features['dkim_pass'] = 1 if metadata.get('dkim', '').lower() == 'pass' else 0
        features['dmarc_pass'] = 1 if metadata.get('dmarc', '').lower() == 'pass' else 0
        message_id = metadata.get('message_id', '')
        features['has_message_id'] = 1 if message_id else 0
        features['message_id_length'] = len(message_id) if message_id else 0
        priority = metadata.get('priority', '').lower()
        features['is_high_priority'] = 1 if priority in ['high', 'urgent', '1'] else 0
        features['is_low_priority'] = 1 if priority in ['low', '5'] else 0
        attachments = metadata.get('attachments', [])
        features['attachment_count'] = len(attachments) if attachments else 0
        features['has_attachments'] = 1 if features['attachment_count'] > 0 else 0
        size = metadata.get('size', 0)
        features['message_size'] = size
        features['is_large_message'] = 1 if size > 100000 else 0
        return features

    def extract_whatsapp_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        features = {}
        sender = metadata.get('from', '')
        sender_phone = metadata.get('from_phone', '')
        features['sender_length'] = len(sender) if sender else 0
        features['sender_phone_length'] = len(sender_phone) if sender_phone else 0
        if sender_phone:
            digits_only = re.sub(r'\D', '', sender_phone)
            features['phone_digit_count'] = len(digits_only)
            features['is_international'] = 1 if sender_phone.startswith('+') else 0
            features['has_country_code'] = 1 if len(digits_only) > 10 else 0
        else:
            features['phone_digit_count'] = 0
            features['is_international'] = 0
            features['has_country_code'] = 0
        features['is_group_message'] = 1 if metadata.get('is_group', False) else 0
        features['group_size'] = metadata.get('group_size', 0) if features['is_group_message'] else 0
        timestamp = metadata.get('timestamp', None)
        if timestamp:
            try:
                if isinstance(timestamp, str):
                    timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                features['hour_sent'] = timestamp.hour
                features['day_of_week'] = timestamp.weekday()
                features['is_weekend'] = 1 if timestamp.weekday() >= 5 else 0
                features['is_business_hours'] = 1 if 9 <= timestamp.hour <= 17 else 0
            except Exception:
                features['hour_sent'] = 0
                features['day_of_week'] = 0
                features['is_weekend'] = 0
                features['is_business_hours'] = 0
        else:
            features['hour_sent'] = 0
            features['day_of_week'] = 0
            features['is_weekend'] = 0
            features['is_business_hours'] = 0
        status = metadata.get('status', '').lower()
        features['is_forwarded'] = 1 if metadata.get('forwarded', False) else 0
        features['is_starred'] = 1 if metadata.get('starred', False) else 0
        features['has_media'] = 1 if metadata.get('has_media', False) else 0
        features['media_type'] = metadata.get('media_type', '')
        features['has_location'] = 1 if metadata.get('has_location', False) else 0
        features['has_url'] = 1 if metadata.get('has_url') else 0
        features['has_email'] = 1 if metadata.get('has_email') else 0
        features['has_phone'] = 1 if metadata.get('has_phone') else 0
        return features

    def extract(self, metadata: Dict[str, Any], message_type: str = "email") -> Dict[str, Any]:
        if message_type == "email":
            return self.extract_email_metadata(metadata)
        elif message_type == "whatsapp":
            return self.extract_whatsapp_metadata(metadata)
        else:
            return {}
