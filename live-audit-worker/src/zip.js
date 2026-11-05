// ZIP with stored UTF-8 entries. Two small files need no compression dependency.
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++) c=c&1?0xedb88320^(c>>>1):c>>>1;
  return c>>>0;
});
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) crc=table[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function u16(view,offset,value){view.setUint16(offset,value,true)}
function u32(view,offset,value){view.setUint32(offset,value,true)}
export function zipEntries(entries) {
  const files=entries.map(([name,text])=>({name:encoder.encode(name),data:encoder.encode(text)}));
  const localLength=files.reduce((sum,file)=>sum+30+file.name.length+file.data.length,0);
  const centralLength=files.reduce((sum,file)=>sum+46+file.name.length,0);
  const out=new Uint8Array(localLength+centralLength+22),view=new DataView(out.buffer);
  let cursor=0,central=localLength;
  for(const file of files) {
    const offset=cursor,crc=crc32(file.data);
    u32(view,cursor,0x04034b50);u16(view,cursor+4,20);u16(view,cursor+6,0x0800);
    u16(view,cursor+8,0);u16(view,cursor+10,0);u16(view,cursor+12,0);
    u32(view,cursor+14,crc);u32(view,cursor+18,file.data.length);u32(view,cursor+22,file.data.length);
    u16(view,cursor+26,file.name.length);u16(view,cursor+28,0);
    cursor+=30;out.set(file.name,cursor);cursor+=file.name.length;out.set(file.data,cursor);cursor+=file.data.length;
    u32(view,central,0x02014b50);u16(view,central+4,20);u16(view,central+6,20);
    u16(view,central+8,0x0800);u16(view,central+10,0);u16(view,central+12,0);u16(view,central+14,0);
    u32(view,central+16,crc);u32(view,central+20,file.data.length);u32(view,central+24,file.data.length);
    u16(view,central+28,file.name.length);u16(view,central+30,0);u16(view,central+32,0);
    u16(view,central+34,0);u16(view,central+36,0);u32(view,central+38,0);u32(view,central+42,offset);
    central+=46;out.set(file.name,central);central+=file.name.length;
  }
  u32(view,central,0x06054b50);u16(view,central+4,0);u16(view,central+6,0);
  u16(view,central+8,files.length);u16(view,central+10,files.length);
  u32(view,central+12,centralLength);u32(view,central+16,localLength);u16(view,central+20,0);
  return out;
}

// Stream stored ZIP entries with data descriptors. Avoid duplicating large
// nightly JSON as UTF-8 buffers and a second whole-archive allocation.
export function* jsonTextChunks(value) {
  function* tokens(v){
    if(v===null||typeof v!=='object'){yield JSON.stringify(v)??'null';return;}
    if(Array.isArray(v)){yield '[';for(let i=0;i<v.length;i++){if(i)yield ',';yield* tokens(v[i]);}yield ']';return;}
    yield '{';let first=true;
    for(const [key,item] of Object.entries(v)){
      if(item===undefined||typeof item==='function'||typeof item==='symbol')continue;
      if(!first)yield ',';first=false;yield JSON.stringify(key);yield ':';yield* tokens(item);
    }
    yield '}';
  }
  let pending='';
  for(const token of tokens(value)){
    pending+=token;if(pending.length>=32768){yield pending;pending='';}
  }
  if(pending)yield pending;
}
export function zipEntriesStream(entries) {
  function* chunks(){
    const files=[];let offset=0;
    for(const [filename,content] of entries){
      const name=encoder.encode(filename),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0808);u16(v,26,name.length);header.set(name,30);
      const file={name,offset,size:0,crc:0xffffffff};offset+=header.length;yield header;
      for(const text of typeof content==='string'?[content]:content)for(let start=0;start<text.length;){
        let end=Math.min(text.length,start+32768);
        if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;
        const bytes=encoder.encode(text.slice(start,end));start=end;
        for(const byte of bytes)file.crc=table[(file.crc^byte)&255]^(file.crc>>>8);
        file.size+=bytes.length;offset+=bytes.length;yield bytes;
      }
      file.crc=(file.crc^0xffffffff)>>>0;
      const descriptor=new Uint8Array(16),d=new DataView(descriptor.buffer);
      u32(d,0,0x08074b50);u32(d,4,file.crc);u32(d,8,file.size);u32(d,12,file.size);
      offset+=descriptor.length;yield descriptor;files.push(file);
    }
    const centralStart=offset;
    for(const f of files){
      const header=new Uint8Array(46+f.name.length),v=new DataView(header.buffer);
      u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x0808);u32(v,16,f.crc);
      u32(v,20,f.size);u32(v,24,f.size);u16(v,28,f.name.length);u32(v,42,f.offset);header.set(f.name,46);
      offset+=header.length;yield header;
    }
    const end=new Uint8Array(22),v=new DataView(end.buffer);
    u32(v,0,0x06054b50);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,offset-centralStart);u32(v,16,centralStart);yield end;
  }
  const iterator=chunks();
  return new ReadableStream({pull(controller){const next=iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);},cancel(){iterator.return?.();}});
}
