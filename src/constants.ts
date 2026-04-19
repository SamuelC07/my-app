export enum ComponentType {
  EMPTY = 'EMPTY',
  WIRE = 'WIRE',
  INVERTER = 'INVERTER',
  SOURCE = 'SOURCE',
  BRIDGE = 'BRIDGE',
  INPUT_LEVER = 'INPUT_LEVER',
  OUTPUT_LAMP = 'OUTPUT_LAMP',
  NOTE_BLOCK = 'NOTE_BLOCK',
  BUFFER = 'BUFFER',
  SELECT = 'SELECT' // Pseudo-component for selection tool
}

export enum ToolMode {
  PLACE = 'PLACE',
  SELECT = 'SELECT',
  STAMP = 'STAMP'
}

export enum ViewState {
  TITLE = 'TITLE',
  SANDBOX_MENU = 'SANDBOX_MENU',
  SANDBOX = 'SANDBOX',
  CAMPAIGNS = 'CAMPAIGNS',
  LEVELS = 'LEVELS',
  LEVEL_PLAY = 'LEVEL_PLAY'
}

export type SandboxSize = 'small' | 'medium' | 'large' | 'unlimited';

export interface SandboxMeta {
  id: string;
  name: string;
  size: SandboxSize;
  lastModified: number;
}

export interface Level {
  id: string;
  module: string;
  campaign: string;
  name: string;
  description: string;
  hint: string;
  size: number;
  initialGrid: TileState[][];
  unlockedComponents: ComponentType[];
  featuredComponent?: ComponentType;
  tutorialSlides?: { title: string, content: string, image?: string }[];
  postWinPrompt?: {
    title: string;
    message: string;
    actionLabel: string;
    onAction: (grid: TileState[][]) => void;
  };
  checkCondition: (grid: TileState[][]) => { success: boolean, message: string };
}

export interface Blueprint {
  id: string;
  name: string;
  width: number;
  height: number;
  data: TileState[][];
  preview?: string; // Base64 preview
}

export enum Direction {
  NORTH = 'NORTH',
  SOUTH = 'SOUTH',
  EAST = 'EAST',
  WEST = 'WEST'
}

export interface TileState {
  type: ComponentType;
  state: boolean;
  stateH?: boolean; // For BRIDGE
  stateV?: boolean; // For BRIDGE
  nextState: boolean;
  nextStateH?: boolean;
  nextStateV?: boolean;
  direction: Direction;
  manualToggle: boolean; // For INPUT_LEVER
  isLocked?: boolean; // Cannot be changed by player
  color?: string; // Custom color for the component
  noteKey?: string; // For NOTE_BLOCK (e.g., 'C4', 'D#4')
  delayMs?: number; // For BUFFER
  history?: boolean[]; // For BUFFER state queue
}

export const GRID_SIZE = 100;
export const TILE_SIZE = 24;
export const GAP = 1;

const createEmptyGrid = (size: number): TileState[][] => {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      type: ComponentType.EMPTY,
      state: false,
      nextState: false,
      direction: Direction.NORTH,
      manualToggle: false,
    }))
  );
};

export const LEVELS_DATA: Level[] = [
  {
    id: '1',
    campaign: 'Basic Logic',
    module: '001',
    name: 'Flow State',
    description: "Simple starting point. Connect the input switch to the output lamp using standard wires. Make sure the signal can reach the lamp!",
    hint: "Click the Wire tool, then drag a path from the Switch (left) to the Lamp (right).",
    size: 7,
    initialGrid: (() => {
      const g = createEmptyGrid(7);
      g[3][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[3][5] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.EMPTY],
    featuredComponent: ComponentType.WIRE,
    tutorialSlides: [
      { title: "Power Up", content: "The Power source is the Input Lever. Click it with your mouse (or tap) to flip the switch and send current into the matrix." },
      { title: "The Beacon", content: "The Circular Lamp is your goal. Connect it to a power source using wires. When the light shines white, you've successfully completed the logic path." }
    ],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '2',
    campaign: 'Basic Logic',
    module: '002',
    name: 'The Obstacle Course',
    description: "Connect the power to the lamp, but you can't go through the locked 'Void Blocks'. You'll have to weave around them!",
    hint: "Use wires to go up or down to avoid those black squares.",
    size: 8,
    initialGrid: (() => {
      const g = createEmptyGrid(8);
      g[3][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[3][6] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      // Rocks
      g[3][3] = { type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[3][4] = { type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[2][3] = { type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[4][3] = { type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '3',
    campaign: 'Basic Logic',
    module: '003',
    name: 'The Big Flip',
    description: "Logic signals can be inverted. Use an Inverter to turn OFF into ON. The lamp should stay ON when the switch is OFF!",
    hint: "Place an Inverter facing the Light Bulb. It flips the signal!",
    size: 7,
    initialGrid: (() => {
      const g = createEmptyGrid(7);
      g[3][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[3][5] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.EMPTY],
    featuredComponent: ComponentType.INVERTER,
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '4',
    campaign: 'Basic Logic',
    module: '004',
    name: 'Bridge the Gap',
    description: "Two separate circuits! Connect Red-to-Red and Blue-to-Blue. Since they have to cross, use the Crossing Bridge block.",
    hint: "The Bridge block lets one wire pass horizontally and another vertically without short-circuiting.",
    size: 9,
    initialGrid: (() => {
      const g = createEmptyGrid(9);
      // Surround buildable area with obstacles to force a cross shape
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
          if (x !== 4 && y !== 4) {
            // Not part of the central cross
            g[y][x] = { type: ComponentType.EMPTY, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
          }
        }
      }

      // Pair 1 (Red style)
      g[4][0] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#EF4444' };
      g[4][8] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#EF4444' };
      // Pair 2 (Blue style)
      g[0][4] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#3B82F6' };
      g[8][4] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#3B82F6' };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.EMPTY],
    featuredComponent: ComponentType.BRIDGE,
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '6',
    campaign: 'Basic Logic',
    module: '005',
    name: 'Merge Mania (OR)',
    description: "Two signals can be merged simply by connecting their wires. When wires touch, they share the same electricity! Light the lamp if either (or both) of the switches are ON.",
    hint: "Connect both switches to a single wire path that leads to the lamp. Electricity from either path will flow into the shared line.",
    size: 9,
    initialGrid: (() => {
      const g = createEmptyGrid(9);
      g[2][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[6][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[4][7] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.INPUT_LEVER, ComponentType.OUTPUT_LAMP, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '5',
    campaign: 'Basic Logic',
    module: '006',
    name: 'The Paradox (NAND)',
    description: "A NAND gate is the building block of all logic. It only outputs OFF when BOTH inputs are ON. Can you build it using Inverters and wire merging?",
    hint: "Think De Morgan! NOT(A AND B) is the same as (NOT A) OR (NOT B). Invert both inputs, then merge them into a single path.",
    size: 9,
    initialGrid: (() => {
      const g = createEmptyGrid(9);
      g[2][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[6][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[4][7] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.INPUT_LEVER, ComponentType.OUTPUT_LAMP, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '8',
    campaign: 'Basic Logic',
    module: '007',
    name: 'Signal Sync',
    description: "An AND gate only outputs ON when BOTH inputs are active. Use De Morgan's laws once more: NOT( (NOT A) OR (NOT B) ). This ensures both signals must be high.",
    hint: "Place Inverters on both input lines, feed them into an OR gate, and then invert the final output before it reaches the lamp.",
    size: 15,
    initialGrid: (() => {
      const g = createEmptyGrid(15);
      g[4][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[10][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[7][13] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.INPUT_LEVER, ComponentType.OUTPUT_LAMP, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '7',
    campaign: 'Basic Logic',
    module: '008',
    name: 'Memory Cell',
    description: "In the laboratory, you'll need to store state. A latch is a circuit that remembers its value. Build a circuit where turning one switch ON keeps the lamp ON, even if you turn it back OFF, until the second 'Reset' switch is pulsed.",
    hint: "Connect the output of your logic path back into a wire junction. To reset, you'll need to break that loop with an inverter controlled by the Reset lever.",
    size: 15,
    initialGrid: (() => {
      const g = createEmptyGrid(15);
      g[4][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#10B981' }; // Set (Green)
      g[10][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true, color: '#EF4444' }; // Reset (Red)
      g[7][13] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.INPUT_LEVER, ComponentType.OUTPUT_LAMP, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '9',
    campaign: 'Basic Logic',
    module: '009',
    name: 'The Equivalence (XNOR)',
    description: "The final challenge. An XNOR gate outputs ON only when BOTH inputs are the same (Both ON or Both OFF). This is the 'Equal' operator of logic.",
    hint: "Think in two branches: (A AND B) OR (NOT A AND NOT B). You'll need to use your knowledge of AND gates and merging paths!",
    size: 17,
    initialGrid: (() => {
      const g = createEmptyGrid(17);
      g[4][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[12][1] = { type: ComponentType.INPUT_LEVER, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      g[8][15] = { type: ComponentType.OUTPUT_LAMP, state: false, nextState: false, direction: Direction.NORTH, manualToggle: false, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.INVERTER, ComponentType.BRIDGE, ComponentType.INPUT_LEVER, ComponentType.OUTPUT_LAMP, ComponentType.EMPTY],
    checkCondition: (grid: TileState[][]) => ({ success: true, message: 'Ready!' })
  },
  {
    id: '10',
    campaign: 'More Fun components',
    module: '010',
    name: 'Musical Foundations',
    description: "Welcome to the sonic side of logic! The Note Block plays a sound when it receives power. Connect the fixed source to the Note Block and verify the circuit.",
    hint: "Place a Note Block and connect it to the lever on the left.",
    size: 11,
    initialGrid: (() => {
      const g = createEmptyGrid(11);
      g[5][1] = { type: ComponentType.INPUT_LEVER, state: true, nextState: true, direction: Direction.NORTH, manualToggle: true, isLocked: true };
      return g;
    })(),
    unlockedComponents: [ComponentType.WIRE, ComponentType.NOTE_BLOCK, ComponentType.EMPTY],
    featuredComponent: ComponentType.NOTE_BLOCK,
    checkCondition: (grid: TileState[][]) => {
      let poweredNoteBlock = false;
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x].type === ComponentType.NOTE_BLOCK && grid[y][x].state) {
            poweredNoteBlock = true;
          }
        }
      }
      return { success: poweredNoteBlock, message: poweredNoteBlock ? 'Melody found!' : 'Note Block is silent.' };
    }
  }
];

export const THEME = {
  bg: '#F8F7FA',
  grid: '#EDEBF2',
  wireOff: '#D6D1E0',
  wireOn: '#7C3AED',
  inverter: '#5B21B6',
  source: '#4C1D95',
  bridge: '#A78BFA',
  lever: '#8B5CF6',
  lampOff: '#E1DEE6',
  lampOn: '#FFFFFF',
  lampGlow: '#7C3AED',
  text: '#1F1B2E',
  accent: '#7C3AED',
  border: '#D1CDD9'
};
