// ─── Op registry: every op by id, for the AI planner and for tooling ────────
import type { DesignOp } from './types';

const ops = new Map<string, DesignOp<any>>();

export function registerOp(op: DesignOp<any>): void {
  ops.set(op.id, op);
}

export function opById(id: string): DesignOp<any> | undefined {
  return ops.get(id);
}

export function listOps(): DesignOp<any>[] {
  return [...ops.values()];
}
