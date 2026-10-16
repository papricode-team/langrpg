/** Browser checks run against the real loaded game, outside the unit suite. */
export async function checkPaintedAnimalArt() {
  const {animalSpecies}=await import('/src/animal-behavior.ts');
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');let count=0;
  for(const species of animalSpecies){
    const atlas=await fetch(`/assets/animals/${species}.json`).then(r=>r.json());
    const image=new Image();image.src=`/assets/animals/${species}.webp`;await image.decode();
    const hashes=new Set();
    for(const [name,{frame}]of Object.entries(atlas.frames)){
      ctx.clearRect(0,0,128,128);ctx.drawImage(image,frame.x,frame.y,128,128,0,0,128,128);
      const pixels=ctx.getImageData(0,0,128,128).data;let opaque=0,hash=2166136261;
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const alpha=pixels[(y*128+x)*4+3];hash=Math.imul(hash^alpha,16777619)>>>0;
        if(alpha>32)opaque++;
        if(x===0||y===0||x===127||y===127)assert(!alpha,`${species}/${name}: clipped atlas cell`);
      }
      assert(opaque>300,`${species}/${name}: empty pose`);hashes.add(hash);count++;
    }
    assert(hashes.size===72,`${species}: duplicate painted poses`);
  }
  return count;
}
export function checkAnimalScene(scene) {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const world=scene.animals,navigation=scene.navigation,spawn=scene.spawnPoint();
  assert(world.actors.length===12,'Missing painted animals');
  const view={x:0,y:0,right:navigation.width,bottom:navigation.height};
  let count=0;
  for(const actor of world.actors){
    assert(navigation.isWalkable(actor.body.x,actor.body.y),'Animal off ground');
    assert(navigation.findPath(spawn,actor.body).length,'Unreachable animal');
    scene.local.x=actor.body.x-30;scene.local.y=actor.body.y;
    scene.approachInteraction(actor.id);
    assert(['feed','happy','annoyed'].includes(actor.body.state),'Actual scene interaction failed');
    const update=(dt,reduced=false,hidden=false)=>world.update(dt,navigation,scene.local,view,12,1,1,0xffffff,reduced,hidden,true);
    update(0);
    assert(actor.figure.frame.name.includes(actor.body.state==='feed'?'forage':actor.body.state),'Wrong reaction pose');
    assert(actor.label.visible&&actor.label.text.length,'Missing reaction feedback');
    update(.1,true);const frame=actor.figure.frame.name;update(.1,true);
    assert(actor.figure.frame.name===frame,'Reduced motion animated');
    update(0,false,true);assert(!actor.root.visible&&!actor.label.visible,'Terrain-only leaked animals');update(0);
    count++;
  }
  return count;
}
