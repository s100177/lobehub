import type {
  EditLocalFileParams,
  GetCommandOutputParams,
  GlobFilesParams,
  GrepContentParams,
  KillCommandParams,
  ListLocalFileParams,
  LocalReadFileParams,
  LocalReadFilesParams,
  LocalSearchFilesParams,
  MoveLocalFilesParams,
  RunCommandParams,
  WriteLocalFileParams,
} from '@lobechat/electron-client-ipc';
import { LocalSystemExecutionRuntime } from '@lobechat/tool-runtime';
import type { BuiltinToolContext, BuiltinToolResult } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';

import { deviceService } from '@/services/device';
import { localFileService } from '@/services/electron/localFileService';

import type { LocalSystemApiName } from '../../types';
import { LocalSystemIdentifier } from '../../types';
import { resolveArgsWithScope, resolvePathWithScope } from '../../utils/path';

const DEFAULT_FILE_SEARCH_LIMIT = 100;

const LocalSystemApiEnum = {
  editFile: 'editFile' as const,
  getCommandOutput: 'getCommandOutput' as const,
  globFiles: 'globFiles' as const,
  grepContent: 'grepContent' as const,
  killCommand: 'killCommand' as const,
  listFiles: 'listFiles' as const,
  moveFiles: 'moveFiles' as const,
  readFile: 'readFile' as const,
  readFiles: 'readFiles' as const,
  runCommand: 'runCommand' as const,
  searchFiles: 'searchFiles' as const,
  writeFile: 'writeFile' as const,
};

/**
 * Local System Tool Executor
 *
 * Delegates standard computer operations to LocalSystemExecutionRuntime (extends ComputerRuntime).
 * Handles scope resolution for paths before delegating.
 */
class LocalSystemExecutor extends BaseExecutor<typeof LocalSystemApiEnum> {
  readonly identifier = LocalSystemIdentifier;
  protected readonly apiEnum = LocalSystemApiEnum;

  private runtime = new LocalSystemExecutionRuntime(localFileService);

  /**
   * Convert BuiltinServerRuntimeOutput to BuiltinToolResult.
   *
   * Single funnel for every executor return — keep it strict:
   * - never propagate an undefined `content` (would collapse downstream into
   *   `''` and leave the Debug "Response" pane blank while pluginState was
   *   still saved — see globFiles regression);
   * - always preserve `state` when the runtime produced one, regardless of
   *   `success`, so renderers can keep displaying partial outputs on failure.
   */
  private toResult(output: {
    content: string;
    error?: any;
    state?: any;
    success: boolean;
  }): BuiltinToolResult {
    const errorMessage =
      typeof output.error?.message === 'string' ? output.error.message : undefined;
    const safeContent =
      output.content || errorMessage || '[UNKNOWN_EXEC_ERROR] Tool execution failed';

    if (!output.success) {
      return {
        content: safeContent,
        error: output.error
          ? { body: output.error, message: errorMessage ?? safeContent, type: 'PluginServerError' }
          : undefined,
        state: output.state,
        success: false,
      };
    }
    return { content: safeContent, state: output.state, success: true };
  }

  private async proxyToActiveDevice(
    apiName: (typeof LocalSystemApiName)[keyof typeof LocalSystemApiName],
    params: any,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult | undefined> {
    const activeDeviceId = ctx?.stepContext?.activeDeviceId;
    if (!activeDeviceId) return undefined;

    try {
      const result = await deviceService.executeLocalSystemTool({
        apiName,
        arguments: JSON.stringify(params ?? {}),
        deviceId: activeDeviceId,
        operationId: ctx?.operationId,
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  // ==================== File Operations ====================

  listFiles = async (
    params: ListLocalFileParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.listFiles, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.listFiles({
        directoryPath: params.path,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      } as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  readFile = async (
    params: LocalReadFileParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.readFile, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.readFile({
        endLine: params.loc?.[1],
        path: params.path,
        startLine: params.loc?.[0],
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  readFiles = async (
    params: LocalReadFilesParams,
    _ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.readFiles(params);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  searchFiles = async (
    params: LocalSearchFilesParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(
      LocalSystemApiEnum.searchFiles,
      params,
      ctx,
    );
    if (remoteResult) return remoteResult;

    try {
      const resolvedParams = resolveArgsWithScope(params, 'directory');
      const result = await this.runtime.searchFiles({
        ...resolvedParams,
        directory: resolvedParams.directory || '',
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  moveFiles = async (
    params: MoveLocalFilesParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.moveFiles, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.moveFiles({
        operations: params.items.map((item) => ({
          destination: item.newPath,
          source: item.oldPath,
        })),
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  writeFile = async (
    params: WriteLocalFileParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.writeFile, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.writeFile(params);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  editFile = async (
    params: EditLocalFileParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.editFile, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.editFile({
        all: params.replace_all,
        path: params.file_path,
        replace: params.new_string,
        search: params.old_string,
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Shell Commands ====================

  runCommand = async (
    params: RunCommandParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const normalizedParams = {
      ...params,
      background: params.run_in_background,
    };
    const remoteResult = await this.proxyToActiveDevice(
      LocalSystemApiEnum.runCommand,
      normalizedParams,
      ctx,
    );
    if (remoteResult) return remoteResult;

    try {
      // The manifest exposes `run_in_background`, but ComputerRuntime's RunCommandState
      // reads `args.background` for the `isBackground` field — without this normalize
      // the UI/state would always say foreground even for background commands.
      // The IPC handler reads `run_in_background` itself, so we keep that field too.
      const result = await this.runtime.runCommand(normalizedParams as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  getCommandOutput = async (
    params: GetCommandOutputParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(
      LocalSystemApiEnum.getCommandOutput,
      params,
      ctx,
    );
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.getCommandOutput({
        commandId: params.shell_id,
        filter: params.filter,
      } as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  killCommand = async (
    params: KillCommandParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(
      LocalSystemApiEnum.killCommand,
      params,
      ctx,
    );
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.killCommand({
        commandId: params.shell_id,
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Search & Find ====================

  grepContent = async (
    params: GrepContentParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(
      LocalSystemApiEnum.grepContent,
      params,
      ctx,
    );
    if (remoteResult) return remoteResult;
    try {
      // Resolve the search root to an ABSOLUTE path anchored on the agent's
      // effective working directory. The grep manifest/systemRole tell the model
      // `scope` "defaults to the working directory", but without this the
      // downstream `resolveSearchPath` drops to the Electron main process
      // `process.cwd()` (`/` in a packaged app) — so a scope-less OR relative
      // (e.g. `.`) scope made every grep return 0 matches. `ctx.workingDirectory`
      // is sourced from the same place as the `{{workingDirectory}}` prompt
      // placeholder, so what the search targets matches what the prompt promises.
      // `resolvePathWithScope(scope, workingDir)` treats the model's `scope` as a
      // path resolved against the working directory:
      // - scope omitted → working directory
      // - scope relative (`.`, `src`) → joined onto the working directory
      // - scope absolute → used as-is
      // It only returns undefined when there is no working directory AND no scope
      // (web / nothing configured) — then we leave params untouched.
      const searchRoot = resolvePathWithScope(params.scope, ctx?.workingDirectory);
      const resolvedParams = searchRoot ? { ...params, path: searchRoot } : params;
      // Forward the full IPC params (glob / output_mode / -i / -A / -B / -C / -n /
      // multiline / head_limit / type / tool) instead of stripping to {directory, pattern}.
      // ComputerRuntime.callService passes args through unchanged, so the runtime type
      // narrowing was the only blocker — the underlying rg/grep needs these flags to
      // honor the agent's filter and stop scanning dist/* and tsbuildinfo.
      const result = await this.runtime.grepContent(resolvedParams as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  globFiles = async (
    params: GlobFilesParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const remoteResult = await this.proxyToActiveDevice(LocalSystemApiEnum.globFiles, params, ctx);
    if (remoteResult) return remoteResult;

    try {
      const result = await this.runtime.globFiles({
        directory: params.scope,
        limit:
          Number.isFinite(params.limit) && params.limit && params.limit > 0
            ? Math.floor(params.limit)
            : DEFAULT_FILE_SEARCH_LIMIT,
        pattern: params.pattern,
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Helpers ====================

  private errorResult(error: unknown): BuiltinToolResult {
    return {
      content: (error as Error).message,
      error: { body: error, message: (error as Error).message, type: 'PluginServerError' },
      success: false,
    };
  }
}

// Export the executor instance for registration
export const localSystemExecutor = new LocalSystemExecutor();
