from dataclasses import dataclass, field
from pathlib import Path
from math import sqrt
import insightface.app
import cv2


@dataclass
class Face:
    bbox: tuple = (0, 0, 0, 0)
    landmarks: list = field(default_factory=list)
    det_score: float = 0.0
    age: int = 0
    gender: str = 'unknown'
    is_eyes_open: bool = True


class FaceDetector:
    def __init__(self, device='cpu'):
        self._model = None
        self.device = device

    def load(self):
        if self._model is None:
            self._model = insightface.app.FaceAnalysis(
                name='buffalo_l', providers=['CPUExecutionProvider']
            )
            self._model.prepare(ctx_id=0, det_size=(640, 640))

    def _ensure_loaded(self):
        if self._model is None:
            raise ValueError("FaceDetector not loaded. Call load() first.")

    def detect(self, path: Path) -> list[Face]:
        self._ensure_loaded()
        from dupescope.core import open_image
        import numpy as np

        pil_img = open_image(path, max_size=1024)
        if pil_img is None:
            return []
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        results = self._model.get(img)
        faces = []
        for r in results:
            landmarks = r.landmark.tolist() if r.landmark is not None else []
            face = Face(
                bbox=tuple(r.bbox.tolist()),
                landmarks=landmarks,
                # ponytail: insightface can return Face.score=None for some
                # detections (reproduced on NEF photos in Hamburg-Foto-Walk).
                # Treat as 0 rather than crash any given image.
                det_score=0.0 if r.score is None else float(r.score),
                age=int(r.age) if hasattr(r, 'age') and r.age is not None else 0,
                gender=self._gender_str(r) if hasattr(r, 'gender') else 'unknown',
            )
            face.is_eyes_open = self._is_eyes_open(landmarks)
            faces.append(face)
        return faces

    @staticmethod
    def _gender_str(r) -> str:
        gender = getattr(r, 'gender', None)
        if gender is None:
            return 'unknown'
        if isinstance(gender, int):
            return 'Male' if gender == 1 else 'Female'
        return str(gender)

    @staticmethod
    def _is_eyes_open(landmarks: list) -> bool:
        if len(landmarks) < 48:
            return True
        left_eye = landmarks[36:42]
        right_eye = landmarks[42:48]
        return (
            FaceDetector._eye_aspect_ratio(left_eye) > 0.1
            and FaceDetector._eye_aspect_ratio(right_eye) > 0.1
        )

    @staticmethod
    def _eye_aspect_ratio(eye: list) -> float:
        if len(eye) < 6:
            return 1.0
        def dist(a, b):
            return sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
        A = dist(eye[1], eye[5])
        B = dist(eye[2], eye[4])
        C = dist(eye[0], eye[3])
        return A / (B + 1e-6)
