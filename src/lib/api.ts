// src/lib/api.ts
import { getCurrentServerUrl } from './socket';

function normalizeBase(u: string) {
    return (u || '').trim().replace(/\/+$/, '');
}
function join(base: string, path: string) {
    return `${normalizeBase(base)}/${String(path).replace(/^\/+/, '')}`;
}

// Même serveur que le socket (localStorage > VITE_SOCKET_URL/VITE_SERVER_URL >
// origine courante) : indispensable quand le front est servi ailleurs que le
// backend (GitHub Pages → Render), sinon les requêtes partent vers la page.
export function getApiBase(): string {
    return normalizeBase(getCurrentServerUrl());
}

// Appel JSON robuste (échoue clairement si le serveur renvoie du HTML)
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const url = join(getApiBase(), path); // ← TOUJOURS URL absolue cohérente avec le socket
    const res = await fetch(url, { cache: 'no-store', ...init });

    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} on ${url} – ${txt.slice(0, 120)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Expected JSON from ${url}, got "${ct}". Body: ${txt.slice(0, 120)}`);
    }
    return res.json() as Promise<T>;
}
