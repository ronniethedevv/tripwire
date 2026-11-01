import type { Evidence } from '../conditions/index.js';
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
