// Watcher service composition root: webhook ingest + evaluator + heartbeat,
// posting into the room via Path A. Run with `npm run dev:watcher`.
import { serve } from '@hono/node-server';
import { logger } from '../logger.js';
import { GithubClient, octokitFetchPullRequest } from '../sources/index.js';
import { SwitchAgentPoster } from '../room/index.js';
import { openStore } from '../store/index.js';
import { loadConfig } from './config.js';
import { Evaluator, startHeartbeat } from './evaluator.js';
import { createWebhookApp } from './githubWebhook.js';

function main(): void {
  const config = loadConfig(process.env);
  const store = openStore(config.DATABASE_PATH);
  const github = new GithubClient(octokitFetchPullRequest(config.GITHUB_TOKEN_READONLY ?? ''));
  const poster = new SwitchAgentPoster({
    bridgeUrl: config.SWITCH_BRIDGE_URL,
    agentId: config.SWITCH_AGENT_ID,
    apiKey: config.SWITCH_AGENT_API_KEY,
  });
  const evaluator = new Evaluator({ store, github, poster, zone: config.ROOM_ZONE });

  const app = createWebhookApp({
    secret: config.GITHUB_WEBHOOK_SECRET,
    store,
    evidenceDir: config.EVIDENCE_DIR,
    onIndexed: (target) => {
      void evaluator.onEvent(target).catch((error: unknown) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'evaluate-on-event failed',
        );
      });
    },
  });

  serve({ fetch: app.fetch, port: config.WEBHOOK_PORT });
  startHeartbeat(evaluator, config.HEARTBEAT_MS);
  logger.info({ port: config.WEBHOOK_PORT, heartbeatMs: config.HEARTBEAT_MS }, 'tripwire watcher started');
}

main();
