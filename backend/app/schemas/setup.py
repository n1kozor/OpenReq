from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class SetupEnvironment(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    env_type: str = Field(pattern="^(LIVE|TEST|DEV)$")


class SetupStatusResponse(BaseModel):
    setup_required: bool


class SetupInitializeRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    openai_api_key: str | None = None
    workspace_name: str = Field(min_length=1, max_length=200)
    environments: list[SetupEnvironment] = Field(min_length=1)


class SetupInitializeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
