import { AgentFundingContext, FundingDecision } from "../types/agent";

const MIN_DEMAND_SCORE = 0.35;
const DEFAULT_REEVALUATE_MS = 5 * 60 * 1000;
const MAX_REEVALUATE_MS = 30 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function evaluateFunding(context: AgentFundingContext): FundingDecision {
  const { snapshot, profile } = context;
  const bufferGap = snapshot.minBufferHbar - snapshot.currentBalanceHbar;
  const bufferDeficit = bufferGap > 0;
  const approachingDepletion = snapshot.projectedHoursUntilDepletion <= 3;
  const highDemand = snapshot.demandScore >= MIN_DEMAND_SCORE;

  const shouldFund = (bufferDeficit || approachingDepletion) && highDemand;

  if (!shouldFund) {
    return {
      shouldFund: false,
      topUpAmountHbar: 0,
      reason: `Agent ${profile.agentId} funding deferred: buffer healthy or demand low.`,
      reevaluateInMs: Math.round(
        clamp(snapshot.projectedHoursUntilDepletion * 60 * 60 * 1000, DEFAULT_REEVALUATE_MS, MAX_REEVALUATE_MS)
      )
    };
  }

  const desiredBalance = snapshot.currentBalanceHbar + snapshot.planCostHbar * 2;
  const targetBalance = Math.min(snapshot.maxBufferHbar, desiredBalance);
  const maxPossibleTopUp = Math.max(
    snapshot.maxBufferHbar - snapshot.currentBalanceHbar,
    snapshot.planCostHbar
  );
  const minTopUp = Math.max(snapshot.planCostHbar * 0.5, 0.01);
  const rawTopUp = targetBalance - snapshot.currentBalanceHbar;
  const topUpAmount = clamp(rawTopUp, minTopUp, maxPossibleTopUp);

  const reevaluateInMs = Math.round(
    clamp(
      snapshot.projectedHoursUntilDepletion * 0.5 * 60 * 60 * 1000,
      DEFAULT_REEVALUATE_MS,
      MAX_REEVALUATE_MS
    )
  );

  return {
    shouldFund: true,
    topUpAmountHbar: Number(topUpAmount.toFixed(8)),
    reason: `Funding approved for agent ${profile.agentId}: buffer deficit detected.`,
    reevaluateInMs
  };
}

