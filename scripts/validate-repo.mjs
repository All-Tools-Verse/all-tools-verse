import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

const toolsDocument = JSON.parse(await read("data/tools.json"));
const categoriesDocument = JSON.parse(await read("data/categories.json"));
const tools = toolsDocument.tools;
const categories = categoriesDocument.categories;

assert(Array.isArray(tools) && tools.length >= 1000, `Expected at least 1,000 tools; found ${tools?.length ?? 0}`);
assert(Array.isArray(categories) && categories.length >= 20, `Expected the public taxonomy; found ${categories?.length ?? 0} categories`);
assert(toolsDocument.canonicalOnly === true, "tools.json must contain canonical tool URLs only");
assert(
  toolsDocument.canonicalSource === "https://alltoolsverse.com/sitemap_index.xml",
  "tools.json must identify the canonical sitemap source",
);
assert(Number.isInteger(toolsDocument.sourceToolPosts), "tools.json must record the source tool-post count");
assert(
  Number.isInteger(toolsDocument.excludedNonCanonicalTools),
  "tools.json must record the number of excluded non-canonical tools",
);
assert(
  toolsDocument.sourceToolPosts === tools.length + toolsDocument.excludedNonCanonicalTools,
  "Canonical and excluded tool counts must reconcile with the source API count",
);
assert(toolsDocument.totalTools === tools.length, "tools.json totalTools does not match the inventory length");
assert(categoriesDocument.totalCategories === categories.length, "categories.json totalCategories does not match the taxonomy length");
assert(
  categories.every((category) => !Object.hasOwn(category, "description")),
  "categories.json must contain normalized taxonomy fields only",
);

for (const key of ["id", "slug", "url"]) {
  const values = tools.map((tool) => tool[key]);
  assert(new Set(values).size === values.length, `Duplicate tool ${key} detected`);
}

const categorySlugs = new Set(categories.map((category) => category.slug));
for (const tool of tools) {
  assert(Number.isInteger(tool.id), `Invalid ID for ${tool.slug}`);
  assert(tool.name && tool.slug, `Missing name or slug for tool ID ${tool.id}`);
  assert(/^https:\/\/alltoolsverse\.com\/tools\/[a-z0-9-]+\/$/.test(tool.url), `Unexpected tool URL: ${tool.url}`);
  assert(Array.isArray(tool.categories) && tool.categories.length > 0, `Missing categories for ${tool.slug}`);
  for (const category of tool.categories) assert(categorySlugs.has(category), `Unknown category ${category} on ${tool.slug}`);
}

const csvRows = parseCsv(await read("data/tools.csv"));
assert(csvRows.length === tools.length + 1, `CSV row count ${csvRows.length - 1} does not match ${tools.length} tools`);
assert(csvRows[0].join(",") === "id,name,slug,url,categories,modified", "Unexpected CSV header");

for (const category of categories) {
  const content = await read(`catalog/${category.slug}.md`);
  const expected = tools.filter((tool) => tool.categories.includes(category.slug)).length;
  const actual = content.split("\n").filter((line) => line.startsWith("- [")).length;
  assert(actual === expected, `${category.slug}.md has ${actual} links; expected ${expected}`);
  assert(category.generatedCount === expected, `Generated category count mismatch for ${category.slug}`);
}

const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CHANGELOG.md",
  "assets/all-tools-verse-icon.png",
  "assets/all-tools-verse-logo.png",
  "assets/all-tools-verse-logo-dark.png",
  "assets/github-social-preview.png",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/broken-link.yml",
  ".github/ISSUE_TEMPLATE/tool-suggestion.yml",
  ".github/workflows/validate.yml",
  ".github/workflows/refresh-catalog.yml",
];
for (const file of requiredFiles) {
  await fs.access(path.join(root, file)).catch(() => {
    throw new Error(`Missing required repository file: ${file}`);
  });
}

const markdownFiles = [];
async function collectMarkdown(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectMarkdown(fullPath);
    else if (entry.name.endsWith(".md")) markdownFiles.push(fullPath);
  }
}
await collectMarkdown(root);

const typographicDash = /[\u2013\u2014]/;
for (const file of markdownFiles) {
  const content = await fs.readFile(file, "utf8");
  const relative = path.relative(root, file);
  assert(!typographicDash.test(content), `Typographic dash found in ${relative}`);

  const links = [...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    const target = link.split("#", 1)[0].split("?", 1)[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target) || target.startsWith("../../issues/")) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    assert(resolved.startsWith(root), `Relative link escapes the repository in ${relative}: ${link}`);
    await fs.access(resolved).catch(() => {
      throw new Error(`Broken relative link in ${relative}: ${link}`);
    });
  }
}

assert(!typographicDash.test(await read("scripts/sync-tools.mjs")), "Typographic dash found in the catalog generator");

const readme = await read("README.md");
assert(
  readme.includes(`${tools.length.toLocaleString("en-US")} canonical live tools`),
  "README canonical statistics are out of sync",
);
assert(
  readme.includes('<source media="(prefers-color-scheme: dark)" srcset="assets/all-tools-verse-logo-dark.png">'),
  "README is missing the dark-mode logo source",
);
assert(!readme.includes("Run `npm run sync` to generate"), "README category placeholder was not replaced");

console.log(`Validation passed: ${tools.length} unique tools, ${categories.length} categories, ${markdownFiles.length} Markdown files.`);
