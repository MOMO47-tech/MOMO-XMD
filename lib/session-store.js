'use strict';

const fs = require('fs');
const path = require('path');

const getConfig = () => ({
    url: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '')
});

const configured = () => {
    const { url, key } = getConfig();
    return Boolean(url && key);
};

const headers = () => {
    const { key } = getConfig();
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
    };
};

const endpoint = () => {
    const { url } = getConfig();
    return `${url}/rest/v1/whatsapp_sessions`;
};

function collectFiles(rootDir, currentDir = rootDir, result = {}) {
    if (!fs.existsSync(currentDir)) return result;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) collectFiles(rootDir, fullPath, result);
        else if (entry.isFile()) {
            const relative = path.relative(rootDir, fullPath).split(path.sep).join('/');
            result[relative] = fs.readFileSync(fullPath).toString('base64');
        }
    }
    return result;
}

function restoreFiles(rootDir, files) {
    for (const [relative, base64] of Object.entries(files || {})) {
        const safeRelative = String(relative).replaceAll('\\', '/');
        if (!safeRelative || safeRelative.startsWith('/') || safeRelative.split('/').includes('..')) continue;
        const destination = path.join(rootDir, safeRelative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, Buffer.from(String(base64), 'base64'));
    }
}

async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}

async function saveSession(sessionKey, authDir) {
    if (!configured()) return false;
    const files = collectFiles(authDir);
    await request(endpoint(), {
        method: 'POST',
        body: JSON.stringify({ session_key: sessionKey, session_data: files, updated_at: new Date().toISOString() })
    });
    return true;
}

async function restoreSession(sessionKey, authDir) {
    if (!configured() || !sessionKey) return false;
    const rows = await request(`${endpoint()}?session_key=eq.${encodeURIComponent(sessionKey)}&select=session_data&limit=1`, { method: 'GET' });
    const files = rows?.[0]?.session_data;
    if (!files || typeof files !== 'object') return false;
    restoreFiles(authDir, files);
    return Boolean(fs.existsSync(path.join(authDir, 'creds.json')));
}

async function listSessions() {
    if (!configured()) return [];
    const rows = await request(`${endpoint()}?select=session_key&order=updated_at.desc`, { method: 'GET' });
    return Array.isArray(rows) ? rows.map(row => row.session_key).filter(Boolean) : [];
}

module.exports = { configured, saveSession, restoreSession, listSessions };
