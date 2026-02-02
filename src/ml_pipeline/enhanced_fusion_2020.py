"""
Enhanced Advanced Fusion Meta-Learner with Post-2020 & Post-2023 Techniques
Incorporates:
Post-2020:
1. Learnable Gating (Switch Transformers 2021)
2. Uncertainty-Aware Deep Ensembles (Ashukha et al. 2020)
3. Focal Loss Calibration (Mukhoti et al. 2020)
4. Interactive Attention Fusion (Rahman et al. 2021)
5. GNN for Model Relationships (Kaur et al. 2020)
6. Knowledge Distillation Support (Yang et al. 2020)

Post-2023 (2026 Publication):
7. Interleaved Local-Global Attention (Gemma 2, 2024)
8. Group-Query Attention (Gemma 2, 2024)
9. Multi-Teacher Progressive Distillation (DistilQwen2.5, 2025)
10. Self-Distillation at Fusion Layers (Feature Interaction Fusion, 2024)
11. Domain-Adversarial Training (PRADA, 2025)
12. Ensemble Distillation for Heterogeneous Models (FedDF, 2020)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Optional, Tuple, Dict
import numpy as np
import math


class FocalLoss(nn.Module):
    """
    Focal Loss for Calibration (Mukhoti et al. 2020)
    Addresses class imbalance and improves calibration.
    """
    def __init__(self, alpha: float = 0.25, gamma: float = 2.0, reduction: str = 'mean'):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction
    
    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce_loss = F.cross_entropy(inputs, targets, reduction='none')
        pt = torch.exp(-ce_loss)
        focal_loss = self.alpha * (1 - pt) ** self.gamma * ce_loss
        
        if self.reduction == 'mean':
            return focal_loss.mean()
        elif self.reduction == 'sum':
            return focal_loss.sum()
        else:
            return focal_loss


class LearnableGating(nn.Module):
    """
    Learnable Gating Mechanism (Switch Transformers 2021)
    Dynamically weights model contributions based on input.
    """
    def __init__(self, embed_dim: int, num_models: int = 3, num_experts: int = 4):
        super(LearnableGating, self).__init__()
        self.num_models = num_models
        self.num_experts = num_experts
        self.embed_dim = embed_dim
        
        # Gating network: learns which models to trust
        self.gate = nn.Sequential(
            nn.Linear(embed_dim * num_models, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, num_models * num_experts),
            nn.Softmax(dim=-1)
        )
        
        # Expert networks: specialized transformations
        self.experts = nn.ModuleList([
            nn.Sequential(
                nn.Linear(embed_dim, embed_dim * 4),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(embed_dim * 4, embed_dim),
                nn.Dropout(0.1)
            ) for _ in range(num_experts)
        ])
    
    def forward(self, model_embeddings: torch.Tensor) -> torch.Tensor:
        """
        Args:
            model_embeddings: (batch, num_models, embed_dim)
        Returns:
            gated_embeddings: (batch, num_models, embed_dim)
        """
        batch_size = model_embeddings.size(0)
        
        # Flatten for gating network
        flattened = model_embeddings.view(batch_size, -1)  # (batch, num_models * embed_dim)
        
        # Get gating weights
        gate_weights = self.gate(flattened)  # (batch, num_models * num_experts)
        gate_weights = gate_weights.view(batch_size, self.num_models, self.num_experts)
        
        # Apply experts and combine
        gated_outputs = []
        for model_idx in range(self.num_models):
            model_emb = model_embeddings[:, model_idx]  # (batch, embed_dim)
            expert_outputs = []
            
            for expert_idx, expert in enumerate(self.experts):
                expert_out = expert(model_emb)  # (batch, embed_dim)
                weight = gate_weights[:, model_idx, expert_idx].unsqueeze(-1)  # (batch, 1)
                expert_outputs.append(expert_out * weight)
            
            # Combine expert outputs
            combined = sum(expert_outputs)  # (batch, embed_dim)
            gated_outputs.append(combined)
        
        return torch.stack(gated_outputs, dim=1)  # (batch, num_models, embed_dim)


class InteractiveAttentionFusion(nn.Module):
    """
    Interactive Attention Fusion (Rahman et al. 2021)
    Replaces bilinear fusion with learned cross-modal interactions.
    """
    def __init__(self, embed_dim: int, num_models: int = 3, num_heads: int = 4):
        super(InteractiveAttentionFusion, self).__init__()
        self.embed_dim = embed_dim
        self.num_models = num_models
        self.num_heads = num_heads
        
        # Interactive attention: models interact bidirectionally
        self.interactive_attention = nn.MultiheadAttention(
            embed_dim, num_heads, dropout=0.1, batch_first=True
        )
        
        # Cross-modal interaction layers
        self.interaction_layers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(embed_dim * 2, embed_dim),
                nn.LayerNorm(embed_dim),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(embed_dim, embed_dim)
            ) for _ in range(num_models * (num_models - 1) // 2)  # All pairs
        ])
        
        # Aggregation - input is embed_dim (from interactions) + embed_dim * num_models (from attention)
        # But we only use embed_dim from interactions, so output is embed_dim
        self.aggregate = nn.Sequential(
            nn.Linear(embed_dim * num_models + embed_dim, embed_dim),  # Fixed: input is interactions + attention
            nn.LayerNorm(embed_dim),
            nn.GELU()
        )
    
    def forward(self, model_embeddings: torch.Tensor) -> torch.Tensor:
        """
        Args:
            model_embeddings: (batch, num_models, embed_dim)
        Returns:
            fused_features: (batch, embed_dim)
        """
        batch_size = model_embeddings.size(0)
        
        # Interactive attention
        attn_out, _ = self.interactive_attention(
            model_embeddings, model_embeddings, model_embeddings
        )
        
        # Pairwise interactions
        interaction_idx = 0
        interaction_features = []
        
        for i in range(self.num_models):
            for j in range(i + 1, self.num_models):
                pair = torch.cat([attn_out[:, i], attn_out[:, j]], dim=1)  # (batch, embed_dim * 2)
                interacted = self.interaction_layers[interaction_idx](pair)  # (batch, embed_dim)
                interaction_features.append(interacted)
                interaction_idx += 1
        
        # Combine all interactions
        if interaction_features:
            all_interactions = torch.stack(interaction_features, dim=1)  # (batch, num_pairs, embed_dim)
            # Mean pooling over interactions
            interaction_pooled = all_interactions.mean(dim=1)  # (batch, embed_dim)
        else:
            interaction_pooled = attn_out.mean(dim=1)
        
        # Combine with original embeddings
        combined = torch.cat([attn_out.reshape(batch_size, -1), interaction_pooled], dim=1)
        fused = self.aggregate(combined)
        
        return fused


class ModelRelationshipGNN(nn.Module):
    """
    Graph Neural Network for Model Relationships (Kaur et al. 2020)
    Models relationships between different base models as a graph.
    """
    def __init__(self, embed_dim: int, num_models: int = 3, num_layers: int = 2):
        super(ModelRelationshipGNN, self).__init__()
        self.embed_dim = embed_dim
        self.num_models = num_models
        self.num_layers = num_layers
        
        # Learnable adjacency matrix (model relationships)
        self.adjacency = nn.Parameter(torch.ones(num_models, num_models) / num_models)
        
        # Graph convolution layers
        self.gcn_layers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(embed_dim, embed_dim),
                nn.LayerNorm(embed_dim),
                nn.GELU(),
                nn.Dropout(0.1)
            ) for _ in range(num_layers)
        ])
        
        # Edge features (relationship strength)
        self.edge_mlp = nn.Sequential(
            nn.Linear(embed_dim * 2, embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, 1),
            nn.Sigmoid()
        )
    
    def forward(self, model_embeddings: torch.Tensor) -> torch.Tensor:
        """
        Args:
            model_embeddings: (batch, num_models, embed_dim)
        Returns:
            graph_enhanced: (batch, num_models, embed_dim)
        """
        batch_size = model_embeddings.size(0)
        
        # Normalize adjacency matrix
        adj = F.softmax(self.adjacency, dim=-1)
        
        # Compute edge features
        edge_features = []
        for i in range(self.num_models):
            for j in range(self.num_models):
                if i != j:
                    pair = torch.cat([
                        model_embeddings[:, i],
                        model_embeddings[:, j]
                    ], dim=1)  # (batch, embed_dim * 2)
                    edge_weight = self.edge_mlp(pair)  # (batch, 1)
                    edge_features.append(edge_weight.squeeze(-1))
        
        # Graph convolution
        x = model_embeddings
        for gcn_layer in self.gcn_layers:
            # Message passing: aggregate from neighbors
            messages = []
            for i in range(self.num_models):
                neighbor_features = []
                for j in range(self.num_models):
                    if i != j:
                        weight = adj[i, j]
                        neighbor_features.append(x[:, j] * weight)
                if neighbor_features:
                    aggregated = sum(neighbor_features)
                    messages.append(aggregated)
                else:
                    messages.append(x[:, i])
            
            messages = torch.stack(messages, dim=1)  # (batch, num_models, embed_dim)
            
            # Update node features
            x = x + gcn_layer(messages)
        
        return x


class UncertaintyEstimator(nn.Module):
    """
    Uncertainty-Aware Deep Ensembles (Ashukha et al. 2020)
    Estimates both aleatoric and epistemic uncertainty.
    """
    def __init__(self, embed_dim: int, num_classes: int = 2):
        super(UncertaintyEstimator, self).__init__()
        self.num_classes = num_classes
        
        # Aleatoric uncertainty (data uncertainty)
        self.aleatoric_head = nn.Sequential(
            nn.Linear(embed_dim, embed_dim // 2),
            nn.GELU(),
            nn.Linear(embed_dim // 2, num_classes)
        )
        
        # Epistemic uncertainty (model uncertainty)
        self.epistemic_head = nn.Sequential(
            nn.Linear(embed_dim, embed_dim // 2),
            nn.GELU(),
            nn.Linear(embed_dim // 2, 1),
            nn.Sigmoid()
        )
    
    def forward(self, features: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns:
            logits: (batch, num_classes)
            aleatoric_uncertainty: (batch, num_classes)
            epistemic_uncertainty: (batch, 1)
        """
        logits = self.aleatoric_head(features)
        
        # Aleatoric: variance of predictions
        probs = F.softmax(logits, dim=-1)
        aleatoric = probs * (1 - probs)  # Entropy-based uncertainty
        
        # Epistemic: model confidence
        epistemic = self.epistemic_head(features)
        
        return logits, aleatoric, epistemic


# ============================================================================
# POST-2023 TECHNIQUES (2026 Publication)
# ============================================================================

class GroupQueryAttention(nn.Module):
    """
    Group-Query Attention (Gemma 2, 2024)
    Efficient attention mechanism that groups queries for better efficiency.
    """
    def __init__(self, embed_dim: int, num_heads: int = 12, num_groups: int = 4, dropout: float = 0.1):
        super(GroupQueryAttention, self).__init__()
        assert embed_dim % num_heads == 0, "embed_dim must be divisible by num_heads"
        assert num_heads % num_groups == 0, "num_heads must be divisible by num_groups"
        
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.num_groups = num_groups
        self.head_dim = embed_dim // num_heads
        self.group_size = num_heads // num_groups
        self.kv_heads = num_groups  # Number of key-value heads (fewer than query heads)
        self.kv_dim = self.kv_heads * self.head_dim  # Total KV dimension
        
        # Q, K, V projections
        self.q_proj = nn.Linear(embed_dim, embed_dim)
        self.k_proj = nn.Linear(embed_dim, self.kv_dim)  # Fewer KV heads
        self.v_proj = nn.Linear(embed_dim, self.kv_dim)  # Fewer KV heads
        self.out_proj = nn.Linear(embed_dim, embed_dim)
        
        self.dropout = nn.Dropout(dropout)
        self.scale = self.head_dim ** -0.5
    
    def forward(self, query: torch.Tensor, key: torch.Tensor, value: torch.Tensor, 
                key_padding_mask: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            query: (batch, seq_len, embed_dim)
            key: (batch, seq_len, embed_dim)
            value: (batch, seq_len, embed_dim)
        Returns:
            output: (batch, seq_len, embed_dim)
            attn_weights: (batch, num_heads, seq_len, seq_len)
        """
        batch_size, seq_len, _ = query.shape
        
        # Project queries to all heads
        Q = self.q_proj(query).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        
        # Project keys and values to fewer heads (grouped)
        K = self.k_proj(key).view(batch_size, seq_len, self.kv_heads, self.head_dim).transpose(1, 2)
        V = self.v_proj(value).view(batch_size, seq_len, self.kv_heads, self.head_dim).transpose(1, 2)
        
        # Expand K, V for grouped queries (repeat each KV head for multiple query heads)
        K = K.repeat_interleave(self.group_size, dim=1)  # (batch, num_heads, seq_len, head_dim)
        V = V.repeat_interleave(self.group_size, dim=1)  # (batch, num_heads, seq_len, head_dim)
        
        # Scaled dot-product attention
        scores = torch.matmul(Q, K.transpose(-2, -1)) * self.scale
        
        if key_padding_mask is not None:
            scores = scores.masked_fill(key_padding_mask.unsqueeze(1).unsqueeze(2), float('-inf'))
        
        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)
        
        output = torch.matmul(attn_weights, V)
        output = output.transpose(1, 2).contiguous().view(batch_size, seq_len, self.embed_dim)
        output = self.out_proj(output)
        
        return output, attn_weights


class InterleavedLocalGlobalAttention(nn.Module):
    """
    Interleaved Local-Global Attention (Gemma 2, 2024)
    
    NOTE: Gemma 2 uses local attention over token windows in sequences.
    With only 3 models (3 tokens), true local-global interleaving is limited.
    This implementation uses:
    - Local: Self-attention within each model embedding (identity for single embeddings)
    - Global: Cross-attention across all models
    
    For true Gemma 2-style interleaving, we would need tokenized sequences from each model.
    """
    def __init__(self, embed_dim: int, num_heads: int = 12, num_groups: int = 4, 
                 local_window_size: int = 1, dropout: float = 0.1):
        super(InterleavedLocalGlobalAttention, self).__init__()
        self.embed_dim = embed_dim
        self.local_window_size = local_window_size
        
        # FIXED: Use Group-Query Attention for both local and global
        # Local attention: operates on model embeddings (with 3 models, this is effectively self-attention)
        self.local_attention = GroupQueryAttention(embed_dim, num_heads, num_groups, dropout)
        
        # Global attention: cross-model attention
        self.global_attention = GroupQueryAttention(embed_dim, num_heads, num_groups, dropout)
        
        self.norm1 = nn.LayerNorm(embed_dim)
        self.norm2 = nn.LayerNorm(embed_dim)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, num_models, embed_dim) - 3 model embeddings
        Returns:
            output: (batch, num_models, embed_dim)
        """
        # FIXED: Proper interleaving pattern
        # Step 1: Local attention (self-attention within sequence of models)
        # With 3 models, this allows each model to attend to itself and neighbors
        residual = x
        x_norm = self.norm1(x)
        local_out, _ = self.local_attention(x_norm, x_norm, x_norm)
        x = residual + self.dropout(local_out)
        
        # Step 2: Global attention (cross-model attention)
        # Each model attends to all other models
        residual = x
        x_norm = self.norm2(x)
        global_out, _ = self.global_attention(x_norm, x_norm, x_norm)
        x = residual + self.dropout(global_out)
        
        return x


class GradientReversalFunction(torch.autograd.Function):
    """
    Gradient Reversal Function for Domain-Adversarial Training (PRADA, 2025)
    Reverses gradients during backpropagation to learn domain-invariant features.
    """
    @staticmethod
    def forward(ctx, x: torch.Tensor, alpha: float) -> torch.Tensor:
        ctx.alpha = alpha
        return x.view_as(x)
    
    @staticmethod
    def backward(ctx, grad_output: torch.Tensor) -> Tuple[torch.Tensor, None]:
        return -ctx.alpha * grad_output, None


class GradientReversalLayer(nn.Module):
    """
    Gradient Reversal Layer wrapper for Domain-Adversarial Training (PRADA, 2025)
    """
    def __init__(self, alpha: float = 1.0):
        super(GradientReversalLayer, self).__init__()
        self.alpha = alpha
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return GradientReversalFunction.apply(x, self.alpha)


class DomainDiscriminator(nn.Module):
    """
    Domain Discriminator (PRADA, 2025)
    Learns domain-invariant features for cross-domain generalization.
    """
    def __init__(self, embed_dim: int, num_domains: int = 3, hidden_dim: int = 128, alpha: float = 1.0):
        super(DomainDiscriminator, self).__init__()
        self.num_domains = num_domains  # email, whatsapp, voice
        self.gradient_reversal = GradientReversalLayer(alpha)
        
        self.discriminator = nn.Sequential(
            nn.Linear(embed_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, num_domains)
        )
    
    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            features: (batch, embed_dim)
        Returns:
            domain_logits: (batch, num_domains)
        """
        # Apply gradient reversal
        reversed_features = self.gradient_reversal(features)
        return self.discriminator(reversed_features)


class SelfDistillationLoss(nn.Module):
    """
    Self-Distillation Loss (Feature Interaction Fusion, 2024)
    Distills knowledge from previous epoch's model at each layer.
    """
    def __init__(self, temperature: float = 4.0, alpha: float = 0.5):
        super(SelfDistillationLoss, self).__init__()
        self.temperature = temperature
        self.alpha = alpha
        self.kl_div = nn.KLDivLoss(reduction='batchmean')
    
    def forward(self, student_logits: torch.Tensor, teacher_logits: torch.Tensor, 
                hard_labels: torch.Tensor, hard_loss: torch.Tensor) -> torch.Tensor:
        """
        Args:
            student_logits: Current model predictions (batch, num_classes)
            teacher_logits: Previous epoch predictions (batch, num_classes)
            hard_labels: Ground truth labels (batch,)
            hard_loss: Hard loss (CE or Focal)
        Returns:
            Combined loss
        """
        # Soft targets from teacher
        teacher_probs = F.softmax(teacher_logits / self.temperature, dim=-1)
        student_log_probs = F.log_softmax(student_logits / self.temperature, dim=-1)
        
        # Distillation loss
        distill_loss = self.kl_div(student_log_probs, teacher_probs) * (self.temperature ** 2)
        
        # Combine with hard loss
        total_loss = self.alpha * hard_loss + (1 - self.alpha) * distill_loss
        
        return total_loss


class MultiTeacherDistillation(nn.Module):
    """
    Multi-Teacher Progressive Distillation (DistilQwen2.5, 2025)
    Progressively integrates knowledge from multiple teacher models.
    """
    def __init__(self, num_teachers: int = 3, temperature: float = 4.0):
        super(MultiTeacherDistillation, self).__init__()
        self.num_teachers = num_teachers
        self.temperature = temperature
        self.kl_div = nn.KLDivLoss(reduction='batchmean')
    
    def forward(self, student_logits: torch.Tensor, teacher_logits_list: List[torch.Tensor],
                teacher_weights: Optional[torch.Tensor] = None) -> torch.Tensor:
        """
        Args:
            student_logits: (batch, num_classes)
            teacher_logits_list: List of (batch, num_classes) from each teacher
            teacher_weights: Optional (num_teachers,) weights for each teacher
        Returns:
            Distillation loss
        """
        if teacher_weights is None:
            teacher_weights = torch.ones(self.num_teachers, device=student_logits.device) / self.num_teachers
        
        student_log_probs = F.log_softmax(student_logits / self.temperature, dim=-1)
        
        # Aggregate teacher predictions
        teacher_probs_list = [F.softmax(t_logits / self.temperature, dim=-1) for t_logits in teacher_logits_list]
        
        # Weighted average of teacher probabilities
        aggregated_teacher_probs = sum(w * probs for w, probs in zip(teacher_weights, teacher_probs_list))
        
        # Distillation loss
        distill_loss = self.kl_div(student_log_probs, aggregated_teacher_probs) * (self.temperature ** 2)
        
        return distill_loss


class EnhancedAdvancedFusionMetaLearner(nn.Module):
    """
    Enhanced Advanced Fusion Meta-Learner with Post-2020 & Post-2023 Techniques
    
    Incorporates:
    Post-2020:
    1. Learnable Gating (Switch Transformers 2021)
    2. Uncertainty-Aware Deep Ensembles (Ashukha et al. 2020)
    3. Focal Loss Calibration (Mukhoti et al. 2020)
    4. Interactive Attention Fusion (Rahman et al. 2021)
    5. GNN for Model Relationships (Kaur et al. 2020)
    
    Post-2023 (2026 Publication):
    6. Interleaved Local-Global Attention (Gemma 2, 2024)
    7. Group-Query Attention (Gemma 2, 2024)
    8. Domain-Adversarial Training (PRADA, 2025)
    9. Self-Distillation at Layers (Feature Interaction Fusion, 2024)
    10. Multi-Teacher Distillation (DistilQwen2.5, 2025)
    """
    
    def __init__(
        self,
        input_dim: int = 24,
        base_feature_dim: int = 8,
        embed_dim: int = 192,
        num_heads: int = 12,
        num_cross_attn_layers: int = 4,
        hidden_dims: List[int] = [384, 192, 96, 48],
        dropout: float = 0.3,
        use_gating: bool = True,
        use_gnn: bool = True,
        use_uncertainty: bool = True,
        use_interactive_fusion: bool = True,
        # Post-2023 flags
        use_interleaved_attention: bool = True,
        use_domain_adversarial: bool = True,
        use_self_distillation: bool = True,
        num_groups: int = 4  # For group-query attention
    ):
        super(EnhancedAdvancedFusionMetaLearner, self).__init__()
        
        self.embed_dim = embed_dim
        self.num_models = 3
        self.base_feature_dim = base_feature_dim
        self.use_uncertainty = use_uncertainty
        self.use_interleaved_attention = use_interleaved_attention
        self.use_domain_adversarial = use_domain_adversarial
        self.use_self_distillation = use_self_distillation
        
        # Feature enrichment
        self.feature_enricher = nn.Sequential(
            nn.Linear(base_feature_dim, embed_dim),
            nn.BatchNorm1d(embed_dim),
            nn.GELU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(embed_dim, embed_dim),
            nn.BatchNorm1d(embed_dim),
            nn.GELU()
        )
        
        # Model-specific positional encodings
        self.model_positions = nn.Parameter(torch.randn(self.num_models, embed_dim))
        nn.init.xavier_uniform_(self.model_positions)
        
        # POST-2023: Interleaved Local-Global Attention (Gemma 2, 2024)
        if use_interleaved_attention:
            self.interleaved_attention_layers = nn.ModuleList([
                InterleavedLocalGlobalAttention(embed_dim, num_heads, num_groups, dropout=dropout)
                for _ in range(num_cross_attn_layers)
            ])
        else:
            # Fallback to standard attention
            self.cross_attention_layers = nn.ModuleList([
                nn.MultiheadAttention(embed_dim, num_heads, dropout=dropout, batch_first=True)
                for _ in range(num_cross_attn_layers)
            ])
            self.self_attention_layers = nn.ModuleList([
                nn.MultiheadAttention(embed_dim, num_heads, dropout=dropout, batch_first=True)
                for _ in range(num_cross_attn_layers)
            ])
        
        # Layer norms (for interleaved attention, we need fewer norms)
        if use_interleaved_attention:
            self.attention_norms = nn.ModuleList([
                nn.LayerNorm(embed_dim) for _ in range(num_cross_attn_layers)
            ])
            self.ff_norms = nn.ModuleList([
                nn.LayerNorm(embed_dim) for _ in range(num_cross_attn_layers)
            ])
        else:
            self.cross_norms = nn.ModuleList([
                nn.LayerNorm(embed_dim) for _ in range(num_cross_attn_layers * 2)
            ])
            self.self_norms = nn.ModuleList([
                nn.LayerNorm(embed_dim) for _ in range(num_cross_attn_layers * 2)
            ])
        
        # Feed-forward networks
        self.ff_networks = nn.ModuleList([
            nn.Sequential(
                nn.Linear(embed_dim, embed_dim * 4),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(embed_dim * 4, embed_dim),
                nn.Dropout(dropout)
            ) for _ in range(num_cross_attn_layers)
        ])
        
        # Keep old FF for backward compatibility
        if not use_interleaved_attention:
            self.cross_ff = self.ff_networks
            self.self_ff = nn.ModuleList([
                nn.Sequential(
                    nn.Linear(embed_dim, embed_dim * 4),
                    nn.GELU(),
                    nn.Dropout(dropout),
                    nn.Linear(embed_dim * 4, embed_dim),
                    nn.Dropout(dropout)
                ) for _ in range(num_cross_attn_layers)
            ])
        
        # NEW: Learnable Gating (Switch Transformers 2021)
        self.use_gating = use_gating
        if use_gating:
            self.learnable_gating = LearnableGating(embed_dim, self.num_models, num_experts=4)
        
        # NEW: GNN for Model Relationships (Kaur et al. 2020)
        self.use_gnn = use_gnn
        if use_gnn:
            self.model_gnn = ModelRelationshipGNN(embed_dim, self.num_models, num_layers=2)
        
        # NEW: Interactive Attention Fusion (Rahman et al. 2021)
        self.use_interactive_fusion = use_interactive_fusion
        if use_interactive_fusion:
            self.interactive_fusion = InteractiveAttentionFusion(embed_dim, self.num_models, num_heads=4)
            fusion_output_dim = embed_dim
        else:
            # Original pairwise fusion (fallback)
            self.pairwise_fusion = nn.Sequential(
                nn.Linear(embed_dim * 2, embed_dim),
                nn.BatchNorm1d(embed_dim),
                nn.GELU(),
                nn.Dropout(dropout)
            )
            fusion_output_dim = embed_dim
        
        # Global attention
        self.global_attention = nn.MultiheadAttention(
            embed_dim * self.num_models, num_heads=8, dropout=dropout, batch_first=True
        )
        
        # Aggregation
        if use_interactive_fusion:
            # Interactive fusion outputs embed_dim, global attention outputs embed_dim * num_models
            aggregation_input_dim = fusion_output_dim + embed_dim * self.num_models  # interactive + global
        else:
            aggregation_input_dim = embed_dim * self.num_models + embed_dim
        
        self.aggregation = nn.Sequential(
            nn.Linear(aggregation_input_dim, hidden_dims[0]),
            nn.BatchNorm1d(hidden_dims[0]),
            nn.GELU(),
            nn.Dropout(dropout)
        )
        
        # Classification head (FIXED: Split into layers for intermediate access)
        prev_dim = hidden_dims[0]
        self.classifier_layers = nn.ModuleList()
        for hidden_dim in hidden_dims[1:]:
            layer = nn.Sequential(
                nn.Linear(prev_dim, hidden_dim),
                nn.BatchNorm1d(hidden_dim),
                nn.GELU(),
                nn.Dropout(dropout)
            )
            self.classifier_layers.append(layer)
            prev_dim = hidden_dim
        
        # NEW: Uncertainty-Aware Head (Ashukha et al. 2020)
        if use_uncertainty:
            self.uncertainty_estimator = UncertaintyEstimator(prev_dim, num_classes=2)
            # Still need regular classifier for backward compatibility
            output_layer = nn.Linear(prev_dim, 2)
        else:
            output_layer = nn.Linear(prev_dim, 2)
        
        nn.init.xavier_uniform_(output_layer.weight)
        nn.init.zeros_(output_layer.bias)
        self.classifier_output = output_layer
        
        # For backward compatibility, create sequential classifier
        final_layers = list(self.classifier_layers) + [self.classifier_output]
        self.classifier = nn.Sequential(*final_layers)
        
        # POST-2023: Domain Discriminator (PRADA, 2025)
        # Use aggregated_features dimension (hidden_dims[0]) for domain discriminator
        if use_domain_adversarial:
            self.domain_discriminator = DomainDiscriminator(hidden_dims[0], num_domains=3, alpha=1.0)
        
        # POST-2023: Intermediate outputs for self-distillation
        # FIXED: One classifier per hidden layer (not including input aggregation layer)
        if use_self_distillation:
            # One classifier for each hidden layer in classifier (hidden_dims[1:])
            self.intermediate_classifiers = nn.ModuleList([
                nn.Linear(hidden_dims[i+1], 2) for i in range(len(hidden_dims)-1)
            ])
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, return_uncertainty: bool = False, 
                return_intermediate: bool = False, return_domain_logits: bool = False):
        """
        Args:
            x: (batch_size, 24) tensor
            return_uncertainty: Whether to return uncertainty estimates
            return_intermediate: Whether to return intermediate outputs for self-distillation
            return_domain_logits: Whether to return domain discriminator logits
        Returns:
            dict with 'logits', optionally 'aleatoric_uncertainty', 'epistemic_uncertainty',
            'intermediate_logits', 'domain_logits'
        """
        batch_size = x.size(0)
        
        # Reshape and enrich features
        x_reshaped = x.view(batch_size, self.num_models, self.base_feature_dim)
        x_flat = x_reshaped.view(-1, self.base_feature_dim)
        projected = self.feature_enricher(x_flat)
        model_embeddings = projected.view(batch_size, self.num_models, self.embed_dim)
        
        # Add positional encodings
        model_embeddings = model_embeddings + self.model_positions.unsqueeze(0)
        model_embeddings = self.dropout(model_embeddings)
        
        # POST-2023: Interleaved Local-Global Attention (Gemma 2, 2024)
        intermediate_outputs = []
        
        if self.use_interleaved_attention:
            # Use interleaved attention
            for i in range(len(self.interleaved_attention_layers)):
                # Interleaved attention (local + global)
                model_embeddings = self.interleaved_attention_layers[i](model_embeddings)
                
                # Feed-forward
                residual = model_embeddings
                normalized = self.ff_norms[i](model_embeddings)
                ff_out = self.ff_networks[i](normalized)
                model_embeddings = residual + self.dropout(ff_out)
                
                # Store intermediate outputs for self-distillation
                if self.use_self_distillation and return_intermediate:
                    # Aggregate for intermediate classification
                    aggregated = model_embeddings.mean(dim=1)  # (batch, embed_dim)
                    # Project through aggregation layers if needed
                    intermediate_outputs.append(aggregated)
        else:
            # Fallback to original cross-attention + self-attention
            cross_norm_idx = 0
            self_norm_idx = 0
            
            for i in range(len(self.cross_attention_layers)):
                # Cross-attention
                cross_norm1 = self.cross_norms[cross_norm_idx]
                cross_norm2 = self.cross_norms[cross_norm_idx + 1]
                cross_norm_idx += 2
                
                normalized = cross_norm1(model_embeddings)
                cross_attn_out, _ = self.cross_attention_layers[i](
                    normalized, normalized, normalized
                )
                model_embeddings = model_embeddings + self.dropout(cross_attn_out)
                
                normalized = cross_norm2(model_embeddings)
                cross_ff_out = self.cross_ff[i](normalized)
                model_embeddings = model_embeddings + self.dropout(cross_ff_out)
                
                # Self-attention
                self_norm1 = self.self_norms[self_norm_idx]
                self_norm2 = self.self_norms[self_norm_idx + 1]
                self_norm_idx += 2
                
                normalized = self_norm1(model_embeddings)
                self_attn_out, _ = self.self_attention_layers[i](
                    normalized, normalized, normalized
                )
                model_embeddings = model_embeddings + self.dropout(self_attn_out)
                
                normalized = self_norm2(model_embeddings)
                self_ff_out = self.self_ff[i](normalized)
                model_embeddings = model_embeddings + self.dropout(self_ff_out)
        
        # NEW: Learnable Gating (Switch Transformers 2021)
        if self.use_gating:
            model_embeddings = self.learnable_gating(model_embeddings)
        
        # NEW: GNN for Model Relationships (Kaur et al. 2020)
        if self.use_gnn:
            model_embeddings = self.model_gnn(model_embeddings)
        
        # NEW: Interactive Attention Fusion (Rahman et al. 2021)
        if self.use_interactive_fusion:
            interactive_features = self.interactive_fusion(model_embeddings)
        else:
            # Original pairwise fusion
            pairwise_features = []
            for i in range(self.num_models):
                for j in range(i + 1, self.num_models):
                    pair = torch.cat([model_embeddings[:, i], model_embeddings[:, j]], dim=1)
                    fused_pair = self.pairwise_fusion(pair)
                    pairwise_features.append(fused_pair)
            
            if pairwise_features:
                pairwise_combined = torch.stack(pairwise_features, dim=1).mean(dim=1)
            else:
                pairwise_combined = model_embeddings.mean(dim=1)
            interactive_features = pairwise_combined
        
        # Global attention
        aggregated = model_embeddings.reshape(batch_size, -1)  # (batch, num_models * embed_dim)
        aggregated_reshaped = aggregated.unsqueeze(1)  # (batch, 1, num_models * embed_dim)
        global_attn_out, _ = self.global_attention(
            aggregated_reshaped, aggregated_reshaped, aggregated_reshaped
        )
        global_features = global_attn_out.squeeze(1)  # (batch, num_models * embed_dim)
        
        # Combine interactive and global features
        combined = torch.cat([interactive_features, global_features], dim=1)  # (batch, embed_dim + num_models * embed_dim)
        
        # Aggregation through hidden layers (for intermediate classifiers)
        aggregated_features = self.aggregation(combined)
        
        # FIXED: Progressive aggregation through hidden dims for intermediate classifiers
        intermediate_logits = []
        if self.use_self_distillation and return_intermediate:
            # Track features through classifier layers
            current_features = aggregated_features
            for i, layer in enumerate(self.classifier_layers):
                # Apply layer
                current_features = layer(current_features)
                # Apply intermediate classifier at this layer
                if i < len(self.intermediate_classifiers):
                    intermediate_logit = self.intermediate_classifiers[i](current_features)
                    intermediate_logits.append(intermediate_logit)
        
        # POST-2023: Domain discriminator (PRADA, 2025)
        domain_logits = None
        if self.use_domain_adversarial and return_domain_logits:
            domain_logits = self.domain_discriminator(aggregated_features)
        
        # Classification (final layer)
        result = {}
        
        if self.use_uncertainty and return_uncertainty:
            logits, aleatoric, epistemic = self.uncertainty_estimator(aggregated_features)
            result = {
                'logits': logits,
                'aleatoric_uncertainty': aleatoric,
                'epistemic_uncertainty': epistemic
            }
        else:
            logits = self.classifier(aggregated_features)
            result = {'logits': logits}
        
        # FIXED: Add intermediate logits (not just features) for true layer-wise distillation
        if return_intermediate and intermediate_logits:
            result['intermediate_logits'] = intermediate_logits
        
        # Add domain logits
        if domain_logits is not None:
            result['domain_logits'] = domain_logits
        
        return result
