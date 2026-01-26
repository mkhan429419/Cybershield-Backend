import re
from typing import Dict, Any, List


class PersuasionCueExtractor:

    def __init__(self):
        self.cues = {
            'authority': [
                r'\bofficial\b', r'\bverify\b', r'\bconfirm\b', r'\bvalidate\b',
                r'\bsecurity\b', r'\baccount\b', r'\bbank\b', r'\bsupport\b',
                r'\badmin\b', r'\bteam\b', r'\bdepartment\b', r'\bcompliance\b',
            ],
            'urgency': [
                r'\burgent\b', r'\bimmediate\b', r'\basap\b', r'\bnow\b', r'\bhurry\b',
                r'\blimited time\b', r'\bexpire\b', r'\bact now\b', r'\bdeadline\b',
                r'\blast chance\b', r'\bwithin (?:24 )?hours\b', r'\bright now\b',
            ],
            'scarcity': [
                r'\blimited\b', r'\bonly (?:a )?few\b', r'\bexclusive\b',
                r'\bwhile (?:supplies )?last\b', r'\bdon\'?t miss\b', r'\bending soon\b',
                r'\bfinal\b', r'\blast (?:remaining )?\d+\b', r'\bselling out\b',
            ],
            'fear': [
                r'\bsuspended\b', r'\blocked\b', r'\bclosed\b', r'\bterminated\b',
                r'\bviolation\b', r'\bunauthorized\b', r'\bbreach\b', r'\bcompromise\b',
                r'\bwarning\b', r'\balert\b', r'\brisk\b', r'\bpenalty\b', r'\bfine\b',
            ],
            'reciprocity': [
                r'\bfree\b', r'\bgift\b', r'\bbonus\b', r'\breward\b', r'\bprize\b',
                r'\bcongratulations\b', r'\bwinner\b', r'\bclaim\b', r'\boffer\b',
                r'\bspecial (?:for you|discount)\b', r'\bthank you\b', r'\bcomplimentary\b',
            ],
            'trust': [
                r'\bsecure\b', r'\btrusted\b', r'\bverified\b', r'\bguaranteed\b',
                r'\bprotected\b', r'\bconfidential\b', r'\bsafe\b', r'\bhttps?\b',
                r'\bencrypted\b', r'\bssl\b', r'\blegitimate\b', r'\bofficial (?:site|link)\b',
            ],
        }
        self._compiled = {k: [re.compile(p, re.I) for p in v] for k, v in self.cues.items()}

    def extract(self, text: str) -> Dict[str, Any]:
        if not text or not isinstance(text, str):
            text = ''
        text_lower = text.lower()
        result = {}
        for cue_name, patterns in self._compiled.items():
            examples = []
            count = 0
            for pat in patterns:
                for m in pat.finditer(text_lower):
                    count += 1
                    s = m.group(0)
                    if s not in examples:
                        examples.append(s)
                    if len(examples) >= 5:
                        break
                if len(examples) >= 5:
                    break
            result[cue_name] = {
                'present': count > 0,
                'count': count,
                'examples': examples[:5],
            }
        return result

    def extract_labels_only(self, text: str) -> List[str]:
        out = self.extract(text)
        return [k for k, v in out.items() if v.get('present')]
