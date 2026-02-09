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
        const gpu = await si.graphics();

        const systemSpecs = {
            ramGB: mem.total / (1024 ** 3),
            vramGB: gpu.controllers.reduce((acc, curr) => acc + (curr.vram || 0), 0) / 1024,
            hasGPU: gpu.controllers.length > 0 && gpu.controllers.some(g => (g.vram || 0) > 0)
        };

        const recommendations = models.map(model => {
            const sizeFP16 = model.params * 2;
            const size8bit = model.params * 1.25;
            const size4bit = model.params * 0.75;

            let status = 'Not Feasible Locally';
            let reasoning = '';
            let strategy = '';

            if (systemSpecs.vramGB >= sizeFP16) {
                status = 'Runnable Locally';
                reasoning = `${systemSpecs.vramGB.toFixed(1)}GB VRAM fits this ${model.params}B model in high precision.`;
                strategy = 'Use FP16/BF16 for maximum accuracy.';
            } else if (systemSpecs.vramGB >= size8bit) {
                status = 'Runnable Locally';
                reasoning = `Sufficient VRAM for 8-bit quantization.`;
                strategy = 'Use bitsandbytes INT8 or GPTQ.';
            } else if (systemSpecs.vramGB >= size4bit) {
                status = 'Runnable with Quantization (4-bit)';
                reasoning = `Fits in VRAM using 4-bit quantization.`;
                strategy = 'Use 4-bit AWQ or AutoGPTQ.';
            } else if (systemSpecs.ramGB >= size4bit + 4) {
                status = 'Runnable with Quantization (4-bit)';
                reasoning = `Requires system RAM offloading (GGUF). Performance will be slow.`;
                strategy = 'Use Llama.cpp (GGUF) with CPU offloading.';
            } else {
                status = 'Not Feasible Locally';
                reasoning = `Memory requirements exceeded (${size4bit.toFixed(1)}GB min vs ${systemSpecs.ramGB.toFixed(1)}GB total).`;
                strategy = 'Recommend Cloud GPU (Lambda Labs/RunPod) or Google Colab.';
            }

            let fineTuning = 'Not Possible';
            if (systemSpecs.vramGB >= size4bit + 6) fineTuning = 'Possible with QLoRA';
            if (systemSpecs.vramGB >= sizeFP16 + 12) fineTuning = 'Possible with LoRA / Full';

            return {
                ...model,
                status,
                reasoning,
                strategy,
                fineTuning,
                requirements: { fp16: sizeFP16, int8: size8bit, int4: size4bit }
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
