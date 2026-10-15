/**
 * The Story mode of the map editor: the whole story as a readable script.
 *
 * Left, the outline of acts and scenes in play order with each scene's new
 * words against the pace. Centre, the scene as a screenplay: its lines, the
 * task, the decision and its branches, with lines that depend on earlier
 * decisions marked. Right, the inspector: the selected line's words, and the
 * editor that rewrites, hides or restores it for every player.
 *
 * Keys: ↑/↓ or J/K pick a line, [ and ] change scene, Enter edits, H hides or
 * restores, / searches, Esc steps back. ⌘/Ctrl+Enter saves an edit.
 */
import './story-editor.css';
import {escapeHtml as escape,icon} from './icons';
import {
  blockTitle,checkLine,conditionOnPath,courseScenes,describeCondition,describeEffect,firstAppearances,flagSources,languageName,
  lineChanged,NEW_WORD_BUDGET,newWordsByScene,readingOrder,sceneChanges,searchStory,shown,speakerName,storySpellings,wordReport,
  type FlagSource,type StoryBlock,type StoryLine,type StoryListing,type StoryPath,type StoryScene,type StoryText,type WordReport,
} from './admin-story-model';
import type {StoryDraftCheck,StoryLineChange,WorldEditSession} from './world-edit-session';

export interface StoryTabHooks {
  /** Switch to the map and select a story character there. */
  showOnMap?(npcId: string): boolean;
}

interface Draft { lineId: string; text: string; translations: Record<string, string>; check?: StoryDraftCheck; checked?: string; }
interface Notice { text: string; tone: 'ok' | 'error'; undo?: {lineId: string; change: StoryLineChange}; }
interface Derived { scenes: StoryScene[]; first: Map<string, number>; fresh: string[][]; sources: Map<string, FlagSource[]>; spellings: Set<string>; }

const PREFS_KEY = 'atlas.storyEditor';
const statusText: Record<WordReport['status'], string> = {known: 'taught earlier', new: 'new in this scene', earlier: 'moved earlier', fresh: 'new to the story', unlisted: 'not in the lexicon'};
const controllers = new WeakMap<HTMLElement, StoryEditor>();

export function storyTab(host: HTMLElement, session: WorldEditSession, hooks: StoryTabHooks = {}): void {
  const existing = controllers.get(host);
  if (existing) { existing.hooks = hooks; existing.render(); return; }
  controllers.set(host, new StoryEditor(host, session, hooks));
}

function readPrefs(): {courseId?: string; scene?: number; path?: StoryPath} {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

class StoryEditor {
  private listing?: StoryListing;
  private derived?: Derived;
  private courseId = '';
  private scene = 0;
  private line?: string;
  private query = '';
  private changedOnly = false;
  private path: StoryPath = {};
  private draft?: Draft;
  private notice?: Notice;
  private busy = false;
  private checkTimer = 0;
  private checkRun = 0;

  constructor(private readonly host: HTMLElement, private readonly session: WorldEditSession, public hooks: StoryTabHooks) {
    const prefs = readPrefs();
    this.courseId = prefs.courseId ?? ''; this.scene = prefs.scene ?? 0; this.path = prefs.path ?? {};
    host.innerHTML = '<div class="st"><p class="st-loading">Loading the story…</p></div>';
    host.addEventListener('click', event => this.click(event));
    host.addEventListener('dblclick', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
      if (row && !(event.target as HTMLElement).closest('button')) this.edit(row.dataset.line!);
    });
    host.addEventListener('input', event => this.input(event));
    host.addEventListener('change', event => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-course]');
      if (select) { this.courseId = select.value; this.scene = 0; this.line = undefined; this.draft = undefined; this.derive(); this.save(); this.render(); }
    });
    host.addEventListener('submit', event => { event.preventDefault(); void this.commit(); });
    const keydown = (event: KeyboardEvent) => {
      if (!host.isConnected) { window.removeEventListener('keydown', keydown); return; }
      if (host.offsetParent !== null) this.keydown(event);
    };
    window.addEventListener('keydown', keydown);
    void this.load();
  }

  private async load(message?: string): Promise<void> {
    try {
      this.listing = await this.session.story();
      if (!this.listing.courses.some(course => course.id === this.courseId)) this.courseId = this.listing.scenes[0]?.courseId ?? this.listing.courses[0]?.id ?? '';
      this.derive();
      this.scene = Math.min(Math.max(0, this.scene), Math.max(0, this.derived!.scenes.length - 1));
      if (message) this.notice = {text: message, tone: 'ok'};
      this.render();
    } catch (error) {
      this.host.innerHTML = `<div class="st"><p class="st-loading" role="alert">${escape(error instanceof Error ? error.message : 'The story could not be loaded.')}</p></div>`;
    }
  }

  private derive(): void {
    if (!this.listing) return;
    const scenes = courseScenes(this.listing, this.courseId);
    this.derived = {scenes, first: firstAppearances(scenes), fresh: newWordsByScene(scenes), sources: flagSources(scenes), spellings: storySpellings(scenes)};
  }

  private save(): void {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({courseId: this.courseId, scene: this.scene, path: this.path})); } catch { /* preferences are optional */ }
  }

  private get current(): StoryScene | undefined { return this.derived?.scenes[this.scene]; }
  private get course() { return this.listing?.courses.find(course => course.id === this.courseId); }

  private findLine(id: string | undefined): {block: StoryBlock; line: StoryLine} | undefined {
    for (const block of this.current?.blocks ?? []) { const line = block.lines.find(value => value.id === id); if (line) return {block, line}; }
    return undefined;
  }

  // Rendering -----------------------------------------------------------------------------------

  render(): void {
    if (!this.listing || !this.derived) return;
    const focused = document.activeElement as HTMLElement | null, search = focused?.matches('[data-search]') ? (focused as HTMLInputElement).selectionStart : null;
    const panes = ['.st-outline', '.st-script', '.st-inspector'], scroll = panes.map(selector => this.host.querySelector(selector)?.scrollTop ?? 0);
    this.host.innerHTML = `<div class="st">
      <aside class="st-outline" aria-label="Story outline">${this.outline()}</aside>
      <main class="st-script" aria-label="Scene script">${this.script()}</main>
      <aside class="st-inspector" aria-label="Line details">${this.inspector()}</aside>
    </div>`;
    panes.forEach((selector, index) => { const pane = this.host.querySelector(selector); if (pane) pane.scrollTop = scroll[index]; });
    if (search !== null) { const input = this.host.querySelector<HTMLInputElement>('[data-search]'); input?.focus(); input?.setSelectionRange(search, search); }
    if (this.draft) { if (search === null) this.focusEditor(true); this.refreshDraft(); }
    this.host.querySelector('.st-scene.is-current')?.scrollIntoView({block: 'nearest'});
  }

  private outline(): string {
    const {scenes, fresh} = this.derived!, listing = this.listing!;
    const courses = listing.courses.filter(course => listing.scenes.some(scene => scene.courseId === course.id));
    const head = `<header class="st-outline-head">
      ${courses.length > 1 ? `<select data-course aria-label="Course">${courses.map(course => `<option value="${escape(course.id)}"${course.id === this.courseId ? ' selected' : ''}>${escape(course.title)}</option>`).join('')}</select>` : ''}
      <input type="search" data-search placeholder="Search lines, words, speakers  /" value="${escape(this.query)}" autocomplete="off" spellcheck="false">
      <div class="st-filters" role="group" aria-label="Show"><button type="button" data-filter="all" aria-pressed="${!this.changedOnly}">All scenes</button><button type="button" data-filter="changed" aria-pressed="${this.changedOnly}">Changed (${scenes.reduce((sum, scene) => sum + sceneChanges(scene), 0)})</button></div>
    </header>`;
    if (this.query.trim()) {
      const hits = searchStory(listing, scenes, this.query);
      return `${head}<div class="st-hits"><p class="st-muted">${hits.length ? `${hits.length}${hits.length === 80 ? '+' : ''} matches` : 'No line matches.'}</p>
        ${hits.map(hit => `<button type="button" class="st-hit" data-goto="${hit.sceneIndex}" data-goto-line="${escape(hit.lineId ?? '')}" data-goto-block="${escape(hit.blockId)}">
          <span class="st-sub">${hit.sceneIndex + 1} · ${escape(scenes[hit.sceneIndex].title)} · ${escape(hit.speaker)}</span><span lang="de">${escape(hit.text)}</span><span class="st-sub">${escape(hit.translation)}</span></button>`).join('')}</div>`;
    }
    const acts = listing.acts.filter(act => act.courseId === this.courseId), chapters = listing.chapters.filter(chapter => chapter.courseId === this.courseId);
    const groups: {key: string; scenes: number[]}[] = [];
    scenes.forEach((scene, index) => { const last = groups.at(-1); if (last?.key === scene.level) last.scenes.push(index); else groups.push({key: scene.level, scenes: [index]}); });
    if (this.changedOnly && !scenes.some(scene => sceneChanges(scene))) return `${head}<p class="st-muted st-pad">Nothing is changed. The story is exactly as authored.</p>`;
    return `${head}<nav class="st-acts">${groups.map(group => {
      const act = acts.find(value => value.level === group.key), chapter = chapters.find(value => value.level === group.key);
      const shownScenes = group.scenes.filter(index => !this.changedOnly || sceneChanges(scenes[index]));
      if (!shownScenes.length) return '';
      return `<section class="st-act" style="--act:${escape(chapter?.color ?? '#c4a567')}">
        <header><span>${act ? `Act ${escape(act.number)}` : escape(group.key)} · ${escape(group.key)}</span><strong>${escape(act?.title ?? chapter?.title ?? '')}</strong>
          ${act?.premise.length ? `<p>${escape(act.premise.map(text => text.translations.en || text.text).join(' '))}</p>` : ''}</header>
        <ol>${shownScenes.map(index => {
          const scene = scenes[index], words = fresh[index].length, changes = sceneChanges(scene), npc = listing.npcs[scene.npc];
          return `<li><button type="button" class="st-scene${index === this.scene ? ' is-current' : ''}" data-goto="${index}"${index === this.scene ? ' aria-current="true"' : ''}>
            <span class="st-num">${index + 1}</span>
            <span class="st-scene-main"><strong>${escape(scene.title)}</strong><span class="st-sub">${escape(npc?.name ?? speakerName(listing, scene.npc))} · ${escape(scene.location.split('·').pop()!.trim())}</span></span>
            <span class="st-meter${words > NEW_WORD_BUDGET ? ' is-over' : ''}" title="${words} new words in this scene (pace ${NEW_WORD_BUDGET})"><i style="width:${Math.min(100, words / NEW_WORD_BUDGET * 100)}%"></i><b>${words}</b></span>
            ${changes ? `<span class="st-badge" title="${changes} changed lines">${changes}</span>` : ''}
          </button></li>`;
        }).join('')}</ol></section>`;
    }).join('')}</nav>`;
  }

  private script(): string {
    const scene = this.current, listing = this.listing!, {scenes, fresh} = this.derived!;
    if (!scene) return '<p class="st-loading">No story scenes are installed.</p>';
    const order = readingOrder(scene), npc = listing.npcs[scene.npc];
    const act = listing.acts.find(value => value.courseId === this.courseId && value.level === scene.level);
    const picks = Object.keys(this.path).filter(id => scenes.some(item => item.graphId === id)).length;
    const previous = scenes[this.scene - 1], next = scenes[this.scene + 1];
    const notice = this.notice ? `<div class="st-notice is-${this.notice.tone}" role="status"><span>${escape(this.notice.text)}</span>${this.notice.undo ? '<button type="button" data-act="undo">Undo</button>' : ''}<button type="button" class="st-icon" data-act="dismiss" aria-label="Dismiss">${icon('close')}</button></div>` : '';
    return `<header class="st-scene-head">
        <div class="st-crumbs"><span>${act ? `Act ${escape(act.number)} · ${escape(act.title)}` : escape(scene.level)}</span><span>Scene ${this.scene + 1} of ${scenes.length}</span></div>
        <div class="st-title-row"><div><h2>${escape(scene.title)}</h2><p>${escape(scene.subtitle)}</p></div>
          <div class="st-nav"><button type="button" data-goto="${this.scene - 1}" ${previous ? '' : 'disabled'} title="Previous scene ([)">${icon('chevron', 'st-flip')}<span class="me-sr">Previous scene</span></button>
          <button type="button" data-goto="${this.scene + 1}" ${next ? '' : 'disabled'} title="Next scene (])">${icon('chevron')}<span class="me-sr">Next scene</span></button>
          <button type="button" data-act="reload" title="Load the latest story">${icon('refresh')}<span class="me-sr">Reload</span></button></div></div>
        <div class="st-meta"><span class="st-chip"><i class="st-dot" style="--c:${escape(npc?.color ?? '#c4a567')}"></i>${escape(npc?.name ?? speakerName(listing, scene.npc))}</span>
          <span class="st-chip">${icon('pin')}${escape(scene.location)}</span><span class="st-chip">${escape(scene.level)}</span>
          <span class="st-chip${fresh[this.scene].length > NEW_WORD_BUDGET ? ' is-over' : ''}" title="Words players first meet here">${fresh[this.scene].length} new words</span>
          ${this.hooks.showOnMap && scene.npc ? `<button type="button" class="st-link" data-act="map">${icon('map')} Show ${escape(npc?.name ?? scene.npc)} on the map</button>` : ''}</div>
        ${scene.synopsis.length ? `<p class="st-synopsis">${scene.synopsis.map(text => `<span lang="de">${escape(text.text)}</span> <span class="st-en">${escape(text.translations.en ?? '')}</span>`).join(' ')}</p>` : ''}
        <nav class="st-flow" aria-label="Scene parts">${order.map(block => `<a href="#st-${escape(block.id)}" data-jump="${escape(block.id)}" class="st-flow-${block.kind}${this.blockVerdict(block) === 'unmet' ? ' is-off' : ''}">${escape(shortBlockName(scene, block))}<b>${block.lines.filter(line => !line.hidden).length}</b></a>`).join('')}</nav>
        <p class="st-path">${picks ? `Following your playthrough: ${picks} decision${picks === 1 ? '' : 's'} picked. Lines for other choices are dimmed. <button type="button" class="st-link" data-act="clear-path">Clear choices</button>` : 'Pick a reply in any decision to follow one playthrough through later scenes.'}</p>
        ${notice}
      </header>
      <div class="st-blocks">${order.map(block => this.block(scene, block)).join('')}
        ${next ? `<button type="button" class="st-next" data-goto="${this.scene + 1}"><span class="st-sub">Next scene</span><strong>${this.scene + 2} · ${escape(next.title)}</strong><span>${escape(next.subtitle)}</span></button>` : act?.cliffhanger.length ? `<p class="st-synopsis">${escape(act.cliffhanger.map(text => text.translations.en || text.text).join(' '))}</p>` : ''}
      </div>`;
  }

  private blockVerdict(block: StoryBlock) {
    const scene = this.current!, {scenes, sources} = this.derived!;
    if (block.kind === 'complete') {
      const decision = scene.blocks.find(item => item.choices?.some(choice => choice.next === block.id));
      const picked = this.path[scene.graphId];
      if (decision && picked && decision.choices!.some(choice => choice.id === picked) && !decision.choices!.some(choice => choice.id === picked && choice.next === block.id)) return 'unmet';
    }
    return conditionOnPath(block.condition, this.scene, scenes, this.path, sources);
  }

  private block(scene: StoryScene, block: StoryBlock): string {
    const {scenes, sources} = this.derived!, verdict = this.blockVerdict(block);
    const next = block.next ? scene.blocks.find(item => item.id === block.next) : undefined;
    const task = block.task ? `<div class="st-task"><span>${icon('chat')} The player must reply</span><p>${escape(block.task.prompt)}</p>${block.task.answer ? `<p class="st-answer" lang="de">“${escape(block.task.answer)}”</p>` : ''}</div>` : '';
    const choices = block.choices?.length ? `<div class="st-choices">${block.choices.map(choice => {
      const picked = this.path[scene.graphId] === choice.id, branch = scene.blocks.find(item => item.id === choice.next);
      return `<button type="button" class="st-choice${picked ? ' is-picked' : ''}" data-pick="${escape(choice.id)}" aria-pressed="${picked}">
        <span class="st-sub">${picked ? 'On your playthrough' : 'Player says'}</span><span lang="de">${escape(choice.text)}</span><span class="st-en">${escape(choice.translations.en ?? '')}</span>
        <span class="st-effects">${choice.effects.map(effect => `<i>${escape(describeEffect(effect))}</i>`).join('')}${choice.condition ? `<i class="st-if">${escape(describeCondition(choice.condition, scenes, sources))}</i>` : ''}</span>
        ${branch ? `<span class="st-goes">→ ${branch.lines.length} reaction line${branch.lines.length === 1 ? '' : 's'}</span>` : ''}</button>`;
    }).join('')}</div>` : '';
    return `<section class="st-block st-block-${block.kind}${verdict === 'unmet' ? ' is-off' : ''}" id="st-${escape(block.id)}">
      <header><h3>${escape(blockTitle(scene, block))}</h3>${block.condition ? `<span class="st-if">${escape(describeCondition(block.condition, scenes, sources))}</span>` : ''}${verdict === 'unmet' ? '<span class="st-off">Not on your playthrough</span>' : ''}</header>
      ${block.question ? `<p class="st-question"><span class="st-speaker" style="--c:#c4a567">Player asks</span><span lang="de">${escape(block.question.text)}</span><span class="st-en">${escape(block.question.translations.en ?? '')}</span></p>` : ''}
      <ol class="st-lines">${block.lines.map(line => this.lineRow(scene, block, line)).join('')}</ol>
      ${task}${choices}
      ${next && block.kind !== 'choice' && next.kind !== 'gate' && next.kind !== 'choice' ? `<p class="st-continue">→ ${escape(blockTitle(scene, next))}</p>` : ''}
      ${block.terminal ? '<p class="st-continue">Scene ends.</p>' : ''}
    </section>`;
  }

  private lineRow(scene: StoryScene, block: StoryBlock, line: StoryLine): string {
    const listing = this.listing!, {scenes, sources, first} = this.derived!, text = shown(line), color = listing.npcs[line.speaker]?.color ?? '#9fb8ac';
    const verdict = conditionOnPath(line.condition, this.scene, scenes, this.path, sources);
    const tags = [
      line.reply ? `<span class="st-tag is-task">${icon('chat')} Player answers: ${escape(line.reply.prompt)}${line.reply.answer ? ` <b lang="de">“${escape(line.reply.answer)}”</b>` : ''}</span>` : '',
      line.condition ? `<span class="st-tag is-if">${escape(describeCondition(line.condition, scenes, sources))}</span>` : '',
      line.edit ? `<span class="st-tag is-edit">Edited by ${escape(line.edit.by)}</span>` : '',
      line.hidden ? `<span class="st-tag is-hidden">Hidden by ${escape(line.hiddenBy ?? 'an admin')}</span>` : '',
      line.addressedTo ? `<span class="st-tag">to ${escape(speakerName(listing, line.addressedTo))}</span>` : '',
      !line.audio || line.edit ? `<span class="st-tag is-quiet">${icon('muted')} No recorded voice</span>` : '',
    ].join('');
    const classes = ['st-line', line.id === this.line ? 'is-selected' : '', line.hidden ? 'is-hidden' : '', line.edit ? 'is-edited' : '', verdict === 'unmet' ? 'is-off' : ''].filter(Boolean).join(' ');
    return `<li class="${classes}" data-line="${escape(line.id)}" tabindex="-1">
      <span class="st-speaker" style="--c:${escape(color)}">${escape(speakerName(listing, line.speaker))}</span>
      <div class="st-body"><p class="st-de" lang="${escape(this.course?.target ?? 'de')}">${marked(text, wordReport(text, this.scene, scene.level, first, listing.lexemes), listing)}</p>
        <p class="st-en">${escape(text.translations.en ?? '')}</p>${tags ? `<div class="st-tags">${tags}</div>` : ''}</div>
      <div class="st-actions"><button type="button" data-act="edit" data-id="${escape(line.id)}" title="Rewrite (Enter)">Edit</button>
        ${line.hidden ? `<button type="button" data-act="restore" data-id="${escape(line.id)}" title="Restore (H)">Restore</button>`
          : line.locked ? `<span class="st-kept" title="${escape(line.locked)}">${icon('lock')}</span>` : `<button type="button" data-act="hide" data-id="${escape(line.id)}" title="Hide for everyone (H)">Hide</button>`}</div>
    </li>`;
  }

  private inspector(): string {
    const found = this.findLine(this.line);
    if (found && this.draft?.lineId === found.line.id) return this.editor(found.block, found.line);
    if (found) return this.lineDetails(found.block, found.line);
    return this.sceneDetails();
  }

  private sceneDetails(): string {
    const scene = this.current, listing = this.listing!, {scenes, fresh} = this.derived!;
    if (!scene) return '';
    const lines = scene.blocks.flatMap(block => block.lines), live = lines.filter(line => !line.hidden);
    const words = live.reduce((sum, line) => sum + (shown(line).text.match(/\p{L}+/gu) ?? []).length, 0);
    const changed = scenes.flatMap((item, index) => item.blocks.flatMap(block => block.lines.filter(lineChanged).map(line => ({index, line}))));
    return `<section class="st-panel"><h3>New words in this scene <b class="${fresh[this.scene].length > NEW_WORD_BUDGET ? 'is-over' : ''}">${fresh[this.scene].length} / ${NEW_WORD_BUDGET}</b></h3>
        ${fresh[this.scene].length ? `<ul class="st-vocab">${fresh[this.scene].map(id => listing.lexemes[id]).filter(Boolean).sort((a, b) => a.lemma.localeCompare(b.lemma, 'de')).map(entry => `<li><b lang="de">${escape(entry.lemma)}</b><span>${escape(entry.meaning)}</span><i class="st-level-${escape(entry.level)}">${escape(entry.level)}</i></li>`).join('')}</ul>` : '<p class="st-muted">No word is new here; this scene recycles earlier vocabulary.</p>'}
        <p class="st-muted">Players first meet these words in this scene. The game paces about ${NEW_WORD_BUDGET} per scene.</p></section>
      <section class="st-panel"><h3>Scene at a glance</h3><dl class="st-facts">
        <div><dt>Lines</dt><dd>${live.length}${lines.length !== live.length ? ` <span class="st-sub">(${lines.length - live.length} hidden)</span>` : ''}</dd></div>
        <div><dt>Words spoken</dt><dd>${words}</dd></div>
        <div><dt>Per line</dt><dd>${live.length ? (words / live.length).toFixed(1) : '0'}</dd></div>
        <div><dt>Voiced</dt><dd>${live.filter(line => line.audio && !line.edit).length} of ${live.length}</dd></div></dl>
        ${scene.objectives.length ? `<h3>Beats</h3><ol class="st-beats">${scene.objectives.map(item => `<li>${escape(item.text)}</li>`).join('')}</ol>` : ''}</section>
      <section class="st-panel"><h3>All changes <b>${changed.length}</b></h3>
        ${changed.length ? `<ul class="st-changes">${changed.map(({index, line}) => `<li><button type="button" data-goto="${index}" data-goto-line="${escape(line.id)}"><span class="st-sub">${index + 1} · ${escape(scenes[index].title)} · ${line.hidden ? 'hidden' : 'edited'}</span><span lang="de">${escape(shown(line).text)}</span></button></li>`).join('')}</ul>` : '<p class="st-muted">The story is exactly as authored. Edits and hidden lines show up here so they can be reviewed or undone.</p>'}</section>
      <section class="st-panel st-keys"><h3>Keys</h3><dl><div><dt>↑ ↓</dt><dd>Line</dd></div><div><dt>[ ]</dt><dd>Scene</dd></div><div><dt>Enter</dt><dd>Edit</dd></div><div><dt>H</dt><dd>Hide · restore</dd></div><div><dt>/</dt><dd>Search</dd></div><div><dt>Esc</dt><dd>Back</dd></div></dl></section>`;
  }

  private lineDetails(block: StoryBlock, line: StoryLine): string {
    const listing = this.listing!, scene = this.current!, {first} = this.derived!, text = shown(line);
    const report = wordReport(text, this.scene, scene.level, first, listing.lexemes);
    const position = block.lines.indexOf(line) + 1;
    return `<section class="st-panel"><header class="st-panel-head"><div><span class="st-sub">${escape(blockTitle(scene, block))} · line ${position} of ${block.lines.length}</span><h3 class="st-who">${escape(speakerName(listing, line.speaker))}</h3></div>
        <button type="button" class="st-icon" data-act="deselect" aria-label="Back to the scene">${icon('close')}</button></header>
        <p class="st-de st-big" lang="de">${marked(text, report, listing)}</p>
        ${(this.course?.supportLanguages ?? ['en']).map(lang => `<p class="st-en"><span class="st-sub">${escape(languageName(lang))}</span> ${escape(text.translations[lang] ?? '')}</p>`).join('')}
        <div class="st-row"><button type="button" class="st-primary" data-act="edit" data-id="${escape(line.id)}">Edit line</button>
          ${line.hidden ? `<button type="button" data-act="restore" data-id="${escape(line.id)}">Restore</button>` : line.locked ? '' : `<button type="button" data-act="hide" data-id="${escape(line.id)}">Hide for everyone</button>`}
          ${line.edit ? `<button type="button" data-act="reset" data-id="${escape(line.id)}">Back to the original</button>` : ''}</div>
        ${line.locked && !line.hidden ? `<p class="st-muted">${icon('lock')} ${escape(line.locked)}</p>` : ''}</section>
      ${line.edit ? `<section class="st-panel"><h3>Original line</h3><p class="st-de" lang="de">${escape(line.text)}</p><p class="st-en">${escape(line.translations.en ?? '')}</p><p class="st-muted">Edited by ${escape(line.edit.by)} · ${escape(when(line.edit.at))}</p></section>` : ''}
      ${line.hidden ? `<section class="st-panel"><p class="st-muted">Hidden by ${escape(line.hiddenBy ?? 'an admin')}${line.hiddenAt ? ` · ${escape(when(line.hiddenAt))}` : ''}. Players skip this line.</p></section>` : ''}
      ${line.reply ? `<section class="st-panel"><h3>Player answers</h3><p>${escape(line.reply.prompt)}</p>${line.reply.answer ? `<p class="st-answer" lang="de">“${escape(line.reply.answer)}”</p>` : ''}</section>` : ''}
      ${line.variants?.length ? `<section class="st-panel"><h3>Simpler version</h3>${line.variants.map(variant => `<p class="st-de" lang="de">${escape(variant.text)}</p><p class="st-en">${escape(variant.translations.en ?? '')}</p>`).join('')}<p class="st-muted">Shown to players who struggle with the full line.</p></section>` : ''}
      <section class="st-panel"><h3>Words</h3>${wordTable(report, listing, this.derived!.scenes)}</section>`;
  }

  private editor(block: StoryBlock, line: StoryLine): string {
    const listing = this.listing!, scene = this.current!, draft = this.draft!;
    return `<form class="st-panel st-editor" data-editor>
      <header class="st-panel-head"><div><span class="st-sub">${escape(blockTitle(scene, block))}</span><h3 class="st-who">${escape(speakerName(listing, line.speaker))}</h3></div></header>
      <label><span>${escape(languageName(this.course?.target ?? 'de'))}</span><textarea name="text" rows="3" lang="de" spellcheck="true" maxlength="240">${escape(draft.text)}</textarea></label>
      <div class="st-preview"><span class="st-sub">Preview · <span class="st-key is-new">new here</span> <span class="st-key is-fresh">new to the story</span> <span class="st-key is-above">above level</span></span><p class="st-de" data-preview lang="de"></p></div>
      ${(this.course?.supportLanguages ?? ['en']).map(lang => `<label><span>${escape(languageName(lang))}</span><textarea name="tr-${escape(lang)}" rows="2" lang="${escape(lang)}">${escape(draft.translations[lang] ?? '')}</textarea></label>`).join('')}
      <ul class="st-checks" data-checks aria-live="polite"></ul>
      <div class="st-row"><button type="submit" class="st-primary" ${this.busy ? 'disabled' : ''}>Save for everyone <kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}↵</kbd></button>
        <button type="button" data-act="cancel">Cancel <kbd>Esc</kbd></button></div>
      <p class="st-muted">Original: <span lang="de">${escape(line.text)}</span></p>
      <h3>Words</h3><div data-words></div>
    </form>`;
  }

  /** Updates the live parts of the editor without replacing the text areas. */
  private refreshDraft(): void {
    const form = this.host.querySelector<HTMLFormElement>('[data-editor]'), draft = this.draft, found = this.findLine(draft?.lineId);
    if (!form || !draft || !found || !this.listing || !this.derived) return;
    const scene = this.current!, first = firstAppearances(this.derived.scenes, draft.lineId);
    const words = draft.check && draft.checked === draft.text ? draft.check.words : draft.text === shown(found.line).text ? shown(found.line).words : [];
    const text: StoryText = {text: draft.text, translations: draft.translations, words};
    const report = wordReport(text, this.scene, scene.level, first, this.listing.lexemes);
    const newInScene = [...first.values()].filter(index => index === this.scene).length;
    const checks = checkLine({text: draft.text, original: found.line, scene, report, translations: draft.translations, supportLanguages: this.course?.supportLanguages ?? ['en'], newInScene, problems: draft.checked === draft.text ? draft.check?.problems : [], spellings: this.derived.spellings});
    form.querySelector('[data-preview]')!.innerHTML = marked(text, report, this.listing) || '&nbsp;';
    form.querySelector('[data-checks]')!.innerHTML = checks.length ? checks.map(check => `<li class="is-${check.level}">${escape(check.message)}</li>`).join('') : '<li class="is-ok">Reads cleanly for this level.</li>';
    form.querySelector('[data-words]')!.innerHTML = draft.checked === draft.text || draft.text === shown(found.line).text ? wordTable(report, this.listing, this.derived.scenes) : '<p class="st-muted">Checking words…</p>';
    form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = this.busy || checks.some(check => check.level === 'error');
  }

  private scheduleCheck(): void {
    window.clearTimeout(this.checkTimer);
    const draft = this.draft, found = this.findLine(draft?.lineId);
    if (!draft || !found || draft.checked === draft.text) return;
    this.checkTimer = window.setTimeout(async () => {
      const run = ++this.checkRun, text = draft.text;
      try {
        const check = await this.session.checkStoryText(text, found.line.text);
        if (run !== this.checkRun || this.draft !== draft) return;
        Object.assign(this.listing!.lexemes, check.lexemes);
        draft.check = check; draft.checked = text;
        this.refreshDraft();
      } catch { /* the save re-checks on the server */ }
    }, 220);
  }

  private focusEditor(select: boolean): void {
    const area = this.host.querySelector<HTMLTextAreaElement>('[data-editor] textarea[name=text]');
    if (!area || area === document.activeElement) return;
    area.focus();
    if (select) area.setSelectionRange(area.value.length, area.value.length);
  }

  // Actions ---------------------------------------------------------------------------------------

  private goto(index: number, lineId?: string, blockId?: string): void {
    if (!this.derived || index < 0 || index >= this.derived.scenes.length) return;
    if (this.draft && !this.discardDraft()) return;
    const changed = index !== this.scene;
    this.scene = index; this.line = lineId || undefined; this.notice = changed ? undefined : this.notice;
    this.save(); this.render();
    const target = lineId ? this.host.querySelector(`[data-line="${CSS.escape(lineId)}"]`) : blockId ? this.host.querySelector(`#st-${CSS.escape(blockId)}`) : undefined;
    if (target) target.scrollIntoView({block: 'center'});
    else if (changed) this.host.querySelector('.st-script')?.scrollTo({top: 0});
  }

  private select(lineId: string | undefined, scroll = false): void {
    if (this.draft && this.draft.lineId !== lineId && !this.discardDraft()) return;
    this.line = lineId;
    this.host.querySelectorAll('.st-line.is-selected').forEach(row => row.classList.remove('is-selected'));
    const row = lineId ? this.host.querySelector<HTMLElement>(`[data-line="${CSS.escape(lineId)}"]`) : null;
    row?.classList.add('is-selected');
    if (row && scroll) row.scrollIntoView({block: 'nearest'});
    this.host.querySelector('.st-inspector')!.innerHTML = this.inspector();
    if (this.draft) { this.focusEditor(true); this.refreshDraft(); }
  }

  private edit(lineId: string): void {
    const found = this.findLine(lineId);
    if (!found) return;
    if (this.draft?.lineId !== lineId) {
      if (this.draft && !this.discardDraft()) return;
      const text = shown(found.line);
      this.draft = {lineId, text: text.text, translations: {...found.line.translations, ...text.translations}};
    }
    this.select(lineId, true);
  }

  private discardDraft(): boolean {
    const draft = this.draft, found = this.findLine(draft?.lineId);
    if (draft && found) {
      const text = shown(found.line);
      const dirty = draft.text !== text.text || Object.entries(draft.translations).some(([lang, value]) => value !== (text.translations[lang] ?? found.line.translations[lang] ?? ''));
      if (dirty && !confirm('Discard your changes to this line?')) return false;
    }
    this.draft = undefined;
    return true;
  }

  private async change(lineId: string, change: StoryLineChange, success: string, undo?: StoryLineChange, after?: () => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.host.querySelectorAll<HTMLButtonElement>('.st-script button, .st-inspector button').forEach(button => { button.disabled = true; });
    try {
      const result = await this.session.changeStoryLine(lineId, change);
      if (result.scene) {
        const target = this.listing!.scenes.find(scene => scene.graphId === result.scene!.graphId);
        if (target) target.blocks = result.scene.blocks;
      }
      this.derive();
      this.notice = {text: success, tone: 'ok', undo: undo ? {lineId, change: undo} : undefined};
      after?.();
    } catch (error) {
      this.notice = {text: error instanceof Error ? error.message : 'The line could not be changed.', tone: 'error'};
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /** The change that puts a line back the way it is now. */
  private inverse(line: StoryLine, hidden: boolean): StoryLineChange {
    if (hidden) return {hidden: line.hidden};
    return line.edit ? {text: line.edit.text, translations: line.edit.translations} : {reset: true};
  }

  private async commit(): Promise<void> {
    const draft = this.draft, found = this.findLine(draft?.lineId);
    if (!draft || !found || this.busy) return;
    const undo = this.inverse(found.line, false);
    await this.change(draft.lineId, {text: draft.text, translations: draft.translations}, 'Saved. Players see the new line the next time this conversation opens.', undo, () => { this.draft = undefined; });
  }

  private toggleHidden(lineId: string): void {
    const found = this.findLine(lineId);
    if (!found || (!found.line.hidden && found.line.locked)) { if (found?.line.locked) { this.notice = {text: found.line.locked, tone: 'error'}; this.render(); } return; }
    const hide = !found.line.hidden;
    void this.change(lineId, {hidden: hide}, hide ? 'Line hidden for everyone.' : 'Line restored.', this.inverse(found.line, true));
  }

  private click(event: MouseEvent): void {
    const target = event.target as HTMLElement, button = target.closest<HTMLButtonElement>('button');
    if (button?.disabled) return;
    if (target.closest('[data-jump]')) {
      event.preventDefault();
      this.host.querySelector(`#st-${CSS.escape(target.closest<HTMLElement>('[data-jump]')!.dataset.jump!)}`)?.scrollIntoView({block: 'start', behavior: 'smooth'});
      return;
    }
    if (button?.dataset.goto !== undefined) { this.goto(Number(button.dataset.goto), button.dataset.gotoLine, button.dataset.gotoBlock); return; }
    if (button?.dataset.filter) { this.changedOnly = button.dataset.filter === 'changed'; this.render(); return; }
    if (button?.dataset.pick) {
      const graph = this.current!.graphId;
      if (this.path[graph] === button.dataset.pick) delete this.path[graph]; else this.path[graph] = button.dataset.pick;
      this.save(); this.render(); return;
    }
    const id = button?.dataset.id;
    switch (button?.dataset.act) {
      case 'edit': this.edit(id!); return;
      case 'hide': case 'restore': this.toggleHidden(id!); return;
      case 'reset': { const found = this.findLine(id); if (found) void this.change(id!, {reset: true}, 'The original line is back.', this.inverse(found.line, false)); return; }
      case 'cancel': this.draft = undefined; this.select(this.line); return;
      case 'deselect': this.select(undefined); return;
      case 'dismiss': this.notice = undefined; this.render(); return;
      case 'undo': { const undo = this.notice?.undo; if (undo) void this.change(undo.lineId, undo.change, 'Undone.'); return; }
      case 'clear-path': this.path = {}; this.save(); this.render(); return;
      case 'reload': if (!this.draft || this.discardDraft()) void this.load('Loaded the latest story.'); return;
      case 'map': if (this.current && this.hooks.showOnMap?.(this.current.npc) === false) { this.notice = {text: 'This character is not placed on any map.', tone: 'error'}; this.render(); } return;
    }
    const row = target.closest<HTMLElement>('[data-line]');
    if (row && !button) this.select(row.dataset.line);
  }

  private input(event: Event): void {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (field.matches('[data-search]')) { this.query = field.value; this.render(); return; }
    if (!this.draft || !field.closest('[data-editor]')) return;
    if (field.name === 'text') { this.draft.text = field.value; this.scheduleCheck(); }
    else if (field.name.startsWith('tr-')) this.draft.translations[field.name.slice(3)] = field.value;
    this.refreshDraft();
  }

  private keydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement, typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (typing) {
      if (target.closest('[data-editor]')) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void this.commit(); }
        else if (event.key === 'Escape') { event.preventDefault(); if (this.discardDraft()) this.select(this.line); }
      } else if (event.key === 'Escape') { if (target.matches('[data-search]') && this.query) { this.query = ''; this.render(); } else target.blur(); }
      else if (event.key === 'Enter' && target.matches('[data-search]')) this.host.querySelector<HTMLButtonElement>('.st-hit')?.click();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const lines = [...this.host.querySelectorAll<HTMLElement>('.st-line')].map(row => row.dataset.line!);
    const index = this.line ? lines.indexOf(this.line) : -1;
    let handled = true;
    switch (event.key) {
      case 'ArrowDown': case 'j': this.select(lines[Math.min(lines.length - 1, index + 1)], true); break;
      case 'ArrowUp': case 'k': this.select(lines[Math.max(0, index - 1)], true); break;
      case ']': case 'PageDown': this.goto(this.scene + 1); break;
      case '[': case 'PageUp': this.goto(this.scene - 1); break;
      case 'Enter': case 'e': if (this.line) this.edit(this.line); else handled = false; break;
      case 'h': if (this.line) this.toggleHidden(this.line); else handled = false; break;
      case '/': this.host.querySelector<HTMLInputElement>('[data-search]')?.focus(); break;
      case 'Escape': if (this.line) this.select(undefined); else handled = false; break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  }
}

function shortBlockName(scene: StoryScene, block: StoryBlock): string {
  if (block.kind === 'complete') {
    const index = scene.blocks.flatMap(item => item.choices ?? []).findIndex(choice => choice.next === block.id);
    return index >= 0 ? `Reply ${String.fromCharCode(65 + index)}` : block.terminal ? 'Ending' : 'After';
  }
  if (block.kind === 'topic') return `? ${block.question?.text.replace(/[?¿]$/, '') ?? 'Question'}`;
  return {intro: 'Greeting', gate: 'Task', choice: 'Decision'}[block.kind] ?? block.label;
}

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
}

function wordTitle(word: WordReport, listing: StoryListing): string {
  const entry = word.lexeme ? listing.lexemes[word.lexeme] : undefined;
  if (!entry) return statusText.unlisted;
  const where = word.status === 'known' && word.firstScene !== undefined ? `taught in scene ${word.firstScene + 1}` : word.status === 'earlier' ? `moved from scene ${word.firstScene! + 1}` : statusText[word.status];
  return `${entry.lemma} — ${entry.meaning} · ${entry.level} · ${where}${word.above ? ' · above this level' : ''}`;
}

/** The line with each word marked by how new it is to players. */
function marked(text: StoryText, report: WordReport[], listing: StoryListing): string {
  let out = '', at = 0;
  const plain = (value: string) => escape(value).replace(/\{[^{}]*\}/g, match => `<span class="st-ph">${match}</span>`);
  for (const word of [...report].sort((a, b) => a.start - b.start)) {
    if (word.start < at || word.end > text.text.length) continue;
    out += plain(text.text.slice(at, word.start));
    out += `<span class="st-w is-${word.status}${word.above ? ' is-above' : ''}" title="${escape(wordTitle(word, listing))}">${escape(word.surface)}</span>`;
    at = word.end;
  }
  return out + plain(text.text.slice(at));
}

function wordTable(report: WordReport[], listing: StoryListing, scenes: readonly StoryScene[]): string {
  const seen = new Set<string>(), rows = report.filter(word => { const key = word.lexeme ?? word.surface.toLocaleLowerCase('de'); if (seen.has(key)) return false; seen.add(key); return true; });
  if (!rows.length) return '<p class="st-muted">No words yet.</p>';
  return `<ul class="st-wordlist">${rows.map(word => {
    const entry = word.lexeme ? listing.lexemes[word.lexeme] : undefined;
    const where = word.status === 'known' && word.firstScene !== undefined ? `since ${word.firstScene + 1} · ${scenes[word.firstScene]?.title ?? ''}` : word.status === 'earlier' ? `was new in ${word.firstScene! + 1}` : statusText[word.status];
    return `<li class="is-${word.status}${word.above ? ' is-above' : ''}"><b lang="de">${escape(entry?.lemma ?? word.surface)}</b><span>${escape(entry?.meaning ?? '')}</span>${entry ? `<i class="st-level-${escape(entry.level)}">${escape(entry.level)}</i>` : '<i></i>'}<span class="st-sub">${escape(where)}</span></li>`;
  }).join('')}</ul>`;
}
