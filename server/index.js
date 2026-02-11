import express from 'express';
import cors from 'cors';
import si from 'systeminformation';
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

// In-memory store for agent-registered devices
// Structure: { "device-uuid": { cpu: ..., ram: ..., gpu: ..., timestamp: ... } }
const registeredDevices = {};

app.get('/api/tasks', (req, res) => {
    res.json(POPULAR_TASKS);
});

// Endpoint to receive data from local Python agent
app.post('/api/device/register', (req, res) => {
    try {
        const { device_id, metrics, timestamp } = req.body;

        if (!device_id || !metrics) {
            return res.status(400).json({ error: "Missing device_id or metrics" });
        }

        // Store or update device metrics
        registeredDevices[device_id] = {
            ...metrics,
            lastSeen: new Date(),
            source: 'agent'
        };

        console.log(`🔌 Agent connected: ${device_id} (${metrics.os.system})`);
        res.json({ success: true, message: "Device registered successfully" });
    } catch (e) {
        console.error("Device register error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/system-info', async (req, res) => {
    try {
        const { deviceId } = req.query;

        // 1. If Device ID provided, try to fetch from agent registry
        if (deviceId) {
            const agentData = registeredDevices[deviceId];
            if (agentData) {
                // Map agent format to frontend format
                const info = {
                    cpu: {
                        brand: agentData.cpu.brand,
                        cores: agentData.cpu.logical_cores,
                        physicalCores: agentData.cpu.physical_cores,
                        architecture: agentData.cpu.architecture || 'unknown'
                    },
                    ram: {
                        total: agentData.ram.total_gb * (1024 ** 3), // Convert GB back to bytes for consistency if needed, or update frontend to handle GB. 
                        // Frontend expects baseGB, so let's just send baseGB directly
                        baseGB: agentData.ram.total_gb
                    },
                    os: {
                        platform: agentData.os.system,
                        distro: agentData.os.release || 'Agent OS',
                        release: agentData.os.version
                    },
                    // Handle Multiple GPUs
                    gpu: agentData.gpu.map(g => ({
                        model: g.name,
                        vram: (g.vram_total_gb || 0) * 1024, // Convert to MB if needed, or adjust below
                        vramGB: g.vram_total_gb || 0,
                        vendor: 'Unknown' // Agent might not send vendor string explicitly, infer?
                    }))
                };
                return res.json(info);
            } else {
                return res.status(404).json({ error: "Device not found" });
            }
        }

        // 2. Default: Fallback to Server's Own Specs (Local Mode)
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
        const deviceId = req.query.deviceId;

        let systemSpecs;

        // 1. Try to load specs from Agent (if Device ID provided)
        if (deviceId && registeredDevices[deviceId]) {
            const d = registeredDevices[deviceId];
            systemSpecs = {
                ramGB: d.ram.total_gb,
                // Sum up VRAM from all GPUs? Or just the best one? usually sum for unified, or max for discrete. 
                // Let's sum for now as a naive approach, or maybe just take the max if they are not confirming SLI/NVLink.
                // Actually, for LLMs, splitting across GPUs is common (pipeline parallelism). Let's sum.
                vramGB: d.gpu.reduce((acc, curr) => acc + (curr.vram_total_gb || 0), 0),
                isEntryGPU: false, // Agent doesn't explicitly flag this yet, assume false or check names
                vendor: d.gpu[0]?.name.split(' ')[0] || 'Unknown',
                platform: d.os.system
            };
            console.log(`🧠 Generating recommendations for Remote Device: ${deviceId}`);
        }
        // 2. Fallback to Local Server Specs
        else {
            const mem = await si.mem();
            const gpuData = await si.graphics();
            const os = await si.osInfo();

            systemSpecs = {
                ramGB: mem.total / (1024 ** 3),
                vramGB: gpuData.controllers.reduce((acc, curr) => acc + (curr.vram || 0), 0) / 1024,
                isEntryGPU: gpuData.controllers.some(g => g.model.toLowerCase().includes('intel') || g.model.toLowerCase().includes('graphics')),
                vendor: gpuData.controllers[0]?.vendor || 'Unknown',
                platform: os.platform
            };
        }

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

            // TIER 1: NATIVE PERFORMANCE (FP16/8-bit in VRAM)
            if (systemSpecs.vramGB >= (weights8bit + contextBuffer)) {
                status = 'Native Performance';
                badgeClass = 'status-runnable';
                reasoning = `Perfect Fit. 100% GPU execution at high precision (8-bit/FP16). Expect maximum speed.`;
                strategy = systemSpecs.vendor.includes('NVIDIA') ? 'vLLM / Hugging Face' : 'Ollama (FP16)';
                gpuOffload = 100;
            }
            // TIER 2: OPTIMIZED (4-bit in VRAM)
            else if (systemSpecs.vramGB >= (weights4bit + contextBuffer)) {
                status = 'Optimized Local';
                badgeClass = 'status-runnable'; // Reusing green for good fit
                reasoning = `Excellent Fit. 100% GPU execution using 4-bit quantization. Very fast.`;
                strategy = systemSpecs.vendor.includes('NVIDIA') ? 'AutoGPTQ / EXL2' : 'Ollama / MLX (4-bit)';
                gpuOffload = 100;
            }
            // TIER 3: HYBRID (Split CPU/GPU)
            else if ((systemSpecs.vramGB + systemSpecs.ramGB) >= (weights4bit + contextBuffer + 4)) {
                // Calculate offload percentage
                const capableVRAM = Math.max(0, systemSpecs.vramGB - contextBuffer);
                const percentGPU = Math.min(100, Math.round((capableVRAM / weights4bit) * 100));

                status = 'Hybrid Offload';
                badgeClass = 'status-quant';
                reasoning = `Partial GPU Fit. ~${percentGPU}% of model runs on GPU, ${100 - percentGPU}% on slower CPU RAM.`;
                strategy = 'Llama.cpp (GGUF)';
                if (percentGPU < 20) {
                    status = 'CPU Bottleneck';
                    badgeClass = 'status-warning';
                    reasoning = 'Mostly CPU execution. Generation will be slow (1-3 tokens/s).';
                }
                gpuOffload = percentGPU;
            }
            // TIER 4: EXPERIMENTAL (3-bit or Tight Fit)
            else if ((systemSpecs.ramGB + systemSpecs.vramGB) >= (model.params * 0.5 + 2)) {
                status = 'Experimental';
                badgeClass = 'status-warning';
                reasoning = 'Requires extreme quantization (2-bit/3-bit) to fit. Intelligence loss likely.';
                strategy = 'Llama.cpp (IQ3_XS / Q2_K)';
                gpuOffload = 0; // Assuming minimal to no GPU offload for experimental CPU-heavy
            }
            // TIER 5: CLOUD ONLY
            else {
                status = 'Cloud Only';
                badgeClass = 'status-impossible';
                reasoning = `Requires ${(weights4bit).toFixed(1)}GB+ RAM. System has ${(systemSpecs.ramGB + systemSpecs.vramGB).toFixed(1)}GB usable.`;
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
