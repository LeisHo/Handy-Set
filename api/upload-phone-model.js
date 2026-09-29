// Vercel serverless function backing the Phone Model Item Selector's
// "Import GLB" feature (main.js's own importPhoneModelFile()). Commits
// an imported .glb file into data/processed/SMARTPHONE MODELS/ in this
// repo, and keeps data/processed/SMARTPHONE MODELS/manifest.json (the
// list the client reads to populate the Item Selector) in sync with it.
//
// Why this ISN'T just api/save-settings.js's own Contents-API PUT
// pattern, reused: GitHub's Contents API (a single PUT with a base64
// `content` field) caps a file at 1MB -- every real phone GLB in this
// project (1.8-4MB) is already over that. Files this size need GitHub's
// lower-level Git Data API instead (create a blob, splice it into a new
// tree, commit that tree, move the branch ref) -- see uploadBlobToRepo()
// below for the full 5-call sequence. The manifest.json update (a small
// JSON file, well under 1MB) still uses the simple Contents-API PUT,
// exactly like save-settings.js already does, in a SEPARATE commit
// right after the GLB's own commit succeeds.
//
// Client -> server transport: the GLB's raw bytes are POSTed directly
// (Content-Type: application/octet-stream), not wrapped in a base64
// JSON field -- staying under Vercel's own ~4.5MB serverless-function
// request-body ceiling matters more here than it does for
// save-settings.js's small JSON payloads (base64-wrapping a ~4MB file
// would already exceed 4.5MB on its own before GitHub's own limits even
// enter into it). This endpoint accepts up to Vercel's own body-size
// ceiling; a larger file needs chunked upload, deliberately not built
// here per the direct 2026-09-29 decision to accept this ceiling for
// now rather than add that complexity up front.
//
// Required Vercel project environment variables (same as save-settings.js):
//   GITHUB_TOKEN            - fine-grained PAT, contents:read+write on this repo
//   DEV_PANEL_SAVE_SECRET   - shared anti-abuse token; must match the client's copy (POST only)
// Optional (defaulted below):
//   GITHUB_REPO             - "owner/repo", defaults to "LeisHo/Handy-Set"
//   GITHUB_BRANCH           - defaults to "main"
//   PHONE_MODEL_DIR         - defaults to "data/processed/SMARTPHONE MODELS"

const DEFAULT_REPO = 'LeisHo/Handy-Set';
const DEFAULT_BRANCH = 'main';
const DEFAULT_DIR = 'data/processed/SMARTPHONE MODELS';
const MANIFEST_NAME = 'manifest.json';

module.exports = async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'Method not allowed' });
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const secret = process.env.DEV_PANEL_SAVE_SECRET;
    const missing = [];
    if (!token) missing.push('GITHUB_TOKEN');
    if (req.method === 'POST' && !secret) missing.push('DEV_PANEL_SAVE_SECRET');
    if (missing.length) {
        res.status(500).json({ ok: false, error: `Server not configured - missing: ${missing.join(', ')}` });
        return;
    }
    if (req.method === 'POST' && req.headers['x-dev-panel-secret'] !== secret) {
        res.status(401).json({ ok: false, error: 'Unauthorized' });
        return;
    }

    const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
    const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const dir = process.env.PHONE_MODEL_DIR || DEFAULT_DIR;
    const manifestPath = `${dir}/${MANIFEST_NAME}`;
    const apiBase = `https://api.github.com/repos/${repo}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    const jsonHeaders = Object.assign({ 'Content-Type': 'application/json' }, headers);

    // GET returns the manifest LIVE from GitHub's Contents API, the
    // same "don't trust the static same-origin file, it only reflects
    // the last deploy" reasoning save-settings.js's own GET already
    // documents -- so a model imported moments ago shows up immediately
    // on any device/browser that asks, not just after Vercel redeploys.
    if (req.method === 'GET') {
        try {
            const manifestUrl = `${apiBase}/contents/${encodeURIComponent(manifestPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
            const getResp = await fetch(manifestUrl, { headers, cache: 'no-store' });
            if (getResp.status === 404) {
                res.status(200).json({ ok: true, manifest: null });
                return;
            }
            if (!getResp.ok) {
                const errText = await getResp.text();
                res.status(502).json({ ok: false, error: `GitHub lookup failed (${getResp.status}): ${errText}` });
                return;
            }
            const getData = await getResp.json();
            const jsonText = Buffer.from(getData.content || '', 'base64').toString('utf-8');
            res.status(200).json({ ok: true, manifest: JSON.parse(jsonText) });
        } catch (err) {
            res.status(500).json({ ok: false, error: String((err && err.message) || err) });
        }
        return;
    }

    // POST: import a new .glb.
    const filename = req.headers['x-dev-panel-model-filename'];
    if (!filename || typeof filename !== 'string' || !filename.toLowerCase().endsWith('.glb')) {
        res.status(400).json({ ok: false, error: 'Missing or invalid x-dev-panel-model-filename header (must end in .glb)' });
        return;
    }
    const displayName = req.headers['x-dev-panel-model-display-name'] || filename.replace(/\.glb$/i, '');
    const overwrite = req.headers['x-dev-panel-overwrite'] === 'true';
    const filePath = `${dir}/${filename}`;
    const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');

    // req.body is already a Buffer here -- Vercel's Node runtime parses
    // application/octet-stream bodies as a raw Buffer automatically, no
    // manual stream-reading needed.
    const fileBuffer = req.body;
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
        res.status(400).json({ ok: false, error: 'Empty or missing request body' });
        return;
    }

    try {
        // Does this file already exist? (needed both to enforce the
        // overwrite-confirmation flow and, separately, to know whether
        // this is an add or a replace for the manifest update below.)
        const existingResp = await fetch(`${apiBase}/contents/${encodedFilePath}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
        const alreadyExists = existingResp.ok;
        if (alreadyExists && !overwrite) {
            res.status(409).json({ ok: false, error: 'exists', message: `"${filename}" already exists.` });
            return;
        }

        // --- Git Data API: blob -> tree -> commit -> ref, so a file
        // over the Contents API's 1MB cap can still be committed. ---
        const refResp = await fetch(`${apiBase}/git/refs/heads/${encodeURIComponent(branch)}`, { headers });
        if (!refResp.ok) throw new Error(`Could not read branch ref (${refResp.status}): ${await refResp.text()}`);
        const refData = await refResp.json();
        const parentCommitSha = refData.object.sha;

        const parentCommitResp = await fetch(`${apiBase}/git/commits/${parentCommitSha}`, { headers });
        if (!parentCommitResp.ok) throw new Error(`Could not read parent commit (${parentCommitResp.status}): ${await parentCommitResp.text()}`);
        const parentCommitData = await parentCommitResp.json();
        const baseTreeSha = parentCommitData.tree.sha;

        const blobResp = await fetch(`${apiBase}/git/blobs`, {
            method: 'POST', headers: jsonHeaders,
            body: JSON.stringify({ content: fileBuffer.toString('base64'), encoding: 'base64' }),
        });
        if (!blobResp.ok) throw new Error(`Blob creation failed (${blobResp.status}): ${await blobResp.text()}`);
        const blobData = await blobResp.json();

        const treeResp = await fetch(`${apiBase}/git/trees`, {
            method: 'POST', headers: jsonHeaders,
            body: JSON.stringify({
                base_tree: baseTreeSha,
                tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }],
            }),
        });
        if (!treeResp.ok) throw new Error(`Tree creation failed (${treeResp.status}): ${await treeResp.text()}`);
        const treeData = await treeResp.json();

        const commitMessage = alreadyExists ? `Overwrite ${filename} via Item Selector import` : `Import ${filename} via Item Selector`;
        const commitResp = await fetch(`${apiBase}/git/commits`, {
            method: 'POST', headers: jsonHeaders,
            body: JSON.stringify({ message: commitMessage, tree: treeData.sha, parents: [parentCommitSha] }),
        });
        if (!commitResp.ok) throw new Error(`Commit creation failed (${commitResp.status}): ${await commitResp.text()}`);
        const commitData = await commitResp.json();

        const updateRefResp = await fetch(`${apiBase}/git/refs/heads/${encodeURIComponent(branch)}`, {
            method: 'PATCH', headers: jsonHeaders,
            body: JSON.stringify({ sha: commitData.sha }),
        });
        if (!updateRefResp.ok) throw new Error(`Ref update failed (${updateRefResp.status}): ${await updateRefResp.text()}`);

        // --- Manifest update: small JSON, Contents API PUT is fine. ---
        let manifest = { models: [] };
        let manifestSha;
        const manifestResp = await fetch(`${apiBase}/contents/${encodeURIComponent(manifestPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
        if (manifestResp.ok) {
            const manifestData = await manifestResp.json();
            manifestSha = manifestData.sha;
            try { manifest = JSON.parse(Buffer.from(manifestData.content || '', 'base64').toString('utf-8')); } catch (e) { manifest = { models: [] }; }
        }
        if (!Array.isArray(manifest.models)) manifest.models = [];
        const existingEntryIdx = manifest.models.findIndex((m) => m && m.file === filename);
        const entry = { file: filename, name: displayName };
        if (existingEntryIdx >= 0) manifest.models[existingEntryIdx] = entry;
        else manifest.models.push(entry);

        const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf-8').toString('base64');
        const manifestPutResp = await fetch(`${apiBase}/contents/${encodeURIComponent(manifestPath).replace(/%2F/g, '/')}`, {
            method: 'PUT', headers: jsonHeaders,
            body: JSON.stringify({
                message: `Update manifest.json for ${filename}`,
                content: manifestContent,
                branch,
                ...(manifestSha ? { sha: manifestSha } : {}),
            }),
        });
        if (!manifestPutResp.ok) throw new Error(`Manifest update failed (${manifestPutResp.status}): ${await manifestPutResp.text()}`);

        res.status(200).json({ ok: true, filename, overwritten: alreadyExists, manifest });
    } catch (err) {
        res.status(500).json({ ok: false, error: String((err && err.message) || err) });
    }
};
