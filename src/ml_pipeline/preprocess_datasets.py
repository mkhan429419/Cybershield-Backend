import csv
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

csv.field_size_limit(2147483647)

EMAIL_COLS = ["subject", "body", "label", "sender", "receiver", "date", "urls"]
WHATSAPP_COLS = ["label", "text", "url", "email", "phone"]


def _extract_urls(text: str) -> List[str]:
    if not text:
        return []
    pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    return list(set(re.findall(pattern, str(text))))


def _norm_key(k: Optional[str]) -> str:
    if k is None:
        return ""
    return str(k).strip().lstrip("\ufeff")


def _email_label(raw: str) -> Optional[str]:
    raw = str(raw or "").strip().lower()
    if not raw:
        return None
    if raw in ("phishing", "spam"):
        return "phishing"
    if raw in ("legitimate", "ham"):
        return "legitimate"
    if raw.isdigit():
        return "phishing" if int(raw) == 1 else "legitimate"
    return None


def _whatsapp_label(raw: str) -> Optional[str]:
    raw = str(raw or "").strip().lower()
    if not raw:
        return None
    if raw in ("ham", "legitimate"):
        return "legitimate"
    if raw in ("spam", "smishing", "phishing", "scam"):
        return "phishing"
    return None


def _detect_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample).delimiter
    except Exception:
        pass
    s = sample[:200]
    if "\t" in s:
        return "\t"
    if ";" in s:
        return ";"
    return ","


def _yes_no(val: Any) -> str:
    v = str(val or "").strip().lower()
    return "Yes" if v in ("yes", "true", "1") else "No"


def _preprocess_email_file(path: Path, out_path: Path) -> Tuple[int, int, int]:
    written = skipped_text = skipped_label = 0
    rows_out: List[Dict[str, str]] = []

    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        sample = f.read(1024)
        f.seek(0)
        delim = _detect_delimiter(sample)
        reader = csv.DictReader(f, delimiter=delim, quoting=csv.QUOTE_MINIMAL)
        for row in reader:
            row = {_norm_key(k): v for k, v in row.items() if k is not None}
            body = str(row.get("body", "") or "").strip()
            subject = str(row.get("subject", "") or "").strip()
            if body:
                text = f"{subject} {body}".strip() if subject else body
            elif subject:
                text = subject
            else:
                text = str(row.get("content", "") or row.get("message", "") or row.get("text", "") or "").strip()
            if not text:
                skipped_text += 1
                continue
            label = _email_label(row.get("label", ""))
            if label is None:
                skipped_label += 1
                continue
            urls = _extract_urls(text)
            if row.get("urls"):
                urls.extend(_extract_urls(str(row.get("urls", ""))))
            urls = list(dict.fromkeys(urls))
            sender = str(row.get("sender", "") or row.get("from", "") or row.get("from_email", "") or "").strip()
            receiver = str(row.get("receiver", "") or row.get("to", "") or "").strip()
            date = str(row.get("date", "") or row.get("timestamp", "") or "").strip()
            rows_out.append({
                "subject": subject,
                "body": body if body else subject,
                "label": label,
                "sender": sender,
                "receiver": receiver,
                "date": date,
                "urls": " ".join(urls),
            })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=EMAIL_COLS, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(rows_out)
    written = len(rows_out)
    return written, skipped_text, skipped_label


def _preprocess_whatsapp_file(path: Path, out_path: Path) -> Tuple[int, int, int]:
    written = skipped_text = skipped_label = 0
    rows_out: List[Dict[str, str]] = []

    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        sample = f.read(1024)
        f.seek(0)
        first = sample.split("\n")[0] if sample else ""
        is_mendeley = (
            "label" in first.lower() and "text" in first.lower()
            and "url" in first.lower() and "phone" in first.lower()
        )
        delim = "," if is_mendeley else _detect_delimiter(sample)
        reader = csv.DictReader(f, delimiter=delim, quoting=csv.QUOTE_MINIMAL)
        for row in reader:
            row = {_norm_key(k): v for k, v in row.items() if k is not None}
            rl = {k.lower(): v for k, v in row.items()}
            if is_mendeley:
                text = str(rl.get("text", "") or "").strip()
            else:
                text = str(rl.get("message", "") or "").strip()
                if not text:
                    text = str(rl.get("content", "") or rl.get("text", "") or rl.get("body", "") or "").strip()
            if not text:
                skipped_text += 1
                continue
            if is_mendeley:
                label = _whatsapp_label(rl.get("label", ""))
                if label is None:
                    skipped_label += 1
                    continue
                url = _yes_no(rl.get("url", ""))
                email = _yes_no(rl.get("email", ""))
                phone = _yes_no(rl.get("phone", ""))
            else:
                raw_l = str(rl.get("label", "") or "").strip().lower()
                if not raw_l:
                    label = "phishing"
                elif raw_l in ("phishing", "scam", "spam"):
                    label = "phishing"
                elif raw_l in ("legitimate", "ham"):
                    label = "legitimate"
                else:
                    label = "phishing"
                urls = _extract_urls(text)
                url = "Yes" if urls else "No"
                email = "No"
                phone = "No"
            rows_out.append({
                "label": label,
                "text": text,
                "url": url,
                "email": email,
                "phone": phone,
            })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=WHATSAPP_COLS, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(rows_out)
    written = len(rows_out)
    return written, skipped_text, skipped_label


def preprocess_datasets(
    data_dir: Optional[Path] = None,
    email_dir: Optional[Path] = None,
    whatsapp_dir: Optional[Path] = None,
    email_cleaned_dir: Optional[Path] = None,
    whatsapp_cleaned_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    base = Path(__file__).resolve().parent / "data"
    data_dir = data_dir or base
    email_dir = email_dir or data_dir / "email"
    whatsapp_dir = whatsapp_dir or data_dir / "whatsapp"
    email_cleaned_dir = email_cleaned_dir or data_dir / "email_cleaned"
    whatsapp_cleaned_dir = whatsapp_cleaned_dir or data_dir / "whatsapp_cleaned"

    result: Dict[str, Any] = {"email": {"files": 0, "total": 0, "skipped_text": 0, "skipped_label": 0},
                              "whatsapp": {"files": 0, "total": 0, "skipped_text": 0, "skipped_label": 0}}

    if not email_dir.exists():
        print("  Email: no data/email dir, skipping.")
    elif not list(email_dir.glob("*.csv")):
        print("  Email: no CSVs in data/email, skipping.")
    else:
        for p in email_dir.glob("*.csv"):
            if "_normalized" in p.stem or p.name.endswith("_normalized.csv"):
                continue
            out = email_cleaned_dir / p.name
            w, st, sl = _preprocess_email_file(p, out)
            result["email"]["files"] += 1
            result["email"]["total"] += w
            result["email"]["skipped_text"] += st
            result["email"]["skipped_label"] += sl
            print(f"  Email: {p.name} -> {out.name} ({w} rows, skipped {st} no-text, {sl} no-label)")

    if not whatsapp_dir.exists():
        print("  WhatsApp: no data/whatsapp dir, skipping.")
    elif not list(whatsapp_dir.glob("*.csv")):
        print("  WhatsApp: no CSVs in data/whatsapp, skipping.")
    else:
        for p in whatsapp_dir.glob("*.csv"):
            if "_normalized" in p.stem or p.name.endswith("_normalized.csv"):
                continue
            out = whatsapp_cleaned_dir / p.name
            w, st, sl = _preprocess_whatsapp_file(p, out)
            result["whatsapp"]["files"] += 1
            result["whatsapp"]["total"] += w
            result["whatsapp"]["skipped_text"] += st
            result["whatsapp"]["skipped_label"] += sl
            print(f"  WhatsApp: {p.name} -> {out.name} ({w} rows, skipped {st} no-text, {sl} no-label)")

    return result


def run():
    base = Path(__file__).resolve().parent / "data"
    print("Preprocessing datasets...")
    print(f"  Input:  {base / 'email'}, {base / 'whatsapp'}")
    print(f"  Output: {base / 'email_cleaned'}, {base / 'whatsapp_cleaned'}")
    r = preprocess_datasets()
    print(f"Done. Email: {r['email']['total']} rows from {r['email']['files']} files; WhatsApp: {r['whatsapp']['total']} rows from {r['whatsapp']['files']} files.")


if __name__ == "__main__":
    run()
