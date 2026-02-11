
"""
Hardware Scanner module for LLM-Checkmate Agent.
Safely collects CPU, RAM, and GPU info using cross-platform libraries.
"""

import platform
import psutil
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_cpu_info():
    """Collects CPU details with exact brand name detection on Windows."""
    try:
        brand = platform.processor()
        if platform.system() == "Windows":
            try:
                import subprocess
                # This specific command returns the "Friendly Name" e.g., 11th Gen Intel(R) Core(TM) i3...
                output = subprocess.check_output("wmic cpu get name", shell=True).decode()
                # The output is usually "Name\n<CPU Name>\n"
                lines = [l.strip() for l in output.split('\n') if l.strip()]
                if len(lines) > 1:
                    brand = lines[1]
            except Exception as e:
                logger.warning(f"Could not get detailed CPU name via WMIC: {e}")
                pass # Fallback to platform.processor()

        info = {
            "brand": brand,
            "architecture": platform.machine(),
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "frequency_max": psutil.cpu_freq().max if psutil.cpu_freq() else 0,
            "usage_percent": psutil.cpu_percent(interval=1)
        }
        return info
    except Exception as e:
        logger.error(f"Error fetching CPU info: {e}")
        return {}

def get_ram_info():
    """Collects System RAM details."""
    try:
        mem = psutil.virtual_memory()
        return {
            "total_gb": round(mem.total / (1024 ** 3), 2),
            "available_gb": round(mem.available / (1024 ** 3), 2),
            "percent_used": mem.percent
        }
    except Exception as e:
        logger.error(f"Error fetching RAM info: {e}")
        return {}

def get_disk_info():
    """Collects Disk space details."""
    try:
        disk = psutil.disk_usage('/')
        return {
            "total_gb": round(disk.total / (1024 ** 3), 2),
            "free_gb": round(disk.free / (1024 ** 3), 2),
            "percent_used": disk.percent
        }
    except Exception as e:
        logger.error(f"Error fetching Disk info: {e}")
        return {}

def get_gpu_info():
    """
    Collects GPU details using GPUtil, Torch, and Windows WMIC fallback.
    """
    gpus = []
    
    # 1. NVIDIA Check (GPUtil)
    try:
        import GPUtil
        devices = GPUtil.getGPUs()
        for device in devices:
            gpus.append({
                "name": device.name,
                "vram_total_gb": round(device.memoryTotal / 1024, 2),
                "vram_free_gb": round(device.memoryFree / 1024, 2),
                "source": "gputil"
            })
    except:
        pass

    # 2. PyTorch Fallback
    if not gpus:
        try:
            import torch
            if torch.cuda.is_available():
                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    gpus.append({
                        "name": props.name,
                        "vram_total_gb": round(props.total_memory / (1024**3), 2),
                        "source": "torch"
                    })
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                 gpus.append({
                    "name": "Apple Unified Memory (MPS)",
                    "vram_total_gb": 0, # Shared
                    "source": "torch-mps"
                })
        except:
            pass

    # 3. Windows WMIC Fallback (For Intel/AMD/Integrated)
    if not gpus and platform.system() == "Windows":
        try:
            import subprocess
            cmd = "wmic path win32_VideoController get name,AdapterRAM"
            output = subprocess.check_output(cmd, shell=True).decode()
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            for line in lines[1:]: # Skip header
                # Handle cases where AdapterRAM might be missing/huge negative
                parts = line.split('  ')
                name = parts[-1].strip()
                vram_bytes = 0
                try: vram_bytes = int(parts[0].strip())
                except: pass
                
                vram_gb = round(abs(vram_bytes) / (1024**3), 2)
                if vram_gb < 0.1: vram_gb = 0 # Assume integrated
                
                gpus.append({
                    "name": name,
                    "vram_total_gb": vram_gb,
                    "source": "wmic"
                })
        except:
            pass

    return gpus

def scan_system():
    """Aggregates all system info into a clean JSON structure."""
    print("running system scan... (we only access hardware capability metrics)")
    
    data = {
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version()
        },
        "cpu": get_cpu_info(),
        "ram": get_ram_info(),
        "storage": get_disk_info(),
        "gpu": get_gpu_info()
    }
    
    return data

if __name__ == "__main__":
    # Test run
    print(json.dumps(scan_system(), indent=2))
