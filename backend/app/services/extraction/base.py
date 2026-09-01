from abc import ABC, abstractmethod

EXTRACT_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_relief_need",
        "parameters": {
            "type": "object",
            "properties": {
                "location_name": {"type": "string"},
                "estimated_population": {"type": "integer"},
                "needs": {"type": "array", "items": {"type": "string",
                    "enum": ["food", "water", "medical_evacuation", "shelter", "medicine", "general_evacuation"]}},
                "urgency_flags": {"type": "array", "items": {"type": "string",
                    "enum": ["elderly_present", "children_present", "pregnancy", "injury_reported",
                             "water_rising", "stranded_no_exit"]}}
            },
            "required": ["location_name", "needs"]
        }
    }
}


class ExtractionProvider(ABC):
    @abstractmethod
    async def extract(self, raw_text: str) -> dict:
        """Returns: {location_name, estimated_population, needs, urgency_flags}"""
