#!/usr/bin/env python3
"""
NVIDIA Cosmos Reason 2 VLM wrapper using OpenAI-compatible API.

This module provides a wrapper for NVIDIA Cosmos Reason 2 model
that can be accessed through an OpenAI-compatible API endpoint.
"""

import os
import json
import base64
import requests
from io import BytesIO
import numpy as np
from PIL import Image as PILImage


class CosmosReason2VlModel:
    """
    Wrapper for NVIDIA Cosmos Reason 2 VLM using OpenAI-compatible API.
    
    This model is specialized for object detection and bounding box prediction.
    """
    
    def __init__(self, api_url, api_key=None, model_name='nvidia/cosmos-reason-2', timeout=60, use_reasoning=False):
        """
        Initialize Cosmos Reason 2 VLM.
        
        Args:
            api_url: Base URL for the OpenAI-compatible API endpoint
            api_key: Optional API key for authentication
            model_name: Model identifier (default: nvidia/cosmos-reason-2)
            timeout: Request timeout in seconds
            use_reasoning: Enable <think> reasoning mode (good for complex detection, skip for simple tasks)
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key or os.getenv('COSMOS_API_KEY', '')
        self.model_name = model_name
        self.timeout = timeout
        self.use_reasoning = use_reasoning
        
        if not self.api_url:
            raise ValueError("api_url must be provided for Cosmos Reason 2")
        
        print(f"[CosmosReason2] Initialized with API URL: {self.api_url}")
        print(f"[CosmosReason2] Model: {self.model_name}")
        print(f"[CosmosReason2] Reasoning mode: {'enabled' if use_reasoning else 'disabled'}")
    
    def _encode_image(self, image):
        """
        Encode image to base64 string.
        
        Args:
            image: numpy array (BGR or RGB) or PIL Image
            
        Returns:
            base64 encoded string
        """
        if isinstance(image, np.ndarray):
            if image.shape[2] == 3 and image.dtype == np.uint8:
                pil_image = PILImage.fromarray(image[:, :, ::-1])
            else:
                pil_image = PILImage.fromarray(image)
        elif isinstance(image, PILImage.Image):
            pil_image = image
        else:
            raise ValueError(f"Unsupported image type: {type(image)}")
        
        buffered = BytesIO()
        pil_image.save(buffered, format="JPEG", quality=95)
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return img_str
    
    def query(self, image, prompt, max_tokens=2000, use_reasoning=None):
        """
        Query the Cosmos Reason 2 model with an image and prompt.
        
        Args:
            image: Input image (numpy array or PIL Image)
            prompt: Text prompt for the model
            max_tokens: Maximum tokens in response
            use_reasoning: Override instance reasoning setting for this query
            
        Returns:
            Model response as string (JSON format expected for object detection)
        """
        try:
            image_b64 = self._encode_image(image)
            
            headers = {
                'Content-Type': 'application/json',
            }
            
            if self.api_key:
                headers['Authorization'] = f'Bearer {self.api_key}'
            
            reasoning_enabled = use_reasoning if use_reasoning is not None else self.use_reasoning
            
            if reasoning_enabled:
                prompt_with_reasoning = f"""{prompt}

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag."""
            else:
                prompt_with_reasoning = prompt
            
            payload = {
                'model': self.model_name,
                'messages': [
                    {
                        'role': 'system',
                        'content': [{'type': 'text', 'text': 'You are a helpful assistant that returns valid JSON.'}]
                    },
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/jpeg;base64,{image_b64}'
                                }
                            },
                            {
                                'type': 'text',
                                'text': prompt_with_reasoning
                            }
                        ]
                    }
                ],
                'max_tokens': max_tokens,
                'temperature': 0.7 if not reasoning_enabled else 0.6,
                'top_p': 0.8 if not reasoning_enabled else 0.95,
                'top_k': 20,
                'presence_penalty': 1.5 if not reasoning_enabled else 0.0,
                'response_format': {'type': 'json_object'}
            }
            
            endpoint = f"{self.api_url}/v1/chat/completions"
            
            print(f"[CosmosReason2] Sending request to {endpoint}")
            
            response = requests.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=self.timeout
            )
            
            response.raise_for_status()
            
            result = response.json()
            
            if 'choices' in result and len(result['choices']) > 0:
                message = result['choices'][0]['message']
                
                reasoning_content = message.get('reasoning_content', '')
                content = message.get('content', '')
                
                if reasoning_content:
                    print(f"[CosmosReason2] Reasoning: {len(reasoning_content)} chars")
                    print(f"[CosmosReason2] Reasoning text: {reasoning_content[:200]}...")
                    print(f"[CosmosReason2] Answer: {len(content)} chars")
                    print(f"[CosmosReason2] Answer text: {content[:500]}...")
                    return content
                else:
                    content = self._extract_answer(content)
                    print(f"[CosmosReason2] Response received: {len(content)} chars")
                    print(f"[CosmosReason2] Full response: {content[:1000]}")
                    if len(content) > 1000:
                        print(f"[CosmosReason2] ... (truncated, total {len(content)} chars)")
                    return content
            else:
                print(f"[CosmosReason2] Unexpected response format: {result}")
                return json.dumps([])
                
        except requests.exceptions.Timeout:
            print(f"[CosmosReason2] Request timeout after {self.timeout}s")
            return json.dumps([])
        except requests.exceptions.RequestException as e:
            print(f"[CosmosReason2] Request error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[CosmosReason2] Response status: {e.response.status_code}")
                print(f"[CosmosReason2] Response body: {e.response.text}")
            return json.dumps([])
        except Exception as e:
            print(f"[CosmosReason2] Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            return json.dumps([])
    
    def _extract_answer(self, response: str) -> str:
        """
        Extract final answer from response, handling reasoning tags.
        
        Args:
            response: Raw model response
            
        Returns:
            Extracted answer (after </think> tag if present, or full response)
        """
        if '</think>' in response:
            return response.split('</think>')[-1].strip()
        if response.startswith('<think>'):
            return response
        return response
    
    def detect_objects(self, image, use_reasoning=False):
        """
        Detect objects in the image with bounding boxes.
        
        This is a convenience method that uses a specialized prompt
        for object detection with Cosmos Reason 2.
        
        Args:
            image: Input image (numpy array or PIL Image)
            use_reasoning: Enable reasoning mode for this detection (default: False)
                          Note: Reasoning helps with complex scenes but not recommended
                          for simple object detection per NVIDIA guidelines.
            
        Returns:
            JSON string with detected objects and bounding boxes
        """
        prompt = """Detect all objects in this image and return them as a JSON array.

For each object, provide:
- name: object type (e.g., "chair", "table", "person")
- bbox: bounding box as [x_min, y_min, x_max, y_max] in pixels
- description: brief description (1-2 words)
- confidence: detection confidence (0.0 to 1.0)

CRITICAL: Return ONLY a JSON array starting with [ and ending with ]. Do NOT wrap it in an object with "objects" key.

Correct format:
[{"name": "shelf", "bbox": [120, 45, 580, 420], "description": "metal shelf", "confidence": 0.92}]

WRONG format (do not use):
{"objects": [...]}"""
        
        max_tokens = 1200 if use_reasoning else 800
        return self.query(image, prompt, max_tokens=max_tokens, use_reasoning=use_reasoning)
    
    def __repr__(self):
        return f"CosmosReason2VlModel(api_url='{self.api_url}', model='{self.model_name}')"


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python cosmos_reason2.py <api_url> <image_path>")
        print("Example: python cosmos_reason2.py http://localhost:8000 test.jpg")
        sys.exit(1)
    
    api_url = sys.argv[1]
    image_path = sys.argv[2]
    
    print(f"Testing Cosmos Reason 2 with:")
    print(f"  API URL: {api_url}")
    print(f"  Image: {image_path}")
    
    model = CosmosReason2VlModel(api_url=api_url)
    
    image = PILImage.open(image_path)
    image_np = np.array(image)
    
    print("\nDetecting objects...")
    result = model.detect_objects(image_np)
    
    print("\nResult:")
    print(result)
    
    try:
        detections = json.loads(result)
        print(f"\nFound {len(detections)} objects:")
        for det in detections:
            print(f"  - {det.get('name', 'unknown')}: {det.get('bbox', [])}")
    except json.JSONDecodeError:
        print("Response is not valid JSON")
