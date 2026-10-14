/** Four-frame pages retain native detail without decoding 36 poses for a preview. */
export function characterSheetPages(sheet, resolution, cell, frames = Array.from({length:36}, (_,i)=>i)) {
  if (!frames.length || frames.some(frame=>!Number.isInteger(frame)||frame<0||frame>=36)) throw new Error('Invalid requested character frames');
  const pages=sheet[`${resolution}Pages`];
  if (!pages) {
    if(typeof sheet[resolution]!=='string'||!sheet[resolution])throw new Error('Missing character sheet');
    return [{path:sheet[resolution],sha256:sheet[`${resolution}Sha256`],firstFrame:0,frameCount:36,columns:9,width:cell[0]*9,height:cell[1]*4}];
  }
  const coverage=new Set();
  if(!Array.isArray(pages)||!pages.length)throw new Error('Missing character pages');
  for(const page of pages){
    if(!page.path||!page.sha256||![page.firstFrame,page.frameCount,page.columns].every(Number.isInteger)||page.firstFrame<0||page.frameCount<1||page.firstFrame+page.frameCount>36||page.columns<1||page.columns>page.frameCount)throw new Error('Malformed character page');
    for(let frame=page.firstFrame;frame<page.firstFrame+page.frameCount;frame++){
      if(coverage.has(frame))throw new Error('Overlapping character pages');
      coverage.add(frame);
    }
  }
  if(coverage.size!==36)throw new Error('Character pages must cover all 36 frames');
  return pages.filter(page=>frames.some(frame=>frame>=page.firstFrame&&frame<page.firstFrame+page.frameCount))
    .map(page=>({...page,width:cell[0]*page.columns,height:cell[1]*Math.ceil(page.frameCount/page.columns)}));
}
