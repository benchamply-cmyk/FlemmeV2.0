import type { DemoState, TokenStorage } from '../../mobile/src/gateway.ts';
import { newId } from '../../mobile/src/gateway.ts';

// Équivalent navigateur de apps/mobile/src/storage.ts.
// Démo : mêmes snapshots additifs que le mobile, dans localStorage au lieu de fichiers.
const prefix = 'flemme-web-demo:';
const keep = 5; // Copies conservées quand le stockage est plein.
const snapshotKeys = (store: Storage) => {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(prefix)) keys.push(k); }
  return keys.sort().reverse(); // Clé = horodatage fixe sur 13 chiffres : le tri texte suit l’ordre chronologique.
};

export async function readDemo(store: Storage = localStorage): Promise<DemoState | null> {
  const keys = snapshotKeys(store);
  if (!keys.length) return null;
  for (const key of keys) {
    try { const state = JSON.parse(store.getItem(key) || ''); if (state.version === 1 && Array.isArray(state.tasks) && state.requests) return state; } catch { /* Tenter le snapshot précédent, sans effacer la clé. */ }
  }
  throw new Error('Les données locales sont illisibles. Elles ont été conservées ; aucune remise à zéro automatique.');
}

export async function writeDemo(state: DemoState, store: Storage = localStorage) {
  const key = prefix + Date.now() + '-' + newId(), value = JSON.stringify(state);
  try {
    store.setItem(key, value);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'QuotaExceededError')) throw e;
    // localStorage est limité (~5 Mo par site), contrairement aux fichiers du mobile : quand il est plein,
    // on garde les `keep` copies les plus récentes (de quoi revenir en arrière si la dernière est illisible) et on réessaie une fois.
    for (const old of snapshotKeys(store).slice(keep)) store.removeItem(old);
    try { store.setItem(key, value); }
    catch { throw new Error('Stockage du navigateur plein : ton action n’a pas été enregistrée.'); }
  }
}

// Le mobile garde le jeton de renouvellement dans SecureStore. Le navigateur n’a pas de coffre :
// sessionStorage limite son exposition à l’onglet ouvert (reconnexion après fermeture).
const tokenKey = 'flemme-web-refresh';
export const tokens: TokenStorage = {
  get: async () => sessionStorage.getItem(tokenKey),
  set: async value => sessionStorage.setItem(tokenKey, value),
  clear: async () => sessionStorage.removeItem(tokenKey),
};
