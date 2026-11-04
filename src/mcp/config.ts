import { z } from 'zod';

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1),
  HUMAN_HANDLES: z.string().default(''),
  ROOM_ZONE: z.string().default('Africa/Lagos'),
});

export interface McpConfig {
  readonly databasePath: string;
  readonly humanHandles: ReadonlySet<string>;
  readonly zone: string;
}

export function loadMcpConfig(env: Record<string, string | undefined>): McpConfig {
  const parsed = envSchema.parse(env);
  const humanHandles = new Set(
    parsed.HUMAN_HANDLES.split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0),
  );
  return { databasePath: parsed.DATABASE_PATH, humanHandles, zone: parsed.ROOM_ZONE };
}
