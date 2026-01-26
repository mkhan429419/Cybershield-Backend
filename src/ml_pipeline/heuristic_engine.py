from typing import Dict, Any, Optional
import re


class EmailHeuristicEngine:

    def __init__(self):
        self.urgent_subject = [
            'urgent', 'immediate', 'asap', 'important', 'action required',
            'verify', 'confirm', 'suspended', 'locked', 'attention',
        ]
        self.free_domains = [
            'gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'mail', 'live', 'icloud',
        ]

    def compute(self, metadata: Dict[str, Any], subject: str = '', sender: str = '') -> float:
        metadata = metadata or {}
        subject = subject or metadata.get('subject') or ''
        sender = sender or metadata.get('from') or metadata.get('from_email') or ''
        score = 0.0
        subject_lower = (subject or '').lower()
        sender_lower = (sender or '').lower()
        spf = (metadata.get('spf') or '').lower()
        dkim = (metadata.get('dkim') or '').lower()
        dmarc = (metadata.get('dmarc') or '').lower()
        if spf and spf not in ('pass', 'neutral'):
            score += 0.25
        if dkim and dkim != 'pass':
            score += 0.25
        if dmarc and dmarc != 'pass':
            score += 0.15
        reply_to = (metadata.get('reply_to') or metadata.get('headers', {}).get('reply-to') or '')
        if reply_to and sender and '@' in str(sender) and '@' in str(reply_to):
            sd = (sender.split('@')[-1] or '').lower()
            rd = (reply_to.split('@')[-1] or '').lower()
            if sd != rd:
                score += 0.2
        if any(w in subject_lower for w in self.urgent_subject):
            score += 0.1
        if subject and subject.isupper() and len(subject) > 10:
            score += 0.05
        if sender and '@' in sender:
            domain = sender.split('@')[-1].lower()
            is_free = any(f in domain for f in self.free_domains)
            if is_free and any(w in subject_lower for w in self.urgent_subject):
                score += 0.05
        else:
            score += 0.05
        prio = (metadata.get('priority') or '').lower()
        if prio in ('high', 'urgent', '1'):
            score += 0.05
        return min(1.0, score)
