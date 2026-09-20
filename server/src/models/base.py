# Defines the API for AI Providers
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """
    Abstract interface for LLM / embedding providers.
    """

    @abstractmethod
    def get_embedder(self): ...

    @abstractmethod
    def get_llm(self, *, stream: bool = False): ...
