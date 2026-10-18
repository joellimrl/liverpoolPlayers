import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html=new URL('../index.html',import.meta.url);
const server=createServer(async(req,res)=>{
  if(!['/','/index.html','/liverpool/','/liverpool/index.html'].includes(req.url.split('?')[0])){res.writeHead(404);res.end('Not found');return;}
  try{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(html));}catch{res.writeHead(503);res.end('Run npm run build first.');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
