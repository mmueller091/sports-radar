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
