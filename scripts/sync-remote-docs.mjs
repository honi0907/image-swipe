import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "remote.html");
const docsDir = path.join(root, "docs");
const dest = path.join(docsDir, "remote.html");

fs.mkdirSync(docsDir, { recursive: true });
fs.copyFileSync(src, dest);
