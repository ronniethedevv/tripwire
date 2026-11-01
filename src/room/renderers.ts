import { describeCondition, type Evidence } from '../conditions/index.js';
import type { Loop } from '../core/index.js';

/** A timestamp in UTC plus the room's local zone, e.g. "2026-11-01 03:40 UTC / 04:40 Africa/Lagos". */
export function formatInstant(epochMs: number, zone: string): string {
  const d = new Date(epochMs);
  const utc = `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return `${utc} / ${local} ${zone}`;
}

/** The reopen card for a fired decision loop (ui_context.md). */
export function renderReopenCard(loop: Loop, evidence: Evidence, zone: string): string {
  const lines = [
    `🔔 Ready to decide: ${loop.title}`,
    `What changed: ${evidence.description} — ${evidence.url} (${formatInstant(evidence.observedAt, zone)})`,
    `Why we waited: ${loop.reason}`,
    `Decide: ${loop.ownerHandle}`,
  ];
  if (loop.sourceRef !== null) {
    lines.push(`Original discussion: ${loop.sourceRef}`);
  }
  return lines.join('\n');
}

/** The wake note for a fired agent_block loop (ui_context.md). */
export function renderAgentWakeNote(loop: Loop, evidence: Evidence): string {
  return `${loop.waiterHandle} you're unblocked: ${evidence.description} — ${evidence.url}. Resume: ${loop.title}.`;
}

/** The proposal card that asks a human to confirm a drafted loop (ui_context.md). */
export function renderProposal(loop: Loop): string {
  return [
    `Proposed hold: ${loop.title}`,
    `Waiting for: ${describeCondition(loop.condition)}`,
    `Why we're waiting: ${loop.reason}`,
    `Owner: ${loop.ownerHandle}`,
    'Reply "yes" to arm, or tell me what to change.',
  ].join('\n');
}

/** The confirmation that a loop is now armed (ui_context.md). */
export function renderArmed(loop: Loop): string {
  return `⏳ Holding: ${loop.title} — until ${describeCondition(loop.condition)}. I'll bring it back the moment that's true.`;
}

/** A date in the room's zone, e.g. "1 Nov 2026". */
function formatDate(epochMs: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'medium' }).format(new Date(epochMs));
}

/** The "@tripwire open" ledger of still-waiting loops (ui_context.md). */
export function renderLedger(loops: readonly Loop[], zone: string): string {
  const header = `Open loops in this room (${loops.length}):`;
  const lines = loops.map(
    (loop, i) =>
      `${i + 1}. ⏳ ${loop.title} — until ${describeCondition(loop.condition)} — owner ${loop.ownerHandle} — since ${formatDate(loop.createdAt, zone)}`,
  );
  return [header, ...lines].join('\n');
}
