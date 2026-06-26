import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ALLOWED_ROOTS } from '../storage/paths.js';
import { assertWithinRoots } from '../util/pathGuard.js';
import { createLogger } from '../logger.js';

const logger = createLogger('worktree');
const MAX_GIT_ROOT_DEPTH = 5;

export interface PrepareWorktreeRequest {
  cwd: string;
  name: string;
}

export interface PrepareWorktreeResponse {
  cwd: string;
  sourceWorkspace: string;
  worktreeName: string;
  worktreeBranch: string;
  created: boolean;
}

export async function prepareWorktree(req: PrepareWorktreeRequest): Promise<PrepareWorktreeResponse> {
  const source = assertWithinRoots(req.cwd, ALLOWED_ROOTS);
  const gitRoot = await findGitRoot(source);
  const worktreeName = sanitizeWorktreeName(req.name);
  const parent = dirname(gitRoot);
  const target = resolve(parent, `${basename(gitRoot)}_${worktreeName}`);
  assertWithinRoots(target, ALLOWED_ROOTS);
  if (dirname(target) !== parent) throw new Error('invalid worktree target');

  const branch = `worktree/${worktreeName}`;
  const existing = await pathExists(target);
  if (existing) {
    if (!(await isRegisteredWorktree(gitRoot, target))) {
      throw new Error(`target path already exists and is not a registered worktree: ${target}`);
    }
    logger.info('reuse existing worktree', { gitRoot, target, branch });
    return { cwd: target, sourceWorkspace: gitRoot, worktreeName, worktreeBranch: branch, created: false };
  }

  await mkdir(parent, { recursive: true });
  const branches = await listBranches(gitRoot);
  const args = branches.has(branch)
    ? ['worktree', 'add', target, branch]
    : ['worktree', 'add', '-b', branch, target];
  await runGit(gitRoot, args);
  logger.info('worktree created', { gitRoot, target, branch });
  return { cwd: target, sourceWorkspace: gitRoot, worktreeName, worktreeBranch: branch, created: true };
}

async function findGitRoot(start: string): Promise<string> {
  let cursor = resolve(start);
  for (let depth = 0; depth <= MAX_GIT_ROOT_DEPTH; depth += 1) {
    try {
      const root = (await runGit(cursor, ['rev-parse', '--show-toplevel'])).trim();
      if (root && distanceToAncestor(start, root) <= MAX_GIT_ROOT_DEPTH) return root;
    } catch {
      // try parent
    }
    const next = dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  throw new Error(`no git workspace found within ${MAX_GIT_ROOT_DEPTH} parent levels`);
}

function distanceToAncestor(path: string, ancestor: string): number {
  let cursor = resolve(path);
  const root = resolve(ancestor);
  for (let depth = 0; depth <= MAX_GIT_ROOT_DEPTH; depth += 1) {
    if (cursor === root) return depth;
    const next = dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  return Number.POSITIVE_INFINITY;
}

function sanitizeWorktreeName(input: string): string {
  const normalized = input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._/-]/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('worktree name required');
  if (normalized.includes('..') || normalized.startsWith('/') || normalized.endsWith('/')) {
    throw new Error('invalid worktree name');
  }
  return normalized.slice(0, 80);
}

async function listBranches(gitRoot: string): Promise<Set<string>> {
  const out = await runGit(gitRoot, ['branch', '--format=%(refname:short)']);
  return new Set(out.split('\n').map((line) => line.trim()).filter(Boolean));
}

async function isRegisteredWorktree(gitRoot: string, target: string): Promise<boolean> {
  const out = await runGit(gitRoot, ['worktree', 'list', '--porcelain']);
  return out.split('\n').some((line) => line === `worktree ${target}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0) {
        resolvePromise(out);
        return;
      }
      reject(new Error(err || `git ${args.join(' ')} failed with code ${code}`));
    });
  });
}
