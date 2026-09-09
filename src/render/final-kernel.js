/** Self-contained reference path tracer; the same function is serialized into real Web Workers.
 * Geometry and material layouts are shared with final-wgsl.js. No DOM, random global state or imports.
 */
export function createTraceKernel(scene,camera,settings){
  const T=scene.triangles,N=scene.nodes,M=scene.materials,L=scene.lights,X=scene.texels,PI=Math.PI,eps=scene.epsilon,lightCount=L.length/16;
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,b)=>[a[0]*b,a[1]*b,a[2]*b],times=(a,b)=>[a[0]*b[0],a[1]*b[1],a[2]*b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/Math.max(1e-30,Math.sqrt(dot(a,a)))),v=(a,k)=>[a[k],a[k+1],a[k+2]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>add(mul(a,1-t),mul(b,t)),reflect=(d,n)=>sub(d,mul(n,2*dot(d,n))),power=(a,b)=>a*a/Math.max(1e-30,a*a+b*b);
  let state=1;
  function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
  function local(n,x,y,z){const t=unit(cross(Math.abs(n[2])<.999?[0,0,1]:[0,1,0],n)),b=cross(n,t);return add(add(mul(t,x),mul(b,y)),mul(n,z));}
  function box(o,d,k,max){let lo=0,hi=max;for(let a=0;a<3;a++){if(Math.abs(d[a])<1e-20){if(o[a]<N[k+a]||o[a]>N[k+4+a])return false;}else{const t=(N[k+a]-o[a])/d[a],u=(N[k+4+a]-o[a])/d[a];lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));if(hi<lo)return false;}}return true;}
  function trace(o,d,max=1e30,shadow=false){let closest=max,result=null,stack=[0];
    while(stack.length){const node=stack.pop()*8;if(!box(o,d,node,closest))continue;const first=N[node+3],count=N[node+7];if(first>=0){stack.push(count,first);continue;}
      for(let i=-first-1;i<-first-1+count;i++){const k=i*24,e1=v(T,k+4),e2=v(T,k+8),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-16)continue;const q=sub(o,v(T,k)),u=dot(q,p)/det;if(u<0||u>1)continue;const r=cross(q,e1),w=dot(d,r)/det;if(w<0||u+w>1)continue;const t=dot(e2,r)/det;if(t<=eps||t>=closest)continue;if(shadow)return {t};closest=t;result={t,u,v:w,id:i};}
    }return result;
  }
  function surface(hit,o,d){const k=hit.id*24,gn=unit(cross(v(T,k+4),v(T,k+8))),front=dot(gn,d)<0,g=front?gn:mul(gn,-1);let n=unit(add(add(mul(v(T,k+12),1-hit.u-hit.v),mul(v(T,k+16),hit.u)),mul(v(T,k+20),hit.v)));if(dot(n,g)<0)n=mul(n,-1);if(dot(n,d)>-.001)n=g;return {...hit,p:add(o,mul(d,hit.t)),gn:g,n,front,mat:T[k+3]*20};}
  function texel(offset,w,h,u,vv){u=u-Math.floor(u);vv=vv-Math.floor(vv);const xx=u*w-.5,yy=vv*h-.5,x=Math.floor(xx),y=Math.floor(yy),fx=xx-x,fy=yy-y;
    const sample=(a,b)=>v(X,(offset+((b%h+h)%h)*w+(a%w+w)%w)*4);return mix(mix(sample(x,y),sample(x+1,y),fx),mix(sample(x,y+1),sample(x+1,y+1),fx),fy);}
  function color(h){const m=h.mat,scale=M[m+15],n=h.gn;let u,vv;if(Math.abs(n[2])>=Math.max(Math.abs(n[0]),Math.abs(n[1]))){[u,vv]=h.p;}else if(Math.abs(n[0])>=Math.abs(n[1])){[u,vv]=[h.p[1],h.p[2]];}else{[u,vv]=[h.p[0],h.p[2]];}const a=M[m+19],x=(u*Math.cos(a)-vv*Math.sin(a))/scale,y=(u*Math.sin(a)+vv*Math.cos(a))/scale;
    let c=v(M,m);if(M[m+11]===1&&(Math.floor(x)+Math.floor(y))%2!==0)c=v(M,m+16);if(M[m+12]>=0)c=times(c,texel(M[m+12],M[m+13],M[m+14],x,y));return c;}
  function environment(d){const e=scene.environment;if(e[0]>=0){const u=(Math.atan2(d[1],d[0])-e[3])/(2*PI)+.5,theta=Math.acos(clamp(d[2],-1,1)),w=e[1],h=e[2],x=Math.min(w-1,Math.floor((u-Math.floor(u))*w)),y=Math.min(h-1,Math.floor(theta/PI*h)),index=e[0]+y*w+x,cdf=X[index*4+3],prev=index===e[0]?0:X[(index-1)*4+3],solid=2*PI/w*(Math.cos(PI*y/h)-Math.cos(PI*(y+1)/h));return {c:mul(v(X,index*4),scene.intensity),pdf:(cdf-prev)/Math.max(1e-20,solid)};}
    const t=clamp(d[2]*.5+.5,0,1);return {c:mul(mix(mul(scene.sky,.18),scene.sky,Math.sqrt(t)),scene.intensity),pdf:1/(4*PI)};
  }
  function sampleEnvironment(){const e=scene.environment;if(e[0]>=0){let lo=0,hi=e[1]*e[2]-1,r=random();while(lo<hi){const mid=(lo+hi)>>1;if(X[(e[0]+mid)*4+3]<r)lo=mid+1;else hi=mid;}const x=lo%e[1],y=Math.floor(lo/e[1]),phi=((x+random())/e[1]-.5)*2*PI+e[3];
      const q=random(),cz=(1-q)*Math.cos(PI*y/e[2])+q*Math.cos(PI*(y+1)/e[2]),s=Math.sqrt(Math.max(0,1-cz*cz));return [s*Math.cos(phi),s*Math.sin(phi),cz];}
    const z=1-2*random(),phi=2*PI*random(),s=Math.sqrt(Math.max(0,1-z*z));return [s*Math.cos(phi),s*Math.sin(phi),z];}
  function bsdf(h,base,wo,wi){const m=h.mat,n=h.n,nv=dot(n,wo),nl=dot(n,wi);if(nv<=0||nl<=0)return {f:[0,0,0],pdf:0};const half=unit(add(wo,wi)),nh=clamp(dot(n,half),0,1),vh=clamp(dot(wo,half),1e-8,1),a=M[m+4]**2,a2=a*a,D=a2/(PI*(nh*nh*(a2-1)+1)**2),G1=x=>2*x/(x+Math.sqrt(a2+(1-a2)*x*x)),G=G1(nv)*G1(nl),f0=mix([.04,.04,.04],base,M[m+3]),F=mix(f0,[1,1,1],(1-vh)**5),diff=times(times(base,sub([1,1,1],F)),[(1-M[m+3])/PI,(1-M[m+3])/PI,(1-M[m+3])/PI]),spec=mul(F,D*G/(4*nv*nl)),p=.25+.5*M[m+3],weight=1-M[m+5];return {f:mul(add(diff,spec),weight),pdf:weight*((1-p)*nl/PI+p*D*nh/(4*vh))};}
  function sampleBSDF(h,base,wo){const m=h.mat;
    if(random()<M[m+5]){const eta=h.front?1/M[m+6]:M[m+6],c=clamp(dot(wo,h.gn),0,1),s2=eta*eta*(1-c*c);let F=1,ct=0;if(s2<1){ct=Math.sqrt(1-s2);const rs=(eta*c-ct)/(eta*c+ct),rp=(c-eta*ct)/(c+eta*ct);F=(rs*rs+rp*rp)/2;}if(random()<F)return {wi:reflect(mul(wo,-1),h.gn),weight:[1,1,1],pdf:0,delta:true,eta:1};return {wi:unit(add(mul(wo,-eta),mul(h.gn,eta*c-ct))),weight:mul(base,eta*eta),pdf:0,delta:true,eta:1/(eta*eta)};}
    let wi;if(random()<.25+.5*M[m+3]){const a=M[m+4]**2,u=random(),z=Math.sqrt((1-u)/(1+(a*a-1)*u)),r=Math.sqrt(Math.max(0,1-z*z)),phi=2*PI*random(),half=local(h.n,r*Math.cos(phi),r*Math.sin(phi),z);wi=reflect(mul(wo,-1),half);}else{const r=Math.sqrt(random()),phi=2*PI*random();wi=local(h.n,r*Math.cos(phi),r*Math.sin(phi),Math.sqrt(1-r*r));}
    if(dot(wi,h.gn)<=0)return null;const value=bsdf(h,base,wo,wi);if(value.pdf<1e-20)return null;return {wi,weight:mul(value.f,Math.max(0,dot(h.n,wi))/value.pdf),pdf:value.pdf,delta:false,eta:1};
  }
  function sampleLight(h){const index=Math.min(lightCount-1,Math.floor(random()*lightCount)),k=index*16,type=L[k+3];let wi,c,pdf=1/lightCount,distance=1e30,delta=false;
    if(type===0){wi=sampleEnvironment();const e=environment(wi);c=e.c;pdf*=e.pdf;}
    else if(type===1){const tri=L[k+14]*24,r=Math.sqrt(random()),u=1-r,w=random()*r,p=add(v(T,tri),add(mul(v(T,tri+4),u),mul(v(T,tri+8),w))),d=sub(p,h.p);distance=Math.sqrt(dot(d,d));wi=mul(d,1/distance);const n=unit(cross(v(T,tri+4),v(T,tri+8))),cos=Math.abs(dot(n,wi));if(cos<1e-8)return null;pdf*=distance*distance/(T[tri+11]*cos);const m=T[tri+3]*20;c=mul(v(M,m+8),M[m+7]);}
    else if(type===3){const n=unit(v(L,k+8)),z=1-random()*(1-Math.cos(L[k+12])),r=Math.sqrt(1-z*z),phi=random()*2*PI;wi=local(n,r*Math.cos(phi),r*Math.sin(phi),z);c=mul(v(L,k+4),L[k+7]);delta=true;}
    else{const d=sub(v(L,k),h.p);distance=Math.sqrt(dot(d,d));wi=mul(d,1/Math.max(1e-20,distance));let factor=1;if(type===4){const q=dot(mul(wi,-1),v(L,k+8));factor=clamp((q-L[k+11])/Math.max(1e-6,L[k+13]-L[k+11]),0,1);factor=factor*factor*(3-2*factor);}c=mul(v(L,k+4),L[k+7]*factor/Math.max(eps*eps,distance*distance));delta=true;}
    if(dot(h.gn,wi)<=0||pdf<1e-20)return null;return {wi,c,pdf,distance,delta};
  }
  function cameraRay(x,y,jitter=true){const jx=jitter?random():.5,jy=jitter?random():.5,nx=((x+jx)/settings.width*2-1)*camera.aspect,ny=1-(y+jy)/settings.height*2;let o=camera.eye.slice(),d;
    if(camera.orthographic){o=add(o,add(mul(camera.right,nx*camera.scale/2),mul(camera.up,ny*camera.scale/2)));d=camera.forward.slice();}else d=unit(add(camera.forward,add(mul(camera.right,nx*camera.tanFov),mul(camera.up,ny*camera.tanFov))));
    if(jitter&&camera.lensRadius>0){const target=add(o,mul(d,camera.focus/Math.max(1e-6,dot(d,camera.forward)))),r=Math.sqrt(random())*camera.lensRadius,a=random()*2*PI;o=add(o,add(mul(camera.right,r*Math.cos(a)),mul(camera.up,r*Math.sin(a))));d=unit(sub(target,o));}return {o,d};
  }
  function samplePixel(x,y,sample){state=(Math.imul(y*settings.width+x+1,747796405)^Math.imul(sample+1,2891336453))>>>0;if(!state)state=1;const ray=cameraRay(x,y);let o=ray.o,d=ray.d,beta=[1,1,1],radiance=[0,0,0],prevPdf=0,delta=true,etaScale=1,coverage=0;
    for(let bounce=0;bounce<settings.bounces;bounce++){const hit=trace(o,d);if(!hit){if(bounce>0||!settings.transparent){const e=environment(d),w=delta?1:power(prevPdf,e.pdf/lightCount);radiance=add(radiance,times(beta,mul(e.c,w)));}break;}
      const h=surface(hit,o,d),m=h.mat,base=color(h),wo=mul(d,-1);if(bounce===0)coverage=1;
      if(M[m+7]>0){const area=T[h.id*24+11],gn=unit(cross(v(T,h.id*24+4),v(T,h.id*24+8))),p=h.t*h.t/(Math.max(1e-8,Math.abs(dot(gn,d)))*area*lightCount),w=delta?1:power(prevPdf,p);radiance=add(radiance,times(beta,mul(v(M,m+8),M[m+7]*w)));}
      const light=sampleLight(h);if(light){const b=bsdf(h,base,wo,light.wi),cos=Math.max(0,dot(h.n,light.wi));if(cos>0&&b.pdf>0&&!trace(add(h.p,mul(h.gn,eps*2)),light.wi,light.distance-eps*4,true)){const w=light.delta||bounce+1>=settings.bounces?1:power(light.pdf,b.pdf);radiance=add(radiance,times(beta,times(b.f,mul(light.c,cos*w/light.pdf))));}}
      if(bounce+1>=settings.bounces)break;
      const b=sampleBSDF(h,base,wo);if(!b)break;beta=times(beta,b.weight);etaScale*=b.eta;prevPdf=b.pdf;delta=b.delta;d=b.wi;o=add(h.p,mul(h.gn,dot(d,h.gn)>0?eps*2:-eps*2));
      if(bounce>=3){const survive=clamp(Math.max(...beta)*etaScale,.05,.95);if(random()>survive)break;beta=mul(beta,1/survive);}
    }
    if(settings.fireflyClamp>0){const largest=Math.max(...radiance);if(largest>settings.fireflyClamp)radiance=mul(radiance,settings.fireflyClamp/largest);}
    radiance=radiance.map(x=>Number.isFinite(x)?Math.max(0,x):0);
    let normal=[0,0,0,0],albedo=[0,0,0,coverage];if(sample===0){const center=cameraRay(x,y,false),hit=trace(center.o,center.d);if(hit){const h=surface(hit,center.o,center.d);normal=[...h.n,h.t];albedo=[...color(h),coverage];}}
    return {color:radiance,normal,albedo,coverage};
  }
  function tile(job){const {x,y,width,height,sample}=job,pixels=new Float32Array(width*height*4),normal=sample===0?new Float32Array(pixels.length):null,albedo=sample===0?new Float32Array(pixels.length):null;for(let j=0;j<height;j++)for(let i=0;i<width;i++){const p=(j*width+i)*4,r=samplePixel(x+i,y+j,sample);pixels.set([...r.color,r.coverage],p);if(normal){normal.set(r.normal,p);albedo.set(r.albedo,p);}}return {...job,pixels,normal,albedo};}
  return {trace,surface,bsdf,environment,cameraRay,samplePixel,tile};
}
export function finalRenderWorker(createKernel){let kernel;self.onmessage=e=>{try{if(e.data.type==='init'){kernel=createKernel(e.data.scene,e.data.camera,e.data.settings);self.postMessage({type:'ready'});}else if(e.data.type==='tile'){const result=kernel.tile(e.data.job),transfer=[result.pixels.buffer];if(result.normal)transfer.push(result.normal.buffer,result.albedo.buffer);self.postMessage({type:'tile',result},transfer);}}catch(error){self.postMessage({type:'error',message:error.message,stack:error.stack});}};}
