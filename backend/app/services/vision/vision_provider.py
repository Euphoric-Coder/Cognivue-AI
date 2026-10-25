from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class VisionProvider(ABC):
    """Abstract provider for visual understanding and image analysis."""

    @abstractmethod
    def analyze_image(
        self,
        image_path: str,
        context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyzes an educational visual and returns structured metadata.

        Args:
            image_path: Local filesystem path to the image.
            context: Surrounding textual context (e.g. slide title, page text, nearby transcript).

        Returns:
            Dict containing:
                - visualType: Normalized visual type
                - title: Short title or heading
                - visibleText: List of text directly readable
                - keyEntities: Key concepts, entities, or labels
                - relationships: Visible relationships/connections
                - importantValues: Visible metrics/values
                - educationalExplanation: Detailed conceptual explanation
                - structuredData: Optional parsed tabular or chart data
                - confidenceNotes: Notes on readability or ambiguities
        """
        pass
