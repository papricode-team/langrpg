import {describe,expect,it} from 'vitest';
import {decodeWeights,encodeWeights,groundBarriers,groundFingerprint,groundFromLayers,groundGrid,groundLayers,groundMaterialAt,groundProblem,groundWeightsAt,paintGround,plainGround} from './ground';

const W=256,H=128;

describe('painted ground',()=>{
  it('encodes weight grids losslessly and compactly',()=>{
    const values=new Uint8Array(33*17).fill(255);values.fill(0,40,90);values[200]=17;
    const text=encodeWeights(values);
    expect(decodeWeights(text,values.length)).toEqual(values);
    expect(text.length).toBeLessThan(40);
    expect(()=>decodeWeights(text,values.length+1)).toThrow(/shorter/);
  });

  it('paints a soft round stroke that keeps weights summing to one',()=>{
    const ground=paintGround(plainGround('meadow',W,H),W,H,{material:'cobble',radius:40,strength:1,points:[[64,64],[192,64]]});
    expect(ground.layers).toEqual(['meadow','cobble']);
    expect(groundMaterialAt(ground,W,H,128,64)).toBe('cobble');
    expect(groundMaterialAt(ground,W,H,128,120)).toBe('meadow');
    const edge=groundWeightsAt(ground,W,H,128,64+34);
    expect(edge[1]).toBeGreaterThan(0);expect(edge[1]).toBeLessThan(1);
    const {layers,columns,rows}=groundLayers(ground,W,H);
    for(let index=0;index<columns*rows;index++)expect(Math.abs(layers[0][index]+layers[1][index]-255)).toBeLessThanOrEqual(1);
  });

  it('fingerprints the ground by content, whatever order its keys arrive in',()=>{
    const ground={...paintGround(plainGround('meadow',W,H),W,H,{material:'cobble',radius:40,strength:1,points:[[64,64]]}),
      features:[{id:'bridge',asset:'old-canal-arch-bridge',width:120,x:10.5,y:20}]};
    // PostgreSQL's jsonb stores keys shortest first, then alphabetically.
    const stored={cell:ground.cell,layers:ground.layers,version:ground.version,weights:ground.weights,features:[{x:10.5,y:20,id:'bridge',asset:'old-canal-arch-bridge',width:120}]};
    expect(groundFingerprint(stored)).toBe(groundFingerprint(ground));
    expect(groundFingerprint({...ground,features:[{...ground.features[0],x:11}]})).not.toBe(groundFingerprint(ground));
    expect(groundFingerprint(undefined)).toBe(groundFingerprint(null));
  });

  it('reuses a fully painted-over layer and refuses a seventh material',()=>{
    let ground=plainGround('meadow',W,H);
    for(const material of ['cobble','earth','sand','gravel','moss'])ground=paintGround(ground,W,H,{material,radius:20,strength:1,points:[[40*ground.layers.length,40]]});
    expect(ground.layers).toHaveLength(6);
    expect(()=>paintGround(ground,W,H,{material:'slate',radius:20,strength:1,points:[[200,100]]})).toThrow(/6 ground materials/);
    // A soft brush needs a few passes to clear a material completely.
    const covered=paintGround(ground,W,H,{material:'meadow',radius:60,strength:1,points:Array.from({length:6},()=>[40,40] as const)});
    expect(covered.layers).not.toContain('cobble');
    expect(paintGround(covered,W,H,{material:'slate',radius:20,strength:1,points:[[200,100]]}).layers).toContain('slate');
  });

  it('blocks walkers where water dominates and opens bridge decks',()=>{
    const {columns,rows}=groundGrid(W,H,8),land=new Uint8Array(columns*rows).fill(255),water=new Uint8Array(columns*rows);
    for(let row=0;row<rows;row++)for(let column=12;column<=20;column++){water[row*columns+column]=255;land[row*columns+column]=0;}
    const ground=groundFromLayers(['meadow','deep-water'],[land,water],8);
    const barriers=groundBarriers(ground,W,H);
    expect(barriers).toHaveLength(1);
    // Shores leave walkers a little leeway: water stops them where it clearly dominates.
    expect(barriers[0]).toEqual([[92.8,0],[163.2,0],[163.2,H],[92.8,H]]);
    expect(groundProblem(ground,W,H)).toBeUndefined();
    expect(groundProblem({...ground,layers:['meadow','lava']},W,H)).toMatch(/known materials/);
  });
});
