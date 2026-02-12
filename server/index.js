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

            // Max Context Detection (Heuristics for reliability)
            let maxContext = 4096; // Default safe floor
            const id = m.id.toLowerCase();
            if (id.includes('llama-3.1') || id.includes('128k')) maxContext = 131072;
            else if (id.includes('llama-3')) maxContext = 8192;
            else if (id.includes('gemma-2')) maxContext = 8192;
            else if (id.includes('mistral-7b-v0.3')) maxContext = 32768;
            else if (id.includes('phi-3')) maxContext = 128000;
            else if (id.includes('phi-3-mini-4k')) maxContext = 4096;
            else if (id.includes('yi-') || id.includes('vision')) maxContext = 16384;

            return {
                id: m.id,
                name: m.id.split('/').pop(),
                params: params,
                maxContext: maxContext,
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

app.post('/api/parse-specs', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    const specs = {
        ram: 0,
        vram: 0,
        sharedVram: 0,
        cpu: '',
        gpu: '',
        isIntegrated: false
    };

    // Advanced heuristics (The "AI-like" smarts)
    const lowerText = text.toLowerCase();

    // 1. RAM Extraction
    const ramMatch = text.match(/(?:RAM|Memory|Instalada)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB|G|M)/i);
    if (ramMatch) {
        let val = parseFloat(ramMatch[1]);
        if (ramMatch[2].toUpperCase().startsWith('M')) val /= 1024;
        specs.ram = Math.round(val);
    }

    // 2. GPU Extraction (Keywords + Context)
    const gpuKeywords = ['NVIDIA', 'RTX', 'GTX', 'Radeon', 'Intel(R) UHD', 'Iris', 'Arc', 'Apple M1', 'Apple M2', 'Apple M3', 'Apple M4'];
    for (const kw of gpuKeywords) {
        if (text.toUpperCase().includes(kw.toUpperCase())) {
            // Find the line containing this keyword
            const lines = text.split('\n');
            const gpuLine = lines.find(l => l.toUpperCase().includes(kw.toUpperCase()));
            if (gpuLine) {
                specs.gpu = gpuLine.trim().split(/[:\t]/).pop().trim();
                // Clean up if it's too long
                if (specs.gpu.length > 50) specs.gpu = gpuLine.match(new RegExp(`${kw}[^,\\n]+`, 'i'))?.[0] || kw;
                break;
            }
        }
    }

    // 3. VRAM Extraction (Dedicated)
    const vramMatch = text.match(/(?:Dedicated|VRAM|Memória de Vídeo)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (vramMatch) {
        let val = parseFloat(vramMatch[1]);
        if (vramMatch[2].toUpperCase().startsWith('M')) val /= 1024;
        specs.vram = Math.round(val);
    }

    // 4. Shared VRAM
    const sharedMatch = text.match(/(?:Shared|Compartilhada)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (sharedMatch) {
        let val = parseFloat(sharedMatch[1]);
        if (sharedMatch[2].toUpperCase().startsWith('M')) val /= 1024;
        specs.sharedVram = Math.round(val);
    }

    // 5. Intelligent Integrated Detection
    if (!specs.vram && (specs.gpu.toLowerCase().includes('intel') || specs.gpu.toLowerCase().includes('iris') || specs.gpu.toLowerCase().includes('uhd'))) {
        specs.isIntegrated = true;
        if (specs.ram > 0) specs.sharedVram = Math.round(specs.ram / 2);
    }

    // 6. CPU Extraction
    const cpuMatch = text.match(/(?:Processor|Processador|CPU)[:\s–]*([^\n\t\r]+)/i);
    if (cpuMatch) {
        specs.cpu = cpuMatch[1].trim();
    }

    res.json(specs);
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
        const contextWindow = parseInt(req.query.contextWindow) || 2048;

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

            // KV Cache Estimation (Realistic 16-bit precision for KV)
            // Rule of thumb: a 7B model uses ~0.5GB for 4096 context. a 70B uses ~4GB.
            // Formula: (params / 7) * (context / 4096) * 0.5
            const contextBuffer = (model.params / 7) * (contextWindow / 4096) * 0.5;
            const totalRequired4bit = weights4bit + contextBuffer;
            const totalRequired8bit = weights8bit + contextBuffer;

            let status = 'Cloud Only';
            let badgeClass = 'status-impossible';
            let reasoning = '';
            let strategy = '';
            let fineTuning = 'Not Possible';
            let gpuOffload = 0;

            // 1. INFERENCE LOGIC (5-Tier System)
            const hardwareContext = systemSpecs.gpuName || systemSpecs.cpuName || 'your hardware';
            const isOverContextLimit = contextWindow > model.maxContext;

            // TIER 1: NATIVE PERFORMANCE (FP16/8-bit in VRAM)
            if (systemSpecs.vramGB >= (totalRequired8bit)) {
                status = 'Native Performance';
                badgeClass = 'status-runnable';
                reasoning = isOverContextLimit
                    ? `⚠️ Native Limit Breach! Model supports ${model.maxContext}, but ${contextWindow} tokens requested. Hallucinations likely.`
                    : `Perfect Fit. 100% GPU execution via ${hardwareContext}. Expect maximum speed at ${contextWindow} tokens.`;
                strategy = systemSpecs.vendor === 'NVIDIA' ? 'vLLM / Hugging Face' : 'Ollama (FP16)';
                gpuOffload = 100;
            }
            // TIER 2: OPTIMIZED (4-bit in VRAM)
            else if (systemSpecs.vramGB >= (totalRequired4bit)) {
                status = 'Optimized Local';
                badgeClass = 'status-runnable';
                reasoning = isOverContextLimit
                    ? `Excellent HW fit, but native limit of ${model.maxContext} tokens exceeded. Stability risks.`
                    : `Excellent Fit for ${hardwareContext} using 4-bit quantization. Very fast.`;
                strategy = systemSpecs.vendor === 'NVIDIA' ? 'AutoGPTQ / EXL2' : 'Ollama / MLX (4-bit)';
                gpuOffload = 100;
            }
            // TIER 3: HYBRID (Split CPU/GPU)
            else if ((systemSpecs.vramGB + systemSpecs.ramGB) >= (totalRequired4bit + 4)) {
                const capableVRAM = Math.max(0, systemSpecs.vramGB - contextBuffer);
                const percentGPU = Math.min(100, Math.round((capableVRAM / weights4bit) * 100));

                status = 'Hybrid Offload';
                badgeClass = 'status-quant';

                if (systemSpecs.vramGB === 0 && systemSpecs.sharedVramGB > 0) {
                    reasoning = `Runs via Integrated Graphics (${hardwareContext}). Borrowing from System RAM.`;
                } else {
                    reasoning = `Runs across ${hardwareContext} and System RAM (~${percentGPU}% GPU).`;
                }

                if (isOverContextLimit) {
                    reasoning += ` ⚠️ Note: Requested context exceeds ${model.maxContext} nativ limit.`;
                } else {
                    reasoning += ` Context: ${contextWindow} tokens.`;
                }

                strategy = 'Llama.cpp (GGUF)';
                if (percentGPU < 20 && systemSpecs.vramGB > 0) {
                    status = 'CPU Bottleneck';
                    badgeClass = 'status-warning';
                }
                gpuOffload = percentGPU;
            }
            // TIER 4: EXPERIMENTAL (3-bit or Tight Fit)
            else if ((systemSpecs.ramGB + systemSpecs.vramGB) >= (model.params * 0.5 + contextBuffer + 1)) {
                status = 'Experimental';
                badgeClass = 'status-warning';
                reasoning = `Very tight fit on ${hardwareContext}. Requires extreme quantization for stability at ${contextWindow} context.`;
                strategy = 'Llama.cpp (IQ3_XS / Q2_K)';
                gpuOffload = 0;
            }
            // TIER 5: CLOUD ONLY
            else {
                status = 'Cloud Only';
                badgeClass = 'status-impossible';
                reasoning = `Model exceeds total memory. Requires ${totalRequired4bit.toFixed(1)}GB+ RAM for ${contextWindow} context.`;
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

            // 3. PERFORMANCE PREDICTION (TPS Heuristic)
            let predictedTPS = 0;
            if (status.includes('Native') || status.includes('Optimized')) {
                const baseTPS = 80;
                predictedTPS = Math.round((baseTPS / (model.params / 7)) * (systemSpecs.vendor === 'Apple' ? 0.7 : 1));
            } else if (status === 'Hybrid Offload') {
                // Scale between 5 (CPU) and 25 (Low GPU)
                predictedTPS = Math.round(5 + (gpuOffload / 100) * 20);
            } else if (status === 'CPU Bottleneck' || status === 'Experimental') {
                // Measured heuristic for modern DDR4/DDR5 RAM
                predictedTPS = parseFloat((1.2 + (systemSpecs.ramGB / 128) * 2).toFixed(1));
            } else {
                predictedTPS = 'N/A';
            }

            // 4. OPTIMIZED CLI COMMAND
            let optimizedCommand = '';
            if (status !== 'Cloud Only') {
                if (systemSpecs.vendor === 'Apple' || strategy.includes('Ollama')) {
                    optimizedCommand = `ollama run ${model.name.toLowerCase().split(' ')[0]}`;
                } else {
                    optimizedCommand = `./llama-cli -m ${model.name.toLowerCase().split(' ')[0]}.gguf -ngl ${Math.round(gpuOffload)}`;
                }
            }

            return {
                ...model,
                status,
                badgeClass,
                reasoning,
                strategy,
                fineTuning,
                gpuOffload,
                predictedTPS,
                optimizedCommand,
                isOverContextLimit,
                contextUsage: contextBuffer.toFixed(2),
                requirements: { fp16: weights16bit.toFixed(1), int8: weights8bit.toFixed(1), int4: weights4bit.toFixed(1) }
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
