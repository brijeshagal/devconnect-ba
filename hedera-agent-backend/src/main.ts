import { env } from "./config/env";
import { AgentContractService } from "./hedera/contract-service";
import { FundingOrchestrator } from "./services/funding-orchestrator";
import { VlayerProofService } from "./services/vlayer-proof-service";
import { AgentFundingContext } from "./types/agent";

async function bootstrap(): Promise<void> {
  const contractService = new AgentContractService();
  const proofService = new VlayerProofService();

  const orchestrator = new FundingOrchestrator(contractService, {
    proofService,
    proofRequestBuilder: (context, decision) => {
      if (!env.vlayer.proofUrl) {
        return null;
      }

      return {
        url: env.vlayer.proofUrl,
        headers: {
          "Content-Type": "application/json"
        },
        body: {
          agentId: context.profile.agentId,
          planId: context.profile.planId,
          contractAccountId: context.profile.contractAccountId,
          decision: {
            topUpAmountHbar: decision.topUpAmountHbar,
            reason: decision.reason,
            reevaluateInMs: decision.reevaluateInMs
          },
          snapshot: {
            ...context.snapshot,
            lastFundingAt: context.snapshot.lastFundingAt
              ? context.snapshot.lastFundingAt.toISOString()
              : null
          }
        },
        metadata: {
          agentId: context.profile.agentId,
          planId: context.profile.planId
        }
      };
    }
  });

  const sampleContext: AgentFundingContext = {
    profile: {
      agentId: "agent-sample",
      contractAccountId: "0.0.123456",
      planId: "starter"
    },
    snapshot: {
      currentBalanceHbar: 2,
      minBufferHbar: 5,
      maxBufferHbar: 20,
      planCostHbar: 3,
      demandScore: 0.8,
      lastFundingAt: null,
      projectedHoursUntilDepletion: 1.5
    }
  };

  const outcome = await orchestrator.handleAgentFunding(sampleContext);
  console.log("[funding-outcome]", outcome);
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap funding orchestrator", error);
  process.exitCode = 1;
});

