"""
Comprehensive evaluation metrics for fusion model.
Includes precision, recall, F1, calibration metrics (ECE), and robustness tests.
"""

import torch
import numpy as np
from sklearn.metrics import (
    precision_score, recall_score, f1_score, 
    confusion_matrix, classification_report,
    roc_auc_score, average_precision_score
)
from typing import Dict, List, Tuple, Optional
import torch.nn.functional as F


def calculate_ece(y_true: np.ndarray, y_pred_probs: np.ndarray, n_bins: int = 10) -> float:
    """
    Calculate Expected Calibration Error (ECE).
    
    Args:
        y_true: True labels (0 or 1)
        y_pred_probs: Predicted probabilities for positive class
        n_bins: Number of bins for calibration
        
    Returns:
        ECE score (lower is better, 0 is perfect calibration)
    """
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    bin_lowers = bin_boundaries[:-1]
    bin_uppers = bin_boundaries[1:]
    
    ece = 0
    for bin_lower, bin_upper in zip(bin_lowers, bin_uppers):
        # Find predictions in this bin
        in_bin = (y_pred_probs > bin_lower) & (y_pred_probs <= bin_upper)
        prop_in_bin = in_bin.mean()
        
        if prop_in_bin > 0:
            # Accuracy in this bin
            accuracy_in_bin = y_true[in_bin].mean()
            # Average confidence in this bin
            avg_confidence_in_bin = y_pred_probs[in_bin].mean()
            # Add to ECE
            ece += np.abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin
    
    return ece


def calculate_all_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_pred_probs: Optional[np.ndarray] = None,
    verbose: bool = True
) -> Dict[str, float]:
    """
    Calculate comprehensive evaluation metrics.
    
    Args:
        y_true: True labels
        y_pred: Predicted labels
        y_pred_probs: Predicted probabilities (for calibration metrics)
        verbose: Whether to print metrics
        
    Returns:
        Dictionary of metrics
    """
    metrics = {}
    
    # Basic classification metrics
    metrics['accuracy'] = (y_true == y_pred).mean()
    metrics['precision'] = precision_score(y_true, y_pred, zero_division=0)
    metrics['recall'] = recall_score(y_true, y_pred, zero_division=0)
    metrics['f1'] = f1_score(y_true, y_pred, zero_division=0)
    
    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
        metrics['true_negatives'] = int(tn)
        metrics['false_positives'] = int(fp)
        metrics['false_negatives'] = int(fn)
        metrics['true_positives'] = int(tp)
        metrics['specificity'] = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    
    # ROC-AUC and PR-AUC (if probabilities provided)
    if y_pred_probs is not None:
        try:
            metrics['roc_auc'] = roc_auc_score(y_true, y_pred_probs)
            metrics['pr_auc'] = average_precision_score(y_true, y_pred_probs)
            metrics['ece'] = calculate_ece(y_true, y_pred_probs)
        except Exception as e:
            if verbose:
                print(f"Warning: Could not calculate AUC/ECE: {e}")
    
    if verbose:
        print("\n" + "=" * 70)
        print("COMPREHENSIVE EVALUATION METRICS")
        print("=" * 70)
        print(f"Accuracy:  {metrics['accuracy']:.4f}")
        print(f"Precision: {metrics['precision']:.4f}")
        print(f"Recall:    {metrics['recall']:.4f}")
        print(f"F1 Score: {metrics['f1']:.4f}")
        if 'specificity' in metrics:
            print(f"Specificity: {metrics['specificity']:.4f}")
        if 'roc_auc' in metrics:
            print(f"ROC-AUC:  {metrics['roc_auc']:.4f}")
            print(f"PR-AUC:   {metrics['pr_auc']:.4f}")
            print(f"ECE:      {metrics['ece']:.4f} (lower is better)")
        print("\nConfusion Matrix:")
        print(cm)
        print("=" * 70)
    
    return metrics


def evaluate_model_robustness(
    model: torch.nn.Module,
    test_loader: torch.utils.data.DataLoader,
    device: torch.device,
    noise_levels: List[float] = [0.01, 0.05, 0.1],
    num_samples: int = 100
) -> Dict[str, Dict[str, float]]:
    """
    Evaluate model robustness to input noise.
    
    Args:
        model: Model to evaluate
        test_loader: Test data loader
        device: Device to run on
        noise_levels: List of noise levels to test
        num_samples: Number of samples to test
        
    Returns:
        Dictionary of robustness metrics per noise level
    """
    model.eval()
    robustness_results = {}
    
    # Get a batch of test data
    test_batch = next(iter(test_loader))
    if len(test_batch) == 3:
        features, labels, _ = test_batch
    else:
        features, labels = test_batch
    
    features = features[:num_samples].to(device)
    labels = labels[:num_samples].to(device)
    
    # Baseline accuracy (no noise)
    with torch.no_grad():
        outputs = model(features, return_uncertainty=False)
        if isinstance(outputs, dict):
            logits = outputs['logits']
        else:
            logits = outputs
        baseline_preds = torch.argmax(logits, dim=1)
        baseline_acc = (baseline_preds == labels).float().mean().item()
    
    robustness_results['baseline'] = {'accuracy': baseline_acc}
    
    # Test with noise
    for noise_level in noise_levels:
        accuracies = []
        for _ in range(10):  # Multiple runs for stability
            # Add Gaussian noise
            noisy_features = features + torch.randn_like(features) * noise_level
            
            with torch.no_grad():
                outputs = model(noisy_features, return_uncertainty=False)
                if isinstance(outputs, dict):
                    logits = outputs['logits']
                else:
                    logits = outputs
                preds = torch.argmax(logits, dim=1)
                acc = (preds == labels).float().mean().item()
                accuracies.append(acc)
        
        robustness_results[f'noise_{noise_level}'] = {
            'accuracy': np.mean(accuracies),
            'std': np.std(accuracies)
        }
    
    print("\n" + "=" * 70)
    print("ROBUSTNESS EVALUATION")
    print("=" * 70)
    print(f"Baseline accuracy: {baseline_acc:.4f}")
    for noise_level in noise_levels:
        result = robustness_results[f'noise_{noise_level}']
        print(f"Noise level {noise_level}: {result['accuracy']:.4f} ± {result['std']:.4f}")
    print("=" * 70)
    
    return robustness_results
