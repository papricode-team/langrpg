/** Register generated complete frames to facial, body, foot or crown landmarks.
 * Integer translations only: no enlargement, local warps, or painted repairs.
 */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildReferences,material} from './character-kit.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function matchTranslation(base,candidate,width,box,limit=96){
 if(!Number.isInteger(width)||width<1||base.length!==candidate.length||base.length%(width*4)||!Number.isInteger(limit)||limit<0)throw Error('Invalid registration image geometry');
 const height=base.length/(width*4);
 if(![box.left,box.top,box.width,box.height].every(Number.isInteger)||box.width<1||box.height<1||box.left<0||box.top<0||box.left+box.width>width||box.top+box.height>height)throw Error('Registration box is outside the image');
 const samples=[];
 for(let y=box.top;y<box.top+box.height;y+=2)for(let x=box.left;x<box.left+box.width;x+=2){
  const p=(y*width+x)*4;
  samples.push([x,y,base[p],base[p+1],base[p+2]]);
 }
 if(samples.length<30)throw Error('Insufficient unchanged registration pixels');
 const cost=(dx,dy)=>{let error=0;for(const [x,y,r,g,b]of samples){const nx=x-dx,ny=y-dy;if(nx<0||ny<0||nx>=width||ny>=height)return Infinity;const p=(ny*width+nx)*4;error+=(candidate[p]-r)**2+(candidate[p+1]-g)**2+(candidate[p+2]-b)**2;}return error/samples.length;};
 let best={x:0,y:0,error:cost(0,0)},initial=best.error;
 for(let y=-limit;y<=limit;y+=4)for(let x=-limit;x<=limit;x+=4){const error=cost(x,y);if(error<best.error)best={x,y,error};}
 const coarse={...best};for(let y=coarse.y-4;y<=coarse.y+4;y++)for(let x=coarse.x-4;x<=coarse.x+4;x++){if(Math.abs(x)>limit||Math.abs(y)>limit)continue;const error=cost(x,y);if(error<best.error)best={x,y,error};}
 return {...best,initial};
}
/** Cover the native skull contour without changing any individual pixels. */
export function coverCrown(base,candidate,width,frame,match){
 const h=frame.headBounds,t=frame.transform,cell=t.sourceCell;
 const hx=cell.left+((h.left+h.right)/2-t.offset.x)/t.scale;
 const hy=cell.top+(h.top-t.offset.y)/t.scale,hw=(h.right-h.left)/t.scale;
 const samples=[];
 // The centre 72% avoids exposed temples and ears, which are part of several
 // intentional haircuts. Three samples just inside each skull edge reject
 // antialias fringes while including the broad covering below a bun or peak.
 for(let x=Math.round(hx-hw*.36);x<=hx+hw*.36;x+=2){
  for(let y=Math.max(cell.top,Math.round(hy-45));y<Math.min(cell.top+cell.height,hy+45);y++){
   const p=(y*width+x)*4;
   if(material(...base.subarray(p,p+3))!=='skin')continue;
   for(let k=3;k<=11;k+=4){const q=((y+k)*width+x)*4;if(material(...base.subarray(q,q+3))==='skin')samples.push([x,y+k]);}
   break;
  }
 }
 if(samples.length<30)throw Error('Insufficient native skull contour samples');
 const coverage=lift=>samples.filter(([x,y])=>{
  const nx=x-match.x,ny=y-match.y+lift;
  if(nx<cell.left||nx>=cell.left+cell.width||ny<cell.top||ny>=cell.top+cell.height)return false;
  const p=(ny*width+nx)*4;
  return ['primary','secondary'].includes(material(...candidate.subarray(p,p+3)));
 }).length/samples.length;
 const before=coverage(0);
 if(before>=.97)return match;
 // A tiny deficit can be a neutral painted seam rather than exposed skull.
 // Do not move a well-covered crown far enough to suspend it above the head.
 for(let lift=1;lift<=(before>=.9?8:48);lift++){
  const after=coverage(lift);
  if(after>=.99)return {...match,y:match.y-lift,anchor:'native skull contour coverage, complete-frame translation',crownCoverage:{before,after,samples:samples.length,lift}};
 }
 // Slanted or neutral-colour bands do not always supply enough keyed pixels
 // for this contour test. Keep their anchor for explicit visual review.
 return {...match,crownCoverage:{before,after:before,samples:samples.length,lift:0,unresolved:true}};
}
export async function alignHD(id,root=resolve(import.meta.dirname,'..')){
 if(!/^[a-z][a-z0-9-]*$/.test(id??''))throw Error('Invalid component id');
 const file='art/source/character-kit/hd/catalogue.json',c=JSON.parse(await readFile(resolve(root,file))),e=c.entries.find(e=>e.id===id);
 if(!e||!['hair','headwear','neck','face','markings','facial-hair','eyewear','bottom','footwear','outer'].includes(e.slot))throw Error('Registration requires a component with an unchanged facial, torso, leg or foot anchor');
 const build=buildReferences(c,e.build,e.poseSet);
 const input=`art/source/character-kit/hd/${id}-candidate.png`;
 const paths=[input,input+'.json',build.mannequin,build.registration];
 if(e.authoring?.registrationAdjustments)paths.push(e.authoring.registrationAdjustments);
 const bytes=await Promise.all(paths.map(p=>readFile(resolve(root,p))));
 const adjustments=bytes[4]?JSON.parse(bytes[4]):null;
 if(adjustments&&(!adjustments.reason?.trim()||!Array.isArray(adjustments.offsets)||adjustments.offsets.length!==36||adjustments.offsets.some(o=>![o.x,o.y].every(n=>Number.isInteger(n)&&Math.abs(n)<=8))))throw Error('Reviewed corrections require 36 integer offsets bounded to eight native pixels and a reason');
 const base=await sharp(bytes[2]).flatten({background:'#ffffff'}).ensureAlpha().raw().toBuffer({resolveWithObject:true}),candidate=await sharp(bytes[0]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(base.info.width!==candidate.info.width||base.info.height!==candidate.info.height)throw Error('Candidate and mannequin dimensions must match');
 const manifest=JSON.parse(bytes[3]),offsets=[],data=Buffer.alloc(candidate.data.length,255),width=base.info.width;
 for(const f of manifest.frames){
  const h=f.headBounds,t=f.transform,cell=t.sourceCell,hw=h.right-h.left,hh=h.bottom-h.top;
  // Hats can cover the forehead, cheeks and ears. Register their unchanged
  // upper torso instead, below even a wide brim and inside the bust crop.
  const actionHair=e.slot==='hair'&&((e.poseSet&&e.poseSet!=='walk')||e.build!=='regular');
  const bounds=e.slot==='footwear'?[h.left-hw,f.waist.y+10,h.right+hw,f.waist.y+28]:e.slot==='bottom'?[h.left-hw*1.8,f.ground.y-10,h.right+hw*1.8,f.ground.y+2]:actionHair?[h.left,f.neck.y+20,h.right,f.neck.y+40]:e.slot==='headwear'?[h.left-hw*.35,f.neck.y+10,h.right+hw*.35,f.neck.y+25]:e.slot!=='hair'?[h.left-hw*.25,h.top-hh*.15,h.right+hw*.25,h.top+hh*.45]:f.direction===2?[h.left-hw*1.5,f.neck.y+13,h.left-hw*.55,f.neck.y+38]:f.direction===1?[h.left+hw*.6,h.top+hh*.32,h.right+hw*.25,h.bottom+hh*.12]:f.direction===3?[h.left-hw*.25,h.top+hh*.32,h.right-hw*.6,h.bottom+hh*.12]:[h.left+hw*.2,h.top+hh*.32,h.right-hw*.2,h.bottom-hh*.06];
  const left=Math.round(cell.left+(bounds[0]-t.offset.x)/t.scale),top=Math.round(cell.top+(bounds[1]-t.offset.y)/t.scale);
  const box={left,top,width:Math.round((bounds[2]-bounds[0])/t.scale),height:Math.round((bounds[3]-bounds[1])/t.scale)};
  let match=matchTranslation(base.data,candidate.data,width,box);
  const fullHeadwear=e.slot==='headwear'&&!['headband','bucket'].includes(e.optionId);
  const rearCrown=f.direction===2&&(e.slot==='hair'||fullHeadwear)&&e.build==='regular'&&(!e.poseSet||e.poseSet==='walk');
  if(rearCrown||e.slot==='hair'&&(e.build!=='regular'||(e.poseSet&&e.poseSet!=='walk'))){
   // Repainted shoulder shading is not an unchanged anchor. Register the
   // complete frame by the crown silhouette in these close-cropped hair pages.
   const hx=cell.left+((h.left+h.right)/2-t.offset.x)/t.scale,hy=cell.top+(h.top-t.offset.y)/t.scale;
   const rows=[];
   for(let y=Math.max(cell.top,Math.floor(hy-100));y<Math.min(cell.top+cell.height,hy+150);y++){let xs=[];for(let x=Math.max(cell.left,Math.floor(hx-130));x<Math.min(cell.left+cell.width,hx+130);x++){const p=(y*width+x)*4,r=candidate.data[p],g=candidate.data[p+1],b=candidate.data[p+2];if(b>g*1.15&&r>g*1.08&&b>r*1.03&&b-g>12)xs.push(x);}if(xs.length>=12)rows.push({y,xs});}
   if(rows.length<10)throw Error('Missing native crown for '+id+' frame '+offsets.length);
   const crown=rows.slice(0,18),xs=crown.flatMap(r=>r.xs).sort((a,b)=>a-b),center=xs[Math.floor(xs.length/2)];
   let skullTop=hy;
   for(let y=Math.floor(hy-45);y<hy+60;y++){let count=0;for(let x=Math.floor(hx-110);x<hx+110;x++){const p=(y*width+x)*4;if(base.data[p+1]>base.data[p]*1.12&&base.data[p+2]>base.data[p]*1.12)count++;}if(count>=12){skullTop=y;break;}}
   // Shoulder registration can leave a painted rear crown below the skull.
   // Keep its horizontal registration and lift the complete frame only when
   // the crown would expose scalp; tall hairstyles and hats stay untouched.
   match=rearCrown?{...match,y:Math.min(match.y,Math.round(skullTop-9-rows[0].y)),anchor:'rear crown coverage, complete-frame translation'}
     :{...match,x:Math.round(hx-center),y:Math.round(skullTop-9-rows[0].y),anchor:'crown silhouette, complete-frame translation'};
  }
  const fullCrown=e.build==='regular'&&(!e.poseSet||e.poseSet==='walk')&&f.direction!==0&&
   (e.slot==='hair'&&e.optionId!=='mohawk'||fullHeadwear);
  if(fullCrown)match=coverCrown(base.data,candidate.data,width,f,match);
  if(Math.abs(match.x)===96||Math.abs(match.y)===96)throw Error(`Unresolved registration at search boundary in frame ${offsets.length}`);
  const correction=adjustments?.offsets[offsets.length];
  if(correction){match.automatic={x:match.x,y:match.y};match.x+=correction.x;match.y+=correction.y;}
  offsets.push({...match,box});
  for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){
   const nx=x+match.x,ny=y+match.y;if(nx<0||ny<0||nx>=cell.width||ny>=cell.height)continue;
   const p=((cell.top+y)*width+cell.left+x)*4;candidate.data.copy(data,((cell.top+ny)*width+cell.left+nx)*4,p,p+4);
  }
 }
 const path=`art/source/character-kit/hd/${id}-aligned.png`,encoded=await sharp(data,{raw:{width,height:base.info.height,channels:4}}).png().toBuffer();
 await writeFile(resolve(root,path),encoded);
 const source=JSON.parse(bytes[1]),sources=[...source.sources,...paths.map((path,i)=>({path,sha256:hash(bytes[i])}))];
 await writeFile(resolve(root,path+'.json'),JSON.stringify({version:1,operation:'one integer translation per complete frame; recorded landmark registration; no resizing or per-part warps',sources,offsets,outputSha256:hash(encoded)},null,2)+'\n');
 e.candidate=path;e.preparedCandidate=path+'.json';await writeFile(resolve(root,file),JSON.stringify(c,null,2)+'\n');
 console.log(JSON.stringify(offsets.map(({x,y,error,initial})=>({x,y,error:Math.round(error),initial:Math.round(initial)}))));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await alignHD(process.argv[2]);
