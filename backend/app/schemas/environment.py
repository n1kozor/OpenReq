from pydantic import BaseModel, Field

from app.models.environment import EnvironmentType


class EnvironmentVariableCreate(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    value: str = ""
    is_secret: bool = False


class EnvironmentVariableOut(BaseModel):
    id: str
    key: str
    value: str
    is_secret: bool

    model_config = {"from_attributes": True}


class EnvironmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    env_type: EnvironmentType = EnvironmentType.DEV
    workspace_id: str
    variables: list[EnvironmentVariableCreate] | None = None


class EnvironmentOut(BaseModel):
    id: str
    name: str
    env_type: EnvironmentType
    workspace_id: str
    variables: list[EnvironmentVariableOut]

    model_config = {"from_attributes": True}
