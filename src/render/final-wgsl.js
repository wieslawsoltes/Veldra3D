/** WGSL compute path tracer. Eight storage bindings, 8x8 workgroups, bounded nonrecursive BVH traversal. */
export const FINAL_TRACE_WGSL=/* wgsl */`
struct Params { dims:vec4u, tile:vec4u, eye:vec4f, forward:vec4f, right:vec4f, up:vec4f, env:vec4f, sky:vec4f, options:vec4f, projection:vec4f }
struct Triangle { p:vec4f, e1:vec4f, e2:vec4f, n0:vec4f, n1:vec4f, n2:vec4f }
struct Node { lo:vec4f, hi:vec4f }
struct Material { base:vec4f, optics:vec4f, emission:vec4f, tex:vec4f, checker:vec4f }
struct Light { position:vec4f, energy:vec4f, direction:vec4f, shape:vec4f }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> triangles:array<Triangle>;
@group(0) @binding(2) var<storage,read> nodes:array<Node>;
@group(0) @binding(3) var<storage,read> materials:array<Material>;
@group(0) @binding(4) var<storage,read> lights:array<Light>;
@group(0) @binding(5) var<storage,read> texels:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> film:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> normalDepth:array<vec4f>;
@group(0) @binding(8) var<storage,read_write> albedoCoverage:array<vec4f>;
const PI:f32=3.141592653589793;
var<private> rng:u32;
fn rand()->f32 { rng=rng^(rng<<13u);rng=rng^(rng>>17u);rng=rng^(rng<<5u);return f32(rng)*2.3283064365386963e-10; }
fn unit(v:vec3f)->vec3f { return v*inverseSqrt(max(1e-30,dot(v,v))); }
fn power(a:f32,b:f32)->f32 { return a*a/max(1e-30,a*a+b*b); }
fn local(n:vec3f,v:vec3f)->vec3f { let axis=select(vec3f(0,1,0),vec3f(0,0,1),abs(n.z)<.999);let t=unit(cross(axis,n));return t*v.x+cross(n,t)*v.y+n*v.z; }
struct Hit { t:f32, id:i32, u:f32, v:f32 }
fn box(o:vec3f,d:vec3f,node:Node,limit:f32)->bool { var lo=0.0;var hi=limit;for(var a=0u;a<3u;a++){if(abs(d[a])<1e-20){if(o[a]<node.lo[a]||o[a]>node.hi[a]){return false;}}else{let t=(node.lo[a]-o[a])/d[a];let u=(node.hi[a]-o[a])/d[a];lo=max(lo,min(t,u));hi=min(hi,max(t,u));if(hi<lo){return false;}}}return true; }
fn trace(o:vec3f,d:vec3f,limit:f32,anyHit:bool)->Hit {
 var hit=Hit(limit,-1,0,0);var stack:array<u32,64>;stack[0]=0u;var sp=1u;
 loop {if(sp==0u){break;}sp--;let node=nodes[stack[sp]];if(!box(o,d,node,hit.t)){continue;}
  if(node.lo.w>=0.0){stack[sp]=u32(node.hi.w);stack[sp+1u]=u32(node.lo.w);sp+=2u;continue;}
  let first=u32(-node.lo.w-1.0);let end=first+u32(node.hi.w);
  for(var i=first;i<end;i++){let tri=triangles[i];let v=cross(d,tri.e2.xyz);let det=dot(tri.e1.xyz,v);if(abs(det)<1e-16){continue;}let q=o-tri.p.xyz;let u=dot(q,v)/det;if(u<0.0||u>1.0){continue;}let r=cross(q,tri.e1.xyz);let w=dot(d,r)/det;if(w<0.0||u+w>1.0){continue;}let t=dot(tri.e2.xyz,r)/det;if(t<=p.options.x||t>=hit.t){continue;}hit=Hit(t,i32(i),u,w);if(anyHit){return hit;}}
 }return hit;
}
struct Surface { position:vec3f, n:vec3f, gn:vec3f, front:bool, mat:u32 }
fn surface(hit:Hit,o:vec3f,d:vec3f)->Surface {let tri=triangles[u32(hit.id)];let g=unit(cross(tri.e1.xyz,tri.e2.xyz));let front=dot(g,d)<0.0;let gn=select(-g,g,front);var n=unit(tri.n0.xyz*(1.0-hit.u-hit.v)+tri.n1.xyz*hit.u+tri.n2.xyz*hit.v);if(dot(n,gn)<0.0){n=-n;}if(dot(n,d)>-.001){n=gn;}return Surface(o+d*hit.t,n,gn,front,u32(tri.p.w));}
fn texel(offset:u32,size:vec2i,xy:vec2i)->vec3f {let q=((xy%size)+size)%size;return texels[offset+u32(q.y*size.x+q.x)].xyz;}
fn textureColor(tex:vec4f,uv:vec2f)->vec3f {let xy=fract(uv)*tex.yz-.5;let ij=vec2i(floor(xy));let f=fract(xy);let size=vec2i(tex.yz);let off=u32(tex.x);return mix(mix(texel(off,size,ij),texel(off,size,ij+vec2i(1,0)),f.x),mix(texel(off,size,ij+vec2i(0,1)),texel(off,size,ij+vec2i(1,1)),f.x),f.y);}
fn baseColor(h:Surface)->vec3f {let m=materials[h.mat];var uv=h.position.xy;let n=abs(h.gn);if(n.z<max(n.x,n.y)){uv=select(h.position.xz,h.position.yz,n.x>=n.y);}let a=m.checker.w;uv=vec2f(uv.x*cos(a)-uv.y*sin(a),uv.x*sin(a)+uv.y*cos(a))/m.tex.w;var c=m.base.xyz;if(m.emission.w==1.0&&((i32(floor(uv.x))+i32(floor(uv.y)))%2)!=0){c=m.checker.xyz;}if(m.tex.x>=0.0){c*=textureColor(m.tex,uv);}return c;}
struct Environment { color:vec3f, pdf:f32 }
fn environment(d:vec3f)->Environment {
 if(p.env.x>=0.0){let w=u32(p.env.y);let h=u32(p.env.z);let u=fract((atan2(d.y,d.x)-p.env.w)/(2.0*PI)+.5);let theta=acos(clamp(d.z,-1.0,1.0));let x=min(w-1u,u32(u*f32(w)));let y=min(h-1u,u32(theta/PI*f32(h)));let index=u32(p.env.x)+y*w+x;var prev=0.0;if(index>u32(p.env.x)){prev=texels[index-1u].w;}let mass=texels[index].w-prev;let solid=2.0*PI/f32(w)*(cos(PI*f32(y)/f32(h))-cos(PI*f32(y+1u)/f32(h)));return Environment(texels[index].xyz*p.sky.w,mass/max(1e-20,solid));}
 let t=sqrt(clamp(d.z*.5+.5,0.0,1.0));return Environment(mix(p.sky.xyz*.18,p.sky.xyz,t)*p.sky.w,1.0/(4.0*PI));
}
fn sampleEnvironment()->vec3f {
 if(p.env.x>=0.0){let w=u32(p.env.y);let h=u32(p.env.z);var lo=0u;var hi=w*h-1u;let r=rand();loop{if(lo>=hi){break;}let mid=(lo+hi)/2u;if(texels[u32(p.env.x)+mid].w<r){lo=mid+1u;}else{hi=mid;}}
 let x=lo%w;let y=lo/w;let phi=((f32(x)+rand())/f32(w)-.5)*2.0*PI+p.env.w;let z=mix(cos(PI*f32(y)/f32(h)),cos(PI*f32(y+1u)/f32(h)),rand());let s=sqrt(max(0.0,1.0-z*z));return vec3f(s*cos(phi),s*sin(phi),z);}
 let z=1.0-2.0*rand();let phi=2.0*PI*rand();let s=sqrt(max(0.0,1.0-z*z));return vec3f(s*cos(phi),s*sin(phi),z);
}
struct BSDF { f:vec3f, pdf:f32 }
fn bsdf(h:Surface,base:vec3f,wo:vec3f,wi:vec3f)->BSDF {
 let m=materials[h.mat];let nv=dot(h.n,wo);let nl=dot(h.n,wi);if(nv<=0.0||nl<=0.0){return BSDF(vec3f(0),0);}
 let half=unit(wo+wi);let nh=clamp(dot(h.n,half),0.0,1.0);let vh=clamp(dot(wo,half),1e-8,1.0);let a=m.optics.x*m.optics.x;let a2=a*a;let den=nh*nh*(a2-1.0)+1.0;let D=a2/(PI*den*den);let G=(2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv)))*(2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl)));
 let F=mix(mix(vec3f(.04),base,m.base.w),vec3f(1),pow(1.0-vh,5.0));let diffuse=base*(1.0-F)*(1.0-m.base.w)/PI;let specular=F*D*G/(4.0*nv*nl);let q=.25+.5*m.base.w;let weight=1.0-m.optics.y;
 return BSDF((diffuse+specular)*weight,weight*((1.0-q)*nl/PI+q*D*nh/(4.0*vh)));
}
struct Scatter { wi:vec3f, weight:vec3f, pdf:f32, delta:bool, eta:f32, valid:bool }
fn scatter(h:Surface,base:vec3f,wo:vec3f)->Scatter {
 let m=materials[h.mat];
 if(rand()<m.optics.y){let eta=select(m.optics.z,1.0/m.optics.z,h.front);let c=clamp(dot(wo,h.gn),0.0,1.0);let s2=eta*eta*(1.0-c*c);var F=1.0;var ct=0.0;if(s2<1.0){ct=sqrt(1.0-s2);let rs=(eta*c-ct)/(eta*c+ct);let rp=(c-eta*ct)/(c+eta*ct);F=(rs*rs+rp*rp)*.5;}if(rand()<F){return Scatter(reflect(-wo,h.gn),vec3f(1),0,true,1,true);}return Scatter(unit(-wo*eta+h.gn*(eta*c-ct)),base*eta*eta,0,true,1.0/(eta*eta),true);}
 var wi=vec3f(0);if(rand()<.25+.5*m.base.w){let a=m.optics.x*m.optics.x;let u=rand();let z=sqrt((1.0-u)/(1.0+(a*a-1.0)*u));let r=sqrt(max(0.0,1.0-z*z));let phi=2.0*PI*rand();wi=reflect(-wo,local(h.n,vec3f(r*cos(phi),r*sin(phi),z)));}else{let r=sqrt(rand());let phi=2.0*PI*rand();wi=local(h.n,vec3f(r*cos(phi),r*sin(phi),sqrt(1.0-r*r)));}
 let b=bsdf(h,base,wo,wi);let valid=dot(wi,h.gn)>0.0&&b.pdf>1e-20;return Scatter(wi,b.f*max(0.0,dot(h.n,wi))/max(1e-20,b.pdf),b.pdf,false,1,valid);
}
struct LightSample { wi:vec3f, color:vec3f, pdf:f32, distance:f32, delta:bool, valid:bool }
fn sampleLight(h:Surface)->LightSample {
 let count=u32(p.options.y);let index=min(count-1u,u32(rand()*f32(count)));let l=lights[index];var wi=vec3f(0);var c=vec3f(0);var pdf=1.0/f32(count);var distance=1e30;var delta=false;
 if(l.position.w==0.0){wi=sampleEnvironment();let e=environment(wi);c=e.color;pdf*=e.pdf;}
 else if(l.position.w==1.0){let tri=triangles[u32(l.shape.z)];let r=sqrt(rand());let u=1.0-r;let v=rand()*r;let pos=tri.p.xyz+tri.e1.xyz*u+tri.e2.xyz*v;let d=pos-h.position;distance=length(d);wi=d/max(1e-20,distance);let n=unit(cross(tri.e1.xyz,tri.e2.xyz));let cosine=abs(dot(n,wi));pdf*=distance*distance/(tri.e2.w*max(1e-8,cosine));let m=materials[u32(tri.p.w)];c=m.emission.xyz*m.optics.w;}
 else if(l.position.w==3.0){let z=1.0-rand()*(1.0-cos(l.shape.x));let r=sqrt(max(0.0,1.0-z*z));let phi=2.0*PI*rand();wi=local(unit(l.direction.xyz),vec3f(r*cos(phi),r*sin(phi),z));c=l.energy.xyz*l.energy.w;delta=true;}
 else{let d=l.position.xyz-h.position;distance=length(d);wi=d/max(1e-20,distance);var factor=1.0;if(l.position.w==4.0){let q=dot(-wi,l.direction.xyz);factor=clamp((q-l.direction.w)/max(1e-6,l.shape.y-l.direction.w),0.0,1.0);factor=factor*factor*(3.0-2.0*factor);}c=l.energy.xyz*l.energy.w*factor/max(p.options.x*p.options.x,distance*distance);delta=true;}
 return LightSample(wi,c,pdf,distance,delta,dot(h.gn,wi)>0.0&&pdf>1e-20);
}
struct Ray { o:vec3f, d:vec3f }
fn cameraRay(pixel:vec2u,jitter:bool)->Ray {
 var j=vec2f(.5);if(jitter){j=vec2f(rand(),rand());}let xy=(vec2f(pixel)+j)/vec2f(p.dims.xy);let nx=(xy.x*2.0-1.0)*p.right.w;let ny=1.0-xy.y*2.0;var o=p.eye.xyz;var d=unit(p.forward.xyz+p.right.xyz*nx*p.up.w+p.up.xyz*ny*p.up.w);
 if(p.projection.x>0.0){o+=p.right.xyz*nx*p.projection.y*.5+p.up.xyz*ny*p.projection.y*.5;d=p.forward.xyz;}
 if(jitter&&p.eye.w>0.0){let focalPoint=o+d*p.forward.w/max(1e-6,dot(d,p.forward.xyz));let r=sqrt(rand())*p.eye.w;let a=rand()*2.0*PI;o+=p.right.xyz*r*cos(a)+p.up.xyz*r*sin(a);d=unit(focalPoint-o);}return Ray(o,d);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=p.tile.zw)){return;}let pixel=p.tile.xy+id.xy;if(any(pixel>=p.dims.xy)){return;}let index=pixel.y*p.dims.x+pixel.x;
 rng=((index+1u)*747796405u)^((p.dims.z+1u)*2891336453u);if(rng==0u){rng=1u;}
 let initial=cameraRay(pixel,true);var o=initial.o;var d=initial.d;var beta=vec3f(1);var radiance=vec3f(0);var previousPdf=0.0;var delta=true;var etaScale=1.0;var coverage=0.0;
 for(var bounce=0u;bounce<p.dims.w;bounce++){
  let hit=trace(o,d,1e30,false);if(hit.id<0){if(bounce>0u||p.options.z==0.0){let e=environment(d);var w=1.0;if(!delta){w=power(previousPdf,e.pdf/p.options.y);}radiance+=beta*e.color*w;}break;}
  let h=surface(hit,o,d);let m=materials[h.mat];let base=baseColor(h);let wo=-d;if(bounce==0u){coverage=1.0;}
  if(m.optics.w>0.0){let tri=triangles[u32(hit.id)];let gn=unit(cross(tri.e1.xyz,tri.e2.xyz));let pdf=hit.t*hit.t/(max(1e-8,abs(dot(gn,d)))*tri.e2.w*p.options.y);var w=1.0;if(!delta){w=power(previousPdf,pdf);}radiance+=beta*m.emission.xyz*m.optics.w*w;}
  let light=sampleLight(h);if(light.valid){let b=bsdf(h,base,wo,light.wi);let cosine=max(0.0,dot(h.n,light.wi));if(cosine>0.0&&b.pdf>0.0){let shadow=trace(h.position+h.gn*p.options.x*2.0,light.wi,light.distance-p.options.x*4.0,true);if(shadow.id<0){var w=1.0;if(!light.delta&&bounce+1u<p.dims.w){w=power(light.pdf,b.pdf);}radiance+=beta*b.f*light.color*(cosine*w/light.pdf);}}}
  if(bounce+1u>=p.dims.w){break;}
  let b=scatter(h,base,wo);if(!b.valid){break;}beta*=b.weight;etaScale*=b.eta;previousPdf=b.pdf;delta=b.delta;d=b.wi;o=h.position+h.gn*select(-2.0,2.0,dot(d,h.gn)>0.0)*p.options.x;
  if(bounce>=3u){let survival=clamp(max(beta.x,max(beta.y,beta.z))*etaScale,.05,.95);if(rand()>survival){break;}beta/=survival;}
 }
 if(p.options.w>0.0){let largest=max(radiance.x,max(radiance.y,radiance.z));if(largest>p.options.w){radiance*=p.options.w/largest;}}
 radiance=max(vec3f(0),radiance);if(any(radiance!=radiance)||any(radiance>vec3f(1e30))){radiance=vec3f(0);}
 if(p.dims.z==0u){film[index]=vec4f(0);normalDepth[index]=vec4f(0);albedoCoverage[index]=vec4f(0);let center=cameraRay(pixel,false);let hit=trace(center.o,center.d,1e30,false);if(hit.id>=0){let h=surface(hit,center.o,center.d);normalDepth[index]=vec4f(h.n,hit.t);albedoCoverage[index]=vec4f(baseColor(h),0);}}
 film[index]+=vec4f(radiance,1);albedoCoverage[index].w+=coverage;
}
`;

export const FINAL_DISPLAY_WGSL=/* wgsl */`
struct Display { dims:vec4f, options:vec4f }
@group(0) @binding(0) var<uniform> p:Display;
@group(0) @binding(1) var<storage,read> film:array<vec4f>;
@group(0) @binding(2) var<storage,read> normalDepth:array<vec4f>;
@group(0) @binding(3) var<storage,read> albedoCoverage:array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.0-1.0,y*2.0-1.0,0,1);}
fn average(i:u32)->vec3f {return film[i].xyz/max(1.0,film[i].w);}
fn srgb(v:vec3f)->vec3f {return select(v*12.92,1.055*pow(max(vec3f(0),v),vec3f(1.0/2.4))-.055,v>vec3f(.0031308));}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let xy=vec2i(pos.xy);let width=u32(p.dims.x);let index=u32(xy.y)*width+u32(xy.x);let feature=normalDepth[index];var c=average(index);
 if(p.options.x>0.0&&p.options.y==0.0&&feature.w>0.0){var sum=vec3f(0);var total=0.0;for(var y=-2;y<=2;y++){for(var x=-2;x<=2;x++){let q=xy+vec2i(x,y);if(any(q<vec2i(0))||any(q>=vec2i(p.dims.xy))){continue;}let j=u32(q.y)*width+u32(q.x);let f=normalDepth[j];if(f.w<=0.0||film[j].w==0.0){continue;}let dc=albedoCoverage[j].xyz-albedoCoverage[index].xyz;let w=exp(-f32(x*x+y*y)/8.0)*pow(max(0.0,dot(f.xyz,feature.xyz)),32.0)*exp(-abs(f.w-feature.w)/max(.0001,feature.w*.02))*exp(-dot(dc,dc)*16.0);sum+=average(j)*w;total+=w;}}c=sum/max(1e-20,total);}
 let alpha=select(1.0,albedoCoverage[index].w/max(1.0,film[index].w),p.options.w>0.0);
 if(p.options.y==1.0){c=srgb(albedoCoverage[index].xyz);}else if(p.options.y==2.0){c=select(vec3f(0),feature.xyz*.5+.5,feature.w>0.0);}else if(p.options.y==3.0){c=vec3f(select(0.0,exp(-feature.w/max(.001,p.options.z)),feature.w>0.0));}else if(p.options.y==4.0){c=vec3f(min(1.0,film[index].w/256.0));}
 else {if(p.options.w>0.0&&alpha>0.0){c/=alpha;}c*=exp2(p.dims.z);if(p.dims.w==0.0){c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),vec3f(0),vec3f(1));}else if(p.dims.w==1.0){c=c/(1.0+c);}c=srgb(clamp(c,vec3f(0),vec3f(1)));let checker=select(.16,.23,((xy.x/12+xy.y/12)%2)==0);c=mix(vec3f(checker),c,alpha);}
 return vec4f(clamp(c,vec3f(0),vec3f(1)),1);
}
`;
