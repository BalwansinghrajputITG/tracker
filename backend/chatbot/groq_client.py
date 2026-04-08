from groq import AsyncGroq
from config import settings
import logging

logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=settings.GROQ_API_KEY)


async def chat_completion(
    messages: list[dict],
    model: str = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    model = model or settings.GROQ_MODEL
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        raise


async def stream_chat_completion(
    messages: list[dict],
    model: str = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
):
    """Async generator that yields text tokens from Groq streaming API."""
    model = model or settings.GROQ_MODEL
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                yield token
    except Exception as e:
        logger.error(f"Groq stream error: {e}")
        raise
