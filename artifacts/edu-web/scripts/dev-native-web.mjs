import { spawn } from "node:child_process";

const port = process.env.PORT || "21338";
const child = spawn(
  "pnpm",
  [
    "--filter",
    "@workspace/edu-mobile",
    "exec",
    "expo",
    "start",
    "--web",
    "--localhost",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_PUBLIC_DOMAIN: process.env.REPLIT_DEV_DOMAIN || "localhost",
      EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || "",
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