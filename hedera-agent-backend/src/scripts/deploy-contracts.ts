import { config as loadEnv } from "dotenv";
import {
  AccountId,
  Client,
  ContractCreateFlow,
  ContractFunctionParameters,
  ContractId,
  PrivateKey
} from "@hashgraph/sdk";
import { promises as fs } from "fs";
import path from "path";

loadEnv();

const DEFAULT_GAS = 2_000_000;

interface FoundryArtifact {
  bytecode: { object: string };
  contractName: string;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

function resolveArtifactsDir(): string {
  const customDir = process.env.CONTRACT_ARTIFACTS_DIR;
  if (customDir) {
    return customDir;
  }
  return path.resolve(__dirname, "../../../../my-web-proof/out");
}

async function loadBytecode(artifactPath: string): Promise<Uint8Array> {
  const artifactRaw = await fs.readFile(artifactPath, "utf8");
  const artifact = JSON.parse(artifactRaw) as FoundryArtifact;
  const hex = artifact.bytecode?.object?.replace(/^0x/, "");

  if (!hex) {
    throw new Error(`Artifact at ${artifactPath} is missing bytecode.object`);
  }

  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function createClient(): Client {
  const operatorId =
    process.env.HEDERA_OPERATOR_ID ??
    process.env.HEDERA_ACCOUNT_ID ??
    requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey =
    process.env.HEDERA_OPERATOR_KEY ??
    process.env.HEDERA_PRIVATE_KEY ??
    requireEnv("HEDERA_OPERATOR_KEY");
  const network = (process.env.HEDERA_NETWORK ?? "testnet")
    .trim()
    .toLowerCase();

  let client: Client;

  switch (network) {
    case "mainnet":
      client = Client.forMainnet();
      break;
    case "testnet":
      client = Client.forTestnet();
      break;
    case "previewnet":
      client = Client.forPreviewnet();
      break;
    default:
      try {
        const parsed = JSON.parse(process.env.HEDERA_NETWORK ?? "");
        client = Client.forNetwork(parsed);
      } catch (error) {
        throw new Error(`Unsupported HEDERA_NETWORK value: ${network}`);
      }
  }

  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey)
  );

  return client;
}

function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x")) {
    return trimmed;
  }
  const accountId = AccountId.fromString(trimmed);
  return `0x${accountId.toSolidityAddress()}`;
}

function resolvePaymentTargetAddress(): string {
  const raw =
    process.env.AGENT_PAYMENT_TARGET ??
    process.env.HEDERA_PAYMENT_TARGET ??
    process.env.HEDERA_ACCOUNT_ID ??
    process.env.HEDERA_OPERATOR_ID;

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "Missing AGENT_PAYMENT_TARGET. Provide a Hedera account ID or EVM address for the payout recipient."
    );
  }

  return normalizeAddress(raw);
}

async function deployStubVerifier(
  client: Client,
  artifactsDir: string,
  gasLimit: number
): Promise<{ contractId: ContractId; evmAddress: string }> {
  const stubArtifactPath = path.join(
    artifactsDir,
    "StubAgentDecisionVerifier.sol",
    "StubAgentDecisionVerifier.json"
  );

  console.log(
    "\nNo AGENT_VERIFIER_ADDRESS provided – deploying StubAgentDecisionVerifier (development only)."
  );
  const stubBytecode = await loadBytecode(stubArtifactPath);
  const createTx = await new ContractCreateFlow()
    .setGas(gasLimit)
    .setBytecode(stubBytecode)
    .execute(client);

  const receipt = await createTx.getReceipt(client);
  const contractId = receipt.contractId;

  if (!contractId) {
    throw new Error("StubAgentDecisionVerifier deployment failed");
  }

  const evmAddress = `0x${contractId.toSolidityAddress()}`;
  console.log(
    ` ✅ StubAgentDecisionVerifier deployed: ${contractId.toString()} (${evmAddress})`
  );

  return { contractId, evmAddress };
}

async function resolveVerifierAddress(
  client: Client,
  artifactsDir: string,
  gasLimit: number
): Promise<{ evmAddress: string; contractId?: ContractId }> {
  const raw = process.env.AGENT_VERIFIER_ADDRESS;

  if (raw && raw.trim().length > 0) {
    const evmAddress = normalizeAddress(raw);

    let contractId: ContractId | undefined;
    try {
      contractId = ContractId.fromString(raw);
    } catch {
      // Ignore parse errors; user likely supplied an EVM address.
    }

    console.log(
      `Using verifier address from environment: ${evmAddress}${
        contractId ? ` (${contractId.toString()})` : ""
      }`
    );

    return { evmAddress, contractId };
  }

  return deployStubVerifier(client, artifactsDir, gasLimit);
}

async function deployContracts(): Promise<void> {
  const artifactsDir = resolveArtifactsDir();
  const registryArtifactPath = path.join(
    artifactsDir,
    "AgentFunding.sol",
    "AgentFundingRegistry.json"
  );
  const treasuryArtifactPath = path.join(
    artifactsDir,
    "AgentPaymentTreasury.sol",
    "AgentPaymentTreasury.json"
  );

  const gasLimit = Number(process.env.DEPLOY_GAS_LIMIT ?? DEFAULT_GAS);
  const client = createClient();
  const verifierInfo = await resolveVerifierAddress(
    client,
    artifactsDir,
    gasLimit
  );

  const paymentTargetAddress = resolvePaymentTargetAddress();

  console.log("Deploying contracts with the following configuration:");
  console.log(` - Hedera network: ${process.env.HEDERA_NETWORK ?? "testnet"}`);
  console.log(` - Verifier (EVM address): ${verifierInfo.evmAddress}`);
  console.log(` - Payment target (EVM address): ${paymentTargetAddress}`);
  console.log(` - Gas limit: ${gasLimit}`);

  const registryBytecode = await loadBytecode(registryArtifactPath);
  const treasuryBytecode = await loadBytecode(treasuryArtifactPath);

  const registryParams = new ContractFunctionParameters().addAddress(
    verifierInfo.evmAddress
  );

  console.log("\n➡️  Deploying AgentFundingRegistry...");
  const registryCreateTx = await new ContractCreateFlow()
    .setGas(gasLimit)
    .setBytecode(registryBytecode)
    .setConstructorParameters(registryParams)
    .execute(client);

  const registryReceipt = await registryCreateTx.getReceipt(client);
  const registryId = registryReceipt.contractId;

  if (!registryId) {
    throw new Error("AgentFundingRegistry deployment did not return a contractId");
  }

  const registrySolidityAddress = registryId.toSolidityAddress();
  console.log(
    ` ✅ AgentFundingRegistry deployed: ${registryId.toString()} (0x${registrySolidityAddress})`
  );
  if (!verifierInfo.contractId) {
    console.log(
      "Reminder: replace the stub verifier with a production verifier contract when ready."
    );
  }

  const treasuryParams = new ContractFunctionParameters()
    .addAddress(`0x${registrySolidityAddress}`)
    .addAddress(paymentTargetAddress);

  console.log("\n➡️  Deploying AgentPaymentTreasury...");
  const treasuryCreateTx = await new ContractCreateFlow()
    .setGas(gasLimit)
    .setBytecode(treasuryBytecode)
    .setConstructorParameters(treasuryParams)
    .execute(client);

  const treasuryReceipt = await treasuryCreateTx.getReceipt(client);
  const treasuryId = treasuryReceipt.contractId;

  if (!treasuryId) {
    throw new Error("AgentPaymentTreasury deployment did not return a contractId");
  }

  const treasurySolidityAddress = treasuryId.toSolidityAddress();
  console.log(
    ` ✅ AgentPaymentTreasury deployed: ${treasuryId.toString()} (0x${treasurySolidityAddress})`
  );

  console.log("\nDeployment complete.");
}

deployContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });

