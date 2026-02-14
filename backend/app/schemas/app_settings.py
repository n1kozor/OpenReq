from pydantic import BaseModel


class AppSettingsOut(BaseModel):
    has_openai_key: bool = False
    openai_api_key_hint: str | None = None

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    openai_api_key: str | None = None
