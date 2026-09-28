import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const bundle=await build({entryPoints:['scripts/spooky-preview.tsx'],bundle:true,write:false,format:'esm',jsx:'automatic'});
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>Spooky Wheel — local test</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');return;}
  if(url.pathname==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
  try{const file=url.pathname==='/style.css'?'app/globals.css':path.join('public',path.basename(url.pathname)==='style.css'?'':url.pathname);
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.ttf')?'font/ttf':'application/octet-stream');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(4191,'127.0.0.1',()=>console.log('Local-only preview at http://127.0.0.1:4191'));
