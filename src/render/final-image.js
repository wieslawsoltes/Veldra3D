import {linear} from './final-scene.js';

export function decodeRGBE(bytes){
  let p=0;const line=()=>{let start=p;while(p<bytes.length&&bytes[p]!==10)p++;if(p>=bytes.length)throw Error('Truncated HDR header');return new TextDecoder().decode(bytes.subarray(start,p++)).trim();};
  if(!/^#\?(RADIANCE|RGBE)$/.test(line()))throw Error('Not a Radiance RGBE image');let format=false;
  for(let i=0;i<100;i++){const text=line();if(text==='FORMAT=32-bit_rle_rgbe')format=true;if(!text)break;}
  if(!format)throw Error('HDR must use FORMAT=32-bit_rle_rgbe');const match=line().match(/^([+-])Y (\d+) ([+-])X (\d+)$/);if(!match)throw Error('HDR orientation must use Y followed by X');const h=Number(match[2]),w=Number(match[4]);if(w<1||h<1||w*h>16777216)throw Error('HDR exceeds 16 megapixels');
  const pixels=new Float32Array(w*h*4),scan=new Uint8Array(w*4),read=()=>{if(p>=bytes.length)throw Error('Truncated HDR scanline');return bytes[p++];};
  for(let y=0;y<h;y++){
    if(w>=8&&w<=32767&&bytes[p]===2&&bytes[p+1]===2&&(bytes[p+2]&128)===0){read();read();if((read()<<8|read())!==w)throw Error('HDR scanline width mismatch');for(let c=0;c<4;c++){let x=0;while(x<w){const code=read();if(code===0)throw Error('Invalid HDR run');const count=code>128?code-128:code;if(x+count>w)throw Error('HDR run exceeds scanline');if(code>128){const v=read();for(let i=0;i<count;i++)scan[(x++)*4+c]=v;}else for(let i=0;i<count;i++)scan[(x++)*4+c]=read();}}}
    else for(let x=0;x<w;x++){for(let c=0;c<4;c++)scan[x*4+c]=read();if(scan[x*4]===1&&scan[x*4+1]===1&&scan[x*4+2]===1)throw Error('Legacy RGBE repeat encoding is not supported; resave as scanline RLE.');}
    for(let x=0;x<w;x++){const k=x*4,q=((match[1]==='-'?y:h-1-y)*w+(match[3]==='+'?x:w-1-x))*4,scale=scan[k+3]?2**(scan[k+3]-136):0;for(let c=0;c<3;c++)pixels[q+c]=scan[k+c]*scale;pixels[q+3]=1;}
  }return {width:w,height:h,pixels};
}
export function resizeRadiance(image,maxWidth=1024,maxHeight=512){
  const scale=Math.min(1,maxWidth/image.width,maxHeight/image.height);if(scale===1)return image;const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale)),pixels=new Float32Array(w*h*4);
  // Area averaging preserves small bright emitters instead of discarding them when resizing HDR maps.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=x*image.width/w,x1=(x+1)*image.width/w,y0=y*image.height/h,y1=(y+1)*image.height/h;let weight=0;const out=(y*w+x)*4;for(let j=Math.floor(y0);j<Math.ceil(y1);j++)for(let i=Math.floor(x0);i<Math.ceil(x1);i++){const a=(Math.min(i+1,x1)-Math.max(i,x0))*(Math.min(j+1,y1)-Math.max(j,y0));weight+=a;const k=(j*image.width+i)*4;for(let c=0;c<3;c++)pixels[out+c]+=image.pixels[k+c]*a;}for(let c=0;c<3;c++)pixels[out+c]/=weight;pixels[out+3]=1;}
  return {width:w,height:h,pixels};
}
export function loadRenderImages(entries,settings){return (async()=>{
  const sources=new Set([settings.environmentImage,...entries.map(e=>(e.object??e).material?.texture)].filter(Boolean)),images=new Map();
  for(const source of sources){if(!/^data:(image\/[^;,]+|application\/octet-stream);base64,/.test(source))throw Error('Render images must be embedded data URLs; remote image URLs are not fetched.');const raw=atob(source.slice(source.indexOf(',')+1)),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>32*1024*1024)throw Error('Render image exceeds 32 MiB');
    if(bytes[0]===35&&bytes[1]===63){images.set(source,resizeRadiance(decodeRGBE(bytes)));continue;}
    const bitmap=await createImageBitmap(new Blob([bytes]));try{if(bitmap.width*bitmap.height>33554432)throw Error('Texture exceeds 32 megapixels');const ratio=Math.min(1,1024/bitmap.width,(source===settings.environmentImage?512:1024)/bitmap.height),w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);const rgba=ctx.getImageData(0,0,w,h).data,pixels=new Float32Array(rgba.length);for(let i=0;i<rgba.length;i++)pixels[i]=i%4===3?rgba[i]/255:linear(rgba[i]/255);images.set(source,{width:w,height:h,pixels});}finally{bitmap.close();}
  }return images;
})();}
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
export function toneMapRGB(rgb,exposure=0,tone='aces'){return rgb.map(value=>{let x=Math.max(0,value*2**exposure);if(tone==='aces')x=(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14);else if(tone==='reinhard')x=x/(1+x);return Math.min(1,Math.max(0,srgb(Math.min(1,x))));});}
export function filmRGBA(frame,options={}){
  const {width,height,film,normal,albedo}=frame,rgba=new Uint8ClampedArray(width*height*4),pass=options.pass??'beauty';
  const mean=(k,c)=>film[k+c]/Math.max(1,film[k+3]);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=(y*width+x)*4,alpha=options.transparent?albedo[k+3]/Math.max(1,film[k+3]):1;let c=[mean(k,0),mean(k,1),mean(k,2)];
    if(options.denoise&&pass==='beauty'&&normal[k+3]>0){let sum=[0,0,0],weight=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const q=(yy*width+xx)*4;if(normal[q+3]<=0||film[q+3]===0)continue;let dot=0,dc=0;for(let a=0;a<3;a++){dot+=normal[q+a]*normal[k+a];dc+=(albedo[q+a]-albedo[k+a])**2;}const w=Math.exp(-(dx*dx+dy*dy)/8)*Math.max(0,dot)**32*Math.exp(-Math.abs(normal[q+3]-normal[k+3])/Math.max(.0001,normal[k+3]*.02))*Math.exp(-dc*16);for(let a=0;a<3;a++)sum[a]+=mean(q,a)*w;weight+=w;}if(weight>0)c=sum.map(v=>v/weight);}
    if(pass==='normal')c=normal[k+3]>0?[0,1,2].map(a=>normal[k+a]*.5+.5):[0,0,0];
    else if(pass==='albedo')c=[0,1,2].map(a=>srgb(Math.max(0,albedo[k+a])));
    else if(pass==='depth')c=Array(3).fill(normal[k+3]>0?Math.exp(-normal[k+3]/Math.max(.001,options.focusDistance??48)):0);
    else if(pass==='samples')c=Array(3).fill(Math.min(1,film[k+3]/256));
    else c=toneMapRGB(c.map(v=>options.transparent&&alpha>0?v/alpha:v),options.exposure??0,options.toneMap??'aces');
    for(let a=0;a<3;a++)rgba[k+a]=Math.round(Math.min(1,Math.max(0,c[a]))*255);rgba[k+3]=Math.round((pass==='beauty'?Math.min(1,alpha):1)*255);
  }return rgba;
}
/** Linear, uncompressed OpenEXR v2 scanlines: RGBA + albedo + normals + depth + sample-count. */
export function encodeEXR(frame,metadata={}){
  const {width,height,film,normal,albedo}=frame,enc=new TextEncoder(),text=s=>enc.encode(s+'\0'),join=parts=>{const a=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){a.set(p,o);o+=p.length;}return a;},ints=(...v)=>{const b=new Uint8Array(v.length*4),d=new DataView(b.buffer);v.forEach((n,i)=>d.setInt32(i*4,n,true));return b;},floats=(...v)=>{const b=new Uint8Array(v.length*4),d=new DataView(b.buffer);v.forEach((n,i)=>d.setFloat32(i*4,n,true));return b;},attr=(name,type,data)=>join([text(name),text(type),ints(data.length),data]);
  const channels=['A','B','G','R','Z','albedo.B','albedo.G','albedo.R','normal.X','normal.Y','normal.Z','samples'].sort(),mean=(k,c)=>film[k+c]/Math.max(1,film[k+3]);
  const header=join([ints(20000630,2),attr('channels','chlist',join([...channels.map(c=>join([text(c),ints(2),new Uint8Array(4),ints(1,1)])),new Uint8Array(1)])),attr('compression','compression',new Uint8Array([0])),attr('dataWindow','box2i',ints(0,0,width-1,height-1)),attr('displayWindow','box2i',ints(0,0,width-1,height-1)),attr('lineOrder','lineOrder',new Uint8Array([0])),attr('pixelAspectRatio','float',floats(1)),attr('screenWindowCenter','v2f',floats(0,0)),attr('screenWindowWidth','float',floats(1)),attr('chromaticities','chromaticities',floats(.64,.33,.30,.60,.15,.06,.3127,.329)),attr('comments','string',enc.encode('Veldra final render; scene-linear Rec.709/D65; premultiplied RGBA; unfiltered AOVs. '+JSON.stringify(metadata))),new Uint8Array(1)]);
  const rowSize=8+width*channels.length*4,table=new Uint8Array(height*8),view=new DataView(table.buffer),parts=[header,table];
  for(let y=0;y<height;y++){view.setBigUint64(y*8,BigInt(header.length+table.length+y*rowSize),true);const row=new Uint8Array(rowSize),d=new DataView(row.buffer);d.setInt32(0,y,true);d.setInt32(4,rowSize-8,true);let offset=8;
    for(const channel of channels)for(let x=0;x<width;x++){const k=(y*width+x)*4;let value=0;if(channel==='A')value=metadata.transparent?albedo[k+3]/Math.max(1,film[k+3]):1;else if(channel==='Z')value=normal[k+3];else if(channel==='samples')value=film[k+3];else if(channel.startsWith('albedo.'))value=albedo[k+({R:0,G:1,B:2}[channel.at(-1)])];else if(channel.startsWith('normal.'))value=normal[k+({X:0,Y:1,Z:2}[channel.at(-1)])];else value=mean(k,{R:0,G:1,B:2}[channel]);d.setFloat32(offset,Number.isFinite(value)?value:0,true);offset+=4;}parts.push(row);
  }return new Blob(parts,{type:'image/x-exr'});
}
export function encodeRGBE(frame){
  const {width,height,film}=frame,header=new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`),parts=[header];
  for(let y=0;y<height;y++){const row=new Uint8Array(width*4);for(let x=0;x<width;x++){const k=(y*width+x)*4,c=[0,1,2].map(a=>Math.max(0,film[k+a]/Math.max(1,film[k+3]))),largest=Math.max(...c);if(largest>1e-32){const e=Math.min(127,Math.floor(Math.log2(largest))+1),scale=256/2**e;for(let a=0;a<3;a++)row[x*4+a]=Math.min(255,Math.floor(c[a]*scale));row[x*4+3]=e+128;}}
    if(width>=8&&width<=32767){parts.push(new Uint8Array([2,2,width>>8,width&255]));for(let c=0;c<4;c++)for(let x=0;x<width;x+=128){const n=Math.min(128,width-x),chunk=new Uint8Array(n+1);chunk[0]=n;for(let i=0;i<n;i++)chunk[i+1]=row[(x+i)*4+c];parts.push(chunk);}}else parts.push(row);
  }return new Blob(parts,{type:'image/vnd.radiance'});
}
