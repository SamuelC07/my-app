import { ComponentType, Direction, TileState } from '../constants';

export const getVector = (direction: Direction) => {
  switch (direction) {
    case Direction.NORTH: return { dx: 0, dy: -1 };
    case Direction.SOUTH: return { dx: 0, dy: 1 };
    case Direction.EAST: return { dx: 1, dy: 0 };
    case Direction.WEST: return { dx: -1, dy: 0 };
  }
};

export const tickGrid = (grid: TileState[][], tickRate: number = 60): TileState[][] => {
  const height = grid.length;
  if (height === 0) return grid;
  const width = grid[0].length;

  // 1. Identify active sources and find active bounding box to limit allocations
  let minY = height, maxY = -1, minX = width, maxX = -1;
  const activeSources: { x: number, y: number, sourceDir?: 'H' | 'V' }[] = [];

  for (let y = 0; y < height; y++) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      if (cell.type !== ComponentType.EMPTY) {
        rowHasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;

        if (cell.type === ComponentType.SOURCE) {
          activeSources.push({ x, y });
        } else if (cell.type === ComponentType.INPUT_LEVER && cell.manualToggle) {
          activeSources.push({ x, y });
        } else if ((cell.type === ComponentType.INVERTER || cell.type === ComponentType.BUFFER) && cell.state) {
          activeSources.push({ x, y });
        }
      }
    }
    if (rowHasContent) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // If grid is completely empty, skip simulation
  if (minY > maxY) return grid;

  // 2. Flood fill to find all powered nodes
  const powered = new Set<string>();
  const poweredH = new Set<string>();
  const poweredV = new Set<string>();

  const queue: { x: number, y: number, fromSide?: 'L' | 'R' | 'T' | 'B' }[] = [];

  activeSources.forEach(s => {
    const cell = grid[s.y][s.x];
    if (cell.type === ComponentType.INVERTER || cell.type === ComponentType.BUFFER) {
      const { dx, dy } = getVector(cell.direction);
      const fromSide = dx === 1 ? 'L' : dx === -1 ? 'R' : dy === 1 ? 'T' : 'B';
      queue.push({ x: s.x + dx, y: s.y + dy, fromSide });
    } else {
      powered.add(`${s.x},${s.y}`);
      queue.push({ x: s.x, y: s.y - 1, fromSide: 'B' });
      queue.push({ x: s.x, y: s.y + 1, fromSide: 'T' });
      queue.push({ x: s.x - 1, y: s.y, fromSide: 'R' });
      queue.push({ x: s.x + 1, y: s.y, fromSide: 'L' });
    }
  });

  const visited = new Set<string>();

  while (queue.length > 0) {
    const { x, y, fromSide } = queue.shift()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const key = `${x},${y}`;
    const cell = grid[y][x];

    if (cell.type === ComponentType.BRIDGE) {
      if (fromSide === 'L' || fromSide === 'R') {
        if (poweredH.has(key)) continue;
        poweredH.add(key);
        const nextX = fromSide === 'L' ? x + 1 : x - 1;
        queue.push({ x: nextX, y, fromSide });
      } else {
        if (poweredV.has(key)) continue;
        poweredV.add(key);
        const nextY = fromSide === 'T' ? y + 1 : y - 1;
        queue.push({ x, y: nextY, fromSide });
      }
      continue;
    }

    const visitKey = `${key},${fromSide}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (cell.type === ComponentType.WIRE || cell.type === ComponentType.OUTPUT_LAMP || cell.type === ComponentType.NOTE_BLOCK || cell.type === ComponentType.INVERTER || cell.type === ComponentType.BUFFER) {
      if (cell.type === ComponentType.INVERTER || cell.type === ComponentType.BUFFER) {
        const { dx, dy } = getVector(cell.direction);
        const inputPoints = [{ x: x - dx, y: y - dy }];

        let isPowered = false;
        for (const pt of inputPoints) {
          if (fromSide === 'L' && pt.x === x - 1 && pt.y === y) isPowered = true;
          if (fromSide === 'R' && pt.x === x + 1 && pt.y === y) isPowered = true;
          if (fromSide === 'T' && pt.x === x && pt.y === y - 1) isPowered = true;
          if (fromSide === 'B' && pt.x === x && pt.y === y + 1) isPowered = true;
          if (isPowered) break;
        }

        if (!isPowered) continue;
      }

      powered.add(key);
      if (cell.type !== ComponentType.INVERTER && cell.type !== ComponentType.BUFFER) {
        queue.push({ x: x - 1, y, fromSide: 'R' });
        queue.push({ x: x + 1, y, fromSide: 'L' });
        queue.push({ x, y: y - 1, fromSide: 'B' });
        queue.push({ x, y: y + 1, fromSide: 'T' });
      }
    }
  }

  // 3. Selective Allocation: Only copy rows/cells inside the bounding box
  let hasChanges = false;

  const nextGrid = grid.map((row, y) => {
    if (y < minY || y > maxY) return row; // Keep original reference for empty rows

    let rowHasChanges = false;
    const newRow = row.map((cell, x) => {
      if (x < minX || x > maxX || cell.type === ComponentType.EMPTY) return cell;

      const key = `${x},${y}`;
      let nextState = cell.state;
      let nextStateH = cell.stateH;
      let nextStateV = cell.stateV;

      switch (cell.type) {
        case ComponentType.SOURCE:
          nextState = true;
          break;
        case ComponentType.INPUT_LEVER:
          nextState = cell.manualToggle;
          break;
        case ComponentType.WIRE:
        case ComponentType.OUTPUT_LAMP:
        case ComponentType.NOTE_BLOCK:
          nextState = powered.has(key);
          break;
        case ComponentType.INVERTER:
          nextState = !powered.has(key);
          break;
        case ComponentType.BUFFER: {
          const inputState = powered.has(key);
          const history = cell.history || [];
          const nextHistory = [...history, inputState];
          
          const msPerTick = 1000 / tickRate;
          const requiredTicks = Math.max(1, Math.ceil((cell.delayMs || 500) / msPerTick));
          
          let bufferOutput = false;
          if (nextHistory.length > requiredTicks) {
            bufferOutput = nextHistory.shift()!;
          }
          
          nextState = bufferOutput;
          // We must update cell.history in the returned object later
          (cell as any)._nextHistory = nextHistory;
          break;
        }
        case ComponentType.BRIDGE:
          nextStateH = poweredH.has(key);
          nextStateV = poweredV.has(key);
          nextState = nextStateH || nextStateV;
          break;
      }

      const historyChanged = (cell as any)._nextHistory !== undefined;

      if (cell.state !== nextState || cell.stateH !== nextStateH || cell.stateV !== nextStateV || historyChanged) {
        rowHasChanges = true;
        hasChanges = true;
        const newCell = { ...cell, state: nextState, stateH: nextStateH, stateV: nextStateV };
        if (historyChanged) {
          newCell.history = (cell as any)._nextHistory;
          delete (cell as any)._nextHistory;
        }
        return newCell;
      }
      return cell;
    });

    return rowHasChanges ? newRow : row;
  });

  return hasChanges ? nextGrid : grid;
};
