// ─── Pre-proposal review (§8.4/§8.5, Phase 15) ──────────────────────────────
// "Is this ready to send?" — answered ONCE, from the four independent signals
// that today live on four different screens:
//
//   electricalGate     Step 6   can this design legally exist?
//   insights           Step 6   what would an experienced engineer flag?
//   bomConfidence      Step 9   which numbers are assumed rather than measured?
//   capture staleness  Step 7   do the pictures still show this design?
//
// This DERIVES from those functions rather than re-implementing them, so the
// checklist can never disagree with the screen it points at (§A0). It is a
// read-only summary: nothing here gates anything the wizard does not already
// gate — a second, subtly different gate is how two answers to one question
// get shipped.
import type { Project } from '../types';
import { electricalGate } from './electrical/gate';
import { memoizedInsights } from './insights/registry';
import { bomConfidence, mergedBom } from './bom';
import { isCaptureFresh } from './fingerprints';

export type ReviewStatus = 'blocked' | 'attention' | 'ready';

export interface ReviewItem {
  key: string;
  /** the screen that can FIX this — a finding with nowhere to go is noise */
  step: number;
  title: string;
  status: ReviewStatus;
  detail: string;
}

export interface ReviewResult {
  items: ReviewItem[];
  /** worst status present — drives the header */
  overall: ReviewStatus;
  /** true when nothing blocks issuing the proposal */
  issuable: boolean;
}

const CAPTURE_TARGET = 4;

export function preProposalReview(project: Project): ReviewResult {
  const items: ReviewItem[] = [];

  // 1. Electrical — the one hard gate. Same function the wizard's Next uses.
  const gate = electricalGate(project);
  items.push(
    gate
      ? {
          key: 'electrical',
          step: 6,
          title: 'Electrical design',
          status: 'blocked',
          detail: gate.message,
        }
      : {
          key: 'electrical',
          step: 6,
          title: 'Electrical design',
          status: 'ready',
          detail: 'Every enabled module is wired into a string within the inverter’s limits.',
        },
  );

  // 2. Engineering review — insights the user has not accepted or ignored.
  const insights = memoizedInsights(project);
  const open = insights.filter((i) => project.insightState?.[i.key] !== 'accepted');
  items.push(
    open.length === 0
      ? {
          key: 'insights',
          step: 6,
          title: 'Design review',
          status: 'ready',
          detail: 'No open suggestions from the design, maintenance or constructability checks.',
        }
      : {
          key: 'insights',
          step: 6,
          title: 'Design review',
          status: open.some((i) => i.severity === 'warning' || i.severity === 'critical')
            ? 'attention'
            : 'ready',
          // A green tick beside "5 open suggestions" reads as a contradiction.
          // Suggestions genuinely do NOT hold up an issue, so say that plainly
          // instead of letting the icon and the sentence disagree.
          detail: `${
            open.some((i) => i.severity === 'warning' || i.severity === 'critical')
              ? `${open.length} item${open.length > 1 ? 's' : ''} to review`
              : `${open.length} optional suggestion${open.length > 1 ? 's' : ''}, none blocking`
          }: ${open
            .slice(0, 3)
            .map((i) => i.title)
            .join('; ')}${open.length > 3 ? '…' : ''}`,
        },
  );

  // 3. Quantity confidence — what the customer will be quoted on assumptions.
  const conf = bomConfidence(mergedBom(project));
  items.push(
    conf.preliminary
      ? {
          key: 'bom-confidence',
          step: 9,
          title: 'Quantity confidence',
          status: 'attention',
          detail: `Preliminary — ${conf.needsVerification.length} line${
            conf.needsVerification.length > 1 ? 's' : ''
          } need site verification: ${conf.needsVerification.slice(0, 3).join('; ')}${
            conf.needsVerification.length > 3 ? '…' : ''
          }`,
        }
      : {
          key: 'bom-confidence',
          step: 9,
          title: 'Quantity confidence',
          status: 'ready',
          detail: 'Every quantity is measured or derived from the design.',
        },
  );

  // 4. Imagery — a proposal printing pictures of a design that no longer
  // exists is the plan's §9 "stale capture" failure, so it is called out even
  // though it blocks nothing.
  // freshness is defined ONCE, in fingerprints — a second definition here
  // would eventually disagree with the stale badge on the capture itself
  const withImage = project.captures.filter((c) => c.imageBlobId);
  const stale = withImage.filter((c) => !isCaptureFresh(project, c));
  items.push(
    withImage.length < CAPTURE_TARGET
      ? {
          key: 'captures',
          step: 7,
          title: 'Shadow study imagery',
          status: 'attention',
          detail: `${withImage.length} of ${CAPTURE_TARGET} captures taken.`,
        }
      : stale.length > 0
        ? {
            key: 'captures',
            step: 7,
            title: 'Shadow study imagery',
            status: 'attention',
            detail: `${stale.length} capture${stale.length > 1 ? 's show' : ' shows'} an older version of the layout — retake before issuing.`,
          }
        : {
            key: 'captures',
            step: 7,
            title: 'Shadow study imagery',
            status: 'ready',
            detail: 'All captures match the current layout.',
          },
  );

  const overall: ReviewStatus = items.some((i) => i.status === 'blocked')
    ? 'blocked'
    : items.some((i) => i.status === 'attention')
      ? 'attention'
      : 'ready';

  return { items, overall, issuable: overall !== 'blocked' };
}
