import {spawn} from 'node:child_process';
import {readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const grouped=process.platform!=='win32';
const webPort=process.env.ATLAS_WEB_PORT||'5187';
const apiPort=process.env.ATLAS_API_PORT||'8097';
const children=new Set();
let closing=false, restarting=false, restartTimer, server;

function terminate(child) {
  try { if(grouped&&child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM'); }
  catch { /* A completed child needs no signal. */ }
}
function startServer() {
  server=spawn('go',['run','.'],{cwd:`${root}/server`,detached:grouped,stdio:'inherit',env:{...process.env,
    PORT:apiPort,ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS||`http://localhost:${webPort},http://127.0.0.1:${webPort},http://127.240.77.9:${webPort}`,
  }});
  children.add(server);
  const child=server;
  child.on('error',error=>{console.error(error.message);stop(1);});
  child.on('exit',code=>{
    children.delete(child);
    if(closing)return;
    if(restarting){restarting=false;startServer();}
    else stop(code??1);
  });
}

// Go embeds these files. A completed editor save must restart the authority
// process as well as Vite's client modules. Debounce the compiler's staged batch.
let signature,checking=false;
const watcher=setInterval(async()=>{
  if(closing||checking)return;
  checking=true;
  try {
    const names=(await readdir(`${root}/server`)).filter(name=>/\.(go|json)$/.test(name)).sort();
    const next=(await Promise.all(names.map(async name=>{
      const info=await stat(`${root}/server/${name}`);
      return `${name}:${info.size}:${info.mtimeMs}`;
    }))).join('|');
    if(signature!==undefined&&next!==signature){
      clearTimeout(restartTimer);
      restartTimer=setTimeout(()=>{
        if(closing||restarting)return;
        restarting=true;
        console.log('World authority changed; restarting the local API. Players reconnect automatically.');
        terminate(server);
      },350);
    }
    signature=next;
  } catch(error) {
    // Files may be replaced while a compiler batch is committing; retry next poll.
    if(error.code!=='ENOENT')console.error(`Unable to inspect world authority files: ${error.message}`);
  } finally {checking=false;}
},1000);
function stop(code=0) {
  if(closing)return;
  closing=true;clearTimeout(restartTimer);clearInterval(watcher);
  for(const child of children)terminate(child);
  setTimeout(()=>process.exit(code),150).unref();
}
startServer();
const frontend=spawn('npm',['run','dev','--workspace','web','--','--port',webPort],{cwd:root,detached:grouped,stdio:'inherit',env:{...process.env,
  ATLAS_API_ORIGIN:process.env.ATLAS_API_ORIGIN||`http://127.0.0.1:${apiPort}`,
}});
children.add(frontend);
frontend.on('error',error=>{console.error(error.message);stop(1);});
frontend.on('exit',code=>{children.delete(frontend);if(!closing)stop(code??1);});
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
