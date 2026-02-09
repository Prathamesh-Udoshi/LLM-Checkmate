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
    const [system, setSystem] = useState(null);
    const [models, setModels] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [selectedTask, setSelectedTask] = useState('text-generation');
    const [selectedProvider, setSelectedProvider] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchTasks();
        fetchSystemInfo();
    }, []);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            fetchRecommendations();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [selectedTask, searchQuery]);

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
            const res = await fetch('/api/system-info');
            const data = await res.json();
            setSystem(data);
        } catch (err) {
            setError("System unreachable.");
        }
    };

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/recommendations?task=${selectedTask}&search=${encodeURIComponent(searchQuery)}`);
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

    const getStatusClass = (status) => {
        if (status.includes('Not Feasible')) return 'status-impossible';
        if (status.includes('Runnable Locally')) return 'status-runnable';
        return 'status-quant';
    };

    return (
        <div className="container">
            {loading && <div className="loading-overlay"></div>}

            <header>
                <h1>Hardware Compatibility Analyzer</h1>
                <div className="subtitle">Real-time resource mapping for Hugging Face registry.</div>
            </header>

            {/* Filter Section */}
            <div className="filter-bar">
                <div className="filter-group">
                    <label>Search</label>
                    <input
                        type="text"
                        placeholder="Model name (e.g. Llama 3)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-group">
                    <label>Category</label>
                    <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
                        {tasks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Provider</label>
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
                        <span className="spec-value">{system?.cpu?.brand} ({system?.cpu?.cores} Cores)</span>
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

                {/* Model Results Main */}
                <div className="models-section">
                    <div className="model-header">
                        <span>Model Identity</span>
                        <span>Compatibility</span>
                        <span>Suggested Stack</span>
                        <span>Repository</span>
                    </div>

                    <div className="model-list">
                        {filteredModels.map((model) => (
                            <div className="model-row" key={model.id}>
                                <div className="model-identity">
                                    <div className="model-name">{model.name}</div>
                                    <div className="model-meta">
                                        {model.params}B Parameters • {model.downloads.toLocaleString()} downloads
                                    </div>
                                </div>

                                <div className={`status-badge ${getStatusClass(model.status)}`}>
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
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
