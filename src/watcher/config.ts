import { z } from 'zod';

// Watcher environment, validated at the boundary. Names mirror .env.example /
// architecture.md. Unknown env vars are ignored.
const envSchema = z.object({
  DATABASE_PATH: z.string().min(1),
  EVIDENCE_DIR: z.string().min(1),
  GITHUB_TOKEN_READONLY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  ROOM_ID: z.string().min(1),
  SWITCH_BRIDGE_URL: z.string().url(),
  SWITCH_AGENT_ID: z.string().min(1),
  SWITCH_AGENT_API_KEY: z.string().min(1),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(3030),
  HEARTBEAT_MS: z.coerce.number().int().positive().default(120000),
  ROOM_ZONE: z.string().default('Africa/Lagos'),
});

export type WatcherConfig = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined>): WatcherConfig {
  return envSchema.parse(env);
}
