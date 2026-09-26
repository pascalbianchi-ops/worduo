import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Le site (GitHub Pages) et le serveur (Render) se déploient séparément :
// on affiche les deux versions pour savoir d'un coup d'œil lequel est à jour.
// Numéro à changer dans server/version.json à chaque redéploiement.
export function VersionBadge() {
    const [server, setServer] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        api<{ version?: string }>('/api/health')
            // Un serveur sans champ "version" tourne sur un code antérieur à la v1
            .then(j => { if (!cancelled) setServer(j.version ?? 'ancien') })
            .catch(() => { if (!cancelled) setServer('?') })
        return () => { cancelled = true }
    }, [])

    const serverLabel = server === null ? '…' : /^\d/.test(server) ? `v${server}` : server
    const mismatch = server !== null && server !== __APP_VERSION__

    return (
        <span
            className="version-badge"
            title={mismatch ? 'Le site et le serveur ne sont pas à la même version' : undefined}
            style={{
                fontSize: '0.8em',
                fontWeight: 600,
                opacity: .8,
                color: mismatch ? '#FBBF24' : '#cbd5e1',
                whiteSpace: 'nowrap',
            }}
        >
            v{__APP_VERSION__} · serveur {serverLabel}
        </span>
    )
}
