import * as FS from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import type { DemoState } from './gateway';
import { newId } from './gateway';

const directory = FS.documentDirectory + 'flemme-mobile-demo/';
// Snapshots additifs : une mutation crée un nouveau fichier ; aucune ancienne donnée supprimée.
export async function readDemo(): Promise<DemoState | null> {
  await FS.makeDirectoryAsync(directory, { intermediates: true });
  const files = (await FS.readDirectoryAsync(directory)).filter(n => n.endsWith('.json')).sort().reverse();
  if (!files.length) return null;
  for (const file of files) {
    try { const state = JSON.parse(await FS.readAsStringAsync(directory + file)); if (state.version === 1 && Array.isArray(state.tasks) && state.requests) return state; } catch { /* Tenter le snapshot précédent, sans effacer le fichier. */ }
  }
  throw new Error('Les données locales sont illisibles. Elles ont été conservées ; aucune remise à zéro automatique.');
}
export async function writeDemo(state: DemoState) {
  await FS.makeDirectoryAsync(directory, { intermediates: true });
  await FS.writeAsStringAsync(directory + Date.now() + '-' + newId() + '.json', JSON.stringify(state));
}
export const tokens = {
  get: () => SecureStore.getItemAsync('flemme-mobile-refresh'),
  set: (value: string) => SecureStore.setItemAsync('flemme-mobile-refresh', value),
  clear: () => SecureStore.deleteItemAsync('flemme-mobile-refresh'),
};
