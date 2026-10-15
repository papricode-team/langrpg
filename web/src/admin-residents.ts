import {escapeHtml} from './icons';
import {sceneActivityPoint,type SceneResidentTask,type WorldScene} from './scene-schema';
import {residentActionLooks,type ResidentActionLook} from './resident-action-art';

let selectedResidentId:string|undefined;
const escape=(value:unknown):string=>escapeHtml(String(value));
const actions:Record<string,SceneResidentTask['action']>={seat:'read',work:'work',pickup:'carry',service:'serve',shelter:'shelter',wait:'wait'};

/**
 * Residents and their daily schedules. Each change publishes the town's
 * resident list as one edit, checked on the server like any other edit.
 */
export function renderResidentTools(host:HTMLElement,scene:WorldScene,selected:ReadonlySet<string>,change:(scene:WorldScene)=>void,error:(message:string)=>void):void {
  const residents=scene.residents??[];
  const resident=residents.find(resident=>resident.id===selectedResidentId)??residents[0];
  selectedResidentId=resident?.id;
  const field=(label:string,key:string,value:number)=>`<label>${label}<input type="number" step="0.1" data-resident="${key}" value="${value}"></label>`;
  const options=(current:string|undefined,empty=false)=>`${empty?'<option value="">None</option>':''}${(scene.activities??[]).map(slot=>`<option value="${slot.id}"${current===slot.id?' selected':''}>${escape(slot.id)} · ${slot.kind}</option>`).join('')}`;
  const services=residents.filter(item=>item!==resident).flatMap(item=>item.schedule.filter(task=>task.action==='serve'&&!task.exchangeWith).map(task=>({residentId:item.id,taskId:task.id,label:`${item.name} · ${task.id} (${task.startHour}–${task.endHour})`})));
  host.innerHTML=`<h3>Residents</h3><p class="panel-note">Give a resident a home and timed visits to usable objects. Travel and waiting must fit inside each time window.</p>
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
      <label>Trade with<select data-exchange aria-label="${task.id} trade with"><option value="">Independent visit</option>${services.map((service,index)=>`<option value="${index}"${task.exchangeWith?.residentId===service.residentId&&task.exchangeWith?.taskId===service.taskId?' selected':''}>${escape(service.label)}</option>`).join('')}</select></label>
      <p class="panel-note">A customer needs a waiting position 16–96 units from the vendor. Both visits must fit the same service block. Trading clears the customer’s fallback and held object; the parcel appears at handover.</p>
      <button data-remove-task="${task.id}">Remove ${escape(task.id)}</button></details>`).join('')}
    <button id="add-resident-task">Add daily activity</button>`:''}`;
  const query=<T extends HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
  const apply=(edit:(next:WorldScene)=>void)=>{const next=structuredClone(scene);edit(next);change(next);};
  if(residents.length)query<HTMLSelectElement>('#resident-select').onchange=()=>{selectedResidentId=query<HTMLSelectElement>('#resident-select').value;renderResidentTools(host,scene,selected,change,error);};
  query<HTMLButtonElement>('#add-resident').onclick=()=>apply(next=>{
    let index=1;while([...next.npcs,...(next.residents??[])].some(item=>item.id===`${scene.id}-neighbor-${index}`))index++;
    selectedResidentId=`${scene.id}-neighbor-${index}`;
    (next.residents??=[]).push({id:selectedResidentId,name:`Neighbor ${index}`,home:{...scene.spawn},speed:60,avatar:{hair:'#62412f',skin:'#c18b60',outfit:'#4e729a'},schedule:[]});
  });
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
  const dependents=(taskId?:string)=>residents.flatMap(item=>item.schedule.filter(task=>task.exchangeWith?.residentId===resident.id&&(taskId===undefined||task.exchangeWith.taskId===taskId)).map(task=>`${item.name}/${task.id}`));
  const protectService=(taskId?:string):boolean=>{const customers=dependents(taskId);if(!customers.length)return false;error(`Reassign these customer visits first: ${customers.join(', ')}.`);return true;};
  query<HTMLButtonElement>('#remove-resident').onclick=()=>{if(!protectService())apply(next=>{next.residents=next.residents?.filter(item=>item.id!==resident.id);});};
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(section=>{
    const select=section.querySelector<HTMLSelectElement>('[data-exchange]')!;
    select.onchange=()=>{
      const task=resident.schedule.find(task=>task.id===section.dataset.task)!;
      if(select.value!==''&&scene.activities?.find(slot=>slot.id===task.activityId)?.kind!=='wait'){error('Choose a waiting activity beside the vendor before linking a customer visit.');select.value='';return;}
      edit(item=>{const target=item.schedule.find(item=>item.id===task.id)!;if(select.value===''){delete target.exchangeWith;return;}
        const service=services[Number(select.value)];target.exchangeWith={residentId:service.residentId,taskId:service.taskId};target.action='wait';delete target.fallbackActivityId;delete target.heldObject;});
    };
  });
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(section=>section.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-task-field]').forEach(input=>input.onchange=()=>{
    const key=input.dataset.taskField!,value=input instanceof HTMLInputElement?Number(input.value):input.value;
    if(typeof value==='number'&&!Number.isFinite(value))return;
    edit(item=>{const task=item.schedule.find(task=>task.id===section.dataset.task)!;if(value==='')delete (task as unknown as Record<string,unknown>)[key];else Object.assign(task,{[key]:value});});
  }));
  host.querySelectorAll<HTMLButtonElement>('[data-remove-task]').forEach(button=>button.onclick=()=>{if(!protectService(button.dataset.removeTask))edit(item=>{item.schedule=item.schedule.filter(task=>task.id!==button.dataset.removeTask);});});
  query<HTMLButtonElement>('#add-resident-task').onclick=()=>{
    const slot=scene.activities?.find(slot=>selected.has(slot.ownerId))??scene.activities?.[0];
    if(!slot){error('Add an activity position to an object before scheduling a visit.');return;}
    const start=Array.from({length:23},(_,index)=>(index+8)%23).find(hour=>!resident.schedule.some(task=>hour<task.endHour&&hour+1>task.startHour));
    if(start===undefined){error('Make room in the existing schedule before adding another visit.');return;}
    edit(item=>{let n=1;while(item.schedule.some(task=>task.id===`visit-${n}`))n++;item.schedule.push({id:`visit-${n}`,activityId:slot.id,action:actions[slot.kind],startHour:start,endHour:start+1,durationSeconds:10});});
  };
}
