const cache = new Map();

export function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((res) => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json();
    }));
  }
  return cache.get(path);
}

export const loadDialog = (id) => loadJSON(`data/dialogs/${id}.json`);
export const loadMap = (id) => loadJSON(`data/maps/${id}.json`);

export async function loadEnemy(id) {
  const def = await loadJSON(`data/enemies/${id}.json`);
  const patterns = await Promise.all(def.patterns.map((p) => loadJSON(`data/patterns/${p}.json`)));
  return { def, patterns };
}
