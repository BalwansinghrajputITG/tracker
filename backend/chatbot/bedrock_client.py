"""
AWS Bedrock client — Amazon Nova Pro as the primary LLM.

Uses the Bedrock Converse API which accepts a messages-style format.
boto3 is synchronous, so we run calls in a thread-pool via asyncio.to_thread
to avoid blocking the FastAPI event loop.
"""
import asyncio
import logging
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import settings

logger = logging.getLogger(__name__)


def _make_client():
    """Build a boto3 bedrock-runtime client from settings."""
    return boto3.client(
        service_name="bedrock-runtime",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY,
        aws_secret_access_key=settings.AWS_BEDROCK_SECRET_KEY,
    )


def _convert_messages(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Convert OpenAI-style messages → Bedrock Converse format.

    Returns (system_list, conversation_list).
    - system_list  : [{"text": "..."}]
    - conversation_list: [{"role": "user"|"assistant", "content": [{"text": "..."}]}]

    Rules:
    - "system" role → extracted into system_list (Bedrock takes it separately)
    - consecutive same-role messages are merged (Bedrock requires alternating turns)
    """
    system_list: list[dict] = []
    conversation: list[dict] = []

    for msg in messages:
        role = msg["role"]
        content = msg.get("content") or ""

        if role == "system":
            system_list.append({"text": content})
            continue

        bedrock_role = "assistant" if role == "assistant" else "user"

        # Merge consecutive same-role turns (Bedrock requires alternating)
        if conversation and conversation[-1]["role"] == bedrock_role:
            conversation[-1]["content"][0]["text"] += "\n" + content
        else:
            conversation.append({
                "role": bedrock_role,
                "content": [{"text": content}],
            })

    # Bedrock requires the conversation to start with a user turn
    if conversation and conversation[0]["role"] != "user":
        conversation.insert(0, {"role": "user", "content": [{"text": "(start)"}]})

    return system_list, conversation


def _sync_chat(messages: list[dict], temperature: float, max_tokens: int) -> str:
    """Synchronous Bedrock Converse call — runs inside a thread."""
    client = _make_client()
    system_list, conversation = _convert_messages(messages)

    kwargs: dict = {
        "modelId": settings.BEDROCK_MODEL_ID,
        "messages": conversation,
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    }
    if system_list:
        kwargs["system"] = system_list

    response = client.converse(**kwargs)
    return response["output"]["message"]["content"][0]["text"]


async def chat_completion(
    messages: list[dict],
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    """Async wrapper — offloads the blocking boto3 call to a thread."""
    try:
        result = await asyncio.to_thread(
            _sync_chat, messages, temperature, max_tokens
        )
        return result
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Bedrock API error: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected Bedrock error: {e}")
        raise
