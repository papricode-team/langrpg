import Phaser from 'phaser';
import './level-editor.css';
import { parseWorldSceneDocument, sceneActivityUsers, type WorldScene, type SceneScenery, type SceneGenerationZone, sceneActivityPoint, sceneInteriorIds, type SceneEntrance } from './scene-schema';
import {EditorOutliner} from './level-editor-outliner';
import {assertEditorViewEditable,readEditorView,writeEditorView,lockedScenery,type EditorViewState} from './level-editor-selection';
import {renderResidentTools} from './level-editor-residents';
import { maps } from './maps';
import { LevelEditorCanvas, type PaletteItem } from './level-editor-canvas';
import { applyScatter, generateScatter, type ScatterProposal } from './level-editor-generation';
import { LevelEditorHistory, duplicateScenery, removeScenery, editScenery, groupScenery, ungroupScenery, makeDraft, nextSceneryId, readDraft } from './level-editor-model';
import {copyScenery,pasteScenery,checkClipboard,ObjectPaintStroke,type SceneryClipboard,type BrushSettings} from './level-editor-object-tools';

import {stampPrefab,selectedPrefabInstance,previewPrefabUpdate,savePrefabFromSelection,detachPrefab,setPrefabLocked,preservePrefabPlacement,sceneInstanceIds,type PrefabUpdate} from './level-editor-prefabs';

const root = document.querySelector<HTMLDivElement>('#editor')!;
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const draftKey = 'atlas.world-studio.draft.v1';
const query = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
let history: LevelEditorHistory, revision = '', savedDocument = '', mapId = 'lindenhafen';
let selected = new Set<string>(), palette: PaletteItem[] = [], currentAsset: PaletteItem | undefined;
let busy = false, dragChanged = false;
let clipboard:SceneryClipboard|undefined,pasting=false,pastePoint='';
let stroke:ObjectPaintStroke|undefined,strokeSelection=new Set<string>(),strokeSeed=1;
let outliner:EditorOutliner;
const views=new Map<string,EditorViewState>();
const viewKey=(id:string):string=>`atlas.world-studio.view.v1.${id}`;
function editorView(id=mapId):EditorViewState {
  let view=views.get(id);if(!view){let raw:string|null=null;try{raw=localStorage.getItem(viewKey(id));}catch{/* View aids work even when storage is unavailable. */}view=readEditorView(raw);views.set(id,view);}return view;
}
function replaceDocument(next:import('./scene-schema').WorldSceneDocument):boolean {
  try{for(const [id,previous] of Object.entries(history.document.maps))if(next.maps[id])assertEditorViewEditable(previous,next.maps[id],editorView(id));history.replace(next);return true;}
  catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);return false;}
}
function editScene(next:WorldScene):boolean {
  try{assertEditorViewEditable(history.document.maps[next.id],next,editorView(next.id));history.edit(next);return true;}
  catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);return false;}
}
function viewChanged():void {
  clearPrefabPreview();clearScatterPreview();
  try{localStorage.setItem(viewKey(mapId),writeEditorView(editorView()));}catch{diagnostics(['View controls are available for this session, but device storage is full.'],true);}
  canvas.hidden=editorView().hidden;canvas.locked=lockedScenery(scene(),editorView());canvas.paint(scene());refresh();
}
function selectPlaced(ids:string[],add=false):void {
  if(busy)return;
  selectMode();
  selected=new Set([...(add?selected:[]),...ids.filter(id=>!editorView().hidden.has(id))]);refresh();
}
function selectMode(box=false):void {
  canvas.cancelGesture();clearPaste();canvas.paintMode=undefined;canvas.placing=false;canvas.panMode=false;canvas.boxMode=box;currentAsset=undefined;currentPrefabId=undefined;clearPrefabPreview();renderPalette();renderPrefabs();refreshObjectTools();
  query('#canvas-help').textContent=box?'Drag a box to select · Shift adds · Alt selects individual children':'Drag objects to move · Drag empty space to select · F to frame · Space-drag to pan';
  query('#select-mode').setAttribute('aria-pressed',String(!box));query('#box-mode').setAttribute('aria-pressed',String(box));
  canvas.drawGuides();
}

let currentPrefabId:string|undefined,prefabProposal:PrefabUpdate|undefined;
let libraryMode:'objects'|'groups'|'placed'='objects';
let generationZone: SceneGenerationZone | undefined, proposal: ScatterProposal | undefined;
const scene = (): WorldScene => history.document.maps[mapId];
const dirty = (): boolean => JSON.stringify(history.document) !== savedDocument;
const status = (message: string): void => { query('#save-status').textContent = message; const secondary=document.querySelector('#footer-status');if(secondary)secondary.textContent=message; };
const diagnostics = (messages: string[], error = false): void => { query('#diagnostics').innerHTML = messages.map(message => `<p class="${error ? 'error' : ''}">${escape(message)}</p>`).join(''); };

function clearPaste():void {if(pasting){pasting=false;pastePoint='';canvas.preview([]);}}
function refreshObjectTools():void {
  if(!document.querySelector('#copy-objects'))return;
  query<HTMLButtonElement>('#copy-objects').disabled=!selected.size||busy;
  query<HTMLButtonElement>('#paste-objects').disabled=!clipboard||busy;
  query('#clipboard-status').textContent=clipboard?`${clipboard.scenery.length} objects copied${clipboard.sourceMap===mapId?'':` from ${clipboard.sourceMap}`}`:'Copy a selection, then paste it anywhere.';
  for(const mode of ['stamp','brush','erase'])query(`#${mode}-objects`).setAttribute('aria-pressed',String(mode==='stamp'?canvas.placing&&!canvas.paintMode:canvas.paintMode===mode));
}
function copySelection():void {
  if(busy)return;canvas.cancelGesture();
  try{clipboard=copyScenery(scene(),selected);refreshObjectTools();diagnostics([`Copied ${clipboard.scenery.length} objects and their activity positions. Paste chooses their new location. Doors and resident schedules stay with the originals.`]);}
  catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}
}
function previewPaste(x:number,y:number):void {
  if(!pasting||!clipboard||busy)return;
  const key=`${x.toFixed(1)},${y.toFixed(1)}`;if(key===pastePoint)return;pastePoint=key;
  if(x<0||y<0||x>scene().width||y>scene().height){canvas.preview([]);return;}
  try{const result=pasteScenery(scene(),clipboard,{x,y},canvas.snap);canvas.preview(result.scene.scenery.filter(item=>result.ids.includes(item.id)),[],result.scene);}
  catch(error){clearPaste();canvas.placing=false;diagnostics([error instanceof Error?error.message:String(error)],true);}
}
function startPaste():void {
  if(!clipboard||busy)return;
  try{checkClipboard(clipboard,palette,history.document.prefabs??[]);selectMode();clearScatterPreview();pasting=true;canvas.placing=true;
    const point=canvas.centerPoint();previewPaste(point.x,point.y);refreshObjectTools();
    if(pasting)query('#canvas-help').textContent=`Click to paste ${clipboard.scenery.length} objects · Esc cancels · Ctrl/Cmd V repeats`;
  }catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}
}
function brushSettings():BrushSettings {
  return {spacing:Number(query<HTMLInputElement>('#brush-spacing').value),variation:Number(query<HTMLInputElement>('#brush-variation').value),
    radius:Number(query<HTMLInputElement>('#erase-radius').value),clearance:Number(query<HTMLInputElement>('#brush-clearance').value),
    protectPaths:query<HTMLInputElement>('#brush-paths').checked,seed:strokeSeed++,snap:canvas.snap};
}
function objectMode(mode:'stamp'|'brush'|'erase'):void {
  if(busy)return;canvas.cancelGesture();clearPaste();clearPrefabPreview();clearScatterPreview();
  canvas.boxMode=false;canvas.panMode=false;canvas.zoneMode=false;
  canvas.paintMode=mode==='stamp'?undefined:mode;canvas.placing=mode==='stamp'&&!!(currentAsset||currentPrefabId);
  if(mode!=='stamp')currentPrefabId=undefined;
  canvas.paintRadius=mode==='erase'?Number(query<HTMLInputElement>('#erase-radius').value):Math.max(8,(currentAsset?.width??60)*.2);
  query('#canvas-help').textContent=mode==='brush'?'Choose an object · Drag to paint · Release commits one stroke · Esc cancels':mode==='erase'?'Sweep over objects to erase · Alt erases individual group children · Esc cancels':'Choose an object or group, then click to place it';
  query('#select-mode').setAttribute('aria-pressed','false');query('#box-mode').setAttribute('aria-pressed','false');
  refreshObjectTools();renderPalette();renderPrefabs();canvas.drawGuides();
}
function paintStroke(point:{x:number;y:number}):void {
  if(!stroke)return;stroke.move(point);history.preview(stroke.scene);canvas.paint(scene());query('#canvas-help').textContent=stroke.summary+' Release to finish · Esc cancels';
}

async function request(path: string, options?: RequestInit): Promise<{document?:unknown;revision?:string;error?:string;diagnostics?:string[]}> {
  const response = await fetch(path, options);
  const value = await response.json().catch(() => ({ error: 'The authoring service did not return a scene document.' }));
  if (!response.ok) throw new Error(value.error ?? value.diagnostics?.join('\n') ?? `Authoring service returned ${response.status}.`);
  return value;
}

function persistDraft(): void {
  try {
    if (dirty()) localStorage.setItem(draftKey, JSON.stringify(makeDraft(history.document, revision)));
    else localStorage.removeItem(draftKey);
  } catch { status('Unsaved · local draft storage is full'); }
}
function changed(render = true): void {
  clearPrefabPreview();
  clearScatterPreview();
  if (render) canvas.paint(scene());
  status(dirty() ? 'Unsaved · draft kept locally' : 'All changes saved');
  persistDraft(); refresh();
}
function refresh(): void {
  root.classList.toggle('is-busy',busy);
  canvas.editable=!busy;
  selected = new Set([...selected].filter(id => !editorView().hidden.has(id)&&scene().scenery.some(item => item.id === id)));
  canvas.hidden=editorView().hidden;canvas.locked=lockedScenery(scene(),editorView());
  canvas.selected = selected; canvas.drawGuides();
  query<HTMLButtonElement>('#undo').disabled = !history.canUndo || busy;
  query<HTMLButtonElement>('#redo').disabled = !history.canRedo || busy;
  query<HTMLButtonElement>('#save').disabled = !dirty() || busy;
  query('#map-size').textContent = `${scene().width.toLocaleString()} × ${scene().height.toLocaleString()} world units`;
  query('#object-count').textContent = String(scene().scenery.length);
  query('#map-name').textContent = maps.find(map => map.id === mapId)?.name ?? mapId;
  const districtFocus=query<HTMLSelectElement>('#district-focus'),focused=districtFocus.value;
  districtFocus.innerHTML=`<option value="">Entire map</option>${scene().districts.map(district=>`<option value="${escape(district.id)}"${district.id===focused?' selected':''}>${escape(district.label??district.id)}</option>`).join('')}`;
  query('#scene-stats').innerHTML = `<div class="stat"><strong>${scene().scenery.length}</strong><span>placed objects</span></div><div class="stat"><strong>${scene().terrain.length}</strong><span>terrain chunks</span></div><div class="stat"><strong>${scene().npcs.length}</strong><span>story characters</span></div><div class="stat"><strong>${scene().districts.length}</strong><span>districts</span></div>`;
  renderInspector();renderPrefabs();
  if([...selected].some(id=>canvas.locked.has(id))){
    query('#inspector').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(control=>{if(!['duplicate','lock-prefab','select-prefab'].includes(control.id))control.disabled=true;});
    query('#inspector').insertAdjacentHTML('beforeend','<p class="panel-note">Selection contains locked objects. Unlock view controls in Placed objects or unlock the prefab copy before editing.</p>');
  }
  query<HTMLButtonElement>('#frame-selection').disabled=!selected.size||busy;
  refreshObjectTools();
  outliner.update({world:scene(),prefabs:history.document.prefabs??[],selected,view:editorView(),select:selectPlaced,
    frame(ids){canvas.frameSelection(new Set(ids));},
    toggle(ids,kind){if(busy)return;const values=editorView()[kind],remove=ids.every(id=>values.has(id));for(const id of ids)if(remove)values.delete(id);else values.add(id);viewChanged();},
    reset(){if(busy)return;editorView().hidden.clear();editorView().locked.clear();viewChanged();},
  });
  let residentTools=document.querySelector<HTMLElement>('#resident-tools');
  if(!residentTools){residentTools=document.createElement('div');residentTools.id='resident-tools';residentTools.className='section';query('.inspector-panel').append(residentTools);}
  renderResidentTools(residentTools,scene(),selected,next=>{
    try{parseWorldSceneDocument({...history.document,maps:{...history.document.maps,[mapId]:next}});if(!editScene(next))return;changed();}
    catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}
  },(hour,weather)=>{try{canvas.showResidentGuide(hour,weather);diagnostics([hour===undefined?'Schedule guide hidden.':`Schedule guide at ${hour.toFixed(1)} hours. Gold circles are acting; blue circles are traveling; grey circles are home; violet circles are responding to rain; orange links connect an active exchange.`]);}catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}},message=>diagnostics([message],true));
}
function clearPrefabPreview():void {
  if(prefabProposal){prefabProposal=undefined;canvas.preview([]);}
}
function clearScatterPreview():void {
  if(proposal){proposal=undefined;canvas.preview([]);renderGenerator();}
}
function prefabAction(action:()=>void):void {
  if(busy)return;
  try{action();}catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}
}
function renderPrefabs():void {
  document.querySelector('#prefab-inspector')?.remove();
  query('#palette').hidden=libraryMode!=='objects';query('#prefab-tools').hidden=libraryMode!=='groups';query('#palette-help').hidden=libraryMode!=='objects';
  query('#outliner').hidden=libraryMode!=='placed';query('#search').hidden=libraryMode==='placed';query('#show-placed').setAttribute('aria-pressed',String(libraryMode==='placed'));
  query('#show-objects').setAttribute('aria-pressed',String(libraryMode==='objects'));query('#show-groups').setAttribute('aria-pressed',String(libraryMode==='groups'));
  query<HTMLInputElement>('#search').placeholder=libraryMode==='objects'?'Find trees, lamps, houses…':'Find reusable groups…';
  const catalog=history.document.prefabs??[],search=query<HTMLInputElement>('#search').value.trim().toLowerCase();
  const compatible=catalog.filter(prefab=>(libraryMode!=='groups'||prefab.name.toLowerCase().includes(search))&&prefab.scenery.every(child=>palette.some(item=>item.asset===child.asset&&item.frame===(child.frame??child.asset)&&item.variant===!!child.variant)));
  query('#prefab-tools').innerHTML=`<h3>Reusable groups</h3><p class="panel-note">Choose a group, then click the world. Its objects and activity positions stay editable.</p><div class="palette">${compatible.map(prefab=>`<button class="asset-card${currentPrefabId===prefab.id?' active':''}" data-prefab="${escape(prefab.id)}" title="Place ${escape(prefab.name)}"><span>${escape(prefab.name)}</span><small>${prefab.scenery.length} objects · v${prefab.revision}</small></button>`).join('')}</div>${compatible.length?'':'<p class="panel-note">Select objects to create your first reusable group.</p>'}`;
  query('#prefab-tools').querySelectorAll<HTMLButtonElement>('[data-prefab]').forEach(button=>button.onclick=()=>{
    canvas.cancelGesture();clearPaste();canvas.paintMode=undefined;
    clearPrefabPreview();proposal=undefined;canvas.preview([]);renderGenerator();
    currentPrefabId=button.dataset.prefab;currentAsset=undefined;canvas.placing=true;canvas.panMode=false;canvas.boxMode=false;canvas.zoneMode=false;
    query('#canvas-help').textContent=`Click to place ${catalog.find(item=>item.id===currentPrefabId)!.name} · Esc to select`;
    renderPalette();renderPrefabs();refreshObjectTools();
  });
  if(!selected.size)return;
  const instance=selectedPrefabInstance(scene(),selected),prefab=catalog.find(item=>item.id===instance?.prefabId);
  query('#inspector').insertAdjacentHTML('beforeend',`<div id="prefab-inspector" class="section"><h3>Reusable group</h3><label>Name<input id="prefab-name" maxlength="100" value="${escape(prefab?.name??'My group')}"></label><button id="capture-prefab">Save selection as new group</button>${instance&&prefab?`<p class="panel-note">${escape(prefab.name)} · Copy v${instance.revision}, catalog v${prefab.revision}. Local edits and deleted children survive updates.</p><div class="generation-actions"><button id="select-prefab">Select full group</button><button id="publish-prefab">Publish selection as v${prefab.revision+1}</button><button id="preview-prefab">Preview copy update</button><button id="detach-prefab">Detach copy</button><button id="lock-prefab">${instance.locked?'Unlock copy':'Lock copy'}</button></div>`:''}${prefabProposal?'<div class="generation-actions"><button id="apply-prefab" class="primary">Apply group update</button><button id="cancel-prefab">Cancel update</button></div>':''}</div>`);
  query('#capture-prefab').onclick=()=>prefabAction(()=>{
    if(!replaceDocument(savePrefabFromSelection(history.document,mapId,selected,query<HTMLInputElement>('#prefab-name').value)))return;changed();
  });
  if(instance&&prefab){
    query('#lock-prefab').onclick=()=>{if(!editScene(setPrefabLocked(scene(),instance.id,!instance.locked)))return;changed();};
    if(instance.locked)query('#inspector').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(control=>{if(!['lock-prefab','select-prefab','duplicate'].includes(control.id))control.disabled=true;});
    query('#select-prefab').onclick=()=>{selected=new Set(instance.members.map(member=>member.id).filter(id=>scene().scenery.some(item=>item.id===id)));refresh();};
    query('#publish-prefab').onclick=()=>prefabAction(()=>{
      if(!replaceDocument(savePrefabFromSelection(history.document,mapId,selected,query<HTMLInputElement>('#prefab-name').value,instance.id)))return;changed();
      diagnostics(['Catalog revision updated in this draft. Other copies keep their current objects until you preview and apply their updates. Save world publishes the validated document.']);
    });
    query('#preview-prefab').onclick=()=>prefabAction(()=>{
      proposal=undefined;renderGenerator();prefabProposal=previewPrefabUpdate(scene(),prefab,instance.id);
      const replacements=prefabProposal.scene.scenery.filter(item=>prefabProposal!.changedIds.includes(item.id));
      canvas.navigationVisible=true;query<HTMLInputElement>('#navigation-toggle').checked=true;
      canvas.preview([...prefabProposal.added,...replacements],[...prefabProposal.removedIds,...prefabProposal.changedIds],prefabProposal.scene);
      refresh();diagnostics([...prefabProposal.diagnostics,'Preview only. Apply the group update, validate, then save.']);
    });
    query('#detach-prefab').onclick=()=>{if(!editScene(detachPrefab(scene(),instance.id)))return;changed();};
  }
  if(prefabProposal){
    query('#apply-prefab').onclick=()=>{if(prefabProposal){if(!editScene(prefabProposal.scene))return;changed();}};
    query('#cancel-prefab').onclick=()=>{clearPrefabPreview();refresh();diagnostics(['Group update preview cancelled.']);};
  }
}

function renderInspector(): void {
  const items=scene().scenery.filter(item=>selected.has(item.id)), item=items[0];
  query('#selection-count').textContent = String(items.length);
  if (!item) {query('#inspector').innerHTML='<div class="inspector-empty">Select an object in the world to move it, change its size, or edit its collision.<br><br>Choose a palette item, then click the world to place it.</div>';return;}
  const single=items.length===1;
  query('#inspector').innerHTML=`<h3>${escape(single ? item.frame ?? item.asset : `${items.length} objects selected`)}</h3><p class="selected-id">${escape(single ? item.id : 'Changes apply to every selected object.')}</p>
    <div class="field-grid">${single ? `<label>X position<input data-field="x" type="number" step="1" value="${Math.round(item.x*10)/10}"></label><label>Y position<input data-field="y" type="number" step="1" value="${Math.round(item.y*10)/10}"></label>` : ''}
    <label>Width<input data-field="width" type="number" min="1" max="8192" step="1" value="${Math.round(item.width*10)/10}"></label><label>Depth override<input data-field="depth" type="number" step="1" placeholder="Auto" value="${item.depth??''}"></label></div>
    <label class="check"><input data-field="flipX" type="checkbox" ${item.flipX?'checked':''}> Flip horizontally</label>
    <label class="check"><input data-field="collidable" type="checkbox" ${item.collidable!==false?'checked':''}> Solid ground footprint</label>
    <label class="check"><input data-field="pinned" type="checkbox" ${item.pinned?'checked':''}> Protect from regeneration</label>
    <div class="inspector-actions"><button id="duplicate">Duplicate</button><button id="remove" class="danger">Delete</button></div>
    <div class="inspector-actions"><button id="group" ${items.length<2?'disabled':''}>Group</button><button id="ungroup" ${items.some(value=>value.groupId)?'':'disabled'}>Ungroup</button></div><p class="panel-note">Click a group to move it together. Alt-click selects one child.</p>
    ${single ? `<div class="section"><h3>Activity slots</h3><p class="panel-note">Give this object a place for a resident to sit, work, wait, or shelter. Slots move with their owner.</p><div id="activity-list">${(scene().activities??[]).filter(slot=>slot.ownerId===item.id).map(slot=>`<p class="selected-id">${escape(slot.kind)} · ${slot.offsetX}, ${slot.offsetY} <button data-remove-slot="${escape(slot.id)}" aria-label="Remove ${escape(slot.kind)} slot">×</button></p>`).join('')}</div><div class="field-grid"><label>Action<select id="slot-kind"><option>seat</option><option>work</option><option>pickup</option><option>service</option><option>shelter</option><option>wait</option></select></label><label>Feet offset Y<input id="slot-y" type="number" value="32"></label></div><button id="add-slot">Add activity slot</button></div>`:''}`;
  query('#inspector').querySelectorAll<HTMLInputElement>('input[data-field]').forEach(input=>input.addEventListener('change',()=>{
    const field=input.dataset.field as keyof SceneScenery;
    const value=input.type==='checkbox'?input.checked:input.value===''&&field==='depth'?undefined:Number(input.value);
    if(typeof value==='number'&&!Number.isFinite(value))return;
    const next=editScenery(scene(),selected,{[field]:value}),scenery=next.scenery;
    if(scenery.some(spec=>spec.width<=0||spec.width>8192||spec.x < -spec.width||spec.x>scene().width+spec.width||spec.y < -spec.width||spec.y>scene().height+spec.width)) {diagnostics(['Keep the object within one object width of the map edge, and use a width between 1 and 8192.'],true);refresh();return;}
    if(!editScene(next))return;changed();
  }));
  query('#duplicate').onclick=duplicate;
  query('#remove').onclick=remove;
  query('#group').onclick=()=>{if(!editScene(groupScenery(scene(),selected)))return;changed();};
  query('#ungroup').onclick=()=>{if(!editScene(ungroupScenery(scene(),selected)))return;changed();};
  if(single) {
    renderEntrances(item);
    query('#add-slot').onclick=()=>{
      const kind=query<HTMLSelectElement>('#slot-kind').value as NonNullable<WorldScene['activities']>[number]['kind'];
      const offsetY=Number(query<HTMLInputElement>('#slot-y').value);if(!Number.isFinite(offsetY))return;
      let count=1;const activities=scene().activities??[],used=sceneInstanceIds(scene());while(used.has(`${item.id}-${kind}-${count}`))count++;
      const next={...scene(),activities:[...activities,{id:`${item.id}-${kind}-${count}`,ownerId:item.id,kind,offsetX:0,offsetY,capacity:1}]};
      const point=sceneActivityPoint(next,next.activities.at(-1)!);
      if(point.x<0||point.y<0||point.x>next.width||point.y>next.height){diagnostics(['The activity position must stay inside the map.'],true);return;}
      if(!editScene(next))return;changed();
    };
    query('#activity-list').querySelectorAll<HTMLButtonElement>('[data-remove-slot]').forEach(button=>button.onclick=()=>{
      const users=sceneActivityUsers(scene(),new Set([button.dataset.removeSlot!]));
      if(users.length){diagnostics([`Reassign these resident tasks before removing the activity: ${users.join(', ')}.`],true);return;}
      if(!editScene({...scene(),activities:scene().activities?.filter(slot=>slot.id!==button.dataset.removeSlot)}))return;changed();
    });
  }
}
function duplicate():void {canvas.cancelGesture();const result=duplicateScenery(scene(),selected);if(!editScene(result.scene))return;selected=new Set(result.ids);changed();}
function remove():void {
  canvas.cancelGesture();
  if([...selected].some(id=>editorView().locked.has(id))){diagnostics(['Unlock the selected objects in Placed objects before deleting them.'],true);return;}
  try {if(!editScene(removeScenery(scene(),selected)))return;selected.clear();changed();}
  catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);canvas.navigationVisible=true;query<HTMLInputElement>('#navigation-toggle').checked=true;canvas.drawGuides();}
}
function renderEntrances(item:SceneScenery):void {
  const attached=(scene().entrances??[]).filter(door=>door.ownerId===item.id);
  const fields=(door:SceneEntrance):string=>[
    ['offsetX','Approach X',door.offsetX],['offsetY','Approach Y',door.offsetY],
    ['returnX','Return X',door.returnOffset?.x??door.offsetX],['returnY','Return Y',door.returnOffset?.y??door.offsetY],
  ].map(([key,label,value])=>`<label>${label}<input type="number" step="1" data-door="${escape(door.id)}" data-door-field="${key}" aria-label="${escape(door.interiorId)} ${label}" value="${value}"></label>`).join('');
  query('#inspector').insertAdjacentHTML('beforeend',`<div class="section"><h3>Building entrances</h3><p class="panel-note">Approach and return offsets move with this object. Each room has one entrance per map; assigning a room moves its entrance here.</p>${attached.map(door=>`<p class="selected-id">${escape(door.interiorId)} · ${escape(door.id)} <button data-remove-door="${escape(door.id)}" aria-label="Remove ${escape(door.interiorId)} entrance">×</button></p><div class="field-grid">${fields(door)}</div>`).join('')}<label>Room<select id="entrance-room">${sceneInteriorIds.map(id=>`<option value="${id}">${id}</option>`).join('')}</select></label><div class="field-grid"><label>Offset X<input id="entrance-x" type="number" value="0"></label><label>Offset Y<input id="entrance-y" type="number" value="32"></label></div><button id="assign-entrance">Assign entrance</button></div>`);
  query('#assign-entrance').onclick=()=>{
    const interiorId=query<HTMLSelectElement>('#entrance-room').value as SceneEntrance['interiorId'];
    const offsetX=Number(query<HTMLInputElement>('#entrance-x').value),offsetY=Number(query<HTMLInputElement>('#entrance-y').value);
    if(![offsetX,offsetY].every(Number.isFinite))return;
    const previous=scene().entrances?.find(door=>door.interiorId===interiorId);
    const entrance:SceneEntrance={id:previous?.id??`${interiorId}-entrance`,interiorId,ownerId:item.id,offsetX,offsetY};
    if(!editScene({...scene(),entrances:[...(scene().entrances??[]).filter(door=>door.interiorId!==interiorId),entrance]}))return;changed();
    canvas.navigationVisible=true;query<HTMLInputElement>('#navigation-toggle').checked=true;canvas.drawGuides();
  };
  query('#inspector').querySelectorAll<HTMLInputElement>('[data-door-field]').forEach(input=>input.onchange=()=>{
    const value=Number(input.value);if(!Number.isFinite(value))return;
    const entrances=scene().entrances?.map(door=>{
      if(door.id!==input.dataset.door)return door;
      const field=input.dataset.doorField;
      if(field==='returnX'||field==='returnY')return {...door,returnOffset:{x:door.returnOffset?.x??door.offsetX,y:door.returnOffset?.y??door.offsetY,[field==='returnX'?'x':'y']:value}};
      return {...door,[field!]:value};
    });
    if(!editScene({...scene(),entrances}))return;changed();
  });
  query('#inspector').querySelectorAll<HTMLButtonElement>('[data-remove-door]').forEach(button=>button.onclick=()=>{
    if(!editScene({...scene(),entrances:scene().entrances?.filter(door=>door.id!==button.dataset.removeDoor)}))return;changed();
    diagnostics(['Entrance removed from this draft. Required rooms must be reassigned before saving.']);
  });
}
function renderPalette():void {
  const search=query<HTMLInputElement>('#search').value.trim().toLowerCase();
  query('#palette').innerHTML=palette.filter(item=>`${item.asset} ${item.frame}`.includes(search)).map((item)=>{
    const index=palette.indexOf(item),active=currentAsset===item;
    return `<button class="asset-card${active?' active':''}" data-palette="${index}" title="Place ${escape(item.frame)}"><span class="asset-art">${item.thumbnail?`<img alt="" src="${item.thumbnail}">`:''}</span><span class="asset-name">${escape(item.frame.replaceAll('-',' '))}</span></button>`;
  }).join('');
  query('#palette').querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(button=>button.onclick=()=>{
    canvas.cancelGesture();clearPaste();clearPrefabPreview();clearScatterPreview();currentPrefabId=undefined;
    canvas.paintMode=canvas.paintMode==='brush'?'brush':undefined;
    currentAsset=palette[Number(button.dataset.palette)];canvas.placing=true;canvas.panMode=false;canvas.boxMode=false;canvas.zoneMode=false;
    canvas.paintRadius=Math.max(8,currentAsset.width*.2);
    query('#canvas-help').textContent=canvas.paintMode?`Drag to paint ${currentAsset.frame.replaceAll('-',' ')} · Esc cancels the stroke`:`Click to place ${currentAsset.frame.replaceAll('-',' ')} · Esc to select`;
    renderPalette();refreshObjectTools();
  });
}
async function loadMap():Promise<void> {
  canvas.cancelGesture();clearPaste();canvas.paintMode=undefined;
  busy=true;root.classList.add('is-busy');query('#loading').hidden=false;query<HTMLSelectElement>('#map-select').disabled=true;
  canvas.editable=false;
  try {
    selected.clear();currentAsset=undefined;currentPrefabId=undefined;prefabProposal=undefined;canvas.placing=false;canvas.preview([]);
    canvas.hidden=editorView().hidden;canvas.locked=lockedScenery(scene(),editorView());canvas.cancelGesture();canvas.boxMode=false;
    await canvas.loadWorld(scene());palette=canvas.palette();renderPalette();generationZone=undefined;proposal=undefined;renderGenerator();
    query('#canvas-help').textContent='Drag objects to move · Drag empty space to select · F to frame · Space-drag to pan';
    diagnostics(['Place objects with the palette. Validate before saving to check every interaction remains reachable.']);
  } catch(error){diagnostics([String(error)],true);}
  finally{busy=false;query('#loading').hidden=true;query<HTMLSelectElement>('#map-select').disabled=false;refresh();}
}
function renderGenerator():void {
  const zones=scene().generationZones??[];
  query('#generation-tools').innerHTML=`<div class="panel-title"><h3>Generate objects</h3><span class="count">Seeded</span></div><p class="panel-note">Draw a region containing buildable land. Paths and interaction approaches stay clear. Preview every change before applying it.</p>
    <label>Generation region<select id="generation-zone"><option value="">${generationZone?'Drawn region':'Choose or draw a region'}</option>${zones.map(zone=>`<option value="zone:${zone.id}"${generationZone?.id===zone.id?' selected':''}>${escape(zone.id)}</option>`).join('')}${scene().districts.map(district=>`<option value="district:${district.id}">${escape(district.label??district.id)}</option>`).join('')}</select></label>
    <div class="generation-actions"><button id="draw-generation-zone">Draw region</button></div>
    <div class="generation-fields"><label>Seed<input id="generation-seed" type="number" step="1" value="${generationZone?.seed??42}"></label><label>Object count<input id="generation-count" type="number" min="1" max="300" value="${generationZone?.count??12}"></label><label>Spacing<input id="generation-spacing" type="number" min="8" value="${generationZone?.minSpacing??70}"></label><label>Path clearance<input id="generation-clearance" type="number" min="0" value="${generationZone?.clearance??12}"></label></div>
    <label style="margin-top:10px">Palette <small>Ctrl / Cmd to choose several</small><select id="generation-palette" multiple size="5">${palette.map((item,index)=>`<option value="${index}"${generationZone?.palette.includes(item.frame)||!generationZone&&item.asset==='tree'?' selected':''}>${escape(item.frame.replaceAll('-',' '))}</option>`).join('')}</select></label>
    <div class="generation-actions"><button id="preview-generation">Preview</button><button id="apply-generation" class="primary" disabled>Apply</button><button id="clear-generation">Clear preview</button></div><p id="generation-summary" class="panel-note">${generationZone?'Region ready. Choose objects and preview.':'Draw a region on land to begin.'}</p>`;
  query('#draw-generation-zone').onclick=()=>{canvas.cancelGesture();clearPaste();canvas.paintMode=undefined;currentPrefabId=undefined;clearPrefabPreview();canvas.zoneMode=true;canvas.boxMode=false;canvas.placing=false;canvas.panMode=false;currentAsset=undefined;renderPalette();refreshObjectTools();query('#canvas-help').textContent='Drag a rectangle over buildable land · Include no water';};
  query<HTMLSelectElement>('#generation-zone').onchange=()=>{
    const value=query<HTMLSelectElement>('#generation-zone').value;
    if(value.startsWith('zone:'))generationZone=structuredClone(zones.find(zone=>zone.id===value.slice(5))!);
    else if(value.startsWith('district:')){const district=scene().districts.find(district=>district.id===value.slice(9))!;generationZone={id:`${mapId}-${district.id}-scatter`,seed:42,rulesVersion:1,polygon:district.polygon,palette:palette.filter(item=>item.asset==='tree').map(item=>item.frame)};}
    renderGenerator();
  };
  query('#preview-generation').onclick=()=>{
    clearPrefabPreview();currentPrefabId=undefined;
    if(!generationZone){diagnostics(['Draw a land-only generation region or select a district first.'],true);return;}
    try {
      const templates=[...query<HTMLSelectElement>('#generation-palette').selectedOptions].map(option=>palette[Number(option.value)]);
      const zone={...generationZone,seed:Number(query<HTMLInputElement>('#generation-seed').value)};
      proposal=generateScatter(scene(),zone,templates,{count:Number(query<HTMLInputElement>('#generation-count').value),minSpacing:Number(query<HTMLInputElement>('#generation-spacing').value),clearance:Number(query<HTMLInputElement>('#generation-clearance').value),minScale:.9,maxScale:1.1});
      canvas.preview(proposal.added,proposal.removedIds);query<HTMLButtonElement>('#apply-generation').disabled=proposal.added.length===0&&proposal.removedIds.length===0;
      query('#generation-summary').textContent=proposal.diagnostics.join(' ');
      diagnostics([...proposal.diagnostics,'Green outlines show new objects. Orange outlines show replaced instances. Nothing is saved until you apply and save.']);
    }catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}
  };
  query('#apply-generation').onclick=()=>{if(!proposal)return;try{if(!editScene(applyScatter(scene(),proposal)))return;selected=new Set(proposal.added.map(item=>item.id));generationZone=proposal.zone;canvas.preview([]);proposal=undefined;changed();renderGenerator();}catch(error){clearScatterPreview();diagnostics([error instanceof Error?error.message:String(error)],true);}};
  query('#clear-generation').onclick=()=>{proposal=undefined;canvas.preview([]);query<HTMLButtonElement>('#apply-generation').disabled=true;query('#generation-summary').textContent='Preview cleared. The saved objects are unchanged.';};
}

async function validate():Promise<void> {
  if(busy)return;canvas.cancelGesture();clearPaste();busy=true;refresh();status('Validating paths and artwork…');
  try {await request('/__authoring/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(history.document)});diagnostics(['Valid scene. All registered interactions are reachable, and artwork references resolve.']);status(dirty()?'Valid · ready to save':'All changes saved');}
  catch(error){diagnostics(String(error instanceof Error?error.message:error).split('\n'),true);status('Validation needs attention');}
  finally{busy=false;refresh();}
}
async function save():Promise<void> {
  if(busy||!dirty())return;canvas.cancelGesture();clearPaste();busy=true;refresh();status('Validating and saving…');const submitted=JSON.stringify(history.document);
  try {
    const result=await request('/__authoring/world',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':`"${revision}"`},body:submitted});
    revision=result.revision!;savedDocument=submitted;persistDraft();status('All changes saved');
    diagnostics(['Saved the world and server interaction registry. Restart the development game server to load updated server coordinates.']);
  } catch(error){diagnostics(String(error instanceof Error?error.message:error).split('\n'),true);status('Save stopped · draft retained');persistDraft();}
  finally{busy=false;refresh();}
}

const canvas=new LevelEditorCanvas({
  select(ids){clearPrefabPreview();selected=new Set(ids);refresh();},
  beginDrag(){clearPrefabPreview();clearScatterPreview();history.begin();dragChanged=false;},
  cancelDrag(){history.cancel();dragChanged=false;changed();},
  beginStroke(mode,point,individual){
    clearPaste();clearPrefabPreview();clearScatterPreview();
    try{stroke=new ObjectPaintStroke(scene(),mode,currentAsset,brushSettings(),
      {hidden:new Set(editorView().hidden),locked:lockedScenery(scene(),editorView())},item=>canvas.bounds(item),individual);
      strokeSelection=new Set(selected);history.begin();paintStroke(point);
    }catch(error){stroke=undefined;diagnostics([error instanceof Error?error.message:String(error)],true);}
  },
  stroke(point){paintStroke(point);},
  endStroke(cancelled){
    if(!stroke)return;const finished=stroke;stroke=undefined;
    const nextHint=finished.mode==='brush'?'Drag to paint another stroke · Esc returns to selection':'Sweep to erase · Alt erases individual group children · Esc returns to selection';
    query('#canvas-help').textContent=nextHint;
    if(cancelled){history.cancel();selected=strokeSelection;changed();diagnostics(['Stroke cancelled.']);return;}
    history.commit();selected=finished.mode==='brush'?new Set(finished.changedIds):new Set([...strokeSelection].filter(id=>!finished.changedIds.has(id)));
    changed();diagnostics([finished.summary]);
  },
  drag(positions,final){
    if(final){if(history.commit()){changed(false);dragChanged=false;}return;}
    if(!positions.size)return;
    history.preview(preservePrefabPlacement(scene(),{...scene(),scenery:scene().scenery.map(item=>positions.has(item.id)?{...item,...positions.get(item.id)!,...(item.generatorId?{pinned:true}:{})}:item)}));
    dragChanged=true;canvas.paint(scene());
  },
  place(x,y){
    if(pasting&&clipboard&&!busy){
      if(x<0||y<0||x>scene().width||y>scene().height)return;
      try{const result=pasteScenery(scene(),clipboard,{x,y},canvas.snap);if(!editScene(result.scene))return;
        selected=new Set(result.ids);selectMode();changed();diagnostics([`Pasted ${result.ids.length} objects. Validate their new activity approaches before saving.`]);
      }catch(error){diagnostics([error instanceof Error?error.message:String(error)],true);}return;
    }
    if(currentPrefabId&&!busy){
      const prefab=history.document.prefabs?.find(item=>item.id===currentPrefabId);if(!prefab)return;
      const snap=(n:number)=>canvas.snap?Math.round(n/canvas.snap)*canvas.snap:n;
      const result=stampPrefab(scene(),prefab,{x:snap(x),y:snap(y)});
      if(!editScene(result.scene))return;selected=new Set(result.ids);changed();return;
    }
    if(!currentAsset||busy||x<0||y<0||x>scene().width||y>scene().height)return;
    const snap=(n:number)=>canvas.snap?Math.round(n/canvas.snap)*canvas.snap:n;
    const id=nextSceneryId(scene(),currentAsset.asset),item:SceneScenery={id,asset:currentAsset.asset,frame:currentAsset.frame,variant:currentAsset.variant,x:snap(x),y:snap(y),width:currentAsset.width,motion:currentAsset.motion??'still'};
    if(!editScene({...scene(),scenery:[...scene().scenery,item]}))return;selected=new Set([id]);changed();
  },
  pointer(x,y){query('#coordinates').textContent=`${Math.round(x)}, ${Math.round(y)}`;previewPaste(x,y);},
  ready(){void loadMap();},
  zone(rectangle){
    if(rectangle.width<24||rectangle.height<24){diagnostics(['Draw a generation zone at least 24 units wide and high.'],true);return;}
    let count=1;while(scene().generationZones?.some(zone=>zone.id===`${mapId}-scatter-${count}`))count++;
    const {x,y,width,height}=rectangle;
    generationZone={id:generationZone?.id??`${mapId}-scatter-${count}`,seed:42,rulesVersion:1,polygon:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]],palette:['tree']};
    renderGenerator();query('#canvas-help').textContent='Land-only zone selected · Preview the generated objects before applying';
  },
});

async function boot():Promise<void> {
  if(!import.meta.env.DEV)throw new Error('World Studio is available in the development build.');
  const result=await request('/__authoring/world');history=new LevelEditorHistory(parseWorldSceneDocument(result.document));revision=result.revision!;savedDocument=JSON.stringify(history.document);
  const requested=new URLSearchParams(location.search).get('map');if(requested&&history.document.maps[requested])mapId=requested;
  root.innerHTML=`<main class="studio"><header class="topbar"><div class="brand"><span class="brand-icon">⌖</span><div><small>The Lantern Atlas</small><h1>World Studio</h1></div></div><div class="toolbar"><select id="map-select" aria-label="World map">${Object.values(history.document.maps).map(map=>`<option value="${map.id}"${map.id===mapId?' selected':''}>${escape(maps.find(spec=>spec.id===map.id)?.name??map.id)}</option>`).join('')}</select><button id="undo" title="Undo · Ctrl/Cmd Z" aria-label="Undo">↶</button><button id="redo" title="Redo · Ctrl/Cmd Shift Z" aria-label="Redo">↷</button><div class="toolbar-end"><span id="save-status" class="save-status" aria-live="polite">All changes saved</span><button id="validate">Validate</button><button id="save" class="primary">Save world</button></div></div></header>
  <div id="draft-banner" class="draft-banner" hidden><span id="draft-description"></span><button id="recover-draft">Recover draft</button><button id="discard-draft">Dismiss</button></div>
  <div class="studio-body"><aside class="sidebar palette-panel"><div class="panel-title"><h2>Object library</h2><span id="object-count" class="count"></span></div><div class="library-tabs"><button id="show-objects" aria-pressed="true">Objects</button><button id="show-groups" aria-pressed="false">Groups</button><button id="show-placed" aria-pressed="false">Placed</button></div><input class="search" id="search" type="search" placeholder="Find trees, lamps, houses…" aria-label="Search object library"><div id="object-tools" class="object-tools"><div class="object-actions"><button id="copy-objects" title="Copy selection · Ctrl/Cmd C">Copy</button><button id="paste-objects" title="Paste objects · Ctrl/Cmd V" disabled>Paste</button></div><p id="clipboard-status" class="tool-note"></p><div class="object-actions" aria-label="Object placement tools"><button id="stamp-objects" aria-pressed="false">Stamp</button><button id="brush-objects" aria-pressed="false" title="Paint objects · B">Brush</button><button id="erase-objects" aria-pressed="false" title="Erase objects · E">Erase</button></div><details><summary>Brush & erase settings</summary><div class="generation-fields"><label>Brush spacing<input id="brush-spacing" type="number" min="8" max="512" value="70"></label><label>Size variation %<input id="brush-variation" type="number" min="0" max="30" value="10"></label><label>Path clearance<input id="brush-clearance" type="number" min="0" max="120" value="12"></label><label>Erase radius<input id="erase-radius" type="number" min="4" max="256" value="32"></label></div><label class="check"><input id="brush-paths" type="checkbox" checked> Keep paths clear</label><p class="tool-note">Paint on buildable ground. Each stroke is one undo step. Erase keeps locked, hidden, pinned and referenced objects.</p></details></div><div id="palette" class="palette"></div><p id="palette-help" class="panel-note">Choose an object, then place it anywhere in the world. Each instance stays independently editable.</p><div id="prefab-tools" class="section"></div><div id="outliner" hidden></div><div class="section"><h3>View</h3><label class="check"><input id="navigation-toggle" type="checkbox"> Paths, collision & activity slots</label><label class="check"><input id="grid-toggle" type="checkbox"> Show world grid</label><label class="check"><input id="snap-toggle" type="checkbox"> Snap to 16 units</label><label>Lighting<select id="period"><option value="day">Day</option><option value="night">Night</option></select></label><label class="section">Go to district<select id="district-focus"><option value="">Entire map</option></select></label></div><div id="generation-tools" class="section"></div></aside>
  <section class="canvas-shell" aria-label="Editable world canvas"><div id="canvas" class="canvas-host"></div><div class="canvas-top"><span id="map-name" class="pill"></span><span id="map-size" class="pill"></span></div><div class="canvas-tools"><button id="select-mode" title="Select objects">Select</button><button id="box-mode" title="Box select objects" aria-pressed="false">Box</button><button id="pan-mode" title="Pan map">Pan</button><button id="frame-selection" title="Frame selection · F">Frame</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="fit">Fit</button></div><div id="canvas-help" class="canvas-help">Loading the world…</div><div id="loading" class="canvas-loading">Opening the world…</div></section>
  <aside class="sidebar inspector-panel"><div class="panel-title"><h2>Inspector</h2><span id="selection-count" class="count">0</span></div><div id="inspector"></div><div class="section"><div class="panel-title"><h2>Validation</h2></div><div id="diagnostics" class="diagnostics" aria-live="polite"></div></div><div class="section"><h3>This map</h3><div id="scene-stats" class="stats"></div></div></aside></div>
  <footer class="footer"><span>Development workspace</span><span id="footer-status" aria-live="polite">All changes saved</span><span id="coordinates">0, 0</span></footer></main>`;
  outliner=new EditorOutliner(query('#outliner'));
  query<HTMLSelectElement>('#map-select').onchange=()=>{canvas.cancelGesture();mapId=query<HTMLSelectElement>('#map-select').value;void loadMap();};
  query<HTMLInputElement>('#search').oninput=()=>{renderPalette();renderPrefabs();};
  for(const mode of ['objects','groups','placed'] as const)query(`#show-${mode}`).onclick=()=>{libraryMode=mode;query<HTMLInputElement>('#search').value='';renderPalette();renderPrefabs();};
  const changeHistory=(redo=false):void=>{const cancelled=canvas.cancelGesture();clearPaste();if(!cancelled){if(redo)history.redo();else history.undo();}changed();};
  query('#undo').onclick=()=>changeHistory();query('#redo').onclick=()=>changeHistory(true);
  query('#copy-objects').onclick=copySelection;query('#paste-objects').onclick=startPaste;
  for(const mode of ['stamp','brush','erase'] as const)query(`#${mode}-objects`).onclick=()=>objectMode(mode);
  query<HTMLInputElement>('#erase-radius').onchange=()=>{if(canvas.paintMode==='erase')objectMode('erase');};
  query('#validate').onclick=()=>void validate();query('#save').onclick=()=>void save();
  query('#select-mode').onclick=()=>selectMode();
  query('#box-mode').onclick=()=>selectMode(true);query('#frame-selection').onclick=()=>canvas.frameSelection();
  query('#pan-mode').onclick=()=>{selectMode();canvas.panMode=true;query('#canvas-help').textContent='Drag to pan · Scroll to zoom · Select to edit objects';};
  query('#zoom-in').onclick=()=>canvas.zoom(1.2);query('#zoom-out').onclick=()=>canvas.zoom(1/1.2);query('#fit').onclick=()=>{query<HTMLSelectElement>('#district-focus').value='';canvas.fit();};
  query<HTMLInputElement>('#navigation-toggle').onchange=()=>{canvas.navigationVisible=query<HTMLInputElement>('#navigation-toggle').checked;canvas.drawGuides();};
  query<HTMLInputElement>('#grid-toggle').onchange=()=>{canvas.gridVisible=query<HTMLInputElement>('#grid-toggle').checked;canvas.drawGuides();};
  query<HTMLInputElement>('#snap-toggle').onchange=()=>{canvas.snap=query<HTMLInputElement>('#snap-toggle').checked?16:0;};
  query<HTMLSelectElement>('#period').onchange=()=>{canvas.period=query<HTMLSelectElement>('#period').value as 'day'|'night';void loadMap();};
  query<HTMLSelectElement>('#district-focus').onchange=()=>canvas.frameDistrict(query<HTMLSelectElement>('#district-focus').value);
  try {const raw=localStorage.getItem(draftKey);if(raw){const draft=readDraft(raw);if(JSON.stringify(draft.document)===savedDocument){localStorage.removeItem(draftKey);}else{query('#draft-banner').hidden=false;query('#draft-description').textContent=`A local draft from ${new Date(draft.savedAt).toLocaleString()} is available.${draft.baseRevision!==revision?' The saved world has changed since this draft.':''}`;
    query('#recover-draft').onclick=()=>{if(!replaceDocument(draft.document))return;if(draft.baseRevision!==revision)revision=draft.baseRevision;query('#draft-banner').hidden=true;changed(false);void loadMap();diagnostics(draft.baseRevision!==revision?['Recovered an older draft. Review it carefully against the saved world before saving.']:['Recovered your local draft.']);};
    query('#discard-draft').onclick=()=>{query('#draft-banner').hidden=true;};}}}
  catch{diagnostics(['A local draft could not be opened. The saved world is available.'],true);}
  document.addEventListener('keydown',event=>{
    if((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')||busy)return;
    const command=event.metaKey||event.ctrlKey;
    if(event.code==='Space'&&!(event.target as HTMLElement).closest('button,a,summary')){event.preventDefault();canvas.spacePan=true;}
    else if(!command&&event.key.toLowerCase()==='f'){event.preventDefault();canvas.frameSelection();}
    else if(command&&event.key.toLowerCase()==='s'){event.preventDefault();void save();}
    else if(command&&event.key.toLowerCase()==='z'){event.preventDefault();changeHistory(event.shiftKey);}
    else if(command&&event.key.toLowerCase()==='c'&&selected.size&&!window.getSelection()?.toString()){event.preventDefault();copySelection();}
    else if(command&&event.key.toLowerCase()==='v'&&clipboard){event.preventDefault();startPaste();}
    else if(command&&event.key.toLowerCase()==='d'){event.preventDefault();duplicate();}
    else if(!command&&event.key.toLowerCase()==='b'){event.preventDefault();objectMode('brush');}
    else if(!command&&event.key.toLowerCase()==='e'){event.preventDefault();objectMode('erase');}
    else if((event.key==='Delete'||event.key==='Backspace')&&selected.size){event.preventDefault();remove();}
    else if(event.key==='Escape'){canvas.cancelGesture();history.cancel();if(dragChanged){canvas.paint(scene());dragChanged=false;}selectMode();refresh();}
  });
  document.addEventListener('keyup',event=>{if(event.code==='Space')canvas.spacePan=false;});
  window.addEventListener('blur',()=>{canvas.spacePan=false;canvas.cancelGesture();});
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  const host=query('#canvas');
  const game=new Phaser.Game({type:Phaser.AUTO,parent:host,width:host.clientWidth,height:host.clientHeight,transparent:true,antialias:true,scene:[canvas],input:{mouse:{preventDefaultWheel:true}},render:{pixelArt:false,roundPixels:false}});
  new ResizeObserver(()=>{game.scale.resize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight));if(canvas.world)canvas.frameDistrict(query<HTMLSelectElement>('#district-focus').value);}).observe(host);
}
void boot().catch(error=>{root.innerHTML=`<div class="error-page"><h1>World Studio</h1><p>${escape(error instanceof Error?error.message:error)}</p><p>Start the development workspace with <code>npm run dev</code>, then open <code>http://localhost:5187/editor.html</code>.</p></div>`;});
