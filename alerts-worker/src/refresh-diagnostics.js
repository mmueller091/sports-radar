// Refresh-only telemetry. No SQL, bindings, payloads, credentials or extra D1
// operations are logged. Durations are summed operation latency, not wall time
// when calls overlap; stages remain the wall-time measurement.
export function errorDetail(error) {
  return {name:String(error?.name || 'Error'),message:String(error?.message || error).slice(0,500)};
}

export function measuredDatabase(DB,budget,metrics,phase) {
  const originals=new WeakMap();
  metrics.d1={calls:0,statements:0,elapsedMs:0,failures:0,byPhase:{}};
  const measure=async (count,fn)=>{
    const name=phase(),start=budget.elapsed();
    const item=metrics.d1.byPhase[name] ||= {calls:0,statements:0,elapsedMs:0,failures:0};
    for(const target of [metrics.d1,item]){target.calls++;target.statements+=count;}
    try {return await fn();}
    catch(error){
      for(const target of [metrics.d1,item])target.failures++;
      metrics.d1.firstError ||= {stage:name,elapsedMs:budget.elapsed(),...errorDetail(error)};
      throw error;
    }
    finally {for(const target of [metrics.d1,item])target.elapsedMs+=budget.elapsed()-start;}
  };
  const wrap=statement=>{
    const proxy=new Proxy(statement,{get(target,key){
      if(key==='bind')return (...args)=>wrap(target.bind(...args));
      if(['first','all','run','raw'].includes(key))return (...args)=>measure(1,()=>target[key](...args));
      return Reflect.get(target,key);
    }});
    originals.set(proxy,statement);return proxy;
  };
  return new Proxy(DB,{get(target,key){
    if(key==='prepare')return sql=>wrap(target.prepare(sql));
    if(key==='batch')return statements=>measure(statements.length,()=>target.batch(statements.map(s=>originals.get(s)||s)));
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
