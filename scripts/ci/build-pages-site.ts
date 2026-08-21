export type ProductionBrowserConfig = Readonly<{
  environment: "production";
  url: string;
  publishableKey: string;
}>;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const forbiddenKeyMarkers = [
  "service_role",
  "sb_secret_",
  "secret",
  "password",
  "access_token",
  "refresh_token",
  "jwt_signing",
  "postgres://",
  "postgresql://",
];
const runtimeFilename = "supabase-runtime-config.js";
const sourceRoots = ["css", "js", "pages"];
const sourceFiles = ["CNAME", "index.html"];

function fail(message: string): never {
  throw new Error(`Pages runtime configuration rejected: ${message}`);
}

function decodeJwtPart(part: string): Record<string, unknown> | null {
  try {
    const base64 = part.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isBrowserPublishableKey(value: string): boolean {
  const normalized = value.toLowerCase();
  if (forbiddenKeyMarkers.some((marker) => normalized.includes(marker))) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return true;

  const parts = value.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || parts[2].length < 20) {
    return false;
  }
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  return header?.alg === "HS256" && header?.typ === "JWT" &&
    payload?.iss === "supabase" && payload?.role === "anon" &&
    Number.isInteger(payload?.iat) && Number.isInteger(payload?.exp) &&
    Number(payload?.exp) > Number(payload?.iat) &&
    Number(payload?.exp) > Math.floor(Date.now() / 1000);
}

export function validateProductionConfig(
  rawUrl: string | undefined,
  rawPublishableKey: string | undefined,
): ProductionBrowserConfig {
  const urlValue = rawUrl?.trim() ?? "";
  const publishableKey = rawPublishableKey?.trim() ?? "";
  if (!urlValue) fail("BCI_SUPABASE_URL is required");
  if (!publishableKey) fail("BCI_SUPABASE_PUBLISHABLE_KEY is required");

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail("BCI_SUPABASE_URL must be an absolute URL");
  }
  if (url.protocol !== "https:") fail("BCI_SUPABASE_URL must use HTTPS");
  if (loopbackHosts.has(url.hostname.toLowerCase())) fail("BCI_SUPABASE_URL must not be loopback");
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    fail("BCI_SUPABASE_URL must be a credential-free origin");
  }
  if (!isBrowserPublishableKey(publishableKey)) {
    fail("BCI_SUPABASE_PUBLISHABLE_KEY must be a browser-safe publishable or legacy anon key");
  }

  return Object.freeze({
    environment: "production",
    url: url.origin,
    publishableKey,
  });
}

export function renderRuntimeConfig(config: ProductionBrowserConfig): string {
  const rendered = `window.__BLOODCONNECT_SUPABASE_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
  const normalized = rendered.toLowerCase();
  for (const forbidden of ["service_role", "sb_secret_", "postgres://", "postgresql://", "access_token", "refresh_token", "jwt_signing_secret"]) {
    if (normalized.includes(forbidden)) fail(`generated runtime file contains forbidden material: ${forbidden}`);
  }
  return rendered;
}

export function injectRuntimeConfig(html: string, path: string): string {
  const clientPattern = /<script src="([^"<>]*\/)?js\/supabase\.js"><\/script>/g;
  const boundaryPattern = /<script src="([^"<>]*\/)?js\/supabase-config\.js"><\/script>/g;
  const clients = [...html.matchAll(clientPattern)];
  if (!clients.length) return html;
  if (clients.length !== 1) fail(`${path} must initialize the Supabase client exactly once`);
  if (html.includes(runtimeFilename)) fail(`${path} already contains a runtime configuration script`);

  const boundaries = [...html.matchAll(boundaryPattern)];
  if (boundaries.length !== 1) fail(`${path} must load the Supabase configuration boundary exactly once`);
  const boundary = boundaries[0];
  const client = clients[0];
  if ((boundary.index ?? -1) >= (client.index ?? -1)) fail(`${path} loads the client before its configuration boundary`);
  const prefix = boundary[1] ?? "";
  const runtimeTag = `<script src="${prefix}js/${runtimeFilename}"></script>`;
  const boundaryEnd = (boundary.index ?? 0) + boundary[0].length;
  return `${html.slice(0, boundaryEnd)}${runtimeTag}${html.slice(boundaryEnd)}`;
}

async function copyTree(source: string, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  const entries = [];
  for await (const entry of Deno.readDir(source)) entries.push(entry);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const from = `${source}/${entry.name}`;
    const to = `${destination}/${entry.name}`;
    if (entry.isSymlink) fail(`symlinks are not allowed in the Pages artifact: ${from}`);
    if (entry.isDirectory) await copyTree(from, to);
    else if (entry.isFile) await Deno.copyFile(from, to);
  }
}

async function htmlFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = [];
    for await (const entry of Deno.readDir(directory)) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile && entry.name.endsWith(".html")) found.push(path);
    }
  }
  await visit(root);
  return found;
}

export async function buildPagesSite(outputDirectory: string, config: ProductionBrowserConfig): Promise<number> {
  try {
    await Deno.lstat(outputDirectory);
    fail(`output directory already exists: ${outputDirectory}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  if (await (async () => {
    try {
      await Deno.lstat(`js/${runtimeFilename}`);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  })()) fail(`${runtimeFilename} must be generated, not committed`);

  await Deno.mkdir(outputDirectory, { recursive: false });
  for (const file of sourceFiles) await Deno.copyFile(file, `${outputDirectory}/${file}`);
  for (const directory of sourceRoots) await copyTree(directory, `${outputDirectory}/${directory}`);
  await Deno.writeTextFile(`${outputDirectory}/js/${runtimeFilename}`, renderRuntimeConfig(config), { createNew: true });

  let injectedPages = 0;
  for (const path of await htmlFiles(outputDirectory)) {
    const source = await Deno.readTextFile(path);
    const injected = injectRuntimeConfig(source, path);
    if (injected !== source) {
      injectedPages++;
      await Deno.writeTextFile(path, injected);
    }
  }
  if (!injectedPages) fail("no Supabase-enabled pages were found");
  return injectedPages;
}

if (import.meta.main) {
  const outputDirectory = Deno.args[0];
  if (!outputDirectory || Deno.args.length !== 1) fail("usage: build-pages-site.ts <new-output-directory>");
  const config = validateProductionConfig(
    Deno.env.get("BCI_SUPABASE_URL"),
    Deno.env.get("BCI_SUPABASE_PUBLISHABLE_KEY"),
  );
  const count = await buildPagesSite(outputDirectory, config);
  console.log(`Pages artifact generated with runtime configuration for ${count} Supabase-enabled pages.`);
}
