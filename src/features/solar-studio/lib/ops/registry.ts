// ─── Op registry: every op by id, for the AI planner and for tooling ────────
//
// Ten op modules call registerOp; nothing READS the registry yet, so a dead-code
// scan flags opById and listOps. They are parked, not dead: they are the whole
// reason the registry exists, and the AI planner that consumes them is the last
// item on the plan. Delete them only if that plan is dropped.
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
