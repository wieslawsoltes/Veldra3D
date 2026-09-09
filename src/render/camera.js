import {M,V,clamp} from '../core/math.js';
export class Camera{
  constructor(type='Perspective'){this.type=type;this.target=[0,0,3];this.radius=48;this.yaw=-1.03;this.pitch=.49;this.scale=32;this.fov=Math.PI/4;}
  get eye(){if(this.type==='Top')return V.add(this.target,[0,0,this.radius]);if(this.type==='Front')return V.add(this.target,[0,-this.radius,0]);if(this.type==='Right')return V.add(this.target,[this.radius,0,0]);return V.add(this.target,[this.radius*Math.cos(this.pitch)*Math.cos(this.yaw),this.radius*Math.cos(this.pitch)*Math.sin(this.yaw),this.radius*Math.sin(this.pitch)]);}
  matrix(aspect=1){let eye=this.eye,up=this.type==='Top'?[0,1,0]:[0,0,1],view=M.lookAt(eye,this.target,up),near=Math.max(.005,this.radius*.0001),far=Math.max(1000,this.radius*20),projection=this.type==='Perspective'?M.perspective(this.fov,aspect,near,far):M.ortho(-this.scale*aspect/2,this.scale*aspect/2,-this.scale/2,this.scale/2,near,far);return M.mul(projection,view);}
  orbit(dx,dy){if(this.type!=='Perspective')return;this.yaw-=dx*.008;this.pitch=clamp(this.pitch+dy*.006,-1.48,1.48);}
  pan(dx,dy,height){let eye=this.eye,z=V.unit(V.sub(eye,this.target)),right=V.unit(V.cross(this.type==='Top'?[0,1,0]:[0,0,1],z)),up=V.cross(z,right),units=(this.type==='Perspective'?2*this.radius*Math.tan(this.fov/2):this.scale)/Math.max(1,height);this.target=V.add(this.target,V.add(V.mul(right,-dx*units),V.mul(up,dy*units)));}
  zoom(delta){let factor=Math.exp(clamp(delta,-500,500)*.0012);this.radius=clamp(this.radius*factor,.1,1e7);this.scale=clamp(this.scale*factor,.01,1e7);}
  fit(box,aspect=1){this.target=[...box.center];let r=V.length(box.size)/2;this.radius=Math.max(2,r/Math.sin(this.fov/2)*1.15/Math.min(1,aspect));this.scale=Math.max(2,Math.max(box.size[2],box.size[1],box.size[0]/aspect)*1.25);}
  project(point,width,height){let p=M.point(this.matrix(width/height),point);return [(p[0]+1)*width/2,(1-p[1])*height/2,p[2]];}
  ray(x,y,width,height){let inv=M.inverse(this.matrix(width/height)),nx=x/width*2-1,ny=1-y/height*2,a=M.point(inv,[nx,ny,0]),b=M.point(inv,[nx,ny,1]);return {origin:a,direction:V.unit(V.sub(b,a))};}
  planePoint(x,y,width,height){let r=this.ray(x,y,width,height),normal=this.type==='Front'?[0,1,0]:this.type==='Right'?[1,0,0]:[0,0,1],den=V.dot(normal,r.direction);if(Math.abs(den)<1e-9)return null;let t=-V.dot(normal,r.origin)/den;if(t<0)return null;return V.add(r.origin,V.mul(r.direction,t));}
}
