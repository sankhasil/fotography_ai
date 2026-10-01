from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    folder: str
    mode: str = "both"
    threshold: int = Field(default=10, ge=0, le=64)
    recursive: bool = True
    ai_cull: bool = False
    auto_archive: bool = False
    # ponytail: provider/model are intentionally NOT request fields. They are
    # read from the [llm] section of dupescope.toml so a job cannot silently
    # run against a different model than the one the operator configured.
    # Add them here only if a UI genuinely needs a per-job override.
    limit: int = Field(default=100, ge=1, le=10000)
    offset: int = Field(default=0, ge=0)
    test_mode: bool = False


class MarkDeleteRequest(BaseModel):
    file_ids: list[str] = Field(default_factory=list)


class DeleteRequest(BaseModel):
    file_ids: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    time: str


class JobIdResponse(BaseModel):
    job_id: str


class PhotoCountResponse(BaseModel):
    total: int
    processed: int
    unprocessed: int


class ApproveResponse(BaseModel):
    status: str


class UndoResponse(BaseModel):
    restored: list[dict]


class DeleteResponse(BaseModel):
    moved: list[dict]
