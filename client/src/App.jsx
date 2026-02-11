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
    const [system, setSystem] = useState(null);
    const [models, setModels] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [selectedTask, setSelectedTask] = useState('text-generation');
    const [selectedProvider, setSelectedProvider] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Get Device ID from URL if present (for remote agent scans)
    const urlParams = new URLSearchParams(window.location.search);
    const deviceId = urlParams.get('deviceId');

    useEffect(() => {
        fetchTasks();
        fetchSystemInfo();
    }, []);

    useEffect(() => {
        if (view === 'dashboard') {
            const delayDebounceFn = setTimeout(() => {
                fetchRecommendations();
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [selectedTask, searchQuery, view]);

    const fetchTasks = async () => {
        try {
            const res = await fetch('/api/tasks');
            const data = await res.json();
            setTasks(data);
        } catch (err) {
            console.error("Failed to fetch tasks");
        }
    };

    const fetchSystemInfo = async () => {
        try {
            let url = '/api/system-info';
            if (deviceId) url += `?deviceId=${deviceId}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error("System info fetch failed");

            const data = await res.json();
            setSystem(data);
        } catch (err) {
            setError("System unreachable. Ensure the agent is running or backend is live.");
        }
    };

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            let url = `/api/recommendations?task=${selectedTask}&search=${encodeURIComponent(searchQuery)}`;
            if (deviceId) url += `&deviceId=${deviceId}`;

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
                    <div className="edu-tag">Project LLM-Checker</div>
                    <h1>LLM-Checkmate</h1>
                    <p>
                        Automatically analyze your hardware boundaries and discover trending
                        Large Language Models designed for your specific machine profile.
                        Scan your local machine or connect to a remote agent.
                    </p>
                    <div className="nav-buttons">
                        <button className="nav-btn" onClick={() => setView('dashboard')}>
                            Browse Hardware Registry
                        </button>
                        <button className="nav-btn nav-btn-outline" onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}>
                            Get CLI Agent
                        </button>
                    </div>
                </section>

                <section className="edu-grid" id="agent-section">
                    <div className="edu-card">
                        <div className="edu-tag">01. Setup</div>
                        <h3>Connect Your Computer</h3>
                        <p>
                            Since browsers cannot see your hardware, you need to run our safe scanner on your **local machine**.
                            Open your terminal (**CMD**, **PowerShell**, or **iTerm**) and run:
                        </p>
                        <div className="code-block" style={{ background: '#0a0a0a', padding: '1.2rem', marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '8px', position: 'relative' }}>
                            <div style={{ fontSize: '0.7rem', color: '#444', marginBottom: '0.5rem', textTransform: 'uppercase' }}>On your local machine:</div>
                            <code style={{ color: 'var(--primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', display: 'block', wordBreak: 'break-all' }}>
                                python -m pip install "git+https://github.com/Prathamesh-Udoshi/LLM-Checkmate.git#subdirectory=llm-checkmate-agent"<br /><br />
                                <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}># Run the scan (If first command fails, try the second)</div>
                                llm-checkmate scan --backend {window.location.origin}<br />
                                python -m llm_checkmate_agent scan --backend {window.location.origin}
                            </code>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '1rem' }}>
                            *The agent will provide a personalized link once the scan is complete.*
                        </p>
                    </div>

                    <div className="edu-card">
                        <div className="edu-tag">02. Methodology</div>
                        <h3>Compatibility Logic</h3>
                        <p>
                            LLM-Checkmate analyzes your system's CPU, RAM, and GPU (VRAM) to determine the largest
                            possible model size (in billions of parameters) you can run. It then cross-references
                            this with a curated registry of popular LLMs, providing a compatibility score.
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

            <span className="back-link" onClick={() => setView('landing')}>← Back to Repository Info</span>

            <header>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1>Hardware Compatibility Analyzer</h1>
                    {deviceId && (
                        <div style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)', padding: '0.3rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500', border: '1px solid var(--primary)' }}>
                            ● REMOTE AGENT ACTIVE
                        </div>
                    )}
                </div>
                <div className="subtitle">Real-time resource mapping for {system?.cpu?.brand}.</div>
            </header>

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
                {/* Machine Specs Sidebar */}
                <div className="specs-section">
                    <h2>Machine Context</h2>
                    <div className="spec-row">
                        <span className="spec-label">Operating System</span>
                        <span className="spec-value">{system?.os?.distro}</span>
                    </div>
                    <div className="spec-row">
                        <span className="spec-label">Processor</span>
                        <span className="spec-value">{system?.cpu?.brand?.split(' CPU')[0]}</span>
                    </div>
                    <div className="spec-row">
                        <span className="spec-label">System Memory</span>
                        <span className="spec-value">{system?.ram?.baseGB} GB Total</span>
                    </div>
                    {system?.gpu?.map((g, i) => (
                        <div className="spec-row" key={i}>
                            <span className="spec-label">GPU {i + 1}</span>
                            <span className="spec-value">{g.model} / {g.vramGB}GB VRAM</span>
                        </div>
                    ))}
                </div>

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
