// Minimal DOM host for the real slate renderer. Preserve node identity and
// insertBefore/remove semantics so refresh tests can assert actual reuse.
export function slateNode(html='') {
  const classes=new Set(),attributes=new Map();
  let markup='',body='';
  const node={dataset:{},children:[],parentElement:null,style:{setProperty(){}},
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle:(name,force)=>{if(force ?? !classes.has(name))classes.add(name);else classes.delete(name);}},
    setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name),
    hasAttribute:name=>attributes.has(name),contains:()=>false,querySelector:selector=>node.children.find(item=>selector.startsWith('.')&&item.classList.contains(selector.slice(1)))||null,
    querySelectorAll:selector=>selector === ':scope > .game-card' ? node.children.filter(item=>item.classList.contains('game-card')) : [],
    insertBefore(child,before) {
      child.remove();const index=before?node.children.indexOf(before):node.children.length;
      node.children.splice(index,0,child);child.parentElement=node;return child;
    },
    remove(){if(node.parentElement){const siblings=node.parentElement.children;siblings.splice(siblings.indexOf(node),1);node.parentElement=null;}}
  };
  Object.defineProperties(node,{
    className:{get:()=>[...classes].join(' '),set:value=>{classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));}},
    innerHTML:{get:()=>markup?body:node.children.map(item=>item.outerHTML).join(''),set:value=>{
      body=String(value);node.children=[];
      if(!markup)for(const match of body.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>|<div class="(?:game-date-divider|slate-skeleton)"[\s\S]*?<\/div>/g))node.insertBefore(slateNode(match[0]),null);
    }},
    outerHTML:{get:()=>markup?markup.slice(0,markup.indexOf('>')+1)+node.innerHTML+markup.slice(markup.lastIndexOf('</')):node.innerHTML},
    lastElementChild:{get:()=>node.children.at(-1)}
  });
  if(html){
    markup=html;body=html.slice(html.indexOf('>')+1,html.lastIndexOf('</'));
    node.className=html.match(/^<[^>]+class="([^"]*)"/)?.[1]||'';
    for(const match of html.slice(0,html.indexOf('>')).matchAll(/data-([a-z-]+)="([^"]*)"/g))node.dataset[match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=match[2];
  }
  return node;
}

export function slateTemplate(tag) {
  if(tag !== 'template')throw Error('Unsupported test element: '+tag);
  const template={content:{children:[]}};
  Object.defineProperty(template,'innerHTML',{set:value=>{
    template.content.children=[...String(value).matchAll(/<article\b[^>]*>[\s\S]*?<\/article>|<div class="game-date-divider"[\s\S]*?<\/div>/g)].map(match=>slateNode(match[0]));
  }});
  return template;
}
