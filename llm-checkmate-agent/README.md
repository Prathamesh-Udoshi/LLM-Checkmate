
# LLM-Checkmate Agent

This is the local hardware scanner for the **LLM-Checkmate** application. It securely analyzes your system capabilities (CPU, RAM, GPU, VRAM) to determine which Large Language Models you can run locally.

## Features
- **Cross-Platform**: Works on Windows, Linux, and macOS.
- **Privacy-First**: Only collects hardware metrics. No personal files are accessed.
- **Persistent Identity**: Uses a locally stored UUID to recognize your device across sessions.
- **Secure Transmission**: Sends data directly to your local LLM-Checkmate backend (or configured remote API).

## Installation

You can install the agent directly from the source code:

1.  **Ensure Python 3.8+ is installed.**
2.  Navigate to this directory:
    ```bash
    cd llm-checkmate-agent
    ```
3.  Install in editable mode:
    ```bash
    pip install -e .
    ```

## Usage

Once installed, the `llm-checkmate` command is available globally in your terminal.

### 1. Run a Scan
Collects hardware info and sends it to the backend:

```bash
llm-checkmate scan
```

### 2. View Help
See all available commands:

```bash
llm-checkmate --help
```

## Troubleshooting
- **Permission Denied**: On Linux/macOS, you might need `sudo` to access certain hardware metrics (though usually not required).
- **Backend Error**: Ensure your LLM-Checkmate server is running on `localhost:3001` (or update `sender.py` if deployed remotely).
