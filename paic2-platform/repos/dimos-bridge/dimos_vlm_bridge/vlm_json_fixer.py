"""JSON repair utilities for small VLM models.

Small VLM models often generate incomplete or malformed JSON.
This module provides utilities to repair and complete JSON responses.
"""

import json
import re
from typing import Any


def repair_json_response(response: str, expected_schema: dict | None = None) -> str:
    """Attempt to repair incomplete or malformed JSON from VLM response.
    
    Args:
        response: Raw VLM response text
        expected_schema: Optional expected JSON schema to guide repair
        
    Returns:
        Repaired JSON string
    """
    # Remove markdown code blocks if present
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*$', '', response)
    response = response.strip()
    
    # Fix common placeholder values that VLMs copy from prompts
    # "confidence": 0.0-1.0 -> "confidence": 0.5
    response = re.sub(r'"confidence"\s*:\s*0\.0-1\.0', '"confidence": 0.5', response)
    response = re.sub(r'"confidence"\s*:\s*"0\.0-1\.0"', '"confidence": 0.5', response)
    
    # Fix placeholder type values
    # "type": "person|object|screen|text|location|other" -> "type": "other"
    response = re.sub(r'"type"\s*:\s*"person\|object\|screen\|text\|location\|other"', '"type": "other"', response)
    
    # Try to parse as-is first
    try:
        json.loads(response)
        return response  # Already valid
    except json.JSONDecodeError:
        pass
    
    # Common fixes for incomplete JSON
    
    # 1. Truncated in the middle of a string value
    # Look for incomplete string at the end like: "evidence": ["describe which frames show...
    if '...' in response[-50:]:
        # Find the last complete value before the truncation
        # Remove everything after the last properly closed value
        last_complete = max(
            response.rfind('"}'),
            response.rfind('"]'),
            response.rfind('},'),
            response.rfind('],')
        )
        if last_complete > 0:
            response = response[:last_complete+2]
    
    # 2. Fix missing ] before } (common Moondream error)
    # Pattern: "evidence": [ "item1", "item2" } should be "evidence": [ "item1", "item2" ] }
    # Find lines with [ followed by } without ] in between
    lines = response.split('\n')
    fixed_lines = []
    for i, line in enumerate(lines):
        # Check if this line closes an object but we have unclosed arrays
        if '}' in line and i > 0:
            # Count open/close brackets in previous context
            context = '\n'.join(lines[max(0, i-10):i+1])
            open_br = context.count('[')
            close_br = context.count(']')
            if open_br > close_br:
                # Need to close arrays before the }
                # Insert ] before the }
                line = line.replace('}', '] }', 1)
        fixed_lines.append(line)
    response = '\n'.join(fixed_lines)
    
    # 3. Remove trailing incomplete parts
    if response.rstrip().endswith((',', ':', '"', '[')):
        response = response.rstrip().rstrip(',:"[')
    
    # 4. Missing closing braces/brackets
    open_braces = response.count('{')
    close_braces = response.count('}')
    open_brackets = response.count('[')
    close_brackets = response.count(']')
    
    # Add missing closing characters
    if open_brackets > close_brackets:
        response += ']' * (open_brackets - close_brackets)
    if open_braces > close_braces:
        response += '}' * (open_braces - close_braces)
    
    # 4. Try to parse again
    try:
        json.loads(response)
        return response
    except json.JSONDecodeError as e:
        print(f"[JSONRepair] Still invalid after basic repairs: {e}")
        # Last resort: try to extract valid JSON prefix
        # Find the last valid closing brace
        for i in range(len(response) - 1, -1, -1):
            try:
                candidate = response[:i+1]
                json.loads(candidate)
                print(f"[JSONRepair] Found valid JSON at position {i}/{len(response)}")
                return candidate
            except json.JSONDecodeError:
                continue
        
        # If all else fails, return minimal valid JSON
        print(f"[JSONRepair] Could not repair, returning empty dict")
        return '{}'


def complete_temporal_memory_response(response: str) -> str:
    """Complete a partial TemporalMemory window analysis response.
    
    Handles common incomplete responses from small VLM models.
    
    Args:
        response: Partial or complete VLM response
        
    Returns:
        Complete JSON response with all required fields
    """
    # Try to repair JSON first
    repaired = repair_json_response(response)
    
    try:
        data = json.loads(repaired)
    except json.JSONDecodeError as e:
        print(f"[JSONRepair] Failed to parse even after repair: {e}")
        print(f"[JSONRepair] Repaired text was: {repaired[:200]}...")
        # Return minimal valid response
        return json.dumps({
            "window": {"start_s": 0.0, "end_s": 0.0},
            "caption": "Unable to parse VLM response",
            "entities_present": [],
            "new_entities": [],
            "relations": [],
            "on_screen_text": [],
            "uncertainties": ["VLM response parsing failed"],
            "confidence": 0.0
        })
    
    # Ensure all required fields are present
    required_fields = {
        "window": {"start_s": 0.0, "end_s": 0.0},
        "caption": "",
        "entities_present": [],
        "new_entities": [],
        "relations": [],
        "on_screen_text": [],
        "uncertainties": [],
        "confidence": 0.5
    }
    
    for field, default in required_fields.items():
        if field not in data:
            data[field] = default
    
    # Fix common field type errors
    
    # entities_present should be list of dicts with id and confidence
    if isinstance(data.get("entities_present"), list):
        fixed_entities = []
        for item in data["entities_present"]:
            if isinstance(item, dict) and "id" in item:
                # Ensure confidence is a float
                if "confidence" not in item:
                    item["confidence"] = 0.5
                elif not isinstance(item["confidence"], (int, float)):
                    item["confidence"] = 0.5
                fixed_entities.append(item)
            elif isinstance(item, str):
                # Convert string to proper entity format
                fixed_entities.append({"id": item, "confidence": 0.5})
        data["entities_present"] = fixed_entities
    
    # new_entities should be list of dicts with id, type, descriptor
    if isinstance(data.get("new_entities"), list):
        fixed_new = []
        for item in data["new_entities"]:
            if isinstance(item, dict) and "id" in item:
                # Ensure required fields
                if "type" not in item:
                    item["type"] = "other"
                if "descriptor" not in item:
                    item["descriptor"] = ""
                fixed_new.append(item)
        data["new_entities"] = fixed_new
    
    # relations should be list of dicts
    if isinstance(data.get("relations"), list):
        fixed_relations = []
        for item in data["relations"]:
            if isinstance(item, dict):
                # Ensure required fields
                if "type" not in item:
                    item["type"] = "other"
                if "subject" not in item:
                    item["subject"] = "unknown"
                if "object" not in item:
                    item["object"] = "unknown"
                if "confidence" not in item:
                    item["confidence"] = 0.5
                if "evidence" not in item:
                    item["evidence"] = []
                if "notes" not in item:
                    item["notes"] = ""
                fixed_relations.append(item)
        data["relations"] = fixed_relations
    
    # Ensure lists are actually lists
    for field in ["on_screen_text", "uncertainties"]:
        if not isinstance(data.get(field), list):
            data[field] = []
    
    # Ensure confidence is a float between 0 and 1
    if not isinstance(data.get("confidence"), (int, float)):
        data["confidence"] = 0.5
    else:
        data["confidence"] = max(0.0, min(1.0, float(data["confidence"])))
    
    return json.dumps(data, ensure_ascii=False)


class JSONRepairWrapper:
    """Wrapper for VLM models that repairs JSON responses."""
    
    def __init__(self, vlm_model):
        """Initialize wrapper with a VLM model.
        
        Args:
            vlm_model: VLM model instance (Moondream, SmolVLM, etc.)
        """
        self.vlm = vlm_model
        self._repair_enabled = True
    
    def query(self, image, query: str, **kwargs) -> str:
        """Query VLM and repair JSON response.
        
        Args:
            image: Input image
            query: Text query
            **kwargs: Additional arguments
            
        Returns:
            Repaired JSON response
        """
        response = self.vlm.query(image, query, **kwargs)
        
        if self._repair_enabled and "json" in query.lower():
            # Attempt to repair JSON response
            try:
                repaired = complete_temporal_memory_response(response)
                print(f"[JSONRepair] Repaired response (original length: {len(response)}, repaired: {len(repaired)})")
                return repaired
            except Exception as e:
                print(f"[JSONRepair] Repair failed: {e}, returning original")
                return response
        
        return response
    
    def query_batch(self, images: list, query: str, **kwargs) -> list[str]:
        """Query VLM batch and repair JSON responses.
        
        Args:
            images: List of images
            query: Text query
            **kwargs: Additional arguments
            
        Returns:
            List of repaired JSON responses
        """
        responses = self.vlm.query_batch(images, query, **kwargs)
        
        if self._repair_enabled and "json" in query.lower():
            repaired_responses = []
            for i, response in enumerate(responses):
                print(f"\n[JSONRepair] ===== Response {i+1}/{len(responses)} =====")
                print(f"[JSONRepair] ORIGINAL ({len(response)} chars):")
                print(f"[JSONRepair] {response[:500]}..." if len(response) > 500 else f"[JSONRepair] {response}")
                
                try:
                    repaired = complete_temporal_memory_response(response)
                    print(f"[JSONRepair] REPAIRED ({len(repaired)} chars):")
                    print(f"[JSONRepair] {repaired[:500]}..." if len(repaired) > 500 else f"[JSONRepair] {repaired}")
                    repaired_responses.append(repaired)
                except Exception as e:
                    print(f"[JSONRepair] Repair failed: {e}")
                    import traceback
                    traceback.print_exc()
                    repaired_responses.append(response)
                
                print(f"[JSONRepair] ===== End Response {i+1} =====\n")
            return repaired_responses
        
        return responses
    
    def start(self):
        """Start the underlying VLM model."""
        if hasattr(self.vlm, 'start'):
            self.vlm.start()
    
    def stop(self):
        """Stop the underlying VLM model."""
        if hasattr(self.vlm, 'stop'):
            self.vlm.stop()
    
    def __getattr__(self, name):
        """Forward other attributes to underlying VLM."""
        return getattr(self.vlm, name)
