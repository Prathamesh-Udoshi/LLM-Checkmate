# LLM-Checkmate ♟️

**LLM-Checkmate** is a high-performance educational discovery engine for Large Language Models. It allows you to analyze your hardware silicon and instantly discover which trending models from the Hugging Face Hub you can run locally.

## 🔥 Key Features

- **🧠 AI-Powered Spec Parsing**: Uses GPT-4o-mini or Gemma-2 to intelligently extract hardware details from messy system settings text. No more manual entry.
- **📈 Neural Performance Scoring**: Advanced multi-factor heuristics that predict Tokens-Per-Second (TPS) based on memory bandwidth, vendor optimizations (NVIDIA CUDA/Apple Unified Memory), and context window size.
- **🛡️ Native Context Limit Guard**: Visual warnings when a requested context window exceeds the architectural limits of a model.
- **🚀 Discovery Hub**: A streamlined 3-step workflow (Auto-Scan, Smart Paste, or Manual Triage) to define your hardware profile.
- **⚙️ Expert Recommendation Engine**: Tailored inference strategies (GGUF, AWQ, EXL2) based on your specific GPU/VRAM configuration.
- **🎯 5-Tier Confidence System**: Precise compatibility scoring: *Native Performance, Optimized Local, Hybrid Offload, Experimental,* or *Cloud Only*.
- **📊 1:1 Precision**: Full floating-point support for ultra-accurate hardware mapping (e.g., 3.9GB VRAM detection).

## 🛠️ Tech Stack

- **Frontend**: React.js, Vite, Lucide Icons, Vanilla CSS (Premium Aethetics)
- **Backend**: Node.js, Express, `systeminformation`, `dotenv`
- **Inference Brain**: Hugging Face Hub API + OpenAI Compatibility Router
- **Data Source**: Live Hugging Face Registry

## 🏁 Getting Started

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/Prathamesh-Udoshi/LLM-Checkmate.git
cd LLM-Checkmate

# Install dependencies
cd server && npm install
cd ../client && npm install
```

### 2. Configuration (For AI Features)
Create a `.env` file in the `server` directory:
```env
# Optional: For AI Spec Parsing
OPENAI_API_KEY=your_key_here
# or
HF_TOKEN=your_token_here
```

### 3. Running the App
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
cd client && npm run dev
```

## 🧠 Expert Logic
The application utilizes a **Neural Analytical Engine** to calculate:
- **Precise Weights**: Parameter count × Precision (e.g., 4-bit vs 8-bit).
- **KV Cache Overhead**: Memory specifically designated for context length per model family.
- **Hardware Tiering**: Different multipliers for dedicated VRAM bandwidth vs Shared System RAM bottlenecks.

---
Built with Precision for the AI Community.
