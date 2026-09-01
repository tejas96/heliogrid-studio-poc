// ─── Op registry: every op by id, for the AI planner and for tooling ────────
import type { DesignOp } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ops = new Map<string, DesignOp<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOp(op: DesignOp<any>): void {
  ops.set(op.id, op);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function opById(id: string): DesignOp<any> | undefined {
  return ops.get(id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function listOps(): DesignOp<any>[] {
  return [...ops.values()];
}
