// ─── DXF export: the drawing an engineering / permit team can actually open ──
// We emitted SVG + PNG only, which no one can dimension, snap to, or drop into
// a permit set. This is a minimal AC1015 (AutoCAD 2000) ASCII DXF writer — no
// dependency, ~150 lines — because a real CAD library is orders of magnitude
// more surface than we need and DXF's group-code format is trivially writable.
//
// Coordinates pass through UNCHANGED: the project stores local East-North
// METRES (x = east, y = north) and DXF is x-right / y-up in drawing units, so
// the drawing is 1:1 in metres ($INSUNITS = 6). No scaling, no flipping — a
// dimension measured in CAD equals the dimension in the model.
export type DxfColor = number; // AutoCAD Color Index (1 red, 2 yellow, 3 green, 5 blue, 7 white/black, 8 grey)

export interface DxfLayer {
  name: string;
  color: DxfColor;
}

export interface DxfPoint {
  x: number;
  y: number;
}

/** Group code + value, the entire DXF grammar. */
function g(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

export class DxfBuilder {
  private layers: DxfLayer[] = [];
  private entities = '';

  addLayer(name: string, color: DxfColor): this {
    if (!this.layers.some((l) => l.name === name)) this.layers.push({ name, color });
    return this;
  }

  /** Closed or open polyline. Fewer than 2 points is silently skipped. */
  polyline(points: DxfPoint[], layer: string, closed = true): this {
    if (points.length < 2) return this;
    this.entities +=
      g(0, 'LWPOLYLINE') +
      g(8, layer) +
      g(100, 'AcDbEntity') +
      g(100, 'AcDbPolyline') +
      g(90, points.length) +
      g(70, closed ? 1 : 0);
    for (const p of points) this.entities += g(10, fmt(p.x)) + g(20, fmt(p.y));
    return this;
  }

  line(a: DxfPoint, b: DxfPoint, layer: string): this {
    this.entities +=
      g(0, 'LINE') + g(8, layer) + g(10, fmt(a.x)) + g(20, fmt(a.y)) + g(11, fmt(b.x)) + g(21, fmt(b.y));
    return this;
  }

  circle(c: DxfPoint, radius: number, layer: string): this {
    this.entities += g(0, 'CIRCLE') + g(8, layer) + g(10, fmt(c.x)) + g(20, fmt(c.y)) + g(40, fmt(radius));
    return this;
  }

  text(at: DxfPoint, value: string, layer: string, height = 0.4): this {
    this.entities +=
      g(0, 'TEXT') +
      g(8, layer) +
      g(10, fmt(at.x)) +
      g(20, fmt(at.y)) +
      g(40, fmt(height)) +
      g(1, sanitizeText(value));
    return this;
  }

  /** Serialise the whole document. */
  toString(): string {
    let out = '';
    // HEADER — version + drawing units (6 = metres), so CAD measures true metres
    out += g(0, 'SECTION') + g(2, 'HEADER');
    out += g(9, '$ACADVER') + g(1, 'AC1015');
    out += g(9, '$INSUNITS') + g(70, 6);
    out += g(0, 'ENDSEC');
    // TABLES — layer definitions
    out += g(0, 'SECTION') + g(2, 'TABLES');
    out += g(0, 'TABLE') + g(2, 'LAYER') + g(70, this.layers.length);
    for (const l of this.layers) {
      out += g(0, 'LAYER') + g(2, l.name) + g(70, 0) + g(62, l.color) + g(6, 'CONTINUOUS');
    }
    out += g(0, 'ENDTAB') + g(0, 'ENDSEC');
    // ENTITIES
    out += g(0, 'SECTION') + g(2, 'ENTITIES') + this.entities + g(0, 'ENDSEC');
    out += g(0, 'EOF');
    return out;
  }
}

/** DXF reals: fixed precision, never exponent notation (some readers choke). */
function fmt(n: number): string {
  return (Math.round(n * 1e6) / 1e6).toFixed(6);
}

/** DXF text is one line; strip newlines and the control char that ends a group. */
function sanitizeText(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}
