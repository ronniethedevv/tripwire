import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { describeCondition } from '../conditions/index.js';
import { CONDITION_TYPES, LOOP_KINDS, LOOP_STATUSES, WAITER_TYPES } from '../core/index.js';
import { renderArmed, renderLedger, renderProposal } from '../room/index.js';
import type { LoopService } from './service.js';

function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function fail(error: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  };
}

const conditionShape = z.object({ type: z.enum(CONDITION_TYPES), params: z.record(z.unknown()) });

// The fields a propose takes, reused by propose_loop and each item of propose_loops.
const proposeFields = {
  room_id: z.string(),
  kind: z.enum(LOOP_KINDS),
  title: z.string(),
  reason: z.string(),
  waiter_type: z.enum(WAITER_TYPES),
  waiter_handle: z.string(),
  owner_handle: z.string(),
  created_by: z.string(),
  condition: conditionShape,
  source_ref: z.string().optional(),
  expires_at: z.number().optional(),
} as const;

type ProposeArgs = z.infer<z.ZodObject<typeof proposeFields>>;

export interface McpServerOptions {
  readonly zone?: string;
  readonly version?: string;
}

/** Build the Tripwire MCP server exposing the loop tools over the given service. */
export function createMcpServer(service: LoopService, options: McpServerOptions = {}): McpServer {
  const zone = options.zone ?? 'Africa/Lagos';
  const server = new McpServer({ name: 'tripwire', version: options.version ?? '0.0.0' });

  const proposeOne = (args: ProposeArgs) =>
    service.propose({
      roomId: args.room_id,
      kind: args.kind,
      title: args.title,
      reason: args.reason,
      waiterType: args.waiter_type,
      waiterHandle: args.waiter_handle,
      ownerHandle: args.owner_handle,
      createdBy: args.created_by,
      condition: { type: args.condition.type, params: args.condition.params },
      sourceRef: args.source_ref ?? null,
      expiresAt: args.expires_at ?? null,
    });

  server.tool(
    'propose_loop',
    'Draft an open loop and ask a human to confirm it (returns the proposal card and the loop id).',
    proposeFields,
    (args) => {
      try {
        const loop = proposeOne(args);
        const body = loop.status === 'armed' ? renderArmed(loop) : renderProposal(loop);
        return ok(`${body}\n\n(loop_id: ${loop.id})`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'propose_loops',
    'Draft several loops at once (for transcript extraction); each still needs a human to confirm.',
    { items: z.array(z.object(proposeFields)) },
    (args) => {
      try {
        const lines = args.items.map((item) => {
          const loop = proposeOne(item);
          return `- ${loop.title} (loop_id: ${loop.id})`;
        });
        return ok(`Proposed ${lines.length} loop(s):\n${lines.join('\n')}`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'arm_loop',
    'Arm a loop after a human confirms it. Only a human may arm a decision loop.',
    { loop_id: z.string(), confirmed_by: z.string(), confirm_message_ref: z.string().optional() },
    (args) => {
      try {
        const loop = service.arm(args.loop_id, args.confirmed_by, args.confirm_message_ref ?? null);
        return ok(renderArmed(loop));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'list_loops',
    'List loops, optionally filtered by status and room (the ledger).',
    { status: z.enum(LOOP_STATUSES).optional(), room_id: z.string().optional() },
    (args) => {
      try {
        const filter: { status?: (typeof LOOP_STATUSES)[number]; roomId?: string } = {};
        if (args.status !== undefined) filter.status = args.status;
        if (args.room_id !== undefined) filter.roomId = args.room_id;
        return ok(renderLedger(service.list(filter), zone));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'explain_loop',
    'Show a loop in full, including whether and when it fired.',
    { loop_id: z.string() },
    (args) => {
      try {
        const { loop, firing } = service.explain(args.loop_id);
        const lines = [
          `Loop ${loop.id}: ${loop.title}`,
          `Status: ${loop.status} · kind: ${loop.kind}`,
          `Waiting for: ${describeCondition(loop.condition)}`,
          `Owner: ${loop.ownerHandle} · waiter: ${loop.waiterHandle}`,
          `Why: ${loop.reason}`,
        ];
        if (firing !== null) {
          lines.push(`Fired at ${new Date(firing.firedAt).toISOString()} (message ${firing.roomMessageRef ?? 'n/a'})`);
        }
        return ok(lines.join('\n'));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'cancel_loop',
    'Cancel a loop. Only a human may cancel a decision loop.',
    { loop_id: z.string(), by: z.string(), reason: z.string() },
    (args) => {
      try {
        service.cancel(args.loop_id, args.by, args.reason);
        return ok(`✅ Cancelled loop ${args.loop_id}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    'resolve_loop',
    'Resolve a fired loop once the decision is made.',
    { loop_id: z.string(), by: z.string(), outcome: z.string() },
    (args) => {
      try {
        service.resolve(args.loop_id, args.by, args.outcome);
        return ok(`✅ Resolved loop ${args.loop_id}: ${args.outcome}`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
