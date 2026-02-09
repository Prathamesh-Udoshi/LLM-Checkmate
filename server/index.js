import express from 'express';
import cors from 'cors';
import si from 'systeminformation';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Fallback database of popular LLMs
const FALLBACK_MODELS = [
    { id: 'meta-llama/Llama-3.1-8B', name: 'Llama 3.1 8B', params: 8, company: 'Meta' },
    { id: 'meta-llama/Llama-3.1-70B', name: 'Llama 3.1 70B', params: 70, company: 'Meta' },
    { id: 'mistralai/Mistral-7B-v0.3', name: 'Mistral 7B v0.3', params: 7, company: 'Mistral' },
    { id: 'google/gemma-2-9b', name: 'Gemma 2 9B', params: 9, company: 'Google' },
    { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini', params: 3.8, company: 'Microsoft' }
];

const POPULAR_TASKS = [
    { id: 'text-generation', label: 'Text Generation' },
    { id: 'summarization', label: 'Summarization' },
    { id: 'conversational', label: 'Conversational' },
    { id: 'text2text-generation', label: 'Text-to-Text' }
];

async function getRecentModels(task = 'text-generation', search = '') {
    try {
        let url = `https://huggingface.co/api/models?pipeline_tag=${task}&sort=downloads&direction=-1&limit=100`;
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }
        const response = await fetch(url);
        const models = await response.json();

        return models.map(m => {
            // Improved parameter estimation for encoder-decoder models
            let params = 7;
            const match = m.id.match(/(\d+\.?\d*)[bB]/);
            if (match) {
                params = parseFloat(match[1]);
            } else if (m.id.toLowerCase().includes('tiny')) {
                params = 1.1;
            } else if (m.id.toLowerCase().includes('base')) {
                params = 0.5; // BART/T5 base
            } else if (m.id.toLowerCase().includes('large')) {
                params = 1.5; // BART/T5 large
            }

            // Determine provider/company
            let provider = m.id.split('/')[0];
            if (provider.toLowerCase().includes('meta') || provider.toLowerCase().includes('facebook')) provider = 'Meta';
            if (provider.toLowerCase().includes('google')) provider = 'Google';
            if (provider.toLowerCase().includes('mistral')) provider = 'Mistral';
            if (provider.toLowerCase().includes('microsoft')) provider = 'Microsoft';
            if (provider.toLowerCase().includes('tiiuae')) provider = 'TII (Falcon)';

            return {
                id: m.id,
                name: m.id.split('/').pop(),
                params: params,
                company: provider,
                downloads: m.downloads,
                task: task,
                author: m.id.split('/')[0]
            };
        });
    } catch (e) {
        console.error("HF Fetch error:", e);
        return FALLBACK_MODELS.map(m => ({ ...m, task: 'text-generation' }));
    }
}

app.get('/api/tasks', (req, res) => {
    res.json(POPULAR_TASKS);
});

app.get('/api/system-info', async (req, res) => {
    try {
        const cpu = await si.cpu();
        const mem = await si.mem();
        const os = await si.osInfo();
        const gpu = await si.graphics();

        const info = {
            cpu: {
                brand: cpu.brand,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
                architecture: os.arch
            },
            ram: {
                total: mem.total,
                baseGB: Math.round(mem.total / (1024 ** 3))
            },
            os: {
                platform: os.platform,
                distro: os.distro,
                release: os.release
            },
            gpu: gpu.controllers.map(g => ({
                model: g.model,
                vram: g.vram,
                vramGB: g.vram ? Math.round(g.vram / 1024) : 0,
                vendor: g.vendor
            }))
        };
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/recommendations', async (req, res) => {
    try {
        const task = req.query.task || 'text-generation';
        const search = req.query.search || '';
        const models = await getRecentModels(task, search);
        const mem = await si.mem();
        const gpuData = await si.graphics();
        const os = await si.osInfo();

        const systemSpecs = {
            ramGB: mem.total / (1024 ** 3),
            vramGB: gpuData.controllers.reduce((acc, curr) => acc + (curr.vram || 0), 0) / 1024,
            isEntryGPU: gpuData.controllers.some(g => g.model.toLowerCase().includes('intel') || g.model.toLowerCase().includes('graphics')),
            vendor: gpuData.controllers[0]?.vendor || 'Unknown',
            platform: os.platform
        };

        const recommendations = models.map(model => {
            // Memory Math (Expert Tier)
            const weights4bit = model.params * 0.7; // Standard GGUF/AWQ 4-bit
            const weights8bit = model.params * 1.1;
            const weights16bit = model.params * 2.1;

            // KV Cache / Context Window Buffer (assuming 4096 context)
            const contextBuffer = 1.5; // ~1.5GB buffer for standard context

            let status = 'Not Feasible Locally';
            let reasoning = '';
            let strategy = '';
            let fineTuning = 'Not Possible';

            // 1. INFERENCE LOGIC (The "Suggested Stack")
            if (systemSpecs.vramGB >= (weights16bit + contextBuffer)) {
                status = 'Runnable Locally';
                reasoning = `${model.params}B fits comfortably in high precision on your GPU.`;
                strategy = systemSpecs.vendor.includes('NVIDIA') ? 'vLLM / Hugging Face Transformers' : 'Ollama / MLX';
            }
            else if (systemSpecs.vramGB >= (weights4bit + contextBuffer)) {
                status = 'Runnable Locally';
                reasoning = `Fits in VRAM at 4-bit. High speed inference possible.`;
                strategy = systemSpecs.vendor.includes('NVIDIA') ? 'Ollama (AWQ) / LM Studio' : 'Ollama / Llama.cpp';
            }
            else if (systemSpecs.ramGB >= (weights4bit + contextBuffer + 4)) {
                status = 'Runnable with Quantization';
                reasoning = `Too big for your GPU, but fits in your ${systemSpecs.ramGB.toFixed(0)}GB RAM.`;
                strategy = 'Llama.cpp (GGUF) / Ollama';
                if (systemSpecs.isEntryGPU) reasoning += " (CPU Inference mode)";
            }
            else {
                status = 'Not Feasible Locally';
                reasoning = `Weight size (${weights4bit.toFixed(1)}GB) exceeds total system memory.`;
                strategy = 'Google Colab / RunPod / Lambda Labs';
            }

            // 2. FINE-TUNING LOGIC
            // QLoRA needs: weights + gradients + optimizer states + activations
            const qloraMinimumVRAM = weights4bit + (model.params * 0.5) + 2;
            if (systemSpecs.vramGB >= qloraMinimumVRAM) {
                fineTuning = 'Possible with QLoRA/Unsloth';
                if (systemSpecs.vramGB >= weights16bit + 8) fineTuning = 'Full Fine-Tuning Possible';
            } else if (systemSpecs.ramGB >= qloraMinimumVRAM + 4 && systemSpecs.platform === 'darwin') {
                fineTuning = 'Possible via Apple Unified Memory';
            } else {
                fineTuning = 'Not Possible (Insufficient VRAM)';
            }

            return {
                ...model,
                status,
                reasoning,
                strategy,
                fineTuning,
                requirements: { fp16: weights16bit, int8: weights8bit, int4: weights4bit }
            };
        });

        res.json(recommendations);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
