"""Local SmolVLM implementation for ROS2 bridge.

SmolVLM is a small, efficient vision-language model from HuggingFace.
Uses only ~3-4GB VRAM and is fast while maintaining good quality.
"""

from dataclasses import dataclass
from typing import Any
import warnings

import numpy as np
from PIL import Image as PILImage
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq  # type: ignore[import-untyped]

try:
    from dimos.msgs.sensor_msgs import Image
except ImportError:
    Image = None  # type: ignore


@dataclass
class SmolVLMConfig:
    """Configuration for local SmolVLM model."""
    
    model_name: str = "HuggingFaceTB/SmolVLM-Instruct"
    dtype: torch.dtype = torch.bfloat16
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    auto_resize: tuple[int, int] | None = (384, 384)  # SmolVLM works well with smaller images
    max_new_tokens: int = 512
    trust_remote_code: bool = True


class SmolVLMLocalModel:
    """Local SmolVLM vision-language model.
    
    SmolVLM is a compact, efficient VLM that uses only ~3-4GB VRAM.
    Good balance between size, speed, and quality.
    
    Example:
        ```python
        model = SmolVLMLocalModel()
        model.start()
        
        response = model.query(image, "What objects are in this image?")
        print(response)
        ```
    """

    def __init__(self, model_name: str = "HuggingFaceTB/SmolVLM-Instruct", **kwargs):
        """Initialize SmolVLM model.
        
        Args:
            model_name: HuggingFace model name
            **kwargs: Additional config options
        """
        self.config = SmolVLMConfig(model_name=model_name)
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        
        self._model_instance = None
        self._processor_instance = None

    @property
    def _model(self) -> AutoModelForVision2Seq:
        """Load SmolVLM model."""
        if self._model_instance is None:
            print(f"[SmolVLM] Loading model {self.config.model_name}...")
            self._model_instance = AutoModelForVision2Seq.from_pretrained(
                self.config.model_name,
                trust_remote_code=self.config.trust_remote_code,
                torch_dtype=self.config.dtype,
            ).to(self.config.device)
            self._model_instance.eval()
            print(f"[SmolVLM] Model loaded on {self.config.device}")
        return self._model_instance

    @property
    def _processor(self) -> AutoProcessor:
        """Load SmolVLM processor."""
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
        
        # Prepare messages in chat format
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": query}
                ]
            }
        ]
        
        # Apply chat template
        prompt = self._processor.apply_chat_template(messages, add_generation_prompt=True)
        
        # Prepare inputs
        inputs = self._processor(
            text=prompt,
            images=[pil_image],
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
        
        # Decode response (trim prompt)
        generated_text = self._processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]
        
        # Extract just the assistant's response (after the prompt)
        # SmolVLM includes the full conversation in output
        if "Assistant:" in generated_text:
            response = generated_text.split("Assistant:")[-1].strip()
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
        print(f"[SmolVLM] query_batch called with {len(images) if images else 0} images")
        
        if not images:
            print("[SmolVLM] No images provided, returning empty list")
            return []
        
        # Process images one at a time to save VRAM
        print(f"[SmolVLM] Processing images sequentially")
        results = []
        for i, img in enumerate(images):
            try:
                print(f"[SmolVLM] Processing image {i+1}/{len(images)}")
                response = self.query(img, query, response_format=response_format, **kwargs)
                results.append(response)
                
                # Clear CUDA cache between images
                if self.config.device == "cuda":
                    torch.cuda.empty_cache()
                    
            except Exception as e:
                print(f"[SmolVLM] Error processing image {i+1}: {e}")
                import traceback
                traceback.print_exc()
                results.append("")
        
        print(f"[SmolVLM] Completed processing {len(results)} images")
        return results

    def start(self) -> None:
        """Start the model with a warmup inference."""
        print("[SmolVLM] Starting model...")
        # Load model and processor
        _ = self._model
        _ = self._processor
        
        # Warmup with a dummy inference
        dummy_image = PILImage.new("RGB", (224, 224), color="gray")
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": "Hello"}
                ]
            }
        ]
        
        prompt = self._processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self._processor(text=prompt, images=[dummy_image], return_tensors="pt")
        inputs = {k: v.to(self.config.device) for k, v in inputs.items()}
        
        with torch.inference_mode():
            self._model.generate(**inputs, max_new_tokens=10)
        
        print("[SmolVLM] Model ready")

    def stop(self) -> None:
        """Release model and processor, free GPU memory."""
        print("[SmolVLM] Stopping model...")
        self._processor_instance = None
        self._model_instance = None
        
        # Clear CUDA cache if using GPU
        if self.config.device == "cuda":
            torch.cuda.empty_cache()
        
        print("[SmolVLM] Model stopped")
