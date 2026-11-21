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
export function createPreviewMenu({bookmarks, getState, applyWater, teleport, releaseInput}) {
  const panel = document.createElement('section');
  panel.id = 'preview-menu';
  panel.setAttribute('aria-label', '预览选择器');
  panel.innerHTML = '<details open><summary>预览选择器 <small>PREVIEW</small></summary><div class="preview-fields"><label>水波方案<select aria-label="水波方案"></select></label><label>机位/位置<select aria-label="机位/位置"></select></label><p data-status role="status"></p><p>位置快捷键 1–5 保留。方案切换重建水面，保留当前机位。</p></div></details>';
  const [water, place] = panel.querySelectorAll('select');
  for (const [value, label] of WATER_OPTIONS) water.add(new Option(label, value));
  bookmarks.forEach((b, i) => place.add(new Option(`${i + 1} · ${b.name}`, String(i))));
  const status = panel.querySelector('[data-status]');
  let busy = false;
  function sync() {
    const state = getState();
    water.value = previewSelection(state.water);
    place.value = String(state.region);
    water.disabled = place.disabled = busy || state.busy;
  }
  async function change(action, message) {
    if (busy) return;
    busy = true; sync(); releaseInput();
    status.textContent = '正在切换并重建渲染器…';
    panel.setAttribute('aria-busy', 'true');
    try { await action(); status.textContent = message; }
    catch (error) { status.textContent = `切换失败：${error.message}`; }
    finally { busy = false; panel.removeAttribute('aria-busy'); sync(); document.activeElement?.blur(); }
  }
  water.onchange = () => {
    const value = water.value, label = water.selectedOptions[0].textContent;
    change(() => applyWater(value), `已切换到 ${label}`);
  };
  place.onchange = () => {
    const index = Number(place.value);
    change(() => teleport(index), `已切换到 ${bookmarks[index].name}`);
  };
  panel.addEventListener('focusin', releaseInput);
  // Tab and arrow keys belong to the controls while they have focus.
  panel.addEventListener('keydown', event => event.stopPropagation());
  panel.querySelector('summary').addEventListener('click', () => document.activeElement?.blur());
  document.body.append(panel);
  sync(); status.textContent = `当前方案：${water.selectedOptions[0].textContent}`;
  return {sync};
}
