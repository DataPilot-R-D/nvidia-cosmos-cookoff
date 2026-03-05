"""Local NVIDIA Nemotron VLM implementation for ROS2 bridge.

NVIDIA Nemotron VLM is optimized for NVIDIA GPUs and provides good
balance between size (~8B) and quality for vision-language tasks.
"""

from dataclasses import dataclass
from typing import Any
import warnings

import numpy as np
from PIL import Image as PILImage
import torch
from transformers import AutoProcessor, AutoModel  # type: ignore[import-untyped]

try:
    from dimos.msgs.sensor_msgs import Image
except ImportError:
    Image = None  # type: ignore


@dataclass
class NemotronVLMConfig:
    """Configuration for local NVIDIA Nemotron VLM model."""
    
    # Use quantized FP4-QAD version for lower VRAM usage
    model_name: str = "nvidia/Llama-3.1-Nemotron-Nano-VL-8B-V1-FP4-QAD"
    dtype: torch.dtype = torch.float16  # FP4-QAD uses float16
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    auto_resize: tuple[int, int] | None = (512, 512)  # Optimized for efficiency
    max_new_tokens: int = 1024  # Larger for better structured outputs
    trust_remote_code: bool = True
    ignore_mismatched_sizes: bool = True  # Required for quantized/pruned models


class NemotronVLMLocalModel:
    """Local NVIDIA Nemotron VLM vision-language model.
    
    NVIDIA Nemotron VLM is an 8B parameter model optimized for NVIDIA GPUs.
    Better structured output quality than smaller models like Moondream/SmolVLM.
    
    Example:
        ```python
        model = NemotronVLMLocalModel()
        model.start()
        
        response = model.query(image, "What objects are in this image?")
        print(response)
        ```
    """

    def __init__(self, model_name: str = "nvidia/Llama-3.1-Nemotron-Nano-VL-8B-V1", **kwargs):
        """Initialize NVIDIA Nemotron VLM model.
        
        Args:
            model_name: HuggingFace model name
            **kwargs: Additional config options
        """
        self.config = NemotronVLMConfig(model_name=model_name)
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        
        self._model_instance = None
        self._processor_instance = None

    @property
    def _model(self) -> AutoModel:
        """Load NVIDIA Nemotron VLM model."""
        if self._model_instance is None:
            print(f"[NemotronVLM] Loading quantized model {self.config.model_name}...")
            self._model_instance = AutoModel.from_pretrained(
                self.config.model_name,
                trust_remote_code=self.config.trust_remote_code,
                torch_dtype=self.config.dtype,
                ignore_mismatched_sizes=self.config.ignore_mismatched_sizes,
            ).to(self.config.device)
            self._model_instance.eval()
            print(f"[NemotronVLM] Quantized model loaded on {self.config.device}")
        return self._model_instance

    @property
    def _processor(self) -> AutoProcessor:
        """Load NVIDIA Nemotron VLM processor."""
        if self._processor_instance is None:
            self._processor_instance = AutoProcessor.from_pretrained(
                self.config.model_name,
                trust_remote_code=self.config.trust_remote_code,
            )
        return self._processor_instance

    def _to_pil(self, image) -> PILImage.Image:
        """Convert dimos Image or numpy array to PIL Image."""
        if isinstance(image, np.ndarray):
            return PILImage.fromarray(image)
        
        # Assume it's a dimos Image
        if hasattr(image, 'to_rgb'):
            rgb_image = image.to_rgb()
            return PILImage.fromarray(rgb_image.data)
        
        # Already PIL
        if isinstance(image, PILImage.Image):
            return image
            
        raise ValueError(f"Unsupported image type: {type(image)}")

    def query(self, image, query: str, response_format=None, **kwargs) -> str:
        """Query the model with an image and text prompt.
        
        Args:
            image: Input image (PIL, numpy, or dimos Image)
            query: Text question about the image
            response_format: Optional structured output format (ignored)
            **kwargs: Additional arguments (e.g., max_new_tokens)
            
        Returns:
            Model's text response
        """
        # Note: response_format is accepted but ignored
        pil_image = self._to_pil(image)
        
        # Resize if configured
        if self.config.auto_resize:
            max_w, max_h = self.config.auto_resize
            w, h = pil_image.size
            if w > max_w or h > max_h:
                scale = min(max_w / w, max_h / h)
                new_w, new_h = int(w * scale), int(h * scale)
                pil_image = pil_image.resize((new_w, new_h), PILImage.Resampling.LANCZOS)
        
        # Prepare inputs
        inputs = self._processor(
            images=pil_image,
            text=query,
            return_tensors="pt"
        )
        inputs = {k: v.to(self.config.device) for k, v in inputs.items()}
        
        # Generate response
        max_new_tokens = kwargs.get("max_new_tokens", self.config.max_new_tokens)
        with torch.inference_mode():
            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
            )
        
        # Decode response
        generated_text = self._processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]
        
        # Extract just the response (remove the prompt if included)
        if query in generated_text:
            response = generated_text.split(query)[-1].strip()
        else:
            response = generated_text.strip()
        
        return response

    def query_batch(self, images: list, query: str, response_format=None, **kwargs) -> list[str]:
        """Query multiple images with the same question.
        
        Args:
            images: List of input images
            query: Question to ask about each image
            response_format: Optional structured output format (ignored)
            **kwargs: Additional arguments
            
        Returns:
            List of responses, one per image
        """
        # Note: response_format is accepted but ignored
        print(f"[NemotronVLM] query_batch called with {len(images) if images else 0} images")
        
        if not images:
            print("[NemotronVLM] No images provided, returning empty list")
            return []
        
        # Process images one at a time to save VRAM
        print(f"[NemotronVLM] Processing images sequentially")
        results = []
        for i, img in enumerate(images):
            try:
                print(f"[NemotronVLM] Processing image {i+1}/{len(images)}")
                response = self.query(img, query, response_format=response_format, **kwargs)
                results.append(response)
                
                # Clear CUDA cache between images
                if self.config.device == "cuda":
                    torch.cuda.empty_cache()
                    
            except Exception as e:
                print(f"[NemotronVLM] Error processing image {i+1}: {e}")
                import traceback
                traceback.print_exc()
                results.append("")
        
        print(f"[NemotronVLM] Completed processing {len(results)} images")
        return results

    def start(self) -> None:
        """Start the model with a warmup inference."""
        print("[NemotronVLM] Starting model...")
        # Load model and processor
        _ = self._model
        _ = self._processor
        
        # Warmup with a dummy inference
        dummy_image = PILImage.new("RGB", (224, 224), color="gray")
        inputs = self._processor(images=dummy_image, text="Hello", return_tensors="pt")
        inputs = {k: v.to(self.config.device) for k, v in inputs.items()}
        
        with torch.inference_mode():
            self._model.generate(**inputs, max_new_tokens=10)
        
        print("[NemotronVLM] Model ready")

    def stop(self) -> None:
        """Release model and processor, free GPU memory."""
        print("[NemotronVLM] Stopping model...")
        self._processor_instance = None
        self._model_instance = None
        
        # Clear CUDA cache if using GPU
        if self.config.device == "cuda":
            torch.cuda.empty_cache()
        
        print("[NemotronVLM] Model stopped")
