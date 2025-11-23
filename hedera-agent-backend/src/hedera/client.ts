import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

import { env } from "../config/env";

let cachedClient: Client | null = null;

function createClient(): Client {
  const network = env.hederaNetwork.trim().toLowerCase();
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
        const parsedNetwork = JSON.parse(env.hederaNetwork);
        client = Client.forNetwork(parsedNetwork);
      } catch (error) {
        throw new Error(
          `Unsupported Hedera network value ${env.hederaNetwork}.`
        );
      }
  }

  client.setOperator(
    AccountId.fromString(env.operatorId),
    PrivateKey.fromString(env.operatorKey)
  );

  return client;
}

export function getHederaClient(): Client {
  if (!cachedClient) {
    cachedClient = createClient();
  }

  return cachedClient;
}

