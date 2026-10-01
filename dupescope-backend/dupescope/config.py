from dataclasses import dataclass, fields
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib


@dataclass
class DupeScopeConfig:
    quality_metric: str = 'topiq_nr'
    aesthetic_model: str = 'laion_ViT-L-14'
    face_model: str = 'buffalo_l'
    device: str = 'cpu'
    quality_weight: float = 0.4
    aesthetic_weight: float = 0.35
    face_weight: float = 0.25
    keep_threshold: float = 5.5
    cache_dir: str = '.dupescope'
    max_image_size: int = 1024
    ssim_threshold: float = 0.8
    hash_threshold: int = 10
    burst_gap_seconds: int = 3
    llm_provider: str = 'ollama-local'
    llm_model: str = 'llava'


def load_config(path: str = 'dupescope.toml') -> DupeScopeConfig:
    """Load DupeScopeConfig from a TOML file, falling back to defaults."""
    config_path = Path(path)
    if not config_path.exists():
        return DupeScopeConfig()

    with open(config_path, 'rb') as f:
        raw = tomllib.load(f)

    flat = {}
    for section in raw.values():
        if isinstance(section, dict):
            flat.update(section)

    valid = {f.name for f in fields(DupeScopeConfig)}
    return DupeScopeConfig(**{k: v for k, v in flat.items() if k in valid})


def save_config(config: DupeScopeConfig, path: str = 'dupescope.toml') -> None:
    """Save DupeScopeConfig as a TOML file."""
    from dataclasses import asdict
    config_dict = asdict(config)

    lines = ["# DupeScope configuration", ""]
    sections = {
        'quality': ['quality_metric', 'quality_weight', 'max_image_size', 'ssim_threshold', 'hash_threshold'],
        'aesthetic': ['aesthetic_model', 'aesthetic_weight'],
        'faces': ['face_model', 'face_weight'],
        'pipeline': ['device', 'keep_threshold', 'burst_gap_seconds'],
        'cache': ['cache_dir'],
        'llm': ['llm_provider', 'llm_model'],
    }

    for section, keys in sections.items():
        lines.append(f"[{section}]")
        for key in keys:
            val = config_dict[key]
            if isinstance(val, str):
                lines.append(f'{key} = "{val}"')
            else:
                lines.append(f'{key} = {val}')
        lines.append("")

    Path(path).write_text('\n'.join(lines))
