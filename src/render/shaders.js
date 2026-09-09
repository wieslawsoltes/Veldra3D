export const RASTER_WGSL = /* wgsl */`
struct Globals { viewProj: mat4x4f, lightVP: mat4x4f, eye: vec4f, settings: vec4f, clip: vec4f };
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
struct Vertex { @location(0) position:vec3f, @location(1) normal:vec3f, @location(2) color:vec4f, @location(3) material:vec2f };
struct Fragment { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec4f, @location(3) material:vec2f, @location(4) light:vec4f };
@vertex fn vs(v:Vertex)->Fragment { var o:Fragment; o.position=g.viewProj*vec4f(v.position,1); o.world=v.position; o.normal=v.normal; o.color=v.color; o.material=v.material; o.light=g.lightVP*vec4f(v.position,1); return o; }
@vertex fn shadowVS(v:Vertex)->@builtin(position) vec4f { return g.lightVP*vec4f(v.position,1); }
fn aces(x:vec3f)->vec3f { return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),vec3f(0),vec3f(1)); }
fn shadow(p:vec4f,n:vec3f)->f32 { let s=p.xyz/p.w; let uv=vec2f(s.x*.5+.5,.5-s.y*.5); if(any(uv<vec2f(0))||any(uv>vec2f(1))||s.z<0||s.z>1){return 1;} var sum=0.0; let bias=max(.0007,.002*(1-dot(n,normalize(vec3f(-.4,-.6,1))))); for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){sum+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/2048.0,s.z-bias);}} return sum/9.0; }
@fragment fn fs(f:Fragment,@builtin(front_facing) front:bool)->@location(0) vec4f {
 if(g.settings.w>.5 && dot(g.clip.xyz,f.world)+g.clip.w<0){discard;}
 var n=normalize(f.normal); if(!front){n=-n;} let v=normalize(g.eye.xyz-f.world); let l=normalize(vec3f(-.45,-.6,1)); let h=normalize(l+v);
 let ndl=max(dot(n,l),0.0); let ndv=max(dot(n,v),.001); let ndh=max(dot(n,h),0.0); let vdh=max(dot(v,h),0.0);
 let rough=max(f.material.x,.08); let metal=f.material.y; let alpha=rough*rough; let a2=alpha*alpha;
 let denom=ndh*ndh*(a2-1)+1; let D=a2/(3.14159265*denom*denom); let k=(rough+1)*(rough+1)/8;
 let G=(ndl/(ndl*(1-k)+k))*(ndv/(ndv*(1-k)+k)); let F0=mix(vec3f(.04),f.color.rgb,metal); let F=F0+(1-F0)*pow(1-vdh,5);
 let spec=D*G*F/max(4*ndl*ndv,.001); let diff=(1-F)*(1-metal)*f.color.rgb/3.14159265;
 let visibility=shadow(f.light,n); let hemi=.48+.23*n.z;
 var color=f.color.rgb*hemi + (diff+spec)*ndl*visibility*2.3 + f.color.rgb*.13*max(dot(n,normalize(vec3f(.7,.5,.3))),0.0);
 if(g.settings.x>1.5 && g.settings.x<2.5){color=f.color.rgb*(.24+.25*max(n.z,0))+(diff+spec)*ndl*visibility*3.7;}
 if(g.settings.x>2.5 && g.settings.x<3.5){let r=reflect(-v,n);let stripe=smoothstep(-.08,.08,sin((r.x+r.y*.4+r.z*.6)*34));color=mix(vec3f(.05,.06,.07),vec3f(.96),stripe);}
 if(g.settings.x>3.5 && g.settings.x<4.5){return vec4f(n*.5+.5,1);}
 color=pow(aces(color*g.settings.y),vec3f(1.0/2.2));return vec4f(color,f.color.a);
}
struct LineVertex { @location(0) position:vec3f, @location(1) color:vec4f };
struct LineFragment { @builtin(position) position:vec4f, @location(0) color:vec4f, @location(1) world:vec3f };
@vertex fn lineVS(v:LineVertex)->LineFragment{var o:LineFragment;o.position=g.viewProj*vec4f(v.position,1);o.position.z-=.0000004*o.position.w;o.color=v.color;o.world=v.position;return o;}
@fragment fn lineFS(v:LineFragment)->@location(0) vec4f{if(g.settings.w>.5&&dot(g.clip.xyz,v.world)+g.clip.w<0){discard;}return v.color;}
@fragment fn gridFS(f:Fragment)->@location(0) vec4f {
 let scale=1.0;let p=f.world.xy/scale;let delta=max(fwidth(p),vec2f(.00001));let grid=abs(fract(p-.5)-.5)/delta;let fine=1-min(min(grid.x,grid.y),1.0);
 let q=p/5.0;let grid2=abs(fract(q-.5)-.5)/max(fwidth(q),vec2f(.00001));let major=1-min(min(grid2.x,grid2.y),1.0);
 let distanceFade=1-smoothstep(25.0,95.0,distance(g.eye.xyz,f.world));
 var base=vec3f(.918,.931,.938);let shade=shadow(f.light,vec3f(0,0,1));base*=.80+.20*shade;
 var color=mix(base,vec3f(.76,.79,.81),max(fine*.42,major*.75)*distanceFade);
 let axes=abs(f.world.xy)/max(fwidth(f.world.xy),vec2f(.00001));if(axes.y<1){color=mix(color,vec3f(.70,.36,.36),.6*(1-axes.y));}if(axes.x<1){color=mix(color,vec3f(.34,.57,.44),.6*(1-axes.x));}
 return vec4f(color,1);
}
`;
/** Generic rational tensor-product evaluator. Four-float homogeneous control points.
 * Fixed upper bound: degree 7, 64 control points per direction. Float32 display-only.
 */
export const SURFACE_COMPUTE_WGSL = /* wgsl */`
struct Params {nu:u32,nv:u32,pu:u32,pv:u32,su:u32,sv:u32,ku:u32,kv:u32};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> cp:array<vec4f>;
@group(0) @binding(2) var<storage,read> knots:array<f32>;
@group(0) @binding(3) var<storage,read_write> result:array<vec4f>;
fn span(count:u32,degree:u32,t:f32,offset:u32)->u32{if(t>=knots[offset+count]){return count-1u;}var k=degree;loop{if(k+1u>=count||t<knots[offset+k+1u]){break;}k++;}return k;}
fn basis(k:u32,degree:u32,t:f32,offset:u32)->array<f32,8>{var N:array<f32,8>;var L:array<f32,8>;var R:array<f32,8>;N[0]=1;for(var j=1u;j<=degree;j++){L[j]=t-knots[offset+k+1u-j];R[j]=knots[offset+k+j]-t;var saved=0.0;for(var r=0u;r<j;r++){let den=R[r+1u]+L[j-r];var temp=0.0;if(abs(den)>1e-15){temp=N[r]/den;}N[r]=saved+R[r+1u]*temp;saved=L[j-r]*temp;}N[j]=saved;}return N;}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let index=id.x;let total=(p.su+1u)*(p.sv+1u);if(index>=total){return;}let u0=f32(index%(p.su+1u))/f32(p.su);let v0=f32(index/(p.su+1u))/f32(p.sv);let u=mix(knots[p.pu],knots[p.nu],u0);let v=mix(knots[p.ku+p.pv],knots[p.ku+p.nv],v0);let iu=span(p.nu,p.pu,u,0u);let iv=span(p.nv,p.pv,v,p.ku);let U=basis(iu,p.pu,u,0u);let W=basis(iv,p.pv,v,p.ku);var sum=vec4f(0);for(var j=0u;j<=p.pv;j++){for(var i=0u;i<=p.pu;i++){sum+=cp[(iv-p.pv+j)*p.nu+iu-p.pu+i]*(U[i]*W[j]);}}result[index]=vec4f(sum.xyz/sum.w,1);}
`;
export const GL_VERTEX=`#version 300 es
precision highp float;layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in vec4 color;layout(location=3) in vec2 material;uniform mat4 viewProj;out vec3 vNormal;out vec3 vWorld;out vec4 vColor;out vec2 vMat;void main(){gl_Position=viewProj*vec4(position,1);gl_Position.z=gl_Position.z*2.-gl_Position.w;vNormal=normal;vWorld=position;vColor=color;vMat=material;}`;
export const GL_FRAGMENT=`#version 300 es
precision highp float;in vec3 vNormal;in vec3 vWorld;in vec4 vColor;in vec2 vMat;uniform vec3 eye;uniform float mode;uniform vec4 clipPlane;uniform bool clipOn;out vec4 frag;void main(){if(clipOn&&dot(clipPlane.xyz,vWorld)+clipPlane.w<0.)discard;vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 v=normalize(eye-vWorld);float lambert=max(dot(n,normalize(vec3(-.45,-.6,1.))),0.);vec3 c=vColor.rgb*(.5+.24*n.z+.65*lambert);vec3 h=normalize(normalize(vec3(-.45,-.6,1.))+v);c+=pow(max(dot(n,h),0.),mix(128.,12.,vMat.x))*.22;if(mode>2.5&&mode<3.5){vec3 r=reflect(-v,n);c=mix(vec3(.05),vec3(.96),smoothstep(-.08,.08,sin((r.x+r.y*.4+r.z*.6)*34.)));}if(mode>3.5)c=n*.5+.5;c=pow(clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.),vec3(1./2.2));frag=vec4(c,vColor.a);}`;
export const GL_LINE_VERTEX=`#version 300 es
precision highp float;layout(location=0) in vec3 position;layout(location=1) in vec4 color;uniform mat4 viewProj;out vec4 vColor;out vec3 world;void main(){gl_Position=viewProj*vec4(position,1);gl_Position.z=gl_Position.z*2.-gl_Position.w-.0000008*gl_Position.w;vColor=color;world=position;}`;
export const GL_LINE_FRAGMENT=`#version 300 es
precision highp float;in vec4 vColor;in vec3 world;uniform vec4 clipPlane;uniform bool clipOn;out vec4 frag;void main(){if(clipOn&&dot(clipPlane.xyz,world)+clipPlane.w<0.)discard;frag=vColor;}`;
