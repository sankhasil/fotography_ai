from dataclasses import dataclass, field
from pathlib import Path

@dataclass
class StageResult:
    """
    Represents the result of a processing stage in the pipeline.

    :param stage_name: Name of the stage.
    :param success: Boolean indicating if the stage was successful.
    :param data: Dictionary containing additional data from the stage.
    :param error: String containing any error message if the stage failed.
    :param duration_seconds: Float representing the duration of the stage in seconds.
    """
    stage_name: str
    success: bool = True
    data: dict = field(default_factory=dict)
    error: str = ''
    duration_seconds: float = 0.0

@dataclass
class PipelineContext:
    """
    Represents the context for a pipeline job.

    :param job_id: Unique identifier for the job.
    :param folder: Path to the folder being processed.
    :param mode: Mode of operation, can be 'both', 'images', or 'videos'.
    :param threshold: Threshold value for duplicate detection.
    :param recursive: Boolean indicating if subdirectories should be processed recursively.
    :param ai_cull: Boolean indicating if AI-based culling should be performed.
    :param auto_archive: Boolean indicating if results should be automatically archived.
    :param images: List of image paths to process.
    :param results: Dictionary containing the results of the pipeline stages.
    :param config: Dictionary containing configuration settings for the pipeline.
    """
    job_id: str = ''
    folder: str = ''
    mode: str = 'both'
    threshold: int = 10
    recursive: bool = True
    ai_cull: bool = True
    auto_archive: bool = False
    images: list = field(default_factory=list)
    results: dict = field(default_factory=dict)
    config: dict = field(default_factory=dict)
