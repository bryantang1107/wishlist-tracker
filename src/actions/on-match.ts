import twilio from "twilio";
import type { CheckResult } from "../types.js";

const TWILIO_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "TWILIO_TO",
] as const;

let warnedMissingTwilioConfig = false;

function getTwilioConfigFromEnv():
  | { accountSid: string; authToken: string; from: string; to: string }
  | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.TWILIO_TO;
  if (accountSid && authToken && from && to) {
    return { accountSid, authToken, from, to };
  }
  return null;
}

function formatMatchBody(result: CheckResult): string {
  const bits: string[] = ["Item tracker match", result.reason];
  if (result.details !== undefined) {
    const j = JSON.stringify(result.details);
    bits.push(j.length > 500 ? `${j.slice(0, 497)}...` : j);
  }
  return bits.join(" — ");
}

/**
 * Called when a check result is a positive match (e.g. sale or restock detected).
 * Sends an SMS via Twilio when `TWILIO_*` env vars are set; otherwise logs once to stderr.
 */
export async function onMatch(result: CheckResult): Promise<void> {
  const config = getTwilioConfigFromEnv();
  if (config === null) {
    if (!warnedMissingTwilioConfig) {
      warnedMissingTwilioConfig = true;
      console.error(
        `[item-tracker] Twilio SMS skipped: set ${TWILIO_ENV.join(", ")} to receive SMS on match.`,
      );
    }
    return;
  }

  const client = twilio(config.accountSid, config.authToken);
  const body = formatMatchBody(result);

  await client.messages.create({
    body,
    from: config.from,
    to: config.to,
  });
}
