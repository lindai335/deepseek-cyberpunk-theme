/**
 * Publish a local project to a GitHub repository through the Git Data API.
 *
 *   node publish-github.mjs --owner lindai335 --repo deepseek-cyberpunk-theme \
 *        --pat-file <file> --source C:\D界面主题 [--description "..."] [--dry-run]
 *
 * One blob per file, one tree, one commit, one ref update -> a single clean
 * commit. Every API call is retried, because the route to GitHub from this
 * network drops connections intermittently.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const owner = opt('owner');
const repo = opt('repo');
const source = opt('source');
const description = opt('description', '');
const patFile = opt('pat-file');
const dryRun = flag('dry-run');
if (!owner || !repo || !source || !patFile) {
  console.error('usage: --owner --repo --source --pat-file [--description] [--dry-run]');
  process.exit(1);
}
const PAT = readFileSync(patFile, 'utf8').trim();

/** Files and folders that stay out of the published repository. */
const EXCLUDE_DIRS = new Set(['extract', 'edge-profile', 'yaml', 'node_modules', '.git']);
const EXCLUDE_FILES = new Set([
  'palette.css', 'index.css', 'vendor.css', 'index.html', 'cookies.txt',
  '_check.png', 'demo.html',
]);

function collect(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      collect(full, acc);
    } else {
      const rel = relative(source, full).split(sep).join('/');
      if (EXCLUDE_FILES.has(rel) || EXCLUDE_FILES.has(entry.name)) continue;
      if (rel.startsWith('preview/edge-profile/')) continue;
      if (rel.endsWith('.log') || rel.endsWith('.bak')) continue;
      acc.push({ path: rel, full });
    }
  }
  return acc;
}

const files = collect(source).sort((a, b) => a.path.localeCompare(b.path));
console.log(`files to publish: ${files.length}`);
for (const f of files) console.log(`  ${f.path}  (${statSync(f.full).size} B)`);
if (dryRun) process.exit(0);

const API = 'https://api.github.com';
const HEADERS = {
  authorization: `Bearer ${PAT}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-theme-publisher',
  'x-github-api-version': '2022-11-28',
};

async function api(method, path, body) {
  const url = `${API}${path}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        method,
        headers: HEADERS,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
        err.status = res.status;
        err.json = json;
        throw err;
      }
      return json;
    } catch (error) {
      if (attempt === 5) throw error;
      const wait = attempt * 2000;
      console.log(`  ! ${method} ${path} -> ${error.message}; retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    } finally {
      clearTimeout(timer);
    }
  }
}

async function ensureRepo() {
  try {
    const info = await api('GET', `/repos/${owner}/${repo}`);
    console.log(`repo exists: ${info.html_url} (private=${info.private})`);
    return info;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const created = await api('POST', '/user/repos', {
    name: repo,
    description,
    private: false,
    has_issues: true,
    has_wiki: false,
    auto_init: false,
  });
  console.log(`repo created: ${created.html_url}`);
  return created;
}

const info = await ensureRepo();

// The Git Data API refuses to work on a repository without any commit
// (409 "Git Repository is empty."), so bootstrap one through the Contents API.
async function ensureFirstCommit() {
  const branch = info.default_branch || 'main';
  try {
    const existing = await api('GET', `/repos/${owner}/${repo}/commits?per_page=1`);
    if (Array.isArray(existing) && existing.length) return existing[0].sha;
  } catch (error) {
    // 404: no such branch, 409: repository has no commit yet
    if (error.status !== 404 && error.status !== 409) throw error;
  }
  const boot = await api('PUT', `/repos/${owner}/${repo}/contents/.gitkeep`, {
    message: 'chore: initialise repository',
    content: Buffer.from('').toString('base64'),
    branch,
  });
  console.log(`bootstrapped first commit: ${boot.commit.sha}`);
  return boot.commit.sha;
}

const firstCommit = await ensureFirstCommit();

// 1. blobs
const tree = [];
for (const file of files) {
  const content = readFileSync(file.full);
  const blob = await api('POST', `/repos/${owner}/${repo}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  });
  tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`  blob ${file.path} -> ${blob.sha.slice(0, 8)}`);
}

// 2. tree
const createdTree = await api('POST', `/repos/${owner}/${repo}/git/trees`, { tree });
console.log(`tree: ${createdTree.sha}`);

// 3. commit
const parents = [firstCommit];
try {
  const ref = await api('GET', `/repos/${owner}/${repo}/git/ref/heads/${info.default_branch || 'main'}`);
  if (ref.object.sha !== firstCommit) parents.push(ref.object.sha);
} catch (error) {
  if (error.status !== 404) throw error;
}
const commit = await api('POST', `/repos/${owner}/${repo}/git/commits`, {
  message: 'feat: DeepSeek Harness cyberpunk theme + rocket launch boot transition\n\n- cyberpunk-theme bundle: neon palette token overrides, grid canvas, scanline overlay\n- rocket-boot bundle: launch pad -> ignition -> ascent -> orbit handover animation\n- install script that syncs both bundles into a Harness profile\n',
  tree: createdTree.sha,
  parents,
});
console.log(`commit: ${commit.sha}`);

// 4. ref
try {
  await api('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${info.default_branch || 'main'}`, { sha: commit.sha, force: false });
} catch (error) {
  if (error.status !== 422 && error.status !== 404) throw error;
  await api('POST', `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${info.default_branch || 'main'}`,
    sha: commit.sha,
  });
}
console.log(`\npublished: ${info.html_url}`);
console.log(`commit url: ${commit.html_url}`);
