// ─── The negotiated deduction control ───────────────────────────────────────
// Its own component for one reason: the KIND has to survive a moment when
// there is no stored rule to read it from.
//
// At value 0 the discount is DELETED from the project (lazy-field contract, so
// a project that never discounted serializes byte-identically). That left the
// kind with nowhere to live: picking "₹" on an empty field wrote nothing, the
// select fell back to "%", and the next number typed was applied as a
// PERCENTAGE. Entering 50000 meaning ₹50,000 discounted the job by 50000% —
// clamped to the whole quote, so the total silently went to zero.
//
// Holding the kind here, in draft state that outlives the stored rule, is what
// fixes it — and having it in one small component is what makes it testable
// without standing up the whole Step-9 screen.
import { useState } from 'react';
import { NumberField } from '../../components/ui';
import type { QuoteDiscount } from '../../types';

export function DiscountField({
  discount,
  onChange,
}: {
  discount: QuoteDiscount | undefined;
  /** `undefined` ⇒ remove the rule entirely */
  onChange: (next: QuoteDiscount | undefined) => void;
}) {
  const [kind, setKind] = useState<QuoteDiscount['kind']>(discount?.kind ?? 'percent');

  const commit = (value: number, k: QuoteDiscount['kind']) =>
    onChange(value > 0 ? { kind: k, value } : undefined);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <NumberField
        value={discount?.value ?? 0}
        min={0}
        ariaLabel="Discount value"
        onCommit={(v) => commit(v ?? 0, kind)}
        style={{ width: 56, fontWeight: 800, fontSize: 14 }}
      />
      <select
        value={kind}
        onChange={(e) => {
          const k = e.target.value as QuoteDiscount['kind'];
          setKind(k);
          // re-commit any EXISTING value under the new kind — switching from
          // 5% to ₹5 is a different deduction, and leaving the old rule in
          // place would show "₹" beside a figure still being read as a percent
          commit(discount?.value ?? 0, k);
        }}
        aria-label="Discount is a percentage or a rupee amount"
        style={{ fontSize: 12, padding: '1px 2px' }}
      >
        <option value="percent">%</option>
        <option value="amount">₹</option>
      </select>
    </span>
  );
}
