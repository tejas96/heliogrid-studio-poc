import { describe, expect, it } from 'vitest';
import { catalogProvenance, resolveCatalog } from '../../data/catalog';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import { PRICE_BOOK } from '../../data/pricebook';

// Schema validation for the versioned catalog envelope (§8.11). Every entry a
// design can select must be physically and commercially sane — a bad catalog
// row corrupts stringing, BOM and finance silently, so it fails loudly here.
describe('catalog envelope', () => {
  const cat = resolveCatalog();

  it('wraps the bundled DBs without altering them (zero behavior change)', () => {
    expect(cat.panels).toBe(PANEL_DB);
    expect(cat.inverters).toBe(INVERTER_DB);
    expect(cat.pricebook).toBe(PRICE_BOOK);
  });

  it('has a version and an effective date', () => {
    expect(cat.catalogVersion).toMatch(/^\d{4}\.\d{2}-\d+$/);
    expect(Number.isNaN(Date.parse(cat.effectiveFrom))).toBe(false);
  });

  it('panel entries are schema-valid with unique ids', () => {
    const ids = new Set<string>();
    for (const p of cat.panels) {
      expect(ids.has(p.id), `duplicate panel id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.watt).toBeGreaterThan(0);
      expect(p.lengthMm).toBeGreaterThan(p.widthMm);
      expect(p.vocV).toBeGreaterThan(p.vmpV);
      expect(p.iscA).toBeGreaterThan(p.impA);
      expect(p.tempCoeffVocPct).toBeLessThan(0);
      expect(p.priceInr).toBeGreaterThan(0);
      // Pmax sanity: Vmp×Imp within 3% of the nameplate watt
      expect(Math.abs(p.vmpV * p.impA - p.watt) / p.watt).toBeLessThan(0.03);
      // comparison-matrix fields (§8.6): bundled rows must carry all three
      expect(p.warrantyYears, `${p.id} warrantyYears`).toBeGreaterThanOrEqual(10);
      expect(p.warrantyYears, `${p.id} warrantyYears`).toBeLessThanOrEqual(40);
      expect(p.weightKg, `${p.id} weightKg`).toBeGreaterThanOrEqual(15);
      expect(p.weightKg, `${p.id} weightKg`).toBeLessThanOrEqual(40);
      // ~glass+frame density sanity: 8–14 kg/m²
      const areaM2 = (p.lengthMm / 1000) * (p.widthMm / 1000);
      expect(p.weightKg! / areaM2, `${p.id} kg/m²`).toBeGreaterThan(8);
      expect(p.weightKg! / areaM2, `${p.id} kg/m²`).toBeLessThan(14);
      expect(['in_stock', 'on_order']).toContain(p.availability);
    }
  });

  it('inverter entries are schema-valid with unique ids', () => {
    const ids = new Set<string>();
    for (const inv of cat.inverters) {
      expect(ids.has(inv.id), `duplicate inverter id ${inv.id}`).toBe(false);
      ids.add(inv.id);
      expect(inv.acKw).toBeGreaterThan(0);
      expect([1, 3]).toContain(inv.phases);
      expect(inv.mppt.count).toBeGreaterThan(0);
      expect(inv.mppt.minV).toBeGreaterThan(0);
      expect(inv.mppt.maxV).toBeGreaterThan(inv.mppt.minV);
      expect(inv.maxDcV).toBeGreaterThanOrEqual(inv.mppt.maxV);
      expect(inv.mppt.maxCurrentA).toBeGreaterThan(0);
      expect(inv.mppt.stringsPerMppt).toBeGreaterThan(0);
      expect(inv.efficiencyPct).toBeGreaterThan(90);
      expect(inv.efficiencyPct).toBeLessThan(100);
      expect(inv.priceInr).toBeGreaterThan(0);
      expect(inv.warrantyYears, `${inv.id} warrantyYears`).toBeGreaterThanOrEqual(2);
      expect(inv.warrantyYears, `${inv.id} warrantyYears`).toBeLessThanOrEqual(15);
    }
  });

  it('pricebook values are positive finite rupees', () => {
    for (const [key, val] of Object.entries(cat.pricebook)) {
      expect(Number.isFinite(val), `pricebook.${key}`).toBe(true);
      expect(val, `pricebook.${key}`).toBeGreaterThan(0);
    }
  });

  it('entry provenance falls back to the catalog label', () => {
    expect(catalogProvenance(cat.panels[0].id)).toBe(cat.provenance);
  });
});
