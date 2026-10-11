import {sceneActivityPoint,type SceneResidentTask,type WorldScene} from './scene-schema';
import {residentActionLooks,type ResidentActionLook} from './resident-action-art';
import {weatherPreviewLabels,type WorldWeatherMode} from './world-weather';

let selectedResidentId:string|undefined;
let previewHour=9;
let previewWeather:WorldWeatherMode='regional';
const escape=(value:unknown):string=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const actions:Record<string,SceneResidentTask['action']>={seat:'read',work:'work',pickup:'carry',service:'serve',shelter:'shelter',wait:'wait'};

/** The schedule form edits the same scene used by play and Tiled exchanges. */
export function renderResidentTools(host:HTMLElement,scene:WorldScene,selected:ReadonlySet<string>,change:(scene:WorldScene)=>void,preview:(hour:number|undefined,weather:WorldWeatherMode)=>void,error:(message:string)=>void):void {
  const residents=scene.residents??[];
  const resident=residents.find(resident=>resident.id===selectedResidentId)??residents[0];
  selectedResidentId=resident?.id;
  const field=(label:string,key:string,value:number)=>`<label>${label}<input type="number" step="0.1" data-resident="${key}" value="${value}"></label>`;
  const options=(current:string|undefined,empty=false)=>`${empty?'<option value="">None</option>':''}${(scene.activities??[]).map(slot=>`<option value="${slot.id}"${current===slot.id?' selected':''}>${escape(slot.id)} · ${slot.kind}</option>`).join('')}`;
  host.innerHTML=`<h3>Residents & daily activities</h3><p class="panel-note">Give a resident a home and timed visits to usable objects. Travel and waiting must fit inside each time window.</p>
    <label>Resident<select id="resident-select">${residents.map(item=>`<option value="${item.id}"${item===resident?' selected':''}>${escape(item.name)}</option>`).join('')}</select></label>
    <button id="add-resident">Add resident</button>
    ${resident?`<label>Name<input id="resident-name" maxlength="60" value="${escape(resident.name)}"></label><div class="field-grid">${field('Home X','home-x',resident.home.x)}${field('Home Y','home-y',resident.home.y)}${field('Walking speed','speed',resident.speed)}</div>
    <label>Action appearance<select id="resident-action-art" aria-label="Action appearance"><option value="">Current avatar · basic actions</option>${Object.entries(residentActionLooks).map(([id,look])=>`<option value="${id}"${resident.actionArt===id?' selected':''}>${look.label}</option>`).join('')}</select></label><p class="panel-note">Painted looks include seated reading, work, serving, greetings and carrying. Choosing one also sets the matching walking appearance.</p>
    <button id="resident-home">Home at selected object’s activity</button><button id="remove-resident">Remove resident</button>
    ${resident.schedule.map((task,index)=>`<details class="section" data-task="${task.id}"${index===0?' open':''}><summary>${escape(task.id)} · ${task.startHour}–${task.endHour}</summary>
      <label>Activity<select data-task-field="activityId" aria-label="${task.id} activity">${options(task.activityId)}</select></label>
      <label>Action<select data-task-field="action" aria-label="${task.id} action">${['wait','sit','read','carry','serve','work','greet','shelter'].map(action=>`<option${task.action===action?' selected':''}>${action}</option>`).join('')}</select></label>
      <div class="field-grid">${[['Start hour','startHour',task.startHour],['End hour','endHour',task.endHour],['Action seconds','durationSeconds',task.durationSeconds]].map(([label,key,value])=>`<label>${label}<input type="number" step="0.1" data-task-field="${key}" aria-label="${task.id} ${label}" value="${value}"></label>`).join('')}</div>
      <label>Fallback<select data-task-field="fallbackActivityId" aria-label="${task.id} fallback">${options(task.fallbackActivityId,true)}</select></label>
      <label>Held object<select data-task-field="heldObject" aria-label="${task.id} held object"><option value="">None</option>${['book','parcel','tool'].map(kind=>`<option${task.heldObject===kind?' selected':''}>${kind}</option>`).join('')}</select></label>
      <label>Face while acting<select data-task-field="facing" aria-label="${task.id} facing"><option value="">Arrival direction</option>${['left','right'].map(direction=>`<option${task.facing===direction?' selected':''}>${direction}</option>`).join('')}</select></label>
      <button data-remove-task="${task.id}">Remove ${escape(task.id)}</button></details>`).join('')}
    <button id="add-resident-task">Add daily activity</button>`:''}
    <div class="section"><label>Schedule preview hour<input id="resident-preview-hour" type="number" min="0" max="23.99" step="0.1" value="${previewHour}"></label><label>Weather preview<select id="resident-preview-weather">${Object.entries(weatherPreviewLabels).map(([value,label])=>`<option value="${value}"${value===previewWeather?' selected':''}>${label}</option>`).join('')}</select></label><button id="preview-residents">Show schedule guide</button><button id="clear-resident-preview">Hide schedule guide</button><p class="panel-note">Guide circles show sampled positions; violet marks a rain response. Work resumes only if it still fits the schedule. Save the validated scene, then use the game preview for character artwork.</p><a href="/qa/world-assets.html?map=${scene.id}" target="_blank" rel="noopener">Open game preview</a></div>`;
  const query=<T extends HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
  const apply=(edit:(next:WorldScene)=>void)=>{const next=structuredClone(scene);edit(next);change(next);};
  query<HTMLSelectElement>('#resident-select').onchange=()=>{selectedResidentId=query<HTMLSelectElement>('#resident-select').value;renderResidentTools(host,scene,selected,change,preview,error);};
  query<HTMLButtonElement>('#add-resident').onclick=()=>apply(next=>{
    let index=1;while([...next.npcs,...(next.residents??[])].some(item=>item.id===`${scene.id}-neighbor-${index}`))index++;
    selectedResidentId=`${scene.id}-neighbor-${index}`;
    (next.residents??=[]).push({id:selectedResidentId,name:`Neighbor ${index}`,home:{...scene.spawn},speed:60,avatar:{hair:'#62412f',skin:'#c18b60',outfit:'#4e729a'},schedule:[]});
  });
  query<HTMLButtonElement>('#preview-residents').onclick=()=>{const hour=Number(query<HTMLInputElement>('#resident-preview-hour').value);if(!Number.isFinite(hour)||hour<0||hour>=24){error('Choose an hour between 0 and 24.');return;}previewHour=hour;previewWeather=query<HTMLSelectElement>('#resident-preview-weather').value as WorldWeatherMode;preview(hour,previewWeather);};
  query<HTMLButtonElement>('#clear-resident-preview').onclick=()=>preview(undefined,previewWeather);
  if(!resident)return;
  const edit=(mutate:(resident:NonNullable<WorldScene['residents']>[number])=>void)=>apply(next=>mutate(next.residents!.find(item=>item.id===resident.id)!));
  query<HTMLSelectElement>('#resident-action-art').onchange=()=>edit(item=>{
    const look=query<HTMLSelectElement>('#resident-action-art').value as ResidentActionLook;
    if(!look){delete item.actionArt;return;}
    item.actionArt=look;item.avatar={...residentActionLooks[look].avatar};delete item.artVariant;
  });
  query<HTMLInputElement>('#resident-name').onchange=()=>{const name=query<HTMLInputElement>('#resident-name').value.trim();if(name)edit(item=>{item.name=name;});};
  host.querySelectorAll<HTMLInputElement>('[data-resident]').forEach(input=>input.onchange=()=>{
    const value=Number(input.value);if(!Number.isFinite(value))return;
    edit(item=>{if(input.dataset.resident==='speed')item.speed=value;else item.home[input.dataset.resident==='home-x'?'x':'y']=value;});
  });
  query<HTMLButtonElement>('#resident-home').onclick=()=>{
    const slot=scene.activities?.find(slot=>selected.has(slot.ownerId));
    if(!slot){error('Select an object with an activity position first.');return;}
    edit(item=>{item.home=sceneActivityPoint(scene,slot);});
  };
  query<HTMLButtonElement>('#remove-resident').onclick=()=>apply(next=>{next.residents=next.residents?.filter(item=>item.id!==resident.id);});
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(section=>section.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-task-field]').forEach(input=>input.onchange=()=>{
    const key=input.dataset.taskField!,value=input instanceof HTMLInputElement?Number(input.value):input.value;
    if(typeof value==='number'&&!Number.isFinite(value))return;
    edit(item=>{const task=item.schedule.find(task=>task.id===section.dataset.task)!;if(value==='')delete (task as unknown as Record<string,unknown>)[key];else Object.assign(task,{[key]:value});});
  }));
  host.querySelectorAll<HTMLButtonElement>('[data-remove-task]').forEach(button=>button.onclick=()=>edit(item=>{item.schedule=item.schedule.filter(task=>task.id!==button.dataset.removeTask);}));
  query<HTMLButtonElement>('#add-resident-task').onclick=()=>{
    const slot=scene.activities?.find(slot=>selected.has(slot.ownerId))??scene.activities?.[0];
    if(!slot){error('Add an activity position to an object before scheduling a visit.');return;}
    const start=Array.from({length:23},(_,index)=>(index+8)%23).find(hour=>!resident.schedule.some(task=>hour<task.endHour&&hour+1>task.startHour));
    if(start===undefined){error('Make room in the existing schedule before adding another visit.');return;}
    edit(item=>{let n=1;while(item.schedule.some(task=>task.id===`visit-${n}`))n++;item.schedule.push({id:`visit-${n}`,activityId:slot.id,action:actions[slot.kind],startHour:start,endHour:start+1,durationSeconds:10});});
  };
}
