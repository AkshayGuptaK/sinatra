from ollama import Client
from langchain_ollama import ChatOllama
from src.models.base import AIProvider
from src.config import config


class OllamaEmbeddings:
    model: str
    """Model name to use."""

    dimensions: int | None = None
    """Dimensions of generated vector embedding"""

    _client: Client | None = None
    """The client to use for making requests."""

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

    def __init__(self, model, dimensions):
        self.model = model
        self.dimensions = dimensions
        self._set_client()

    @property
    def _default_params(self):
        """Get the default parameters for calling Ollama."""
        return {
            "mirostat": self.mirostat,
            "mirostat_eta": self.mirostat_eta,
            "mirostat_tau": self.mirostat_tau,
            "num_ctx": self.num_ctx,
            "num_gpu": self.num_gpu,
            "num_thread": self.num_thread,
            "repeat_last_n": self.repeat_last_n,
            "repeat_penalty": self.repeat_penalty,
            "temperature": self.temperature,
            "stop": self.stop,
            "tfs_z": self.tfs_z,
            "top_k": self.top_k,
            "top_p": self.top_p,
        }

    def _set_client(self):
        """Set client to use for Ollama."""
        self._client = Client(host=config["ollama_host"])
        return self

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed search docs."""
        if not self._client:
            msg = (
                "Ollama client is not initialized. "
                "Please ensure Ollama is running and the model is loaded."
            )
            raise ValueError(msg)
        return self._client.embed(
            self.model,
            texts,
            options=self._default_params,
            keep_alive=self.keep_alive,
            dimensions=self.dimensions,
        )["embeddings"]

    def embed_query(self, text: str) -> list[float]:
        """Embed query text."""
        return self.embed_documents([text])[0]


class OllamaProvider(AIProvider):
    def get_embedder(self):
        return OllamaEmbeddings(
            model=config["embedding_model"], dimensions=config["vector_dims"]
        )

    def get_llm(self, *, stream=True):
        return ChatOllama(
            model=config["large_language_model"],
            num_ctx=config["context_window_size"],
            temperature=0,
            stream=stream,
        )
