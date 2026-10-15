/** The Story tab: hide or restore monologue lines, scene by scene. */
import {escapeHtml as escape} from './icons';
import type {StoryGraph,WorldEditSession} from './world-edit-session';

let graphs: StoryGraph[] = [];
let selected = '';

const speakerName = (id: string) => id.split(/[-_]/).map(part => part.charAt(0).toLocaleUpperCase('de') + part.slice(1)).join(' ');

export function storyTab(host: HTMLElement, session: WorldEditSession): void {
  const render = (message = '') => {
    const graph = graphs.find(item => item.id === selected) ?? graphs[0];
    selected = graph?.id ?? '';
    const hidden = graphs.flatMap(item => item.blocks.flatMap(block => block.lines.filter(line => line.hidden).map(line => ({graph: item, line}))));
    host.innerHTML = `<h3>Story lines</h3>
      <p class="map-note">Hide lines from a character's monologue. Players stop seeing them the next time the conversation opens. Hidden lines can be restored at any time.</p>
      <p class="map-note" role="status">${escape(message)}</p>
      ${hidden.length ? `<h4>Hidden now (${hidden.length})</h4><ul class="story-hidden">${hidden.map(({graph: item, line}) => `<li><span><b>${escape(item.questId)}</b> · ${escape(line.german || line.id)}</span><button type="button" data-line="${escape(line.id)}" data-hidden="false">Restore</button></li>`).join('')}</ul>` : ''}
      <label class="world-edit-field"><span>Scene</span><select data-story-graph>${graphs.map(item => `<option value="${escape(item.id)}"${item.id === selected ? ' selected' : ''}>${escape(item.questId)} · ${escape(item.level)}</option>`).join('')}</select></label>
      ${graph ? graph.blocks.map(block => `<section class="story-block"><h4>${escape(block.label)}</h4><ol>${block.lines.map(line => `<li class="${line.hidden ? 'hidden-line' : ''}">
          <span class="story-text"><b>${escape(speakerName(line.speaker))}</b> ${escape(line.german || '…')}${line.english ? `<span class="story-english">${escape(line.english)}</span>` : ''}</span>
          ${line.hidden ? `<button type="button" data-line="${escape(line.id)}" data-hidden="false">Restore</button>`
            : line.locked ? `<span class="story-locked" title="${escape(line.locked)}">Kept</span>`
            : `<button type="button" data-line="${escape(line.id)}" data-hidden="true">Hide</button>`}</li>`).join('')}</ol></section>`).join('') : '<p class="map-note">No story scenes are installed.</p>'}`;
  };
  host.onchange = event => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-story-graph]');
    if (select) { selected = select.value; render(); }
  };
  host.onclick = async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-line]');
    if (!button) return;
    button.disabled = true;
    try {
      const result = await session.setStoryLine(button.dataset.line!, button.dataset.hidden === 'true');
      if (result.graph) graphs = graphs.map(item => item.id === result.graph!.id ? result.graph! : item);
      render(button.dataset.hidden === 'true' ? 'Line hidden for everyone.' : 'Line restored.');
    } catch (error) { render(error instanceof Error ? error.message : 'The line could not be changed.'); }
  };
  host.innerHTML = '<p class="map-note">Loading story scenes…</p>';
  void session.storyLines().then(value => { graphs = value.graphs; render(); })
    .catch(error => { host.innerHTML = `<p class="map-note" role="alert">${escape(error instanceof Error ? error.message : 'Story lines could not be loaded.')}</p>`; });
}
