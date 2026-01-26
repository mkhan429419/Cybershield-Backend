import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, Optional


class CNNFeatureExtractor(nn.Module):

    def __init__(self, input_dim: int, conv_channels: list = [64, 128, 256], kernel_sizes: list = [3, 5, 7]):
        super(CNNFeatureExtractor, self).__init__()
        
        self.conv_layers = nn.ModuleList()
        in_channels = input_dim
        
        for out_channels, kernel_size in zip(conv_channels, kernel_sizes):
            self.conv_layers.append(
                nn.Sequential(
                    nn.Conv1d(in_channels, out_channels, kernel_size, padding=kernel_size//2),
                    nn.BatchNorm1d(out_channels),
                    nn.ReLU()
                )
            )
            in_channels = out_channels
        
        self.output_dim = conv_channels[-1]
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for conv_layer in self.conv_layers:
            x = conv_layer(x)
            if x.size(2) > 1:
                x = F.max_pool1d(x, kernel_size=2, stride=2)
        return x


class LSTMFeatureExtractor(nn.Module):

    def __init__(self, input_dim: int, hidden_dim: int = 128, num_layers: int = 2, bidirectional: bool = True):
        super(LSTMFeatureExtractor, self).__init__()
        
        self.lstm = nn.LSTM(
            input_dim,
            hidden_dim,
            num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=0.2 if num_layers > 1 else 0
        )
        
        self.output_dim = hidden_dim * 2 if bidirectional else hidden_dim
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        lstm_out, (hidden, _) = self.lstm(x)
        if self.lstm.bidirectional:
            forward_hidden = hidden[-2]
            backward_hidden = hidden[-1]
            output = torch.cat([forward_hidden, backward_hidden], dim=1)
        else:
            output = hidden[-1]
        return output


class TransformerFeatureExtractor(nn.Module):

    def __init__(self, input_dim: int, d_model: int = 128, nhead: int = 8, num_layers: int = 2):
        super(TransformerFeatureExtractor, self).__init__()
        
        self.input_projection = nn.Linear(input_dim, d_model)
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            dropout=0.1,
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        self.output_dim = d_model
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_projection(x)
        transformer_out = self.transformer(x)
        output = transformer_out.mean(dim=1)
        return output


class HybridPhishingDetector(nn.Module):

    def __init__(self,
                 input_dim: int,
                 sequence_length: int = 1,
                 cnn_channels: list = [64, 128, 256],
                 cnn_kernels: list = [3, 5, 7],
                 lstm_hidden: int = 128,
                 lstm_layers: int = 2,
                 transformer_d_model: int = 128,
                 transformer_nhead: int = 8,
                 transformer_layers: int = 2,
                 dropout: float = 0.3,
                 num_classes: int = 2):
        super(HybridPhishingDetector, self).__init__()
        
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.cnn_extractor = CNNFeatureExtractor(
            input_dim=input_dim,
            conv_channels=cnn_channels,
            kernel_sizes=cnn_kernels
        )
        self.lstm_extractor = LSTMFeatureExtractor(
            input_dim=input_dim,
            hidden_dim=lstm_hidden,
            num_layers=lstm_layers,
            bidirectional=True
        )
        self.transformer_extractor = TransformerFeatureExtractor(
            input_dim=input_dim,
            d_model=transformer_d_model,
            nhead=transformer_nhead,
            num_layers=transformer_layers
        )
        self.cnn_adaptive_pool = nn.AdaptiveAvgPool1d(1)
        cnn_output_dim = cnn_channels[-1]
        
        lstm_output_dim = self.lstm_extractor.output_dim
        transformer_output_dim = self.transformer_extractor.output_dim
        
        combined_dim = cnn_output_dim + lstm_output_dim + transformer_output_dim
        self.classifier = nn.Sequential(
            nn.Linear(combined_dim, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes)
        )
        self._initialize_weights()
    
    def _initialize_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Conv1d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size = x.size(0)
        if x.dim() == 2:
            x = x.unsqueeze(1)
        x_cnn = x.transpose(1, 2)
        x_lstm = x
        x_transformer = x
        cnn_features = self.cnn_extractor(x_cnn)
        cnn_features = self.cnn_adaptive_pool(cnn_features).squeeze(-1)
        lstm_features = self.lstm_extractor(x_lstm)
        transformer_features = self.transformer_extractor(x_transformer)
        combined_features = torch.cat([cnn_features, lstm_features, transformer_features], dim=1)
        output = self.classifier(combined_features)
        return output
    
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            logits = self.forward(x)
            probs = F.softmax(logits, dim=1)
        return probs
    
    def predict(self, x: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            logits = self.forward(x)
            predictions = torch.argmax(logits, dim=1)
        return predictions
