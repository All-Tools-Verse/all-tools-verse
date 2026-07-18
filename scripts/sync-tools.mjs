import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = "https://alltoolsverse.com/wp-json/wp/v2";
const sourceUrl = "https://alltoolsverse.com/tools/";
const sitemapIndexUrl = "https://alltoolsverse.com/sitemap_index.xml";
const generatedDate = new Date().toISOString().slice(0, 10);

const categoryNameOverrides = new Map([
  ["ascii", "ASCII"],
  ["binary", "Binary"],
  ["conversion", "Conversion"],
  ["csv", "CSV"],
  ["developer", "Developer"],
  ["document", "Document"],
  ["financial", "Financial"],
  ["fractals", "Fractals"],
  ["generators", "Generators"],
  ["health", "Health"],
  ["hex", "Hex"],
  ["image", "Image"],
  ["json", "JSON"],
  ["marketing", "Marketing"],
  ["math", "Math"],
  ["number", "Number"],
  ["security", "Security"],
  ["seo", "SEO"],
  ["text", "Text"],
  ["time", "Time & Date"],
  ["unicode", "Unicode"],
  ["utf8", "UTF-8"],
  ["webp", "WebP"],
]);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AllToolsVerse-GitHub-Directory/1.0 (+https://alltoolsverse.com/)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { data: await response.json(), headers: response.headers };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "AllToolsVerse-GitHub-Directory/1.0 (+https://alltoolsverse.com/)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function extractSitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&").trim());
}

async function fetchCanonicalToolUrls() {
  const sitemapIndex = await fetchText(sitemapIndexUrl);
  const toolSitemaps = extractSitemapLocations(sitemapIndex).filter((url) => {
    const parsed = new URL(url);
    return parsed.origin === "https://alltoolsverse.com" && /^\/tool-sitemap\d*\.xml$/.test(parsed.pathname);
  });
  if (!toolSitemaps.length) throw new Error("No tool sitemap found in the sitemap index");

  const sitemapDocuments = await Promise.all(toolSitemaps.map((url) => fetchText(url)));
  const canonicalUrls = new Set(
    sitemapDocuments
      .flatMap((xml) => extractSitemapLocations(xml))
      .filter((url) => /^https:\/\/alltoolsverse\.com\/tools\/[a-z0-9-]+\/$/.test(url)),
  );
  if (!canonicalUrls.size) throw new Error("The tool sitemap contains no canonical tool URLs");
  return canonicalUrls;
}

async function fetchTools() {
  const fields = "id,slug,link,title,tool_category,modified_gmt";
  const firstUrl = `${apiRoot}/tool?per_page=100&page=1&_fields=${fields}`;
  const first = await fetchJson(firstUrl);
  const totalPages = Number(first.headers.get("x-wp-totalpages") || 1);
  const pages = [first.data];

  for (let start = 2; start <= totalPages; start += 3) {
    const batch = [];
    for (let page = start; page < Math.min(start + 3, totalPages + 1); page += 1) {
      batch.push(fetchJson(`${apiRoot}/tool?per_page=100&page=${page}&_fields=${fields}`));
    }
    pages.push(...(await Promise.all(batch)).map((result) => result.data));
  }

  return pages.flat();
}

async function fetchCategories() {
  const fields = "id,name,slug,count,link,parent";
  const result = await fetchJson(`${apiRoot}/tool_category?per_page=100&hide_empty=false&_fields=${fields}`);
  return result.data;
}

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "-",
    nbsp: " ",
    ndash: "-",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };

  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownText(value) {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function csvValue(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function replaceSection(content, name, replacement) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(content)) throw new Error(`Missing README section markers for ${name}`);
  return content.replace(pattern, `${start}\n${replacement}\n${end}`);
}

async function writeFile(relativePath, content) {
  const outputPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

const rawCategories = await fetchCategories();
const categoryById = new Map();
const categories = rawCategories
  .map((category) => {
    const normalized = {
      id: Number(category.id),
      name: categoryNameOverrides.get(category.slug) ?? decodeHtml(category.name),
      slug: category.slug,
      apiCount: Number(category.count),
      url: category.link,
      parent: Number(category.parent || 0),
    };
    categoryById.set(normalized.id, normalized);
    return normalized;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const rawTools = await fetchTools();
const sourceTools = rawTools
  .map((tool) => {
    const assigned = tool.tool_category.map((id) => categoryById.get(Number(id))).filter(Boolean);
    if (!assigned.length) throw new Error(`Tool ${tool.slug} has no recognized category`);
    return {
      id: Number(tool.id),
      name: decodeHtml(tool.title?.rendered),
      slug: tool.slug,
      url: tool.link,
      categories: assigned.map((category) => category.slug).sort(),
      modified: tool.modified_gmt ? `${tool.modified_gmt}Z` : null,
    };
  });

const canonicalToolUrls = await fetchCanonicalToolUrls();
const sourceToolUrls = new Set(sourceTools.map((tool) => tool.url));
const sitemapUrlsMissingFromApi = [...canonicalToolUrls].filter((url) => !sourceToolUrls.has(url));
if (sitemapUrlsMissingFromApi.length) {
  throw new Error(`Canonical sitemap URLs missing from the API: ${sitemapUrlsMissingFromApi.join(", ")}`);
}

const excludedNonCanonicalTools = sourceTools.filter((tool) => !canonicalToolUrls.has(tool.url));
const tools = sourceTools
  .filter((tool) => canonicalToolUrls.has(tool.url))
  .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

const uniqueIds = new Set(tools.map((tool) => tool.id));
const uniqueSlugs = new Set(tools.map((tool) => tool.slug));
const uniqueUrls = new Set(tools.map((tool) => tool.url));
if (uniqueIds.size !== tools.length || uniqueSlugs.size !== tools.length || uniqueUrls.size !== tools.length) {
  throw new Error("Duplicate tool ID, slug or URL returned by the API");
}

const categoryRecords = categories.map((category) => {
  const matchingTools = tools.filter((tool) => tool.categories.includes(category.slug));
  return { ...category, generatedCount: matchingTools.length };
});

await writeFile(
  "data/tools.json",
  JSON.stringify(
    {
      generatedAt: generatedDate,
      source: sourceUrl,
      canonicalOnly: true,
      canonicalSource: sitemapIndexUrl,
      sourceToolPosts: sourceTools.length,
      excludedNonCanonicalTools: excludedNonCanonicalTools.length,
      totalTools: tools.length,
      totalCategories: categories.length,
      tools,
    },
    null,
    2,
  ),
);

await writeFile(
  "data/categories.json",
  JSON.stringify(
    {
      generatedAt: generatedDate,
      source: `${apiRoot}/tool_category`,
      totalCategories: categoryRecords.length,
      categories: categoryRecords,
    },
    null,
    2,
  ),
);

const csvRows = [
  ["id", "name", "slug", "url", "categories", "modified"],
  ...tools.map((tool) => [tool.id, tool.name, tool.slug, tool.url, tool.categories, tool.modified ?? ""]),
];
await writeFile("data/tools.csv", csvRows.map((row) => row.map(csvValue).join(",")).join("\n"));

await fs.mkdir(path.join(root, "catalog"), { recursive: true });
const catalogFiles = await fs.readdir(path.join(root, "catalog"));
for (const file of catalogFiles) {
  if (file.endsWith(".md") && file !== "README.md" && !categories.some((category) => `${category.slug}.md` === file)) {
    await fs.unlink(path.join(root, "catalog", file));
  }
}

for (const category of categoryRecords) {
  const matchingTools = tools.filter((tool) => tool.categories.includes(category.slug));
  const lines = [
    `# ${category.name} tools`,
    "",
    `${matchingTools.length} free browser-based tools in the ${category.name} category.`,
    "",
    `[Browse this category on All Tools Verse](${category.url}) · [Back to the category directory](README.md)`,
    "",
    `> Generated from the live All Tools Verse API on ${generatedDate}. Do not edit this list manually.`,
    "",
    ...matchingTools.map((tool) => `- [${markdownText(tool.name)}](${tool.url})`),
  ];
  await writeFile(`catalog/${category.slug}.md`, lines.join("\n"));
}

const categoryTable = [
  "| Category | Tools | Live category |",
  "|---|---:|---|",
  ...categoryRecords.map(
    (category) => `| [${category.name}](catalog/${category.slug}.md) | ${category.generatedCount} | [Open](${category.url}) |`,
  ),
].join("\n");

const catalogIndex = [
  "# Tool categories",
  "",
  `The directory currently contains **${tools.length.toLocaleString("en-US")} canonical live tools** across **${categories.length} categories**. Tools assigned to more than one category appear on each relevant category page.`,
  "",
  `[Browse the complete live library](${sourceUrl}) · [Back to the repository README](../README.md)`,
  "",
  `> Generated from the live All Tools Verse API on ${generatedDate}.`,
  "",
  categoryTable.replaceAll("catalog/", ""),
].join("\n");
await writeFile("catalog/README.md", catalogIndex);

const readmePath = path.join(root, "README.md");
let readme = await fs.readFile(readmePath, "utf8");
readme = replaceSection(
  readme,
  "CATALOG_STATS",
  `**${tools.length.toLocaleString("en-US")} canonical live tools across ${categories.length} categories** · Catalog refreshed ${generatedDate}`,
);
readme = replaceSection(readme, "CATEGORIES", categoryTable);
await fs.writeFile(readmePath, readme, "utf8");

console.log(
  `Generated ${tools.length} canonical tools across ${categories.length} categories; excluded ${excludedNonCanonicalTools.length} non-canonical aliases.`,
);
