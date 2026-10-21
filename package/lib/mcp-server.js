#!/usr/bin/env node

// packages/dsh-zhen/src/mcp-server.ts
import { spawn } from "node:child_process";
import { join as join2, isAbsolute as isAbsolute2, dirname as dirname2 } from "node:path";
import { mkdirSync as mkdirSync2, realpathSync as realpathSync2 } from "node:fs";

// packages/dsh-zhen/src/mcp-market-schema.ts
import { z } from "zod";
var mcpId = z.enum(["memory", "filesystem"]);
var version = z.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
var sha = z.string().regex(/^[a-f0-9]{64}$/);
var mcpReleaseSchema = z.object({
  id: mcpId,
  version,
  integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
  gitHead: z.string().regex(/^[a-f0-9]{40}$/),
  node: z.string().max(200),
  license: z.string().max(200),
  checkedAt: z.iso.datetime()
}).strict();
var mcpInstallationSchema = z.object({ release: mcpReleaseSchema, digest: sha, packages: z.number().int().min(1).max(1e3), installedAt: z.iso.datetime() }).strict();
var mcpArchiveSchema = z.object({ archiveId: z.uuid(), installation: mcpInstallationSchema, retainedAt: z.iso.datetime(), programRetained: z.boolean(), verified: z.boolean() }).strict();
var mcpSelectionSchema = z.object({ id: mcpId, active: version, pending: z.union([version, z.literal("")]), enabled: z.boolean(), workspace: z.string().max(4096), epoch: z.number().int().positive() }).strict();
var mcpMarketSnapshotSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  archives: z.array(mcpArchiveSchema).max(100).default([]),
  automatic: z.boolean(),
  checkedAt: z.string().max(40),
  message: z.string().max(300),
  nextEpoch: z.number().int().positive().default(1),
  candidates: z.array(mcpReleaseSchema).max(2),
  installations: z.array(mcpInstallationSchema).max(100),
  selections: z.array(mcpSelectionSchema).max(2)
}).strict().superRefine((value, context) => {
  if (new Set(value.archives.map((item) => item.archiveId)).size !== value.archives.length || new Set(value.candidates.map((item) => item.id)).size !== value.candidates.length || new Set(value.selections.map((item) => item.id)).size !== value.selections.length || new Set(value.installations.map((item) => `${item.release.id}@${item.release.version}`)).size !== value.installations.length || value.selections.some((item) => item.epoch >= value.nextEpoch)) context.addIssue({ code: "custom", message: "Invalid MCP version or grant identity." });
});
var mcpMarketViewSchema = z.object({ snapshot: mcpMarketSnapshotSchema, node: z.string().max(40), incompatible: z.array(z.string().max(100)).max(100), recipes: z.array(z.object({
  id: mcpId,
  title: z.string(),
  package: z.string(),
  version,
  integrity: z.string(),
  gitHead: z.string(),
  node: z.string(),
  license: z.string(),
  description: z.string(),
  access: z.string(),
  runtime: z.enum(["idle", "ready", "draining", "error", "unavailable"]),
  maintenance: z.boolean().default(false)
}).strict()).max(2) }).strict();
var MCP_RECIPES = {
  memory: {
    id: "memory",
    title: "\u9879\u76EE\u8BB0\u5FC6",
    package: "@modelcontextprotocol/server-memory",
    version: "2026.8.31",
    integrity: "sha512-ljj/3S4aGjxdNSQWw6gucKKGnTLdBPWxzapyY/MT2tOVyZwvxChvevXSLPwx59nKJAlVpUVW+cOlnVRXRwiqMQ==",
    entry: "dist/index.js",
    gitHead: "a40bc270fb5ece62673f8a1196f57116d885c5eb",
    node: "",
    license: "SEE LICENSE IN LICENSE",
    description: "\u5728\u5F53\u524D\u9879\u76EE\u7684\u72EC\u7ACB\u8BB0\u5FC6\u6587\u4EF6\u4E2D\u8BB0\u5F55\u5B9E\u4F53\u3001\u5173\u7CFB\u548C\u89C2\u5BDF\u3002",
    access: "\u8BFB\u5199\u6B64\u8FDE\u63A5\u7684\u8BB0\u5FC6\u6570\u636E\uFF1B\u5DE5\u5177\u7ED3\u679C\u4F1A\u63D0\u4F9B\u7ED9\u4F1A\u8BDD\u6240\u9009\u6A21\u578B\u3002"
  },
  filesystem: {
    id: "filesystem",
    title: "\u9879\u76EE\u6587\u4EF6",
    package: "@modelcontextprotocol/server-filesystem",
    version: "2026.8.31",
    integrity: "sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==",
    entry: "dist/index.js",
    gitHead: "a40bc270fb5ece62673f8a1196f57116d885c5eb",
    node: "",
    license: "SEE LICENSE IN LICENSE",
    description: "\u901A\u8FC7\u5B98\u65B9\u53C2\u8003\u670D\u52A1\u5668\u6574\u7406\u6240\u9009\u9879\u76EE\u4E2D\u7684\u6587\u4EF6\u3002",
    access: "\u53EF\u8BFB\u5199\u6240\u9009\u9879\u76EE\u76EE\u5F55\uFF1B\u5DE5\u5177\u7ED3\u679C\u4F1A\u63D0\u4F9B\u7ED9\u4F1A\u8BDD\u6240\u9009\u6A21\u578B\u3002"
  }
};

// packages/dsh-zhen/src/mcp-market.ts
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, lstatSync, realpathSync, statSync, rmSync } from "node:fs";
import { resolve, join, relative, isAbsolute, dirname } from "node:path";
import { parse } from "yaml";
import { DatabaseSync } from "node:sqlite";
import semver from "semver";

// packages/dsh-zhen/src/update-schema.ts
import { z as z2 } from "zod";
var updateSourceSchema = z2.object({ id: z2.enum(["dsh", "canvas", "zhen", "gateway"]), title: z2.string(), current: z2.string(), available: z2.string(), revision: z2.string(), url: z2.string(), changed: z2.boolean(), state: z2.enum(["checked", "unpublished", "error"]), message: z2.string() }).strict();
var updateReportSchema = z2.object({ checkedAt: z2.string(), automatic: z2.boolean(), sources: z2.array(updateSourceSchema) }).strict();

// packages/dsh-zhen/src/mcp-market.ts
var require2 = createRequire(import.meta.url);
var MAX_FILES = 2e4;
var MAX_BYTES = 128 * 1024 * 1024;
var MAX_STATE_BYTES = 1024 * 1024;
function canonicalMcpWorkspace(path) {
  if (!isAbsolute(path) || !statSync(path).isDirectory()) throw new Error("\u8BF7\u9009\u62E9\u5DF2\u5B58\u5728\u7684\u7EDD\u5BF9\u9879\u76EE\u76EE\u5F55\u3002");
  return realpathSync.native(path);
}
function inside(root, path) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\");
}
function mcpChildEnvironment(extra = {}) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (/^(?:path|systemroot|windir|comspec|temp|tmp|tmpdir|pathext|lang|lc_all)$/i.test(name) && value !== void 0) env[name] = value;
  return { ...env, ...extra };
}
function inspectMcpInstallation(directory) {
  const root = realpathSync(directory), files = [];
  let size = 0;
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = join(folder, entry.name), stat = lstatSync(filename);
      if (stat.isSymbolicLink() || !inside(root, realpathSync(filename))) throw new Error("MCP \u7A0B\u5E8F\u76EE\u5F55\u5305\u542B\u672A\u652F\u6301\u7684\u94FE\u63A5\u3002");
      if (stat.isDirectory()) walk(filename);
      else if (stat.isFile()) {
        files.push(filename);
        size += stat.size;
        if (files.length > MAX_FILES || size > MAX_BYTES) throw new Error("MCP \u7A0B\u5E8F\u76EE\u5F55\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002");
      } else throw new Error("MCP \u7A0B\u5E8F\u76EE\u5F55\u5305\u542B\u7279\u6B8A\u6587\u4EF6\u3002");
    }
  };
  walk(root);
  const digest = createHash("sha256");
  for (const filename of files.sort()) {
    const bytes = readFileSync(filename);
    if (bytes.length > MAX_BYTES) throw new Error("MCP \u6587\u4EF6\u8FC7\u5927\u3002");
    digest.update(relative(root, filename).replaceAll("\\", "/")).update("\0").update(String(bytes.length)).update("\0").update(bytes);
  }
  const lock = parse(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  const packages = Object.entries(lock.packages ?? {});
  if (!packages.length || packages.length > 1e3) throw new Error("MCP \u4F9D\u8D56\u6E05\u5355\u65E0\u6548\u3002");
  for (const [, value] of packages) {
    const resolution = value.resolution;
    if (!resolution || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(resolution.integrity ?? "") || resolution.type !== void 0) throw new Error("MCP \u4F9D\u8D56\u7F3A\u5C11\u56FA\u5B9A\u7684\u6CE8\u518C\u8868\u6458\u8981\u3002");
    if (resolution.tarball) {
      const url = new URL(resolution.tarball);
      if (url.origin !== "https://registry.npmjs.org" || url.search || url.hash || url.username || url.password) throw new Error("MCP \u4F9D\u8D56\u6765\u6E90\u4E0D\u53D7\u652F\u6301\u3002");
    }
  }
  return { digest: digest.digest("hex"), packages: packages.length };
}

// packages/dsh-zhen/src/mcp-server.ts
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 10 || args[0] !== "--id" || args[2] !== "--directory" || args[4] !== "--digest" || args[6] !== "--workspace" || args[8] !== "--data") throw new Error("Invalid launch.");
  const id = mcpId.parse(args[1]), directory = args[3], digest = args[5], workspace = canonicalMcpWorkspace(args[7]), data = args[9];
  if (!isAbsolute2(directory) || !/^[a-f0-9]{64}$/.test(digest) || !isAbsolute2(data)) throw new Error("Invalid launch.");
  if (inspectMcpInstallation(directory).digest !== digest) throw new Error("Program changed.");
  const recipe = MCP_RECIPES[id], root = realpathSync2(directory);
  const entry = join2(root, "node_modules", recipe.package, recipe.entry);
  mkdirSync2(dirname2(data), { recursive: true });
  const child = spawn(process.execPath, [entry, ...id === "filesystem" ? [workspace] : []], {
    cwd: root,
    env: mcpChildEnvironment(id === "memory" ? { MEMORY_FILE_PATH: data } : {}),
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"]
  });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stdin.on("error", () => {
  });
  const stop = () => {
    child.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdout.on("error", stop);
  await new Promise((resolve2) => {
    let failed = false;
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code) => {
      process.stdin.unpipe(child.stdin);
      process.stdin.pause();
      process.exitCode = !failed && code === 0 ? 0 : 1;
      resolve2();
    });
  });
}
main().catch(() => {
  process.stderr.write("DSH-zhen MCP could not start; check the connection panel.\n");
  process.exitCode = 1;
});
