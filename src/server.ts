import path from 'node:path';
import cron from 'node-cron';
import express from 'express';
import { getAdapterForUrlString, getSupportedSites } from './sites/registry.js';
import { ConfigError, runAllTrackersFromConfig } from './tracker.js';
import {
  isTrackMode,
  parseHttpProductUrl,
  getUrlsConfigPath,
  readUrlsFileEntries,
  writeUrlsFileEntries,
} from './url-utils.js';

const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function applyCors(res: express.Response): void {
  for (const [k, v] of Object.entries(CORS)) {
    res.setHeader(k, v);
  }
}

const portEnv = process.env.PORT;
const PORT = portEnv === undefined ? 3000 : Number.parseInt(portEnv, 10);
if (Number.isNaN(PORT)) {
  throw new Error(`PORT must be a number, got: ${portEnv ?? ''}`);
}

type PostBody = { url?: unknown; mode?: unknown };

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'item-tracker', path: getUrlsConfigPath() });
});

app.get('/api/sites', (_req, res) => {
  res.json({ sites: [...getSupportedSites()] });
});

app.options('/tracks', (_req, res) => {
  applyCors(res);
  res.sendStatus(204);
});

app.post(
  '/tracks',
  (req, res, next) => {
    const type = req.headers['content-type']?.split(';')[0]?.trim();
    if (type !== 'application/json') {
      applyCors(res);
      return res.status(415).json({
        error: 'content_type',
        message: 'Content-Type must be application/json',
      });
    }
    next();
  },
  express.json(),
  async (req, res) => {
    try {
      const data = req.body as PostBody;
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        applyCors(res);
        return res
          .status(400)
          .json({ error: 'body', message: 'Body must be a JSON object' });
      }
      if (typeof data.url !== 'string' || data.url.trim() === '') {
        applyCors(res);
        return res
          .status(400)
          .json({ error: 'url', message: 'url must be a non-empty string' });
      }
      if (!isTrackMode(data.mode)) {
        applyCors(res);
        return res.status(400).json({
          error: 'mode',
          message: 'mode must be "sale" or "restock"',
        });
      }

      const urlParsed = parseHttpProductUrl(data.url);
      if (!urlParsed.ok) {
        applyCors(res);
        return res
          .status(400)
          .json({ error: 'url', message: urlParsed.message });
      }

      if (getAdapterForUrlString(urlParsed.href) === undefined) {
        applyCors(res);
        return res.status(400).json({
          error: 'unsupported_url',
          message: 'No site adapter registered for this URL',
        });
      }

      let existing: Awaited<ReturnType<typeof readUrlsFileEntries>>;
      try {
        existing = await readUrlsFileEntries();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        applyCors(res);
        return res.status(500).json({ error: 'read_config', message });
      }

      const entry = { url: urlParsed.href, mode: data.mode } as const;
      for (const row of existing) {
        const rowParsed = parseHttpProductUrl(row.url);
        if (
          rowParsed.ok &&
          rowParsed.href === entry.url &&
          row.mode === entry.mode
        ) {
          applyCors(res);
          return res.status(409).json({
            error: 'duplicate',
            message: 'This URL and mode is already tracked',
          });
        }
      }

      try {
        await writeUrlsFileEntries([...existing, entry]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        applyCors(res);
        return res.status(500).json({ error: 'write_config', message });
      }

      applyCors(res);
      return res.status(201).json({ ok: true, entry });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      applyCors(res);
      return res.status(500).json({ error: 'internal', message });
    }
  },
);

app.use(
  express.static(path.join(process.cwd(), 'public'), {
    index: 'index.html',
  }),
);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// express.json() on POST /tracks forwards malformed JSON (body-parser) here.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      return;
    }
    if (err instanceof SyntaxError) {
      applyCors(res);
      return res
        .status(400)
        .json({ error: 'json_parse', message: 'Invalid JSON body' });
    }
    const message = err instanceof Error ? err.message : String(err);
    applyCors(res);
    return res.status(500).json({ error: 'internal', message });
  },
);

const CRON_SCHEDULE = process.env.TRACKER_CRON_SCHEDULE ?? '* * * * *';

async function runScheduledTrackerPass(): Promise<void> {
  const started = new Date().toISOString();
  console.log(`[cron] tracker run started at ${started}`);
  try {
    await runAllTrackersFromConfig({
      headed: true,
      continueOnError: true,
    });
    console.log(`[cron] tracker run finished at ${new Date().toISOString()}`);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('[cron] config error:', err.message);
      return;
    }
    console.error('[cron] run failed:', err);
  }
}

app.listen(PORT, () => {
  console.log(
    `item-tracker → http://127.0.0.1:${PORT} (UI + POST /tracks)  config: ${getUrlsConfigPath()}`,
  );
  if (cron.validate(CRON_SCHEDULE)) {
    cron.schedule(CRON_SCHEDULE, () => {
      void runScheduledTrackerPass();
    });
    console.log(`[cron] scheduled "${CRON_SCHEDULE}" — daily pass`);
  } else {
    console.error(
      `[cron] invalid TRACKER_CRON_SCHEDULE="${CRON_SCHEDULE}"; fix or unset to use default 0 0 * * *`,
    );
  }
});
