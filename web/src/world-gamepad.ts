export interface PadInput {x:number;y:number;interact:boolean;}
/** Standard controller mapping, with a radial dead zone that prevents drift. */
export function gamepadInput(pads:readonly (Gamepad|null)[],out:PadInput={x:0,y:0,interact:false}):PadInput {
  let pad:Gamepad|undefined;
  for(const candidate of pads)if(candidate?.connected){pad=candidate;break;}
  if(!pad){out.x=0;out.y=0;out.interact=false;return out;}
  let x=pad.axes[0]??0,y=pad.axes[1]??0;
  const magnitude=Math.hypot(x,y);
  if(magnitude<.2){x=0;y=0;}else{const scale=Math.min(1,(magnitude-.2)/.8)/magnitude;x*=scale;y*=scale;}
  if(pad.buttons[14]?.pressed)x=-1;if(pad.buttons[15]?.pressed)x=1;
  if(pad.buttons[12]?.pressed)y=-1;if(pad.buttons[13]?.pressed)y=1;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  out.x=x;out.y=y;out.interact=!!pad.buttons[0]?.pressed;return out;
}
