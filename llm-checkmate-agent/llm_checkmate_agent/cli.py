
"""
CLI Module.
Main entrypoint for the LLM-Checkmate Agent command line tool.
"""

import sys
import logging
import argparse
from llm_checkmate_agent.scanner import scan_system
from llm_checkmate_agent.device_id import get_or_create_device_id
from llm_checkmate_agent.sender import send_data

def main():
    """Parses arguments and runs the respective command."""
    
    parser = argparse.ArgumentParser(description="LLM-Checkmate Hardware Scanner")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # 'scan' command
    scan_parser = subparsers.add_parser("scan", help="Scans hardware and sends report to backend")
    scan_parser.add_argument("--backend", default="http://localhost:3001", help="Backend API URL")
    
    # 'bench' command (Future Extension)
    bench_parser = subparsers.add_parser("bench", help="Run a quick inference benchmark (Not Implemented)")
    
    args = parser.parse_args()
    
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
    
    if args.command == "scan":
        run_scan(args.backend)
    elif args.command == "bench":
        print("Benchmarking mode coming soon...")
    else:
        parser.print_help()

def run_scan(backend_url):
    """
    Core function for the 'scan' command.
    1. Gets/Generates Device UUID
    2. Runs Hardware Diagnostics
    3. Prints clear privacy notice
    4. Sends payload to API
    """
    
    # 1. Identity
    device_uuid = get_or_create_device_id()
    print(f"✅ Device Identified: {device_uuid}")
    
    # 2. Scanning
    print("Running hardware diagnostics (this may take a few seconds)...")
    system_metrics = scan_system()
    
    # Verification Summary
    print("\n🔍 DETECTED SPECIFICATIONS:")
    print(f"   💻 CPU: {system_metrics['cpu']['brand']}")
    print(f"   ⚙️  Threads: {system_metrics['cpu']['logical_cores']} Logical Cores")
    print(f"   🧠 RAM: {system_metrics['ram']['total_gb']} GB")
    if system_metrics['gpu']:
        for g in system_metrics['gpu']:
            vram = g.get('vram_total_gb', 'Unified')
            print(f"   🎮 GPU: {g['name']} (VRAM: {vram} GB)")
    else:
        print("   🎮 GPU: No dedicated GPU detected.")
    print("--------------------------------------------------\n")
    
    # Assemble full payload
    payload = {
        "device_id": device_uuid,
        "metrics": system_metrics,
        "timestamp": "Now" # Can refine with datetime
    }
    
    # 3. Privacy notice
    print("--------------------------------------------------")
    print("NOTICE: Only hardware capability metrics (CPU/RAM/GPU/Disk Space)")
    print("are being collected to determine LLM compatibility.")
    print("NO personal files, browsing history, or private data is accessed.")
    print("--------------------------------------------------")
    
    # 4. Sending
    print(f"Sending report to backend at {backend_url}...")
    success, result = send_data(payload, backend_url)
    
    if success:
        print("\n" + "="*50)
        print("🎉 SUCCESS! Hardware profile updated.")
        
        # Construct clickable URL for the dashboard
        dashboard_url = backend_url.replace('/api/device/register', '').replace('/api', '')
        # Simple cleanup to get base URL
        base_url = backend_url.split('/api')[0]
        final_link = f"{base_url}/?deviceId={device_uuid}"
        
        print(f"🔗 VIEW YOUR REPORT HERE:")
        print(f"   {final_link}")
        print("="*50 + "\n")
    else:
        print(f"❌ Failed to reach server. Error: {result}")
        sys.exit(1)

if __name__ == "__main__":
    main()
