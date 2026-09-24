/* Minimal typing for the claude.ai artifact runtime (contract 0.2.x). */

interface ClaudeDocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface ClaudeDocRef {
  get(): Promise<ClaudeDocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}

interface ClaudeDb {
  doc(path: string): ClaudeDocRef;
}

interface ClaudeUser {
  id(): Promise<string | null>;
}

interface ClaudeRuntime {
  use(name: "db"): Promise<ClaudeDb | null>;
  use(name: "user"): Promise<ClaudeUser | null>;
  use(name: string): Promise<unknown>;
}

interface Window {
  claude?: ClaudeRuntime;
}
