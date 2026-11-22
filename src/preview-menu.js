// Development-only controls. These names select existing renderer presets;
// this module never changes their simulation or optical parameters.
export const WATER_OPTIONS = [
  ['', '默认'],
  ['detail', '水下细节 · detail'],
  ['fine', '细波 · fine'],
  ['dense', '密集细波 · dense'],
];
export function previewSelection(name) {
  return WATER_OPTIONS.some(([key]) => key === name) ? name : '';
}
export function previewUrl(href, name) {
  const url = new URL(href);
  const value = previewSelection(name);
  if (value) url.searchParams.set('waterPreview', value);
  else url.searchParams.delete('waterPreview');
  return url.href;
}
export function createPreviewMenu({levels = [], currentLevel = '', bookmarks, getState, applyWater, teleport, releaseInput}) {
  const panel = document.createElement('section');
  panel.id = 'preview-menu';
  panel.setAttribute('aria-label', 'Preview selector');
  const levelRow = levels.length > 1 ? '<label>Level<select data-level aria-label="Level"></select></label>' : '';
  panel.innerHTML = `<details open><summary>Preview <small>SELECTOR</small></summary><div class="preview-fields">${levelRow}<label>Water preset<select data-water aria-label="Water preset"></select></label><label>Location<select data-place aria-label="Location"></select></label><p data-status role="status"></p><p>Keys 1–5 switch locations directly.</p></div></details>`;
  const levelSelect = panel.querySelector('[data-level]');
  const water = panel.querySelector('[data-water]');
  const place = panel.querySelector('[data-place]');
  if (levelSelect) {
    for (const entry of levels) levelSelect.add(new Option(entry.name, entry.id));
    levelSelect.value = currentLevel;
    levelSelect.onchange = () => {
      const url = new URL(location.href);
      url.searchParams.set('level', levelSelect.value);
      url.searchParams.delete('waterPreview');
      location.href = url.href;
    };
  }
  for (const [value, label] of WATER_OPTIONS) water.add(new Option(label, value));
  bookmarks.forEach((b, i) => place.add(new Option(`${i + 1} · ${b.name}`, String(i))));
  const status = panel.querySelector('[data-status]');
  let busy = false;
  function sync() {
    const state = getState();
    water.value = previewSelection(state.water);
    place.value = String(state.region);
    water.disabled = place.disabled = busy || state.busy;
    if (levelSelect) levelSelect.disabled = busy || state.busy;
  }
  async function change(action, message) {
    if (busy) return;
    busy = true; sync(); releaseInput();
    status.textContent = 'Rebuilding renderer...';
    panel.setAttribute('aria-busy', 'true');
    try { await action(); status.textContent = message; }
    catch (error) { status.textContent = `Switch failed: ${error.message}`; }
    finally { busy = false; panel.removeAttribute('aria-busy'); sync(); document.activeElement?.blur(); }
  }
  water.onchange = () => {
    const value = water.value, label = water.selectedOptions[0].textContent;
    change(() => applyWater(value), `Switched to ${label}`);
  };
  place.onchange = () => {
    const index = Number(place.value);
    change(() => teleport(index), `Switched to ${bookmarks[index].name}`);
  };
  panel.addEventListener('focusin', releaseInput);
  // Tab and arrow keys belong to the controls while they have focus.
  panel.addEventListener('keydown', event => event.stopPropagation());
  panel.querySelector('summary').addEventListener('click', () => document.activeElement?.blur());
  document.body.append(panel);
  sync(); status.textContent = `Active: ${bookmarks[0]?.name || currentLevel}`;
  return {sync};
}
