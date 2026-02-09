# LLM Checker - Hardware Compatibility Analyzer

A full-stack web application that intelligently analyzes your local machine resources and determines which Large Language Models (LLMs) can be run locally.

## Features

- **Hardware Analysis**: Deep scan of CPU (architecture, cores), RAM (total capacity), and GPU (model, VRAM, vendor).
- **Intelligent Classification**: Models are classified as:
  - **Runnable Locally**: Runs at full precision or high bits.
  - **Runnable with Quantization**: Requires 4-bit or 8-bit quantization.
  - **Not Feasible**: Memory requirements exceed local hardware.
- **Actionable Recommendations**: Insight into quantization strategies (GGUF, AWQ, GPTQ) and fine-tuning feasibility (LoRA, QLoRA).
- **Dynamic Model Database**: Fetches trending models directly from the Hugging Face Hub API.
- **Premium UI**: Modern dashboard with glassmorphism, dark mode, and real-time analysis.

## Tech Stack

- **Frontend**: React, Vite, Lucide Icons, Vanilla CSS (Premium design).
- **Backend**: Node.js, Express, `systeminformation`.
- **API**: Hugging Face Hub API integration.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Local machine with CPU/GPU information available.

### Installation

1. **Clone and Setup Server**:
   ```bash
   cd server
   npm install
   ```

2. **Setup Client**:
   ```bash
   cd client
   npm install
   ```

### Running the App

1. **Start Backend**:
   ```bash
   cd server
   npm run dev
   ```

2. **Start Frontend**:
   ```bash
   cd client
   npm run dev
   ```

3. Open your browser at `http://localhost:5173`.

## Architecture

The system uses `systeminformation` on the backend to probe hardware specs. This data is then matched against model metadata (parameter count) to calculate memory requirements.
- **FP16**: 2 bytes per parameter.
- **8-bit**: ~1.25 bytes per parameter.
- **4-bit**: ~0.75-0.8 bytes per parameter.

The app also considers system overhead (OS etc.) to provide realistic "Not Feasible" warnings.
