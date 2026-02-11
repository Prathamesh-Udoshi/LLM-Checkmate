
"""
Device Identity Module.
Generates a persistent UUID to uniquely identify this machine across runs.
Stores the ID in user's home directory under .llm_checkmate/device.json
"""

import uuid
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".llm_checkmate")
DEVICE_FILE = os.path.join(CONFIG_DIR, "device.json")

def _ensure_dir():
    """Ensures config directory exists."""
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR)

def get_or_create_device_id():
    """
    Returns the existing UUID for this device, or generates a new one.
    """
    _ensure_dir()
    
    if os.path.exists(DEVICE_FILE):
        try:
            with open(DEVICE_FILE, "r") as f:
                data = json.load(f)
                if "device_id" in data:
                    return data["device_id"]
        except Exception as e:
            logger.warning(f"Corrupt device file found, regenerating ID. Error: {e}")
            
    # Generate new ID if file missing or corrupt
    new_id = str(uuid.uuid4())
    try:
        with open(DEVICE_FILE, "w") as f:
            json.dump({"device_id": new_id, "created_at": str(datetime.now())}, f) # datetime missing import, fix below
    except Exception as e:
         logger.error(f"Failed to persist device ID: {e}")
         return new_id # Return anyway for this session
         
    return new_id

if __name__ == "__main__":
    from datetime import datetime
    print(f"Device ID: {get_or_create_device_id()}")
