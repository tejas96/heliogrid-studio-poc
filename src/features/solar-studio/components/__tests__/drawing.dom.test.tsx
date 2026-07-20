// @vitest-environment jsdom
// ─── Phase 22o part 2: the sheet primitives reproduce the inline originals ──
// The gate for this refactor is that nothing MOVES. Three SLD sheets each
// hardcoded their own viewBox, border and title-block geometry; extracting
// that is only safe if the extracted version emits the same numbers.
//
// So these assert against the ORIGINAL literals, copied from the pre-refactor
// source, not against whatever the new component happens to produce. Writing
// them the other way round would pass no matter what I broke — and I had
// already broken one: my first TitleBlock derived the column pitch as
// `width / 3` = 306.67 where the original used 310, which silently shifted
// every value in the third column.
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { GridRefs, Legend, Notes, ScaleBar, Sheet, SHEET_SIZES, TitleBlock } from '../drawing';

afterEach(cleanup);

const svg = (ui: React.ReactElement) => render(ui).container.querySelector('svg')!;
const g = (ui: React.ReactElement) => render(<svg>{ui}</svg>).container.querySelector('svg')!;

describe('Sheet reproduces the inline SLD sheet exactly', () => {
  it('same viewBox — 980 × 640', () => {
    expect(svg(<Sheet>{null}</Sheet>).getAttribute('viewBox')).toBe('0 0 980 640');
  });

  it('same border rect — inset 6, stroke 1.4', () => {
    const rect = svg(<Sheet>{null}</Sheet>).querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('6');
    expect(rect.getAttribute('y')).toBe('6');
    expect(rect.getAttribute('width')).toBe('968'); // 980 − 12
    expect(rect.getAttribute('height')).toBe('628'); // 640 − 12
    expect(rect.getAttribute('stroke-width')).toBe('1.4');
    expect(rect.getAttribute('fill')).toBe('none');
  });

  it('same print styling', () => {
    const s = svg(<Sheet>{null}</Sheet>);
    expect(s.style.background).toBe('rgb(255, 255, 255)');
    expect(s.style.minWidth).toBe('900px');
    expect(s.style.width).toBe('100%');
  });

  it('renders its children', () => {
    const s = svg(
      <Sheet>
        <text data-testid="k">x</text>
      </Sheet>,
    );
    expect(s.querySelector('[data-testid="k"]')).toBeTruthy();
  });

  it('A3 landscape is a real second size, not the same sheet relabelled', () => {
    expect(svg(<Sheet size="a3">{null}</Sheet>).getAttribute('viewBox')).toBe('0 0 1120 792');
    expect(SHEET_SIZES.a3.w).toBeGreaterThan(SHEET_SIZES.sld.w);
  });
});

describe('TitleBlock reproduces the inline geometry exactly', () => {
  const rows: [string, string][] = [
    ['A', '1'],
    ['B', '2'],
    ['C', '3'],
    ['D', '4'],
  ];

  it('same block — x 30, y 560, 920 × 60, stroke 1.2', () => {
    const rect = g(<TitleBlock rows={rows} />).querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('30');
    expect(rect.getAttribute('y')).toBe('560');
    expect(rect.getAttribute('width')).toBe('920');
    expect(rect.getAttribute('height')).toBe('60');
    expect(rect.getAttribute('stroke-width')).toBe('1.2');
  });

  it('same cell positions — 44 + col×310, 582 + row×24', () => {
    const texts = [...g(<TitleBlock rows={rows} />).querySelectorAll('text')];
    // the original arithmetic, literally
    expect(texts[0].getAttribute('x')).toBe('44');
    expect(texts[0].getAttribute('y')).toBe('582');
    expect(texts[1].getAttribute('x')).toBe('354'); // 44 + 310
    expect(texts[2].getAttribute('x')).toBe('664'); // 44 + 620
    expect(texts[3].getAttribute('x')).toBe('44'); // wraps
    expect(texts[3].getAttribute('y')).toBe('606'); // 582 + 24
  });

  it('the key is bold and the value is not — a title block is scanned, not read', () => {
    const tspan = g(<TitleBlock rows={rows} />).querySelector('tspan')!;
    expect(tspan.getAttribute('font-weight')).toBe('800');
    expect(tspan.textContent).toBe('A: ');
  });

  it('sits itself on a bigger sheet instead of floating mid-page', () => {
    const rect = g(<TitleBlock rows={rows} size="a3" />).querySelector('rect')!;
    // A3 is 792 tall ⇒ the block sits at 712, not at the SLD sheet's 560
    expect(rect.getAttribute('y')).toBe('712');
    expect(rect.getAttribute('width')).toBe('1060');
  });
});

describe('the new primitives', () => {
  it('Legend draws a swatch and a label per item', () => {
    const el = g(
      <Legend x={10} y={20} items={[{ swatch: '#123456', label: 'Modules' }, { swatch: '#abcdef', label: 'Walkway' }]} />,
    );
    expect(el.querySelectorAll('rect')).toHaveLength(2);
    expect(el.textContent).toContain('Modules');
    expect(el.textContent).toContain('LEGEND');
  });

  it('Notes numbers its items — a note has to be citable', () => {
    const el = g(<Notes x={0} y={0} items={['Confirm purlin pitch at survey', 'Engineer to confirm']} />);
    expect(el.textContent).toContain('1. ');
    expect(el.textContent).toContain('2. ');
  });

  it('ScaleBar is a GRAPHIC bar, so it survives print scaling', () => {
    // a stated ratio is a claim about the paper; a bar measures correctly
    // whatever the printer does to it
    const el = g(<ScaleBar x={0} y={0} metres={5} unitsPerMetre={10} />);
    const bars = [...el.querySelectorAll('rect')];
    expect(bars).toHaveLength(2); // alternating halves
    expect(Number(bars[0].getAttribute('width')) + Number(bars[1].getAttribute('width'))).toBe(50);
    expect(el.textContent).toContain('5 m');
  });

  it('GridRefs labels columns and rows so a detail can be cited', () => {
    const el = g(<GridRefs cols={3} rows={2} />);
    expect(el.textContent).toContain('A');
    expect(el.textContent).toContain('C');
    expect(el.textContent).toContain('1');
    expect(el.textContent).toContain('2');
  });
});
