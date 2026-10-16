/** Painted terrain pieces are placed like objects; seamless ground is painted underneath with a brush. */
import type * as Phaser from 'phaser';
import type {AdminMapScene} from './admin-map-canvas';
import type {WorldEditOp} from './world-edit-ops';
import {getWorldScene,sceneDocument} from './scene-data';
import {terrainMaterials,terrainMaterial} from './terrain-materials';
import {editableTerrainFromScene,terrainContains,terrainFingerprint,type ModularTerrain} from './modular-terrain';
import {brushStroke,eraseGround,paintGround,MAX_TERRAIN_SURFACES} from './terrain-paint';
import {terrainFeatures,terrainFeature,featureBounds,featurePolygon,featureSurfaces,type TerrainFeature} from './terrain-features';
import {parseWorldSceneDocument,type ScenePolygon} from './scene-schema';
import {escapeHtml as escape} from './icons';

type Tool='select'|'piece'|'paint'|'erase';
const MIN_BRUSH=10,MAX_BRUSH=400;
/** How terrain edits reach the map editor's history and the server. */
export interface TerrainHost {
  commit(ops:WorldEditOp[],label:string):boolean;
  undo():void;
  readonly canUndo:boolean;
  toast(message:string,error?:boolean):void;
}
export class AdminTerrainEditor {
  private active=false;
  private previewing=false;
  private expected='';
  private busy=false;
  private tool:Tool='select';
  private material='cobble';
  private brush=60;
  private category='';
  private art=terrainFeatures[0]?.id??'';
  private artWidth=terrainFeatures[0]?.worldWidth??600;
  private selected?:string;
  private stroke:[number,number][]=[];
  private pointer?:[number,number];
  private drag?:{x:number;y:number;feature:TerrainFeature};
  private placement?:TerrainFeature;
  private graphics:Phaser.GameObjects.Graphics;
  private ghost?:Phaser.GameObjects.Image;
  private ghostArt='';
  private ghostKey=`terrain-editor-${crypto.randomUUID()}`;
  private ghostRequest=0;
  private snapshot?:ModularTerrain;
  constructor(private host:HTMLElement,private scene:AdminMapScene,private editor:TerrainHost){
    this.graphics=scene.add.graphics().setDepth(2e7);
    scene.input.on('pointerdown',this.down,this);scene.input.on('pointermove',this.move,this);scene.input.on('pointerup',this.up,this);
    host.addEventListener('click',this.click);host.addEventListener('change',this.change);host.addEventListener('input',this.input);
  }
  setActive(active:boolean):void{this.active=active;this.scene.setActive(!active);this.cancel();if(!active&&this.previewing){this.previewing=false;this.scene.previewTerrain();}if(active)this.refresh();}
  refresh():void{this.cancel();if(this.previewing)this.scene.previewTerrain();this.previewing=false;this.snapshot=getWorldScene(this.scene.editMapId).modularTerrain;this.expected=terrainFingerprint(this.snapshot);if(!this.snapshot?.features?.some(f=>f.id===this.selected))this.selected=undefined;this.render();}
  /** Delete or Backspace in terrain mode. */
  removeSelection():boolean{
    const terrain=this.snapshot;if(this.busy||!terrain||!terrain.features?.some(f=>f.id===this.selected))return false;
    const id=this.selected;this.selected=undefined;this.commit({...terrain,features:terrain.features.filter(f=>f.id!==id)});return true;
  }
  /** Escape stops a stroke, then placing, then the selection. */
  escape():void{
    if(this.stroke.length||this.drag){this.cancel();return;}
    if(this.tool==='piece'||this.tool==='paint'||this.tool==='erase')this.tool='select';else this.selected=undefined;
    this.cancel();this.render();
  }
  /** [ and ] resize the brush while painting. */
  resizeBrush(factor:number):boolean{
    if(this.tool!=='paint'&&this.tool!=='erase')return false;
    this.brush=Math.round(Math.max(MIN_BRUSH,Math.min(MAX_BRUSH,this.brush*factor)));this.render();return true;
  }
  private render():void{
    const terrain=this.snapshot,feature=terrain?.features?.find(f=>f.id===this.selected),art=feature&&terrainFeature(feature.asset);
    const categories=[...new Set(terrainFeatures.map(f=>f.category))];
    const pieces=terrainFeatures.filter(f=>!this.category||f.category===this.category);
    const painting=this.tool==='paint'||this.tool==='erase';
    this.host.innerHTML=`<h3>Terrain</h3><p class="map-note">Place painted pieces such as streets, bridges and quays like objects. Paint ground and water underneath with a brush.</p>
      <button type="button" data-terrain-action="import">Preview terrain file</button><input type="file" data-terrain-file accept=".json,application/json" hidden><p class="map-note">Imports only terrain for this town. Buildings, objects and residents keep their saved positions.</p>
      ${!terrain?'<button type="button" data-terrain-action="enable">Preview editable terrain</button><p class="map-note">Starts from path and collision outlines. Existing towns need their roads and banks reauthored with the painted pieces. Review before publishing.</p>':`
      ${this.previewing?'<p class="map-note">Terrain preview · changes stay here until you publish.</p><div class="terrain-tools"><button type="button" data-terrain-action="publish">Publish terrain</button><button type="button" data-terrain-action="discard">Discard preview</button></div>':''}
      <div class="terrain-tools">${([['select','Select'],['paint','Paint'],['erase','Erase']] as [Tool,string][]).map(([tool,label])=>`<button type="button" data-terrain-tool="${tool}" aria-pressed="${this.tool===tool}">${label}</button>`).join('')}<button type="button" data-terrain-action="undo" ${!this.previewing&&this.editor.canUndo?'':'disabled'}>Undo</button></div>
      ${feature&&art?`<section class="terrain-selected"><header class="me-inspect-head"><img src="${escape(art.thumbnail)}" alt=""><div><h2>${escape(art.name)}</h2><p>${escape(art.category)} · drag to move</p></div></header>
        <label>Piece width<input type="number" min="120" max="1600" step="10" data-selected-width value="${Math.round(feature.width)}"></label>
        <div class="terrain-tools"><button type="button" data-terrain-action="front">Bring to front</button><button type="button" data-terrain-action="back">Send to back</button></div>
        <div class="terrain-tools"><button type="button" class="danger" data-terrain-action="remove">Delete piece <kbd>⌫</kbd></button></div></section>`:''}
      <h4>Pieces</h4>
      <div class="me-chips">${[['','All'],...categories.map(c=>[c,c])].map(([value,label])=>`<button type="button" data-terrain-category="${escape(value)}" aria-pressed="${this.category===value}">${escape(label)}</button>`).join('')}</div>
      <div class="me-library terrain-pieces">${pieces.map(piece=>`<button type="button" data-terrain-piece="${escape(piece.id)}" aria-pressed="${this.tool==='piece'&&this.art===piece.id}" title="${escape(piece.category)} · ${escape(piece.name)}"><img src="${escape(piece.thumbnail)}" alt="" draggable="false"><span>${escape(piece.name)}</span></button>`).join('')}</div>
      ${this.tool==='piece'?`<label>Width in world units<input type="number" min="120" max="1600" step="10" data-feature-width value="${this.artWidth}"></label><p class="map-note">Click the map to place. Esc stops placing. Red outlines mark walls; gold outlines mark walkable decks.</p>`:'<p class="map-note">Choose a piece, then click the map to place it. Select a placed piece to move, resize or delete it.</p>'}
      <h4>Ground</h4>
      ${painting?`<label>Brush size · ${this.brush}<input type="range" min="${MIN_BRUSH}" max="${MAX_BRUSH}" step="5" data-terrain-brush value="${this.brush}"></label><p class="map-note">${this.tool==='erase'?'Drag to erase painted ground back to the base ground.':'Drag to paint. Strokes of one material merge.'} [ and ] change the size. Esc stops.</p>`:'<p class="map-note">Choose a material, then drag on the map to paint it.</p>'}
      <div class="terrain-materials">${terrainMaterials.map(m=>`<button type="button" data-terrain-material="${m.id}" aria-pressed="${this.tool==='paint'&&this.material===m.id}" title="${escape(m.name)}${m.blocked?' · blocks walking':''}"><img src="${m.thumbnail}" alt=""><span>${escape(m.name)}</span></button>`).join('')}</div>
      <label>Base ground<select data-terrain-base>${terrainMaterials.map(m=>`<option value="${m.id}">${escape(m.name)}</option>`).join('')}</select></label>
      <label>Placed pieces<select data-terrain-selected><option value="">Choose a piece</option>${(terrain.features??[]).map((f,i)=>`<option value="${f.id}">${i+1}. ${escape(terrainFeature(f.asset)?.name??f.asset)}</option>`).join('')}</select></label>
      <p class="map-note">${terrain.features?.length??0} painted pieces · ${terrain.surfaces.length} painted ground areas</p>`}`;
    const set=(key:string,value:string)=>{const input=this.host.querySelector<HTMLSelectElement>(key);if(input)input.value=value;};
    set('[data-terrain-base]',terrain?.base??'meadow');set('[data-terrain-selected]',this.selected??'');
    this.host.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('button,select,input').forEach(input=>{if(this.busy)input.disabled=true;});this.draw();
  }
  private click=(event:Event):void=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||this.busy)return;
    if(button.dataset.terrainTool){this.tool=button.dataset.terrainTool as Tool;if(this.tool!=='select')this.selected=undefined;this.cancel();this.render();return;}
    if(button.dataset.terrainMaterial){this.material=button.dataset.terrainMaterial;this.tool='paint';this.selected=undefined;this.cancel();this.render();return;}
    if(button.dataset.terrainCategory!==undefined){this.category=button.dataset.terrainCategory;this.render();return;}
    if(button.dataset.terrainPiece){
      const id=button.dataset.terrainPiece;
      if(this.tool==='piece'&&this.art===id)this.tool='select';
      else {this.tool='piece';this.art=id;this.artWidth=terrainFeature(id)!.worldWidth;this.selected=undefined;}
      this.cancel();this.render();return;
    }
    const terrain=this.snapshot,features=terrain?.features??[];
    switch(button.dataset.terrainAction){
      case 'import':this.host.querySelector<HTMLInputElement>('[data-terrain-file]')!.click();break;
      case 'enable':this.snapshot=editableTerrainFromScene(getWorldScene(this.scene.editMapId));this.previewing=true;this.scene.previewTerrain(this.snapshot);this.render();break;
      case 'publish':if(terrain)this.commit(terrain,true);break;
      case 'discard':this.refresh();break;
      case 'undo':this.editor.undo();this.refresh();break;
      case 'remove':this.removeSelection();break;
      case 'front':if(terrain)this.commit({...terrain,features:[...features.filter(f=>f.id!==this.selected),...features.filter(f=>f.id===this.selected)]});break;
      case 'back':if(terrain)this.commit({...terrain,features:[...features.filter(f=>f.id===this.selected),...features.filter(f=>f.id!==this.selected)]});break;
    }
  };
  private input=(event:Event):void=>{
    const input=event.target as HTMLInputElement;
    if(input.hasAttribute('data-terrain-brush')){this.brush=Number(input.value);const label=input.closest('label')?.firstChild;if(label)label.textContent=`Brush size · ${this.brush}`;this.draw();}
  };
  private change=(event:Event):void=>{
    if(this.busy)return;const input=event.target as HTMLInputElement;
    if(input.hasAttribute('data-terrain-file')){const file=input.files?.[0];input.value='';if(file)void this.importTerrain(file);return;}
    if(!this.snapshot)return;
    if(input.hasAttribute('data-feature-width')){this.artWidth=this.width(Number(input.value));this.render();return;}
    if(input.hasAttribute('data-selected-width')){this.commit({...this.snapshot,features:this.snapshot.features?.map(f=>f.id===this.selected?this.fit({...f,width:this.width(Number(input.value))}):f)});return;}
    if(input.hasAttribute('data-terrain-base'))this.commit({...this.snapshot,base:input.value});
    if(input.hasAttribute('data-terrain-selected')){this.selected=input.value||undefined;if(this.selected)this.tool='select';this.render();}
  };
  private async importTerrain(file:File):Promise<void>{
    this.busy=true;
    try{
      if(file.size>2*1024*1024)throw new Error('Choose a terrain file up to 2 MB.');
      const value=JSON.parse(await file.text()),map=this.scene.editMapId,world=getWorldScene(map);
      const terrain=value.modularTerrain??value.maps?.[map]?.modularTerrain??value;
      const checked=parseWorldSceneDocument({...sceneDocument,maps:{...sceneDocument.maps,[map]:{...world,modularTerrain:terrain}}});
      this.expected=terrainFingerprint(world.modularTerrain);this.snapshot=checked.maps[map].modularTerrain;
      this.selected=undefined;this.cancel();this.previewing=true;this.scene.previewTerrain(this.snapshot);
    }catch(error){this.editor.toast(error instanceof Error?error.message:'Terrain could not be read.',true);}
    finally{this.busy=false;this.render();}
  }
  private width(value:number):number{return Number.isFinite(value)?Math.max(120,Math.min(1600,value)):600;}
  private fit(feature:TerrainFeature):TerrainFeature{const world=getWorldScene(this.scene.editMapId),art=terrainFeature(feature.asset)!;const width=Math.min(feature.width,world.width,world.height*art.width/art.height),height=width*art.height/art.width;return {...feature,width,x:Math.max(0,Math.min(world.width-width,feature.x)),y:Math.max(0,Math.min(world.height-height,feature.y))};}
  private point(pointer:Phaser.Input.Pointer):[number,number]{const p=this.scene.cameras.main.getWorldPoint(pointer.x,pointer.y),world=getWorldScene(this.scene.editMapId);return [Math.round(Math.max(0,Math.min(world.width,p.x))),Math.round(Math.max(0,Math.min(world.height,p.y)))];}
  private candidate(x:number,y:number):TerrainFeature{const art=terrainFeature(this.art)!;return this.fit({id:'preview',asset:this.art,width:this.artWidth,x:x-this.artWidth/2,y:y-this.artWidth*art.height/art.width/2});}
  private down(pointer:Phaser.Input.Pointer):void{
    if(!this.active||this.busy||!this.snapshot||this.scene.panning||!pointer.leftButtonDown())return;const [x,y]=this.point(pointer);
    if(this.tool==='piece'){const feature={...this.candidate(x,y),id:`feature-${crypto.randomUUID()}`};this.selected=feature.id;this.commit({...this.snapshot,features:[...(this.snapshot.features??[]),feature]});return;}
    if(this.tool==='paint'||this.tool==='erase'){this.stroke=[[x,y]];this.draw();return;}
    const feature=[...(this.snapshot.features??[])].reverse().find(f=>terrainContains(featurePolygon(f,terrainFeature(f.asset)!.outline),x,y));
    this.selected=feature?.id;this.drag=feature&&{x,y,feature};this.render();
  }
  private move(pointer:Phaser.Input.Pointer):void{
    if(!this.active||this.busy)return;const [x,y]=this.point(pointer);this.pointer=[x,y];
    if(this.tool==='piece'){this.placement=this.candidate(x,y);this.draw();return;}
    if(this.stroke.length){
      const [lx,ly]=this.stroke.at(-1)!;
      if(Math.hypot(x-lx,y-ly)>=Math.max(2,this.brush*.25))this.stroke.push([x,y]);
      this.draw();return;
    }
    if(this.drag){const drag=this.drag;this.placement=this.fit({...drag.feature,x:drag.feature.x+x-drag.x,y:drag.feature.y+y-drag.y});}
    this.draw();
  }
  private up():void{
    if(!this.active)return;
    if(this.stroke.length){
      const points=this.stroke;this.stroke=[];
      if(this.pointer&&Math.hypot(this.pointer[0]-points.at(-1)![0],this.pointer[1]-points.at(-1)![1])>0)points.push(this.pointer);
      this.paint(points);return;
    }
    if(!this.drag)return;const feature=this.drag.feature,placement=this.placement;this.drag=undefined;this.placement=undefined;
    if(placement&&this.snapshot&&(placement.x!==feature.x||placement.y!==feature.y))this.commit({...this.snapshot,features:this.snapshot.features!.map(f=>f.id===feature.id?placement:f)});else this.draw();
  }
  private paint(points:[number,number][]):void{
    if(!this.snapshot)return;
    const world=getWorldScene(this.scene.editMapId),stroke=brushStroke(points,this.brush,world.width,world.height);
    const terrain=this.tool==='erase'?eraseGround(this.snapshot,stroke,world.width,world.height):paintGround(this.snapshot,stroke,this.material,world.width,world.height);
    if(terrain.surfaces.length>MAX_TERRAIN_SURFACES){this.editor.toast(`This town already has ${MAX_TERRAIN_SURFACES} painted ground areas. Paint over or erase some first.`,true);this.draw();return;}
    if(terrain===this.snapshot){this.draw();return;}
    this.commit(terrain);
  }
  private cancel=():void=>{this.stroke=[];this.drag=undefined;this.placement=undefined;this.draw();};
  private commit(terrain:ModularTerrain,publish=false):void{
    if(this.previewing&&!publish){this.snapshot=terrain;this.scene.previewTerrain(terrain);this.render();return;}
    const map=this.scene.editMapId;
    // The store publishes in the background; the fingerprint stops a stale draft overwriting newer terrain.
    if(this.editor.commit([{kind:'terrain',map,terrain,expected:this.expected}],publish?'Publish terrain':'Edit terrain'))this.refresh();
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
  private outline(polygon:ScenePolygon,color:number):void{
    if(!polygon.length)return;const zoom=this.scene.cameras.main.zoom,g=this.graphics;
    g.lineStyle(2/zoom,color,1);g.beginPath();polygon.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.strokePath();
  }
  private draw():void{
    this.graphics.clear();this.ghost?.setVisible(false);if(!this.active)return;
    const g=this.graphics,zoom=this.scene.cameras.main.zoom;
    if(this.tool==='paint'||this.tool==='erase'){
      const color=this.tool==='erase'?0xf28475:Number.parseInt((terrainMaterial(this.material)?.color??'#ffd474').slice(1),16);
      if(this.stroke.length){
        g.fillStyle(color,.45);
        this.stroke.forEach(([x,y],i)=>{
          g.fillCircle(x,y,this.brush);
          if(!i)return;const [px,py]=this.stroke[i-1],angle=Math.atan2(y-py,x-px),dx=Math.sin(angle)*this.brush,dy=-Math.cos(angle)*this.brush;
          g.fillTriangle(px+dx,py+dy,x+dx,y+dy,x-dx,y-dy).fillTriangle(px+dx,py+dy,x-dx,y-dy,px-dx,py-dy);
        });
      }
      if(this.pointer){g.lineStyle(2/zoom,this.tool==='erase'?0xf28475:0xffd474,1);g.strokeCircle(this.pointer[0],this.pointer[1],this.brush);}
      return;
    }
    const feature=this.placement??this.snapshot?.features?.find(f=>f.id===this.selected);
    if(!feature)return;
    if(this.placement)this.showGhost(feature);
    const b=featureBounds(feature);g.lineStyle(1/zoom,0xffffff,.6);g.strokeRect(b.x,b.y,b.width,b.height);
    for(const surface of featureSurfaces(feature))this.outline(surface.polygon,surface.blocked?0xf28475:0xffd474);
  }
  destroy():void{++this.ghostRequest;this.ghost?.destroy();if(this.scene.textures.exists(this.ghostKey))this.scene.textures.remove(this.ghostKey);this.scene.input.off('pointerdown',this.down,this);this.scene.input.off('pointermove',this.move,this);this.scene.input.off('pointerup',this.up,this);this.host.removeEventListener('click',this.click);this.host.removeEventListener('change',this.change);this.host.removeEventListener('input',this.input);this.graphics.destroy();}
}
