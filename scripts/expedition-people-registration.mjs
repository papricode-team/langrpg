/** Isolate along alpha gaps and reviewed edge contacts, then translate complete painted poses. */
const median = values => {
 const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};

export function peopleGrid(image,columns,rows,review={}) {
 const {data,width,height}=image,alpha=(x,y)=>data[(y*width+x)*4+3];
 function divider(axis,expected,radius,start,end) {
  let best=Math.round(expected),score=[Infinity,Infinity,Infinity];
  for(let candidate=Math.max(1,Math.round(expected-radius));candidate<=Math.min((axis==='x'?width:height)-1,Math.round(expected+radius));candidate++){
   let opaque=0,total=0;
   for(let p=start;p<end;p++){const a=axis==='x'?alpha(candidate,p):alpha(p,candidate);if(a>=160)opaque++;total+=a;}
   const next=[opaque,total,Math.abs(candidate-expected)];
   if(next[0]<score[0]||next[0]===score[0]&&(next[1]<score[1]||next[1]===score[1]&&next[2]<score[2])){best=candidate;score=next;}
  }
  return {position:best,opaquePixels:score[0]};
 }
 const x=[0],seams=[];
 for(let col=1;col<columns;col++){
  const seam=divider('x',width*col/columns,width/columns*.4,0,height);
  if(seam.opaquePixels)throw Error(`Painted column contact at boundary ${col}: ${seam.opaquePixels} opaque pixels.`);
  x.push(seam.position);seams.push({axis:'x',column:col,...seam});
 }
 x.push(width);
 function rowSeam(expected,left,right,override,protectWarmContour=false){
  const radius=height/rows*.2,low=override?.minimum??Math.max(1,Math.floor(expected-radius)),high=override?.maximum??Math.min(height-1,Math.ceil(expected+radius)),range=high-low+1,w=right-left;
  const pixelCost=(x,y)=>{
   const p=(y*width+x)*4,a=data[p+3],r=data[p],g=data[p+1],b=data[p+2];
   // This reviewed source contact is a bare ankle above dark hair. Avoid
   // cutting through skin and lending its tip to the next person's head.
   const warm=protectWarmContour&&a>=100&&r>g*1.1&&g>b*1.08&&r>85;
   return a*(warm?8:1);
  };
  const parents=new Int8Array(w*range);let previous=new Float64Array(range);
  for(let iy=0;iy<range;iy++)previous[iy]=pixelCost(left,low+iy)+Math.abs(low+iy-expected)*.001;
  for(let ix=1;ix<w;ix++){
   const current=new Float64Array(range);
   for(let iy=0;iy<range;iy++){
    let from=iy,cost=previous[iy];
    for(const offset of [-1,1])if(iy+offset>=0&&iy+offset<range&&previous[iy+offset]+.1<cost){from=iy+offset;cost=previous[from]+.1;}
    current[iy]=cost+pixelCost(left+ix,low+iy)+Math.abs(low+iy-expected)*.001;parents[ix*range+iy]=from-iy;
   }
   previous=current;
  }
  let iy=0;for(let candidate=1;candidate<range;candidate++)if(previous[candidate]<previous[iy])iy=candidate;
  const path=new Int32Array(w);let opaquePixels=0,alphaSum=0;
  for(let ix=w-1;ix>=0;ix--){path[ix]=low+iy;const a=alpha(left+ix,path[ix]);if(a>=160)opaquePixels++;alphaSum+=a;iy+=parents[ix*range+iy];}
  return {path,opaquePixels,alphaSum,minimum:Math.min(...path),maximum:Math.max(...path)};
 }
 const result=[];
 for(let col=0;col<columns;col++){
  const w=x[col+1]-x[col],y=[new Int32Array(w)];
  for(let row=1;row<rows;row++){
   const key=`${col}:${row}`,override=review.ranges?.[key],protectWarmContour=review.protectWarmContours?.includes(key),seam=rowSeam(height*row/rows,x[col],x[col+1],override,protectWarmContour);
   if(seam.opaquePixels>(review.contacts?.[key]??0))throw Error(`Unreviewed painted row contact at column ${col}, boundary ${row}: ${seam.opaquePixels} opaque pixels.`);
   y.push(seam.path);const {path,...report}=seam;seams.push({axis:'y',column:col,row,...report,...(seam.opaquePixels?{reviewed:true,note:review.note}:{}),...(override?{reviewedRange:override}:{}),...(protectWarmContour?{protectedContour:'bare ankle above hair'}:{})});
  }
  y.push(new Int32Array(w).fill(height));
  for(let row=0;row<rows;row++){
   const top=Math.min(...y[row]),bottom=Math.max(...y[row+1]),h=bottom-top,raw=Buffer.alloc(w*h*4);
   // Row silhouettes may overlap in their rectangular boxes. A minimum-alpha
   // path preserves complete boots and hair; every source pixel has one owner.
   for(let cx=0;cx<w;cx++)for(let cy=y[row][cx];cy<y[row+1][cx];cy++)data.copy(raw,((cy-top)*w+cx)*4,(cy*width+x[col]+cx)*4,(cy*width+x[col]+cx)*4+4);
   result.push({row,col,data:raw,width:w,height:h,source:{left:x[col],top,width:w,height:h},upperSeam:[...y[row]],lowerSeam:[...y[row+1]]});
  }
 }
 return {cells:result.sort((a,b)=>a.row-b.row||a.col-b.col),seams};
}

export function personGeometry(image) {
 const {data,width,height}=image,seen=new Uint8Array(width*height);let largest=[];
 // Detached alpha specks are not body landmarks. Pixels are never masked in output.
 for(let index=0;index<seen.length;index++){
  if(seen[index]||data[index*4+3]<160)continue;
  const points=[index];seen[index]=1;
  for(let p=0;p<points.length;p++){
   const current=points[p],x=current%width,y=Math.floor(current/width);
   for(const next of [x?current-1:-1,x+1<width?current+1:-1,y?current-width:-1,y+1<height?current+width:-1])if(next>=0&&!seen[next]&&data[next*4+3]>=160){seen[next]=1;points.push(next);}
  }
  if(points.length>largest.length)largest=points;
 }
 if(largest.length<100)throw Error('An isolated opaque human silhouette is required.');
 let left=width,top=height,right=-1,bottom=-1;
 for(const point of largest){const x=point%width,y=Math.floor(point/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 const bodyHeight=bottom-top+1,centers=[];
 for(let y=Math.ceil(top+bodyHeight*.3);y<top+bodyHeight*.55;y++){
  const points=largest.filter(point=>Math.floor(point/width)===y).map(point=>point%width).sort((a,b)=>a-b);
  if(points.length>=4)centers.push((points[Math.floor(points.length*.25)]+points[Math.floor(points.length*.75)])/2);
 }
 const torsoX=Math.round(median(centers));
 let cropLeft=width,cropTop=height,cropRight=-1,cropBottom=-1,clear=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=data[(y*width+x)*4+3];if(a===0)clear++;
  if(a>24){cropLeft=Math.min(cropLeft,x);cropRight=Math.max(cropRight,x);cropTop=Math.min(cropTop,y);cropBottom=Math.max(cropBottom,y);}
 }
 if(clear<width*height*.015)throw Error('An isolated transparent human cell is required.');
 return {torsoX,soleY:bottom,bodyHeight,bodyBounds:{left,top,right,bottom},crop:{left:Math.max(0,cropLeft-2),top:Math.max(0,cropTop-2),right:Math.min(width-1,cropRight+2),bottom:Math.min(height-1,cropBottom+2)},silhouettePixels:largest.length};
}

export function registerPeopleSequence(cells) {
 const measured=cells.map(cell=>({...cell,geometry:personGeometry(cell)}));
 const halfWidth=Math.ceil(Math.max(...measured.flatMap(({geometry:g})=>[g.torsoX-g.crop.left,g.crop.right-g.torsoX+1])))+2;
 const above=Math.max(...measured.map(({geometry:g})=>g.soleY-g.crop.top))+2;
 const below=Math.max(...measured.map(({geometry:g})=>g.crop.bottom-g.soleY))+2;
 const width=halfWidth*2,height=above+below+1;
 return measured.map(cell=>{
  const g=cell.geometry,dx=halfWidth-g.torsoX,dy=above-g.soleY,output=Buffer.alloc(width*height*4),crop=g.crop;
  for(let y=crop.top;y<=crop.bottom;y++){
   const targetX=crop.left+dx,targetY=y+dy;
   if(targetX<0||targetX+crop.right-crop.left+1>width||targetY<0||targetY>=height)throw Error('Registered human crop would clip painted pixels.');
   cell.data.copy(output,(targetY*width+targetX)*4,(y*cell.width+crop.left)*4,(y*cell.width+crop.right+1)*4);
  }
  return {...cell,data:output,width,height,registration:{translation:{x:dx,y:dy},torsoX:halfWidth,soleY:above,sourceGeometry:g,source:cell.source,cropPixelsPreserved:(crop.right-crop.left+1)*(crop.bottom-crop.top+1)}};
 });
}
