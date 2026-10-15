/** Authored terrain art and seamless ground are edited independently in the map editor. */
import type * as Phaser from 'phaser';
import type {AdminMapScene} from './admin-map-canvas';
import type {EditBridge} from './world-edit-mode';
import {getWorldScene} from './scene-data';
import {terrainMaterials,terrainMaterial} from './terrain-materials';
import {editableTerrainFromScene,surfaceAt,terrainContains,terrainFingerprint,type ModularTerrain,type TerrainSurface} from './modular-terrain';
import {terrainFeatures,terrainFeature,featureBounds,featurePolygon,featureSurfaces,type TerrainFeature} from './terrain-features';
import type {ScenePolygon} from './scene-schema';
import {escapeHtml as escape} from './icons';

type Tool='select'|'polygon'|'rectangle'|'ellipse'|'piece';
export class AdminTerrainEditor {
  private active=false;
  private previewing=false;
  private expected='';
  private busy=false;
  private tool:Tool='select';
  private material='cobble';
  private art=terrainFeatures[0]?.id??'';
  private artWidth=terrainFeatures[0]?.worldWidth??600;
  private selected?:string;
  private points:[number,number][]=[];
  private drag?:{x:number;y:number;surface?:TerrainSurface;feature?:TerrainFeature;vertex?:number};
  private preview?:ScenePolygon;
  private placement?:TerrainFeature;
  private graphics:Phaser.GameObjects.Graphics;
  private ghost?:Phaser.GameObjects.Image;
  private ghostArt='';
  private ghostKey=`terrain-editor-${crypto.randomUUID()}`;
  private ghostRequest=0;
  private snapshot?:ModularTerrain;
  constructor(private host:HTMLElement,private scene:AdminMapScene,private bridge:EditBridge){
    this.graphics=scene.add.graphics().setDepth(2e7);
    scene.input.on('pointerdown',this.down,this);scene.input.on('pointermove',this.move,this);scene.input.on('pointerup',this.up,this);
    scene.input.keyboard?.on('keydown-ENTER',this.finish,this);scene.input.keyboard?.on('keydown-ESC',this.cancel,this);
    host.addEventListener('click',this.click);host.addEventListener('change',this.change);
  }
  setActive(active:boolean):void{this.active=active;this.scene.setTerrainEditing(active,this.bridge);this.cancel();if(!active&&this.previewing){this.previewing=false;this.scene.previewTerrain();}if(active)this.refresh();}
  refresh():void{this.cancel();if(this.previewing)this.scene.previewTerrain();this.previewing=false;this.snapshot=getWorldScene(this.scene.editMapId).modularTerrain;this.expected=terrainFingerprint(this.snapshot);this.render();}
  private render():void{
    const terrain=this.snapshot,selected=terrain?.surfaces.find(s=>s.id===this.selected),feature=terrain?.features?.find(f=>f.id===this.selected);
    const options=terrainMaterials.map(m=>`<option value="${m.id}">${escape(m.name)}</option>`).join('');
    this.host.innerHTML=`<h3>Terrain</h3><p class="map-note">Place painted streets, bridges and stone quays in the game’s perspective. Draw seamless ground and water underneath.</p>
      ${!terrain?'<button type="button" data-terrain-action="enable">Preview editable terrain</button><p class="map-note">Starts from path and collision outlines. Existing towns need their roads and banks reauthored with the painted pieces. Review before publishing.</p>':`
      ${this.previewing?'<p class="map-note">Conversion preview · changes stay here until you publish.</p><div class="terrain-tools"><button type="button" data-terrain-action="publish">Publish conversion</button><button type="button" data-terrain-action="discard">Discard preview</button></div>':''}
      <div class="terrain-tools">${(['select','piece','polygon','rectangle','ellipse'] as Tool[]).map(tool=>`<button type="button" data-terrain-tool="${tool}" aria-pressed="${this.tool===tool}">${tool==='piece'?'Painted piece':tool[0].toUpperCase()+tool.slice(1)}</button>`).join('')}</div>
      ${this.tool==='piece'?`<label>Painted terrain<select data-feature-art>${terrainFeatures.map(art=>`<option value="${art.id}">${escape(art.category)} · ${escape(art.name)}</option>`).join('')}</select></label><img class="terrain-piece-preview" src="${terrainFeature(this.art)?.thumbnail}" alt="Selected painted terrain"><label>Width in world units<input type="number" min="120" max="1600" step="10" data-feature-width value="${this.artWidth}"></label><p class="map-note">Click anywhere to place. No grid or rotation: the painted camera and proportions stay intact. Select to move, resize or reorder. Red outlines mark walls; gold outlines mark walkable decks.</p>`:''}
      <label>Base ground<select data-terrain-base>${options}</select></label>
      <p class="map-note">Polygon: click corners, then Finish or Enter. Rectangle / ellipse: drag. Select: drag a piece or a surface; surface corners can also move. Esc cancels.</p>
      <div class="terrain-materials">${terrainMaterials.map(m=>`<button type="button" data-terrain-material="${m.id}" aria-pressed="${this.material===m.id}" title="${escape(m.name)}"><img src="${m.thumbnail}" alt=""><span>${escape(m.name)}</span></button>`).join('')}</div>
      <div class="terrain-tools"><button type="button" data-terrain-action="finish">Finish polygon</button><button type="button" data-terrain-action="cancel">Cancel</button><button type="button" data-terrain-action="undo" ${!this.previewing&&this.bridge.session.canUndo?'':'disabled'}>Undo</button></div>
      <label>Selection<select data-terrain-selected><option value="">Choose terrain</option>${(terrain.features??[]).map(f=>`<option value="${f.id}">${escape(terrainFeature(f.asset)?.name??f.asset)} · ${escape(f.id)}</option>`).join('')}${terrain.surfaces.map(s=>`<option value="${s.id}">${escape(terrainMaterial(s.material)?.name??s.material)} · ${escape(s.id)}</option>`).join('')}</select></label>
      ${feature?`<label>Piece width<input type="number" min="120" max="1600" step="10" data-selected-width value="${feature.width}"></label><p class="map-note">Walking boundaries move and scale with the painted deck and walls.</p>`:''}
      ${selected?`<label>Material<select data-terrain-replace>${options}</select></label><label><input type="checkbox" data-terrain-blocked ${selected.blocked??terrainMaterial(selected.material)?.blocked?'checked':''}> Blocks walking</label>`:''}
      ${selected||feature?'<div class="terrain-tools"><button type="button" data-terrain-action="front">Bring to front</button><button type="button" data-terrain-action="remove">Delete selection</button></div>':''}
      <p class="map-note">${terrain.features?.length??0} painted pieces · ${terrain.surfaces.length} ground surfaces</p>`}`;
    const set=(key:string,value:string)=>{const input=this.host.querySelector<HTMLSelectElement>(key);if(input)input.value=value;};
    set('[data-terrain-base]',terrain?.base??'meadow');set('[data-terrain-selected]',this.selected??'');set('[data-feature-art]',this.art);if(selected)set('[data-terrain-replace]',selected.material);
    this.host.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('button,select,input').forEach(input=>{if(this.busy)input.disabled=true;});this.draw();
  }
  private click=(event:Event):void=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||this.busy)return;
    if(button.dataset.terrainTool){this.tool=button.dataset.terrainTool as Tool;if(this.tool!=='select')this.selected=undefined;this.cancel();this.render();return;}
    if(button.dataset.terrainMaterial){this.material=button.dataset.terrainMaterial;this.render();return;}
    const terrain=this.snapshot,features=terrain?.features;
    switch(button.dataset.terrainAction){
      case 'enable':this.snapshot=editableTerrainFromScene(getWorldScene(this.scene.editMapId));this.previewing=true;this.scene.previewTerrain(this.snapshot);this.render();break;
      case 'publish':if(terrain)void this.commit(terrain,true);break;
      case 'discard':this.refresh();break;
      case 'finish':this.finish();break;
      case 'cancel':this.cancel();break;
      case 'undo':this.busy=true;this.render();void this.bridge.session.undo().catch(e=>this.bridge.view.toast(e.message,true)).finally(()=>{this.busy=false;this.refresh();});break;
      case 'remove':if(terrain)void this.commit({...terrain,surfaces:terrain.surfaces.filter(s=>!this.inSelection(s)),...(features?{features:features.filter(f=>f.id!==this.selected)}:{})});break;
      case 'front':if(terrain)void this.commit({...terrain,surfaces:[...terrain.surfaces.filter(s=>!this.inSelection(s)),...terrain.surfaces.filter(s=>this.inSelection(s))],...(features?{features:[...features.filter(f=>f.id!==this.selected),...features.filter(f=>f.id===this.selected)]}:{})});break;
    }
  };
  private change=(event:Event):void=>{
    if(!this.snapshot||this.busy)return;const input=event.target as HTMLInputElement;
    if(input.hasAttribute('data-feature-art')){this.art=input.value;this.artWidth=terrainFeature(this.art)!.worldWidth;this.cancel();this.render();return;}
    if(input.hasAttribute('data-feature-width')){this.artWidth=this.width(Number(input.value));this.render();return;}
    if(input.hasAttribute('data-selected-width')){void this.commit({...this.snapshot,features:this.snapshot.features?.map(f=>f.id===this.selected?this.fit({...f,width:this.width(Number(input.value))}):f)});return;}
    if(input.hasAttribute('data-terrain-base'))void this.commit({...this.snapshot,base:input.value});
    if(input.hasAttribute('data-terrain-selected')){this.selected=input.value||undefined;this.render();}
    if(input.hasAttribute('data-terrain-replace')||input.hasAttribute('data-terrain-blocked'))void this.commit({...this.snapshot,surfaces:this.snapshot.surfaces.map(s=>s.id!==this.selected?s:input.hasAttribute('data-terrain-replace')?{...s,material:input.value,blocked:terrainMaterial(input.value)?.blocked??false}:{...s,blocked:input.checked})});
  };
  private width(value:number):number{return Number.isFinite(value)?Math.max(120,Math.min(1600,value)):600;}
  private fit(feature:TerrainFeature):TerrainFeature{const world=getWorldScene(this.scene.editMapId),art=terrainFeature(feature.asset)!;const width=Math.min(feature.width,world.width,world.height*art.width/art.height),height=width*art.height/art.width;return {...feature,width,x:Math.max(0,Math.min(world.width-width,feature.x)),y:Math.max(0,Math.min(world.height-height,feature.y))};}
  private inSelection(surface:TerrainSurface):boolean{const selected=this.snapshot?.surfaces.find(s=>s.id===this.selected);return surface.id===this.selected||!!selected?.groupId&&surface.groupId===selected.groupId;}
  private point(pointer:Phaser.Input.Pointer):[number,number]{const p=this.scene.cameras.main.getWorldPoint(pointer.x,pointer.y),world=getWorldScene(this.scene.editMapId);return [Math.round(Math.max(0,Math.min(world.width,p.x))),Math.round(Math.max(0,Math.min(world.height,p.y)))];}
  private candidate(x:number,y:number):TerrainFeature{const art=terrainFeature(this.art)!;return this.fit({id:'preview',asset:this.art,width:this.artWidth,x:x-this.artWidth/2,y:y-this.artWidth*art.height/art.width/2});}
  private down(pointer:Phaser.Input.Pointer):void{
    if(!this.active||this.busy||!this.snapshot||this.scene.editPanning()||!pointer.leftButtonDown())return;const [x,y]=this.point(pointer);
    if(this.tool==='piece'){const feature={...this.candidate(x,y),id:`feature-${crypto.randomUUID()}`};this.selected=feature.id;void this.commit({...this.snapshot,features:[...(this.snapshot.features??[]),feature]});return;}
    if(this.tool==='polygon'){this.points.push([x,y]);this.draw();return;}
    if(this.tool==='select'){
      const feature=[...(this.snapshot.features??[])].reverse().find(f=>terrainContains(featurePolygon(f,terrainFeature(f.asset)!.outline),x,y));
      if(feature){this.selected=feature.id;this.drag={x,y,feature};this.render();return;}
      const selected=this.snapshot.surfaces.find(s=>s.id===this.selected),radius=12/this.scene.cameras.main.zoom;
      const vertex=selected?.groupId?-1:selected?.polygon.findIndex(([a,b])=>Math.hypot(a-x,b-y)<radius)??-1;
      const surface=vertex>=0?selected:surfaceAt(this.snapshot,x,y);this.selected=surface?.id;
      this.drag=surface?{x,y,surface,vertex:vertex>=0?vertex:undefined}:undefined;this.render();
    }else this.drag={x,y};
  }
  private move(pointer:Phaser.Input.Pointer):void{
    if(!this.active||this.busy)return;const [x,y]=this.point(pointer);
    if(this.tool==='piece'){this.placement=this.candidate(x,y);this.draw();return;}
    if(!this.drag)return;const drag=this.drag;
    if(drag.feature){this.placement=this.fit({...drag.feature,x:drag.feature.x+x-drag.x,y:drag.feature.y+y-drag.y});this.draw();return;}
    if(drag.surface){
      const world=getWorldScene(this.scene.editMapId);
      if(drag.vertex!==undefined)this.preview=drag.surface.polygon.map((p,i)=>i===drag.vertex?[x,y]:p);
      else {const members=drag.surface.groupId?this.snapshot!.surfaces.filter(s=>s.groupId===drag.surface!.groupId):[drag.surface],points=members.flatMap(s=>s.polygon),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const dx=Math.max(-Math.min(...xs),Math.min(world.width-Math.max(...xs),x-drag.x)),dy=Math.max(-Math.min(...ys),Math.min(world.height-Math.max(...ys),y-drag.y));this.preview=drag.surface.polygon.map(([a,b])=>[a+dx,b+dy]);}
    }else if(this.tool==='rectangle')this.preview=[[drag.x,drag.y],[x,drag.y],[x,y],[drag.x,y]];
    else {const cx=(x+drag.x)/2,cy=(y+drag.y)/2,rx=Math.abs(x-drag.x)/2,ry=Math.abs(y-drag.y)/2;this.preview=Array.from({length:32},(_,i)=>[cx+rx*Math.cos(i*Math.PI/16),cy+ry*Math.sin(i*Math.PI/16)]);}
    this.draw();
  }
  private up():void{
    if(!this.active||!this.drag)return;const preview=this.preview,existing=this.drag.surface,feature=this.drag.feature,placement=this.placement;this.drag=undefined;this.preview=undefined;this.placement=undefined;
    if(feature&&placement&&this.snapshot){void this.commit({...this.snapshot,features:this.snapshot.features!.map(f=>f.id===feature.id?placement:f)});return;}
    if(preview&&Math.abs(preview.reduce((sum,p,i)=>{const n=preview[(i+1)%preview.length];return sum+p[0]*n[1]-n[0]*p[1];},0))>2)this.saveSurface(preview,existing);else this.draw();
  }
  private finish=():void=>{if(this.active&&this.points.length>=3){const polygon=this.points;this.points=[];this.saveSurface(polygon);}};
  private cancel=():void=>{this.points=[];this.drag=undefined;this.preview=undefined;this.placement=undefined;this.draw();};
  private saveSurface(polygon:ScenePolygon,existing?:TerrainSurface):void{
    if(!this.snapshot)return;
    if(existing?.groupId){const dx=polygon[0][0]-existing.polygon[0][0],dy=polygon[0][1]-existing.polygon[0][1];void this.commit({...this.snapshot,surfaces:this.snapshot.surfaces.map(s=>s.groupId===existing.groupId?{...s,polygon:s.polygon.map(([x,y])=>[x+dx,y+dy] as const)}:s)});return;}
    const id=existing?.id??`terrain-${crypto.randomUUID()}`,surface={...(existing??{id,material:this.material}),polygon};this.selected=id;
    void this.commit({...this.snapshot,surfaces:existing?this.snapshot.surfaces.map(s=>s.id===id?surface:s):[...this.snapshot.surfaces,surface]});
  }
  private async commit(terrain:ModularTerrain,publish=false):Promise<void>{
    if(this.previewing&&!publish){this.snapshot=terrain;this.scene.previewTerrain(terrain);this.render();return;}
    if(this.busy)return;const map=this.scene.editMapId,expected=this.expected;this.busy=true;this.render();
    try{await this.bridge.session.lock(map,'terrain');await this.bridge.session.commit([{kind:'terrain',map,terrain,expected}]);this.bridge.view.toast('Terrain published.');}
    catch(error){this.bridge.view.toast(error instanceof Error?error.message:'Terrain could not be saved.',true);}
    finally{await this.bridge.session.release(map,'terrain');this.busy=false;this.refresh();}
  }
  private showGhost(feature:TerrainFeature):void{
    const art=terrainFeature(feature.asset)!;
    if(this.ghostArt!==art.id){
      this.ghostArt=art.id;const request=++this.ghostRequest;this.ghost?.destroy();this.ghost=undefined;
      if(this.scene.textures.exists(this.ghostKey))this.scene.textures.remove(this.ghostKey);
      const image=new Image();image.src=art.asset;void image.decode().then(()=>{
        if(request!==this.ghostRequest)return;
        this.scene.textures.addImage(this.ghostKey,image);this.ghost=this.scene.add.image(0,0,this.ghostKey).setOrigin(0).setAlpha(.75).setDepth(2e7-1);this.draw();
      }).catch(()=>{if(request===this.ghostRequest)this.ghostArt='';});
    }
    const b=featureBounds(feature);this.ghost?.setPosition(b.x,b.y).setDisplaySize(b.width,b.height).setVisible(true);
  }
  private outline(polygon:ScenePolygon,color=0xffd474,handles=false):void{
    if(!polygon.length)return;const zoom=this.scene.cameras.main.zoom,g=this.graphics;
    g.lineStyle(2/zoom,color,1);g.beginPath();polygon.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));if(!this.points.length)g.closePath();g.strokePath();
    if(handles)for(const [x,y]of polygon)g.fillStyle(color).fillCircle(x,y,5/zoom);
  }
  private draw():void{
    this.graphics.clear();this.ghost?.setVisible(false);if(!this.active)return;
    const feature=this.placement??this.snapshot?.features?.find(f=>f.id===this.selected);
    if(feature){if(this.placement)this.showGhost(feature);for(const surface of featureSurfaces(feature))this.outline(surface.polygon,surface.blocked?0xf28475:0xffd474);return;}
    const selected=this.snapshot?.surfaces.find(s=>s.id===this.selected),polygon=this.preview??(this.points.length?this.points:selected?.polygon);if(polygon)this.outline(polygon,0xffd474,true);
  }
  destroy():void{++this.ghostRequest;this.ghost?.destroy();if(this.scene.textures.exists(this.ghostKey))this.scene.textures.remove(this.ghostKey);this.scene.input.off('pointerdown',this.down,this);this.scene.input.off('pointermove',this.move,this);this.scene.input.off('pointerup',this.up,this);this.scene.input.keyboard?.off('keydown-ENTER',this.finish,this);this.scene.input.keyboard?.off('keydown-ESC',this.cancel,this);this.host.removeEventListener('click',this.click);this.host.removeEventListener('change',this.change);this.graphics.destroy();}
}
