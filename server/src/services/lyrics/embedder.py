import os
from ollama import Client
from src.services.lyrics.base import LyricsEmbedder


class OllamaEmbedder(LyricsEmbedder):
    model: str
    """Model name to use."""

    dimensions: int | None = None
    """Dimensions of generated vector embedding"""

    mirostat: int | None = None
    """Enable Mirostat sampling for controlling perplexity.
    (default: `0`, `0` = disabled, `1` = Mirostat, `2` = Mirostat 2.0)"""

    mirostat_eta: float | None = None
    """Influences how quickly the algorithm responds to feedback
    from the generated text. A lower learning rate will result in
    slower adjustments, while a higher learning rate will make
    the algorithm more responsive. (Default: `0.1`)"""

    mirostat_tau: float | None = None
    """Controls the balance between coherence and diversity
    of the output. A lower value will result in more focused and
    coherent text. (Default: `5.0`)"""

    num_ctx: int | None = None
    """Sets the size of the context window used to generate the
    next token. (Default: `2048`)	"""

    num_gpu: int | None = None
    """The number of GPUs to use. On macOS it defaults to `1` to
    enable metal support, `0` to disable."""

    keep_alive: int | None = None
    """Controls how long the model will stay loaded into memory
    following the request (default: `5m`)
    """

    num_thread: int | None = None
    """Sets the number of threads to use during computation.
    By default, Ollama will detect this for optimal performance.
    It is recommended to set this value to the number of physical
    CPU cores your system has (as opposed to the logical number of cores)."""

    repeat_last_n: int | None = None
    """Sets how far back for the model to look back to prevent
    repetition. (Default: `64`, `0` = disabled, `-1` = `num_ctx`)"""

    repeat_penalty: float | None = None
    """Sets how strongly to penalize repetitions. A higher value (e.g., `1.5`)
    will penalize repetitions more strongly, while a lower value (e.g., `0.9`)
    will be more lenient. (Default: `1.1`)"""

    temperature: float | None = None
    """The temperature of the model. Increasing the temperature will
    make the model answer more creatively. (Default: `0.8`)"""

    stop: list[str] | None = None
    """Sets the stop tokens to use."""

    tfs_z: float | None = None
    """Tail free sampling is used to reduce the impact of less probable
    tokens from the output. A higher value (e.g., `2.0`) will reduce the
    impact more, while a value of `1.0` disables this setting. (default: `1`)"""

    top_k: int | None = None
    """Reduces the probability of generating nonsense. A higher value (e.g. `100`)
    will give more diverse answers, while a lower value (e.g. `10`)
    will be more conservative. (Default: `40`)"""

    top_p: float | None = None
    """Works together with top-k. A higher value (e.g., `0.95`) will lead
    to more diverse text, while a lower value (e.g., `0.5`) will
    generate more focused and conservative text. (Default: `0.9`)"""

    def __init__(self, host, model, dimensions, **kwargs):
        self.client = Client(host=host)
        self.model = model
        self.dimensions = dimensions
        self.options = kwargs

    def embed_documents(self, texts):
        if not self.client:
            msg = (
                "Ollama client is not initialized. "
                "Please ensure Ollama is running and the model is loaded."
            )
            raise ValueError(msg)

        response = self.client.embed(
            model=self.model,
            input=texts,
            dimensions=self.dimensions,
            options=self.options,
        )

        return response["embeddings"]

    def embed_document(self, text):
        return self.embed_documents([text])[0]


_embedder_instance = None


def get_lyrics_embedder():
    global _embedder_instance

    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = os.getenv("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b")

    if _embedder_instance is None:
        _embedder_instance = OllamaEmbedder(
            host=host,
            model=model,
            dimensions=2560,
        )

    return _embedder_instance
