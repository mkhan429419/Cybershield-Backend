from typing import Dict, Any, Iterable

STRUCTURAL_PREFIXES = ("url_", "structural_")
STRUCTURAL_EXTRA = (
    "text_has_url", "text_has_phone", "text_digit_ratio", "text_special_char_ratio",
    "text_exclamation_count", "text_question_count", "text_url_count", "text_phone_count",
    "text_has_email", "text_email_count", "text_uppercase_ratio", "text_all_caps_words",
    "url_count",
)


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def structural_feature_keys(all_keys: Iterable[str]) -> list:
    keys = [k for k in all_keys if k.startswith(STRUCTURAL_PREFIXES) or k in STRUCTURAL_EXTRA]
    return sorted(set(keys))


def correlate_stub(incident: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "correlation_score": 0.0,
        "explanation": "No cross-vector correlation (Email and WhatsApp datasets are not linked).",
        "signals": [],
    }
