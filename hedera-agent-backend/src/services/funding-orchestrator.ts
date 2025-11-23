import { ContractFunctionParameters, Hbar } from "@hashgraph/sdk";

import { AgentContractService } from "../hedera/contract-service";
import { evaluateFunding } from "./funding-evaluator";
import {
  AgentFundingContext,
  FundingDecision,
  FundingProofArtifact
} from "../types/agent";
import {
  FundingProofProvider,
  FundingProofRequest
} from "./vlayer-proof-service";

export interface FundingOutcome extends FundingDecision {
  executed: boolean;
  transactionId?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  proofArtifact?: FundingProofArtifact;
}

export interface FundingOrchestratorOptions {
  contractFunctionName?: string;
  parameterBuilder?: (
    context: AgentFundingContext,
    decision: FundingDecision
  ) => ContractFunctionParameters;
  memoBuilder?: (
    context: AgentFundingContext,
    decision: FundingDecision
  ) => string | undefined;
  proofService?: FundingProofProvider;
  proofRequestBuilder?: (
    context: AgentFundingContext,
    decision: FundingDecision
  ) => FundingProofRequest | null | undefined;
  requireProofSuccess?: boolean;
}

const HBAR_TO_TINYBAR = 100_000_000;

function hbarToTinybars(amount: number): number {
  return Math.round(amount * HBAR_TO_TINYBAR);
}

export class FundingOrchestrator {
  private readonly contractFunctionName: string;
  private readonly proofService?: FundingProofProvider;
  private readonly proofRequestBuilder?: FundingOrchestratorOptions["proofRequestBuilder"];
  private readonly requireProofSuccess: boolean;

  constructor(
    private readonly contractService: AgentContractService,
    private readonly options: FundingOrchestratorOptions = {}
  ) {
    this.contractFunctionName = options.contractFunctionName ?? "payForPlan";
    this.proofService = options.proofService;
    this.proofRequestBuilder = options.proofRequestBuilder;
    this.requireProofSuccess = options.requireProofSuccess ?? true;
  }

  async handleAgentFunding(
    context: AgentFundingContext
  ): Promise<FundingOutcome> {
    const decision = evaluateFunding(context);
    let proofArtifact: FundingProofArtifact | undefined;

    if (!decision.shouldFund || decision.topUpAmountHbar <= 0) {
      return {
        ...decision,
        executed: false,
        metadata: {
          agentId: context.profile.agentId,
          contractAccountId: context.profile.contractAccountId,
          proofStatus: proofArtifact?.status ?? "skipped"
        },
        proofArtifact
      };
    }

    if (this.proofService && this.proofRequestBuilder) {
      const proofRequest = this.proofRequestBuilder(context, decision);

      if (proofRequest) {
        proofArtifact =
          await this.proofService.generateFundingProof(proofRequest);

        if (this.requireProofSuccess && proofArtifact.status !== "success") {
          return {
            ...decision,
            executed: false,
            reason: `${decision.reason} Proof status: ${proofArtifact.status}${
              proofArtifact.reason ? ` (${proofArtifact.reason})` : ""
            }.`,
            metadata: {
              agentId: context.profile.agentId,
              planId: context.profile.planId,
              contractAccountId: context.profile.contractAccountId,
              proofStatus: proofArtifact.status
            },
            proofArtifact
          };
        }
      }
    }

    const parameters =
      this.options.parameterBuilder?.(context, decision) ??
      this.defaultParameterBuilder(context, decision);

    const memo = this.options.memoBuilder?.(context, decision);

    const payableAmount = Hbar.fromTinybars(
      hbarToTinybars(decision.topUpAmountHbar)
    );

    const execution = await this.contractService.executeFundingCall({
      functionName: this.contractFunctionName,
      parameters,
      payableAmount,
      memo,
      metadata: {
        agentId: context.profile.agentId,
        planId: context.profile.planId,
        requestedTopUpHbar: decision.topUpAmountHbar
      }
    });

    return {
      ...decision,
      executed: execution.executed,
      transactionId: execution.transactionId,
      status: execution.status,
      metadata: {
        ...(execution.metadata ?? {}),
        proofStatus: proofArtifact?.status ?? "skipped"
      },
      proofArtifact
    };
  }

  private defaultParameterBuilder(
    context: AgentFundingContext,
    decision: FundingDecision
  ): ContractFunctionParameters {
    return new ContractFunctionParameters()
      .addString(context.profile.contractAccountId)
      .addString(context.profile.planId)
      .addString(context.profile.agentId)
      .addInt64(hbarToTinybars(decision.topUpAmountHbar));
  }
}

