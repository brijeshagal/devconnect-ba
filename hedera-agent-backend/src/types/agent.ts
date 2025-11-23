export interface AgentProfile {
  /** Stable identifier used internally to track the agent */
  agentId: string;
  /** Hedera account that owns the agent contract */
  contractAccountId: string;
  /** Pricing plan identifier tied to the contract logic */
  planId: string;
}

export interface AgentFundingSnapshot {
  /** Current liquid balance (HBAR) available to the agent */
  currentBalanceHbar: number;
  /** Minimum desired safety buffer (HBAR) before the next top-up */
  minBufferHbar: number;
  /** Maximum balance (HBAR) we are comfortable holding for the agent */
  maxBufferHbar: number;
  /** Cost of the active pricing plan per billing window (HBAR) */
  planCostHbar: number;
  /**
   * Demand score computed elsewhere (0-1). Higher values indicate the agent
   * is receiving significant usage and should be prioritised.
   */
  demandScore: number;
  /** When the last successful funding transaction settled */
  lastFundingAt?: Date | null;
  /** Hours remaining until the agent is expected to deplete its funds */
  projectedHoursUntilDepletion: number;
}

export interface AgentFundingContext {
  profile: AgentProfile;
  snapshot: AgentFundingSnapshot;
}

export type FundingProofStatus = "success" | "failed" | "skipped";

export interface FundingProofArtifact {
  status: FundingProofStatus;
  generatedAt: Date;
  requestUrl: string;
  rawProof?: string;
  stdout?: string;
  stderr?: string;
  reason?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface FundingDecision {
  shouldFund: boolean;
  /** Amount in HBAR that should be moved to the contract */
  topUpAmountHbar: number;
  reason: string;
  /** Milliseconds until the agent should be evaluated again */
  reevaluateInMs: number;
}

