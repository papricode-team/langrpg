export interface PadInput {x:number;y:number;interact:boolean;}
/** Standard controller mapping, with a radial dead zone that prevents drift. */
export function gamepadInput(pads:readonly (Gamepad|null)[]):PadInput {
  const pad=pads.find(pad=>pad?.connected);
  if(!pad)return{x:0,y:0,interact:false};
  let x=pad.axes[0]??0,y=pad.axes[1]??0;
  const magnitude=Math.hypot(x,y);
  if(magnitude<.2){x=0;y=0;}else{const scale=Math.min(1,(magnitude-.2)/.8)/magnitude;x*=scale;y*=scale;}
  if(pad.buttons[14]?.pressed)x=-1;if(pad.buttons[15]?.pressed)x=1;
  if(pad.buttons[12]?.pressed)y=-1;if(pad.buttons[13]?.pressed)y=1;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  return{x,y,interact:!!pad.buttons[0]?.pressed};
}
