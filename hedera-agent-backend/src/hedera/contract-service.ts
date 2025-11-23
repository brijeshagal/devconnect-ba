import {
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar
} from "@hashgraph/sdk";

import { env } from "../config/env";
import { getHederaClient } from "./client";

export interface ContractFundingCall {
  functionName?: string;
  parameters: ContractFunctionParameters;
  payableAmount?: Hbar;
  gas?: number;
  memo?: string;
  metadata?: Record<string, unknown>;
}

export interface FundingExecutionResult {
  executed: boolean;
  transactionId?: string;
  status?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class AgentContractService {
  private clientRef: Client | null = null;
  private readonly contractIdString = env.agentContractId;

  private get client(): Client {
    if (!this.clientRef) {
      this.clientRef = getHederaClient();
    }

    return this.clientRef;
  }

  async executeFundingCall(
    call: ContractFundingCall
  ): Promise<FundingExecutionResult> {
    const functionName = call.functionName ?? "payForPlan";
    const gasLimit = call.gas ?? env.contractGasLimit;

    if (env.dryRunFunding) {
      return {
        executed: false,
        message: `DRY_RUN enabled: skipping contract call ${functionName}`,
        metadata: call.metadata
      };
    }

    const contractId = ContractId.fromString(this.contractIdString);
    const transaction = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gasLimit)
      .setFunction(functionName, call.parameters);

    if (call.payableAmount) {
      transaction.setPayableAmount(call.payableAmount);
    }

    if (call.memo) {
      transaction.setTransactionMemo(call.memo);
    }

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      executed: true,
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      message: `Contract ${functionName} executed with status ${receipt.status}`,
      metadata: call.metadata
    };
  }
}

