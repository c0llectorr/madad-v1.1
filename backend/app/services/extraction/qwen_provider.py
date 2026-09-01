import httpx
import json

from app.services.extraction.base import EXTRACT_TOOL, ExtractionProvider


class QwenProvider(ExtractionProvider):
    def __init__(self, api_key: str, base_url: str):
        self.api_key, self.base_url = api_key, base_url

    async def extract(self, raw_text: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": "qwen-max", "messages": [{"role": "user", "content": raw_text}],
                      "tools": [EXTRACT_TOOL]})
            tool_call = resp.json()["choices"][0]["message"]["tool_calls"][0]
            return json.loads(tool_call["function"]["arguments"])
