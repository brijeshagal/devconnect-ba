import { spawn } from "node:child_process";

import { env } from "../config/env";
import { FundingProofArtifact } from "../types/agent";

export interface FundingProofRequest {
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  metadata?: Record<string, unknown>;
}

export interface FundingProofProvider {
  generateFundingProof(
    request: FundingProofRequest
  ): Promise<FundingProofArtifact>;
}

export class VlayerProofService implements FundingProofProvider {
  private readonly authorizationHeader = "authorization";

  async generateFundingProof(
    request: FundingProofRequest
  ): Promise<FundingProofArtifact> {
    if (!env.vlayer.enabled) {
      return {
        status: "skipped",
        generatedAt: new Date(),
        requestUrl: request.url,
        reason: "vlayer integration is disabled",
        metadata: request.metadata
      };
    }

    const headers = this.mergeHeadersWithJwt(request.headers ?? {});
    const args = this.buildArgs(request.url, headers, request.body);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(env.vlayer.cliPath, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk as Buffer));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk as Buffer));

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? -1));
    });

    const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
    const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();

    if (exitCode !== 0) {
      return {
        status: "failed",
        generatedAt: new Date(),
        requestUrl: request.url,
        reason: `vlayer cli exited with code ${exitCode}`,
        stdout,
        stderr,
        headers,
        metadata: request.metadata
      };
    }

    return {
      status: "success",
      generatedAt: new Date(),
      requestUrl: request.url,
      rawProof: stdout,
      stdout,
      stderr,
      headers,
      metadata: request.metadata
    };
  }

  private buildArgs(
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): string[] {
    const args: string[] = [
      "web-proof-fetch",
      "--url",
      url,
      "--notary",
      env.vlayer.notaryUrl
    ];

    for (const [key, value] of Object.entries(headers)) {
      args.push("--headers", `${key}: ${value}`);
    }

    if (body !== undefined && body !== null) {
      const payload =
        typeof body === "string" ? body : JSON.stringify(body, null, 2);
      args.push("--data", payload);
    }

    return args;
  }

  private mergeHeadersWithJwt(
    baseHeaders: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = { ...baseHeaders };

    if (env.vlayer.jwtToken && !this.hasAuthorizationHeader(headers)) {
      headers["Authorization"] = `Bearer ${env.vlayer.jwtToken}`;
    }

    return headers;
  }

  private hasAuthorizationHeader(headers: Record<string, string>): boolean {
    return Object.keys(headers).some(
      (key) => key.toLowerCase() === this.authorizationHeader
    );
  }
}

