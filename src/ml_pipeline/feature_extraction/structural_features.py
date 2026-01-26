import re
from typing import Dict, Any, List
from html.parser import HTMLParser


class HTMLTagCounter(HTMLParser):

    def __init__(self):
        super().__init__()
        self.tag_counts = {}

    def handle_starttag(self, tag, attrs):
        self.tag_counts[tag] = self.tag_counts.get(tag, 0) + 1


class StructuralFeatureExtractor:

    def __init__(self):
        pass

    def extract(self, text: str, html_content: str = None, message_type: str = "email") -> Dict[str, Any]:
        features = {}
        features['has_html'] = 1 if html_content and len(html_content.strip()) > 0 else 0
        if html_content:
            parser = HTMLTagCounter()
            try:
                parser.feed(html_content)
                tag_counts = parser.tag_counts
                features['html_tag_count'] = sum(tag_counts.values())
                features['html_link_count'] = tag_counts.get('a', 0)
                features['html_image_count'] = tag_counts.get('img', 0)
                features['html_form_count'] = tag_counts.get('form', 0)
                features['html_script_count'] = tag_counts.get('script', 0)
                features['html_iframe_count'] = tag_counts.get('iframe', 0)
                features['html_style_count'] = tag_counts.get('style', 0)
                features['has_inline_style'] = 1 if 'style=' in html_content.lower() else 0
                features['has_javascript'] = 1 if '<script' in html_content.lower() else 0
                features['has_iframe'] = 1 if '<iframe' in html_content.lower() else 0
                features['has_hidden_content'] = 1 if 'display:none' in html_content.lower() or 'visibility:hidden' in html_content.lower() else 0
            except Exception:
                features['html_tag_count'] = 0
                features['html_link_count'] = 0
                features['html_image_count'] = 0
                features['html_form_count'] = 0
                features['html_script_count'] = 0
                features['html_iframe_count'] = 0
                features['html_style_count'] = 0
                features['has_inline_style'] = 0
                features['has_javascript'] = 0
                features['has_iframe'] = 0
                features['has_hidden_content'] = 0
        else:
            features['html_tag_count'] = 0
            features['html_link_count'] = 0
            features['html_image_count'] = 0
            features['html_form_count'] = 0
            features['html_script_count'] = 0
            features['html_iframe_count'] = 0
            features['html_style_count'] = 0
            features['has_inline_style'] = 0
            features['has_javascript'] = 0
            features['has_iframe'] = 0
            features['has_hidden_content'] = 0
        lines = text.split('\n') if text else []
        features['line_count'] = len(lines)
        features['non_empty_line_count'] = len([l for l in lines if l.strip()])
        features['empty_line_ratio'] = (features['line_count'] - features['non_empty_line_count']) / features['line_count'] if features['line_count'] > 0 else 0
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()] if text else []
        features['paragraph_count'] = len(paragraphs)
        if paragraphs:
            paragraph_lengths = [len(p.split()) for p in paragraphs]
            features['avg_paragraph_length'] = sum(paragraph_lengths) / len(paragraph_lengths)
            features['max_paragraph_length'] = max(paragraph_lengths)
            features['min_paragraph_length'] = min(paragraph_lengths)
        else:
            features['avg_paragraph_length'] = 0
            features['max_paragraph_length'] = 0
            features['min_paragraph_length'] = 0
        list_items = re.findall(r'^\s*[-*•]\s+', text, re.MULTILINE) if text else []
        numbered_items = re.findall(r'^\s*\d+[.)]\s+', text, re.MULTILINE) if text else []
        features['list_item_count'] = len(list_items)
        features['numbered_item_count'] = len(numbered_items)
        features['has_list'] = 1 if features['list_item_count'] > 0 or features['numbered_item_count'] > 0 else 0
        if html_content:
            table_count = html_content.lower().count('<table')
            features['table_count'] = table_count
            features['has_table'] = 1 if table_count > 0 else 0
        else:
            features['table_count'] = 0
            features['has_table'] = 0
        if text:
            features['consecutive_space_count'] = len(re.findall(r' {2,}', text))
            features['consecutive_newline_count'] = len(re.findall(r'\n{2,}', text))
            features['tab_count'] = text.count('\t')
        else:
            features['consecutive_space_count'] = 0
            features['consecutive_newline_count'] = 0
            features['tab_count'] = 0
        if text:
            features['unicode_char_count'] = sum(1 for c in text if ord(c) > 127)
            features['unicode_ratio'] = features['unicode_char_count'] / len(text) if len(text) > 0 else 0
        else:
            features['unicode_char_count'] = 0
            features['unicode_ratio'] = 0
        if text:
            has_consistent_caps = all(w[0].isupper() or w[0].islower() for w in text.split() if w and w[0].isalpha())
            features['has_consistent_formatting'] = 1 if has_consistent_caps else 0
        else:
            features['has_consistent_formatting'] = 0
        if message_type == "email":
            features['has_signature'] = 1 if '--' in text or 'regards' in text.lower()[-200:] else 0
            features['has_disclaimer'] = 1 if 'disclaimer' in text.lower() or 'confidential' in text.lower() else 0
        elif message_type == "whatsapp":
            features['has_forward_indicator'] = 1 if 'forwarded' in text.lower() else 0
            features['has_timestamp'] = 1 if re.search(r'\d{1,2}[:/]\d{2}', text) else 0
        if text:
            content_chars = len(re.sub(r'\s', '', text))
            total_chars = len(text)
            features['content_density'] = content_chars / total_chars if total_chars > 0 else 0
        else:
            features['content_density'] = 0
        return features
