/** Content rules shared by the compiler and the handover audit. */
import './register-content-loader.mjs';
const {scaleCanon,PERSON_HEIGHT}=await import('../web/src/scene-schema.ts');
const {groundBlockedSamples,groundGrid}=await import('../web/src/ground.ts');
/** Composition is judged per 768 × 512 world-unit chunk, the size of a screenful at play zoom. */
const CHUNK={width:768,height:512};

const inside=(polygon,x,y)=>{
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
};
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
export function auditSceneQuality(scene,manifest){
  const issues=[],classes={};
  for(const item of scene.scenery){
    const asset=manifest.assets[item.frame??item.asset];if(!asset)continue;
    // Standalone exports can increase texture density without changing placement scale.
    const height=item.width*asset.height/(asset.base?.referenceWidth??asset.referenceWidth),range=scaleCanon[item.asset];
    if(range&&(height/PERSON_HEIGHT<range[0]-.01||height/PERSON_HEIGHT>range[1]+.01))issues.push(`${scene.id}: ${item.id} height ${(height/PERSON_HEIGHT).toFixed(2)} persons is outside ${range.join('–')}`);
    (classes[item.asset]??=[]).push(asset.referenceWidth/item.width);
    if(['house','archive','cafe','station','workshop','greenhouse'].includes(item.asset)&&!asset.footprint)issues.push(`${scene.id}: ${item.id} building needs a painted footprint`);
  }
  const resolution=Object.fromEntries(Object.entries(classes).map(([name,values])=>[name,{median:median(values),min:Math.min(...values)}]));
  for(const [name,value]of Object.entries(resolution))if(value.median<3.5||value.min<2.5)issues.push(`${scene.id}: ${name} source density ${value.median.toFixed(2)} median / ${value.min.toFixed(2)} minimum px/unit is below 3.5 / 2.5`);
  const tiles=[];
  for(let y=0;y<scene.height;y+=CHUNK.height)for(let x=0;x<scene.width;x+=CHUNK.width)
    tiles.push({id:`chunk-${x/CHUNK.width}-${y/CHUNK.height}`,x,y,width:Math.min(CHUNK.width,scene.width-x),height:Math.min(CHUNK.height,scene.height-y)});
  const blocked=tiles.length?groundBlockedSamples(scene.ground,scene.width,scene.height):undefined,columns=tiles.length?groundGrid(scene.width,scene.height,scene.ground.cell).columns:0;
  const open=(x,y)=>!blocked[Math.round(y/scene.ground.cell)*columns+Math.round(x/scene.ground.cell)];
  const chunks=tiles.map(tile=>{
    const objects=scene.scenery.filter(item=>item.x>=tile.x&&item.x<tile.x+tile.width&&item.y>=tile.y&&item.y<tile.y+tile.height);
    const buildings=objects.filter(item=>['house','archive','cafe','station','workshop','greenhouse'].includes(item.asset));
    const owners=new Set(objects.map(item=>item.id));
    let paved=0,total=0;
    for(let y=tile.y+8;y<tile.y+tile.height;y+=16)for(let x=tile.x+8;x<tile.x+tile.width;x+=16){total++;if(open(x,y))paved++;}
    const activities=(scene.activities??[]).filter(item=>owners.has(item.ownerId)).length;
    const coverage=paved/total;
    if(objects.length<10)issues.push(`${scene.id}: ${tile.id} needs at least 10 composed objects (has ${objects.length})`);
    if(!buildings.length)issues.push(`${scene.id}: ${tile.id} needs a building`);
    if(coverage<.15)issues.push(`${scene.id}: ${tile.id} needs 15% walkable ground (has ${(100*coverage).toFixed(1)}%)`);
    if(!activities)issues.push(`${scene.id}: ${tile.id} needs an activity owner`);
    return {id:tile.id,objects:objects.length,buildings:buildings.length,activities,walkableRatio:coverage};
  });
  return {issues,resolution,chunks};
}
