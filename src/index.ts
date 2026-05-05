import { ConfigError, runAllTrackersFromConfig } from './tracker.js';

const DEFAULT_HEADED = true;

async function main(): Promise<void> {
  try {
    await runAllTrackersFromConfig({
      headed: DEFAULT_HEADED,
      continueOnError: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    if (err instanceof ConfigError) {
      process.exit(1);
    }
    process.exit(2);
  }
  process.exit(0);
}

void main();
