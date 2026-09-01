import google.generativeai as genai

from app.services.extraction.base import EXTRACT_TOOL, ExtractionProvider


class GeminiProvider(ExtractionProvider):
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash", tools=[EXTRACT_TOOL])

    async def extract(self, raw_text: str) -> dict:
        response = self.model.generate_content(raw_text)
        function_call = response.candidates[0].content.parts[0].function_call
        return dict(function_call.args)
