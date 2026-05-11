#!/usr/bin/env node
// scripts/db-query.mjs
// Run a read-only SQL query against the database pointed to by the loaded env
// (use pnpm db:prod:query or pnpm db:dev:query — the dotenv loader handles which).
//
// Safety: only SELECT / WITH / EXPLAIN / SHOW are allowed. Writes are refused.
//
// Usage:
//   pnpm db:prod:query "SELECT id, name FROM \"User\" LIMIT 5"
//   pnpm db:prod:query --file path/to/query.sql

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const argv = process.argv.slice(2);

let sql = "";
const fileIdx = argv.indexOf("--file");
if (fileIdx >= 0 && argv[fileIdx + 1]) {
  sql = fs.readFileSync(argv[fileIdx + 1], "utf8");
} else {
  sql = argv.join(" ");
}
sql = sql.trim().replace(/;\s*$/, "");

if (!sql) {
  console.error(
    'Usage:\n  pnpm db:prod:query "<SQL>"\n  pnpm db:prod:query --file path/to/query.sql',
  );
  process.exit(1);
}

// Block writes by inspecting the leading keyword(s). Allow SELECT, WITH (CTE),
// EXPLAIN and SHOW. Anything else is refused.
const firstWord = sql.replace(/^\s*\(*\s*/, "").match(/^\w+/)?.[0]?.toUpperCase();
const READ_ONLY = new Set(["SELECT", "WITH", "EXPLAIN", "SHOW"]);
if (!firstWord || !READ_ONLY.has(firstWord)) {
  console.error(
    `✗ Refused: read-only mode. Only SELECT / WITH / EXPLAIN / SHOW allowed. Got "${firstWord}".`,
  );
  process.exit(2);
}

const dbHost = (process.env.DATABASE_URL || "").match(/@([^/]+)\//)?.[1] ?? "?";
console.error(`→ Running against ${dbHost}`);
console.error(`→ ${sql.replace(/\s+/g, " ").slice(0, 200)}${sql.length > 200 ? "…" : ""}\n`);

const prisma = new PrismaClient();
try {
  const rows = await prisma.$queryRawUnsafe(sql);
  // Pretty JSON, but make BigInt serializable.
  const out = JSON.stringify(
    rows,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  console.log(out);
  if (Array.isArray(rows)) {
    console.error(`\n→ ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }
} catch (err) {
  console.error("✗ Query failed:", err.message ?? err);
  process.exit(3);
} finally {
  await prisma.$disconnect();
}
