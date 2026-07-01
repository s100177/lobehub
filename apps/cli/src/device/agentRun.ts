import { spawn } from 'node:child_process';
import fs from 'node:fs';

import {
  buildHeteroExecStdinPayload,
  type HeteroExecImageRef,
} from '@lobechat/heterogeneous-agents/protocol';

export interface SpawnHeteroAgentRunParams {
  agentType: string;
  /** Resolved `lh hetero exec` wrapper args. */
  args?: string[];
  cwd?: string;
  /** Image attachments (signed URLs) appended as image content blocks. */
  imageList?: HeteroExecImageRef[];
  jwt: string;
  operationId: string;
  prompt: string;
  resumeSessionId?: string;
  serverUrl: string;
  systemContext?: string;
  topicId: string;
}

export interface AgentRunAckResult {
  reason?: string;
  status: 'accepted' | 'rejected';
}

interface SpawnHeteroAgentRunLogger {
  error?: (msg: string) => void;
  info?: (msg: string) => void;
}

const resolveCliInvocation = (): { args: string[]; command: string } | { error: string } => {
  const command = process.env.LOBEHUB_CLI_NODE || process.execPath;
  const entry = process.env.LOBEHUB_CLI_ENTRY || process.argv[1];

  if (!command || !fs.existsSync(command)) {
    return {
      error: `LobeHub CLI node executable is unavailable: ${command || '<empty>'}. Restart 'lh connect' from a valid Node installation.`,
    };
  }

  if (!entry || !fs.existsSync(entry)) {
    return {
      error: `LobeHub CLI entry is unavailable: ${entry || '<empty>'}. Restart 'lh connect' from the current CLI installation.`,
    };
  }

  return { args: [...process.execArgv, entry], command };
};

/**
 * Spawn `lh hetero exec` for a gateway-dispatched agent run. Mirrors the
 * desktop app's `spawnLhHeteroExec`: the spawned CLI owns the full pipeline
 * (spawn -> adapt -> BatchIngester -> server ingest), so the connect daemon
 * needs no local stream handling — it only kicks off the process.
 *
 * Re-invokes the current CLI entry (`process.execPath` + `process.argv[1]`)
 * instead of relying on `lh` being on `PATH`, so it also works inside the
 * detached `lh connect --daemon` child where `PATH` may be minimal.
 *
 * Resolves only once the child's outcome is known: `accepted` on the `spawn`
 * event, `rejected` on an early `error`. `spawn()` reports failures (missing or
 * inaccessible `cwd`, etc.) asynchronously via `error`, so acking eagerly would
 * report a false success and leave the run with no process to emit
 * `heteroFinish` — surfacing as a stuck assistant message. A rejected ack
 * instead flows back as a dispatch failure the user can see.
 */
export function spawnHeteroAgentRun(
  params: SpawnHeteroAgentRunParams,
  logger?: SpawnHeteroAgentRunLogger,
): Promise<AgentRunAckResult> {
  const {
    agentType,
    args: extraArgs,
    cwd,
    imageList,
    jwt,
    operationId,
    prompt,
    resumeSessionId,
    serverUrl,
    systemContext,
    topicId,
  } = params;
  const workDir = cwd ?? process.cwd();
  const cliInvocation = resolveCliInvocation();

  if ('error' in cliInvocation) {
    logger?.error?.(
      `hetero exec spawn preflight failed (op=${operationId}): ${cliInvocation.error}`,
    );
    return Promise.resolve({ reason: cliInvocation.error, status: 'rejected' });
  }

  // Server-ingest mode (--topic + --operation-id): events are batch-POSTed to
  // the server, not rendered. `--input-json -` reads the prompt from stdin.
  const cliArgs = [
    ...cliInvocation.args,
    'hetero',
    'exec',
    '--type',
    agentType,
    '--operation-id',
    operationId,
    '--topic',
    topicId,
    '--render',
    'none',
    '--input-json',
    '-',
    '--cwd',
    workDir,
    ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
    ...(extraArgs ?? []),
  ];

  // systemContext / image attachments turn the payload into a content-block
  // array: context block first, then the user's prompt, then images — mirrors
  // the desktop path. `lh hetero exec` coerces both shapes via
  // coerceJsonPrompt.
  const stdinPayload = buildHeteroExecStdinPayload({ imageList, prompt, systemContext });

  return new Promise<AgentRunAckResult>((resolve) => {
    let settled = false;
    const settle = (result: AgentRunAckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(cliInvocation.command, cliArgs, {
      cwd: workDir,
      env: {
        ...process.env,
        LOBEHUB_JWT: jwt,
        LOBEHUB_SERVER: serverUrl,
      },
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.once('spawn', () => {
      // Only safe to write stdin once the process actually started.
      try {
        child.stdin?.write(stdinPayload);
        child.stdin?.end();
      } catch (err) {
        logger?.error?.(
          `hetero exec stdin write failed (op=${operationId}): ${(err as Error).message}`,
        );
      }
      settle({ status: 'accepted' });
    });

    child.once('error', (err) => {
      logger?.error?.(`hetero exec spawn failed (op=${operationId}): ${err.message}`);
      settle({ reason: err.message, status: 'rejected' });
    });

    child.on('exit', (code, signal) => {
      logger?.info?.(`hetero exec exited (op=${operationId}) code=${code} signal=${signal}`);
    });
  });
}
