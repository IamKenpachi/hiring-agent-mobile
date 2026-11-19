import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_ROOT = path.resolve(__dirname, "../../..");

const FUNCTIONAL_STYLE_PATTERN = /style=\{\s*\(/;

function collectTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }

  return results;
}

test("No .tsx files under mobile/app or mobile/src use functional style={({ ... }) callbacks", () => {
  const tsxFiles = [
    ...collectTsxFiles(path.join(MOBILE_ROOT, "app")),
    ...collectTsxFiles(path.join(MOBILE_ROOT, "src")),
  ];

  assert.ok(tsxFiles.length > 0, "Expected to find .tsx files under mobile/app and mobile/src");

  const violations = [];
  for (const filePath of tsxFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    if (FUNCTIONAL_STYLE_PATTERN.test(content)) {
      const lines = content.split(/\r?\n/);
      const matchingLines = lines
        .map((line, idx) => (FUNCTIONAL_STYLE_PATTERN.test(line) ? idx + 1 : null))
        .filter((lineNum) => lineNum !== null);
      const relPath = path.relative(MOBILE_ROOT, filePath).replace(/\\/g, "/");
      violations.push(
        matchingLines.length > 0 ? `${relPath}:${matchingLines.join(",")}` : relPath
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found functional style callbacks (dropped by NativeWind v4 on native): ${violations.join("; ")}`
  );
});

test("Bottom-pinned screens and TabsLayout consume useSafeAreaInsets", () => {
  const requiredFiles = [
    "app/(tabs)/_layout.tsx",
    "app/job/[id].tsx",
    "app/output/[id].tsx",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(MOBILE_ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `Missing expected screen file: ${relPath}`);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(
      content.includes("useSafeAreaInsets("),
      `Expected ${relPath} to call useSafeAreaInsets( for Android navigation bar clearance`
    );
  }
});
