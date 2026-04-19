/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ComponentType, Direction, TileState, THEME, ToolMode, Blueprint, ViewState, Level, LEVELS_DATA, GRID_SIZE, SandboxMeta, SandboxSize } from './constants';
import { LogicCanvas } from './components/LogicCanvas';
import { AIArchitectUI } from './components/AIArchitectUI';
import { tickGrid } from './engine/logic';
import { drawTile } from './engine/draw';
import {
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Minus,
  Triangle,
  Zap,
  Square,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  Plus,
  Trash2,
  Share2,
  Terminal,
  Settings,
  MousePointer2,
  FileCode,
  Save,
  Grid,
  ChevronLeft,
  X,
  Dices,
  Layers,
  Layout,
  Music,
  Timer,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Sparse grid serialization ─────────────────────────────────────────────────
// Stores only non-empty cells so large/unlimited grids don't blow localStorage.
type SparseSave = {
  rows: number;
  cols: number;
  cells: Array<{ r: number; c: number; cell: TileState }>;
};

const serializeGrid = (grid: TileState[][]): string => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const cells: SparseSave['cells'] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== ComponentType.EMPTY) {
        cells.push({ r, c, cell: grid[r][c] });
      }
    }
  }
  return JSON.stringify({ rows, cols, cells } as SparseSave);
};

const deserializeGrid = (raw: string): TileState[][] | null => {
  try {
    const data = JSON.parse(raw);
    // Legacy format: plain 2-D array
    if (Array.isArray(data)) return data as TileState[][];
    // Sparse format
    const { rows, cols, cells } = data as SparseSave;
    const empty = (): TileState => ({
      type: ComponentType.EMPTY,
      state: false,
      nextState: false,
      direction: Direction.NORTH,
      manualToggle: false,
      stateH: false,
      stateV: false,
    });
    const grid: TileState[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => empty())
    );
    for (const { r, c, cell } of cells) {
      if (r < rows && c < cols) grid[r][c] = cell;
    }
    return grid;
  } catch {
    return null;
  }
};
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENTS = [
  { type: ComponentType.WIRE, icon: Minus, label: 'Wire', color: '#7C3AED' },
  { type: ComponentType.INVERTER, icon: Triangle, label: 'Inverter', color: '#5B21B6' },
  { type: ComponentType.INPUT_LEVER, icon: Square, label: 'On/Off Switch', color: '#8B5CF6' },
  { type: ComponentType.OUTPUT_LAMP, icon: Lightbulb, label: 'Light Bulb', color: '#7C3AED' },
  { type: ComponentType.NOTE_BLOCK, icon: Music, label: 'Note Block', color: '#D97706' },
  { type: ComponentType.BUFFER, icon: Timer, label: 'Signal Buffer', color: '#F59E0B' },
  { type: ComponentType.BRIDGE, icon: Plus, label: 'Crossing', color: '#A78BFA' },
  { type: ComponentType.EMPTY, icon: Trash2, label: 'Eraser', color: '#EF4444' },
];

const COMPONENT_META = {
  [ComponentType.WIRE]: {
    description: "Carries power from one spot to another. Super simple, connects everything together!"
  },
  [ComponentType.INVERTER]: {
    description: "The Flipper! It turns an ON signal into OFF, and an OFF signal into ON. Just feed the signal into the back of it."
  },
  [ComponentType.INPUT_LEVER]: {
    description: "Your main controls. Click it to switch power ON or OFF whenever you want."
  },
  [ComponentType.OUTPUT_LAMP]: {
    description: "Lights up when it gets power. Use this to see if your logic actually works!"
  },
  [ComponentType.NOTE_BLOCK]: {
    description: "The Sound Maker! Plays a piano note when powered. Click it in the sandbox to change its note."
  },
  [ComponentType.BRIDGE]: {
    description: "The Crossing Overpass. Lets you cross two wires without them touching or mixing their signals."
  },
  [ComponentType.BUFFER]: {
    description: "The Delay Master! Holds a signal for a specific amount of time before passing it forward. Click it to set ms delay."
  },
  [ComponentType.EMPTY]: {
    description: "Made a mistake? Just use the eraser to clear any block back to empty space."
  }
};

const ComponentPreview = ({ type }: { type: ComponentType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 160;
    const padding = 20;
    const innerSize = size - padding * 2;
    canvas.width = size;
    canvas.height = size;

    // Grid backgound
    ctx.fillStyle = '#F4F2F7';
    ctx.fillRect(0, 0, size, size);

    const cell: TileState = {
      type,
      state: true,
      stateH: true,
      stateV: true,
      nextState: true,
      direction: Direction.NORTH,
      manualToggle: true,
    };

    drawTile(ctx, cell, padding, padding, innerSize, 0);
  }, [type]);

  return <canvas ref={canvasRef} className="rounded-xl shadow-inner border-4 border-[#1F1B2E] bg-[#F4F2F7]" />;
};

const HelpModal = ({ type, onClose, tutorialSlides }: { type?: ComponentType, onClose: () => void, tutorialSlides?: { title: string, content: string, image?: string }[] }) => {
  const [slideIndex, setSlideIndex] = useState(0);

  if (tutorialSlides) {
    const slide = tutorialSlides[slideIndex];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1F1B2E]/90 backdrop-blur-xl p-6"
      >
        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl border-8 border-[#1F1B1B]"
        >
          <div className="p-12 text-center">
            <h2 className="text-4xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4 italic flex items-center justify-center gap-4">
              <Zap className="w-10 h-10 text-[#7C3AED] fill-current" />
              {slide.title}
            </h2>
            <div className="h-px bg-[#D1CDD9] w-24 mx-auto mb-8" />
            <p className="text-xl text-[#4A3B66] leading-relaxed font-bold mb-12 max-w-lg mx-auto">
              {slide.content}
            </p>
            <div className="flex items-center justify-center gap-4">
              {slideIndex > 0 && (
                <button
                  onClick={() => setSlideIndex(slideIndex - 1)}
                  className="px-8 py-4 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#D1CDD9] transition-all"
                >
                  Previous
                </button>
              )}
              {slideIndex < tutorialSlides.length - 1 ? (
                <button
                  onClick={() => setSlideIndex(slideIndex + 1)}
                  className="px-12 py-4 bg-[#7C3AED] text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                >
                  Next Step
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-12 py-4 bg-[#1F1B2E] text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:bg-[#7C3AED] transition-all"
                >
                  Start Mission
                </button>
              )}
            </div>
            <div className="mt-8 flex justify-center gap-2">
              {tutorialSlides.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === slideIndex ? 'w-8 bg-[#7C3AED]' : 'bg-[#D1CDD9]'}`} />
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  const meta = COMPONENT_META[type as keyof typeof COMPONENT_META];
  if (!meta) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1F1B2E]/80 backdrop-blur-md p-6"
    >
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border-4 border-[#1F1B2E]"
      >
        <div className="h-56 bg-[#EDEBF2] relative overflow-hidden flex items-center justify-center">
          <ComponentPreview type={type as ComponentType} />
        </div>
        <div className="p-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-3xl font-black uppercase text-[#1F1B2E] tracking-tight">
              {COMPONENTS.find(c => c.type === type)?.label}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-[#F4F2F7] rounded-full transition-colors">
              <X className="w-8 h-8 text-[#1F1B2E]" />
            </button>
          </div>
          <p className="text-lg text-[#4A3B66] leading-relaxed font-medium">
            {meta.description}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

const SandboxMenuView = ({
  sandboxes, setSandboxes, setView, setActiveSandboxId, setGridData
}: any) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState<SandboxSize>('medium');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const newSandbox: SandboxMeta = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      size: newSize,
      lastModified: Date.now()
    };
    setSandboxes((prev: SandboxMeta[]) => [newSandbox, ...prev]);

    let gridSize = 100;
    if (newSize === 'small') gridSize = 50;
    if (newSize === 'large') gridSize = 200;
    if (newSize === 'unlimited') gridSize = 50;

    const emptyGrid = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ({
        type: ComponentType.EMPTY,
        state: false,
        nextState: false,
        direction: Direction.NORTH,
        manualToggle: false,
      }))
    );

    localStorage.setItem(`spectre_sandbox_data_${newSandbox.id}`, serializeGrid(emptyGrid));

    setShowCreate(false);
    setNewName('');
    setActiveSandboxId(newSandbox.id);
    setGridData(emptyGrid);
    setView(ViewState.SANDBOX);
  };

  const handleLoad = (sandbox: SandboxMeta) => {
    const savedData = localStorage.getItem(`spectre_sandbox_data_${sandbox.id}`);
    if (savedData) {
      const parsed = deserializeGrid(savedData);
      setGridData(parsed);
    } else {
      setGridData(null);
    }
    setActiveSandboxId(sandbox.id);
    setView(ViewState.SANDBOX);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this sandbox forever?')) {
      setSandboxes((prev: SandboxMeta[]) => prev.filter(s => s.id !== id));
      localStorage.removeItem(`spectre_sandbox_data_${id}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen bg-[#F8F7FA] flex flex-col p-12 overflow-y-auto"
    >
      <div className="max-w-4xl w-full mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black text-[#1F1B2E] tracking-tighter uppercase">Sandbox Directory</h1>
            <p className="text-[#7C3AED] font-mono tracking-widest text-sm uppercase mt-2">Architecture Studio</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setView(ViewState.TITLE)} className="px-6 py-3 border-2 border-[#1F1B2E] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#EDEBF2] transition-colors">
              Return
            </button>
            <button onClick={() => setShowCreate(true)} className="px-6 py-3 bg-[#7C3AED] text-white rounded-xl font-black uppercase tracking-widest hover:bg-[#1F1B2E] transition-colors shadow-lg flex items-center gap-2">
              <Plus className="w-5 h-5" /> New Sandbox
            </button>
          </div>
        </header>

        {sandboxes.length === 0 ? (
          <div className="text-center py-20 border-4 border-dashed border-[#D1CDD9] rounded-3xl">
            <Layout className="w-16 h-16 text-[#D1CDD9] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#4A3B66]">No Sandboxes Found</h2>
            <p className="text-[#7C3AED] font-mono mt-2">Initialize a new environment to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sandboxes.map(sandbox => (
              <motion.div key={sandbox.id} whileHover={{ y: -5 }} onClick={() => handleLoad(sandbox)}
                className="bg-white border-2 border-[#D1CDD9] hover:border-[#7C3AED] rounded-2xl p-6 cursor-pointer shadow-sm hover:shadow-xl transition-all group relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-[#EDEBF2] rounded-xl flex items-center justify-center text-[#7C3AED]">
                    <Layout className="w-6 h-6" />
                  </div>
                  <button onClick={(e) => handleDelete(sandbox.id, e)} className="p-2 text-[#D1CDD9] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="text-xl font-black text-[#1F1B2E] mb-1 truncate">{sandbox.name}</h3>
                <div className="flex items-center gap-3 text-xs font-mono text-[#4A3B66] uppercase">
                  <span className="bg-[#EDEBF2] px-2 py-1 rounded">{sandbox.size}</span>
                  <span>{new Date(sandbox.lastModified).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1B2E]/80 backdrop-blur-sm p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 border-4 border-[#1F1B2E] shadow-[20px_20px_0px_#7C3AED]"
            >
              <h2 className="text-2xl font-black uppercase tracking-tight text-[#1F1B2E] mb-6">Initialize Environment</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-mono font-bold text-[#7C3AED] uppercase tracking-widest mb-2">Sandbox Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                    className="w-full bg-[#F4F2F7] border-2 border-[#D1CDD9] rounded-xl p-4 font-bold text-[#1F1B2E] focus:border-[#7C3AED] focus:outline-none"
                    placeholder="E.g. CPU Core 1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[#7C3AED] uppercase tracking-widest mb-2">Matrix Size</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['small', 'medium', 'large', 'unlimited'] as SandboxSize[]).map(size => (
                      <button key={size} onClick={() => setNewSize(size)}
                        className={`p-3 rounded-lg border-2 text-center text-sm font-black uppercase transition-all ${newSize === size ? 'border-[#7C3AED] bg-[#7C3AED] text-white shadow-md' : 'border-[#D1CDD9] text-[#4A3B66] hover:border-[#7C3AED]/50'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  {newSize === 'unlimited' && <p className="text-xs text-[#7C3AED] mt-2 font-mono italic">Dynamic expansion active. Camera viewport enabled.</p>}
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowCreate(false)} className="flex-1 py-4 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#D1CDD9] transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 py-4 bg-[#1F1B2E] text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:bg-[#7C3AED] transition-all disabled:opacity-50">
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const SandboxView = ({
  setView, isPlaying, setIsPlaying, tickRate, setTickRate, selectedComponent, setSelectedComponent,
  selectedDirection, setSelectedDirection, setGridData, gridData, toolMode, setToolMode, selection, setSelection,
  selectedBlueprint, setSelectedBlueprint, blueprints, setBlueprints, setIsSaving, isSaving,
  newBlueprintName, setNewBlueprintName, confirmSaveBlueprint, handleExport, handleSelectBlueprint,
  zoom, setZoom, deleteSelected, setShowDeleteConfirm, activeSandbox, noteConfig, setNoteConfig,
  bufferConfig, setBufferConfig, onNotePlay
}: any) => {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [helpType, setHelpType] = useState<ComponentType | null>(null);
  const [showArchitect, setShowArchitect] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-screen bg-[#F8F7FA] flex flex-col overflow-hidden"
    >
      <AnimatePresence>
        {helpType && <HelpModal type={helpType} onClose={() => setHelpType(null)} />}
      </AnimatePresence>

      {/* AI Architect Modal */}
      <AnimatePresence>
        {showArchitect && (
          <AIArchitectUI
            onClose={() => setShowArchitect(false)}
            onSaveToLab={(bp) => {
              setBlueprints((prev: any) => [...prev, bp]);
              setShowArchitect(false);
            }}
            onStampToSandbox={(bp) => {
              setSelectedBlueprint(bp);
              setToolMode(ToolMode.STAMP);
              setShowArchitect(false);
            }}
          />
        )}
      </AnimatePresence>

      <header className="h-16 border-b border-[#D1CDD9] bg-white flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-8">
          <button onClick={() => setView(ViewState.TITLE)} className="hover:text-[#7C3AED] transition-colors flex items-center gap-3">
            <X className="w-5 h-5" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1F1B2E]">Terminate Session</span>
          </button>
          <div className="h-6 w-px bg-[#D1CDD9]" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-[#7C3AED] rounded flex items-center justify-center">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-sm font-black tracking-tight text-[#1F1B2E] uppercase">Architecture Studio // Sandbox</h1>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* AI Architect trigger */}
          <button
            onClick={() => setShowArchitect(true)}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg font-mono font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
              color: '#fff',
              boxShadow: '0 4px 18px rgba(124,58,237,0.45)',
            }}
          >
            <Cpu className="w-4 h-4" />
            AI Architect
          </button>

          <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-[#7C3AED]">
            <span className="opacity-50 uppercase tracking-widest text-[#1F1B2E]">Sim Clock</span>
            <input
              type="range" min="1" max="60" value={tickRate}
              onChange={(e) => setTickRate(Number(e.target.value))}
              className="w-32 accent-[#7C3AED]"
            />
            <span className="w-10 text-right font-black border-b border-[#7C3AED]/20">{tickRate}Hz</span>
          </div>
          <div className="flex bg-[#EDEBF2] rounded p-1 border border-[#D1CDD9]">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-3 px-6 py-2 rounded transition-all font-bold ${isPlaying ? 'bg-[#7C3AED] text-white shadow-xl' : 'bg-white text-[#7C3AED]'}`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span className="font-mono text-[10px] uppercase tracking-widest">{isPlaying ? 'Halt' : 'Execute'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <motion.aside
          animate={{ width: isSidebarExpanded ? 240 : 80 }}
          className="bg-white border-r border-[#D1CDD9] flex flex-col items-stretch py-6 px-4 gap-3 shrink-0 overflow-y-auto hidden-scrollbar z-10"
        >
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="w-full flex items-center justify-center py-2 mb-4 hover:bg-[#F8F7FA] rounded-lg transition-colors"
          >
            {isSidebarExpanded ? <ChevronLeft className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
          </button>

          <button
            onClick={() => { setToolMode(ToolMode.SELECT); setSelectedComponent(ComponentType.SELECT); }}
            className={`w-full h-12 rounded-lg flex items-center gap-4 px-3 transition-all ${toolMode === ToolMode.SELECT ? 'bg-[#1F1B2E] text-white shadow-xl' : 'text-[#4A3B66] hover:bg-[#F8F7FA]'}`}
          >
            <MousePointer2 className="w-6 h-6 shrink-0" />
            {isSidebarExpanded && <span className="text-[10px] font-mono font-black uppercase overflow-hidden whitespace-nowrap">Selector</span>}
          </button>
          <div className="w-full h-px bg-[#D1CDD9] my-1" />
          {COMPONENTS.map((item) => (
            <div key={item.type} className="flex items-center gap-1 group relative">
              <button
                onClick={() => { setToolMode(ToolMode.PLACE); setSelectedComponent(item.type); }}
                className={`flex-1 h-12 rounded-lg flex items-center gap-4 px-3 transition-all ${toolMode === ToolMode.PLACE && selectedComponent === item.type ? 'bg-[#7C3AED] text-white shadow-xl' : 'text-[#4A3B66] hover:bg-[#F8F7FA]'}`}
              >
                <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110 shrink-0 ${item.type === ComponentType.INVERTER ? 'rotate-90' : ''}`} />
                {isSidebarExpanded && <span className="text-[10px] font-mono font-black uppercase overflow-hidden whitespace-nowrap">{item.label}</span>}
              </button>
              {isSidebarExpanded && (
                <button
                  onClick={() => setHelpType(item.type)}
                  className="w-8 h-8 rounded-full hover:bg-[#EDEBF2] flex items-center justify-center transition-colors shrink-0"
                >
                  <Terminal className="w-3 h-3 text-[#7C3AED]" />
                </button>
              )}
            </div>
          ))}
        </motion.aside>

        <div className="flex-1 relative bg-[#F4F2F7] overflow-hidden">
          <div className="fixed top-24 left-32 z-[170] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
              {isPlaying && (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                  className="bg-[#1F1B2E] text-white px-4 py-2 rounded border border-[#7C3AED]/30 flex items-center gap-3 shadow-2xl backdrop-blur-md"
                >
                  <div className="w-2 h-2 bg-[#7C3AED] animate-ping rounded-full" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Sim_Active</span>
                </motion.div>
              )}
              {toolMode === ToolMode.SELECT && selection && (
                <div className="flex gap-4 pointer-events-auto">
                  <motion.button initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    className="bg-[#7C3AED] text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] hover:bg-[#1F1B2E] transition-all"
                    onClick={() => setIsSaving(true)}
                  >
                    <Save className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Capture Pattern</span>
                  </motion.button>
                  <motion.button initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    className="bg-red-500 text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] hover:bg-red-600 transition-all"
                    onClick={() => {
                      const xStart = Math.min(selection.x1, selection.x2);
                      const xEnd = Math.max(selection.x1, selection.x2);
                      const yStart = Math.min(selection.y1, selection.y2);
                      const yEnd = Math.max(selection.y1, selection.y2);
                      const count = (xEnd - xStart + 1) * (yEnd - yStart + 1);
                      if (count > 50) {
                        setShowDeleteConfirm(true);
                      } else {
                        deleteSelected();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Delete Selected</span>
                  </motion.button>
                </div>
              )}
              {toolMode === ToolMode.STAMP && selectedBlueprint && (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                  className="bg-[#5B21B6] text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] pointer-events-auto"
                >
                  <Grid className="w-4 h-4" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Deploy: {selectedBlueprint.name}</span>
                  <button onClick={() => { setToolMode(ToolMode.PLACE); setSelectedBlueprint(null); }} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="absolute inset-0 bg-[#F4F2F7]">
            <LogicCanvas
              isPlaying={isPlaying} tickRate={tickRate}
              selectedComponent={selectedComponent} selectedDirection={selectedDirection}
              onGridChange={setGridData} toolMode={toolMode} grid={gridData}
              onSelectionUpdate={setSelection} selectedBlueprint={selectedBlueprint}
              onStampComplete={() => { setToolMode(ToolMode.PLACE); setSelectedBlueprint(null); setSelectedComponent(ComponentType.WIRE); }}
              zoom={zoom}
              setZoom={setZoom}
              activeSandbox={activeSandbox}
              onNoteBlockClick={(x, y, note) => setNoteConfig({ x, y, currentNote: note })}
              onBufferClick={(x, y, delay) => setBufferConfig({ x, y, currentDelay: delay })}
              onNotePlay={onNotePlay}
            />
          </div>
        </div>

        <AnimatePresence>
          {noteConfig && (
            <NoteSelector
              currentNote={noteConfig.currentNote}
              onClose={() => setNoteConfig(null)}
              onSelect={(note) => {
                if (!gridData) return;
                const next = [...gridData.map(r => [...r])];
                next[noteConfig.y][noteConfig.x] = { ...next[noteConfig.y][noteConfig.x], noteKey: note };
                setGridData(next);
                setNoteConfig({ ...noteConfig, currentNote: note });
              }}
            />
          )}
          {bufferConfig && (
            <BufferConfig
              x={bufferConfig.x}
              y={bufferConfig.y}
              currentDelay={bufferConfig.currentDelay}
              onSave={(x: number, y: number, delay: number) => {
                if (!gridData) return;
                const next = [...gridData.map(r => [...r])];
                next[y][x] = { ...next[y][x], delayMs: delay, history: [] };
                setGridData(next);
                setBufferConfig(null);
              }}
              onClose={() => setBufferConfig(null)}
            />
          )}
        </AnimatePresence>

        <aside className="w-80 bg-white border-l border-[#D1CDD9] flex flex-col overflow-hidden shrink-0 z-10">
          <div className="p-6 border-b border-[#D1CDD9] bg-[#F8F7FA]">
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-5 flex items-center gap-2">
              Matrix_Scale
            </h3>
            <div className="flex items-center gap-4">
              <input
                type="range" min="0.5" max="2.0" step="0.1" value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#7C3AED]"
              />
              <span className="font-mono text-[10px] font-black text-[#1F1B2E] min-w-[32px]">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-5 flex items-center gap-2">
              <FileCode className="w-4 h-4" /> Cell_Laboratory
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {blueprints.length === 0 && (
                <div className="py-12 px-6 border-2 border-dashed border-[#D1CDD9] rounded-xl text-center">
                  <span className="text-[9px] font-mono font-bold text-[#CDC5D5] uppercase tracking-widest block">Archive is offline.</span>
                </div>
              )}
              {blueprints.map(bp => (
                <motion.div
                  layout key={bp.id} onClick={() => handleSelectBlueprint(bp)}
                  whileHover={{ x: 5 }}
                  className={`w-full group relative p-5 bg-white border-2 rounded-xl text-left transition-all cursor-pointer ${selectedBlueprint?.id === bp.id ? 'border-[#7C3AED] bg-[#7C3AED]/5 shadow-xl' : 'border-[#D1CDD9] hover:border-[#7C3AED] shadow-sm'}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[11px] font-black uppercase tracking-tight truncate flex-1">{bp.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setBlueprints((prev: any) => prev.filter((b: any) => b.id !== bp.id)); }} className="w-6 h-6 rounded-full flex items-center justify-center text-[#D1CDD9] hover:text-red-500 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-[9px] font-mono font-bold text-[#7C3AED]/60 uppercase">Dim: {bp.width}x{bp.height}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-[#EDEBF2] border-t border-[#D1CDD9]">
            <button onClick={handleExport} className="w-full flex items-center justify-center gap-3 py-4 bg-[#1F1B2E] text-white rounded-xl text-[10px] font-mono font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:bg-[#7C3AED]">
              <Share2 className="w-4 h-4" /> Export_Matrix
            </button>
          </div>
        </aside>
      </div>
    </motion.div>
  );
};

const TitleView = ({ setView, onReset, onUnlockAll, isSandboxUnlocked }: any) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="min-h-screen flex flex-col items-center justify-center bg-white p-8 relative overflow-hidden"
  >
    <div className="absolute inset-0 z-0 opacity-[0.05] pointer-events-none"
      style={{ backgroundImage: `radial-gradient(${THEME.accent} 1.5px, transparent 1.5px)`, backgroundSize: '40px 40px' }} />

    <div className="z-10 text-center space-y-16">
      <div className="space-y-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
          className="w-24 h-24 bg-[#7C3AED] rounded-2xl mx-auto flex items-center justify-center shadow-[10px_10px_0_#1F1B2E]"
        >
          <Cpu className="w-14 h-14 text-white" />
        </motion.div>
        <div className="space-y-2">
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-8xl font-black tracking-tighter text-[#1F1B2E]"
          >
            SPECTRE<span className="text-[#7C3AED]">LOGIC</span>
          </motion.h1>
          <p className="text-[10px] font-mono font-black tracking-[0.5em] text-[#7C3AED] uppercase">Physical Computation Sandbox</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 max-w-sm mx-auto">
        <motion.button whileHover={{ scale: 1.05, x: 10 }} whileTap={{ scale: 0.95 }}
          onClick={() => setView(ViewState.CAMPAIGNS)}
          className="group flex items-center justify-between p-8 bg-white text-[#1F1B2E] border-2 border-[#1F1B2E] rounded-2xl transition-all shadow-[10px_10px_0_#EDEBF2] hover:shadow-[10px_10px_0_#7C3AED]"
        >
          <div className="flex items-center gap-6 text-left">
            <Layers className="w-8 h-8 text-[#7C3AED]" />
            <span className="font-mono font-black text-lg uppercase tracking-widest block text-[#1F1B2E]">Campaigns</span>
          </div>
          <ChevronRight className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-all text-[#7C3AED]" />
        </motion.button>

        <div className="relative group">
          <motion.button
            whileHover={isSandboxUnlocked ? { scale: 1.05, x: 10 } : {}}
            whileTap={isSandboxUnlocked ? { scale: 0.95 } : {}}
            disabled={!isSandboxUnlocked}
            onClick={() => setView(ViewState.SANDBOX_MENU)}
            className={`w-full group flex items-center justify-between p-8 border-2 rounded-2xl transition-all shadow-[10px_10px_0_#7C3AED] ${isSandboxUnlocked ? 'bg-[#1F1B2E] text-white border-[#1F1B2E]' : 'bg-[#EDEBF2] text-[#D1CDD9] border-[#D1CDD9] cursor-not-allowed opacity-60'}`}
          >
            <div className="flex items-center gap-6 text-left">
              <Dices className={`w-8 h-8 ${isSandboxUnlocked ? 'text-[#7C3AED]' : 'text-[#D1CDD9]'}`} />
              <div className="flex flex-col">
                <span className="font-mono font-black text-lg uppercase tracking-widest block font-bold">Sandbox</span>
                {!isSandboxUnlocked && <span className="text-[8px] font-mono font-bold uppercase tracking-tight opacity-50">Complete Module 004 to unlock</span>}
              </div>
            </div>
            {isSandboxUnlocked ? (
              <ChevronRight className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-all text-white" />
            ) : (
              <X className="w-6 h-6 text-[#D1CDD9]" />
            )}
          </motion.button>
        </div>

        <div className="flex items-center justify-center gap-6 mt-4">
          <button
            onClick={onReset}
            className="text-[9px] font-mono font-black text-[#D1CDD9] hover:text-red-500 transition-colors uppercase tracking-[0.3em]"
          >
            _Wipe_Memory (Reset)
          </button>
          <button
            onClick={onUnlockAll}
            className="text-[9px] font-mono font-black text-[#D1CDD9] hover:text-[#7C3AED] transition-colors uppercase tracking-[0.3em]"
          >
            _Unlock_All (Debug)
          </button>
        </div>
      </div>

      <motion.footer
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        className="mt-32 max-w-sm text-center"
      >
        <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-mono font-black uppercase text-[#D1CDD9]">
          <span>Built By AI Studio</span>
          <span className="w-1 h-1 bg-[#D1CDD9] rounded-full" />
          <span>Powered By React</span>
          <span className="w-1 h-1 bg-[#D1CDD9] rounded-full" />
          <span>Motion Engine_Framer</span>
        </div>
        <p className="mt-4 text-[10px] font-bold text-[#D1CDD9] leading-relaxed">
          Inspired by classic logic puzzles and circuit architecture. All assets are procedurally rendered in the simulation matrix.
        </p>
      </motion.footer>
    </div>
  </motion.div>
);

const CampaignSelector = ({ setView, onSelectCampaign }: any) => {
  const campaigns = [
    { id: 'Basic Logic', name: 'Basic Logic', icon: Cpu, desc: 'Digital logic fundamentals', color: '#7C3AED' },
    { id: 'More Fun components', name: 'More Fun components', icon: Zap, desc: 'Advanced circuit design', color: '#3B82F6' },
    { id: 'Storage', name: 'Data Storage', icon: Save, desc: 'Memory and registers', locked: true, color: '#D1CDD9' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-screen bg-[#F8F7FA] p-16 flex flex-col items-center justify-center"
    >
      <header className="mb-16 text-center">
        <h2 className="text-5xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4 italic underline decoration-[#7C3AED]">Select Campaign</h2>
        <p className="text-sm font-mono font-bold uppercase tracking-widest text-[#7C3AED]">Choose your simulation theater</p>
      </header>

      <div className="grid grid-cols-3 gap-8 max-w-6xl w-full">
        {campaigns.map(c => (
          <motion.button
            key={c.id}
            disabled={c.locked}
            onClick={() => onSelectCampaign(c.id)}
            whileHover={!c.locked ? { scale: 1.02, y: -5 } : {}}
            className={`p-10 rounded-3xl border-4 text-left flex flex-col justify-between h-80 transition-all ${c.locked ? 'bg-[#EDEBF2] border-[#D1CDD9] opacity-50 grayscale' : 'bg-white border-[#1F1B2E] hover:border-[#7C3AED] shadow-[12px_12px_0px_#1F1B2E]'}`}
          >
            <div>
              <c.icon className={`w-12 h-12 mb-6 ${c.locked ? 'text-[#D1CDD9]' : 'text-[#7C3AED]'}`} />
              <h3 className="text-2xl font-black uppercase tracking-tight text-[#1F1B2E]">{c.name}</h3>
              <p className="text-xs font-medium text-[#7C3AED] mt-2 italic opacity-80">{c.desc}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">{c.locked ? 'Locked' : 'Deployment Ready'}</span>
              {!c.locked && <ChevronRight className="w-5 h-5 text-[#7C3AED]" />}
            </div>
          </motion.button>
        ))}
      </div>

      <button onClick={() => setView(ViewState.TITLE)} className="mt-20 flex items-center gap-4 text-[#1F1B2E] hover:text-[#7C3AED] transition-all font-mono font-black uppercase text-xs">
        <ChevronLeft className="w-6 h-6" /> Terminate_Selection
      </button>
    </motion.div>
  );
};

const LevelsView = ({ setView, campaign, onStartLevel, completedLevels }: any) => {
  const levels = LEVELS_DATA.filter(l => l.campaign === campaign);

  const isUnlocked = (levelId: string) => {
    const index = levels.findIndex(l => l.id === levelId);
    if (index === 0) return true;
    const prevLevelId = levels[index - 1].id;
    return completedLevels.includes(prevLevelId);
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }}
      className="min-h-screen bg-[#F8F7FA] p-16 flex flex-col"
    >
      <header className="flex items-center justify-between mb-24 max-w-7xl mx-auto w-full">
        <button onClick={() => setView(ViewState.CAMPAIGNS)} className="flex items-center gap-4 text-[#1F1B2E] hover:text-[#7C3AED] transition-all group font-mono font-black uppercase text-xs">
          <ChevronLeft className="w-6 h-6" /> Back_To_Campaigns
        </button>
        <div className="text-center">
          <h2 className="text-4xl font-black uppercase text-[#1F1B2E] tracking-tight text-center">{campaign} Modules</h2>
          <p className="text-[10px] font-mono font-bold text-[#7C3AED] uppercase tracking-[0.4em] mt-2">Active Strategic Deployment</p>
        </div>
        <div className="w-40" />
      </header>
      <div className="max-w-7xl mx-auto w-full grid grid-cols-3 gap-12">
        {levels.map((levelData) => {
          const unlocked = isUnlocked(levelData.id);
          const completed = completedLevels.includes(levelData.id);

          return (
            <motion.button
              key={levelData.id}
              disabled={!unlocked}
              onClick={() => onStartLevel(levelData)}
              whileHover={unlocked ? { y: -10 } : {}}
              className={`h-64 bg-white border-2 rounded-2xl p-10 flex flex-col justify-between group overflow-hidden relative transition-all ${unlocked ? 'border-[#1F1B2E] shadow-[12px_12px_0px_#1F1B2E] hover:shadow-[12px_12px_0px_#7C3AED] hover:border-[#7C3AED]' : 'border-gray-200 grayscale opacity-40 active:scale-100 cursor-not-allowed'}`}
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-20 transition-opacity"><Grid className="w-40 h-40" /></div>
              <div className="relative">
                <span className={`text-[11px] font-mono font-black uppercase block mb-2 ${unlocked ? 'text-[#7C3AED]' : 'text-gray-400'}`}>Module_{levelData.module}</span>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-black uppercase text-[#1F1B2E] tracking-tight">{levelData.name}</h3>
                    <p className="text-[10px] italic text-[#7C3AED] mt-2 opacity-60">Objective: {levelData.description.slice(0, 40)}...</p>
                  </div>
                  {levelData.featuredComponent && unlocked && (
                    <div className="w-16 h-16 shrink-0">
                      <ComponentPreview type={levelData.featuredComponent} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 ${completed ? 'bg-green-500' : (unlocked ? 'bg-[#7C3AED] animate-pulse' : 'bg-gray-300')}`} />
                <span className="text-[11px] font-mono font-black uppercase text-[#D1CDD9]">
                  {completed ? 'COMPLETED' : (unlocked ? 'OPERATIONAL' : 'ENCRYPTED')}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

const LevelPlayView = ({
  level, setView, isPlaying, setIsPlaying, tickRate, setTickRate, selectedComponent, setSelectedComponent,
  selectedDirection, setSelectedDirection, setGridData, gridData, onSubmit, isVerifying, forcedLevers,
  zoom, setZoom, toolMode, setToolMode, selection, setSelection, setIsSaving, isSaving,
  blueprints, setBlueprints, handleSelectBlueprint, selectedBlueprint, setSelectedBlueprint,
  isGuidingSelection, setIsGuidingSelection, deleteSelected, setShowDeleteConfirm, setShowLevelResetConfirm,
  noteConfig, setNoteConfig, bufferConfig, setBufferConfig, onNotePlay
}: any) => {
  const [showHint, setShowHint] = useState(false);
  const [hintTimer, setHintTimer] = useState(0);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [helpType, setHelpType] = useState<ComponentType | null>(null);
  const [showTutorial, setShowTutorial] = useState(!!level.tutorialSlides);

  useEffect(() => {
    setShowTutorial(!!level.tutorialSlides);
    setHintTimer(0);
  }, [level.id]);

  useEffect(() => {
    const timer = setInterval(() => setHintTimer(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (level.featuredComponent) {
      setHelpType(level.featuredComponent);
    }
  }, [level.id, level.featuredComponent]);

  const availableComponents = COMPONENTS.filter(item =>
    level.unlockedComponents.includes(item.type)
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-screen bg-[#F8F7FA] flex flex-col overflow-hidden"
    >
      <AnimatePresence>
        {helpType && <HelpModal type={helpType} onClose={() => setHelpType(null)} />}
        {showTutorial && level.tutorialSlides && (
          <HelpModal tutorialSlides={level.tutorialSlides} onClose={() => setShowTutorial(false)} />
        )}
      </AnimatePresence>

      <header className="h-16 border-b border-[#D1CDD9] bg-white flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-8">
          <button
            disabled={isVerifying}
            onClick={() => setView(ViewState.LEVELS)}
            className={`transition-colors flex items-center gap-3 ${isVerifying ? 'opacity-30' : 'hover:text-[#7C3AED]'}`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1F1B2E]">Abort Mission</span>
          </button>
          <div className="h-6 w-px bg-[#D1CDD9]" />
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono font-black text-[#7C3AED] bg-[#7C3AED]/10 px-2 py-1 rounded">Module_{level.module}</span>
            <h1 className="text-sm font-black tracking-tight text-[#1F1B2E] uppercase">{level.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button
            disabled={isVerifying}
            onClick={() => setShowLevelResetConfirm(true)}
            className="px-4 py-2 border-2 border-red-500 text-red-500 rounded font-mono text-[10px] font-black uppercase hover:bg-red-50 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          {hintTimer > 10 && !isVerifying && (
            <button
              onClick={() => setShowHint(!showHint)}
              className="px-4 py-2 border-2 border-[#1F1B2E] rounded font-mono text-[10px] font-black uppercase hover:bg-[#EDEBF2] transition-all flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" /> Stuck?
            </button>
          )}
          <div className="flex bg-[#EDEBF2] rounded p-1 border border-[#D1CDD9]">
            <button
              disabled={isVerifying}
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-3 px-6 py-2 rounded transition-all font-bold ${isVerifying ? 'opacity-50' : (isPlaying ? 'bg-[#1F1B2E] text-white shadow-xl' : 'bg-white text-[#7C3AED]')}`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span className="font-mono text-[10px] uppercase tracking-widest">{isPlaying ? 'Running' : 'Paused'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <motion.aside
          animate={{ width: isSidebarExpanded ? 240 : 80 }}
          style={{ zIndex: isGuidingSelection ? 160 : 10 }}
          className={`bg-white border-r border-[#D1CDD9] flex flex-col items-stretch py-6 px-4 gap-3 shrink-0 overflow-y-auto hidden-scrollbar ${isVerifying ? 'pointer-events-none opacity-50' : ''}`}
        >
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="w-full flex items-center justify-center py-2 mb-4 hover:bg-[#F8F7FA] rounded-lg transition-colors"
          >
            {isSidebarExpanded ? <ChevronLeft className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
          </button>

          {/* New Selection Tool for Component Saver */}
          <div className="relative">
            <button
              onClick={() => { setToolMode(ToolMode.SELECT); setSelectedComponent(ComponentType.SELECT); }}
              className={`w-full h-12 rounded-lg flex items-center gap-4 px-3 transition-all relative ${toolMode === ToolMode.SELECT ? 'bg-[#1F1B2E] text-white shadow-xl' : 'text-[#4A3B66] hover:bg-[#F8F7FA]'} ${isGuidingSelection && level.id === '5' && toolMode !== ToolMode.SELECT ? 'z-[160] bg-white shadow-[0_0_30px_rgba(124,58,237,0.8)] animate-pulse-scale' : 'z-10'}`}
            >
              <MousePointer2 className="w-6 h-6 shrink-0" />
              {isSidebarExpanded && <span className="text-[10px] font-mono font-black uppercase overflow-hidden whitespace-nowrap">Selector</span>}
            </button>
            {isGuidingSelection && level.id === '5' && toolMode !== ToolMode.SELECT && (
              <div className="fixed inset-0 z-[155] pointer-events-none overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200vw] h-[200vw] animate-pulse-hole"
                  style={{
                    background: 'radial-gradient(circle 50px at var(--hole-x, 40px) var(--hole-y, 140px), transparent 100%, #1F1B2E CC)'
                  }}
                />
              </div>
            )}
          </div>
          <div className="w-full h-px bg-[#D1CDD9] my-1" />

          {availableComponents.map((item) => (
            item.type !== ComponentType.SELECT && (
              <div key={item.type} className="flex items-center gap-1 group relative">
                <button
                  onClick={() => { setToolMode(ToolMode.PLACE); setSelectedComponent(item.type); }}
                  className={`flex-1 h-12 rounded-lg flex items-center gap-4 px-3 transition-all ${toolMode === ToolMode.PLACE && selectedComponent === item.type && item.type !== ComponentType.EMPTY ? 'bg-[#7C3AED] text-white shadow-xl' : (toolMode === ToolMode.PLACE && selectedComponent === item.type && item.type === ComponentType.EMPTY ? 'bg-red-500 text-white shadow-xl' : 'text-[#4A3B66] hover:bg-[#F8F7FA]')}`}
                >
                  <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110 shrink-0 ${item.type === ComponentType.INVERTER ? 'rotate-90' : ''} ${item.type === ComponentType.EMPTY && selectedComponent !== ComponentType.EMPTY ? 'text-red-500' : ''}`} />
                  {isSidebarExpanded && <span className={`text-[10px] font-mono font-black uppercase overflow-hidden whitespace-nowrap ${item.type === ComponentType.EMPTY && selectedComponent !== ComponentType.EMPTY ? 'text-red-500' : ''}`}>{item.label}</span>}
                </button>
                {isSidebarExpanded && (
                  <button
                    onClick={() => setHelpType(item.type)}
                    className="w-8 h-8 rounded-full hover:bg-[#EDEBF2] flex items-center justify-center transition-colors shrink-0"
                  >
                    <Terminal className="w-3 h-3 text-[#7C3AED]" />
                  </button>
                )}
              </div>
            )
          ))}
        </motion.aside>

        <div className="flex-1 relative bg-[#F4F2F7] overflow-hidden">
          <div className="fixed top-24 left-32 z-[170] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
              {toolMode === ToolMode.SELECT && selection && (
                <div className="flex gap-4 pointer-events-auto">
                  <motion.button initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    className={`bg-[#7C3AED] text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] hover:bg-[#1F1B2E] transition-all relative z-50`}
                    onClick={() => { setIsSaving(true); setIsGuidingSelection(false); }}
                  >
                    <Save className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Capture Cell</span>
                  </motion.button>
                  <motion.button initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    className="bg-red-500 text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] hover:bg-red-600 transition-all relative z-50"
                    onClick={() => {
                      const xStart = Math.min(selection.x1, selection.x2);
                      const xEnd = Math.max(selection.x1, selection.x2);
                      const yStart = Math.min(selection.y1, selection.y2);
                      const yEnd = Math.max(selection.y1, selection.y2);
                      const count = (xEnd - xStart + 1) * (yEnd - yStart + 1);
                      if (count > 50) {
                        setShowDeleteConfirm(true);
                      } else {
                        deleteSelected();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Delete Selected</span>
                  </motion.button>
                </div>
              )}
              {toolMode === ToolMode.STAMP && selectedBlueprint && (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                  className="bg-[#5B21B6] text-white px-5 py-2.5 rounded border-2 border-[#1F1B2E] flex items-center gap-4 shadow-[6px_6px_0px_#1F1B2E] pointer-events-auto"
                >
                  <Grid className="w-4 h-4" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]">Deploy: {selectedBlueprint.name}</span>
                  <button onClick={() => { setToolMode(ToolMode.PLACE); setSelectedBlueprint(null); }} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isVerifying && (
            <div className="absolute top-4 right-4 z-[60]">
              <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                className="bg-[#1F1B2E] text-white px-6 py-3 rounded-xl shadow-2xl border-2 border-[#7C3AED] flex items-center gap-3"
              >
                <div className="w-2 h-2 bg-[#7C3AED] rounded-full animate-pulse" />
                <span className="text-[10px] font-mono font-black uppercase tracking-widest italic">Verification Active</span>
              </motion.div>
            </div>
          )}

          {showHint && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-[#1F1B2E] text-white px-8 py-4 rounded-xl shadow-2xl border-2 border-[#7C3AED] max-w-md"
            >
              <div className="flex items-center gap-3 mb-2">
                <Terminal className="w-4 h-4 text-[#7C3AED]" />
                <span className="text-[10px] font-mono font-black uppercase tracking-widest">Decrypted_Hint</span>
              </div>
              <p className="text-sm font-medium italic opacity-90">"{level.hint}"</p>
              <button onClick={() => setShowHint(false)} className="absolute top-2 right-2 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
            </motion.div>
          )}

          <div className="absolute inset-0">
            <LogicCanvas
              isPlaying={isPlaying} tickRate={tickRate}
              selectedComponent={selectedComponent} selectedDirection={selectedDirection}
              onGridChange={setGridData} initialGrid={level.initialGrid} grid={gridData}
              isVerifying={isVerifying} forcedLevers={forcedLevers} zoom={zoom} setZoom={setZoom}
              toolMode={toolMode} onSelectionUpdate={setSelection} selectedBlueprint={selectedBlueprint}
              onStampComplete={() => { setToolMode(ToolMode.PLACE); setSelectedBlueprint(null); setSelectedComponent(ComponentType.WIRE); }}
              onNoteBlockClick={(x, y, note) => setNoteConfig({ x, y, currentNote: note })}
              onBufferClick={(x, y, delay) => setBufferConfig({ x, y, currentDelay: delay })}
              onNotePlay={onNotePlay}
            />
          </div>

          <AnimatePresence>
            {noteConfig && (
              <NoteSelector
                currentNote={noteConfig.currentNote}
                onClose={() => setNoteConfig(null)}
                onSelect={(note) => {
                  if (!gridData) return;
                  const next = [...gridData.map(r => [...r])];
                  next[noteConfig.y][noteConfig.x] = { ...next[noteConfig.y][noteConfig.x], noteKey: note };
                  setGridData(next);
                  setNoteConfig({ ...noteConfig, currentNote: note });
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <aside className={`w-80 bg-white border-l border-[#D1CDD9] flex flex-col overflow-hidden shrink-0 z-10 ${isVerifying ? 'pointer-events-none' : ''}`}>
          <div className="p-8 border-b border-[#D1CDD9]">
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-5">Mission_Briefing</h3>
            <p className="text-sm text-[#1F1B2E] font-medium leading-relaxed">{level.description}</p>
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-5 flex items-center gap-2">
              <FileCode className="w-4 h-4" /> Cell_Laboratory
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {blueprints.length === 0 && (
                <div className="py-12 px-6 border-2 border-dashed border-[#D1CDD9] rounded-xl text-center">
                  <span className="text-[9px] font-mono font-bold text-[#CDC5D5] uppercase tracking-widest block">Laboratory Empty. Capture components in the matrix.</span>
                </div>
              )}
              {blueprints.map(bp => (
                <motion.div
                  layout key={bp.id} onClick={() => handleSelectBlueprint(bp)}
                  whileHover={{ x: 5 }}
                  className={`w-full group relative p-3 bg-white border-2 rounded-xl text-left transition-all cursor-pointer ${selectedBlueprint?.id === bp.id ? 'border-[#7C3AED] bg-[#7C3AED]/5 shadow-xl' : 'border-[#D1CDD9] hover:border-[#7C3AED] shadow-sm'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#EDEBF2] rounded-lg shrink-0 flex items-center justify-center text-[8px] font-mono p-1 text-center overflow-hidden uppercase font-black">
                      {bp.preview ? <img src={bp.preview} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : `${bp.width}x${bp.height}`}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="text-[11px] font-black uppercase tracking-tight truncate">{bp.name}</div>
                      <div className="text-[9px] font-mono font-bold text-[#7C3AED]/60 uppercase">{bp.width}x{bp.height} Matrix</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setBlueprints((prev: any) => prev.filter((b: any) => b.id !== bp.id)); }} className="w-6 h-6 rounded-full flex items-center justify-center text-[#D1CDD9] hover:text-red-500 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="p-8 border-b border-[#D1CDD9] bg-[#F8F7FA]">
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-5">Matrix_Scale</h3>
            <div className="flex items-center gap-4">
              <input
                type="range" min="0.5" max="2.0" step="0.1" value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#7C3AED]"
              />
              <span className="font-mono text-[10px] font-black text-[#1F1B2E] min-w-[32px]">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="mt-auto p-8 bg-[#EDEBF2] border-t border-[#D1CDD9]">
            <button
              disabled={isVerifying}
              onClick={onSubmit}
              className={`w-full flex items-center justify-center gap-3 py-6 rounded-2xl text-[12px] font-mono font-black uppercase tracking-[0.3em] transition-all shadow-xl ${isVerifying ? 'bg-[#D1CDD9] text-[#4A3B66]' : 'bg-[#7C3AED] text-white shadow-[0_10px_20px_-5px_#7C3AED] hover:bg-[#1F1B2E] hover:shadow-none'}`}
            >
              {isVerifying ? 'Running Verify...' : 'Verify_Logic'}
            </button>
          </div>
        </aside>
      </div>
    </motion.div>
  );
};

const PIANO_NOTES: Record<string, number> = {
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77
};

let audioCtx: AudioContext | null = null;

const playNote = (key: string) => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const freq = PIANO_NOTES[key] || 440;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  } catch (e) {
    console.error("Audio playback failed:", e);
  }
};

const NoteSelector = ({ currentNote, onSelect, onClose }: { currentNote: string, onSelect: (note: string) => void, onClose: () => void }) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octaves = [3, 4, 5];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="absolute z-[300] bg-white rounded-2xl shadow-2xl border-4 border-[#1F1B2E] p-6 flex flex-col gap-4"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black uppercase tracking-widest text-[#1F1B2E]">Select Note</h4>
        <button onClick={onClose} className="p-1 hover:bg-[#F4F2F7] rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {octaves.map(oct => (
          <div key={oct} className="flex gap-1">
            {notes.map(n => {
              const fullKey = `${n}${oct}`;
              const isBlack = n.includes('#');
              return (
                <button
                  key={fullKey}
                  onClick={() => { playNote(fullKey); onSelect(fullKey); }}
                  className={`h-12 w-8 rounded-sm flex flex-col items-center justify-end pb-1 text-[8px] font-bold transition-all ${currentNote === fullKey ? 'ring-2 ring-[#7C3AED] ring-offset-2' : ''} ${isBlack ? 'bg-[#1F1B2E] text-white h-8' : 'bg-white text-[#1F1B2E] border border-[#D1CDD9]'}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const BufferConfig = ({ x, y, currentDelay, onClose, onSave }: any) => {
  const [delay, setDelay] = useState(currentDelay);
  const options = [100, 250, 500, 1000, 2000, 5000];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="absolute z-[300] bg-white rounded-2xl shadow-2xl border-4 border-[#1F1B2E] p-8 flex flex-col gap-6"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-black uppercase tracking-widest text-[#1F1B2E] flex items-center gap-3">
          <Timer className="w-6 h-6 text-[#7C3AED]" /> Buffer Timing
        </h4>
        <button onClick={onClose} className="p-2 hover:bg-[#F4F2F7] rounded-full transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => setDelay(opt)}
            className={`py-3 rounded-xl border-2 font-mono font-black text-xs transition-all ${delay === opt ? 'bg-[#1F1B2E] border-[#1F1B2E] text-white' : 'border-[#EDEBF2] text-[#4A3B66] hover:border-[#7C3AED]'}`}
          >
            {opt}ms
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <button onClick={onClose} className="flex-1 py-3 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase text-xs tracking-widest">Cancel</button>
        <button onClick={() => onSave(x, y, delay)} className="flex-1 py-3 bg-[#7C3AED] text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Save</button>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [view, setView] = useState<ViewState>(ViewState.TITLE);
  const [levelPage, setLevelPage] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<Level | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [tickRate, setTickRate] = useState(10);
  const [completedLevels, setCompletedLevels] = useState<string[]>(() => {
    const saved = localStorage.getItem('spectre_completed_levels');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('spectre_completed_levels', JSON.stringify(completedLevels));
  }, [completedLevels]);

  const [savedSolutions, setSavedSolutions] = useState<Record<string, TileState[][]>>(() => {
    const saved = localStorage.getItem('spectre_saved_solutions');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('spectre_saved_solutions', JSON.stringify(savedSolutions));
  }, [savedSolutions]);

  const [showLevelResetConfirm, setShowLevelResetConfirm] = useState(false);

  // Sandbox State
  const [sandboxes, setSandboxes] = useState<SandboxMeta[]>(() => {
    const saved = localStorage.getItem('spectre_sandboxes_meta');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('spectre_sandboxes_meta', JSON.stringify(sandboxes));
  }, [sandboxes]);

  const [activeSandboxId, setActiveSandboxId] = useState<string | null>(null);
  const activeSandbox = sandboxes.find(s => s.id === activeSandboxId);

  const [noteConfig, setNoteConfig] = useState<{ x: number, y: number, currentNote: string } | null>(null);
  const [bufferConfig, setBufferConfig] = useState<{ x: number, y: number, currentDelay: number } | null>(null);


  const [selectedComponent, setSelectedComponent] = useState<ComponentType>(ComponentType.WIRE);
  const [selectedDirection, setSelectedDirection] = useState<Direction>(Direction.EAST);
  const [gridData, setGridData] = useState<TileState[][] | null>(null);
  const [isWinning, setIsWinning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const [isGuidingSelection, setIsGuidingSelection] = useState(false);

  const failureQuotes = [
    "Logic? Never heard of her.",
    "Your circuit is basically a very complicated way to do nothing.",
    "Close, but the laws of physics disagree.",
    "Even my toaster has more logic than this.",
    "Mission failed. We'll get 'em next time... maybe.",
    "The electrons are confused. Please help them.",
    "Computer says NO. (And also LOL)."
  ];

  // Library & Tools State
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.PLACE);
  const gridDataRef = useRef(gridData);
  const activeViewRef = useRef(view);
  const activeSandboxIdRef = useRef(activeSandboxId);
  const activeLevelIdRef = useRef(currentLevel?.id);

  // Debounced auto-save to prevent UI lag on large grids
  useEffect(() => {
    gridDataRef.current = gridData;

    if (!gridData || gridData.length === 0) return;

    const timeout = setTimeout(() => {
      try {
        // Auto-save while in view
        if (view === ViewState.SANDBOX && activeSandboxId) {
          localStorage.setItem(`spectre_sandbox_data_${activeSandboxId}`, serializeGrid(gridData));
        } else if (view === ViewState.LEVEL_PLAY && currentLevel && !isVerifying) {
          const next = { ...savedSolutions, [currentLevel.id]: gridData };
          localStorage.setItem('spectre_saved_solutions', JSON.stringify(next));
          setSavedSolutions(next);
        }
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeout);
  }, [gridData, view, activeSandboxId, currentLevel?.id, isVerifying, savedSolutions]);

  // Handle saving when switching views or terminating session
  useEffect(() => {
    const prevView = activeViewRef.current;
    const prevSandboxId = activeSandboxIdRef.current;
    const prevLevelId = activeLevelIdRef.current;

    activeViewRef.current = view;
    activeSandboxIdRef.current = activeSandboxId;
    activeLevelIdRef.current = currentLevel?.id;

    return () => {
      const lastData = gridDataRef.current;
      if (!lastData || lastData.length === 0) return;

      if (prevView === ViewState.SANDBOX && prevSandboxId) {
        // Just write directly — no setState during cleanup
        try {
          localStorage.setItem(`spectre_sandbox_data_${prevSandboxId}`, serializeGrid(lastData));
        } catch (e) {
          console.error('Exit-save failed for sandbox:', e);
        }
      } else if (prevView === ViewState.LEVEL_PLAY && prevLevelId) {
        // Same — avoid setSavedSolutions inside cleanup, read-modify-write localStorage directly
        try {
          const existing = localStorage.getItem('spectre_saved_solutions');
          const parsed = existing ? JSON.parse(existing) : {};
          const next = { ...parsed, [prevLevelId]: lastData };
          localStorage.setItem('spectre_saved_solutions', JSON.stringify(next));
        } catch (e) {
          console.error('Exit-save failed for level:', e);
        }
      }
    };
  }, [view, activeSandboxId, currentLevel?.id]);

  // Audio handling for Note Blocks
  const lastNoteStates = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!gridData || !isPlaying) return;

    const currentStates: Record<string, boolean> = {};
    gridData.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.type === ComponentType.NOTE_BLOCK) {
          const key = `${x},${y}`;
          currentStates[key] = cell.state;
          // Trigger sound on rising edge (OFF -> ON)
          if (cell.state && !lastNoteStates.current[key]) {
            playNote(cell.noteKey || 'C4');
          }
        }
      });
    });
    lastNoteStates.current = currentStates;
  }, [gridData, isPlaying]);

  const [forcedLevers, setForcedLevers] = useState<Record<string, boolean>>({});

  const [blueprints, setBlueprints] = useState<Blueprint[]>(() => {
    const saved = localStorage.getItem('spectre_blueprints');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [selection, setSelection] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newBlueprintName, setNewBlueprintName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    localStorage.setItem('spectre_blueprints', JSON.stringify(blueprints));
  }, [blueprints]);

  const deleteSelected = useCallback(() => {
    if (!selection || !gridData) return;

    const xStart = Math.min(selection.x1, selection.x2);
    const xEnd = Math.max(selection.x1, selection.x2);
    const yStart = Math.min(selection.y1, selection.y2);
    const yEnd = Math.max(selection.y1, selection.y2);

    const newGrid = gridData.map((row, y) =>
      row.map((cell, x) => {
        if (x >= xStart && x <= xEnd && y >= yStart && y <= yEnd && !cell.isLocked) {
          return {
            ...cell,
            type: ComponentType.EMPTY,
            state: false,
            nextState: false,
            manualToggle: false,
            stateH: false,
            stateV: false,
            nextStateH: false,
            nextStateV: false
          };
        }
        return cell;
      })
    );

    setGridData(newGrid);
    setSelection(null);
    setShowDeleteConfirm(false);
  }, [selection, gridData]);

  const confirmSaveBlueprint = useCallback(() => {
    if (!selection || !gridData || !newBlueprintName) return;

    const xStart = Math.min(selection.x1, selection.x2);
    const xEnd = Math.max(selection.x1, selection.x2);
    const yStart = Math.min(selection.y1, selection.y2);
    const yEnd = Math.max(selection.y1, selection.y2);

    const width = xEnd - xStart + 1;
    const height = yEnd - yStart + 1;

    const data: TileState[][] = [];
    for (let y = yStart; y <= yEnd; y++) {
      const row: TileState[] = [];
      for (let x = xStart; x <= xEnd; x++) {
        const cell = { ...gridData[y][x] };
        if (cell.isLocked) delete cell.isLocked;
        row.push(cell);
      }
      data.push(row);
    }

    const newBlueprint: Blueprint = {
      id: Math.random().toString(36).substr(2, 9),
      name: newBlueprintName,
      width,
      height,
      data
    };

    setBlueprints(prev => [...prev, newBlueprint]);
    setSelection(null);
    setIsSaving(false);
    setNewBlueprintName('');
    setToolMode(ToolMode.PLACE);
    setSelectedComponent(ComponentType.WIRE);

    if (isGuidingSelection) {
      setIsGuidingSelection(false);
      setView(ViewState.LEVELS);
    }
  }, [selection, gridData, newBlueprintName, isGuidingSelection]);

  const handleSelectBlueprint = useCallback((bp: Blueprint) => {
    setSelectedBlueprint(bp);
    setToolMode(ToolMode.STAMP);
  }, []);

  const handleExport = useCallback(() => {
    if (!gridData) return;
    const blueprint = gridData.flatMap((row, y) =>
      row.map((cell, x) => ({ x, y, ...cell }))
        .filter(cell => cell.type !== ComponentType.EMPTY)
    );
    const json = JSON.stringify(blueprint, null, 2);
    console.log('--- BLUEPRINT EXPORT ---');
    console.log(json);
    alert('Blueprint exported to console! (Check DevTools)');
  }, [gridData]);

  const onStartLevel = useCallback((level: Level) => {
    setCurrentLevel(level);
    setView(ViewState.LEVEL_PLAY);
    setIsPlaying(true);
    setSelectedComponent(ComponentType.WIRE);

    if (savedSolutions[level.id]) {
      setGridData(JSON.parse(JSON.stringify(savedSolutions[level.id])));
    } else {
      setGridData(JSON.parse(JSON.stringify(level.initialGrid)));
    }
  }, [savedSolutions]);

  const submitLevel = useCallback(async () => {
    if (!gridDataRef.current || !currentLevel) return;

    setIsVerifying(true);
    setIsPlaying(true);
    setTickRate(60); // Faster simulation for verification
    setFailureMessage(null);

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Identify interactive inputs for exhaustive testing
    const inputs: { x: number, y: number }[] = [];
    currentLevel.initialGrid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.type === ComponentType.INPUT_LEVER) {
          inputs.push({ x, y });
        }
      });
    });

    const combinations = Math.pow(2, inputs.length);
    let allPassed = true;

    // 1. Thoroughly wipe all dynamic state from the grid before verification
    if (gridDataRef.current) {
      const cleanGrid = gridDataRef.current.map(row => row.map(cell => {
        const next = { ...cell };
        // Reset power states
        next.state = false;
        next.nextState = false;
        next.stateH = false;
        next.stateV = false;
        // Reset interactive state if not locked
        if (!cell.isLocked) {
          next.manualToggle = false;
        }
        // Reset component-specific state
        if (cell.history) {
          next.history = [];
        }
        return next;
      }));
      setGridData(cleanGrid);
      gridDataRef.current = cleanGrid;
    }

    // Power down all switches initially in the forcedLevers state
    const initialState: Record<string, boolean> = {};
    inputs.forEach(input => {
      initialState[`${input.x},${input.y}`] = false;
    });
    setForcedLevers(initialState);
    await wait(1500); // Settle simulation after reset

    for (let i = 0; i < combinations; i++) {
      const state: Record<string, boolean> = {};
      const stateDesc: string[] = [];

      inputs.forEach((input, idx) => {
        const val = (i & (1 << idx)) !== 0;
        state[`${input.x},${input.y}`] = val;
        stateDesc.push(`In(${input.x},${input.y})=${val ? 'ON' : 'OFF'}`);
      });
      setForcedLevers(state);

      await wait(1500); // Wait for logic to propagate to outputs

      const currentGrid = gridDataRef.current;
      if (!currentGrid) break;

      let casePassed = true;
      let reason = "";

      // Logic Verification per level
      if (currentLevel.id === '1' || currentLevel.id === '2') {
        const inputState = Object.values(state)[0];
        const lampX = currentLevel.id === '1' ? 5 : 6;
        const lampY = 3;
        if (currentGrid[lampY][lampX].state !== inputState) {
          casePassed = false;
          reason = `Output should be ${inputState ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '3') {
        const inputState = Object.values(state)[0];
        const lampX = 5;
        const lampY = 3;
        if (currentGrid[lampY][lampX].state === inputState) {
          casePassed = false;
          reason = `Output should be ${!inputState ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '4') {
        const redIn = state['0,4'];
        const blueIn = state['4,0'];
        const redOut = currentGrid[4][8].state;
        const blueOut = currentGrid[8][4].state;
        if (redOut !== redIn || blueOut !== blueIn) {
          casePassed = false;
          reason = "Independent signal paths failed";
        }
      } else if (currentLevel.id === '5') {
        // NAND logic: Only OFF when BOTH are ON
        const in1 = state['1,2'];
        const in2 = state['1,6'];
        const expected = !(in1 && in2);
        const lamp = currentGrid[4][7].state;
        if (lamp !== expected) {
          casePassed = false;
          reason = `NAND logic failed. Should be ${expected ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '6') {
        // OR gate logic: ON if either is ON
        const in1 = state['1,2'];
        const in2 = state['1,6'];
        const expected = in1 || in2;
        const lamp = currentGrid[4][7].state;
        if (lamp !== expected) {
          casePassed = false;
          reason = `OR logic failed. Should be ${expected ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '8') {
        // AND gate logic
        const in1 = state['1,4'];
        const in2 = state['1,10'];
        const expected = in1 && in2;
        const lamp = currentGrid[7][13].state;
        if (lamp !== expected) {
          casePassed = false;
          reason = `AND logic failed. Should be ${expected ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '7') {
        // Memory Cell test sequence
        const testSequence = [
          { s: true, r: false, exp: true, desc: "Set pulsed ON" },
          { s: false, r: false, exp: true, desc: "Set pulsed OFF (Hold)" },
          { s: false, r: true, exp: false, desc: "Reset pulsed ON" },
          { s: false, r: false, exp: false, desc: "Reset pulsed OFF (Clear)" }
        ];

        for (const step of testSequence) {
          setForcedLevers({ '1,4': step.s, '1,10': step.r });
          await wait(1500);
          if (gridDataRef.current?.[7][13].state !== step.exp) {
            allPassed = false;
            setFailureMessage(`LATCH ERROR: [${step.desc}]. Output should be ${step.exp ? 'ON' : 'OFF'}.`);
            setIsVerifying(false);
            return;
          }
        }
        break;
      } else if (currentLevel.id === '9') {
        // XNOR logic (Equivalence)
        const in1 = state['1,4'];
        const in2 = state['1,12'];
        const expected = (in1 === in2);
        const lamp = currentGrid[8][15].state;
        if (lamp !== expected) {
          casePassed = false;
          reason = `Equivalence (XNOR) failed. Should be ${expected ? 'ON' : 'OFF'}`;
        }
      } else if (currentLevel.id === '10') {
        // Note Block level: Should follow the input state
        const inputState = Object.values(state)[0]; // The locked power source or placed lever
        let noteBlockFound = false;
        let noteBlockIncorrect = false;

        for (let y = 0; y < currentGrid.length; y++) {
          for (let x = 0; x < currentGrid[y].length; x++) {
            if (currentGrid[y][x].type === ComponentType.NOTE_BLOCK) {
              noteBlockFound = true;
              if (currentGrid[y][x].state !== inputState) {
                noteBlockIncorrect = true;
              }
            }
          }
        }

        if (!noteBlockFound) {
          casePassed = false;
          reason = "No Note Block detected on the grid";
        } else if (noteBlockIncorrect) {
          casePassed = false;
          reason = `Note Block should be ${inputState ? 'POWERED' : 'SILENT'}`;
        }
      }

      if (!casePassed) {
        allPassed = false;
        setFailureMessage(`LOGIC ERROR: Failed Case [${stateDesc.join(', ')}]. ${reason}.`);
        setIsVerifying(false);
        return;
      }
    }

    setIsVerifying(false);
    setIsPlaying(false);
    setTickRate(10);
    setForcedLevers({});

    if (allPassed) {
      setIsWinning(true);
      if (currentLevel) {
        setCompletedLevels(prev => prev.includes(currentLevel.id) ? prev : [...prev, currentLevel.id]);
        if (gridDataRef.current) {
          setSavedSolutions(prev => ({ ...prev, [currentLevel.id]: gridDataRef.current! }));
        }
      }
      if (currentLevel?.id === '5' && !completedLevels.includes('5')) {
        setShowCompletionPrompt(true);
      }
    } else {
      setFailureMessage(failureQuotes[Math.floor(Math.random() * failureQuotes.length)]);
    }
  }, [currentLevel, failureQuotes, completedLevels]);

  const onResetLevel = useCallback(() => {
    if (!currentLevel) return;
    const originalGrid = JSON.parse(JSON.stringify(currentLevel.initialGrid));
    setGridData(originalGrid);
    setSavedSolutions(prev => {
      const next = { ...prev };
      delete next[currentLevel.id];
      return next;
    });
    setShowLevelResetConfirm(false);
  }, [currentLevel]);

  const onResetProgress = useCallback(() => {
    // Clear state directly to prevent useEffect from re-saving stale data
    setCompletedLevels([]);
    setBlueprints([]);

    localStorage.removeItem('spectre_completed_levels');
    localStorage.removeItem('spectre_blueprints');

    // Reset view and reload state
    setShowResetModal(false);
    setView(ViewState.TITLE);
    window.location.reload();
  }, []);

  const onUnlockAll = useCallback(() => {
    const allIds = LEVELS_DATA.map(l => l.id);
    setCompletedLevels(allIds);
  }, []);

  const isSandboxUnlocked = completedLevels.includes('4');

  return (
    <div className="min-h-screen bg-[#F8F7FA] text-[#1F1B2E] font-sans selection:bg-[#7C3AED]/20">
      <AnimatePresence mode="wait">
        {view === ViewState.TITLE && (
          <TitleView
            setView={(v: ViewState) => { setView(v); setIsGuidingSelection(false); }}
            onReset={() => setShowResetModal(true)}
            onUnlockAll={onUnlockAll}
            isSandboxUnlocked={isSandboxUnlocked}
            key="title"
          />
        )}
        {view === ViewState.CAMPAIGNS && <CampaignSelector setView={(v: ViewState) => { setView(v); setIsGuidingSelection(false); }} onSelectCampaign={(id: string) => { setSelectedCampaign(id); setView(ViewState.LEVELS); }} key="campaigns" />}
        {view === ViewState.LEVELS && <LevelsView setView={(v: ViewState) => { setView(v); setIsGuidingSelection(false); }} campaign={selectedCampaign} onStartLevel={onStartLevel} completedLevels={completedLevels} key="levels" />}
        {view === ViewState.LEVEL_PLAY && currentLevel && (
          <LevelPlayView
            level={currentLevel} setView={setView} isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            tickRate={tickRate} setTickRate={setTickRate} selectedComponent={selectedComponent}
            setSelectedComponent={setSelectedComponent} selectedDirection={selectedDirection}
            setSelectedDirection={setSelectedDirection} setGridData={setGridData} gridData={gridData}
            onSubmit={submitLevel} isVerifying={isVerifying} forcedLevers={forcedLevers}
            zoom={zoom} setZoom={setZoom}
            toolMode={toolMode} setToolMode={setToolMode}
            selection={selection} setSelection={setSelection}
            setIsSaving={setIsSaving} isSaving={isSaving}
            blueprints={blueprints} setBlueprints={setBlueprints}
            handleSelectBlueprint={handleSelectBlueprint}
            selectedBlueprint={selectedBlueprint}
            setSelectedBlueprint={setSelectedBlueprint}
            isGuidingSelection={isGuidingSelection}
            setIsGuidingSelection={setIsGuidingSelection}
            deleteSelected={deleteSelected}
            setShowDeleteConfirm={setShowDeleteConfirm}
            setShowLevelResetConfirm={setShowLevelResetConfirm}
            noteConfig={noteConfig}
            setNoteConfig={setNoteConfig}
            bufferConfig={bufferConfig}
            setBufferConfig={setBufferConfig}
            onNotePlay={playNote}
          />
        )}

        {isGuidingSelection && currentLevel?.id === '5' && toolMode !== ToolMode.SELECT && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[150] bg-[#1F1B2E]/80 backdrop-blur-[2px] pointer-events-auto"
          />
        )}
        {view === ViewState.SANDBOX_MENU && (
          <SandboxMenuView
            key="sandbox_menu"
            sandboxes={sandboxes} setSandboxes={setSandboxes} setView={setView}
            setActiveSandboxId={setActiveSandboxId} setGridData={setGridData}
          />
        )}
        {view === ViewState.SANDBOX && (
          <SandboxView
            key="sandbox"
            setView={setView} isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            tickRate={tickRate} setTickRate={setTickRate} selectedComponent={selectedComponent} setSelectedComponent={setSelectedComponent}
            selectedDirection={selectedDirection} setSelectedDirection={setSelectedDirection} setGridData={setGridData} gridData={gridData}
            toolMode={toolMode} setToolMode={setToolMode} selection={selection} setSelection={setSelection}
            selectedBlueprint={selectedBlueprint} setSelectedBlueprint={setSelectedBlueprint} blueprints={blueprints} setBlueprints={setBlueprints}
            setIsSaving={setIsSaving} isSaving={isSaving} newBlueprintName={newBlueprintName} setNewBlueprintName={setNewBlueprintName}
            confirmSaveBlueprint={confirmSaveBlueprint} handleExport={handleExport} handleSelectBlueprint={handleSelectBlueprint}
            zoom={zoom} setZoom={setZoom}
            deleteSelected={deleteSelected}
            setShowDeleteConfirm={setShowDeleteConfirm}
            activeSandbox={activeSandbox}
            noteConfig={noteConfig}
            setNoteConfig={setNoteConfig}
            bufferConfig={bufferConfig}
            setBufferConfig={setBufferConfig}
            onNotePlay={playNote}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-[#1F1B2E]/90 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-[20px_20px_0px_#EF4444] border-8 border-[#1F1B2E] p-12 text-center"
            >
              <div className="w-20 h-20 bg-red-500 rounded-2xl mx-auto flex items-center justify-center mb-8 shadow-xl">
                <Trash2 className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4 italic">Confirm Disruption</h2>
              <p className="text-[#4A3B66] font-bold mb-10 leading-relaxed uppercase text-sm">
                Are you sure about that? This action cannot be undone. You are about to wipe a large matrix sector.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowDeleteConfirm(false)} className="py-4 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest text-xs">Return</button>
                <button onClick={deleteSelected} className="py-4 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isWinning && currentLevel && !showCompletionPrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#1F1B2E]/90 backdrop-blur-2xl">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-lg bg-white border-8 border-[#7C3AED] rounded-[3rem] p-16 text-center shadow-[0_0_100px_rgba(124,58,237,0.5)]"
            >
              <div className="w-32 h-32 bg-[#7C3AED] text-white flex items-center justify-center rounded-full mx-auto mb-10 text-6xl shadow-2xl">✓</div>
              <h2 className="text-5xl font-black uppercase tracking-tighter text-[#1F1B2E] mb-4">Logic Verified</h2>
              <p className="text-xl font-medium text-[#7C3AED] mb-12 uppercase tracking-widest">Inversion Module Operational</p>
              <button
                onClick={() => { setIsWinning(false); setView(ViewState.LEVELS); }}
                className="w-full py-6 bg-[#1F1B2E] text-white rounded-2xl font-mono font-black text-lg uppercase tracking-widest shadow-xl hover:bg-[#7C3AED] transition-all"
              >
                Continue_Sequence
              </button>
            </motion.div>
          </div>
        )}

        {showCompletionPrompt && currentLevel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-[#1F1B2E]/95 backdrop-blur-2xl p-6"
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-xl overflow-hidden shadow-[20px_20px_0px_#7C3AED] border-8 border-[#1F1B2E]"
            >
              <div className="p-12 text-center">
                <div className="w-20 h-20 bg-[#7C3AED] rounded-2xl mx-auto flex items-center justify-center mb-8 shadow-xl">
                  <FileCode className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-4xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4 italic">Laboratory Access</h2>
                <div className="h-px bg-[#D1CDD9] w-24 mx-auto mb-8" />
                <p className="text-lg text-[#4A3B66] leading-relaxed font-bold mb-10">
                  Strategic Victory! You've mastered the NAND paradox. You now have access to the <span className="text-[#7C3AED]">Cell Laboratory</span>.
                  Use the <span className="text-[#1F1B2E] px-2 py-1 bg-[#EDEBF2] rounded uppercase">Selector Tool</span> to capture regions and save them as reusable components.
                </p>

                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setShowCompletionPrompt(false);
                      setIsWinning(false);
                      setIsGuidingSelection(true);
                      // Don't auto-set toolMode here, user must click
                    }}
                    className="w-full py-5 bg-[#7C3AED] text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                  >
                    Capture NAND Assembly
                  </button>
                  <button
                    onClick={() => {
                      setShowCompletionPrompt(false);
                      setView(ViewState.LEVELS);
                      setIsWinning(false);
                    }}
                    className="w-full py-5 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#D1CDD9] transition-all"
                  >
                    Return to Matrix
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {failureMessage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#EF4444]/10 backdrop-blur-md">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="w-full max-w-md bg-white border-4 border-[#1F1B2E] rounded-3xl p-10 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-[#EF4444] text-white flex items-center justify-center rounded-full mx-auto mb-6 text-3xl shadow-lg font-black italic">!</div>
              <h2 className="text-3xl font-black uppercase tracking-tight text-[#1F1B2E] mb-2 font-mono">Not Quite...</h2>
              <p className="text-lg font-medium text-[#4A3B66] mb-8 italic">"{failureMessage}"</p>
              <button
                onClick={() => setFailureMessage(null)}
                className="w-full py-4 bg-[#1F1B2E] text-white rounded-xl font-mono font-black uppercase tracking-widest hover:bg-[#7C3AED] transition-all shadow-lg"
              >
                Re-Wire Logic
              </button>
            </motion.div>
          </div>
        )}

        {showResetModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-[#1F1B2E]/90 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-white border-8 border-red-600 rounded-[2.5rem] p-12 max-w-md text-center shadow-[0_0_80px_rgba(220,38,38,0.4)]"
            >
              <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-8">
                <Trash2 className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-4xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4">Wipe Memory?</h2>
              <p className="text-[#4A3B66] font-bold mb-10 leading-relaxed">
                CAUTION: You are about to purge the internal memory bank. This will <span className="text-red-600 underline">permanently erase</span> all campaign progress and saved blueprints.
                This action is irreversible.
              </p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={onResetProgress}
                  className="w-full py-5 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:bg-[#1F1B2E] transition-all"
                >
                  Confirm_Purge
                </button>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="w-full py-5 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#D1CDD9] transition-all"
                >
                  Abort_Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLevelResetConfirm && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-[#1F1B2E]/90 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-[#1F1B2E] rounded-[2rem] p-10 max-w-md text-center shadow-[20px_20px_0px_#EF4444]"
            >
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-3xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4">Reset Level?</h2>
              <p className="text-[#4A3B66] font-bold mb-8 leading-relaxed text-sm">
                This will clear the current board and delete your saved solution for this level.
                Are you sure you want to start over?
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowLevelResetConfirm(false)}
                  className="py-4 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest hover:bg-[#D1CDD9] transition-all text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={onResetLevel}
                  className="py-4 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl hover:bg-red-600 transition-all text-xs"
                >
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSaving && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-[#1F1B2E]/60 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-white border-4 border-[#1F1B2E] rounded-2xl p-10 shadow-[20px_20px_0px_#7C3AED]"
            >
              <div className="text-center mb-10">
                <div className="w-16 h-16 bg-[#7C3AED] text-white flex items-center justify-center rounded-2xl mx-auto mb-6 shadow-xl">
                  <FileCode className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#1F1B2E]">Archive Cell</h2>
              </div>
              <div className="space-y-8">
                <input autoFocus type="text" value={newBlueprintName} onChange={e => setNewBlueprintName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmSaveBlueprint()} placeholder="CELL_ID_001"
                  className="w-full bg-[#EDEBF2] border-2 border-[#D1CDD9] p-4 rounded-xl font-mono text-sm focus:border-[#7C3AED] focus:outline-none text-center uppercase font-black"
                />
                <div className="flex gap-4">
                  <button onClick={() => setIsSaving(false)} className="flex-1 py-4 text-[11px] font-mono font-black uppercase text-[#7C3AED]/60">Discard</button>
                  <button onClick={confirmSaveBlueprint} disabled={!newBlueprintName} className="flex-1 py-4 bg-[#1F1B2E] text-white rounded-xl text-[11px] font-mono font-black uppercase tracking-widest disabled:opacity-30">Initialize</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-[#1F1B2E]/90 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-[20px_20px_0px_#EF4444] border-8 border-[#1F1B2E] p-12 text-center"
            >
              <div className="w-20 h-20 bg-red-500 rounded-2xl mx-auto flex items-center justify-center mb-8 shadow-xl">
                <Trash2 className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black uppercase text-[#1F1B2E] tracking-tighter mb-4 italic">Confirm Disruption</h2>
              <p className="text-[#4A3B66] font-bold mb-10 leading-relaxed uppercase text-sm">
                Are you sure about that? This action cannot be undone. You are about to wipe a large matrix sector.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowDeleteConfirm(false)} className="py-4 bg-[#EDEBF2] text-[#1F1B2E] rounded-xl font-black uppercase tracking-widest text-xs">Return</button>
                <button onClick={deleteSelected} className="py-4 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes pulse-hole {
          0%, 100% { background: radial-gradient(circle 40px at 40px 140px, transparent 100%, #1F1B2E CC); }
          50% { background: radial-gradient(circle 55px at 40px 140px, transparent 100%, #1F1B2E CC); }
        }
        .animate-pulse-scale {
          animation: pulse-scale 2s ease-in-out infinite;
        }
        .animate-pulse-hole {
          animation: pulse-hole 2s ease-in-out infinite;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D1CDD9; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #7C3AED; }
        .hidden-scrollbar::-webkit-scrollbar { display: none; }
        .hidden-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
