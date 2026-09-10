from dataclasses import dataclass


@dataclass
class QualityResult:
    overall: float = 0.0
    sharpness: float = 0.0
    exposure: float = 0.0
    noise: float = 0.0
    is_blurry: bool = False
    is_overexposed: bool = False
    method: str = 'unknown'


class QualityScorer:
    def __init__(self, device='cpu', metric_name='topiq_nr'):
        self.device = device
        self.metric_name = metric_name
        self._metric = None

    @property
    def is_loaded(self) -> bool:
        return self._metric is not None

    def load(self):
        if not self.is_loaded:
            import pyiqa
            self._metric = pyiqa.create_metric(self.metric_name, device=self.device)

    def _ensure_loaded(self):
        if not self.is_loaded:
            raise ValueError("QualityScorer not loaded. Call load() first.")

    def score(self, path) -> 'QualityResult':
        self._ensure_loaded()
        from dupescope.core import open_image
        image = open_image(path, max_size=1024)
        if image is None:
            return QualityResult(method=self.metric_name)
        raw = float(self._metric(image))
        score = round(raw * 10, 2)
        is_blurry = score < 3.0
        is_overexposed = score > 9.5
        return QualityResult(
            overall=score,
            is_blurry=is_blurry,
            is_overexposed=is_overexposed,
            method=self.metric_name,
        )
