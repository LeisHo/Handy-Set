// Vercel serverless function backing the dev panel's Save/Sync button
// (CLAUDE.md Section 12l). Ported near-verbatim from HANDY DANDIES' own
// api/save-settings.js, itself ported from HANDO's — same mechanism, same
// env var names, only the repo/branch defaults changed to this project's
// own. POST commits the posted settings dump to
// data/processed/dev-panel-settings.json in this repo via GitHub's
// Contents API, so any device/browser sees the same saved state (not just
// the one that clicked Save). GET reads that same file back LIVE from the
// Contents API rather than the same-origin static file, which only
// reflects whatever was live at the LAST Vercel deployment.
//
// Required Vercel project environment variables (see README.md):
//   GITHUB_TOKEN            - fine-grained PAT, contents:read+write on this repo
//   DEV_PANEL_SAVE_SECRET   - shared anti-abuse token; must match the client's copy (POST only)
// Optional (defaulted below):
//   GITHUB_REPO             - "owner/repo", defaults to "LeisHo/Handy-Set"
//   GITHUB_BRANCH           - defaults to "main"
//   SETTINGS_FILE_PATH      - defaults to "data/processed/dev-panel-settings.json"

const DEFAULT_REPO = 'LeisHo/Handy-Set';
const DEFAULT_BRANCH = 'main';
const DEFAULT_PATH = 'data/processed/dev-panel-settings.json';

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
    const path = process.env.SETTINGS_FILE_PATH || DEFAULT_PATH;
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    if (req.method === 'GET') {
        try {
            const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
            if (getResp.status === 404) {
                res.status(200).json({ ok: true, settings: null });
                return;
            }
            if (!getResp.ok) {
                const errText = await getResp.text();
                res.status(502).json({ ok: false, error: `GitHub lookup failed (${getResp.status}): ${errText}` });
                return;
            }
            const getData = await getResp.json();
            const jsonText = Buffer.from(getData.content || '', 'base64').toString('utf-8');
            res.status(200).json({ ok: true, settings: JSON.parse(jsonText) });
        } catch (err) {
            res.status(500).json({ ok: false, error: String((err && err.message) || err) });
        }
        return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Body must be a JSON object' });
        return;
    }

    try {
        let sha;
        const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
        if (getResp.ok) {
            const getData = await getResp.json();
            sha = getData.sha;
        } else if (getResp.status !== 404) {
            const errText = await getResp.text();
            res.status(502).json({ ok: false, error: `GitHub lookup failed (${getResp.status}): ${errText}` });
            return;
        }

        const content = Buffer.from(JSON.stringify(body, null, 2) + '\n', 'utf-8').toString('base64');
        const putResp = await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: 'Update dev-panel-settings.json via Save Settings',
                content,
                branch,
                ...(sha ? { sha } : {}),
            }),
        });

        if (!putResp.ok) {
            const errText = await putResp.text();
            res.status(502).json({ ok: false, error: `GitHub commit failed (${putResp.status}): ${errText}` });
            return;
        }

        const putData = await putResp.json();
        res.status(200).json({ ok: true, commitSha: putData.commit && putData.commit.sha });
    } catch (err) {
        res.status(500).json({ ok: false, error: String((err && err.message) || err) });
    }
};
