from pydantic import BaseModel


class AppSettingsOut(BaseModel):
    has_openai_key: bool = False
    openai_api_key_hint: str | None = None
    ai_provider: str = "openai"
    openai_model: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    has_ollama_url: bool = False

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    ai_provider: str | None = None
    openai_model: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
