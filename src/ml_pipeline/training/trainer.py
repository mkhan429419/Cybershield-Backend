import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
import numpy as np
from typing import Dict, List, Tuple, Optional, Callable
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import json
from pathlib import Path


class PhishingDataset(Dataset):

    def __init__(self, features: np.ndarray, labels: np.ndarray):
        self.features = torch.FloatTensor(features)
        self.labels = torch.LongTensor(labels)
    
    def __len__(self):
        return len(self.labels)
    
    def __getitem__(self, idx):
        return self.features[idx], self.labels[idx]


class AdaptiveOptimizer:

    def __init__(self, model: nn.Module, initial_optimizer: str = 'adam', lr: float = 0.001):
        self.model = model
        self.optimizer_type = initial_optimizer
        self.lr = lr
        self.optimizer = self._create_optimizer(initial_optimizer, lr)
        self.best_loss = float('inf')
        self.patience = 5
        self.no_improve_count = 0
        self.optimizer_history = []
    
    def _create_optimizer(self, opt_type: str, lr: float):
        if opt_type == 'adam':
            return optim.Adam(self.model.parameters(), lr=lr, betas=(0.9, 0.999))
        elif opt_type == 'adamw':
            return optim.AdamW(self.model.parameters(), lr=lr, weight_decay=0.01)
        elif opt_type == 'rmsprop':
            return optim.RMSprop(self.model.parameters(), lr=lr, alpha=0.99)
        elif opt_type == 'sgd':
            return optim.SGD(self.model.parameters(), lr=lr, momentum=0.9, nesterov=True)
        else:
            return optim.Adam(self.model.parameters(), lr=lr)
    
    def step(self, loss: float):
        if loss < self.best_loss:
            self.best_loss = loss
            self.no_improve_count = 0
        else:
            self.no_improve_count += 1
        if self.no_improve_count >= self.patience:
            self._switch_optimizer()
            self.no_improve_count = 0
    
    def _switch_optimizer(self):
        optimizers = ['adam', 'adamw', 'rmsprop', 'sgd']
        current_idx = optimizers.index(self.optimizer_type) if self.optimizer_type in optimizers else 0
        next_idx = (current_idx + 1) % len(optimizers)
        
        new_optimizer_type = optimizers[next_idx]
        self.optimizer_type = new_optimizer_type
        self.optimizer = self._create_optimizer(new_optimizer_type, self.lr)
        self.optimizer_history.append(new_optimizer_type)
        print(f"Switched to {new_optimizer_type} optimizer")
    
    def zero_grad(self):
        self.optimizer.zero_grad()
    
    def backward(self, loss):
        loss.backward()
    
    def step_optimizer(self):
        self.optimizer.step()


class ModelTrainer:

    def __init__(self,
                 model: nn.Module,
                 device: torch.device,
                 optimizer_type: str = 'adam',
                 learning_rate: float = 0.001,
                 weight_decay: float = 0.0001,
                 use_adaptive: bool = True):
        self.model = model.to(device)
        self.device = device
        
        if use_adaptive:
            self.optimizer_wrapper = AdaptiveOptimizer(model, optimizer_type, learning_rate)
            self.optimizer = self.optimizer_wrapper.optimizer
        else:
            self.optimizer_wrapper = None
            if optimizer_type == 'adam':
                self.optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
            elif optimizer_type == 'adamw':
                self.optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
            else:
                self.optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
        
        self.criterion = nn.CrossEntropyLoss()
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', factor=0.5, patience=3
        )
        
        self.train_losses = []
        self.val_losses = []
        self.train_metrics = []
        self.val_metrics = []
    
    def train_epoch(self, dataloader: DataLoader) -> Tuple[float, Dict]:
        self.model.train()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        for features, labels in dataloader:
            features = features.to(self.device)
            labels = labels.to(self.device)
            outputs = self.model(features)
            loss = self.criterion(outputs, labels)
            if self.optimizer_wrapper:
                self.optimizer_wrapper.zero_grad()
                self.optimizer_wrapper.backward(loss)
                self.optimizer_wrapper.step_optimizer()
                self.optimizer_wrapper.step(loss.item())
            else:
                self.optimizer.zero_grad()
                loss.backward()
                self.optimizer.step()
            
            total_loss += loss.item()
            
            # Predictions
            preds = torch.argmax(outputs, dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())
        
        avg_loss = total_loss / len(dataloader)
        metrics = self._calculate_metrics(all_labels, all_preds)
        
        return avg_loss, metrics
    
    def validate(self, dataloader: DataLoader) -> Tuple[float, Dict]:
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        all_probs = []
        
        with torch.no_grad():
            for features, labels in dataloader:
                features = features.to(self.device)
                labels = labels.to(self.device)
                
                outputs = self.model(features)
                loss = self.criterion(outputs, labels)
                
                total_loss += loss.item()
                
                probs = torch.softmax(outputs, dim=1)
                preds = torch.argmax(outputs, dim=1).cpu().numpy()
                
                all_preds.extend(preds)
                all_labels.extend(labels.cpu().numpy())
                all_probs.extend(probs[:, 1].cpu().numpy())
        avg_loss = total_loss / len(dataloader)
        metrics = self._calculate_metrics(all_labels, all_preds, all_probs)
        
        return avg_loss, metrics
    
    def _calculate_metrics(self, labels: List, preds: List, probs: Optional[List] = None) -> Dict:
        labels = np.array(labels)
        preds = np.array(preds)
        
        metrics = {
            'accuracy': accuracy_score(labels, preds),
            'precision': precision_score(labels, preds, average='weighted', zero_division=0),
            'recall': recall_score(labels, preds, average='weighted', zero_division=0),
            'f1': f1_score(labels, preds, average='weighted', zero_division=0),
        }
        
        if probs is not None:
            try:
                metrics['roc_auc'] = roc_auc_score(labels, probs)
            except:
                metrics['roc_auc'] = 0.0
        cm = confusion_matrix(labels, preds)
        if cm.shape == (2, 2):
            metrics['tn'] = int(cm[0, 0])
            metrics['fp'] = int(cm[0, 1])
            metrics['fn'] = int(cm[1, 0])
            metrics['tp'] = int(cm[1, 1])
        
        return metrics
    
    def train(self,
              train_loader: DataLoader,
              val_loader: DataLoader,
              epochs: int = 50,
              save_path: Optional[str] = None,
              early_stopping_patience: int = 10) -> Dict:
        best_val_loss = float('inf')
        best_val_f1 = 0
        patience_counter = 0
        best_model_state = None
        
        for epoch in range(epochs):
            train_loss, train_metrics = self.train_epoch(train_loader)
            self.train_losses.append(train_loss)
            self.train_metrics.append(train_metrics)
            val_loss, val_metrics = self.validate(val_loader)
            self.val_losses.append(val_loss)
            self.val_metrics.append(val_metrics)
            self.scheduler.step(val_loss)
            print(f"Epoch {epoch+1}/{epochs}")
            print(f"Train Loss: {train_loss:.4f}, Train F1: {train_metrics['f1']:.4f}")
            print(f"Val Loss: {val_loss:.4f}, Val F1: {val_metrics['f1']:.4f}")
            print(f"Val Accuracy: {val_metrics['accuracy']:.4f}, Val Precision: {val_metrics['precision']:.4f}")
            print("-" * 50)
            
            # Early stopping and model saving
            if val_loss < best_val_loss or val_metrics['f1'] > best_val_f1:
                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                if val_metrics['f1'] > best_val_f1:
                    best_val_f1 = val_metrics['f1']
                
                patience_counter = 0
                best_model_state = self.model.state_dict().copy()
            else:
                patience_counter += 1
            
            if patience_counter >= early_stopping_patience:
                print(f"Early stopping at epoch {epoch+1}")
                break
        if best_model_state:
            self.model.load_state_dict(best_model_state)
        if save_path:
            self.save_model(save_path)
            self.save_training_history(save_path)
        
        return {
            'best_val_loss': best_val_loss,
            'best_val_f1': best_val_f1,
            'final_train_metrics': self.train_metrics[-1] if self.train_metrics else {},
            'final_val_metrics': self.val_metrics[-1] if self.val_metrics else {},
        }
    
    def save_model(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'model_config': {
                'input_dim': self.model.input_dim,
                'sequence_length': self.model.sequence_length,
            }
        }, path)
        print(f"Model saved to {path}")
    
    def save_training_history(self, base_path: str):
        history_path = base_path.replace('.pth', '_history.json')
        history = {
            'train_losses': self.train_losses,
            'val_losses': self.val_losses,
            'train_metrics': self.train_metrics,
            'val_metrics': self.val_metrics,
        }
        with open(history_path, 'w') as f:
            json.dump(history, f, indent=2)
        print(f"Training history saved to {history_path}")
