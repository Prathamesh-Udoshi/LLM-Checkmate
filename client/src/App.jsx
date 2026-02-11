import React, { useState, useEffect } from 'react';
import {
    Cpu,
    HardDrive,
    Layers,
    Activity,
    Terminal,
    AlertTriangle,
    CheckCircle,
    Zap,
    ExternalLink,
    ChevronRight
} from 'lucide-react';

function App() {
    const [view, setView] = useState('landing'); // 'landing' or 'dashboard'
    const [models, setModels] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [selectedTask, setSelectedTask] = useState('text-generation');
    const [selectedProvider, setSelectedProvider] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [manualRam, setManualRam] = useState(16);
    const [manualVram, setManualVram] = useState(0);
    const [manualSharedVram, setManualSharedVram] = useState(0);
    const [rawSpecs, setRawSpecs] = useState('');
    const [parseStatus, setParseStatus] = useState('');
    const [detectedProcessor, setDetectedProcessor] = useState('');
    const [detectedGpu, setDetectedGpu] = useState('');

    useEffect(() => {
        fetchTasks();
    }, []);

    // Smart Parser for Pasted Specs
    useEffect(() => {
        if (!rawSpecs) {
            setParseStatus('');
            setDetectedProcessor('');
            setDetectedGpu('');
            return;
        }

        let detectedRam = null;
        let detectedVram = null;
        let isIntegrated = false;
        let procName = '';
        let gpuName = '';

        // Processor Regex (Windows/Mac)
        const procRegex = /(?:Processor|Chip)[:\s–]*([^\n\t\r]+)/i;
        const procMatch = rawSpecs.match(procRegex);
        if (procMatch) {
            procName = procMatch[1].trim();
            setDetectedProcessor(procName);
        }

        // GPU Name Regex (Captures NVIDIA, AMD, Intel, or Apple GPU brands)
        const gpuBrandRegex = /(?:NVIDIA|GeForce|Radeon|Intel\(R\)\sUHD|Iris|Intel\(R\)\sIris|Apple\sM\d|GPU\s\d+)[:\s–]*([^\n\t\r]+)/i;
        const gpuMatch = rawSpecs.match(gpuBrandRegex);
        if (gpuMatch) {
            gpuName = gpuMatch[0].trim();
            // Clean up if it just says "GPU 0" or starts with a brand and captures too much
            setDetectedGpu(gpuName);
        }

        // RAM Regex
        const ramRegex = /(?:Installed RAM|Memory|Total Memory|RAM)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i;
        const ramMatch = rawSpecs.match(ramRegex);
        if (ramMatch) {
            let val = parseFloat(ramMatch[1]);
            if (ramMatch[2].toUpperCase() === 'MB') val = val / 1024;
            detectedRam = Math.round(val);
            setManualRam(detectedRam);
        }

        // 1. Explicitly check for SHARED memory first to avoid false positives in Dedicated check
        const sharedRegex = /Shared GPU Memory[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i;
        const sharedMatch = rawSpecs.match(sharedRegex);

        // 2. Check for DEDICATED memory (excluding anything that says "Shared")
        const dedicatedRegex = /(?:Dedicated Video Memory|Dedicated GPU Memory)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i;
        const dedicatedMatch = rawSpecs.match(dedicatedRegex);

        // 3. Fallback for generic VRAM mentions (only if "Dedicated" or "Shared" weren't matched precisely)
        const genericVramRegex = /(?<!Shared\s)(?:VRAM|GPU Memory)[:\s–]*(\d+(?:\.\d+)?)\s*(GB|MB)/i;
        const genericMatch = rawSpecs.match(genericVramRegex);

        if (dedicatedMatch) {
            let val = parseFloat(dedicatedMatch[1]);
            if (dedicatedMatch[2].toUpperCase() === 'MB') val = val / 1024;
            detectedVram = Math.round(val);
            setManualVram(detectedVram);
        } else if (genericMatch) {
            let val = parseFloat(genericMatch[1]);
            if (genericMatch[2].toUpperCase() === 'MB') val = val / 1024;
            detectedVram = Math.round(val);
            setManualVram(detectedVram);
        }

        if (sharedMatch) {
            let val = parseFloat(sharedMatch[1]);
            if (sharedMatch[2].toUpperCase() === 'MB') val = val / 1024;
            setManualSharedVram(Math.round(val));

            // Note: We don't overwrite manualVram here if dedicated was found, 
            // but we use it to set the "Integrated" flag if dedicated is missing or 0.
            if (!detectedVram || detectedVram < 0.5) {
                isIntegrated = true;
                setManualVram(0);
            }
        } else {
            setManualSharedVram(0);
        }

        if (detectedRam || detectedVram || procName || gpuName) {
            let msgParts = [];
            if (procName) msgParts.push(`CPU: ${procName}`);
            if (gpuName) msgParts.push(`GPU: ${gpuName}`);
            if (detectedRam) msgParts.push(`${detectedRam}GB RAM`);

            if (isIntegrated) {
                msgParts.push(`Integrated Graphics`);
            } else if (detectedVram) {
                msgParts.push(`${detectedVram}GB Dedicated VRAM`);
            }

            setParseStatus(`✨ Detected: ${msgParts.join(' + ')}`);
        } else {
            setParseStatus('🔍 No hardware patterns found. Try entering values manually below.');
        }
    }, [rawSpecs]);

    useEffect(() => {
        if (view === 'dashboard') {
            const delayDebounceFn = setTimeout(() => {
                fetchRecommendations();
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [selectedTask, searchQuery, view, manualRam, manualVram, manualSharedVram]);

    const fetchTasks = async () => {
        try {
            const res = await fetch('/api/tasks');
            const data = await res.json();
            setTasks(data);
        } catch (err) {
            console.error("Failed to fetch tasks");
        }
    };

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            let url = `/api/recommendations?task=${selectedTask}&search=${encodeURIComponent(searchQuery)}` +
                `&manualRam=${manualRam}&manualVram=${manualVram}` +
                `&sharedVram=${manualSharedVram}` +
                `&cpuName=${encodeURIComponent(detectedProcessor)}` +
                `&gpuName=${encodeURIComponent(detectedGpu)}`;

            const res = await fetch(url);
            const data = await res.json();
            setModels(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const providers = ['All', ...new Set(models.map(m => m.company))];
    const filteredModels = selectedProvider === 'All'
        ? models
        : models.filter(m => m.company === selectedProvider);


    if (view === 'landing') {
        return (
            <div className="container">
                <section className="hero">
                    <div className="edu-tag">Hardware Discovery Engine</div>
                    <h1>LLM Checkmate</h1>
                    <p>
                        Analyze your local hardware constraints and discover Large Language Models
                        optimized for your specific silicon. No scanners, no risk just science.
                    </p>
                    <div className="nav-buttons">
                        <button className="nav-btn" onClick={() => setView('dashboard')}>
                            Start Compatibility Analysis
                        </button>
                        <button className="nav-btn nav-btn-outline" onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}>
                            How to find specs?
                        </button>
                    </div>
                </section>

                <section className="edu-grid" id="guide-section">
                    <div className="edu-card">
                        <div className="edu-tag">Windows</div>
                        <h3>Step 1: Get RAM</h3>
                        <p>
                            Open <b>Settings</b> &gt; <b>System</b> &gt; <b>About</b>. Copy the text under <b>Device Specifications</b> to get your <b>Installed RAM</b>.
                        </p>
                        <h3>Step 2: Get GPU (VRAM)</h3>
                        <p>
                            Right-click Taskbar &gt; <b>Task Manager</b> &gt; <b>Performance</b> &gt; <b>GPU</b>.<br /><br />
                            If you see <b>Dedicated GPU Memory</b>, <b>Shared GPU Memory</b>, or both, enter them in the respective fields.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">Integrated Graphics</div>
                        <h3>The "Double-Count" Trap</h3>
                        <p>
                            <b>Shared GPU Memory</b> is not extra memory, it is just a portion of your System RAM that the GPU is allowed to borrow.
                            <br /><br />
                            If we entered both 8GB RAM and 4GB Shared VRAM, the app would think you have 12GB total, which is physically impossible.
                            Keeping VRAM at <b>0</b> ensures the app calculates correctly against your true 8GB limit.
                        </p>
                    </div>
                </section>

                <section id="edu-section" className="edu-grid">
                    <div className="edu-card">
                        <div className="edu-tag">01. Fundamentals</div>
                        <h3>Quantization & Bits</h3>
                        <p>
                            LLMs are typically trained in 16-bit precision. Quantization shrinks these weights (to 8-bit or 4-bit)
                            using mathematical rounding. This reduces memory footprint by up to 75% with
                            minimal loss in intelligence, enabling large models to run on standard home computers.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">02. Infrastructure</div>
                        <h3>VRAM vs RAM</h3>
                        <p>
                            VRAM (Video RAM) lives on your GPU and is ultra-fast, making it ideal for AI.
                            If a model exceeds VRAM, it "spills over" into System RAM. While this allows
                            running larger models, the speed drops significantly because System RAM is
                            much slower at moving data to the processor.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">03. Efficiency</div>
                        <h3>LoRA & QLoRA</h3>
                        <p>
                            Low-Rank Adaptation (LoRA) freezes the original model weights and only trains a
                            tiny fraction of additional parameters. QLoRA takes this further by loading the
                            base model in 4-bit, making professional-grade fine-tuning possible
                            on consumer-grade hardware.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">04. Formats</div>
                        <h3>GGUF vs EXL2/AWQ</h3>
                        <p>
                            Model formats dictate how weights are stored. GGUF is a universal format for
                            balanced CPU/GPU usage. EXL2 and AWQ are specialized formats designed for
                            NVIDIA GPUs only, offering the highest possible generation speeds (tokens per second).
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">05. Context</div>
                        <h3>KV Cache & Context</h3>
                        <p>
                            The "Context Window" is the model's short-term memory. As you type longer prompts,
                            the model stores past data in a "KV Cache." This cache consumes additional RAM
                            beyond the weight size. Larger context windows require exponentially more memory.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">06. Apple Silicon</div>
                        <h3>Unified Memory</h3>
                        <p>
                            On Mac computers, the GPU and CPU share the same pool of memory. This "Unified"
                            architecture allows Macs to run massive models (like a 70B parameter model)
                            that would normally require multiple expensive enterprise GPUs on Windows.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">07. Parameters</div>
                        <h3>Temperature & Top-P</h3>
                        <p>
                            These are "Inference Parameters." Temperature controls randomness—lower values
                            make response predictable, higher values make them creative. Top-P (Nucleus Sampling)
                            limits the model to only "high probability" word choices, preventing gibberish.
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">08. Training</div>
                        <h3>Fine-Tuning</h3>
                        <p>
                            Fine-tuning is "specializing" a model on your own data. Unlike standard usage,
                            this requires storing mathematical "gradients" and "optimizer states,"
                            which can double or triple the memory requirement compared to simple chatting.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="container">
            {loading && <div className="loading-overlay"></div>}

            <span className="back-link" onClick={() => setView('landing')}>← Back to Guide</span>

            <header>
                <h1>Hardware Compatibility Analyzer</h1>
                <div className="subtitle">
                    {detectedProcessor || detectedGpu
                        ? `Resource profiling for ${detectedProcessor}${detectedProcessor && detectedGpu ? ' \u2022 ' : ''}${detectedGpu}`
                        : 'Real-time resource mapping based on your custom specifications.'}
                </div>
            </header>

            {/* Manual Specification Section */}
            <div className="manual-specs-bar">
                <div className="manual-header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <h3>Paste Specifications</h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Copy 'About' info for RAM, then 'Task Manager' info for VRAM.</p>
                    </div>
                </div>

                <div className="manual-content">
                    <textarea
                        className="specs-paste-area"
                        placeholder="Paste specs here (e.g. Device name DESKTOP-S6S... Installed RAM 8.00 GB ...)"
                        value={rawSpecs}
                        onChange={(e) => {
                            setRawSpecs(e.target.value);
                        }}
                    />

                    {parseStatus && (
                        <div className={`parse-status-msg ${parseStatus.includes('Detected') ? 'success' : 'searching'}`}>
                            {parseStatus}
                        </div>
                    )}

                    <div className="manual-inputs-header">
                        <h4>Fine-Tune Detected Hardware</h4>
                        <p>Adjust these values manually to match your specific setup if parsing missed anything.</p>
                    </div>

                    <div className="manual-inputs">
                        <div className="input-field">
                            <label>System RAM (GB)</label>
                            <input
                                type="number"
                                value={manualRam}
                                onChange={(e) => setManualRam(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="input-field">
                            <label>GPU Name</label>
                            <input
                                type="text"
                                placeholder="e.g. NVIDIA RTX 3060"
                                value={detectedGpu}
                                onChange={(e) => setDetectedGpu(e.target.value)}
                            />
                        </div>
                        <div className="input-field">
                            <label>Dedicated GPU VRAM (GB)</label>
                            <input
                                type="number"
                                value={manualVram}
                                onChange={(e) => setManualVram(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="input-field">
                            <label>Shared GPU Memory (GB)</label>
                            <input
                                type="number"
                                value={manualSharedVram}
                                onChange={(e) => setManualSharedVram(parseInt(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className="filter-bar">
                <div className="filter-group">
                    <label>Search Registry</label>
                    <input
                        type="text"
                        placeholder="Model name (e.g. Llama 3)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-group">
                    <label>Inference Category</label>
                    <select
                        value={selectedTask}
                        onChange={(e) => {
                            setSelectedTask(e.target.value);
                            setSelectedProvider('All');
                        }}
                    >
                        {tasks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Organization</label>
                    <div className="provider-list">
                        {providers.map(p => (
                            <button
                                key={p}
                                className={`provider-btn ${selectedProvider === p ? 'active' : ''}`}
                                onClick={() => setSelectedProvider(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="dashboard">
                {/* Compatibility Legend */}
                <div className="legend-container">
                    <div className="legend-item">
                        <span className="dot" style={{ background: '#4ade80' }}></span>
                        <span><b>Native / Optimized</b>: 100% GPU Speed</span>
                    </div>
                    <div className="legend-item">
                        <span className="dot" style={{ background: '#facc15' }}></span>
                        <span><b>Hybrid</b>: Runs on CPU & GPU (Slower)</span>
                    </div>
                    <div className="legend-item">
                        <span className="dot" style={{ background: '#fb923c' }}></span>
                        <span><b>Experimental</b>: Extreme quantization required</span>
                    </div>
                    <div className="legend-item">
                        <span className="dot" style={{ background: '#ef4444' }}></span>
                        <span><b>Cloud Only</b>: Exceeds total RAM</span>
                    </div>
                </div>

                {/* Model Results Main */}
                <div className="models-section">
                    <div className="model-header">
                        <span>Model Identity</span>
                        <span>Compatibility</span>
                        <span>Suggested Stack</span>
                        <span>Repository</span>
                    </div>

                    <div className="model-list">
                        {filteredModels.length > 0 ? (
                            filteredModels.map((model) => (
                                <div className="model-row" key={model.id}>
                                    <div className="model-identity">
                                        <div className="model-name">{model.name}</div>
                                        <div className="model-meta">
                                            {model.params}B Parameters • {model.downloads.toLocaleString()} downloads
                                        </div>
                                    </div>

                                    <div className={`status-badge ${model.badgeClass}`}>
                                        {model.status}
                                    </div>

                                    <div className="strategy-box">
                                        {model.strategy}
                                        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.4rem' }}>
                                            Fine Tuning: {model.fineTuning}
                                        </div>
                                    </div>

                                    <div className="links">
                                        <a href={`https://huggingface.co/${model.id}`} target="_blank" rel="noreferrer">
                                            HF Profile ↗
                                        </a>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '4rem 0', textAlign: 'center', color: '#64748b' }}>
                                No models found for this category or provider. Try adjusting your filters.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}

export default App;
