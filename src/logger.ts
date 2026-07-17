export type LogLevel = 'info' | 'warn' | 'error' | 'table';

export interface LogEntry {
  level: LogLevel;
  text: string;
  color?: string;
  table?: Record<string, unknown>[];
  ts: number;
}

type Listener = (e: LogEntry) => void;

const listeners: Listener[] = [];
const buffer: LogEntry[] = [];
const MAX_BUFFER = 500;

function emit(e: LogEntry): void {
  buffer.push(e);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  for (const l of listeners) l(e);
}

export function subscribe(fn: Listener): () => void {
  for (const e of buffer) fn(e);
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function clearLog(): void {
  buffer.length = 0;
}

export function log(text: string, color?: string): void {
  if (color) console.log(`%c${text}`, `color:${color}`);
  else console.log(text);
  emit({ level: 'info', text, color, ts: Date.now() });
}

export function warn(text: string): void {
  console.warn(text);
  emit({ level: 'warn', text, ts: Date.now() });
}

export function error(text: string): void {
  console.error(text);
  emit({ level: 'error', text, ts: Date.now() });
}

export function table(caption: string, rows: Record<string, unknown>[]): void {
  console.log(caption);
  console.table(rows);
  emit({ level: 'table', text: caption, table: rows, ts: Date.now() });
}
