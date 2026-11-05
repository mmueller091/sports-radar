import test from 'node:test';
import assert from 'node:assert/strict';
import {zipEntriesStream,jsonTextChunks} from '../src/zip.js';
test('streamed ZIP central directory, descriptors, UTF-8 and CRC roundtrip',async()=>{
  const entries=[['summary.md','Audit \u2014 no fabricated timestamps'],['findings.json',JSON.stringify({text:'x'.repeat(32766)+'\ud83c\udfc6'+'z'.repeat(40000)})]];
  const buffer=new Uint8Array(await new Response(zipEntriesStream(entries)).arrayBuffer()),v=new DataView(buffer.buffer);
  const end=buffer.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);
  let central=v.getUint32(end+16,true);
  const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return (crc^0xffffffff)>>>0;};
  for(const [name,text] of entries){
    assert.equal(v.getUint32(central,true),0x02014b50);const size=v.getUint32(central+24,true),nameLength=v.getUint16(central+28,true),offset=v.getUint32(central+42,true);
    assert.equal(new TextDecoder().decode(buffer.slice(central+46,central+46+nameLength)),name);
    assert.equal(v.getUint32(offset,true),0x04034b50);assert.equal(v.getUint16(offset+6,true),0x808);
    const start=offset+30+v.getUint16(offset+26,true),data=buffer.slice(start,start+size);
    assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(data),text);assert.equal(crc32(data),v.getUint32(central+16,true));
    assert.equal(v.getUint32(start+size,true),0x08074b50);assert.equal(v.getUint32(start+size+4,true),crc32(data));
    central+=46+nameLength;
  }
});
test('chunked JSON preserves ordinary JSON semantics and supports streamed ZIP entry',async()=>{
  const value={text:'\ud83c\udfc6'.repeat(40000),nul:null,missing:undefined,items:[1,undefined,NaN,{x:true}],literal:'\\\"\n'};
  const chunks=[...jsonTextChunks(value)];assert.equal(chunks.join(''),JSON.stringify(value));
  const zip=new Uint8Array(await new Response(zipEntriesStream([['findings.json',jsonTextChunks(value)]])).arrayBuffer());
  const v=new DataView(zip.buffer),central=v.getUint32(zip.length-6,true),size=v.getUint32(central+24,true),nameLength=v.getUint16(26,true);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(zip.slice(30+nameLength,30+nameLength+size))),JSON.parse(JSON.stringify(value)));
});
