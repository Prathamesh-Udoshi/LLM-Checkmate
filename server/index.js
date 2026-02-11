import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React app (Production Only)
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

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
    { id: 'text2text-generation', label: 'Text-to-Text' },
    { id: 'translation', label: 'Translation' },
    { id: 'question-answering', label: 'Question Answering' },
    { id: 'feature-extraction', label: 'Embeddings (Feature Extraction)' },
    { id: 'sentence-similarity', label: 'Sentence Similarity' },
    { id: 'image-to-text', label: 'Vision-Language (Image-to-Text)' }
];

// Robust fetch with retry logic
const fetchWithRetry = async (url, options = {}, retries = 3) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            // Header to pretend we are a browser to avoid some bot blocks
            headers: { 'User-Agent': 'LLM-Checkmate/1.0' }
        });

        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return response;
    } catch (error) {
        if (retries > 0) {
            console.warn(`Fetch failed, retrying... (${retries} left). Reason: ${error.message}`);
            await new Promise(res => setTimeout(res, 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
};

async function getRecentModels(task = 'text-generation', search = '') {
    try {
        let url = `https://huggingface.co/api/models?pipeline_tag=${task}&sort=downloads&direction=-1&limit=100`;
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }

        const response = await fetchWithRetry(url);
        const models = await response.json();

        if (!Array.isArray(models)) {
            console.warn(`HF API did not return an array for task: ${task}. Response:`, models);
            return [];
        }

        console.log(`Fetched ${models.length} models for task: ${task}`);

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
                company: provider === m.id ? 'Community' : provider, // Fix for models without providers
                downloads: m.downloads || 0, // Fallback if missing
                task: task,
                author: provider
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

app.get('/api/recommendations', async (req, res) => {
    try {
        const task = req.query.task || 'text-generation';
        const search = req.query.search || '';
        const manualRam = parseFloat(req.query.manualRam);
        const manualVram = parseFloat(req.query.manualVram);
        const sharedVram = parseFloat(req.query.sharedVram) || 0;
        const cpuName = req.query.cpuName || '';
        const gpuName = req.query.gpuName || '';

        if (isNaN(manualRam) || isNaN(manualVram)) {
            return res.status(400).json({ error: "Please provide manualRam and manualVram" });
        }

        // Determine Vendor/Platform Context
        let vendor = 'General Hardware';
        if (gpuName.toUpperCase().includes('NVIDIA') || gpuName.toUpperCase().includes('GEFORCE')) vendor = 'NVIDIA';
        if (gpuName.toUpperCase().includes('AMD') || gpuName.toUpperCase().includes('RADEON')) vendor = 'AMD';
        if (cpuName.toUpperCase().includes('APPLE') || gpuName.toUpperCase().includes('APPLE')) vendor = 'Apple';
        if (gpuName.toUpperCase().includes('INTEL')) vendor = 'Intel';

        const systemSpecs = {
            ramGB: manualRam,
            vramGB: manualVram,
            sharedVramGB: sharedVram,
            isEntryGPU: false,
            vendor: vendor,
            cpuName: cpuName,
            gpuName: gpuName,
            platform: vendor === 'Apple' ? 'darwin' : 'manual'
        };

        const models = await getRecentModels(task, search);

        const recommendations = models.map(model => {
            // Memory Math (Expert Tier)
            const weights4bit = model.params * 0.7; // Standard GGUF/AWQ 4-bit
            const weights8bit = model.params * 1.3;
            const weights16bit = model.params * 2.2;

            // KV Cache / Context Window Buffer (assuming 4096 context)
            const contextBuffer = 1.5;

            let status = 'Cloud Only';
            let badgeClass = 'status-impossible';
            let reasoning = '';
            let strategy = '';
            let fineTuning = 'Not Possible';
            let gpuOffload = 0;

            // 1. INFERENCE LOGIC (5-Tier System)
            const hardwareContext = systemSpecs.gpuName || systemSpecs.cpuName || 'your hardware';

            // TIER 1: NATIVE PERFORMANCE (FP16/8-bit in VRAM)
            if (systemSpecs.vramGB >= (weights8bit + contextBuffer)) {
                status = 'Native Performance';
                badgeClass = 'status-runnable';
                reasoning = `Perfect Fit. 100% GPU execution via ${hardwareContext}. Expect maximum speed.`;
                strategy = systemSpecs.vendor === 'NVIDIA' ? 'vLLM / Hugging Face' : 'Ollama (FP16)';
                gpuOffload = 100;
            }
            // TIER 2: OPTIMIZED (4-bit in VRAM)
            else if (systemSpecs.vramGB >= (weights4bit + contextBuffer)) {
                status = 'Optimized Local';
                badgeClass = 'status-runnable';
                reasoning = `Excellent Fit for ${hardwareContext} using 4-bit quantization. Very fast.`;
                strategy = systemSpecs.vendor === 'NVIDIA' ? 'AutoGPTQ / EXL2' : 'Ollama / MLX (4-bit)';
                gpuOffload = 100;
            }
            // TIER 3: HYBRID (Split CPU/GPU)
            else if ((systemSpecs.vramGB + systemSpecs.ramGB) >= (weights4bit + contextBuffer + 4)) {
                const capableVRAM = Math.max(0, systemSpecs.vramGB - contextBuffer);
                const percentGPU = Math.min(100, Math.round((capableVRAM / weights4bit) * 100));

                status = 'Hybrid Offload';
                badgeClass = 'status-quant';

                if (systemSpecs.vramGB === 0 && systemSpecs.sharedVramGB > 0) {
                    reasoning = `Runs via Integrated Graphics (${hardwareContext}). Borrowing from System RAM. Expect slow speeds.`;
                } else {
                    reasoning = `Runs across ${hardwareContext} and System RAM (~${percentGPU}% GPU offload).`;
                }

                strategy = 'Llama.cpp (GGUF)';
                if (percentGPU < 20 && systemSpecs.vramGB > 0) {
                    status = 'CPU Bottleneck';
                    badgeClass = 'status-warning';
                    reasoning = `Mostly CPU execution on ${systemSpecs.cpuName || 'System'}. Slow generation expected.`;
                }
                gpuOffload = percentGPU;
            }
            // TIER 4: EXPERIMENTAL (3-bit or Tight Fit)
            else if ((systemSpecs.ramGB + systemSpecs.vramGB) >= (model.params * 0.5 + 2)) {
                status = 'Experimental';
                badgeClass = 'status-warning';
                reasoning = `Very tight fit on ${hardwareContext}. Requires extreme quantization for stability.`;
                strategy = 'Llama.cpp (IQ3_XS / Q2_K)';
                gpuOffload = 0;
            }
            // TIER 5: CLOUD ONLY
            else {
                status = 'Cloud Only';
                badgeClass = 'status-impossible';
                reasoning = `Model exceeds total memory on ${hardwareContext}. Requires ${(weights4bit).toFixed(1)}GB+ RAM.`;
                strategy = 'RunPod / Lambda Labs';
                gpuOffload = 0;
            }

            // 2. FINE-TUNING LOGIC
            const qloraMinimumVRAM = weights4bit + (model.params * 0.6) + 2;
            if (systemSpecs.vramGB >= qloraMinimumVRAM) {
                fineTuning = 'Possible (QLoRA)';
                if (systemSpecs.vramGB >= weights16bit + 8) fineTuning = 'Full Fine-Tuning';
            } else if (systemSpecs.ramGB >= qloraMinimumVRAM + 4 && systemSpecs.platform === 'darwin') {
                fineTuning = 'Apple MLX (Unified)';
            } else {
                fineTuning = 'Not Feasible';
            }

            return {
                ...model,
                status,
                badgeClass, // Sending class directly to frontend
                reasoning,
                strategy,
                fineTuning,
                gpuOffload,
                requirements: { fp16: weights16bit, int8: weights8bit, int4: weights4bit }
            };
        });

        res.json(recommendations);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Production: Serve React frontend
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Frontend build not found. If developing, use the Vite dev server (port 5173).");
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
