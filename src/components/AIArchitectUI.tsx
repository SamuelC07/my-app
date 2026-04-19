import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cpu, Send, Loader2, Check, ChevronRight, Save, Layers } from 'lucide-react';

import {
  ComponentType,
  Direction,
  TileState,
  Blueprint,
} from '../constants';
import {
  askArchitect,
  instructionsToTiles,
  ArchitectInstruction,
} from '../engine/ArchitectService';
import { drawTile } from '../engine/draw';

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_GRID_SIZE = 50;
const PREVIEW_TILE      = 10; // px per cell in the miniature preview canvas

function makeEmpty(): TileState {
  return {
    type:        ComponentType.EMPTY,
    state:       false,
    nextState:   false,
    direction:   Direction.NORTH,
    manualToggle: false,
    stateH:      false,
    stateV:      false,
  };
}

function makeEmptyGrid(size: number): TileState[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, makeEmpty)
  );
}

// ── Preview Canvas ────────────────────────────────────────────────────────────

interface PreviewCanvasProps {
  grid: TileState[][];
  highlightIndex: number; // cell index currently being animated (highlight ring)
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ grid, highlightIndex }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size      = grid.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = size * PREVIEW_TILE;
    canvas.width  = W;
    canvas.height = W;

    // Background
    ctx.fillStyle = '#161B22';
    ctx.fillRect(0, 0, W, W);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= size; i++) {
      ctx.beginPath(); ctx.moveTo(i * PREVIEW_TILE, 0);
      ctx.lineTo(i * PREVIEW_TILE, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * PREVIEW_TILE);
      ctx.lineTo(W, i * PREVIEW_TILE); ctx.stroke();
    }

    // Cells
    let flat = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++, flat++) {
        const cell = grid[r][c];
        if (cell.type === ComponentType.EMPTY) continue;
        drawTile(ctx, cell, c * PREVIEW_TILE, r * PREVIEW_TILE, PREVIEW_TILE, 0);
      }
    }
  }, [grid, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
    />
  );
};

// ── Phase types ───────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'thinking'
  | 'extracting'
  | 'building'
  | 'done'
  | 'error';

// ── Main Component ────────────────────────────────────────────────────────────

interface AIArchitectUIProps {
  onClose: () => void;
  onSaveToLab: (blueprint: Blueprint) => void;
  onStampToSandbox: (blueprint: Blueprint) => void;
}

export const AIArchitectUI: React.FC<AIArchitectUIProps> = ({
  onClose,
  onSaveToLab,
  onStampToSandbox,
}) => {
  const [prompt,        setPrompt]        = useState('');
  const [phase,         setPhase]         = useState<Phase>('idle');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [previewGrid,   setPreviewGrid]   = useState<TileState[][]>(makeEmptyGrid(PREVIEW_GRID_SIZE));
  const [highlightIdx,  setHighlightIdx]  = useState(-1);
  const [instructions,  setInstructions]  = useState<ArchitectInstruction[]>([]);
  const [buildName,     setBuildName]     = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [pendingAction, setPendingAction] = useState<'lab' | 'stamp' | null>(null);
  const abortRef   = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on mount
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // ── Build animation ───────────────────────────────────────────────────────

  const runBuildAnimation = useCallback(async (instrs: ArchitectInstruction[]) => {
    abortRef.current = false;
    setPhase('building');
    setHighlightIdx(-1);

    const tiles = instructionsToTiles(instrs);
    let grid = makeEmptyGrid(PREVIEW_GRID_SIZE);

    for (let i = 0; i < tiles.length; i++) {
      if (abortRef.current) break;
      const { x, y, tile } = tiles[i];
      if (y >= 0 && y < PREVIEW_GRID_SIZE && x >= 0 && x < PREVIEW_GRID_SIZE) {
        // Immutable update so React re-renders
        grid = grid.map((row, ry) =>
          row.map((cell, cx) => (ry === y && cx === x ? tile : cell))
        );
        setPreviewGrid([...grid]);
        setHighlightIdx(y * PREVIEW_GRID_SIZE + x);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    setHighlightIdx(-1);
    setPreviewGrid(grid);
    setPhase('done');
  }, []);

  // ── Execute ───────────────────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    if (!prompt.trim()) return;
    setPhase('thinking');
    setErrorMsg('');
    setPreviewGrid(makeEmptyGrid(PREVIEW_GRID_SIZE));

    try {
      const result = await askArchitect(prompt, () => setPhase('extracting'));
      setInstructions(result.instructions);
      await runBuildAnimation(result.instructions);
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err?.message ?? 'Unknown error');
    }
  }, [prompt, runBuildAnimation]);

  // ── Blueprint helpers ─────────────────────────────────────────────────────

  const buildBlueprint = (): Blueprint => {
    const tiles = instructionsToTiles(instructions);
    const minX  = Math.min(...tiles.map(t => t.x));
    const minY  = Math.min(...tiles.map(t => t.y));
    const maxX  = Math.max(...tiles.map(t => t.x));
    const maxY  = Math.max(...tiles.map(t => t.y));
    const w     = maxX - minX + 1;
    const h     = maxY - minY + 1;

    const data: TileState[][] = Array.from({ length: h }, () =>
      Array.from({ length: w }, makeEmpty)
    );
    for (const { x, y, tile } of tiles) {
      const lx = x - minX;
      const ly = y - minY;
      if (ly >= 0 && ly < h && lx >= 0 && lx < w) data[ly][lx] = tile;
    }

    return {
      id:     Math.random().toString(36).substr(2, 9),
      name:   buildName || 'AI Build',
      width:  w,
      height: h,
      data,
    };
  };

  const commitAction = () => {
    if (!buildName.trim()) return;
    const bp = buildBlueprint();
    if (pendingAction === 'lab')   onSaveToLab(bp);
    if (pendingAction === 'stamp') onStampToSandbox(bp);
    setShowNameInput(false);
    setBuildName('');
    setPendingAction(null);
    onClose();
  };

  const startAction = (action: 'lab' | 'stamp') => {
    setPendingAction(action);
    setShowNameInput(true);
    setBuildName(`AI_Build_${new Date().getHours()}${new Date().getMinutes()}`);
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase === 'idle') {
      handleExecute();
    }
    if (e.key === 'Escape') onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const phaseLabel: Record<Phase, string> = {
    idle:       '',
    thinking:   'Routing spatial logic...',
    extracting: 'Extracting circuit from response...',
    building:   'Constructing circuit...',
    done:       'Build complete.',
    error:      'Architect error.',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,8,18,0.85)', backdropFilter: 'blur(8px)' }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-full max-w-5xl mx-4 rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #1A1030 0%, #0D1117 60%, #0A1628 100%)',
          border: '1px solid rgba(124,58,237,0.4)',
          boxShadow: '0 0 80px rgba(124,58,237,0.25), 0 25px 60px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-8 py-5 border-b" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-white font-black text-sm uppercase tracking-[0.25em]">AI Architect</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(167,139,250,0.7)' }}>
              K2 Think V2 · Spatial Routing Engine
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Prompt + controls */}
          <div className="w-96 flex flex-col flex-shrink-0 p-6 gap-4 border-r overflow-y-auto" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>

            {/* Prompt label */}
            <div>
              <label className="text-[10px] font-mono font-black uppercase tracking-[0.3em] mb-2 block"
                style={{ color: 'rgba(167,139,250,0.8)' }}>
                Design Prompt
              </label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={"Build me a 2-input AND gate using inverters and wires..."}
                rows={6}
                disabled={phase === 'thinking' || phase === 'building'}
                className="w-full rounded-xl text-sm font-mono resize-none outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  color: 'rgba(255,255,255,0.9)',
                  padding: '12px 14px',
                  caretColor: '#7C3AED',
                }}
              />
              <p className="text-[9px] font-mono mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                ⌘↵ to execute
              </p>
            </div>

            {/* Execute button */}
            <button
              onClick={handleExecute}
              disabled={!prompt.trim() || phase === 'thinking' || phase === 'extracting' || phase === 'building'}
              className="w-full py-4 rounded-xl flex items-center justify-center gap-3 font-mono font-black text-xs uppercase tracking-[0.2em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: phase === 'thinking' || phase === 'extracting' || phase === 'building'
                  ? 'rgba(124,58,237,0.3)'
                  : 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
              }}
            >
              {phase === 'thinking' || phase === 'extracting' || phase === 'building' ? (
                <><Loader2 className="w-4 h-4 text-white animate-spin" /> Processing</>
              ) : (
                <><Send className="w-4 h-4 text-white" /> Execute Build</>
              )}
            </button>

            {/* Status bar */}
            <AnimatePresence mode="wait">
              {phase !== 'idle' && (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-[11px] font-mono"
                  style={{
                    background: phase === 'error'
                      ? 'rgba(239,68,68,0.12)'
                      : phase === 'done'
                        ? 'rgba(34,197,94,0.12)'
                        : 'rgba(124,58,237,0.12)',
                    border: `1px solid ${phase === 'error' ? 'rgba(239,68,68,0.3)' : phase === 'done' ? 'rgba(34,197,94,0.3)' : 'rgba(124,58,237,0.2)'}`,
                    color: phase === 'error' ? '#F87171' : phase === 'done' ? '#4ADE80' : '#A78BFA',
                  }}
                >
                  {phase === 'thinking' || phase === 'building'
                    ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    : phase === 'done'
                      ? <Check className="w-3 h-3 flex-shrink-0" />
                      : <X className="w-3 h-3 flex-shrink-0" />}
                  <span>{phaseLabel[phase]}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {phase === 'error' && (
              <div className="text-[10px] font-mono px-3 py-2 rounded-lg overflow-auto max-h-28"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171' }}>
                {errorMsg}
              </div>
            )}

            {/* Stats when done */}
            {phase === 'done' && instructions.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-2 gap-2"
              >
                {[
                  { label: 'Components', value: instructions.length },
                  { label: 'Grid', value: `${PREVIEW_GRID_SIZE}×${PREVIEW_GRID_SIZE}` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                    style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                    <div className="text-[10px] font-mono font-black uppercase tracking-widest"
                      style={{ color: 'rgba(167,139,250,0.7)' }}>
                      {label}
                    </div>
                    <div className="text-base font-black text-white mt-1">{value}</div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Action buttons */}
            <AnimatePresence>
              {phase === 'done' && !showNameInput && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-2 mt-auto pb-4"
                >
                  <p className="text-[9px] font-mono uppercase tracking-widest text-center mb-1"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Deploy Circuit
                  </p>
                  <button
                    onClick={() => startAction('stamp')}
                    className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-mono font-black text-xs uppercase tracking-[0.15em] transition-all hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', color: '#fff' }}
                  >
                    <ChevronRight className="w-4 h-4" />
                    Stamp into Sandbox
                  </button>
                  <button
                    onClick={() => startAction('lab')}
                    className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-mono font-black text-xs uppercase tracking-[0.15em] transition-all hover:bg-white/10"
                    style={{ border: '1px solid rgba(124,58,237,0.4)', color: '#A78BFA' }}
                  >
                    <Save className="w-4 h-4" />
                    Save to Cell Lab
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Name input */}
            <AnimatePresence>
              {showNameInput && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-auto flex flex-col gap-3 pb-4"
                >
                  <label className="text-[10px] font-mono font-black uppercase tracking-[0.3em]"
                    style={{ color: 'rgba(167,139,250,0.8)' }}>
                    Blueprint ID
                  </label>
                  <input
                    autoFocus
                    value={buildName}
                    onChange={e => setBuildName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitAction()}
                    className="w-full rounded-xl text-sm font-mono outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(124,58,237,0.4)',
                      color: '#fff',
                      padding: '10px 12px',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowNameInput(false); setPendingAction(null); }}
                      className="flex-1 py-3 rounded-xl font-mono font-black text-xs uppercase tracking-widest transition-all hover:bg-white/10"
                      style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                      Cancel
                    </button>
                    <button
                      onClick={commitAction}
                      disabled={!buildName.trim()}
                      className="flex-1 py-3 rounded-xl font-mono font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40"
                      style={{ background: '#7C3AED', color: '#fff' }}>
                      Confirm
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Preview canvas */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b"
              style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
              <span className="text-[9px] font-mono font-black uppercase tracking-[0.3em]"
                style={{ color: 'rgba(124,58,237,0.7)' }}>
                <Layers className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                Preview Grid · 50×50
              </span>
              {phase === 'building' && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-[9px] font-mono font-black uppercase tracking-widest"
                  style={{ color: '#A78BFA' }}
                >
                  ● Building…
                </motion.span>
              )}
            </div>
            <div className="flex-1 overflow-hidden relative">
              {/* Scan-line overlay for aesthetic */}
              <div className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, transparent 1px, transparent 3px)',
                }} />
              <div className="absolute inset-0 overflow-auto">
                <PreviewCanvas grid={previewGrid} highlightIndex={highlightIdx} />
              </div>
              {/* Empty state overlay */}
              {phase === 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <Cpu className="w-12 h-12 mb-4" style={{ color: 'rgba(124,58,237,0.2)' }} />
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em]"
                    style={{ color: 'rgba(255,255,255,0.15)' }}>
                    Awaiting design prompt
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
