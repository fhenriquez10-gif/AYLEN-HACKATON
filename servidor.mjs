import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,extname} from 'node:path';
const base=fileURLToPath(new URL('.',import.meta.url));
createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1'),part=decodeURIComponent(url.pathname),file=resolve(base,'.'+(part==='/'?'/index.html':part));
 if(relative(base,file).startsWith('..'))return res.writeHead(403).end();
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json'};
 const bytes=await readFile(file);res.writeHead(200,{'Content-Type':(types[extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404).end('Archivo no encontrado');}
}).listen(Number(process.argv[2]||4180),'127.0.0.1',()=>console.log('http://127.0.0.1:'+(process.argv[2]||4180)));
