import {parentPort,workerData} from 'node:worker_threads';
import sharp from 'sharp';
import {bakeCastEntry} from './character-cast.mjs';
sharp.cache(false);sharp.concurrency(1);
for(const job of workerData.jobs){
  try{await bakeCastEntry(job.entry,{poseSet:job.poseSet,componentCatalogue:workerData.catalogue});parentPort.postMessage({id:job.entry.id,poseSet:job.poseSet});}
  catch(error){parentPort.postMessage({id:job.entry.id,poseSet:job.poseSet,error:error.message});}
}
