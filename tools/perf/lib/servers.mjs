import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { PORTS } from "../config.mjs";

const APP_DIR = { client: "apps/client", admin: "apps/admin" };

/**
 * Always measure a PRODUCTION build. `next dev` compiles routes on demand and ships
 * a dev-only React — its numbers have no relationship to what a member experiences,
 * and they drift as the module graph warms. Any run that skipped the build would be
 * comparing against results that did not.
 */
export function build() {
  return run("pnpm", ["turbo", "run", "build"], { quiet: false });
}

/** Boot both apps on their fixed ports and wait until each actually answers. */
export async function startServers() {
  const procs = {};
  for (const [app, dir] of Object.entries(APP_DIR)) {
    procs[app] = spawn("pnpm", ["exec", "next", "start", "-p", String(PORTS[app])], {
      cwd: dir,
      shell: true,
      stdio: "ignore",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" },
    });
  }
  await Promise.all(Object.entries(PORTS).map(([app, port]) => waitForPort(app, port)));
  return procs;
}

export function stopServers(procs) {
  for (const proc of Object.values(procs)) {
    // Windows: killing the pnpm shim leaves the node child holding the port. taskkill
    // /T takes the whole tree, so the next run's fixed ports are actually free.
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  }
}

async function waitForPort(app, port, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`${app} never came up on :${port}`);
}

function run(cmd, args, { quiet }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: true,
      stdio: quiet ? "ignore" : "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}
