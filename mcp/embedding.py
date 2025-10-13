#!/usr/bin/env python3
"""
Embedding generation using EmbeddingGemma Q4 model

This module provides text-to-vector conversion using the EmbeddingGemma Q4 model.
The model is loaded from ~/.cc-pulse/models/embeddinggemma-q4/
"""

import os
from pathlib import Path
from typing import List, Optional
import numpy as np
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer


class EmbeddingGenerator:
    """
    EmbeddingGemma Q4 model wrapper for text embeddings

    Features:
    - 768-dimensional vector output
    - Model caching (loads once, reuses)
    - CPU-optimized inference
    """

    def __init__(self, model_dir: Optional[Path] = None):
        """
        Initialize embedding generator

        Args:
            model_dir: Path to model directory (default: ~/.cc-pulse/models/embeddinggemma-q4/)
        """
        self.model_dir = model_dir or self._get_default_model_dir()
        self.model = None
        self.tokenizer = None

    def _get_default_model_dir(self) -> Path:
        """Get default model directory"""
        env_dir = os.getenv('CC_PULSE_MODEL_DIR')
        if env_dir:
            return Path(env_dir) / 'embeddinggemma-q4'

        return Path.home() / '.cc-pulse' / 'models' / 'embeddinggemma-q4'

    def _load_model(self):
        """Load model and tokenizer (lazy loading)"""
        if self.model is not None:
            return  # Already loaded

        if not self.model_dir.exists():
            raise FileNotFoundError(
                f"Model directory not found: {self.model_dir}\n"
                "Please run: cc-pulse setup"
            )

        # Check for required files
        onnx_file = self.model_dir / 'onnx' / 'model_q4.onnx'
        if not onnx_file.exists():
            raise FileNotFoundError(
                f"Model file not found: {onnx_file}\n"
                "Please run: cc-pulse setup"
            )

        print(f"Loading EmbeddingGemma Q4 model from {self.model_dir}...")

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))

        # Load ONNX model
        self.model = ORTModelForFeatureExtraction.from_pretrained(
            str(self.model_dir),
            file_name='model_q4.onnx',
            subfolder='onnx',
            provider='CPUExecutionProvider'
        )

        print("Model loaded successfully")

    def generate_embedding(self, text: str) -> np.ndarray:
        """
        Generate embedding vector from text

        Args:
            text: Input text (any language, but English recommended for better accuracy)

        Returns:
            768-dimensional numpy array (float32)
        """
        # Load model if not loaded
        self._load_model()

        # Tokenize
        inputs = self.tokenizer(
            text,
            return_tensors='pt',
            padding=True,
            truncation=True,
            max_length=512
        )

        # Generate embedding
        outputs = self.model(**inputs)

        # Mean pooling
        embeddings = outputs.last_hidden_state.mean(dim=1).detach().numpy()

        # Return as 1D array
        return embeddings[0].astype(np.float32)

    def generate_embeddings_batch(self, texts: List[str]) -> List[np.ndarray]:
        """
        Generate embeddings for multiple texts (batch processing)

        Args:
            texts: List of input texts

        Returns:
            List of 768-dimensional numpy arrays
        """
        # Load model if not loaded
        self._load_model()

        # Tokenize batch
        inputs = self.tokenizer(
            texts,
            return_tensors='pt',
            padding=True,
            truncation=True,
            max_length=512
        )

        # Generate embeddings
        outputs = self.model(**inputs)

        # Mean pooling
        embeddings = outputs.last_hidden_state.mean(dim=1).detach().numpy()

        # Return as list of arrays
        return [emb.astype(np.float32) for emb in embeddings]

    def unload_model(self):
        """Unload model to free memory"""
        self.model = None
        self.tokenizer = None
        print("Model unloaded")


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """
    Calculate cosine similarity between two vectors

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Similarity score (0.0 to 1.0)
    """
    dot_product = np.dot(vec1, vec2)
    norm_a = np.linalg.norm(vec1)
    norm_b = np.linalg.norm(vec2)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot_product / (norm_a * norm_b))


# Singleton instance
_embedding_generator: Optional[EmbeddingGenerator] = None


def get_embedding_generator() -> EmbeddingGenerator:
    """Get or create singleton embedding generator"""
    global _embedding_generator

    if _embedding_generator is None:
        _embedding_generator = EmbeddingGenerator()

    return _embedding_generator
