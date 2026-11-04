import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/watcher/config.js';

const base = {
  DATABASE_PATH: '/tmp/db.sqlite',
  EVIDENCE_DIR: '/tmp/evidence',
  GITHUB_WEBHOOK_SECRET: 'secret',
  ROOM_ID: 'room-1',
  SWITCH_BRIDGE_URL: 'http://bridge:8000',
  SWITCH_AGENT_ID: 'agent-1',
  SWITCH_AGENT_API_KEY: 'key',
};

describe('loadConfig', () => {
  it('parses a complete env and applies defaults', () => {
    const config = loadConfig(base);
    expect(config.WEBHOOK_PORT).toBe(3030);
    expect(config.HEARTBEAT_MS).toBe(120000);
    expect(config.ROOM_ZONE).toBe('Africa/Lagos');
    expect(config.SWITCH_BRIDGE_URL).toBe('http://bridge:8000');
  });

  it('coerces numeric overrides from strings', () => {
    const config = loadConfig({ ...base, WEBHOOK_PORT: '4000', HEARTBEAT_MS: '60000' });
    expect(config.WEBHOOK_PORT).toBe(4000);
    expect(config.HEARTBEAT_MS).toBe(60000);
  });

  it('throws when a required var is missing', () => {
    const { GITHUB_WEBHOOK_SECRET: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow();
  });
});
