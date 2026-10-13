import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walkableMaskPolygons} from './terrain-walkable-mask.mjs';

const contains=(polygon,x,y)=>{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[i],[bx,by]=polygon[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
};
const allowed=(polygons,x,y)=>polygons.some(polygon=>contains(polygon,x,y));

test('a black hole inside white ground stays blocked after vectorization',()=>{
  const pixels=Uint8Array.from([
    255,255,255,
    255,0,255,
    255,255,255,
  ]);
  const polygons=walkableMaskPolygons(pixels,3,3);
  assert.equal(allowed(polygons,1.5,1.5),false);
  for(const [x,y]of [[.5,.5],[1.5,.5],[2.5,1.5],[1.5,2.5]])assert.equal(allowed(polygons,x,y),true);
});

test('separated white islands do not gain a connection through black pixels',()=>{
  const polygons=walkableMaskPolygons(Uint8Array.from([
    255,255,0,255,255,
    255,255,0,255,255,
  ]),5,2);
  assert.equal(polygons.length,2);
  assert.equal(allowed(polygons,1.5,.5),true);
  assert.equal(allowed(polygons,3.5,.5),true);
  for(const y of [.25,.75,1.25,1.75])assert.equal(allowed(polygons,2.5,y),false);
});

test('tile polygons retain exact world offsets and native pixel dimensions',()=>{
  const polygons=walkableMaskPolygons(Uint8Array.from([255,255,255,255,0,0]),2,3,768,512);
  assert.deepEqual(polygons,[[[768,512],[770,512],[770,514],[768,514]]]);
  assert.equal(allowed(polygons,768.5,512.5),true);
  assert.equal(allowed(polygons,.5,.5),false);
  assert.equal(allowed(polygons,768.5,514.5),false);
});
