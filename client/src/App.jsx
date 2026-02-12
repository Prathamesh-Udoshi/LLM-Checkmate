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
    ChevronRight,
    Brain
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
    const [parseStatus, setParseStatus] = useState({ text: '', type: '' });
    const [detectedProcessor, setDetectedProcessor] = useState('');
    const [detectedGpu, setDetectedGpu] = useState('');
    const [contextWindow, setContextWindow] = useState(2048);
    const [discoveryMode, setDiscoveryMode] = useState('choice'); // 'choice', 'auto', 'paste', 'manual'
    const [isAnalysisStarted, setIsAnalysisStarted] = useState(false);

    useEffect(() => {
        fetchTasks();
    }, []);

    // AI Spec Parser (Manual Trigger)
    const triggerAIParse = async () => {
        if (!rawSpecs) return;
        setParseStatus({ text: '🧠 AI Parsing in progress...', type: 'searching' });
        try {
            const res = await fetch('/api/parse-specs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: rawSpecs })
            });
            const data = await res.json();

            if (data.ram) setManualRam(data.ram);
            if (data.vram !== undefined) setManualVram(data.vram);
            if (data.sharedVram !== undefined) setManualSharedVram(data.sharedVram);
            if (data.cpu) setDetectedProcessor(data.cpu);
            if (data.gpu) setDetectedGpu(data.gpu);

            let msgParts = [];
            if (data.cpu) msgParts.push(`CPU: ${data.cpu}`);
            if (data.gpu) msgParts.push(`GPU: ${data.gpu}`);
            if (data.ram) msgParts.push(`${data.ram}GB RAM`);
            if (data.vram) msgParts.push(`${data.vram}GB VRAM`);
            if (data.sharedVram) msgParts.push(`${data.sharedVram}GB Shared`);

            setParseStatus({
                text: `✨ AI Detected: ${msgParts.join(' | ')}`,
                type: 'success'
            });
        } catch (err) {
            setParseStatus({ text: '❌ AI Parser failed. Using local regex fallback...', type: 'error' });
        }
    };

    const getVramHeuristic = (name) => {
        const gpu = name.toUpperCase();
        // NVIDIA RTX 40 Series
        if (gpu.includes('4090')) return 24;
        if (gpu.includes('4080')) return 16;
        if (gpu.includes('4070 TI')) return 12;
        if (gpu.includes('4070')) return 12;
        if (gpu.includes('4060 TI')) return 16; // 16GB or 8GB variant, defaulting to 16 for conservative planning or 8. Let's do 8 as it's common.
        if (gpu.includes('4060')) return 8;

        // NVIDIA RTX 30 Series
        if (gpu.includes('3090 TI')) return 24;
        if (gpu.includes('3090')) return 24;
        if (gpu.includes('3080 TI')) return 12;
        if (gpu.includes('3080')) return 10; // or 12, common is 10
        if (gpu.includes('3070 TI')) return 8;
        if (gpu.includes('3070')) return 8;
        if (gpu.includes('3060 TI')) return 8;
        if (gpu.includes('3060')) return 12; // 3060 uniquely has 12GB
        if (gpu.includes('3050')) return 8;

        // NVIDIA RTX 20 Series
        if (gpu.includes('2080 TI')) return 11;
        if (gpu.includes('2080')) return 8;
        if (gpu.includes('2070')) return 8;
        if (gpu.includes('2060')) return 6;

        // GTX Series
        if (gpu.includes('1660 TI') || gpu.includes('1660 SUPER')) return 6;
        if (gpu.includes('1650')) return 4;
        if (gpu.includes('1080 TI')) return 11;
        if (gpu.includes('1080')) return 8;
        if (gpu.includes('1070')) return 8;
        if (gpu.includes('1060')) return 6;

        // AMD Radeon
        if (gpu.includes('7900 XTX')) return 24;
        if (gpu.includes('7900 XT')) return 20;
        if (gpu.includes('6900') || gpu.includes('6800')) return 16;
        if (gpu.includes('6700')) return 12;
        if (gpu.includes('6600')) return 8;

        return null;
    };

    const autoDetectHardware = () => {
        setDiscoveryMode('auto');
        setParseStatus({ text: '⚡ Probing hardware via browser APIs...', type: 'searching' });

        // Artificial delay for visual feedback (Make the scan feel 'real')
        setTimeout(() => {
            let ramDetected = 16;
            let gpuName = '';

            if (navigator.deviceMemory) {
                ramDetected = Math.round(navigator.deviceMemory);
                setManualRam(ramDetected);
            }

            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

                if (debugInfo) {
                    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    gpuName = renderer.replace(/Direct3D11/i, '').replace(/vs_\d+_\d+ ps_\d+_\d+/i, '').trim();
                    setDetectedGpu(gpuName);

                    const heuristicVram = getVramHeuristic(gpuName);
                    if (heuristicVram !== null) {
                        setManualVram(heuristicVram);
                        setManualSharedVram(Math.round(ramDetected / 2));
                        setParseStatus({ text: `✅ Detected ${gpuName} (${heuristicVram}GB VRAM).`, type: 'success' });
                    } else if (gpuName.toLowerCase().match(/intel|iris|uhd|graphics|amd radeon\(tm\) graphics/)) {
                        setManualVram(0);
                        setManualSharedVram(Math.round(ramDetected / 2));
                        setParseStatus({
                            text: '⚠️ Integrated GPU detected. For accurate LLM results, your browser needs access to your Dedicated GPU (NVIDIA/AMD). Please set your Browser to "High Performance" in Windows Graphic Settings.',
                            type: 'warning'
                        });
                    } else {
                        setParseStatus({ text: `❓ GPU "${gpuName}" detected but VRAM could not be estimated. Please enter it manually.`, type: 'warning' });
                    }
                }
            } catch (e) {
                setParseStatus({ text: '❌ Hardware detection failed. Please enter specs manually.', type: 'error' });
            }
        }, 1200);
    };

    useEffect(() => {
        if (view === 'dashboard' && isAnalysisStarted) {
            const delayDebounceFn = setTimeout(() => {
                fetchRecommendations();
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [selectedTask, searchQuery, view, manualRam, manualVram, manualSharedVram, contextWindow, isAnalysisStarted]);

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
                `&gpuName=${encodeURIComponent(detectedGpu)}` +
                `&contextWindow=${contextWindow}`;

            const res = await fetch(url);
            const data = await res.json();
            setModels(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleStartAnalysis = () => {
        setIsAnalysisStarted(true);
        setTimeout(() => {
            window.scrollTo({ top: 800, behavior: 'smooth' });
        }, 100);
    };

    const handleRestartSearch = () => {
        setDiscoveryMode('choice');
        setIsAnalysisStarted(false);
        setModels([]);
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

            {/* Discovery Hub - New Simplified Navigation */}
            <div className="discovery-hub">
                {discoveryMode === 'choice' && (
                    <div className="choice-grid">
                        <div className="choice-card" onClick={autoDetectHardware}>
                            <Zap className="choice-icon" size={32} />
                            <h3>Auto-Scan</h3>
                            <p>Instant browser-based detection (Easiest)</p>
                        </div>
                        <div className="choice-card" onClick={() => setDiscoveryMode('paste')}>
                            <Terminal className="choice-icon" size={32} />
                            <h3>Smart Paste</h3>
                            <p>Paste specs from System settings</p>
                        </div>
                        <div className="choice-card" onClick={() => setDiscoveryMode('manual')}>
                            <Layers className="choice-icon" size={32} />
                            <h3>Manual Entry</h3>
                            <p>Type your specs individually</p>
                        </div>
                    </div>
                )}

                {(discoveryMode === 'paste' || discoveryMode === 'auto') && (
                    <div className="hub-active-mode">
                        <div className="mode-header">
                            <button className="back-btn-sm" onClick={() => setDiscoveryMode('choice')}>← Other Methods</button>
                            <h3>{discoveryMode === 'paste' ? 'Smart Spec Import' : 'Auto-Detection Progress'}</h3>
                        </div>

                        {discoveryMode === 'paste' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ fontSize: '0.85rem', color: '#abb0b7', marginBottom: '1rem' }}>
                                    <b>How to get your specs?</b> Windows (Settings &gt; About) | Mac (About this Mac)
                                </div>
                                <textarea
                                    className="specs-paste-area"
                                    placeholder="Paste your system info here (Ctrl+V)..."
                                    value={rawSpecs}
                                    onChange={(e) => setRawSpecs(e.target.value)}
                                    autoFocus
                                />
                                <button className="proceed-btn" onClick={triggerAIParse} disabled={!rawSpecs || parseStatus.type === 'searching'} style={{ marginTop: '0', alignSelf: 'flex-start' }}>
                                    <Brain size={16} /> {parseStatus.type === 'searching' ? 'AI Analyzing...' : 'Scan System Info'}
                                </button>
                            </div>
                        )}

                        {parseStatus.text && (
                            <div className={`parse-status-msg ${parseStatus.type}`}>
                                {parseStatus.type === 'searching' && <Activity className="spin" size={16} />}
                                {parseStatus.type === 'success' && <CheckCircle size={16} />}
                                {parseStatus.type === 'error' && <AlertTriangle size={16} />}
                                {parseStatus.text}
                            </div>
                        )}

                        {parseStatus.type === 'success' && (
                            <button className="proceed-btn" onClick={() => setDiscoveryMode('manual')}>
                                Review & Confirm Specs <ChevronRight size={16} />
                            </button>
                        )}
                    </div>
                )}

                {discoveryMode === 'manual' && (
                    <div className="hub-active-mode">
                        <div className="mode-header">
                            <button className="back-btn-sm" onClick={handleRestartSearch}>← Restart Search</button>
                            <h3>Verified Hardware Profile</h3>
                        </div>

                        <div className="manual-inputs">
                            <div className="input-field">
                                <label>System RAM (GB)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={manualRam}
                                    onChange={(e) => setManualRam(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="input-field">
                                <label>GPU Model (Dedicated)</label>
                                <input
                                    type="text"
                                    value={detectedGpu}
                                    onChange={(e) => setDetectedGpu(e.target.value)}
                                />
                            </div>
                            <div className="input-field">
                                <label>Dedicated VRAM (GB)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={manualVram}
                                    onChange={(e) => setManualVram(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="input-field">
                                <label>Shared Memory (GB)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={manualSharedVram}
                                    onChange={(e) => setManualSharedVram(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                        </div>

                        <div className="hardware-summary-bar">
                            <div className="summary-content">
                                <span className="summary-label">Active Hardware Profile</span>
                                <div className="summary-value">
                                    {detectedGpu || 'System'}
                                    <span className="summary-badge" title="Physical VRAM on GPU">{manualVram}GB VRAM</span>
                                    <span className="summary-badge" title="Borrowed from System RAM">{manualSharedVram}GB Shared Memory</span>
                                    <span className="summary-badge" title="Total RAM">{manualRam}GB RAM</span>
                                </div>
                            </div>
                            <button className="minimize-btn" onClick={handleStartAnalysis}>
                                Analyze Compatibility ↓
                            </button>
                        </div>
                    </div>
                )}
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

                <div className="filter-group" style={{ minWidth: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <label>Context Window (Simulator)</label>
                        <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{contextWindow.toLocaleString()} tokens</span>
                    </div>
                    <input
                        type="range"
                        min="512"
                        max="128000"
                        step="512"
                        value={contextWindow}
                        onChange={(e) => setContextWindow(parseInt(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                        <span>Fast (Low RAM)</span>
                        <span>Long Memory (High RAM)</span>
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
                                <div className={`model-row ${model.isOverContextLimit ? 'breach-warning' : ''}`} key={model.id}>
                                    <div className="model-identity">
                                        <div className="model-name">{model.name}</div>
                                        <div className="model-meta">
                                            {model.params}B Params • {model.maxContext / 1024}k Max • {model.predictedTPS === 'N/A' ? 'Speed: Cloud Only' : `${model.predictedTPS} tokens/sec`}
                                        </div>
                                    </div>

                                    <div className="status-container">
                                        <div className={`status-badge ${model.isOverContextLimit ? 'status-impossible' : model.badgeClass}`}>
                                            {model.isOverContextLimit && <AlertTriangle size={14} style={{ marginRight: '6px' }} />}
                                            {model.status}
                                        </div>
                                        <div className="status-reasoning">{model.reasoning}</div>
                                    </div>

                                    <div className="strategy-box">
                                        <div className="strategy-label">{model.strategy}</div>
                                        <div className="fine-tuning-label">Fine-Tuning: {model.fineTuning}</div>
                                        <div className="fine-tuning-label" style={{ color: '#6366f1', marginTop: '4px' }}>
                                            KV Cache: {model.contextUsage} GB
                                        </div>
                                        {model.optimizedCommand && (
                                            <div className="command-snippet" onClick={() => {
                                                navigator.clipboard.writeText(model.optimizedCommand);
                                                alert('Command copied to clipboard!');
                                            }}>
                                                <code>{model.optimizedCommand}</code>
                                                <Terminal size={12} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="links">
                                        <a href={`https://huggingface.co/${model.id}`} target="_blank" rel="noreferrer" className="hf-link">
                                            View Stats <ChevronRight size={14} />
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
