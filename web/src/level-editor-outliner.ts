import type {ScenePrefab,WorldScene} from './scene-schema';
import {districtForScenery,lockedScenery,type EditorViewState} from './level-editor-selection';

const escape=(value:string):string=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
interface OutlinerOptions {
  world:WorldScene; prefabs:readonly ScenePrefab[]; selected:ReadonlySet<string>; view:EditorViewState;
  select(ids:string[],add:boolean):void; frame(ids:string[]):void;
  toggle(ids:string[],kind:'hidden'|'locked'):void; reset():void;
}
/** Keeps the search field and expanded branches stable as inspector selection changes. */
export class EditorOutliner {
  private options?:OutlinerOptions;
  private mapId='';
  private expanded=new Set<string>();
  private search:HTMLInputElement;
  private district:HTMLSelectElement;
  private list:HTMLElement;
  constructor(private host:HTMLElement){
    host.innerHTML='<div class="panel-title"><h3>Placed objects</h3><span class="count" id="placed-count"></span></div><input class="search" type="search" aria-label="Find placed objects" placeholder="Find name, asset or group…"><label>In district<select aria-label="Filter placed objects by district"></select></label><p class="panel-note">Select a row; Shift adds to selection. Frame brings it into view. Hide and lock affect this editor on this device.</p><button class="outliner-reset">Show all & clear view locks</button><div class="outliner-list" role="group" aria-label="Placed objects"></div>';
    this.search=host.querySelector('input')!;this.district=host.querySelector('select')!;this.list=host.querySelector('.outliner-list')!;
    this.search.oninput=()=>this.render();this.district.onchange=()=>this.render();
    host.querySelector<HTMLButtonElement>('.outliner-reset')!.onclick=()=>this.options?.reset();
    this.list.addEventListener('click',event=>{
      const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');if(!button||!this.options)return;
      const ids=JSON.parse(button.dataset.ids!) as string[],action=button.dataset.action;
      if(action==='select')this.options.select(ids,(event as MouseEvent).shiftKey);
      else if(action==='frame')this.options.frame(ids);
      else if(action==='hidden'||action==='locked')this.options.toggle(ids,action);
    });
    this.list.addEventListener('toggle',event=>{
      const details=event.target as HTMLDetailsElement;if(!details.dataset.group)return;
      if(details.open)this.expanded.add(details.dataset.group);else this.expanded.delete(details.dataset.group);
    },true);
  }
  update(options:OutlinerOptions):void {
    const changedMap=this.mapId!==options.world.id;
    if(changedMap){this.mapId=options.world.id;this.expanded.clear();this.search.value='';}
    const previous=changedMap?'*':this.district.value;this.options=options;
    this.district.innerHTML=`<option value="*">All districts</option><option value="">Outside named districts</option>${options.world.districts.map(d=>`<option value="${escape(d.id)}">${escape(d.label??d.id)}</option>`).join('')}`;
    this.district.value=[...this.district.options].some(option=>option.value===previous)?previous:'*';
    this.render();
  }
  private render():void {
    if(!this.options)return;
    const {world,prefabs,view,selected}=this.options,locked=lockedScenery(world,view),search=this.search.value.trim().toLowerCase(),district=this.district.value;
    const names=new Map(world.prefabInstances?.map(copy=>[copy.id,prefabs.find(prefab=>prefab.id===copy.prefabId)?.name??copy.id]));
    const matches=world.scenery.filter(item=>(district==='*'||districtForScenery(world,item)===district)&&`${item.id} ${item.asset} ${item.frame??''} ${item.groupId??''} ${names.get(item.groupId??'')??''}`.toLowerCase().includes(search));
    this.host.querySelector('#placed-count')!.textContent=`${matches.length} / ${world.scenery.length}`;
    const row=(ids:string[],name:string,subtitle:string,child=false):string=>{
      const encoded=escape(JSON.stringify(ids)),hidden=ids.every(id=>view.hidden.has(id)),localLocked=ids.every(id=>view.locked.has(id)),allLocked=ids.every(id=>locked.has(id)),active=ids.every(id=>selected.has(id));
      return `<div class="outliner-row${child?' outliner-child':''}${hidden?' is-hidden':''}"><button class="outliner-name" data-action="select" data-ids="${encoded}" aria-pressed="${active}" title="${escape(subtitle)}"><span>${escape(name)}</span><small>${escape(subtitle)}</small></button><div class="outliner-actions"><button data-action="frame" data-ids="${encoded}" aria-label="Frame ${escape(subtitle)}" title="Frame in world">◎</button><button data-action="hidden" data-ids="${encoded}" aria-label="${hidden?'Show':'Hide'} ${escape(subtitle)}" aria-pressed="${hidden}">${hidden?'Show':'Hide'}</button><button data-action="locked" data-ids="${encoded}" aria-label="${localLocked?'Unlock':'Lock'} view ${escape(subtitle)}" aria-pressed="${localLocked}" title="${allLocked&&!localLocked?'A prefab lock is also active; unlock the copy in the inspector.':'Protect objects from editor changes'}">${localLocked?'Unlock':'Lock'}</button></div></div>`;
    };
    const groups=new Map<string,typeof matches>();
    for(const item of matches){const key=item.groupId??`object:${item.id}`;groups.set(key,[...(groups.get(key)??[]),item]);}
    this.list.innerHTML=[...groups].map(([key,items])=>{
      if(!items[0].groupId)return row([items[0].id],items[0].frame??items[0].asset,items[0].id);
      const members=world.scenery.filter(item=>item.groupId===key),name=names.get(key)??world.districts.find(d=>d.id===key)?.label??key;
      return `<details data-group="${escape(key)}"${search||this.expanded.has(key)?' open':''}><summary>${escape(name)} <small>${items.length} / ${members.length}</small></summary>${row(members.map(item=>item.id),name,`group ${key}`)}${items.map(item=>row([item.id],item.frame??item.asset,item.id,true)).join('')}</details>`;
    }).join('')||'<p class="panel-note">No placed objects match this search.</p>';
  }
}
