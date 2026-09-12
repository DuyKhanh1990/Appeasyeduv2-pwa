import { spawn } from "node:child_process";

const port = process.env.PORT || "21338";
const child = spawn(
  "pnpm",
  [
    "exec",
    "vite",
    "preview",
    "--config",
    "vite.config.ts",
    "--host",
    "0.0.0.0",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
    },
  },
);

const stop = (signal) => child.kill(signal);
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});