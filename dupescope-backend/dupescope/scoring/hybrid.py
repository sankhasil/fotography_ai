from dataclasses import dataclass
from pathlib import Path


@dataclass
class HybridResult:
    overall: float = 0.0
    quality_score: float = 0.0
    aesthetic_score: float = 0.0
    face_count: int = 0
    keep: bool = True
    reason: str = ''
    method: str = 'hybrid'


class HybridScorer:
    def __init__(self, device='cpu', quality_weight=0.4, aesthetic_weight=0.35, face_weight=0.25):
        self.device = device
        self.quality_weight = quality_weight
        self.aesthetic_weight = aesthetic_weight
        self.face_weight = face_weight
        self._quality = None
        self._aesthetic = None
        self._faces = None

    def load(self):
        from dupescope.scoring.quality import QualityScorer
        from dupescope.scoring.aesthetic import AestheticScorer
        from dupescope.scoring.faces import FaceDetector

        self._quality = QualityScorer(device=self.device)
        self._quality.load()
        self._aesthetic = AestheticScorer(device=self.device)
        self._aesthetic.load()
        self._faces = FaceDetector(device=self.device)
        self._faces.load()

    def _ensure_loaded(self):
        if self._quality is None:
            raise ValueError("HybridScorer not loaded. Call load() first.")

    def score(self, path: Path) -> HybridResult:
        self._ensure_loaded()

        q_result = self._quality.score(path)
        a_result = self._aesthetic.score(path)
        faces = self._faces.detect(path)
        face_count = len(faces)

        has_open_eyes = any(f.is_eyes_open for f in faces) if faces else False
        face_bonus = self.face_weight if has_open_eyes else 0.0

        overall = (
            self.quality_weight * q_result.overall
            + self.aesthetic_weight * a_result.aesthetic_score
            + face_bonus
        )

        # ponytail: Composite scale tops out ~7.75 (0.4*10 + 0.35*10 + 0.25)
        # and aesthetic is near-constant 5.0 for normal photos, so 5.0 was
        # unreachable without a face — a full 50-photo walk was binned 100%.
        # 4.0 ≈ quality >= ~5.75, which keeps the sharpest burst frames.
        keep = overall >= 4.0
        reason = 'good composite score' if keep else 'below threshold'

        return HybridResult(
            overall=round(overall, 2),
            quality_score=q_result.overall,
            aesthetic_score=a_result.aesthetic_score,
            face_count=face_count,
            keep=keep,
            reason=reason,
        )
