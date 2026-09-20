from dataclasses import dataclass
from abc import ABC, abstractmethod
from typing import List
from datetime import datetime

@dataclass(frozen=True)
class SourceStat:
    location: str
    last_modified_at: datetime

class Source(ABC):
    """
    Abstract interface for knowledge sources.
    """

    @abstractmethod
    def get_source_stats(self, str) -> List[SourceStat]: ...
