import { ComponentType, Direction, TileState, THEME } from '../constants';

const dimColor = (hex: string) => {
  if (!hex || !hex.startsWith('#')) return hex;
  let color = hex.substring(1);
  if (color.length === 3) color = color.split('').map(s => s + s).join('');
  
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  // Use a dimming factor
  const dr = Math.floor(r * 0.35);
  const dg = Math.floor(g * 0.35);
  const db = Math.floor(b * 0.35);
  
  return `rgb(${dr}, ${dg}, ${db})`;
};

export const drawTile = (
  ctx: CanvasRenderingContext2D, 
  cell: TileState, 
  px: number, 
  py: number, 
  tileSize: number, 
  gap: number,
  grid?: TileState[][],
  x?: number,
  y?: number,
  isGhost: boolean = false
) => {
  ctx.globalAlpha = isGhost ? 0.4 : 1.0;

  switch (cell.type) {
    case ComponentType.WIRE: {
      const color = cell.state ? THEME.wireOn : THEME.wireOff;
      ctx.strokeStyle = color;
      ctx.lineWidth = tileSize * 0.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const cx = px + tileSize / 2;
      const cy = py + tileSize / 2;

      if (grid !== undefined && x !== undefined && y !== undefined) {
        const GRID_SIZE = grid.length;
        const n = (y > 0 && grid[y - 1][x].type !== ComponentType.EMPTY);
        const s = (y < GRID_SIZE - 1 && grid[y + 1][x].type !== ComponentType.EMPTY);
        const w = (x > 0 && grid[y][x - 1].type !== ComponentType.EMPTY);
        const e = (x < GRID_SIZE - 1 && grid[y][x + 1].type !== ComponentType.EMPTY);

        const active = [n, s, e, w].filter(Boolean).length;

        if (active === 0) {
          // Single point
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (active === 1) {
          // Terminal end
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          if (n) ctx.lineTo(cx, py - gap);
          else if (s) ctx.lineTo(cx, py + tileSize + gap);
          else if (w) ctx.lineTo(px - gap, cy);
          else if (e) ctx.lineTo(px + tileSize + gap, cy);
          ctx.stroke();
        } else if (active === 2 && ((n && s) || (w && e))) {
          // Straight line
          ctx.beginPath();
          if (n && s) {
            ctx.moveTo(cx, py - gap);
            ctx.lineTo(cx, py + tileSize + gap);
          } else {
            ctx.moveTo(px - gap, cy);
            ctx.lineTo(px + tileSize + gap, cy);
          }
          ctx.stroke();
        } else if (active === 2) {
          // Curved corner
          ctx.beginPath();
          if (n && e) {
            ctx.moveTo(cx, py - gap);
            ctx.quadraticCurveTo(cx, cy, px + tileSize + gap, cy);
          } else if (n && w) {
            ctx.moveTo(cx, py - gap);
            ctx.quadraticCurveTo(cx, cy, px - gap, cy);
          } else if (s && e) {
            ctx.moveTo(cx, py + tileSize + gap);
            ctx.quadraticCurveTo(cx, cy, px + tileSize + gap, cy);
          } else if (s && w) {
            ctx.moveTo(cx, py + tileSize + gap);
            ctx.quadraticCurveTo(cx, cy, px - gap, cy);
          }
          ctx.stroke();
        } else {
          // Junction (3 or 4 connections)
          ctx.beginPath();
          if (n) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py - gap); }
          if (s) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py + tileSize + gap); }
          if (w) { ctx.moveTo(cx, cy); ctx.lineTo(px - gap, cy); }
          if (e) { ctx.moveTo(cx, cy); ctx.lineTo(px + tileSize + gap, cy); }
          ctx.stroke();
          
          // Central connection hub
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, ctx.lineWidth * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Default for preview
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px + tileSize, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(cx, py + tileSize);
        ctx.stroke();
      }
      break;
    }

    case ComponentType.SOURCE:
      ctx.fillStyle = THEME.source;
      ctx.beginPath();
      ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;

    case ComponentType.INVERTER:
      ctx.save();
      ctx.translate(px + tileSize / 2, py + tileSize / 2);
      if (cell.direction === Direction.SOUTH) ctx.rotate(Math.PI);
      if (cell.direction === Direction.EAST) ctx.rotate(Math.PI / 2);
      if (cell.direction === Direction.WEST) ctx.rotate(-Math.PI / 2);
      
      ctx.fillStyle = THEME.inverter;
      ctx.beginPath();
      ctx.moveTo(0, -tileSize * 0.4);
      ctx.lineTo(tileSize * 0.3, tileSize * 0.3);
      ctx.lineTo(-tileSize * 0.3, tileSize * 0.3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cell.state ? THEME.wireOn : THEME.wireOff;
      ctx.beginPath();
      ctx.arc(0, -tileSize * 0.4, tileSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;

    case ComponentType.BUFFER:
      ctx.save();
      ctx.translate(px + tileSize / 2, py + tileSize / 2);
      if (cell.direction === Direction.SOUTH) ctx.rotate(Math.PI);
      if (cell.direction === Direction.EAST) ctx.rotate(Math.PI / 2);
      if (cell.direction === Direction.WEST) ctx.rotate(-Math.PI / 2);
      
      ctx.fillStyle = '#059669'; // Emerald
      ctx.beginPath();
      ctx.moveTo(0, -tileSize * 0.4);
      ctx.lineTo(tileSize * 0.3, tileSize * 0.3);
      ctx.lineTo(-tileSize * 0.3, tileSize * 0.3);
      ctx.closePath();
      ctx.fill();

      // Output indicator
      ctx.fillStyle = cell.state ? THEME.wireOn : THEME.wireOff;
      ctx.beginPath();
      ctx.arc(0, -tileSize * 0.4, tileSize * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Delay value text
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${tileSize * 0.18}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${cell.delayMs || 500}ms`, 0, tileSize * 0.15);

      ctx.restore();
      break;

    case ComponentType.INPUT_LEVER:
      ctx.fillStyle = cell.color ? (cell.manualToggle ? cell.color : dimColor(cell.color)) : (cell.manualToggle ? THEME.lever : THEME.wireOff);
      ctx.fillRect(px + tileSize * 0.1, py + tileSize * 0.1, tileSize * 0.8, tileSize * 0.8);
      ctx.strokeStyle = '#fff';
      if (cell.manualToggle) {
        ctx.shadowBlur = tileSize * 0.2;
        ctx.shadowColor = cell.color || THEME.lever;
      }
      ctx.lineWidth = 2; 
      ctx.strokeRect(px + tileSize * 0.2, py + tileSize * 0.2, tileSize * 0.6, tileSize * 0.6);
      ctx.shadowBlur = 0;
      break;

    case ComponentType.OUTPUT_LAMP:
      ctx.fillStyle = cell.color ? (cell.state ? cell.color : dimColor(cell.color)) : (cell.state ? THEME.lampOn : THEME.lampOff);
      ctx.strokeStyle = cell.color ? (cell.state ? cell.color : dimColor(cell.color)) : (cell.state ? THEME.lampGlow : THEME.wireOff);
      ctx.lineWidth = (cell.state || cell.color) ? 3 : 1;
      ctx.beginPath();
      ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case ComponentType.NOTE_BLOCK: {
      const active = cell.state;
      ctx.fillStyle = active ? '#FBBF24' : '#78350F';
      ctx.strokeStyle = active ? '#FFF' : '#451A03';
      ctx.lineWidth = active ? 2 : 1;
      
      // Outer box
      const r = tileSize * 0.1;
      const x = px + tileSize * 0.1;
      const y = py + tileSize * 0.1;
      const w = tileSize * 0.8;
      const h = tileSize * 0.8;
      
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw Note Icon (eighth note)
      ctx.fillStyle = active ? '#000' : '#D97706';
      const cx = px + tileSize / 2;
      const cy = py + tileSize / 2;
      
      ctx.beginPath();
      ctx.arc(cx - tileSize * 0.1, cy + tileSize * 0.15, tileSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.lineWidth = tileSize * 0.05;
      ctx.strokeStyle = active ? '#000' : '#D97706';
      ctx.beginPath();
      ctx.moveTo(cx, cy + tileSize * 0.15);
      ctx.lineTo(cx, cy - tileSize * 0.15);
      ctx.lineTo(cx + tileSize * 0.15, cy - tileSize * 0.05);
      ctx.stroke();

      // Display Key Name
      if (cell.noteKey) {
        ctx.fillStyle = active ? '#000' : '#FFF';
        ctx.font = `bold ${tileSize * 0.25}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(cell.noteKey, cx, cy + tileSize * 0.35);
      }

      // Hover indicator
      if (grid && x !== undefined && y !== undefined && !cell.isLocked) {
        // We don't have hover state here directly, but we can check if it's being drawn 
        // in a context where we want to show interaction hints.
        // Actually, let's just make the note more prominent.
      }
      break;
    }
      
    case ComponentType.BRIDGE: {
      const lineW = tileSize * 0.15;
      // Horizontal Line
      ctx.strokeStyle = cell.stateH ? THEME.wireOn : THEME.wireOff;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(px, py + tileSize / 2);
      ctx.lineTo(px + tileSize, py + tileSize / 2);
      ctx.stroke();

      // Vertical Line (Shadow/Outline for depth)
      ctx.strokeStyle = THEME.bg;
      ctx.lineWidth = lineW * 1.5;
      ctx.beginPath();
      ctx.moveTo(px + tileSize / 2, py);
      ctx.lineTo(px + tileSize / 2, py + tileSize);
      ctx.stroke();

      // Vertical Line
      ctx.strokeStyle = cell.stateV ? THEME.wireOn : THEME.wireOff;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(px + tileSize / 2, py);
      ctx.lineTo(px + tileSize / 2, py + tileSize);
      ctx.stroke();
      break;
    }

    default:
      if (cell.type === ComponentType.EMPTY && cell.isLocked) {
        ctx.fillStyle = '#111822'; // Dark gray/black for obstacles
        ctx.fillRect(px + tileSize * 0.05, py + tileSize * 0.05, tileSize * 0.9, tileSize * 0.9);
      }
      break;
  }

  // Draw border for locked components
  if (cell.isLocked) {
    ctx.strokeStyle = THEME.lever; // Use a light purple or accent for the "locked" border
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]); // Dotted border to indicate "fixed"
    ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
    ctx.setLineDash([]);
  }
  
  ctx.globalAlpha = 1.0;
};
