// Small DOM host for the actual slate renderer. Child nodes, attributes and
// identity are modeled so tests can distinguish a text patch from replacement.
const voidTags = new Set(['IMG','INPUT','BR','HR','META','LINK','SOURCE','WBR']);
const decode = value => String(value).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const encode = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const dataName = key => 'data-'+String(key).replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());

function element(name='DIV',text=null) {
  const attributes = new Map(),listeners = new Map();
  const node = {
    nodeType:text === null ? 1 : 3,nodeName:text === null ? name.toUpperCase() : '#text',
    nodeValue:text,childNodes:[],parentElement:null,
    setAttribute:(name,value)=>attributes.set(name,String(value)),
    getAttribute:name=>attributes.get(name) ?? null,
    removeAttribute:name=>attributes.delete(name),hasAttribute:name=>attributes.has(name),
    contains(other){return other === node || node.childNodes.some(child=>child.contains(other));},
    addEventListener(name,listener){const entries=listeners.get(name)||[];entries.push(listener);listeners.set(name,entries);},
    dispatch(name,event={}){for(const listener of listeners.get(name)||[])listener({target:node,...event});},
    querySelector(selector){return node.querySelectorAll(selector)[0] || null;},
    querySelectorAll(selector){
      const direct=selector.startsWith(':scope > '),query=direct?selector.slice(9):selector;
      const descendants=direct?node.children:node.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
      return descendants.filter(child=>child.matches(query));
    },
    matches(selector){
      if(selector === '*')return node.nodeType === 1;
      if(selector.startsWith('.'))return node.classList.contains(selector.slice(1));
      if(selector.startsWith('[')) {
        const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
        return Boolean(match && node.hasAttribute(match[1]) && (match[2] === undefined || node.getAttribute(match[1]) === match[2]));
      }
      return node.nodeName === selector.toUpperCase();
    },
    closest(selector){return node.matches(selector)?node:node.parentElement?.closest(selector) || null;},
    insertBefore(child,before){
      if(child === before)return child;
      child.remove();const index=before?node.childNodes.indexOf(before):node.childNodes.length;
      if(index < 0)throw Error('Missing insertion point');
      node.childNodes.splice(index,0,child);child.parentElement=node;return child;
    },
    remove(){if(node.parentElement){const siblings=node.parentElement.childNodes;siblings.splice(siblings.indexOf(node),1);node.parentElement=null;}},
    cloneNode(deep=false){const copy=element(node.nodeName,node.nodeValue);for(const [key,value] of attributes)copy.setAttribute(key,value);if(deep)for(const child of node.childNodes)copy.insertBefore(child.cloneNode(true),null);return copy;},
    focus(){node._focused=true;},
    style:{setProperty(){},getPropertyValue(){return '';}}
  };
  const values=()=>String(node.className).split(/\s+/).filter(Boolean);
  node.classList=new Proxy({
    contains:value=>values().includes(value),
    add(...names){node.className=[...new Set([...values(),...names])].join(' ');},
    remove(...names){node.className=values().filter(value=>!names.includes(value)).join(' ');},
    toggle(value,force){const add=force ?? !node.classList.contains(value);node.classList[add?'add':'remove'](value);return add;},
    [Symbol.iterator]:function*(){yield* values();}
  },{get(target,key){return /^\d+$/.test(String(key))?values()[Number(key)]:target[key];}});
  node.dataset=new Proxy({}, {get:(_,key)=>node.getAttribute(dataName(key)) ?? undefined,set:(_,key,value)=>{node.setAttribute(dataName(key),value);return true;}});
  Object.defineProperties(node,{
    attributes:{get:()=>[...attributes].map(([name,value])=>({name,value}))},
    className:{get:()=>attributes.get('class')||'',set:value=>attributes.set('class',String(value))},
    children:{get:()=>node.childNodes.filter(child=>child.nodeType===1)},
    lastElementChild:{get:()=>node.children.at(-1)||null},
    lastChild:{get:()=>node.childNodes.at(-1)||null},
    previousElementSibling:{get:()=>node.parentElement?.children[node.parentElement.children.indexOf(node)-1]||null},
    textContent:{get:()=>node.nodeType===3?node.nodeValue:node.childNodes.map(child=>child.textContent).join(''),set:value=>{
      node.childNodes=[];if(node.nodeType===3)node.nodeValue=String(value);else if(String(value))node.insertBefore(element('',String(value)),null);
    }},
    innerHTML:{get:()=>node.childNodes.map(child=>child.outerHTML).join(''),set:value=>{
      for(const child of node.childNodes)child.parentElement=null;
      node.childNodes=[];for(const child of parse(String(value)))node.insertBefore(child,null);
    }},
    outerHTML:{get:()=>node.nodeType===3?encode(node.nodeValue):`<${node.nodeName.toLowerCase()}${[...attributes].map(([name,value])=>` ${name}="${encode(value)}"`).join('')}>${voidTags.has(node.nodeName)?'':node.innerHTML+`</${node.nodeName.toLowerCase()}>`}`}
  });
  return node;
}

function parse(html) {
  const root=element(),stack=[root];
  for(const token of html.match(/<!--[\s\S]*?-->|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)||[]) {
    if(token.startsWith('<!--'))continue;
    if(token.startsWith('</')){stack.pop();continue;}
    if(!token.startsWith('<')){stack.at(-1).insertBefore(element('',decode(token)),null);continue;}
    const name=token.match(/^<([\w:-]+)/)[1],node=element(name);
    for(const attr of token.slice(name.length+1,-1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(attr[1],decode(attr[2]??attr[3]??attr[4]??''));
    stack.at(-1).insertBefore(node,null);
    if(!voidTags.has(node.nodeName)&&!token.endsWith('/>'))stack.push(node);
  }
  return [...root.childNodes];
}

export function slateNode(html='') {return html?parse(html)[0]:element();}

export function slateTemplate(tag) {
  if(tag !== 'template')return element(tag);
  const template={content:element()};
  Object.defineProperty(template,'innerHTML',{set:value=>{template.content.innerHTML=value;}});
  return template;
}
