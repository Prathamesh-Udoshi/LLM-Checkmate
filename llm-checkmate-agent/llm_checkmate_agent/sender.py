
"""
Data Transmission Module.
Formats the gathered system hardware info and sends it securely to the backend API.
"""

import requests
import json
import logging

logger = logging.getLogger(__name__)

def send_data(report_data, api_url):
    """
    Sends the hardware report payload to the backend.
    """
    # Ensure Endpoint is correct for the registration API if only base URL provided
    if not api_url.endswith('/api/device/register'):
        api_url = api_url.rstrip('/') + '/api/device/register'

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "LLM-Checkmate-Agent/1.0"
    }
    
    try:
        response = requests.post(api_url, json=report_data, headers=headers, timeout=10)
        response.raise_for_status()
        
        logger.info(f"Successfully sent hardware report. Status code: {response.status_code}")
        return True, response.json()
        
    except requests.exceptions.Timeout:
        logger.error("Request timed out. Is the backend server running?")
        return False, "Timeout"
    except requests.exceptions.ConnectionError:
        logger.error("Connection failed. Is the backend reachable?")
        return False, "Connection Error"
    except requests.exceptions.HTTPError as err:
        logger.error(f"HTTP Error: {err}")
        return False, f"HTTP Error: {err}"
    except Exception as e:
        logger.critical(f"Unexpected error while sending data: {e}")
        return False, str(e)

if __name__ == "__main__":
    # Test send with dummy data
    test_payload = {"device_id": "test-uuid", "cpu": {"brand": "Test CPU"}}
    success, msg = send_data(test_payload)
    print(f"Test result: {success} - {msg}")
