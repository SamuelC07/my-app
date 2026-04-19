import { ComponentType, Direction, TileState } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArchitectInstruction {
  type: string;      // e.g. "WIRE", "INVERTER" — matches ComponentType keys
  x: number;
  y: number;
  rotation: number; // 0=NORTH, 90=EAST, 180=SOUTH, 270=WEST
}

export interface ArchitectResult {
  instructions: ArchitectInstruction[];
  rawText: string;
}

// ── API constants ─────────────────────────────────────────────────────────────

const K2_KEY    = import.meta.env.VITE_AIML_API_KEY as string;
const K2_URL    = 'https://api.k2think.ai/v1/chat/completions';
const K2_MODEL  = 'MBZUAI-IFM/K2-Think-v2';

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a high-precision spatial routing engine for SpectreLogic, a 2D tile-based digital logic simulator.

═══════════════════════════════════════════
 PHYSICS & SIMULATION RULES (CRITICAL)
═══════════════════════════════════════════

1. GRID: 50×50 tiles. Origin (0,0) is top-left. x increases RIGHT, y increases DOWN.

2. POWER PROPAGATION (The "Flood Fill"):
   - Within a SINGLE simulation tick, power propagates INSTANTLY through any connected network of WIREs, SOURCEs, and INPUT_LEVERs.
   - If a WIRE touches a powered source, the entire connected WIRE chain is powered immediately.

3. COMPONENT MECHANICS:
   - WIRE: Connects to ALL 4 adjacent neighbors. Conducts power in all directions.
   - BRIDGE: Isolates signals. Horizontal power stays horizontal; Vertical power stays vertical. They do NOT mix.
   - INPUT_LEVER / SOURCE: Emits power to ALL 4 neighbors.
   - OUTPUT_LAMP: Lights up if ANY neighbor is powered.

4. INVERTER (The Logic Gate):
   - DELAY: The INVERTER has a 1-tick simulation delay. 
     - Tick T: Input side receives power.
     - Tick T+1: Output side flips state.
   - DIRECTIONALITY: 
     - An INVERTER has a specific INPUT side and an OUTPUT side based on "rotation".
     - rotation=0   (NORTH): Output is at (x, y-1). Input must be at (x, y+1).
     - rotation=90  (EAST):  Output is at (x+1, y). Input must be at (x-1, y).
     - rotation=180 (SOUTH): Output is at (x, y+1). Input must be at (x, y-1).
     - rotation=270 (WEST):  Output is at (x-1, y). Input must be at (x+1, y).
   - CRITICAL: You MUST place a WIRE at the input-side neighbor and the output-side neighbor to successfully "read" and "write" signals.

5. COLLISION RULE: 
   - No two components may share a cell, EXCEPT a BRIDGE which can sit at the intersection of two crossing wires.

═══════════════════════════════════════════
 HOW TO BUILD COMPLEX LOGIC
═══════════════════════════════════════════

NOR GATE (Building Block):
   - Logic: NOT (A OR B)
   - Construction: 
     1. Bring Wire A and Wire B to the SAME tile (this is the OR part).
     2. Connect that shared tile to the INPUT side of an INVERTER.
     3. The OUTPUT side of the INVERTER is your NOR result.

SR LATCH (Memory):
   - Logic: Two cross-coupled NOR gates.
   - Physics: Output of NOR1 must be wired back to one of the inputs of NOR2. Output of NOR2 must be wired back to one of the inputs of NOR1.
   - Layout Tip: 
     - Place NOR1 at y=5 and NOR2 at y=10.
     - Use a vertical WIRE column to carry the feedback signal.
     - Use BRIDGE tiles where the feedback wires cross the input wires (S and R).

═══════════════════════════════════════════
 PLANNING PROCESS
═══════════════════════════════════════════
1. Mental Map: Sketch the gate logic.
2. Coordinate Assignment: Choose X,Y for components. Space them out (at least 2-3 tiles apart).
3. Routing: Define exact (x,y) paths for wires. Check for overlaps.
4. Verification: Trace the power flow. Does power at Input A reach the correct Inverter side?
5. JSON Generation: List every component.

═══════════════════════════════════════════
 OUTPUT FORMAT
═══════════════════════════════════════════
After your reasoning, output EXACTLY one JSON array. No markdown, no prose, no extra text after the array.

[
  {"type":"INPUT_LEVER","x":2,"y":5,"rotation":0},
  {"type":"WIRE","x":3,"y":5,"rotation":0},
  {"type":"INVERTER","x":4,"y":5,"rotation":90},
  {"type":"WIRE","x":5,"y":5,"rotation":0},
  {"type":"OUTPUT_LAMP","x":6,"y":5,"rotation":0}
]

Component names: WIRE, INVERTER, INPUT_LEVER, OUTPUT_LAMP, BRIDGE, SOURCE.`;

// ── JSON cleaner ──────────────────────────────────────────────────────────────

function cleanJson(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, '$1')          // trailing commas
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // unquoted keys
    .trim();
}

// ── Parser ────────────────────────────────────────────────────────────────────

function isInstructionArray(arr: unknown[]): arr is ArchitectInstruction[] {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const hits = arr.filter(
    (e: any) => typeof e?.x === 'number' && typeof e?.y === 'number' && typeof e?.type === 'string'
  ).length;
  return hits >= arr.length * 0.5;
}

export function parseInstructions(raw: string): ArchitectInstruction[] {
  const tryParse = (s: string): ArchitectInstruction[] | null => {
    for (const attempt of [s, cleanJson(s)]) {
      try {
        const p = JSON.parse(attempt);
        if (isInstructionArray(p) && p.length >= 3) return p;
      } catch { /* try next */ }
    }
    return null;
  };

  // Strategy 1: fenced code blocks
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let best: ArchitectInstruction[] | null = null;
  let fenceMatch;
  while ((fenceMatch = fenceRegex.exec(raw)) !== null) {
    const result = tryParse(fenceMatch[1].trim());
    if (result && (!best || result.length > best.length)) best = result;
  }
  if (best) return best;

  // Strategy 2: all balanced [...] spans, prefer largest, try last-to-first
  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '[') continue;
    let depth = 1, j = i + 1;
    while (j < raw.length && depth > 0) {
      if (raw[j] === '[') depth++;
      if (raw[j] === ']') depth--;
      j++;
    }
    if (depth === 0) spans.push({ start: i, end: j });
  }
  for (let k = spans.length - 1; k >= 0; k--) {
    const result = tryParse(raw.slice(spans[k].start, spans[k].end));
    if (result && (!best || result.length > best.length)) best = result;
  }
  if (best) return best;

  // Strategy 3: entire raw text
  const result = tryParse(raw.trim());
  if (result) return result;

  throw new Error('Could not parse a JSON instruction array from the model response.');
}

// ── Converter ─────────────────────────────────────────────────────────────────

function rotationToDirection(rotation: number): Direction {
  const r = ((rotation % 360) + 360) % 360;
  if (r < 45 || r >= 315) return Direction.NORTH;
  if (r < 135)            return Direction.EAST;
  if (r < 225)            return Direction.SOUTH;
  return Direction.WEST;
}

export function instructionsToTiles(
  instructions: ArchitectInstruction[]
): { x: number; y: number; tile: TileState }[] {
  return instructions.map(instr => {
    const key = instr.type.toUpperCase() as keyof typeof ComponentType;
    const type: ComponentType = ComponentType[key] ?? ComponentType.WIRE;
    return {
      x: instr.x,
      y: instr.y,
      tile: {
        type,
        state:        false,
        nextState:    false,
        direction:    rotationToDirection(instr.rotation),
        manualToggle: false,
        stateH:       false,
        stateV:       false,
      },
    };
  });
}

// ── K2 streaming ─────────────────────────────────────────────────────────────

async function streamK2(
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ content: string; reasoning: string }> {
  if (!K2_KEY) throw new Error('VITE_AIML_API_KEY is not set in .env');

  const response = await fetch(K2_URL, {
    method: 'POST',
    headers: {
      'accept':        'application/json',
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${K2_KEY}`,
    },
    body: JSON.stringify({
      model: K2_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`K2 API error ${response.status}: ${err}`);
  }

  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let content = '', reasoning = '', buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.content)           content   += delta.content;
        if (delta?.reasoning_content) reasoning += delta.reasoning_content;
      } catch { /* skip */ }
    }
  }
  return { content, reasoning };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function askArchitect(
  userPrompt: string,
  onSecondCall?: () => void,
): Promise<ArchitectResult> {

  // ── K2 path (two-call strategy for long reasoning) ────────────────────────
  const messages1 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userPrompt },
  ];
  const r1 = await streamK2(messages1, 32768);

  console.group('[AI Architect] K2 Call 1');
  console.log('content length:', r1.content.length);
  console.log('reasoning length:', r1.reasoning.length);
  console.log('content tail:', r1.content.slice(-500));
  console.groupEnd();

  for (const candidate of [r1.content, r1.reasoning, r1.content + '\n' + r1.reasoning].filter(Boolean)) {
    try {
      return { instructions: parseInstructions(candidate), rawText: r1.content || r1.reasoning };
    } catch { /* continue */ }
  }

  // Second call — extraction pass
  console.log('[AI Architect] No JSON in call 1 — making extraction call...');
  onSecondCall?.();

  const messages2 = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userPrompt },
    { role: 'assistant', content: r1.content || r1.reasoning },
    {
      role: 'user',
      content:
        'You ran out of space before outputting the JSON. ' +
        'Based on your analysis above, output ONLY the final JSON array now. ' +
        'No explanation, no markdown, no prose — just the raw JSON array starting with [ and ending with ].',
    },
  ];
  const r2 = await streamK2(messages2, 8192);

  console.group('[AI Architect] K2 Call 2 (extraction)');
  console.log('content:', r2.content.slice(0, 800));
  console.groupEnd();

  for (const candidate of [r2.content, r2.reasoning, r2.content + '\n' + r2.reasoning].filter(Boolean)) {
    try {
      const instructions = parseInstructions(candidate);
      return { instructions, rawText: r2.content || r2.reasoning };
    } catch { /* continue */ }
  }

  throw new Error(
    `AI Architect could not produce a valid circuit after two attempts.\n` +
    `Call 2 tail: ...${r2.content.slice(-300)}`
  );
}
