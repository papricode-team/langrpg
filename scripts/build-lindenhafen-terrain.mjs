/** Authored town plan in original world coordinates. No source-painting pixels are copied. */
import {writeFile} from 'node:fs/promises';
import polygonClipping from 'polygon-clipping';
const width=2304,height=1536,surfaces=[],features=[];
const clamp=([x,y])=>[+Math.max(0,Math.min(width,x)).toFixed(2),+Math.max(0,Math.min(height,y)).toFixed(2)];
function smooth(points,closed=false){
 const result=[];
 for(let i=0;i<points.length-(closed?0:1);i++){
  const a=points[Math.max(0,i-1)],b=points[i],c=points[(i+1)%points.length],d=points[Math.min(points.length-1,i+2)];
  for(let j=0;j<6;j++){const t=j/6;result.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));}
 }
 if(!closed)result.push(points.at(-1));return result;
}
function road(id,points,size){
 const line=smooth(points),left=[],right=[];
 for(let i=0;i<line.length;i++){
  const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b[0]-a[0],dy=(b[1]-a[1])/.65,l=Math.hypot(dx,dy)||1;
  left.push(clamp([p[0]-dy/l*size/2,p[1]+dx/l*size/2*.65]));right.push(clamp([p[0]+dy/l*size/2,p[1]-dx/l*size/2*.65]));
 }
 const polygons=polygonClipping.union([[...left,...right.reverse()]]);
 for(const [i,p] of polygons.entries())surfaces.push({id:i?`${id}-${i}`:id,material:'town-cobble',polygon:p[0].slice(0,-1)});
}
function ellipse(id,x,y,rx,ry,material='town-cobble'){
 surfaces.push({id,material,polygon:Array.from({length:48},(_,i)=>clamp([x+rx*Math.cos(i*Math.PI/24),y+ry*Math.sin(i*Math.PI/24)]))});
}
function water(id,points){
 // Corner cutting removes the source painting's tile-boundary notches, leaving broad navigable bends.
 let ring=points;for(let n=0;n<2;n++)ring=ring.flatMap((a,i)=>{const b=ring[(i+1)%ring.length];return [[.8*a[0]+.2*b[0],.8*a[1]+.2*b[1]],[.2*a[0]+.8*b[0],.2*a[1]+.8*b[1]]];});
 surfaces.push({id,material:'banked-water',blocked:true,polygon:ring.map(clamp)});
}
road('north-gate',[[200,0],[265,125],[265,290],[240,410]],125);
road('west-gate',[[0,340],[240,410]],110);
road('cafe-street',[[240,410],[425,330],[610,260],[800,290],[820,540]],105);
road('high-street',[[640,0],[980,190],[1130,285],[1310,395]],110);
road('library-road-north',[[1400,0],[1170,100],[980,190],[800,290]],95);
road('market-axis',[[240,410],[490,535],[820,540],[1100,500],[1180,535],[1285,605]],150);
road('west-workshop-street',[[0,700],[160,580],[310,580],[520,680],[660,780]],110);
road('market-garden-road',[[490,535],[520,680],[660,780],[825,770],[960,660],[1100,550]],100);

road('harbor-road',[[660,780],[710,945],[660,1090],[460,1240]],125);
road('harbor-west-entry',[[0,1230],[170,1140],[280,1070],[460,1240]],100);
road('west-quayside',[[0,700],[170,740],[400,850],[600,950],[710,945]],90);
road('south-market-axis',[[660,780],[870,780],[970,795],[1050,848]],145);
road('station-approach',[[1310,395],[1470,290],[1640,210],[1840,200],[2110,240],[2304,150]],160);
road('station-north-entry',[[1640,0],[1640,210]],105);
road('east-promenade',[[2110,240],[2040,370],[1950,520],[1770,710],[1730,940],[1830,1070],[2170,1090],[2160,1310],[2150,1536]],115);
road('eastern-gate',[[1950,520],[2110,580],[2240,660],[2304,660]],95);
road('canal-shops',[[1770,710],[1940,800],[2170,910],[2170,1090]],95);
road('bridge-quay',[[1490,1190],[1560,1240],[1560,1400],[1580,1536]],120);
road('library-west-entry',[[1830,1070],[1930,1210],[2160,1310],[2304,1310]],90);
// Short purposeful frontage paths; these stop at existing house/door coordinates, not arbitrary grass.
road('cafe-frontage',[[588,475],[640,520],[700,540]],62);
road('bakery-frontage',[[1161,850],[1090,850],[1050,825]],72);
road('north-house-frontage',[[579,125],[650,180],[700,265]],60);
road('high-street-frontage',[[856,435],[840,480],[820,540]],60);
road('workshop-frontage',[[110,710],[190,745]],60);
surfaces.push({id:'garden-market-apron',material:'town-cobble',polygon:[[760,600],[1060,600],[950,720],[760,700]]});
surfaces.push({id:'harbor-road-apron',material:'town-cobble',polygon:[[480,850],[700,850],[710,960],[540,920]]});
ellipse('market-south-junction',660,630,135,75);
ellipse('west-court',240,410,145,85);ellipse('market-square',820,540,190,118);
ellipse('garden-court',660,780,225,120);ellipse('garden-bed',660,780,135,65,'canal-grass');
ellipse('harbor-court',460,1240,185,115);ellipse('station-forecourt',1640,210,180,100);ellipse('library-square',2160,1310,140,95);
water('western-canal',[[0,760],[180,800],[410,920],[570,995],[570,1060],[450,1125],[260,1025],[0,900]]);
// Banks return behind the end pillars, rather than cutting diagonally through the
// open deck. The front pier feet remain in water below the raised landing plane.
water('main-canal',[[1260,530],[1350,400],[1480,320],[1630,300],[1770,350],[1860,460],[1840,560],[1720,660],[1650,760],[1710,800],[1730,835],[1640,895],[1670,960],[1740,1020],[1790,1120],[1790,1540],[1670,1540],[1630,1410],[1620,1150],[1580,1080],[1450,1000],[1200,830],[1240,760],[1250,660],[1410,620]]);
water('harbor-basin',[[0,1330],[120,1230],[265,1165],[320,1230],[260,1320],[460,1440],[660,1340],[610,1250],[680,1140],[820,1080],[845,980],[950,900],[1050,855],[1230,900],[1390,1020],[1450,1080],[1364,1134],[1370,1220],[1280,1300],[1190,1440],[950,1536],[0,1536]]);
// Painted bridges retain their native projection; road approaches meet their actual deck endpoints.
features.push({id:'market-bridge',asset:'canal-arch-bridge',x:1170,y:445,width:600});
features.push({id:'harbor-bridge',asset:'canal-arch-bridge',x:990,y:760,width:480});
// The landings extend from the bridge ends, avoiding a wall across either exit.
road('east-bridge-landing',[[1695,905],[1750,945],[1790,995],[1830,1070]],130);
road('south-bridge-landing',[[1395,1124],[1450,1165],[1510,1205],[1560,1240]],115);
// A small shared court joins the shop door to the landing without a dead-end
// spur and a grass notch immediately beside the bridge support.
ellipse('quay-shop-frontage',1490,1225,100,65);
// Three distinct painted courts are part of the paving, not scenery objects.
features.push({id:'market-inlay',asset:'compass-inlay',x:725,y:435,width:190});
features.push({id:'harbor-inlay',asset:'compass-inlay',x:380,y:1152,width:160});
features.push({id:'library-inlay',asset:'compass-inlay',x:2075,y:1216,width:170});
const destinations=[['west-gate',90,370],['north-gate',220,45],['station',1640,210],['harbor',460,1240],['library',2160,1310],['south-quay',1560,1400],['east-shops',2170,910]];
const draft={name:'Lindenhafen connected terrain',width,height,spawn:{x:820,y:540},modularTerrain:{version:1,base:'canal-grass',surfaces,features},routes:destinations.map(([id,x,y])=>({id,from:{x:820,y:540},to:{x,y}})),changes:['Continuous station–market–harbor route','Main bridge aligned to the market and eastern promenade','Broad harbor bridge approaches','Canal tile seams replaced with continuous stone banks','Short frontage paths for the existing café, bakery and quay shops','Library court joined to the eastern promenade']};
await writeFile('web/src/data/lindenhafen-terrain-rebuild.json',JSON.stringify(draft,null,2)+'\n');
console.log(`${surfaces.length} editable shapes, ${features.length} painted pieces`);
