import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ComponentType, Direction, TileState, TILE_SIZE, GAP, THEME, GRID_SIZE, ToolMode, Blueprint, SandboxMeta } from '../constants';
import { tickGrid } from '../engine/logic';
import { drawTile } from '../engine/draw';

interface LogicCanvasProps {
  isPlaying: boolean;
  tickRate: number;
  selectedComponent: ComponentType;
  selectedDirection: Direction;
  onGridChange?: (grid: TileState[][]) => void;
  initialGrid?: TileState[][];
  grid?: TileState[][] | null;
  toolMode?: ToolMode;
  onSelectionUpdate?: (selection: { x1: number, y1: number, x2: number, y2: number } | null) => void;
  selectedBlueprint?: Blueprint | null;
  onStampComplete?: () => void;
  isVerifying?: boolean;
  forcedLevers?: Record<string, boolean>;
  zoom?: number;
  setZoom?: (z: number) => void;
  activeSandbox?: SandboxMeta | null;
  onNoteBlockClick?: (x: number, y: number, currentNote: string) => void;
  onBufferClick?: (x: number, y: number, currentDelay: number) => void;
  onNotePlay?: (noteKey: string) => void;
}

export const LogicCanvas: React.FC<LogicCanvasProps> = ({
  isPlaying,
  tickRate,
  selectedComponent,
  selectedDirection,
  onGridChange,
  initialGrid,
  grid: externalGrid,
  toolMode = ToolMode.PLACE,
  onSelectionUpdate,
  selectedBlueprint,
  onStampComplete,
  isVerifying = false,
  forcedLevers = {},
  zoom = 1.0,
  setZoom,
  activeSandbox,
  onNoteBlockClick,
  onBufferClick,
  onNotePlay
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentTileSize = TILE_SIZE * zoom;
  const currentGap = GAP * zoom;

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0 });

  // Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });

  const [grid, setGrid] = useState<TileState[][]>(() => {
    if (initialGrid) return initialGrid;
    if (externalGrid) return externalGrid;
    let size = GRID_SIZE;
    if (activeSandbox?.size === 'small') size = 50;
    if (activeSandbox?.size === 'medium') size = 100;
    if (activeSandbox?.size === 'large') size = 200;
    if (activeSandbox?.size === 'unlimited') size = 50;
    return Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        type: ComponentType.EMPTY,
        state: false,
        nextState: false,
        direction: Direction.NORTH,
        manualToggle: false,
      }))
    );
  });

  const lastSyncedGridRef = useRef<TileState[][] | null>(null);

  useEffect(() => {
    if (externalGrid && externalGrid !== lastSyncedGridRef.current) {
      setGrid(externalGrid);
      lastSyncedGridRef.current = externalGrid;
    }
  }, [externalGrid]);

  const gridRef = useRef<TileState[][]>(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);

  const onGridChangeRef = useRef(onGridChange);
  useEffect(() => { onGridChangeRef.current = onGridChange; }, [onGridChange]);

  const syncToParent = useCallback((newGrid: TileState[][]) => {
    if (onGridChangeRef.current) {
      lastSyncedGridRef.current = newGrid;
      onGridChangeRef.current(newGrid);
    }
  }, []);

  const lastNoteStatesRef = useRef<Record<string, boolean>>({});
  const lastTickRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPlacedPos, setLastPlacedPos] = useState<{ x: number, y: number } | null>(null);

  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number, y: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number, y: number } | null>(null);
  const manualChangeRef = useRef(false);

  useEffect(() => {
    if (toolMode !== ToolMode.SELECT) {
      setSelectionStart(null);
      setSelectionEnd(null);
      if (onSelectionUpdate) onSelectionUpdate(null);
    }
  }, [toolMode, onSelectionUpdate]);

  useEffect(() => {
    if (Object.keys(forcedLevers).length === 0) return;
    setGrid(prev => {
      const next = [...prev.map(row => [...row])];
      Object.entries(forcedLevers).forEach(([key, val]) => {
        const [x, y] = key.split(',').map(Number);
        if (next[y]?.[x]?.type === ComponentType.INPUT_LEVER) {
          next[y][x] = { ...next[y][x], manualToggle: val };
        }
      });
      return next;
    });
  }, [forcedLevers]);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Center camera initially
  const centeredRef = useRef(false);

  useEffect(() => {
    centeredRef.current = false;
  }, [activeSandbox?.id, initialGrid]);

  useEffect(() => {
    if (!centeredRef.current && grid.length > 0 && dimensions.width > 0) {
      const baseWidth = grid.length * (TILE_SIZE + GAP);
      const baseHeight = grid.length * (TILE_SIZE + GAP);

      let initialZoom = zoom;

      // Auto-scale to fit screen for finite grids (levels and non-unlimited sandboxes)
      if (activeSandbox?.size !== 'unlimited') {
        const padding = 100; // 50px padding on each side
        const scaleX = (dimensions.width - padding) / baseWidth;
        const scaleY = (dimensions.height - padding) / baseHeight;

        const idealScale = Math.min(scaleX, scaleY);
        // clamp the zoom between 0.2x and 2.5x to prevent it getting too crazy
        initialZoom = Math.min(Math.max(idealScale, 0.2), 2.5);
        if (setZoom) setZoom(initialZoom);
      }

      const newTileSize = TILE_SIZE * initialZoom;
      const newGap = GAP * initialZoom;
      const totalWidth = grid.length * (newTileSize + newGap);
      const totalHeight = grid.length * (newTileSize + newGap);

      setCamera({
        x: dimensions.width / 2 - totalWidth / 2,
        y: dimensions.height / 2 - totalHeight / 2
      });
      centeredRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.length, dimensions.width, dimensions.height, activeSandbox?.size, setZoom]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = (time: number) => {
      let currentGrid = gridRef.current;

      if (isPlaying) {
        if (time - lastTickRef.current > (1000 / tickRate)) {
          // Simulator optimization happens in tickGrid natively
          currentGrid = tickGrid(currentGrid, tickRate);
          setGrid(currentGrid);
          lastTickRef.current = time;

          // Trigger audio for Note Blocks on rising edge
          currentGrid.forEach((row, y) => {
            row.forEach((cell, x) => {
              if (cell.type === ComponentType.NOTE_BLOCK) {
                const key = `${x},${y}`;
                if (cell.state && !lastNoteStatesRef.current[key]) {
                  if (onNotePlay) onNotePlay(cell.noteKey || 'C4');
                }
                lastNoteStatesRef.current[key] = cell.state;
              }
            });
          });

          if (isVerifying) {
            syncToParent(currentGrid);
          }
        }
      }

      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);

      const currentGridSize = currentGrid.length;

      // Render Culling: Only draw visible tiles
      const startX = Math.floor(-camera.x / (currentTileSize + currentGap));
      const startY = Math.floor(-camera.y / (currentTileSize + currentGap));
      const endX = Math.ceil((-camera.x + dimensions.width) / (currentTileSize + currentGap));
      const endY = Math.ceil((-camera.y + dimensions.height) / (currentTileSize + currentGap));

      // Determine bounds for drawing the visual grid
      const minDrawX = activeSandbox?.size === 'unlimited' ? startX : Math.max(0, startX);
      const minDrawY = activeSandbox?.size === 'unlimited' ? startY : Math.max(0, startY);
      const maxDrawX = activeSandbox?.size === 'unlimited' ? endX : Math.min(currentGridSize, endX);
      const maxDrawY = activeSandbox?.size === 'unlimited' ? endY : Math.min(currentGridSize, endY);

      for (let y = minDrawY; y < maxDrawY; y++) {
        for (let x = minDrawX; x < maxDrawX; x++) {
          const px = x * (currentTileSize + currentGap);
          const py = y * (currentTileSize + currentGap);

          // Draw the empty square for the grid
          ctx.fillStyle = THEME.grid;
          ctx.fillRect(px, py, currentTileSize, currentTileSize);

          // Draw actual components if within logical bounds
          if (x >= 0 && x < currentGridSize && y >= 0 && y < currentGridSize) {
            const cell = currentGrid[y][x];
            drawTile(ctx, cell, px, py, currentTileSize, currentGap, currentGrid, x, y);
          }
        }
      }

      if (toolMode === ToolMode.STAMP && selectedBlueprint && hoverPos) {
        selectedBlueprint.data.forEach((row, dy) => {
          row.forEach((cell, dx) => {
            const gx = hoverPos.x + dx;
            const gy = hoverPos.y + dy;
            if (gx < currentGridSize && gy < currentGridSize) {
              const px = gx * (currentTileSize + currentGap);
              const py = gy * (currentTileSize + currentGap);
              drawTile(ctx, cell, px, py, currentTileSize, currentGap, undefined, undefined, undefined, true);
            }
          });
        });
      }

      if (selectionStart && selectionEnd) {
        const x1 = Math.min(selectionStart.x, selectionEnd.x) * (currentTileSize + currentGap);
        const y1 = Math.min(selectionStart.y, selectionEnd.y) * (currentTileSize + currentGap);
        const x2 = (Math.max(selectionStart.x, selectionEnd.x) + 1) * (currentTileSize + currentGap);
        const y2 = (Math.max(selectionStart.y, selectionEnd.y) + 1) * (currentTileSize + currentGap);

        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 2 * zoom;
        ctx.setLineDash([5 * zoom, 5 * zoom]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = `${THEME.accent}22`;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
      }

      ctx.restore();
      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying, tickRate, currentTileSize, currentGap, toolMode, selectedBlueprint, hoverPos, selectionStart, selectionEnd, zoom, camera, dimensions]);

  // Camera-based Expansion for Unlimited grid
  useEffect(() => {
    if (activeSandbox?.size !== 'unlimited' || dimensions.width === 0) return;

    const startX = Math.floor(-camera.x / (currentTileSize + currentGap));
    const startY = Math.floor(-camera.y / (currentTileSize + currentGap));
    const endX = Math.ceil((-camera.x + dimensions.width) / (currentTileSize + currentGap));
    const endY = Math.ceil((-camera.y + dimensions.height) / (currentTileSize + currentGap));

    const margin = 10;
    const expandBy = 30;
    const size = grid.length;

    let expandTop = startY < margin;
    let expandBottom = endY >= size - margin;
    let expandLeft = startX < margin;
    let expandRight = endX >= size - margin;

    if (expandTop || expandBottom || expandLeft || expandRight) {
      let next = [...grid.map(row => [...row])];

      const createEmptyRow = (len: number) => Array.from({ length: len }, () => ({
        type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, stateH: false, stateV: false
      }));

      let camShiftX = 0;
      let camShiftY = 0;

      if (expandTop) {
        const needed = Math.max(expandBy, margin - startY);
        const newRows = Array.from({ length: needed }, () => createEmptyRow(next[0].length));
        next = [...newRows, ...next];
        camShiftY -= needed * (currentTileSize + currentGap);
      }
      if (expandBottom) {
        const needed = Math.max(expandBy, endY - (next.length - 1) + margin);
        const newRows = Array.from({ length: needed }, () => createEmptyRow(next[0].length));
        next = [...next, ...newRows];
      }
      if (expandLeft) {
        const needed = Math.max(expandBy, margin - startX);
        next = next.map(row => [...createEmptyRow(needed), ...row]);
        camShiftX -= needed * (currentTileSize + currentGap);
      }
      if (expandRight) {
        const needed = Math.max(expandBy, endX - (next[0].length - 1) + margin);
        next = next.map(row => [...row, ...createEmptyRow(needed)]);
      }

      setGrid(next);
      if (camShiftX !== 0 || camShiftY !== 0) {
        setCamera(c => ({ x: c.x + camShiftX, y: c.y + camShiftY }));
      }
    }
  }, [camera.x, camera.y, dimensions.width, dimensions.height, activeSandbox?.size, currentTileSize, currentGap, grid.length]);

  const getGridCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: -1, y: -1 };
    const mx = clientX - rect.left - camera.x;
    const my = clientY - rect.top - camera.y;
    return {
      x: Math.floor(mx / (currentTileSize + currentGap)),
      y: Math.floor(my / (currentTileSize + currentGap))
    };
  };

  const handleCanvasAction = useCallback((x: number, y: number, isNewClick: boolean, shiftKey: boolean = false) => {
    const currentGridSize = grid.length;
    if (x < 0 || x >= currentGridSize || y < 0 || y >= currentGridSize) return;

    const targetCell = grid[y][x];
    if (isVerifying) return;

    if (isNewClick && targetCell.type === ComponentType.INPUT_LEVER && selectedComponent !== ComponentType.EMPTY && toolMode !== ToolMode.SELECT) {
      manualChangeRef.current = true;
      setGrid(prev => {
        const next = [...prev.map(row => [...row])];
        next[y][x] = { ...next[y][x], manualToggle: !next[y][x].manualToggle };
        return !isPlaying ? tickGrid(next) : next;
      });
      return;
    }

    if (isNewClick && targetCell.type === ComponentType.NOTE_BLOCK && toolMode !== ToolMode.SELECT && selectedComponent !== ComponentType.EMPTY) {
      if (onNoteBlockClick) onNoteBlockClick(x, y, targetCell.noteKey || 'C4');
      return;
    }

    if (isNewClick && targetCell.type === ComponentType.BUFFER && toolMode !== ToolMode.SELECT && selectedComponent !== ComponentType.EMPTY) {
      if (onBufferClick) onBufferClick(x, y, targetCell.delayMs || 500);
      return;
    }

    if (targetCell.isLocked) return;

    if (toolMode === ToolMode.SELECT) {
      if (isNewClick) {
        setSelectionStart({ x, y });
        setSelectionEnd({ x, y });
        if (onSelectionUpdate) onSelectionUpdate(null);
      } else {
        setSelectionEnd({ x, y });
      }
      return;
    }

    if (toolMode === ToolMode.STAMP && selectedBlueprint && isNewClick) {
      manualChangeRef.current = true;
      setGrid(prev => {
        const next = [...prev.map(row => [...row])];
        selectedBlueprint.data.forEach((row, dy) => {
          row.forEach((cell, dx) => {
            const gx = x + dx;
            const gy = y + dy;
            if (gx < currentGridSize && gy < currentGridSize) {
              next[gy][gx] = { ...cell, state: false, nextState: false };
            }
          });
        });
        return next;
      });
      if (onStampComplete) onStampComplete();
      return;
    }

    if (!isNewClick && lastPlacedPos?.x === x && lastPlacedPos?.y === y) return;

    manualChangeRef.current = true;
    setGrid(prev => {
      const next = [...prev.map(row => [...row])];
      const cell = next[y][x];

      // Handle Shift+Click for rotation or regular placement/interaction
      const isShiftRotation = isNewClick && cell.type !== ComponentType.EMPTY && shiftKey;

      if (isNewClick && cell.type === selectedComponent && selectedComponent === ComponentType.INPUT_LEVER) {
        next[y][x] = { ...cell, manualToggle: !cell.manualToggle };
      } else if (isShiftRotation || (isNewClick && cell.type === selectedComponent && selectedComponent !== ComponentType.EMPTY && selectedComponent !== ComponentType.WIRE)) {
        const directions = [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST];
        const currentIndex = directions.indexOf(cell.direction);
        const nextDir = directions[(currentIndex + 1) % 4];
        next[y][x] = { ...cell, direction: nextDir };
      } else if (cell.type !== selectedComponent) {
        let placementDirection = selectedDirection;
        if (selectedComponent === ComponentType.INVERTER) {
          const checkDirs = [
            { dir: Direction.NORTH, dx: 0, dy: -1 },
            { dir: Direction.SOUTH, dx: 0, dy: 1 },
            { dir: Direction.EAST, dx: 1, dy: 0 },
            { dir: Direction.WEST, dx: -1, dy: 0 },
          ];
          for (const d of checkDirs) {
            const nx = x - d.dx;
            const ny = y - d.dy;
            if (nx >= 0 && nx < currentGridSize && ny >= 0 && ny < currentGridSize) {
              const neighbor = next[ny][nx];
              if (neighbor.type === ComponentType.WIRE || neighbor.type === ComponentType.SOURCE || neighbor.type === ComponentType.INPUT_LEVER) {
                placementDirection = d.dir;
                break;
              }
            }
          }
        }

        next[y][x] = {
          type: selectedComponent,
          state: false,
          nextState: false,
          direction: placementDirection,
          manualToggle: false,
          stateH: false,
          stateV: false,
          noteKey: selectedComponent === ComponentType.NOTE_BLOCK ? 'C4' : undefined
        };
      }

      return next;
    });
    setLastPlacedPos({ x, y });
  }, [selectedComponent, selectedDirection, lastPlacedPos, toolMode, selectedBlueprint, onSelectionUpdate, onStampComplete, activeSandbox, isVerifying, isPlaying, currentTileSize, currentGap, camera, dimensions.width, dimensions.height, grid, onNoteBlockClick, onBufferClick, tickRate]);

  // Handle syncing to parent
  useEffect(() => {
    // Only sync back if manually edited OR if we are in verification mode
    if (manualChangeRef.current || isVerifying) {
      const timeout = setTimeout(() => {
        syncToParent(grid);
        manualChangeRef.current = false;
      }, isVerifying ? 0 : 200); // Short debounce for snappy feel but prevents flood

      return () => clearTimeout(timeout);
    }
  }, [grid, isVerifying, syncToParent]);

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamera(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const lastProcessedCoordsRef = useRef<{ x: number, y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) { // Middle click to pan
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setCameraStart({ x: camera.x, y: camera.y });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    setIsDragging(true);
    const { x, y } = getGridCoords(e.clientX, e.clientY);
    lastProcessedCoordsRef.current = { x, y };
    handleCanvasAction(x, y, true, e.shiftKey);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setCamera({
        x: cameraStart.x + (e.clientX - panStart.x),
        y: cameraStart.y + (e.clientY - panStart.y)
      });
      return;
    }

    const { x, y } = getGridCoords(e.clientX, e.clientY);
    setHoverPos({ x, y });

    if (isDragging) {
      if (lastProcessedCoordsRef.current) {
        const last = lastProcessedCoordsRef.current;
        if (last.x !== x || last.y !== y) {
          // Bresenham's line algorithm to fill in gaps
          let x0 = last.x;
          let y0 = last.y;
          const x1 = x;
          const y1 = y;
          const dx = Math.abs(x1 - x0);
          const dy = -Math.abs(y1 - y0);
          const sx = x0 < x1 ? 1 : -1;
          const sy = y0 < y1 ? 1 : -1;
          let err = dx + dy;

          while (true) {
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
            handleCanvasAction(x0, y0, false, e.shiftKey);
          }
        }
      } else {
        handleCanvasAction(x, y, false, e.shiftKey);
      }
      lastProcessedCoordsRef.current = { x, y };
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    lastProcessedCoordsRef.current = null;
    setIsDragging(false);
    setLastPlacedPos(null);
    if (toolMode === ToolMode.SELECT && selectionStart && selectionEnd) {
      if (onSelectionUpdate) {
        onSelectionUpdate({
          x1: selectionStart.x, y1: selectionStart.y,
          x2: selectionEnd.x, y2: selectionEnd.y
        });
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#161B22] rounded-xl shadow-2xl">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        className={`touch-none ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        id="spectre-canvas"
      />
      {/* Help tooltip for pan/zoom */}
      <div className="absolute bottom-4 left-4 bg-black/50 text-white/70 text-[10px] font-mono p-2 rounded backdrop-blur-sm pointer-events-none">
        SHIFT+Drag to Pan | Scroll to Zoom
      </div>
    </div>
  );
};
