import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT??8080);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.wgsl':'text/plain'};
http.createServer((req,res)=>{let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}let filename=path.resolve(root,'.'+relative);if(filename!==root&&!filename.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');fs.readFile(filename,(error,body)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(filename)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);});}).listen(port,'0.0.0.0',()=>console.log(`Veldra 3D: http://localhost:${port}`));
