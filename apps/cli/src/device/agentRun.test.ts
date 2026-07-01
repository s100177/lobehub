import { EventEmitter } from 'node:events';
import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { spawnHeteroAgentRun } from './agentRun';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    default: { ...actual.default, existsSync: vi.fn(() => true) },
    existsSync: vi.fn(() => true),
  };
});

const makeFakeChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { end: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  };
  child.stdin = { end: vi.fn(), write: vi.fn() };
  return child;
};

const baseParams = {
  agentType: 'claudeCode',
  jwt: 'jwt',
  operationId: 'op',
  prompt: 'hi',
  serverUrl: 'https://app.lobehub.com',
  topicId: 'tpc',
};

describe('spawnHeteroAgentRun', () => {
  afterEach(() => {
    spawnMock.mockReset();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    delete process.env.LOBEHUB_CLI_ENTRY;
    delete process.env.LOBEHUB_CLI_NODE;
  });

  it('spawns `lh hetero exec` in server-ingest mode via the current CLI entry', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      cwd: '/work/dir',
      jwt: 'jwt-token',
      operationId: 'op-1',
      topicId: 'tpc-1',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawnMock.mock.calls[0];

    expect(bin).toBe(process.execPath);
    expect(args).toEqual([
      ...process.execArgv,
      process.argv[1],
      'hetero',
      'exec',
      '--type',
      'claudeCode',
      '--operation-id',
      'op-1',
      '--topic',
      'tpc-1',
      '--render',
      'none',
      '--input-json',
      '-',
      '--cwd',
      '/work/dir',
    ]);
    expect(opts).toMatchObject({
      cwd: '/work/dir',
      env: expect.objectContaining({
        LOBEHUB_JWT: 'jwt-token',
        LOBEHUB_SERVER: 'https://app.lobehub.com',
      }),
    });

    // stdin is only written after the child actually spawns.
    expect(child.stdin.write).not.toHaveBeenCalled();
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    expect(child.stdin.write).toHaveBeenCalledWith(JSON.stringify('hi'));
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('uses the daemon-pinned CLI entry when provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    process.env.LOBEHUB_CLI_NODE = '/usr/bin/node';
    process.env.LOBEHUB_CLI_ENTRY = '/opt/lobehub/cli.js';

    void spawnHeteroAgentRun(baseParams);

    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe('/usr/bin/node');
    expect(args).toContain('/opt/lobehub/cli.js');
    expect(args.indexOf('/opt/lobehub/cli.js')).toBeLessThan(args.indexOf('hetero'));
  });

  it('rejects before spawn when the daemon node executable disappeared', async () => {
    process.env.LOBEHUB_CLI_NODE = '/missing/node';
    vi.mocked(fs.existsSync).mockImplementation((path) => path !== '/missing/node');

    const ack = await spawnHeteroAgentRun(baseParams);

    expect(ack).toEqual({
      reason:
        "LobeHub CLI node executable is unavailable: /missing/node. Restart 'lh connect' from a valid Node installation.",
      status: 'rejected',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects before spawn when the daemon CLI entry disappeared', async () => {
    process.env.LOBEHUB_CLI_ENTRY = '/missing/lh';
    vi.mocked(fs.existsSync).mockImplementation((path) => path !== '/missing/lh');

    const ack = await spawnHeteroAgentRun(baseParams);

    expect(ack).toEqual({
      reason:
        "LobeHub CLI entry is unavailable: /missing/lh. Restart 'lh connect' from the current CLI installation.",
      status: 'rejected',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects (no stuck run) when the child errors before spawning, e.g. bad cwd', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, cwd: '/missing' });
    child.emit('error', new Error('spawn ENOENT'));

    await expect(ackPromise).resolves.toEqual({ reason: 'spawn ENOENT', status: 'rejected' });
    expect(child.stdin.write).not.toHaveBeenCalled();
  });

  it('appends --resume when resuming a session', () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    void spawnHeteroAgentRun({ ...baseParams, resumeSessionId: 'sess-9' });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--resume');
    expect(args).toContain('sess-9');
  });

  it('forwards resolved args to lh hetero exec', () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    void spawnHeteroAgentRun({
      ...baseParams,
      args: ['--model', 'opus', '--effort', 'high'],
    });

    const [, args] = spawnMock.mock.calls[0];
    expect(args.slice(-4)).toEqual(['--model', 'opus', '--effort', 'high']);
  });

  it('sends a content-block array to stdin when systemContext is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      prompt: 'do it',
      systemContext: 'workspace rules',
    });
    child.emit('spawn');
    await ackPromise;

    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify([
        { text: 'workspace rules', type: 'text' },
        { text: 'do it', type: 'text' },
      ]),
    );
  });

  it('appends image blocks to stdin when imageList is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      imageList: [{ id: 'file-1', url: 'https://signed/a.png' }],
      prompt: 'look at this',
    });
    child.emit('spawn');
    await ackPromise;

    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify([
        { text: 'look at this', type: 'text' },
        { source: { id: 'file-1', type: 'url', url: 'https://signed/a.png' }, type: 'image' },
      ]),
    );
  });
});
