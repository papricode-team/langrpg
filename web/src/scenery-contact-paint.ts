import type {FoundationGround} from './foundation-dressing';
import type {ScenePolygon} from './scene-schema';
import type {SceneryContactKind} from './scenery-contact-shape';

export interface ContactMaterial {colour:readonly number[];vegetation:number;water:boolean;variant:number;}
/** Coarse colour buckets share small decals while retaining local ground hues. */
export function contactMaterial(ground:FoundationGround,variant:number):ContactMaterial {
  return {colour:ground.colour.map(c=>Math.min(255,Math.round(c/24)*24)),vegetation:Math.round(ground.vegetation*3)/3,water:ground.water>.35,variant};
}
const random=(seed:number,i:number)=>{const value=Math.sin(seed*47+i*127.1)*43758.5453;return value-Math.floor(value);};
const colour=(rgb:readonly number[],alpha:number,factor=1)=>`rgba(${rgb.map(c=>Math.max(0,Math.min(255,Math.round(c*factor)))).join(',')},${alpha})`;
function wash(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,rgb:readonly number[],alpha:number){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const fill=ctx.createRadialGradient(0,0,0,0,0,1);
  fill.addColorStop(0,colour(rgb,alpha));fill.addColorStop(.45,colour(rgb,alpha*.55));fill.addColorStop(1,colour(rgb,0));
  ctx.fillStyle=fill;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function stroke(ctx:CanvasRenderingContext2D,lines:readonly ScenePolygon[],rgb:readonly number[],width:number,alpha:number){
  ctx.lineJoin=ctx.lineCap='round';ctx.strokeStyle=colour(rgb,alpha);ctx.lineWidth=width;
  for(const line of lines){ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
}
/** Each material has its own ground and foreground treatment. Shadows multiply;
 * soil, leaf litter, moss and water glints retain their painted colour. */
export function paintSceneryContact(ctx:CanvasRenderingContext2D,kind:SceneryContactKind,lines:readonly ScenePolygon[],material:ContactMaterial,
  layer:'shadow'|'wear'|'growth'):void {
  const {colour:ground,vegetation,variant:seed,water}=material;
  const tree=kind==='leaf-tree'||kind==='conifer';
  const points=lines.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.max(...ys),top=Math.min(...ys),cx=(left+right)/2,cy=(top+bottom)/2;
  const rx=Math.max(5,(right-left)/2),ry=Math.max(3,(bottom-top)/2);
  const soil=[ground[0]*.54+18,ground[1]*.46+14,ground[2]*.35+10];
  const moss=[ground[0]*.28+20,ground[1]*.36+25,ground[2]*.17+11];
  if(layer==='shadow'){
    if(tree){
      // A broken, faint canopy shadow broadens around a tight anchored root shadow.
      const breadth=kind==='leaf-tree'?70:38;
      for(let i=0;i<9;i++){
        const angle=random(seed,i)*Math.PI*2,r=random(seed,i+20)*breadth;
        wash(ctx,12+Math.cos(angle)*r,9+Math.sin(angle)*r*.28,20+random(seed,i+40)*18,8+random(seed,i+60)*5,[45,43,32],.045);
      }
      wash(ctx,cx,cy+2,rx+10,ry+5,[40,35,26],.25);
    }else wash(ctx,cx,cy+2,rx+6,ry+4,[43,43,39],kind==='boat'?.12:.18);
    for(const [width,alpha]of [[14,.035],[8,.07],[4,.13],[1.5,.20]])stroke(ctx,lines,[42,39,32],width,alpha);
    return;
  }
  if(kind==='boat'){
    if(layer!=='wear'||!water)return;
    // Three incomplete waterline arcs hug the lower hull.
    ctx.lineCap='round';
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.ellipse(cx,cy+2,rx+6+i*6,ry+4+i*3,-.08,.10+ i*.12,Math.PI-.15-i*.13);
      ctx.strokeStyle=colour([ground[0]*.55+92,ground[1]*.55+104,ground[2]*.55+111],.28-i*.055);ctx.lineWidth=1.3;ctx.stroke();
    }
    return;
  }
  if(water)return; // No soil, moss or fallen leaves floating beyond a bank.
  if(layer==='wear'){
    if(tree){
      wash(ctx,cx,cy+2,rx+22+vegetation*12,ry+7+vegetation*4,soil,.32);
      const count=kind==='leaf-tree'?12+Math.round(vegetation*14):26;
      for(let i=0;i<count;i++){
        const angle=random(seed,i+80)*Math.PI*2,radius=9+random(seed,i+100)*(rx+20);
        const x=cx+Math.cos(angle)*radius,y=cy+4+Math.sin(angle)*radius*.30;
        if(kind==='conifer'){
          ctx.strokeStyle=colour([85,83,45],.5);ctx.lineWidth=.7;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+random(seed,i+120)*3,y+random(seed,i+140)*1.5);ctx.stroke();
        }else{
          ctx.fillStyle=colour(i%3===0?[139,111,48]:[166,127,54],.54+random(seed,i+120)*.24);
          ctx.beginPath();ctx.ellipse(x,y,1.3+random(seed,i+140)*1.5,.55+random(seed,i+160)*.65,angle,0,Math.PI*2);ctx.fill();
        }
      }
    }else if(kind==='fountain'){
      wash(ctx,cx,cy+3,rx+12,ry+7,[ground[0]*.48,ground[1]*.56,ground[2]*.58],.30);
      stroke(ctx,lines,moss,4,.18);
    }else if(kind==='planter'){
      wash(ctx,cx,cy+2,rx+8,ry+5,soil,.22);
      for(let i=0;i<12;i++){
        const x=cx+(random(seed,i+20)-.5)*(rx*2+10),y=bottom+random(seed,i+40)*6;
        ctx.fillStyle=colour(soil,.40);ctx.beginPath();ctx.ellipse(x,y,.5+random(seed,i+60),.4,0,0,Math.PI*2);ctx.fill();
      }
    }else{
      // Posts, individual feet and stall edges get tight dust/scuff marks only.
      stroke(ctx,lines,soil,kind==='market'?7:4,kind==='market'?.18:.12);
    }
    return;
  }
  if(!tree&&kind!=='planter'&&kind!=='fountain')return;
  // A low broken collar crosses the cutout seam without staining the whole trunk.
  const samples=points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/14))===0);
  samples.forEach(([x,y],i)=>{
    if(random(seed,i+200)>.55)return;
    ctx.fillStyle=colour(moss,.38+vegetation*.16);
    ctx.beginPath();ctx.ellipse(x,y-1,1.5+random(seed,i+220)*2,1+random(seed,i+240),0,0,Math.PI*2);ctx.fill();
  });
  if(!tree||vegetation<.33)return;
  for(const direction of [-1,1])for(let i=0;i<4;i++){
    const x=cx+direction*(rx+2)+i*.8,y=bottom+1,lean=direction*(2+random(seed,i+270)*3),height=4+random(seed,i+290)*4;
    ctx.fillStyle=colour(moss,.83,1.1+random(seed,i+310)*.35);
    ctx.beginPath();ctx.moveTo(x-.5,y);ctx.quadraticCurveTo(x+lean*.2,y-height*.6,x+lean,y-height);
    ctx.quadraticCurveTo(x+lean*.5,y-height*.35,x+.6,y);ctx.closePath();ctx.fill();
  }
}
