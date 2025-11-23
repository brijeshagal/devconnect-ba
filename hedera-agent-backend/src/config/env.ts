import { config as loadEnv } from "dotenv";

loadEnv();

const DEFAULT_GAS_LIMIT = 2_000_000;
const DEFAULT_REEVALUATE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_VLAYER_NOTARY = "https://test-notary.vlayer.xyz/";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return value;
}

function optionalNumber(key: string, fallback: number): number {
  const raw = process.env[key];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
}

function optionalString(key: string): string | undefined {
  const value = process.env[key];
  return value ? value.trim() : undefined;
}

const dryRunFunding = parseBoolean(process.env.HEDERA_AGENT_DRY_RUN, true);
const vlayerEnabled = parseBoolean(process.env.VLAYER_ENABLED, false);
const vlayerCliPath = optionalString("VLAYER_CLI_PATH") ?? "vlayer";
const vlayerNotaryUrl =
  optionalString("VLAYER_NOTARY_URL") ?? DEFAULT_VLAYER_NOTARY;
const vlayerJwtToken = optionalString("VLAYER_JWT_TOKEN");
const vlayerProofUrl = optionalString("VLAYER_PROOF_URL");

if (vlayerEnabled && !vlayerJwtToken) {
  throw new Error(
    "VLAYER_JWT_TOKEN is required when VLAYER_ENABLED is true."
  );
}

export const env = {
  hederaNetwork: requireEnv("HEDERA_NETWORK"),
  operatorId: requireEnv("HEDERA_OPERATOR_ID"),
  operatorKey: requireEnv("HEDERA_OPERATOR_KEY"),
  agentContractId: requireEnv("AGENT_CONTRACT_ID"),
  contractGasLimit: optionalNumber(
    "HEDERA_CONTRACT_GAS_LIMIT",
    DEFAULT_GAS_LIMIT
  ),
  fundingPollIntervalMs: optionalNumber(
    "FUNDING_POLL_INTERVAL_MS",
    DEFAULT_REEVALUATE_INTERVAL_MS
  ),
  dryRunFunding,
  vlayer: {
    enabled: vlayerEnabled,
    cliPath: vlayerCliPath,
    notaryUrl: vlayerNotaryUrl,
    jwtToken: vlayerJwtToken,
    proofUrl: vlayerProofUrl
  }
} as const;

export type EnvConfig = typeof env;

