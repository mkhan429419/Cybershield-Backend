import re
from urllib.parse import urlparse, parse_qs
from typing import Dict, Any, List
import ipaddress


class URLFeatureExtractor:

    def __init__(self):
        self.legitimate_domains = [
            'google.com', 'microsoft.com', 'amazon.com', 'facebook.com',
            'twitter.com', 'linkedin.com', 'github.com', 'paypal.com',
            'apple.com', 'netflix.com', 'youtube.com'
        ]
        self.suspicious_tlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top']
        self.url_shorteners = [
            'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co',
            'short.link', 'is.gd', 'buff.ly', 'rebrand.ly'
        ]

    def extract(self, url: str) -> Dict[str, Any]:
        if not url:
            return self._empty_features()
        try:
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            parsed = urlparse(url)
        except Exception:
            return self._empty_features()
        features = {}
        features['url_length'] = len(url)
        features['domain_length'] = len(parsed.netloc) if parsed.netloc else 0
        features['path_length'] = len(parsed.path) if parsed.path else 0
        features['query_length'] = len(parsed.query) if parsed.query else 0
        features['fragment_length'] = len(parsed.fragment) if parsed.fragment else 0
        features['uses_https'] = 1 if parsed.scheme == 'https' else 0
        features['uses_http'] = 1 if parsed.scheme == 'http' else 0
        domain = parsed.netloc.lower()
        features['domain'] = domain
        parts = domain.split('.')
        features['subdomain_count'] = len(parts) - 2 if len(parts) >= 2 else 0
        if '.' in domain:
            tld = '.' + domain.split('.')[-1]
            features['has_suspicious_tld'] = 1 if tld in self.suspicious_tlds else 0
            features['tld'] = tld
        else:
            features['has_suspicious_tld'] = 0
            features['tld'] = ''
        try:
            domain_without_port = domain.split(':')[0]
            ipaddress.ip_address(domain_without_port)
            features['is_ip_address'] = 1
        except (ValueError, AttributeError):
            features['is_ip_address'] = 0
        features['is_shortened'] = 1 if any(shortener in domain for shortener in self.url_shorteners) else 0
        features['is_legitimate_domain'] = 1 if any(legit in domain for legit in self.legitimate_domains) else 0
        path = parsed.path
        features['path_depth'] = path.count('/') - 1 if path else 0
        features['has_file_extension'] = 1 if '.' in path.split('/')[-1] else 0
        query = parsed.query
        if query:
            query_params = parse_qs(query)
            features['query_param_count'] = len(query_params)
            features['has_query_params'] = 1
        else:
            features['query_param_count'] = 0
            features['has_query_params'] = 0
        features['has_at_symbol'] = 1 if '@' in url else 0
        features['has_double_slash'] = 1 if '//' in url.replace('://', '') else 0
        features['digit_ratio'] = sum(1 for c in url if c.isdigit()) / len(url) if url else 0
        features['special_char_ratio'] = sum(1 for c in url if c in '!@#$%^&*()_+-=[]{}|;:,.<>?') / len(url) if url else 0
        features['has_homograph'] = 1 if any(char in domain for char in ['0', '1', 'l', 'I', 'O']) else 0
        if ':' in domain:
            try:
                port = int(domain.split(':')[1])
                features['has_port'] = 1
                features['port'] = port
                features['is_default_port'] = 1 if port in [80, 443] else 0
            except (ValueError, IndexError):
                features['has_port'] = 0
                features['port'] = 0
                features['is_default_port'] = 0
        else:
            features['has_port'] = 0
            features['port'] = 0
            features['is_default_port'] = 1
        return features

    def extract_all(self, urls: List[str]) -> Dict[str, Any]:
        if not urls:
            return self._empty_features()
        all_features = [self.extract(url) for url in urls]
        aggregated = {
            'url_count': len(urls),
            'avg_url_length': sum(f.get('url_length', 0) for f in all_features) / len(urls),
            'total_suspicious_tlds': sum(f.get('has_suspicious_tld', 0) for f in all_features),
            'total_shortened_urls': sum(f.get('is_shortened', 0) for f in all_features),
            'total_ip_addresses': sum(f.get('is_ip_address', 0) for f in all_features),
            'total_legitimate_domains': sum(f.get('is_legitimate_domain', 0) for f in all_features),
            'avg_query_params': sum(f.get('query_param_count', 0) for f in all_features) / len(urls),
        }
        if all_features:
            first_url_features = {f'first_{k}': v for k, v in all_features[0].items()
                                 if k not in ['domain', 'tld']}
            aggregated.update(first_url_features)
        return aggregated

    def _empty_features(self) -> Dict[str, Any]:
        return {
            'url_length': 0,
            'domain_length': 0,
            'path_length': 0,
            'query_length': 0,
            'fragment_length': 0,
            'uses_https': 0,
            'uses_http': 0,
            'subdomain_count': 0,
            'has_suspicious_tld': 0,
            'is_ip_address': 0,
            'is_shortened': 0,
            'is_legitimate_domain': 0,
            'path_depth': 0,
            'has_file_extension': 0,
            'query_param_count': 0,
            'has_query_params': 0,
            'has_at_symbol': 0,
            'has_double_slash': 0,
            'digit_ratio': 0,
            'special_char_ratio': 0,
            'has_homograph': 0,
            'has_port': 0,
            'port': 0,
            'is_default_port': 0,
        }
