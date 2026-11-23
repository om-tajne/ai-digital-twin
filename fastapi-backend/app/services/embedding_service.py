import os
import math
import hashlib
import logging
from typing import List, Optional

from langchain_core.embeddings import Embeddings

logger = logging.getLogger(__name__)

TARGET_VECTOR_DIM = 1536


class FallbackEmbeddings(Embeddings):
    """
    Deterministic fallback embedding generator that creates 1536-dimensional
    unit-normalized vector embeddings based on text hashing.
    Used when API keys are not provided or API calls fail in offline development.
    """

    def _generate_vector(self, text: str) -> List[float]:
        hash_bytes = hashlib.sha256(text.encode("utf-8")).digest()
        
        vector = []
        for i in range(TARGET_VECTOR_DIM):
            byte_idx = (i * 2) % len(hash_bytes)
            val = (hash_bytes[byte_idx] + hash_bytes[(byte_idx + 1) % len(hash_bytes)] * 256) / 65535.0
            angle = (i * 0.1) + val * math.pi
            vector.append(math.sin(angle) * math.cos(i * 0.05))

        magnitude = math.sqrt(sum(x * x for x in vector))
        if magnitude > 0:
            vector = [x / magnitude for x in vector]

        return vector

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._generate_vector(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._generate_vector(text)


class EmbeddingService:
    """
    Service for generating vector embeddings using LangChain with OpenAI or Gemini providers.
    """

    def __init__(self, provider: Optional[str] = None):
        self.provider = (provider or os.getenv("EMBEDDING_PROVIDER", "auto")).lower()
        self.embeddings_model = self._initialize_model()

    def _initialize_model(self) -> Embeddings:
        openai_key = os.getenv("OPENAI_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

        if (self.provider == "openai" or (self.provider == "auto" and openai_key)) and openai_key:
            try:
                from langchain_openai import OpenAIEmbeddings
                model_name = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
                logger.info(f"Initializing LangChain OpenAIEmbeddings with model '{model_name}'")
                return OpenAIEmbeddings(model=model_name, api_key=openai_key)
            except Exception as e:
                logger.warning(f"Failed to initialize OpenAIEmbeddings: {e}. Falling back to fallback embeddings.")

        if (self.provider in ["gemini", "google"] or (self.provider == "auto" and gemini_key)) and gemini_key:
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                model_name = os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")
                if not model_name.startswith("models/"):
                    model_name = f"models/{model_name}"
                logger.info(f"Initializing LangChain GoogleGenerativeAIEmbeddings with model '{model_name}'")
                model = GoogleGenerativeAIEmbeddings(model=model_name, google_api_key=gemini_key)
                # Fast validation ping: verify credentials work without delay during request handling
                model.embed_query("ping")
                return model
            except Exception as e:
                logger.warning(f"Failed to initialize GoogleGenerativeAIEmbeddings: {e}. Falling back to fallback embeddings.")

        logger.info("No valid API key found or provider set to 'fallback'. Using deterministic FallbackEmbeddings.")
        return FallbackEmbeddings()

    def _normalize_dimension(self, vector: List[float], target_dim: int = TARGET_VECTOR_DIM) -> List[float]:
        curr_dim = len(vector)
        if curr_dim == target_dim:
            return vector
        elif curr_dim > target_dim:
            truncated = vector[:target_dim]
            mag = math.sqrt(sum(x * x for x in truncated))
            return [x / mag for x in truncated] if mag > 0 else truncated
        else:
            padded = vector + [0.0] * (target_dim - curr_dim)
            return padded

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generates a 1536-dimensional vector embedding for a single text input.
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")
            
        try:
            raw_vector = self.embeddings_model.embed_query(text)
            return self._normalize_dimension(raw_vector)
        except Exception as e:
            logger.error(f"Error generating embedding via LangChain model: {e}. Switching to fallback.")
            self.embeddings_model = FallbackEmbeddings()
            return self.embeddings_model.embed_query(text)

    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generates 1536-dimensional vector embeddings for a list of texts in batch.
        """
        if not texts:
            return []

        valid_texts = [text for text in texts if text and text.strip()]
        
        if not valid_texts:
            raise ValueError("No valid text provided.")

        try:
            raw_vectors = self.embeddings_model.embed_documents(valid_texts)
            return [self._normalize_dimension(vec) for vec in raw_vectors]
        except Exception as e:
            logger.error(f"Error generating batch embeddings via LangChain model: {e}. Switching to fallback.")
            self.embeddings_model = FallbackEmbeddings()
            return self.embeddings_model.embed_documents(valid_texts)


# -----------------------------------------
# Shared singleton instance
# -----------------------------------------
_embedding_service_instance = None

def get_embedding_service() -> EmbeddingService:
    """
    Return the shared EmbeddingService instance.
    """
    global _embedding_service_instance
    if _embedding_service_instance is None:
        _embedding_service_instance = EmbeddingService()
    return _embedding_service_instance