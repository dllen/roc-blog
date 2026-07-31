#!/usr/bin/env node
// Audit frontmatter across content directory. Writes report to _audit/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { auditDirectory, formatReport } from './lib/audit-frontmatter.mjs';

const args = process.argv.slice(2);
let contentDir = 'content/blog';
let outDir = '_audit';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outDir = args[++i]; }
  else if (!args[i].startsWith('-')) { contentDir = args[i]; }
}

const absContent = resolve(contentDir);
const absOut = resolve(outDir);
mkdirSync(absOut, { recursive: true });

const result = auditDirectory(absContent);
const report = formatReport(result);
const reportPath = join(absOut, 'frontmatter-audit.md');
writeFileSync(reportPath, report, 'utf8');

console.log(`[audit] total=${result.totalFiles} missing=${result.atLeastOneMissing} → ${reportPath}`);

// Exit 0 on no missing, exit 1 if any required missing (for CI to detect)
const hasMissing = result.atLeastOneMissing > 0;
process.exit(hasMissing ? 1 : 0);
