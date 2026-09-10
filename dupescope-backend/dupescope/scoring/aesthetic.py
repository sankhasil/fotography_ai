from dataclasses import dataclass
from pathlib import Path
import torch
import numpy as np


@dataclass
class AestheticResult:
    aesthetic_score: float = 0.0
    keep: bool = True
    confidence: float = 0.0
    method: str = 'unknown'


class AestheticScorer:
    def __init__(self, device='cpu'):
        self.device = device
        self._model = None
        self._preprocess = None
        self._aesthetic_weights = None

    def load(self):
        import open_clip

        model, _, preprocess = open_clip.create_model_and_transforms(
            'ViT-L-14', pretrained='openai'
        )
        model.to(self.device)
        model.eval()
        self._model = model
        self._preprocess = preprocess

    def _ensure_loaded(self):
        if self._model is None:
            raise ValueError("AestheticScorer not loaded. Call load() first.")

    def score(self, path: Path) -> AestheticResult:
        self._ensure_loaded()
        from dupescope.core import open_image

        image = open_image(path, max_size=1024)
        if image is None:
            return AestheticResult(method='CLIP-ViT-L14')
        tensor = self._preprocess(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            features = self._model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)

        score = float(features.mean().item())
        aesthetic_score = max(0.0, min(10.0, (score + 1) * 5.0))
        keep = aesthetic_score >= 5.0

        return AestheticResult(
            aesthetic_score=round(aesthetic_score, 2),
            keep=keep,
            confidence=0.8,
            method='CLIP-ViT-L14'
        )
