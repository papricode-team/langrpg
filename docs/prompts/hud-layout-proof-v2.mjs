// Offline material/layout study, not a DOM renderer or screenshot.
// Sample progress is illustrative; quest copy, portrait and world are repository data.
// FONTCONFIG_FILE must point at a writable-cache configuration on restricted macOS hosts.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {normalizeAvatar} from '../../web/src/character-recipe.mjs';
import {playerPortraitPixels} from '../../web/src/player-portrait-compositor.mjs';
const root=new URL('../../',import.meta.url).pathname;
const ui=n=>`${root}web/public/assets/ui/${n}.webp`;
const scene=JSON.parse(await fs.readFile(`${root}content/world-seed.json`)).maps.lindenhafen;
const content=JSON.parse(await fs.readFile(`${root}content/source.json`));
const quest=content.quests.find(q=>q.id==='a1-cafe');
const pixels=await playerPortraitPixels(normalizeAvatar({}), 'neutral', async url=>{
 const {data,info}=await sharp(`${root}web/public${url.split('?')[0]}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return {data,width:info.width,height:info.height};
});
const portrait=await sharp(Buffer.from(pixels.data),{raw:{width:256,height:256,channels:4}}).png().toBuffer();
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function nine(name,w,h,sx,sy,dx,dy,fill=true){
 const input=ui(name),m=await sharp(input).metadata(),parts=[];
 const srcX=[0,sx,m.width-sx],srcW=[sx,m.width-2*sx,sx], dstX=[0,dx,w-dx],dstW=[dx,w-2*dx,dx];
 const srcY=sy?[0,sy,m.height-sy]:[0],srcH=sy?[sy,m.height-2*sy,sy]:[m.height],dstY=dy?[0,dy,h-dy]:[0],dstH=dy?[dy,h-2*dy,dy]:[h];
 for(let y=0;y<srcY.length;y++)for(let x=0;x<3;x++){
 if(!fill&&x===1&&y===1)continue;
 parts.push({input:await sharp(input).extract({left:srcX[x],top:srcY[y],width:srcW[x],height:srcH[y]}).resize(dstW[x],dstH[y]).png().toBuffer(),left:dstX[x],top:dstY[y]});
 }
 return sharp({create:{width:w,height:h,channels:4,background:name==='card-frame-v1'?'#16302a':{r:0,g:0,b:0,alpha:0}}}).composite(parts).png().toBuffer();
}
async function compose(w,h,phone){
 const layers=[];
 const add=(input,left,top)=>layers.push({input,left:Math.round(left),top:Math.round(top)});
 const image=async(input,width,height,x,y)=>add(await sharp(input).resize(width,height,{fit:'fill'}).png().toBuffer(),x,y);
 const text=async(str,x,y,size=12,color='#f3eddb',display=false,width)=>{
  const input=await sharp({text:{text:`<span foreground="${color}">${esc(str)}</span>`,font:`${display?'Fraunces SemiBold':'DM Sans'} ${size}`,fontfile:`${root}node_modules/@fontsource/${display?'fraunces':'dm-sans'}/files/${display?'fraunces':'dm-sans'}-latin-${display?'600':'400'}-normal.woff`,rgba:true,...(width?{width}: {})}}).png().toBuffer(); add(input,x,y);
 };
 const circle=async(input,size,x,y)=>{
 const mask=Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
 add(await sharp(input).resize(size,size,{fit:'cover'}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer(),x,y);
 };
 const panel=async(x,y,pw,ph)=>add(await nine('card-frame-v1',pw,ph,40,40,20,20,false),x,y);
 const bg=await sharp(`${root}web/public/assets/lindenhafen-preview.webp`).resize(w,h,{fit:'cover'}).modulate({brightness:.86}).png().toBuffer();
 const px=phone?10:24,py=phone?10:20,pw=phone?w-76:320,ph=phone?84:100;
 // Nameplate uses asymmetric horizontal slices, matching hud.css.
 const nm=await sharp(ui('nameplate-v1')).metadata();
 const pieces=[{left:0,width:170,out:phone?89:102},{left:170,width:nm.width-200,out:pw-(phone?105:120)},{left:nm.width-30,width:30,out:phone?16:18}];
 let xx=px;for(const part of pieces){add(await sharp(ui('nameplate-v1')).extract({left:part.left,top:0,width:part.width,height:nm.height}).resize(part.out,ph).png().toBuffer(),xx,py);xx+=part.out;}
 await circle(portrait,phone?56:64,px+(phone?11:13),py+(ph-(phone?56:64))/2);
 await text('Alex',px+(phone?93:107),py+(phone?26:24),phone?16:20,'#f6e2a8',true);
 if(!phone)await text('Wanderer of the Atlas',px+107,py+48,12,'#e8d39b');
 await text('German · A1    74 XP',px+(phone?93:107),py+(phone?48:67),phone?13:12,'#e8d39b');
 if(!phone){
 const bw=280,bx=(w-bw)/2;add(await nine('town-banner-v1',bw,92,72,0,44,0),bx,40);
 await text('W    · N ·    E',bx+88,16,12,'#f3eddb');await text('Lindenhafen',bx+48,58,28,'#2a2112',true);await text('The missing platform',bx+70,99,12,'#7a5a22');
 }
 for(let i=0;i<3;i++){
 const tx=phone?w-54:w-24-3*44-12+i*50,ty=phone?14+i*48:16;
 await image(ui('round-button-v1'),44,44,tx,ty);await text(['?','⛶','♪'][i],tx+16,ty+13,18,'#e8d39b',true);
 }
 if(!phone){
 const mx=w-26-168,my=72;await circle(`${root}web/public/assets/lindenhafen-preview.webp`,121,mx+24,my+24);
 const dots=scene.npcs.map(n=>{const x=50+(n.x-scene.width/2)/Math.min(scene.width,scene.height)*100,y=50+(n.y-scene.height/2)/Math.min(scene.width,scene.height)*100;return `<circle cx="${x*1.21}" cy="${y*1.21}" r="3" fill="#f3eddb" stroke="#273d32"/>`;}).join('');
 const mask=Buffer.from(`<svg width="121" height="121"><defs><clipPath id="c"><circle cx="60.5" cy="60.5" r="60.5"/></clipPath></defs><g clip-path="url(#c)">${dots}<circle cx="61" cy="75" r="5" fill="#e6b953" stroke="#f3eddb" stroke-width="2"/></g></svg>`);add(mask,mx+24,my+24);
 await image(ui('minimap-bezel-v2'),168,168,mx,my);await image(ui('round-button-v1'),44,44,mx+130,my+128);await text('N',mx+79,my-3,12,'#f3eddb',true);
 await panel(w-288,260,264,244);await text('Chapter 1 · A1',w-264,284,12,'#e8d39b');await text(quest.title,w-264,312,20,'#f3eddb',true,220);await text('◇  Speak with Marta',w-264,375,14);await text(quest.objectives[0],w-244,405,12,'#b1beb5');await text(`1/${content.quests.filter(q=>q.level==='A1').length} stories discovered`,w-264,440,12,'#e8d39b');await text('+40 XP',w-88,440,12,'#e8d39b');await text('Continue story                 →',w-264,473,14,'#e8d39b');
 await panel(24,h-112,264,88);await text('Lindenhafen         Local',45,h-91,12,'#f3eddb');await text('You are exploring this place.',45,h-65,12,'#b1beb5');
 await panel(w-288,h-82,264,58);await text('3 words ready to revisit  →',w-264,h-60,12,'#f3eddb');
 }else{
 add(await nine('objective-plaque-v1',w-80,64,110,48,36,18),12,104);await text('Follow the story',66,116,13,'#5a4a26');await text('Speak with Marta',66,137,16,'#16302a',true);
 // Existing movement controls are only represented as art in this offline layout proof.
 await image(ui('round-button-v1'),108,108,16,h-208);
 }
 const dw=phone?w-16:420,dh=phone?80:92,dx=(w-dw)/2,dy=h-(phone?8:20)-dh;
 if(!phone)await text('W A S D  Move  ·  E  Talk  ·  Click to wander',dx+53,dy-40,12);
 await panel(dx,dy,dw,dh);
 const labels=['Quests','Journal','Atlas','Character','Settings'];
 for(let i=0;i<5;i++){
 const cx=dx+10+(dw-20)*(i+.5)/5;
 if(i===2)await image(ui('atlas-medallion-v2'),phone?60:78,phone?60:78,cx-(phone?30:39),dy-(phone?12:26));
 else await text(['♧','▤','','♧','⚙'][i],cx-9,dy+16,24,'#e8d39b');
 await text(labels[i],cx-labels[i].length*3.2,dy+(phone?52:51),phone?13:12);
 if(!phone)await text(['Q','J','M','C','O'][i],cx-3,dy+72,12,'#b1beb5');
 }
 return sharp(bg).composite(layers).png().toFile(`${root}art/ui/hud-layout-proof-v2-${phone?'phone':'desktop'}.png`);
}
console.log(await compose(1280,720,false));console.log(await compose(390,844,true));
