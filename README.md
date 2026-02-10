# LLM-Checkmate ♟️

**LLM-Checkmate** is a high-performance local hardware analyzer and educational discovery engine for Large Language Models. It maps your machine's exact boundaries (CPU, RAM, VRAM) to the trending model registry on Hugging Face.

## 🚀 Features

- **Hardware Extraction**: Real-time analysis of your OS, CPU architecture, and GPU VRAM.
- **Expert Recommendation Engine**: Custom inference strategies (GGUF, AWQ, vLLM) based on your hardware vendor.
- **5-Tier Confidence System**: Precise compatibility scoring (Native, Optimized, Hybrid, Experimental, Cloud Only).
- **Network Resilience**: Automatic retries and smart DNS fallback for reliable Hugging Face API access.
- **Educational Glossary**: Deep-dives into Quantization, LoRA, KV Caching, and Unified Memory.
- **Registry Discovery**: Fetch top-100 models per category directly from the Hugging Face Hub.
- **Local Deployment Guard**: Mathematical validation for inference and fine-tuning (QLoRA) feasibility.

## 🛠️ Tech Stack

- **Frontend**: React.js, Vite, Lucide Icons
- **Backend**: Node.js, Express, `systeminformation`
- **Data Source**: Hugging Face Hub API

## 🏁 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Git

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/LLM-Checkmate.git
cd LLM-Checkmate

# Install dependencies for both parts
cd server && npm install
cd ../client && npm install
```

### 3. Running the App
```bash
# In one terminal start the backend
cd server
npm run dev

# In another terminal start the frontend
cd client
npm run dev
```

## 🧠 Expert Logic
The application uses a heuristic-based engine to calculate:
- **Weights**: Parameter count × Precision bits.
- **KV Cache**: Buffer specifically designated for context length.
- **Training Overhead**: Estimated gradients + optimizer states for fine-tuning checks.

---
Built with Precision for the AI Community.
