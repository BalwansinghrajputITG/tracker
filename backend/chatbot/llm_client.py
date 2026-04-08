"""
Unified LLM client.

Strategy:
  1. Try Amazon Nova Pro via AWS Bedrock (primary).
  2. If Bedrock is not configured (missing keys) OR raises any error → fall back to Groq.

Both clients expose the same signature:
    async def chat_completion(messages, temperature, max_tokens) -> str
"""
import logging

from config import settings
from chatbot import bedrock_client, groq_client

logger = logging.getLogger(__name__)


def _bedrock_configured() -> bool:
    """Return True only when both AWS credentials are non-empty."""
    return bool(settings.AWS_ACCESS_KEY and settings.AWS_BEDROCK_SECRET_KEY)


async def chat_completion(
    messages: list[dict],
    model: str = None,          # ignored for Bedrock; passed to Groq if fallback
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    if _bedrock_configured():
        try:
            logger.info("LLM: using Amazon Nova Pro (Bedrock)")
            return await bedrock_client.chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            logger.warning(f"Bedrock failed ({e}), falling back to Groq")

    # Fallback — Groq
    logger.info("LLM: using Groq (fallback)")
    return await groq_client.chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )


async def stream_completion(
    messages: list[dict],
    model: str = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
):
    """Async generator — yields text tokens. Tries Bedrock first, falls back to Groq."""
    if _bedrock_configured():
        try:
            logger.info("LLM stream: using Amazon Nova Pro (Bedrock)")
            async for token in bedrock_client.stream_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                yield token
            return
        except Exception as e:
            logger.warning(f"Bedrock stream failed ({e}), falling back to Groq")

    logger.info("LLM stream: using Groq (fallback)")
    async for token in groq_client.stream_chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    ):
        yield token
