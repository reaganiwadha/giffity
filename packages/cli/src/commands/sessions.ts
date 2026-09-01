import type { Command } from 'commander';
import { createHash } from 'node:crypto';
import open from 'open';
import pc from 'picocolors';
import { isGitRepo, getRepoRoot } from '@diffity/git';
import { getHost } from '../server.js';
import { findInstanceForRepo } from '../registry.js';

interface SessionSummary {
  id: string;
  name: string;
  title: string | null;
  kind: string;
  lanes: { ref: string }[];
  lastOpenedAt: string;
  archived: boolean;
  openThreadCount: number;
  totalThreadCount: number;
}

function requireInstance() {
  if (!isGitRepo()) {
    console.error(pc.red('Error: Not a git repository'));
    process.exit(1);
  }
  const repoHash = createHash('sha256')
    .update(getRepoRoot())
    .digest('hex')
    .slice(0, 12);
  const instance = findInstanceForRepo(repoHash);
  if (!instance) {
    console.error(pc.red('No running diffity instance for this repo.'));
    console.log(`Run ${pc.cyan('diffity')} to start one.`);
    process.exit(1);
  }
  return instance;
}

export function registerSessionsCommand(program: Command) {
  const sessions = program
    .command('sessions')
    .description('List and open review sessions for the running instance');

  sessions
    .command('list', { isDefault: true })
    .description('List sessions')
    .option('--json', 'Output as JSON')
    .option('--all', 'Include archived sessions')
    .action(async (opts) => {
      const instance = requireInstance();
      const res = await fetch(
        `http://localhost:${instance.port}/api/sessions${opts.all ? '?archived=1' : ''}`,
      );
      const { sessions: list } = (await res.json()) as {
        sessions: SessionSummary[];
      };

      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      if (list.length === 0) {
        console.log(pc.dim('No sessions.'));
        return;
      }
      for (const s of list) {
        const lanes = s.lanes.map((l) => l.ref).join(' → ') || s.kind;
        const badge = s.openThreadCount
          ? pc.yellow(` ${s.openThreadCount} open`)
          : '';
        console.log(
          `  ${pc.bold(s.name.padEnd(24))} ${pc.dim(lanes)}${badge}`,
        );
      }
    });

  sessions
    .command('open <name>')
    .description('Open a session in the browser')
    .action(async (name: string) => {
      const instance = requireInstance();
      const res = await fetch(
        `http://localhost:${instance.port}/api/sessions/${encodeURIComponent(name)}`,
      );
      if (!res.ok) {
        console.error(pc.red(`Session not found: ${name}`));
        process.exit(1);
      }
      const session = (await res.json()) as SessionSummary;
      const control = await fetch(
        `http://localhost:${instance.port}/api/control`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'open-session',
            lanes: session.lanes.map((l) => ({ ref: l.ref })),
          }),
        },
      );
      const { url } = (await control.json()) as { url: string };
      const full = `http://${getHost()}:${instance.port}${url}`;
      console.log(`  ${pc.green('→')} ${pc.cyan(full)}`);
      await open(full);
    });
}
