// make.fun entry: validate POST.json, then hand it to the gate.
//
// Reads POST.json from MAKEFUN_BOT_DIR (default /bot), checks that it names an X/Twitter status post,
// and copies it unchanged to MAKEFUN_OUTPUT_DIR (default /output)/POST.json. Any problem → stderr + exit 1.
//
// Local run:
//   mkdir -p /tmp/mf-out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=/tmp/mf-out node main.ts

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir: string = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const sourcePath: string = join(botDir, 'POST.json');
const targetPath: string = join(outputDir, 'POST.json');

const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['x.com', 'twitter.com']);
const STATUS_PATH = /\/status\/(\d+)(?:\/|$)/;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Returns the post id if `raw` is an X/Twitter status URL, otherwise exits with a reason. */
function extractPostId(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`"url" is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    fail(`"url" must use http(s), got ${parsed.protocol} in ${raw}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    fail(`"url" host must be x.com or twitter.com, got ${host}`);
  }
  const match = STATUS_PATH.exec(parsed.pathname);
  if (match === null) {
    fail(`"url" path must contain /status/<digits>, got ${parsed.pathname}`);
  }
  return match[1];
}

// 1. Read and validate the source before touching the output dir.
// Keep the raw bytes: they are what gets validated, and later what the output must match.
let sourceBytes: Buffer;
try {
  sourceBytes = readFileSync(sourcePath);
} catch (err) {
  fail(`cannot read ${sourcePath}: ${describe(err)}`);
}
const sourceText: string = sourceBytes.toString('utf8');

let post: unknown;
try {
  post = JSON.parse(sourceText);
} catch (err) {
  fail(`${sourcePath} is not valid JSON: ${describe(err)}`);
}

if (typeof post !== 'object' || post === null || Array.isArray(post)) {
  fail(`${sourcePath} must hold a JSON object`);
}
const url: unknown = (post as Record<string, unknown>).url;
if (typeof url !== 'string') {
  fail(`${sourcePath} must have a string field "url"`);
}
const postId = extractPostId(url);

// 2. Copy it, byte for byte, to where the gate reads it.
try {
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(sourcePath, targetPath);
} catch (err) {
  fail(`cannot copy ${sourcePath} to ${targetPath}: ${describe(err)}`);
}

// 3. Verify: the file the gate will read must be exactly the bytes we validated above.
let copiedBytes: Buffer;
try {
  copiedBytes = readFileSync(targetPath);
} catch (err) {
  fail(`cannot re-read ${targetPath} after copying: ${describe(err)}`);
}
if (!copiedBytes.equals(sourceBytes)) {
  fail(
    `${targetPath} does not match the validated source ` +
      `(${copiedBytes.length} bytes written vs ${sourceBytes.length} validated)`,
  );
}

console.log(`POST.json copied to ${targetPath} (post id ${postId})`);
