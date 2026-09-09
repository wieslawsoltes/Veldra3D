import {V} from '../core/math.js';
/** CPU reference rasterizer. Used only when the browser exposes no graphics API.
 * Triangle depth buffering, vertex-lit smooth shading, clipping, and depth-tested
 * line rendering are real; this deliberately does not emulate GPU performance.
 */
export class SoftwareRenderer {
  constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});if(!this.context)throw Error('Canvas rendering is unavailable');this.light=V.unit([-.45,-.65,1]);}
  render(renderer,views){
    const {canvas,context}=this,W=canvas.width,H=canvas.height;
    if(!this.image||this.image.width!==W||this.image.height!==H){this.image=context.createImageData(W,H);this.depth=new Float32Array(W*H);this.packed=new Uint32Array(this.image.data.buffer);}
    this.depth.fill(Infinity);this.packed.fill(0xfff1efec);
    const pixels=this.image.data,depth=this.depth,vertices=renderer.vertices,indices=renderer.indices,ratio=renderer.ratio;
    for(const view of views){
      const x0=Math.max(0,Math.floor(view.x*ratio)),y0=Math.max(0,Math.floor(view.y*ratio)),vw=Math.floor(view.width*ratio),vh=Math.floor(view.height*ratio),x1=Math.min(W-1,x0+vw-1),y1=Math.min(H-1,y0+vh-1),mat=view.camera.matrix(view.width/view.height),eye=view.camera.eye;
      const project=(x,y,z)=>{const w=mat[3]*x+mat[7]*y+mat[11]*z+mat[15];if(w<=0)return null;return [x0+(1+(mat[0]*x+mat[4]*y+mat[8]*z+mat[12])/w)*vw*.5,y0+(1-(mat[1]*x+mat[5]*y+mat[9]*z+mat[13])/w)*vh*.5,(mat[2]*x+mat[6]*y+mat[10]*z+mat[14])/w];};
      const clipped=(x,y,z)=>renderer.clipOn&&(renderer.clip[0]*x+renderer.clip[1]*y+renderer.clip[2]*z+renderer.clip[3]<0);
      let projected=new Array(vertices.length/12);
      if(renderer.mode!==1){
        for(let i=0;i<projected.length;i++){let o=i*12,x=vertices[o],y=vertices[o+1],z=vertices[o+2],p=project(x,y,z);if(!p){projected[i]=null;continue;}
          let nx=vertices[o+3],ny=vertices[o+4],nz=vertices[o+5],dot=nx*(eye[0]-x)+ny*(eye[1]-y)+nz*(eye[2]-z);if(dot<0){nx=-nx;ny=-ny;nz=-nz;}
          let diffuse=Math.max(0,nx*this.light[0]+ny*this.light[1]+nz*this.light[2]),shade=.48+.52*diffuse+.05*Math.max(0,nz),r=vertices[o+6],g=vertices[o+7],b=vertices[o+8];
          if(renderer.mode===3){let band=Math.sin((nx*.7+ny*.4+nz)*35)>0?.94:.12;r=g=b=band;shade=1;}
          if(renderer.mode===4){r=nx*.5+.5;g=ny*.5+.5;b=nz*.5+.5;shade=1;}
          p.push(Math.min(255,r*shade*255),Math.min(255,g*shade*255),Math.min(255,b*shade*255),clipped(x,y,z)?1:0,x,y,z);projected[i]=p;
        }
        for(let t=0;t<indices.length;t+=3){let a=projected[indices[t]],b=projected[indices[t+1]],c=projected[indices[t+2]];if(!a||!b||!c||a[6]&&b[6]&&c[6])continue;
          if(a[2]<0||b[2]<0||c[2]<0||Math.min(a[2],b[2],c[2])>1)continue;
          let minX=Math.max(x0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(x1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(y0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(y1,Math.ceil(Math.max(a[1],b[1],c[1])));
          let den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;let inv=1/den,dxA=(b[1]-c[1])*inv,dxB=(c[1]-a[1])*inv,dyA=(c[0]-b[0])*inv,dyB=(a[0]-c[0])*inv;
          let wa=((b[1]-c[1])*(minX+.5-c[0])+(c[0]-b[0])*(minY+.5-c[1]))*inv,wb=((c[1]-a[1])*(minX+.5-c[0])+(a[0]-c[0])*(minY+.5-c[1]))*inv;
          for(let y=minY;y<=maxY;y++,wa+=dyA,wb+=dyB){let u=wa,v=wb,offset=y*W+minX;for(let x=minX;x<=maxX;x++,offset++,u+=dxA,v+=dxB){let w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;let z=u*a[2]+v*b[2]+w*c[2];if(z>=depth[offset])continue;if(renderer.clipOn&&clipped(u*a[7]+v*b[7]+w*c[7],u*a[8]+v*b[8]+w*c[8],u*a[9]+v*b[9]+w*c[9]))continue;depth[offset]=z;let p=offset*4;pixels[p]=u*a[3]+v*b[3]+w*c[3];pixels[p+1]=u*a[4]+v*b[4]+w*c[4];pixels[p+2]=u*a[5]+v*b[5]+w*c[5];}}
        }renderer.stats.drawCalls++;
      }
      const line=(ax,ay,az,bx,by,bz,r,g,b,alpha=1)=>{if(clipped(ax,ay,az)&&clipped(bx,by,bz))return;let a=project(ax,ay,az),c=project(bx,by,bz);if(!a||!c||a[2]<0||c[2]<0)return;let dx=c[0]-a[0],dy=c[1]-a[1],dz=c[2]-a[2],start=0,end=1;
        for(let [p,q] of [[-dx,a[0]-x0],[dx,x1-a[0]],[-dy,a[1]-y0],[dy,y1-a[1]]]){if(p===0){if(q<0)return;}else{let t=q/p;if(p<0)start=Math.max(start,t);else end=Math.min(end,t);if(start>end)return;}}
        let count=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*(end-start));for(let i=0;i<=count;i++){let t=start+(end-start)*i/Math.max(1,count),x=Math.round(a[0]+dx*t),y=Math.round(a[1]+dy*t);if(x<x0||x>x1||y<y0||y>y1)continue;let offset=y*W+x,z=a[2]+dz*t;if(z>depth[offset]+.0000004)continue;let p=offset*4;pixels[p]=pixels[p]*(1-alpha)+r*255*alpha;pixels[p+1]=pixels[p+1]*(1-alpha)+g*255*alpha;pixels[p+2]=pixels[p+2]*(1-alpha)+b*255*alpha;}
      };
      if(renderer.grid){for(let i=-60;i<=60;i++){let c=i%5===0?[.76,.80,.81]:[.85,.87,.88],alpha=i%5===0?.65:.45;line(-60,i,-.035,60,i,-.035,...(i===0?[.65,.39,.39]:c),alpha);line(i,-60,-.035,i,60,-.035,...(i===0?[.38,.59,.46]:c),alpha);}renderer.stats.drawCalls++;}
      const lines=data=>{for(let i=0;i<data.length;i+=14)line(data[i],data[i+1],data[i+2],data[i+7],data[i+8],data[i+9],data[i+3],data[i+4],data[i+5],data[i+6]);if(data.length)renderer.stats.drawCalls++;};
      if(renderer.showEdges||renderer.mode===1)lines(renderer.edges);lines(renderer.curves);
    }
    context.putImageData(this.image,0,0);
  }
}
