import {V,M,hexRGB} from '../core/math.js';
import {geometryMesh} from '../core/geometry.js';
import {transformMesh} from '../core/mesh.js';

/** Final rendering uses a frozen, world-space scene, independent of selection overlays. */
export const FINAL_DEFAULTS={width:960,height:640,samples:128,bounces:8,quality:1.5,backend:'auto',exposure:0,toneMap:'aces',denoise:false,transparent:false,ground:true,groundColor:'#c6cacb',groundZ:-.55,environmentColor:'#b5c8e5',environmentStrength:.8,environmentRotation:0,environmentImage:'',aperture:0,focusDistance:48,fireflyClamp:0,includePreviews:true,lights:[{type:'sun',name:'Key sun',direction:[-1,-1,2],color:'#fff0dc',power:3,angle:4}]};
export const MATERIAL_PRESETS={
  Matte:{color:'#b4c8c2',metallic:0,roughness:.8,transmission:0,ior:1.5,emission:0},
  Ceramic:{color:'#d8e0dc',metallic:0,roughness:.18,transmission:0,ior:1.5,emission:0},
  Aluminum:{color:'#c7cbd0',metallic:1,roughness:.22,transmission:0,ior:1.5,emission:0},
  Gold:{color:'#e5b45a',metallic:1,roughness:.16,transmission:0,ior:1.5,emission:0},
  Glass:{color:'#f8ffff',metallic:0,roughness:.05,transmission:1,ior:1.5,emission:0},
  Water:{color:'#edfaff',metallic:0,roughness:.04,transmission:1,ior:1.333,emission:0},
  Emissive:{color:'#fff0d9',metallic:0,roughness:.4,transmission:0,ior:1.5,emission:8}
};
export function linear(v){return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
export function linearColor(s){return hexRGB(/^#[0-9a-f]{6}$/i.test(s??'')?s:'#ffffff').map(linear);}
const num=(v,d,min,max)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):d;
export function renderSettings(value={}){
  const s={...structuredClone(FINAL_DEFAULTS),...value};
  for(const [k,min,max] of [['width',16,8192],['height',16,8192],['samples',1,65536],['bounces',1,32]])s[k]=Math.round(num(s[k],FINAL_DEFAULTS[k],min,max));
  if(s.width*s.height>8388608)throw Error('Render resolution exceeds the 8,388,608-pixel memory budget (4K UHD is supported).');
  for(const [k,min,max] of [['quality',.25,4],['exposure',-16,16],['environmentStrength',0,100],['environmentRotation',-360,360],['aperture',0,1000],['focusDistance',.001,1e8],['fireflyClamp',0,1e6],['groundZ',-1e8,1e8]])s[k]=num(s[k],FINAL_DEFAULTS[k],min,max);
  s.backend=['auto','webgpu','cpu'].includes(s.backend)?s.backend:'auto';
  s.lights=Array.isArray(s.lights)?s.lights.slice(0,64):structuredClone(FINAL_DEFAULTS.lights);
  for(const k of ['ground','denoise','transparent','includePreviews'])s[k]=!!s[k];
  return s;
}
export function renderCamera(camera,settings){
  const eye=[...camera.eye],forward=V.unit(V.sub(camera.target,eye));
  const right=V.unit(V.cross(forward,camera.type==='Top'?[0,1,0]:[0,0,1])),up=V.cross(right,forward);
  return {eye,forward,right,up,aspect:settings.width/settings.height,tanFov:Math.tan(camera.fov/2),orthographic:camera.type!=='Perspective',scale:camera.scale,lensRadius:settings.aperture/2,focus:settings.focusDistance};
}
/** Flat BVH: 8 floats/node; leaf min.w=-first-1, max.w=count; branch min.w/max.w=child indices. */
export function buildRenderBVH(triangles){
  const count=triangles.length/24;if(!Number.isInteger(count))throw Error('Invalid packed triangles');
  if(!count)return {triangles:new Float32Array(24),nodes:new Float32Array([0,0,0,-1,0,0,0,0]),triangleCount:0};
  const ids=Array.from({length:count},(_,i)=>i),boxes=new Float64Array(count*6),centers=new Float64Array(count*3),nodes=[],ordered=[];
  for(let i=0;i<count;i++)for(let a=0;a<3;a++){const t=i*24,x=triangles[t+a],y=x+triangles[t+4+a],z=x+triangles[t+8+a];boxes[i*6+a]=Math.min(x,y,z);boxes[i*6+3+a]=Math.max(x,y,z);centers[i*3+a]=(x+y+z)/3;}
  function split(list,depth){
    const index=nodes.length/8,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const id of list)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],boxes[id*6+a]);hi[a]=Math.max(hi[a],boxes[id*6+3+a]);}
    nodes.push(...lo,0,...hi,0);
    if(list.length<=6||depth>=40){nodes[index*8+3]=-ordered.length-1;nodes[index*8+7]=list.length;ordered.push(...list);return index;}
    let axis=0;for(let a=1;a<3;a++)if(hi[a]-lo[a]>hi[axis]-lo[axis])axis=a;
    list.sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);const mid=list.length>>1;
    nodes[index*8+3]=split(list.slice(0,mid),depth+1);nodes[index*8+7]=split(list.slice(mid),depth+1);return index;
  }
  split(ids,0);const packed=new Float32Array(triangles.length);ordered.forEach((id,i)=>packed.set(triangles.subarray(id*24,id*24+24),i*24));
  return {triangles:packed,nodes:new Float32Array(nodes),triangleCount:count};
}
export function compileRenderScene(entries,settings,images=new Map()){
  const triangles=[],materials=[],texels=[],lights=[],warnings=[],textureCache=new Map();let skipped=0;
  function texture(key,environment=false){if(!key||!images.has(key))return [-1,0,0];const cacheKey=key+environment;if(textureCache.has(cacheKey))return textureCache.get(cacheKey);
    const image=images.get(key),offset=texels.length/4,w=image.width,h=image.height;let sum=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,c=image.pixels.slice(p,p+3);sum+=environment?Math.max(1e-8,(.2126*c[0]+.7152*c[1]+.0722*c[2])*(Math.cos(Math.PI*y/h)-Math.cos(Math.PI*(y+1)/h))):0;texels.push(...c,environment?sum:1);}
    if(environment)for(let i=offset;i<texels.length/4;i++)texels[i*4+3]/=sum;
    const result=[offset,w,h];textureCache.set(cacheKey,result);return result;
  }
  function material(o){const m=o.material??{},id=materials.length/20,c=linearColor(o.color),e=linearColor(m.emissionColor??o.color),t=texture(m.texture),checker=linearColor(m.checkerColor??'#eeeeee');
    materials.push(...c,num(m.metallic,0,0,1),num(m.roughness,.4,.025,1),num(m.transmission,0,0,1),num(m.ior,1.5,1.0001,3),num(m.emission,0,0,1e6),...e,m.pattern==='checker'?1:0,...t,num(m.textureScale,1,.000001,1e6),...checker,num(m.textureRotation,0,-360,360)*Math.PI/180);return id;}
  function triangle(a,b,c,na,nb,nc,mat){const e1=V.sub(b,a),e2=V.sub(c,a),area=V.length(V.cross(e1,e2))/2;if(![...a,...b,...c,...na,...nb,...nc].every(Number.isFinite))throw Error('Non-finite geometry in render scene');if(area<1e-18){skipped++;return;}if(triangles.length/24>=500000)throw Error('Final-render triangle budget exceeded (500,000). Reduce tessellation quality or hide objects.');triangles.push(...a,mat,...e1,-1,...e2,area,...na,0,...nb,0,...nc,0);}
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const entry of entries){const o=entry.object??entry;if(o.visible===false)continue;const mesh=entry.mesh??transformMeshOrNull(o,settings.quality);if(!mesh){warnings.push(`${o.name}: curves/points are construction geometry; use Pipe for renderable thickness.`);continue;}
    const mat=material(o);for(const p of mesh.positions)for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}
    for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),p=ids.map(j=>mesh.positions[j]);const n=V.unit(V.cross(V.sub(p[1],p[0]),V.sub(p[2],p[0])));triangle(...p,...ids.map(j=>mesh.normals?.[j]??n),mat);}
  }
  if(!Number.isFinite(min[0])){min=[-10,-10,-10];max=[10,10,10];}
  const diagonal=V.length(V.sub(max,min)),epsilon=Math.max(1e-6,diagonal*1e-6);
  if(settings.ground){const r=Math.max(10,diagonal*5),x=(min[0]+max[0])/2,y=(min[1]+max[1])/2,z=settings.groundZ,n=[0,0,1],mat=material({color:settings.groundColor,material:{roughness:.85}}),a=[x-r,y-r,z],b=[x+r,y-r,z],c=[x+r,y+r,z],d=[x-r,y+r,z];triangle(a,b,c,n,n,n,mat);triangle(a,c,d,n,n,n,mat);}
  const vec=(v,d)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?v:d;
  // Environment occupies light slot zero. Analytic lights follow; mesh emitters are appended after BVH ordering.
  lights.push(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
  for(const l of settings.lights){if(l.enabled===false)continue;const p=vec(l.position,[0,0,20]),color=linearColor(l.color),power=num(l.power,1,0,1e9),rawDirection=vec(l.direction,[0,0,-1]),dir=V.length(rawDirection)>1e-12?V.unit(rawDirection):[0,0,-1];
    if(l.type==='area'){const n=V.length(dir)>.5?dir:[0,0,-1],right=V.unit(V.cross(Math.abs(n[2])>.99?[0,1,0]:[0,0,1],n)),up=V.cross(n,right),w=num(l.width,10,.001,1e6)/2,h=num(l.height,10,.001,1e6)/2,P=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>V.add(p,V.add(V.mul(right,x*w),V.mul(up,y*h)))),mat=material({color:l.color,material:{emission:power,emissionColor:l.color,roughness:1}});triangle(P[0],P[1],P[2],n,n,n,mat);triangle(P[0],P[2],P[3],n,n,n,mat);}
    else {const type={point:2,sun:3,spot:4}[l.type];if(!type)continue;lights.push(...p,type,...color,power,...dir,Math.cos(num(l.cone,45,1,179)*Math.PI/360),num(l.angle,1,0,45)*Math.PI/180,Math.cos(num(l.cone,45,1,179)*Math.PI/480),-1,0);}
  }
  const bvh=buildRenderBVH(new Float32Array(triangles));
  for(let i=0;i<bvh.triangleCount;i++){const k=i*24,mat=bvh.triangles[k+3]*20;if(materials[mat+7]<=0)continue;const id=lights.length/16;bvh.triangles[k+7]=id;lights.push(0,0,0,1,0,0,0,0,0,0,0,0,0,0,i,0);}
  const env=texture(settings.environmentImage,true);if(skipped)warnings.push(`${skipped} degenerate triangles omitted.`);
  return {...bvh,materials:new Float32Array(materials.length?materials:Array(20).fill(0)),lights:new Float32Array(lights),texels:new Float32Array(texels.length?texels:[0,0,0,1]),environment:[...env,settings.environmentRotation*Math.PI/180],sky:linearColor(settings.environmentColor),intensity:settings.environmentStrength,epsilon,warnings,bounds:{min,max},materialCount:materials.length/20,lightCount:lights.length/16};
}
function transformMeshOrNull(o,quality){const mesh=geometryMesh(o.geometry,quality);return mesh?transformMesh(mesh,o.matrix??M.identity()):null;}
