"""Local Qwen2.5-VL implementation for ROS2 bridge.

This is a standalone implementation that doesn't require modifying DimOS core.
"""

from dataclasses import dataclass
from functools import cached_property
from typing import Any
import warnings

import numpy as np
from PIL import Image as PILImage
import torch
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor  # type: ignore[import-untyped]
from qwen_vl_utils import process_vision_info  # type: ignore[import-untyped]

try:
    from dimos.models.base import HuggingFaceModel, HuggingFaceModelConfig
    from dimos.models.vl.base import VlModel
    from dimos.msgs.sensor_msgs import Image
except ImportError:
    # Fallback if DimOS types not available
    HuggingFaceModel = object  # type: ignore
    HuggingFaceModelConfig = object  # type: ignore
    VlModel = object  # type: ignore
    Image = None  # type: ignore


@dataclass
class Qwen25VlLocalConfig:
    """Configuration for local Qwen2-VL model."""
    
    model_name: str = "Qwen/Qwen2-VL-2B-Instruct"
    dtype: torch.dtype = torch.bfloat16
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    auto_resize: tuple[int, int] | None = (512, 512)  # Reduced from 1024 to save VRAM
    max_new_tokens: int = 512
    trust_remote_code: bool = True


class Qwen25VlLocalModel:
    """Local Qwen2-VL vision-language model.
    
    Supports Qwen2-VL-2B-Instruct and Qwen2-VL-7B-Instruct models.
    These models are fully local, fast, and good at structured outputs.
    """

    def __init__(self, model_name: str = "Qwen/Qwen2-VL-2B-Instruct", **kwargs):
        """Initialize Qwen2.5-VL model.
        
        Args:
            model_name: HuggingFace model name
            **kwargs: Additional config options
        """
        self.config = Qwen25VlLocalConfig(model_name=model_name)
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        
        self._model_instance = None
        self._processor_instance = None

    @property
    def _model(self) -> Qwen2VLForConditionalGeneration:
        """Load Qwen2.5-VL model."""
        if self._model_instance is None:
            self._model_instance = Qwen2VLForConditionalGeneration.from_pretrained(
                self.config.model_name,
                trust_remote_code=self.config.trust_remote_code,
                torch_dtype=self.config.dtype,
            ).to(self.config.device)
            self._model_instance.eval()
        return self._model_instance

    @property
    def _processor(self) -> AutoProcessor:
        """Load Qwen2.5-VL processor."""
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
            response_format: Optional structured output format (ignored for Qwen2-VL)
            **kwargs: Additional arguments (e.g., max_new_tokens)
            
        Returns:
            Model's text response
        """
        # Note: response_format is accepted but ignored - Qwen2-VL doesn't support
        # OpenAI-style structured outputs, but follows prompts well
        pil_image = self._to_pil(image)
        
        # Prepare messages in Qwen2.5-VL format
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": pil_image},
                    {"type": "text", "text": query},
                ],
            }
        ]
        
        # Apply chat template
        text = self._processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        # Process vision info
        image_inputs, video_inputs = process_vision_info(messages)
        
        # Prepare inputs
        inputs = self._processor(
            text=[text],
            images=image_inputs if image_inputs else None,
            videos=video_inputs if video_inputs else None,
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to(self.config.device)
        
        # Generate response
        max_new_tokens = kwargs.get("max_new_tokens", self.config.max_new_tokens)
        with torch.inference_mode():
            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
            )
        
        # Trim input tokens from output
        generated_ids_trimmed = [
            out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids, strict=False)
        ]
        
        # Decode response
        output_text = self._processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]
        
        return output_text.strip()

    def query_batch(self, images: list, query: str, response_format=None, **kwargs) -> list[str]:
        """Query multiple images with the same question.
        
        Args:
            images: List of input images
            query: Question to ask about each image
            response_format: Optional structured output format (ignored for Qwen2-VL)
            **kwargs: Additional arguments
            
        Returns:
            List of responses, one per image
        """
        # Note: response_format is accepted but ignored
        print(f"[Qwen2VL] query_batch called with {len(images) if images else 0} images")
        
        if not images:
            print("[Qwen2VL] No images provided, returning empty list")
            return []
        
        # Process images one at a time to save VRAM instead of batching
        print(f"[Qwen2VL] Processing images sequentially to save VRAM")
        results = []
        for i, img in enumerate(images):
            try:
                print(f"[Qwen2VL] Processing image {i+1}/{len(images)}")
                response = self.query(img, query, response_format=response_format, **kwargs)
                results.append(response)
            except Exception as e:
                print(f"[Qwen2VL] Error processing image {i+1}: {e}")
                results.append("")
        
        print(f"[Qwen2VL] Completed processing {len(results)} images")
        return results

    def start(self) -> None:
        """Start the model with a warmup inference."""
        # Load model and processor
        _ = self._model
        _ = self._processor
        
        # Warmup with a dummy inference
        dummy_image = PILImage.new("RGB", (224, 224), color="gray")
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": dummy_image},
                    {"type": "text", "text": "Hello"},
                ],
            }
        ]
        
        text = self._processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = self._processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to(self.config.device)
        
        with torch.inference_mode():
            self._model.generate(**inputs, max_new_tokens=10)

    def stop(self) -> None:
        """Release model and processor, free GPU memory."""
        self._processor_instance = None
        self._model_instance = None
        
        # Clear CUDA cache if using GPU
        if self.config.device == "cuda":
            torch.cuda.empty_cache()
