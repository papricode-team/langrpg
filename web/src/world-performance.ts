/** Local, bounded rolling telemetry. No account data and no network reporting. */
export class FrameTelemetry {
  private samples:number[]=[];
  private index=0;
  add(milliseconds:number) {
    if(!Number.isFinite(milliseconds)||milliseconds<=0||milliseconds>1000)return;
    if(this.samples.length<180)this.samples.push(milliseconds);
    else{this.samples[this.index]=milliseconds;this.index=(this.index+1)%180;}
  }
  snapshot() {
    if(!this.samples.length)return{fps:0,frameMs:0,p95FrameMs:0};
    const mean=this.samples.reduce((sum,n)=>sum+n,0)/this.samples.length;
    const sorted=[...this.samples].sort((a,b)=>a-b);
    return{fps:Math.round(1000/mean),frameMs:Math.round(mean*10)/10,p95FrameMs:Math.round(sorted[Math.floor((sorted.length-1)*.95)]*10)/10};
  }
}
