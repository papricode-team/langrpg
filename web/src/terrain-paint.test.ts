import {describe,expect,it} from 'vitest';
import {brushStroke,eraseGround,paintGround,scenePieces} from './terrain-paint';
import {rectangleSurface,terrainContains,type ModularTerrain} from './modular-terrain';
import {scenePolygonProblem} from './scene-schema';

const W=2000,H=2000;
const blank=():ModularTerrain=>({version:1,base:'meadow',surfaces:[]});
let counter=0;const id=()=>`t-${++counter}`;
const materialAt=(terrain:ModularTerrain,x:number,y:number)=>[...terrain.surfaces].reverse().find(s=>terrainContains(s.polygon,x,y))?.material??terrain.base;
const valid=(terrain:ModularTerrain)=>{for(const s of terrain.surfaces)expect(scenePolygonProblem(s.polygon,W,H)).toBeUndefined();};

describe('terrain brush',()=>{
  it('covers the dragged path and stays inside the map',()=>{
    const stroke=brushStroke([[-50,100],[400,100]],40,W,H);
    const terrain=paintGround(blank(),stroke,'cobble',W,H,id);
    valid(terrain);
    expect(materialAt(terrain,200,100)).toBe('cobble');
    expect(materialAt(terrain,5,120)).toBe('cobble');
    expect(materialAt(terrain,200,200)).toBe('meadow');
    expect(terrain.surfaces.flatMap(s=>s.polygon).every(([x,y])=>x>=0&&y>=0)).toBe(true);
  });
  it('merges repeated strokes of one material instead of stacking surfaces',()=>{
    let terrain=blank();
    for(let i=0;i<20;i++)terrain=paintGround(terrain,brushStroke([[100+i*30,300],[100+i*30,600]],50,W,H),'earth',W,H,id);
    valid(terrain);
    expect(terrain.surfaces.length).toBeLessThanOrEqual(3);
    expect(materialAt(terrain,400,450)).toBe('earth');
  });
  it('paints over another material and drops surfaces it hides completely',()=>{
    let terrain:ModularTerrain={...blank(),surfaces:[rectangleSurface('pond','deep-water',500,500,100,100)]};
    terrain=paintGround(terrain,brushStroke([[450,550],[650,550]],120,W,H),'sand',W,H,id);
    valid(terrain);
    expect(terrain.surfaces.some(s=>s.id==='pond')).toBe(false);
    expect(materialAt(terrain,550,550)).toBe('sand');
  });
  it('cuts a ring of paint into hole-free pieces that leave the middle untouched',()=>{
    const ring:[number,number][]=Array.from({length:41},(_,i)=>[1000+300*Math.cos(i*Math.PI/20),1000+300*Math.sin(i*Math.PI/20)]);
    const terrain=paintGround(blank(),brushStroke(ring,40,W,H),'gravel',W,H,id);
    valid(terrain);
    expect(materialAt(terrain,1000,1000)).toBe('meadow');
    expect(materialAt(terrain,1300,1000)).toBe('gravel');
    expect(materialAt(terrain,700,1000)).toBe('gravel');
  });
  it('erases back to the base ground and keeps surface settings',()=>{
    let terrain:ModularTerrain={...blank(),surfaces:[{...rectangleSurface('quay','rock',100,100,800,200),blocked:false}]};
    terrain=eraseGround(terrain,brushStroke([[500,50],[500,350]],60,W,H),W,H,id);
    valid(terrain);
    expect(materialAt(terrain,500,200)).toBe('meadow');
    expect(materialAt(terrain,200,200)).toBe('rock');
    expect(materialAt(terrain,800,200)).toBe('rock');
    expect(terrain.surfaces.every(s=>s.blocked===false)).toBe(true);
    expect(terrain.surfaces[0].id).toBe('quay');
  });
  it('splits long outlines under the schema vertex limit',()=>{
    const wiggle:[number,number][]=Array.from({length:200},(_,i)=>[50+i*9,1000+(i%2?60:-60)]);
    const pieces=scenePieces(brushStroke(wiggle,30,W,H),W,H);
    expect(pieces.length).toBeGreaterThan(0);
    for(const p of pieces){expect(p.length).toBeLessThanOrEqual(256);expect(scenePolygonProblem(p,W,H)).toBeUndefined();}
  });
});
