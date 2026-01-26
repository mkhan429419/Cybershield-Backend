import sys
import csv
import json
import re
import pickle
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

csv.field_size_limit(2147483647)

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder

from src.ml_pipeline.pipeline import PhishingDetectionPipeline
from src.ml_pipeline.feature_extraction.multi_signal_extractor import MultiSignalFeatureExtractor
from src.ml_pipeline.utils import to_float, structural_feature_keys
from src.ml_pipeline.preprocess_datasets import preprocess_datasets


def extract_urls(text: str) -> List[str]:
    if not text:
        return []
    url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    return re.findall(url_pattern, str(text))


def _parse_yes_no(val: Any) -> int:
    v = str(val or '').strip().lower()
    return 1 if v in ('yes', 'true', '1') else 0


def load_email_dataset(data_dir: str, use_cleaned: bool = True) -> List[Dict[str, Any]]:
    incidents = []
    data_path = Path(data_dir)
    if use_cleaned:
        cleaned_dir = data_path.parent / 'email_cleaned'
        if cleaned_dir.exists() and list(cleaned_dir.glob('*.csv')):
            print(f"Using cleaned email datasets from: {cleaned_dir}")
            data_path = cleaned_dir
        else:
            print(f"Cleaned datasets not found, using raw datasets from: {data_path}")
    
    if not data_path.exists():
        print(f"Warning: Email data directory {data_path} does not exist")
        return incidents
    
    csv_files = list(data_path.glob('*.csv'))
    _names = {p.name for p in csv_files}
    csv_files = [p for p in csv_files if not (p.stem + '_normalized.csv' in _names and not p.stem.endswith('_normalized'))]
    print(f"Found {len(csv_files)} email CSV files")
    
    for file_path in csv_files:
        print(f"Loading {file_path.name}...")
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                sample = f.read(1024)
                f.seek(0)
                delimiter = ','
                try:
                    sniffer = csv.Sniffer()
                    delimiter = sniffer.sniff(sample).delimiter
                except:
                    if '\t' in sample[:100]:
                        delimiter = '\t'
                    elif ';' in sample[:100]:
                        delimiter = ';'
                    else:
                        delimiter = ','
                reader = csv.DictReader(f, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL)
                count = 0
                skipped_no_text = 0
                skipped_no_label = 0
                fieldnames = reader.fieldnames
                if fieldnames:
                    fieldnames = [name.strip().lstrip('\ufeff') for name in fieldnames]
                    print(f"    Columns found: {', '.join(fieldnames)}")
                
                for row_num, row in enumerate(reader):
                    if 'cleaned' not in str(data_path):
                        row = {k.strip().lstrip('\ufeff'): v for k, v in row.items() if k is not None}
                    
                    try:
                        body_text = str(row.get('body', '') or '').strip()
                        subject_text = str(row.get('subject', '') or '').strip()
                        if body_text:
                            text = f"{subject_text} {body_text}".strip() if subject_text else body_text
                        elif subject_text:
                            text = subject_text
                        else:
                            text = str(row.get('content', '') or row.get('message', '') or row.get('text', '') or '').strip()
                        if not text or len(text) == 0:
                            skipped_no_text += 1
                            continue
                        label_raw = row.get('label', '')
                        if not label_raw or str(label_raw).strip() == '':
                            skipped_no_label += 1
                            continue
                        
                        label = str(label_raw).strip().lower()
                        if label in ['phishing', 'spam']:
                            label = 'phishing'
                        elif label in ['legitimate', 'ham']:
                            label = 'legitimate'
                        elif label.isdigit():
                            label = 'phishing' if int(label) == 1 else 'legitimate'
                        else:
                            skipped_no_label += 1
                            continue
                        urls = extract_urls(text)
                        if row.get('urls'):
                            urls.extend(extract_urls(row.get('urls', '')))
                        urls = list(set(urls))
                        incident = {
                            'text': text.strip(),
                            'message_type': 'email',
                            'metadata': {
                                'from': row.get('sender', row.get('from', row.get('from_email', ''))),
                                'from_email': row.get('sender', row.get('from', row.get('from_email', ''))),
                                'subject': row.get('subject', ''),
                                'date': row.get('date', row.get('timestamp', '')),
                                'to': row.get('receiver', row.get('to', '')).split(',') if row.get('receiver', row.get('to', '')) else []
                            },
                            'urls': urls,
                            'label': label
                        }
                        incidents.append(incident)
                        count += 1
                    except Exception as e:
                        if row_num < 3:
                            print(f"    ERROR processing row {row_num+1}: {str(e)}")
                        continue
                
                print(f"  Loaded {count} incidents from {file_path.name}")
                if skipped_no_text > 0 or skipped_no_label > 0:
                    print(f"    Skipped: {skipped_no_text} (no text), {skipped_no_label} (no valid label)")
                if count == 0:
                    print(f"  WARNING: No incidents loaded. Check column names and data format.")
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f2:
                            sample = f2.read(500)
                            print(f"  Sample data (first 500 chars): {sample[:500]}")
                    except:
                        pass
        except Exception as e:
            print(f"  Error loading {file_path.name}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    
    return incidents


def load_whatsapp_dataset(data_dir: str, use_cleaned: bool = True) -> List[Dict[str, Any]]:
    incidents = []
    data_path = Path(data_dir)
    if use_cleaned:
        cleaned_dir = data_path.parent / 'whatsapp_cleaned'
        if cleaned_dir.exists() and list(cleaned_dir.glob('*.csv')):
            print(f"Using cleaned WhatsApp datasets from: {cleaned_dir}")
            data_path = cleaned_dir
        else:
            print(f"Cleaned datasets not found, using raw datasets from: {data_path}")
    
    if not data_path.exists():
        print(f"Warning: WhatsApp data directory {data_path} does not exist")
        return incidents
    
    csv_files = list(data_path.glob('*.csv'))
    _names = {p.name for p in csv_files}
    csv_files = [p for p in csv_files if not (p.stem + '_normalized.csv' in _names and not p.stem.endswith('_normalized'))]
    print(f"Found {len(csv_files)} WhatsApp CSV files")
    
    for file_path in csv_files:
        print(f"Loading {file_path.name}...")
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                sample = f.read(1024)
                f.seek(0)
                first_line = sample.split('\n')[0] if sample else ''
                is_mendeley = (
                    'label' in first_line.lower() and 'text' in first_line.lower() and
                    'url' in first_line.lower() and 'phone' in first_line.lower()
                )
                delimiter = ','
                if not is_mendeley:
                    try:
                        sniffer = csv.Sniffer()
                        delimiter = sniffer.sniff(sample).delimiter
                    except Exception:
                        if '\t' in first_line[:200]:
                            delimiter = '\t'
                        elif ';' in first_line[:200]:
                            delimiter = ';'
                
                reader = csv.DictReader(f, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL)
                count = 0
                skipped_no_text = 0
                skipped_no_label = 0
                
                fieldnames = reader.fieldnames
                if fieldnames:
                    fieldnames = [n.strip().lstrip('\ufeff') for n in fieldnames]
                    print(f"    Columns found: {', '.join(fieldnames)}")
                    if is_mendeley:
                        print(f"    Detected Mendeley SMS Phishing format (LABEL, TEXT, URL, EMAIL, PHONE)")
                
                for row_num, row in enumerate(reader):
                    if 'cleaned' not in str(data_path):
                        row = {k.strip().lstrip('\ufeff'): v for k, v in row.items() if k is not None}
                    row_lower = {k.lower(): v for k, v in row.items()}
                    
                    try:
                        if is_mendeley:
                            text = str(row_lower.get('text', '') or '').strip()
                        else:
                            text = str(row_lower.get('message', '') or '').strip()
                            if not text:
                                text = str(row_lower.get('content', '') or row_lower.get('text', '') or row_lower.get('body', '') or '').strip()
                        
                        if not text or len(text) == 0:
                            skipped_no_text += 1
                            continue
                        
                        if is_mendeley:
                            raw_label = str(row_lower.get('label', '') or '').strip().lower()
                            if raw_label in ('ham', 'legitimate'):
                                label = 'legitimate'
                            elif raw_label in ('spam', 'smishing', 'phishing', 'scam'):
                                label = 'phishing'
                            else:
                                skipped_no_label += 1
                                continue
                        else:
                            label = str(row_lower.get('label', '') or '').strip().lower()
                            if not label:
                                label = 'phishing'
                            elif label in ('phishing', 'scam', 'spam'):
                                label = 'phishing'
                            elif label in ('legitimate', 'ham'):
                                label = 'legitimate'
                            else:
                                label = 'phishing'
                        
                        urls = extract_urls(text)
                        metadata = {'from': '', 'timestamp': row_lower.get('date', row_lower.get('timestamp', ''))}
                        if is_mendeley:
                            metadata['has_url'] = _parse_yes_no(row_lower.get('url'))
                            metadata['has_email'] = _parse_yes_no(row_lower.get('email'))
                            metadata['has_phone'] = _parse_yes_no(row_lower.get('phone'))
                        
                        incident = {
                            'text': text.strip(),
                            'message_type': 'whatsapp',
                            'metadata': metadata,
                            'urls': urls,
                            'label': label
                        }
                        incidents.append(incident)
                        count += 1
                    except Exception as e:
                        if row_num < 3:
                            print(f"    ERROR processing row {row_num+1}: {str(e)}")
                        continue
                
                print(f"  Loaded {count} incidents from {file_path.name}")
                if skipped_no_text > 0 or skipped_no_label > 0:
                    print(f"    Skipped: {skipped_no_text} (no text), {skipped_no_label} (no valid label)")
                if count == 0:
                    print(f"  WARNING: No incidents loaded. Check column names and data format.")
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f2:
                            sample = f2.read(500)
                            print(f"  Sample data (first 500 chars): {sample[:500]}")
                    except:
                        pass
        except Exception as e:
            print(f"  Error loading {file_path.name}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    return incidents


def train_whatsapp_lexical(incidents: List[Dict[str, Any]], models_dir: Path) -> bool:
    texts = [i.get("text", "") or "" for i in incidents]
    labels = [i["label"] for i in incidents]
    le = LabelEncoder()
    y = le.fit_transform(labels)
    tfidf = TfidfVectorizer(max_features=5000, ngram_range=(1, 2), sublinear_tf=True)
    X = tfidf.fit_transform(texts)
    clf = RandomForestClassifier(n_estimators=100, max_depth=20, random_state=42)
    clf.fit(X, y)
    path = models_dir / "whatsapp_lexical.pkl"
    with open(path, "wb") as f:
        pickle.dump({"tfidf": tfidf, "clf": clf, "label_encoder": le}, f)
    print(f"  Lexical stream saved to {path}")
    return True


def train_whatsapp_structural(incidents: List[Dict[str, Any]], models_dir: Path) -> bool:
    """Train structural stream (scaler + RF) for WhatsApp. Saves whatsapp_structural.pkl."""
    extractor = MultiSignalFeatureExtractor()
    all_feats = []
    for i in incidents:
        f = extractor.extract(
            text=i.get("text", ""),
            message_type="whatsapp",
            metadata=i.get("metadata", {}),
            urls=i.get("urls", []),
            html_content=i.get("html_content"),
        )
        all_feats.append(f)
    keys = structural_feature_keys(all_feats[0].keys()) if all_feats else []
    if not keys:
        print("  WARNING: No structural feature keys. Skipping structural stream.")
        return False
    X = np.array([[to_float(f.get(k, 0.0)) for k in keys] for f in all_feats], dtype=np.float32)
    X = np.nan_to_num(X, nan=0.0, posinf=1.0, neginf=-1.0)
    y = np.array([1 if i["label"] == "phishing" else 0 for i in incidents])
    scaler = StandardScaler()
    X = scaler.fit_transform(X)
    clf = RandomForestClassifier(n_estimators=100, max_depth=20, random_state=42)
    clf.fit(X, y)
    path = models_dir / "whatsapp_structural.pkl"
    with open(path, "wb") as f:
        pickle.dump({"clf": clf, "scaler": scaler, "feature_order": keys}, f)
    print(f"  Structural stream saved to {path}")
    return True


def train_email_ml(incidents: List[Dict[str, Any]], models_dir: Path) -> bool:
    """Train engineered-feature ML (scaler + RF) for Email. Saves email_ml.pkl."""
    extractor = MultiSignalFeatureExtractor()
    all_feats = []
    for i in incidents:
        f = extractor.extract(
            text=i.get("text", ""),
            message_type="email",
            metadata=i.get("metadata", {}),
            urls=i.get("urls", []),
            html_content=i.get("html_content"),
        )
        all_feats.append(f)
    keys = sorted(all_feats[0].keys()) if all_feats else []
    if not keys:
        print("  WARNING: No features. Skipping email ML stream.")
        return False
    X = np.array([[to_float(f.get(k, 0.0)) for k in keys] for f in all_feats], dtype=np.float32)
    X = np.nan_to_num(X, nan=0.0, posinf=1.0, neginf=-1.0)
    y = np.array([1 if i["label"] == "phishing" else 0 for i in incidents])
    scaler = StandardScaler()
    X = scaler.fit_transform(X)
    clf = RandomForestClassifier(n_estimators=100, max_depth=20, random_state=42)
    clf.fit(X, y)
    path = models_dir / "email_ml.pkl"
    with open(path, "wb") as f:
        pickle.dump({"clf": clf, "scaler": scaler, "feature_order": keys}, f)
    print(f"  Email ML stream saved to {path}")
    return True


def train_model(incidents: List[Dict[str, Any]], model_name: str, models_dir: Path, 
                epochs: int = 50, batch_size: int = 32, learning_rate: float = 0.001) -> Dict[str, Any]:
    if len(incidents) == 0:
        print(f"\nWARNING: No {model_name} incidents to train on. Skipping...")
        return None
    phishing_count = sum(1 for i in incidents if i['label'] == 'phishing')
    legitimate_count = sum(1 for i in incidents if i['label'] == 'legitimate')
    
    print(f"\n{model_name.upper()} Dataset Statistics:")
    print(f"  - Total incidents: {len(incidents)}")
    print(f"  - Phishing: {phishing_count} ({phishing_count/len(incidents)*100:.1f}%)")
    print(f"  - Legitimate: {legitimate_count} ({legitimate_count/len(incidents)*100:.1f}%)")
    
    if phishing_count == 0 or legitimate_count == 0:
        print(f"\nWARNING: {model_name} dataset is imbalanced! Consider adding more data.")
        if phishing_count == 0:
            print("  - No phishing samples found!")
        if legitimate_count == 0:
            print("  - No legitimate samples found!")
        print(f"  Skipping {model_name} model training...")
        return None
    print(f"\nInitializing {model_name} pipeline...")
    pipeline = PhishingDetectionPipeline()
    model_save_path = str(models_dir / f'{model_name}_phishing_detector.pth')
    
    print(f"\nTraining {model_name} model...")
    print(f"  - Epochs: {epochs}")
    print(f"  - Batch size: {batch_size}")
    print(f"  - Learning rate: {learning_rate}")
    print(f"  - Model save path: {model_save_path}")
    print("  This may take a while depending on dataset size...")
    print("-" * 60)
    
    try:
        results = pipeline.train(
            train_incidents=incidents,
            val_incidents=None,
            val_split=0.2,
            batch_size=batch_size,
            epochs=epochs,
            learning_rate=learning_rate,
            use_adaptive_optimizer=True,
            model_save_path=model_save_path
        )
        
        print("-" * 60)
        vm = results.get('final_val_metrics') or {}
        print(f"\n{model_name.upper()} Deep Stream Results:")
        print(f"  - Validation Accuracy: {vm.get('accuracy', 0):.4f}")
        print(f"  - Validation F1 Score: {results.get('best_val_f1', 0):.4f}")
        print(f"  - Validation Precision: {vm.get('precision', 0):.4f}")
        print(f"  - Validation Recall: {vm.get('recall', 0):.4f}")
        print(f"\n  Model saved to: {model_save_path}")
        print(f"  Scaler saved to: {model_save_path.replace('.pth', '_scaler.pkl')}")
        
        return results
        
    except Exception as e:
        print(f"\nERROR during {model_name} model training: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """Main training function - trains separate models for email and WhatsApp"""
    print("=" * 70)
    print("Phishing Detection ML Pipeline - Separate Model Training")
    print("=" * 70)
    base_dir = Path(__file__).parent
    data_dir = base_dir / 'data'
    email_data_dir = data_dir / 'email'
    whatsapp_data_dir = data_dir / 'whatsapp'
    models_dir = base_dir / 'model_artifacts'
    models_dir.mkdir(parents=True, exist_ok=True)
    epochs = 1
    batch_size = 32
    learning_rate = 0.001
    print("\n[Step 0/4] Preprocessing datasets...")
    preprocess_datasets(
        data_dir=data_dir,
        email_dir=email_data_dir,
        whatsapp_dir=whatsapp_data_dir,
        email_cleaned_dir=data_dir / 'email_cleaned',
        whatsapp_cleaned_dir=data_dir / 'whatsapp_cleaned',
    )
    print("\n[Step 1/4] Loading datasets...")
    email_incidents = load_email_dataset(str(email_data_dir), use_cleaned=True)
    whatsapp_incidents = load_whatsapp_dataset(str(whatsapp_data_dir), use_cleaned=True)
    
    print(f"\nDataset Summary:")
    print(f"  - Email incidents: {len(email_incidents)}")
    print(f"  - WhatsApp incidents: {len(whatsapp_incidents)}")
    
    if len(email_incidents) == 0 and len(whatsapp_incidents) == 0:
        print("\nERROR: No incidents loaded! Please check your data files.")
        return
    print("\n[Step 2/4] Saving processed datasets...")
    data_dir.mkdir(parents=True, exist_ok=True)
    
    if email_incidents:
        email_data_path = data_dir / 'train_email.json'
        with open(email_data_path, 'w', encoding='utf-8') as f:
            json.dump(email_incidents, f, indent=2, ensure_ascii=False)
        print(f"  Email dataset saved to: {email_data_path}")
    
    if whatsapp_incidents:
        whatsapp_data_path = data_dir / 'train_whatsapp.json'
        with open(whatsapp_data_path, 'w', encoding='utf-8') as f:
            json.dump(whatsapp_incidents, f, indent=2, ensure_ascii=False)
        print(f"  WhatsApp dataset saved to: {whatsapp_data_path}")
    print("\n[Step 3/4] Training models...")
    print("=" * 70)
    
    email_results = None
    whatsapp_results = None
    if email_incidents:
        print("\n" + "=" * 70)
        print("TRAINING EMAIL MODULE (Heuristic + ML + Deep)")
        print("=" * 70)
        print("  Heuristic engine: rule-based (no training)")
        train_email_ml(email_incidents, models_dir)
        print("  Deep stream (CNN-LSTM):")
        email_results = train_model(
            incidents=email_incidents,
            model_name='email',
            models_dir=models_dir,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate
        )
    if whatsapp_incidents:
        print("\n" + "=" * 70)
        print("TRAINING WHATSAPP MODULE (Lexical + Structural + Deep)")
        print("=" * 70)
        print("  Lexical stream (TF-IDF + RF):")
        train_whatsapp_lexical(whatsapp_incidents, models_dir)
        print("  Structural stream (scaler + RF):")
        train_whatsapp_structural(whatsapp_incidents, models_dir)
        print("  Deep stream (CNN-LSTM):")
        whatsapp_results = train_model(
            incidents=whatsapp_incidents,
            model_name='whatsapp',
            models_dir=models_dir,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate
        )
    print("\n" + "=" * 70)
    print("TRAINING SUMMARY")
    print("=" * 70)
    
    if email_incidents:
        print(f"\n✓ Email Module: ML + Deep trained")
        if email_results:
            print(f"  - Deep F1: {email_results.get('best_val_f1', 0):.4f}")
        print(f"  - Artifacts: email_ml.pkl, email_phishing_detector.pth, *_scaler.pkl")
    else:
        print(f"\n✗ Email Module: SKIPPED (no data)")
    
    if whatsapp_incidents:
        print(f"\n✓ WhatsApp Module: Lexical + Structural + Deep trained")
        if whatsapp_results:
            print(f"  - Deep F1: {whatsapp_results.get('best_val_f1', 0):.4f}")
        print(f"  - Artifacts: whatsapp_lexical.pkl, whatsapp_structural.pkl, whatsapp_phishing_detector.pth, *_scaler.pkl")
    else:
        print(f"\n✗ WhatsApp Module: SKIPPED (no data)")
    
    print("\n" + "=" * 70)
    print("Training pipeline completed!")
    print("=" * 70)


if __name__ == '__main__':
    main()
