from app.core.config import settings
from app.services.extraction.base import ExtractionProvider
from app.services.extraction.groq_provider import GroqProvider

_provider: ExtractionProvider | None = None


def get_extraction_provider() -> ExtractionProvider:
    global _provider
    if _provider is not None:
        return _provider

    if settings.EXTRACTION_PROVIDER == "groq":
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not set — extraction provider unavailable")
        _provider = GroqProvider(api_key=settings.GROQ_API_KEY,
                                 base_url=settings.GROQ_BASE_URL, model=settings.GROQ_MODEL)
    elif settings.EXTRACTION_PROVIDER == "gemini":
        from app.services.extraction.gemini_provider import GeminiProvider
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set — extraction provider unavailable")
        _provider = GeminiProvider(api_key=settings.GEMINI_API_KEY)
    elif settings.EXTRACTION_PROVIDER == "qwen":
        from app.services.extraction.qwen_provider import QwenProvider
        if not settings.QWEN_API_KEY:
            raise RuntimeError("QWEN_API_KEY not set — extraction provider unavailable")
        _provider = QwenProvider(api_key=settings.QWEN_API_KEY, base_url=settings.QWEN_BASE_URL)
    else:
        raise RuntimeError(f"Unknown EXTRACTION_PROVIDER: {settings.EXTRACTION_PROVIDER}")
    return _provider
