const property = (name,value) => ({name,type:typeof value==='number'?'int':'string',value});
const valueOf = (properties,name) => properties?.find(property=>property.name===name)?.value;

export function toTiled(mapId,document) {
  const map=document.maps[mapId];if(!map)throw new Error(`Unknown map ${mapId}`);
  let nextId=1;
  const polygons=(name,values,color)=>({id:nextId++,name,type:'objectgroup',color,opacity:.35,visible:true,objects:values.map((polygon,index)=>({id:nextId++,name:`${name.toLowerCase()}-${index+1}`,x:0,y:0,polygon:polygon.map(([x,y])=>({x,y}))}))});
  const points=(name,values)=>({id:nextId++,name,type:'objectgroup',visible:true,objects:values.map(point=>({id:nextId++,name:point.id,point:true,x:point.x,y:point.y,properties:[property('key',point.id)]}))});
  const layers=[{id:nextId++,name:'Painting',type:'imagelayer',image:`../../web/public/assets/${mapId}-terrain.webp`,visible:true},polygons('Walkable',map.walkable,'#7700aa55'),polygons('Obstacles',map.obstacles,'#77dd5544'),points('Spawn',[{id:'spawn',...map.spawn}]),points('NPCs',map.npcs),points('Objects',map.objects)];
  return {type:'map',version:'1.10',tiledversion:'1.11.2',orientation:'orthogonal',renderorder:'right-down',infinite:false,width:document.width/16,height:document.height/16,tilewidth:16,tileheight:16,nextobjectid:nextId,nextlayerid:nextId,properties:[property('mapId',mapId),property('navigationVersion',document.version)],layers};
}

export function fromTiled(tiled,document) {
  const mapId=valueOf(tiled.properties,'mapId');
  if(!document.maps[mapId])throw new Error('Tiled mapId must name an existing story map');
  if(tiled.orientation!=='orthogonal'||tiled.infinite||tiled.width*tiled.tilewidth!==document.width||tiled.height*tiled.tileheight!==document.height)throw new Error('Tiled map must keep the painting dimensions and orthogonal orientation');
  if(!Array.isArray(tiled.layers))throw new Error('Tiled map is missing object layers');
  const groups=new Map();
  for(const layer of tiled.layers) {
    if(layer.type==='imagelayer')continue;
    const key=String(layer.name).toLowerCase();
    if(layer.type!=='objectgroup'||!['walkable','obstacles','spawn','npcs','objects'].includes(key)||groups.has(key)||!Array.isArray(layer.objects))throw new Error(`Unsupported or duplicate Tiled layer ${layer.name}`);
    groups.set(key,layer);
  }
  for(const key of ['walkable','obstacles','spawn','npcs','objects'])if(!groups.has(key))throw new Error(`Missing Tiled layer ${key}`);
  const point=(object,layer)=>({x:object.x+(layer.offsetx??0),y:object.y+(layer.offsety??0)});
  const polygon=(object,layer)=>{
    const origin=point(object,layer),angle=(object.rotation??0)*Math.PI/180;
    let vertices;
    if(object.polygon)vertices=object.polygon;
    else if(object.ellipse)vertices=Array.from({length:18},(_,index)=>({x:object.width/2+Math.cos(index/18*Math.PI*2)*object.width/2,y:object.height/2+Math.sin(index/18*Math.PI*2)*object.height/2}));
    else if(object.width>0&&object.height>0&&!object.polyline)vertices=[{x:0,y:0},{x:object.width,y:0},{x:object.width,y:object.height},{x:0,y:object.height}];
    else throw new Error(`Collision object ${object.name} needs a polygon, rectangle or ellipse`);
    return vertices.map(vertex=>[origin.x+vertex.x*Math.cos(angle)-vertex.y*Math.sin(angle),origin.y+vertex.x*Math.sin(angle)+vertex.y*Math.cos(angle)]);
  };
  const placements=key=>{const layer=groups.get(key);return layer.objects.map(object=>{if(!object.point)throw new Error(`${key} placements must be point objects`);return {id:valueOf(object.properties,'key')??object.name,...point(object,layer)};});};
  const spawn=placements('spawn');if(spawn.length!==1)throw new Error('Spawn needs exactly one point');
  const next=structuredClone(document);
  next.maps[mapId]={walkable:groups.get('walkable').objects.map(object=>polygon(object,groups.get('walkable'))),obstacles:groups.get('obstacles').objects.map(object=>polygon(object,groups.get('obstacles'))),spawn:{x:spawn[0].x,y:spawn[0].y},npcs:placements('npcs'),objects:placements('objects')};
  return next;
}
