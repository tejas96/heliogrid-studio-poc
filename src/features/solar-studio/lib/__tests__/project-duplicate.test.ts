import { describe, expect, it } from 'vitest';
import { copyName, duplicateProject } from '../project-duplicate';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

const IDS = { id: 'prj_new', shareId: 'share_new', now: 1_800_000_000_000 };

function withCaptures(): Project {
  const p = fixtureProject();
  return {
    ...p,
    id: 'prj_old',
    shareId: 'share_old',
    status: 'proposal_ready',
    captures: [
      { id: 'c1', imageBlobId: 'blob_1', imageDataUrl: null } as Project['captures'][number],
    ],
    coverImageBlobId: 'blob_1',
  };
}

describe('duplicateProject', () => {
  it('copies the design itself — roofs, panels, strings, components', () => {
    const src = withCaptures();
    const copy = duplicateProject(src, IDS);
    expect(copy.roofs).toEqual(src.roofs);
    expect(copy.panels).toEqual(src.panels);
    expect(copy.strings).toEqual(src.strings);
    expect(copy.components).toEqual(src.components);
  });

  it('mints a NEW share id — a copy must not overwrite an issued proposal', () => {
    const src = withCaptures();
    const copy = duplicateProject(src, IDS);
    expect(copy.shareId).toBe('share_new');
    expect(copy.shareId).not.toBe(src.shareId);
    expect(copy.id).not.toBe(src.id);
  });

  it('drops capture/cover BLOB REFERENCES — shared ids would break GC on delete', () => {
    const copy = duplicateProject(withCaptures(), IDS);
    expect(copy.captures).toEqual([]);
    expect(copy.coverImageBlobId).toBeNull();
    expect(copy.coverImage).toBeNull();
    expect(copy.coverForLayoutFp).toBeNull();
  });

  it('a copy without captures is never proposal-ready', () => {
    const copy = duplicateProject(withCaptures(), IDS);
    expect(copy.status).toBe('in_progress');
  });

  it('stamps both clocks from the injected time (pure)', () => {
    const copy = duplicateProject(withCaptures(), IDS);
    expect(copy.createdAt).toBe(IDS.now);
    expect(copy.updatedAt).toBe(IDS.now);
  });

  it('leaves the source untouched', () => {
    const src = withCaptures();
    const snapshot = JSON.stringify(src);
    duplicateProject(src, IDS);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe('copyName', () => {
  it('appends (copy)', () => {
    expect(copyName('Sharma Residence', [])).toBe('Sharma Residence (copy)');
  });

  it('numbers further copies instead of stacking suffixes', () => {
    const taken = ['Villa (copy)'];
    expect(copyName('Villa', taken)).toBe('Villa (copy 2)');
    expect(copyName('Villa (copy)', taken)).toBe('Villa (copy 2)');
  });

  it('keeps counting past a gap-free run', () => {
    const taken = ['A (copy)', 'A (copy 2)', 'A (copy 3)'];
    expect(copyName('A (copy 2)', taken)).toBe('A (copy 4)');
  });
});
