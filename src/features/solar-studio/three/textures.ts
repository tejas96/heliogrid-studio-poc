// ─── Shared 3D assets: PV cell-grid texture + panel materials (module cache) ─
// One CanvasTexture and three materials are shared by every placed panel, so
// 88+ panels cost a single texture upload and three GPU programs.
import * as THREE from 'three';

let cellTex: THREE.CanvasTexture | null = null;

/** Deterministic PV cell grid: dark navy, 6×10 lighter grid lines, vignette. */
export function getCellGridTexture(): THREE.CanvasTexture {
  if (cellTex) return cellTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const ctx = c.getContext('2d')!;
  // navy base with a faint vertical sheen
  const bg = ctx.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#0a2350');
  bg.addColorStop(0.5, '#061a3f');
  bg.addColorStop(1, '#051531');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  // 6 × 10 cell grid
  ctx.strokeStyle = 'rgba(122, 162, 235, 0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const x = (i * c.width) / 6;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, c.height);
  }
  for (let j = 0; j <= 10; j++) {
    const y = (j * c.height) / 10;
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y);
  }
  ctx.stroke();
  // slight vignette so each module reads as a unit from afar
  const v = ctx.createRadialGradient(128, 192, 70, 128, 192, 270);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, c.width, c.height);

  cellTex = new THREE.CanvasTexture(c);
  cellTex.colorSpace = THREE.SRGBColorSpace;
  cellTex.anisotropy = 4;
  return cellTex;
}

export interface PanelMaterials {
  glass: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshStandardMaterial;
  leg: THREE.MeshStandardMaterial;
}

let panelMats: PanelMaterials | null = null;

/** Shared glass / aluminum-frame / stand-leg materials for placed panels. */
export function getPanelMaterials(): PanelMaterials {
  if (panelMats) return panelMats;
  panelMats = {
    // the cell-grid map carries the #061a3f navy, so the base color stays
    // white — multiplying navy × navy would render nearly black.
    glass: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0.15,
      roughness: 0.22,
      clearcoat: 0.7,
      clearcoatRoughness: 0.25,
      map: getCellGridTexture(),
    }),
    frame: new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.8, roughness: 0.35 }),
    leg: new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.7, roughness: 0.4 }),
  };
  return panelMats;
}
