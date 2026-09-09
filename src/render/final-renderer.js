import {createTraceKernel,finalRenderWorker} from './final-kernel.js';
import {FINAL_TRACE_WGSL,FINAL_DISPLAY_WGSL} from './final-wgsl.js';
import {filmRGBA} from './final-image.js';
import {renderSettings} from './final-scene.js';

function aborted(){return new DOMException('Render cancelled','AbortError');}
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(aborted());if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
/** Dedicated final-render job. Cancelling preserves the partial image; starting a new job frees old resources. */
export class FinalRenderer {
  constructor(canvas,onUpdate=()=>{}){this.canvas=canvas;this.onUpdate=onUpdate;this.state='idle';this.generation=0;this.backend='Not started';this.workers=[];this.buffers=[];this.sample=0;this.partial=0;this.pass='beauty';this.errors=[];}
  async start(scene,camera,options={}){
    this.cancel();this.disposeGPU();const generation=++this.generation;const abort=this.abort=new AbortController();this.settings=renderSettings(options);this.view={...this.settings,pass:this.pass};this.scene=scene;this.camera=camera;this.state='preparing';this.sample=0;this.partial=0;this.errors=[];this.fallbackReason='';this.started=performance.now();this.pauseTime=0;this.lastPresent=0;this.frame=null;this.canvas.width=this.settings.width;this.canvas.height=this.settings.height;this.emit();
    try{
      if(this.settings.backend!=='cpu')try{await this.initGPU(generation,abort.signal);}catch(error){if(generation!==this.generation||abort.signal.aborted)throw aborted();this.disposeGPU();if(this.settings.backend==='webgpu')throw error;this.fallbackReason=error.message;}
      if(abort.signal.aborted||generation!==this.generation)throw aborted();
      if(!this.device){this.freshCanvas();const n=this.settings.width*this.settings.height*4;this.frame={width:this.settings.width,height:this.settings.height,film:new Float32Array(n),normal:new Float32Array(n),albedo:new Float32Array(n)};this.backend=`CPU path tracer · ${Math.max(1,Math.min(4,(navigator.hardwareConcurrency??2)-1))} workers`;}
      this.state='rendering';this.emit();if(this.device)await this.runGPU(abort.signal);else await this.runCPU(abort.signal);
      if(abort.signal.aborted)throw aborted();this.state='completed';this.present();this.emit();return this;
    }catch(error){if(generation===this.generation){if(error.name==='AbortError'){if(this.state!=='error')this.state='cancelled';}else{this.state='error';this.errors.push(error.message);}this.emit();}if(error.name!=='AbortError')throw error;return this;
    }finally{if(generation===this.generation)this.terminateWorkers();}
  }
  freshCanvas(){const next=this.canvas.cloneNode(false);this.canvas.replaceWith(next);this.canvas=next;this.context=null;}
  emit(){const now=performance.now();this.onUpdate({state:this.state,backend:this.backend,samples:this.sample,progress:this.settings?Math.min(1,(this.sample+this.partial)/this.settings.samples):0,elapsed:this.started?(now-this.started-this.pauseTime-(this.pausedAt?now-this.pausedAt:0))/1000:0,triangles:this.scene?.triangleCount??0,lights:this.scene?.lightCount??0,warnings:this.scene?.warnings??[],fallbackReason:this.fallbackReason,errors:[...this.errors]});}
  pause(){if(this.state!=='rendering')return;this.state='paused';this.pausedAt=performance.now();this.emit();}
  resume(){if(this.state!=='paused')return;this.pauseTime+=performance.now()-this.pausedAt;this.pausedAt=0;this.state='rendering';this.wake?.();this.pump?.();this.emit();}
  cancel(){if(this.pausedAt){this.pauseTime+=performance.now()-this.pausedAt;this.pausedAt=0;}this.abort?.abort();this.wake?.();this.terminateWorkers();if(['preparing','rendering','paused'].includes(this.state)){this.state='cancelled';this.emit();}}
  async gate(signal){if(signal.aborted)throw aborted();if(this.state==='paused')await abortable(new Promise(resolve=>this.wake=resolve),signal);if(signal.aborted)throw aborted();}
  setView(options){this.view={...this.view,...options};this.pass=this.view.pass??'beauty';this.present();}
  terminateWorkers(){for(const worker of this.workers)worker.terminate();this.workers=[];if(this.workerURL)URL.revokeObjectURL(this.workerURL);this.workerURL=null;this.pump=null;}
  disposeGPU(){for(const b of this.buffers)b.destroy();this.buffers=[];this.device?.destroy();this.device=null;if(this.context){this.context.unconfigure();this.freshCanvas();}}
  dispose(){this.cancel();this.generation++;this.disposeGPU();this.frame=null;}
  tiles(size=32){const out=[];for(let y=0;y<this.settings.height;y+=size)for(let x=0;x<this.settings.width;x+=size)out.push({x,y,width:Math.min(size,this.settings.width-x),height:Math.min(size,this.settings.height-y)});return out;}
  async runCPU(signal){
    const count=Math.max(1,Math.min(4,(navigator.hardwareConcurrency??2)-1));this.workerURL=URL.createObjectURL(new Blob([`(${finalRenderWorker.toString()})(${createTraceKernel.toString()});`],{type:'text/javascript'}));
    const ready=[];for(let i=0;i<count;i++){const worker=new Worker(this.workerURL,{name:`Veldra path tracer ${i+1}`});this.workers.push(worker);ready.push(new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.type==='ready'?resolve():reject(Error(e.data.message));worker.onerror=e=>reject(Error(e.message||'Render worker failed'));}));worker.postMessage({type:'init',scene:this.scene,camera:this.camera,settings:this.settings});}
    await abortable(Promise.all(ready),signal);const tiles=this.tiles(32);
    for(let sample=0;sample<this.settings.samples;sample++){await this.gate(signal);
      await abortable(new Promise((resolve,reject)=>{let next=0,finished=0;const idle=new Set(this.workers);this.pump=()=>{if(signal.aborted||this.state==='paused')return;for(const worker of [...idle]){if(next>=tiles.length)break;idle.delete(worker);worker.postMessage({type:'tile',job:{...tiles[next++],sample}});}};
        for(const worker of this.workers){worker.onerror=e=>reject(Error(e.message||'Render worker failed'));worker.onmessage=e=>{if(signal.aborted)return;if(e.data.type==='error'){reject(Error(e.data.message));return;}if(e.data.type!=='tile')return;const r=e.data.result;this.mergeTile(r);idle.add(worker);finished++;this.partial=finished/tiles.length;if(performance.now()-this.lastPresent>250){this.present();this.emit();}if(finished===tiles.length)resolve();else this.pump();};}this.pump();
      }),signal);
      this.sample=sample+1;this.partial=0;this.emit();
    }
  }
  mergeTile(r){const f=this.frame;for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const src=(y*r.width+x)*4,dst=((r.y+y)*f.width+r.x+x)*4;for(let a=0;a<3;a++)f.film[dst+a]+=r.pixels[src+a];f.film[dst+3]++;if(r.normal){for(let a=0;a<4;a++)f.normal[dst+a]=r.normal[src+a];for(let a=0;a<3;a++)f.albedo[dst+a]=r.albedo[src+a];}f.albedo[dst+3]+=r.pixels[src+3];}}
  async initGPU(generation,signal){
    const check=()=>{if(generation!==this.generation||signal.aborted)throw aborted();};check();
    if(!globalThis.isSecureContext||!navigator.gpu)throw Error('WebGPU requires a supported browser and a secure context.');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});check();if(!adapter)throw Error('No WebGPU adapter is available.');
    const bytes=this.settings.width*this.settings.height*16,max=Math.max(bytes,this.scene.triangles.byteLength,this.scene.nodes.byteLength,this.scene.texels.byteLength,this.scene.materials.byteLength,this.scene.lights.byteLength);
    if(max>adapter.limits.maxStorageBufferBindingSize||max>adapter.limits.maxBufferSize)throw Error('Scene or resolution exceeds this GPU’s storage-buffer limits. Reduce quality or resolution.');
    const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.max(134217728,max),maxBufferSize:Math.max(268435456,max)}});try{check();}catch(error){device.destroy();throw error;}this.device=device;
    device.lost.then(info=>{if(generation===this.generation&&info.reason!=='destroyed'){this.errors.push('GPU device lost: '+info.message);this.state='error';this.abort?.abort();this.emit();}});
    device.addEventListener('uncapturederror',e=>{if(generation===this.generation){this.errors.push(e.error.message);this.state='error';this.abort?.abort();this.emit();}});
    device.pushErrorScope('validation');let scopeOpen=true;try{
      const module=device.createShaderModule({code:FINAL_TRACE_WGSL,label:'Veldra BVH path-trace compute'}),display=device.createShaderModule({code:FINAL_DISPLAY_WGSL,label:'Veldra film / AOV display'});
      for(const shader of [module,display]){const info=await shader.getCompilationInfo();check();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));}
      const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});check();this.pipeline=pipeline;const format=navigator.gpu.getPreferredCanvasFormat();
      const displayPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:display,entryPoint:'vs'},fragment:{module:display,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});check();this.displayPipeline=displayPipeline;
      const buffer=(size,usage,data)=>{const b=device.createBuffer({size:Math.max(16,size),usage,mappedAtCreation:!!data});if(data){new Float32Array(b.getMappedRange()).set(data);b.unmap();}this.buffers.push(b);return b;},storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC;
      this.params=buffer(160,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);const data=[this.scene.triangles,this.scene.nodes,this.scene.materials,this.scene.lights,this.scene.texels].map(a=>buffer(a.byteLength,GPUBufferUsage.STORAGE,a));this.filmBuffer=buffer(bytes,storage);this.normalBuffer=buffer(bytes,storage);this.albedoBuffer=buffer(bytes,storage);
      this.bindGroup=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[this.params,...data,this.filmBuffer,this.normalBuffer,this.albedoBuffer].map((b,binding)=>({binding,resource:{buffer:b}}))});
      this.displayParams=buffer(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);this.displayGroup=device.createBindGroup({layout:this.displayPipeline.getBindGroupLayout(0),entries:[this.displayParams,this.filmBuffer,this.normalBuffer,this.albedoBuffer].map((b,binding)=>({binding,resource:{buffer:b}}))});
      scopeOpen=false;const error=await device.popErrorScope();check();if(error)throw Error(error.message);this.freshCanvas();this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('Could not create the final-render WebGPU canvas');this.context.configure({device,format,alphaMode:'opaque'});
      this.backend=`WebGPU compute path tracer${adapter.info?.device?' · '+adapter.info.device:''}`;this.adapterInfo={vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,description:adapter.info?.description};
    }catch(error){if(scopeOpen)try{await device.popErrorScope();}catch{}throw error;}
  }
  uniform(tile,sample){const b=new ArrayBuffer(160),u=new Uint32Array(b),f=new Float32Array(b),c=this.camera,s=this.settings;u.set([s.width,s.height,sample,s.bounces,tile.x,tile.y,tile.width,tile.height]);f.set([...c.eye,c.lensRadius,...c.forward,c.focus,...c.right,c.aspect,...c.up,c.tanFov,...this.scene.environment,...this.scene.sky,this.scene.intensity,this.scene.epsilon,this.scene.lightCount,s.transparent?1:0,s.fireflyClamp,c.orthographic?1:0,c.scale,0,0],8);return b;}
  async runGPU(signal){const tiles=this.tiles(64);for(let sample=0;sample<this.settings.samples;sample++){for(let i=0;i<tiles.length;i++){await this.gate(signal);const tile=tiles[i],device=this.device;device.queue.writeBuffer(this.params,0,this.uniform(tile,sample));const encoder=device.createCommandEncoder({label:'Final render tile'}),pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.dispatchWorkgroups(Math.ceil(tile.width/8),Math.ceil(tile.height/8));pass.end();device.queue.submit([encoder.finish()]);await abortable(device.queue.onSubmittedWorkDone(),signal);this.partial=(i+1)/tiles.length;if(performance.now()-this.lastPresent>100){this.present();this.emit();await new Promise(r=>setTimeout(r,0));}}this.sample=sample+1;this.partial=0;this.emit();}}
  present(){if(!this.settings)return;this.lastPresent=performance.now();if(this.device&&this.context){const v=this.view;this.device.queue.writeBuffer(this.displayParams,0,new Float32Array([this.settings.width,this.settings.height,v.exposure,{aces:0,reinhard:1,linear:2}[v.toneMap]??0,v.denoise?1:0,{beauty:0,albedo:1,normal:2,depth:3,samples:4}[v.pass]??0,v.focusDistance,this.settings.transparent?1:0]));const encoder=this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});pass.setPipeline(this.displayPipeline);pass.setBindGroup(0,this.displayGroup);pass.draw(3);pass.end();this.device.queue.submit([encoder.finish()]);}
    else if(this.frame){const ctx=this.canvas.getContext('2d');ctx.putImageData(new ImageData(filmRGBA(this.frame,{...this.view,transparent:this.settings.transparent}),this.frame.width,this.frame.height),0,0);}}
  async snapshot(){if(this.device){const size=this.settings.width*this.settings.height*16,staging=[];try{const encoder=this.device.createCommandEncoder();for(const source of [this.filmBuffer,this.normalBuffer,this.albedoBuffer]){const b=this.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});staging.push(b);encoder.copyBufferToBuffer(source,0,b,0,size);}this.device.queue.submit([encoder.finish()]);await Promise.all(staging.map(b=>b.mapAsync(GPUMapMode.READ)));const data=staging.map(b=>new Float32Array(b.getMappedRange().slice(0)));return {width:this.settings.width,height:this.settings.height,film:data[0],normal:data[1],albedo:data[2]};}finally{for(const b of staging){b.unmap();b.destroy();}}}
    if(!this.frame)throw Error('Render an image before exporting.');return {...this.frame,film:this.frame.film.slice(),normal:this.frame.normal.slice(),albedo:this.frame.albedo.slice()};}
}
