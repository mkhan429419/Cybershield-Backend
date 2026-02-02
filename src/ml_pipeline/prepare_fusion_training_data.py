"""
Helper script to prepare training data for fusion meta-learner.
Combines email, whatsapp, and voice training data into a unified format.
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

def load_json_data(file_path: Path) -> List[Dict[str, Any]]:
    """Load JSON data from file."""
    if not file_path.exists():
        print(f"Warning: {file_path} does not exist")
        return []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def prepare_fusion_training_data(
    email_data_path: str = None,
    whatsapp_data_path: str = None,
    voice_data_path: str = None,
    output_path: str = None
) -> List[Dict[str, Any]]:
    """
    Prepare training data for fusion meta-learner.
    
    Args:
        email_data_path: Path to email training data JSON
        whatsapp_data_path: Path to whatsapp training data JSON
        voice_data_path: Path to voice training data (CSV or JSON)
        output_path: Path to save combined training data
        
    Returns:
        List of combined incidents
    """
    base_dir = Path(__file__).parent
    data_dir = base_dir / 'data'
    
    # Default paths
    if email_data_path is None:
        email_data_path = data_dir / 'train_email.json'
    else:
        email_data_path = Path(email_data_path)
    
    if whatsapp_data_path is None:
        whatsapp_data_path = data_dir / 'train_whatsapp.json'
    else:
        whatsapp_data_path = Path(whatsapp_data_path)
    
    if voice_data_path is None:
        # Try to find voice data
        voice_service_path = base_dir.parent / "services" / "mlPhishingService" / "data"
        voice_data_path = voice_service_path / "training_data_english_generated.csv"
    else:
        voice_data_path = Path(voice_data_path)
    
    if output_path is None:
        output_path = data_dir / 'train_fusion.json'
    else:
        output_path = Path(output_path)
    
    print("=" * 70)
    print("Preparing Fusion Training Data")
    print("=" * 70)
    
    # Load email data
    email_incidents = []
    if email_data_path.exists():
        print(f"\nLoading email data from: {email_data_path}")
        email_incidents = load_json_data(email_data_path)
        print(f"  Loaded {len(email_incidents)} email incidents")
    else:
        print(f"\nEmail data not found at: {email_data_path}")
    
    # Load WhatsApp data
    whatsapp_incidents = []
    if whatsapp_data_path.exists():
        print(f"\nLoading WhatsApp data from: {whatsapp_data_path}")
        whatsapp_incidents = load_json_data(whatsapp_data_path)
        print(f"  Loaded {len(whatsapp_incidents)} WhatsApp incidents")
    else:
        print(f"\nWhatsApp data not found at: {whatsapp_data_path}")
    
    # Load voice data (if CSV, convert to JSON format)
    voice_incidents = []
    if voice_data_path.exists():
        print(f"\nLoading voice data from: {voice_data_path}")
        if voice_data_path.suffix == '.csv':
            import pandas as pd
            try:
                df = pd.read_csv(voice_data_path)
                print(f"  Loaded {len(df)} voice records from CSV")
                
                # Convert to incident format
                for _, row in df.iterrows():
                    transcript = str(row.get('transcript', row.get('conversation', '')))
                    if not transcript or transcript == 'nan':
                        continue
                    
                    # Try label first, then enhanced_label
                    label = row.get('label', row.get('enhanced_label', row.get('scenario_type', 0)))
                    
                    # Convert label to binary
                    if isinstance(label, str):
                        label_val = 1 if label.lower() in ['phishing', '1', 'true', 'yes', 'fell_for_it'] else 0
                    else:
                        label_val = int(label) if pd.notna(label) else 0
                    
                    voice_incidents.append({
                        "text": transcript,
                        "transcript": transcript,
                        "label": label_val,
                        "message_type": "voice",
                        "metadata": {},
                        "urls": [],
                        "html_content": None
                    })
                print(f"  Converted {len(voice_incidents)} voice incidents")
            except Exception as e:
                print(f"  Error loading voice CSV: {e}")
        elif voice_data_path.suffix == '.json':
            voice_incidents = load_json_data(voice_data_path)
            print(f"  Loaded {len(voice_incidents)} voice incidents")
    else:
        print(f"\nVoice data not found at: {voice_data_path}")
        print("  Voice model will still work, but won't have voice-specific training data")
    
    # Combine all incidents
    all_incidents = []
    
    # Add email incidents
    for incident in email_incidents:
        # Ensure label is present and convert to numeric
        label = incident.get("label", incident.get("is_phishing", 0))
        
        # Convert string labels to numeric
        if isinstance(label, str):
            label = 1 if label.lower() in ['phishing', '1', 'true', 'yes'] else 0
        elif isinstance(label, bool):
            label = 1 if label else 0
        else:
            label = int(label) if label else 0
        
        incident["label"] = label
        all_incidents.append(incident)
    
    # Add WhatsApp incidents
    for incident in whatsapp_incidents:
        label = incident.get("label", incident.get("is_phishing", 0))
        
        # Convert string labels to numeric
        if isinstance(label, str):
            label = 1 if label.lower() in ['phishing', '1', 'true', 'yes'] else 0
        elif isinstance(label, bool):
            label = 1 if label else 0
        else:
            label = int(label) if label else 0
        
        incident["label"] = label
        all_incidents.append(incident)
    
    # Add voice incidents
    all_incidents.extend(voice_incidents)
    
    print(f"\n" + "=" * 70)
    print(f"Total combined incidents: {len(all_incidents)}")
    print(f"  - Email: {len(email_incidents)}")
    print(f"  - WhatsApp: {len(whatsapp_incidents)}")
    print(f"  - Voice: {len(voice_incidents)}")
    
    # Count labels
    phishing_count = sum(1 for inc in all_incidents if inc.get("label", 0) == 1)
    legitimate_count = len(all_incidents) - phishing_count
    print(f"\nLabel distribution:")
    print(f"  - Phishing: {phishing_count}")
    print(f"  - Legitimate: {legitimate_count}")
    
    # Save combined data
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_incidents, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Combined training data saved to: {output_path}")
    print("=" * 70)
    
    return all_incidents


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Prepare fusion training data")
    parser.add_argument("--email_data", type=str, default=None, help="Path to email training data JSON")
    parser.add_argument("--whatsapp_data", type=str, default=None, help="Path to WhatsApp training data JSON")
    parser.add_argument("--voice_data", type=str, default=None, help="Path to voice training data (CSV or JSON)")
    parser.add_argument("--output", type=str, default=None, help="Output path for combined data")
    
    args = parser.parse_args()
    
    prepare_fusion_training_data(
        email_data_path=args.email_data,
        whatsapp_data_path=args.whatsapp_data,
        voice_data_path=args.voice_data,
        output_path=args.output
    )


if __name__ == "__main__":
    main()
