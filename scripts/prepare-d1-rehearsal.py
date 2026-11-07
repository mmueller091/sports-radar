"""Derive an importable rehearsal copy; never alter the original D1 export."""
import argparse,json,pathlib,re,sqlite3

def quote(value):
    if value is None:return 'NULL'
    if isinstance(value,str):
        if '\0' in value:raise ValueError('NUL text requires a separate verified encoding')
        return "'"+value.replace("'","''")+"'"
    if isinstance(value,int):return str(value)
    raise ValueError('Unexpected value type in oversized payload row')

def prepare(backup,restored,output):
    backup=pathlib.Path(backup).resolve();restored=pathlib.Path(restored).resolve();output=pathlib.Path(output).resolve()
    if output in (backup,restored) or output.exists():raise ValueError('Refusing to overwrite existing data')
    db=sqlite3.connect(restored.as_uri()+'?mode=ro',uri=True)
    names=['sports_feed','sports_feed_parts','sports_resources'];tables={};counts={};guard=sqlite3.connect(':memory:')
    for name in names:
        schema=db.execute('SELECT sql FROM sqlite_master WHERE name=?',(name,)).fetchone()[0]
        guard.execute(schema)
        columns=[x[1] for x in db.execute('PRAGMA table_info("'+name+'")')]
        if 'payload' not in columns:raise ValueError('Missing expected payload column')
        # Exercise the actual constraints (including sports_feed's CHECK(id=1)).
        # Refuse the transformation if an empty payload violates any of them.
        for row in db.execute('SELECT rowid,* FROM "'+name+'" ORDER BY rowid'):
            values=list(row);values[columns.index('payload')+1]=''
            guard.execute('INSERT INTO "'+name+'" (rowid,'+','.join('"'+c+'"' for c in columns)+') VALUES('+','.join('?' for _ in values)+')',values)
        tables[name]=(columns,iter(db.execute('SELECT rowid,* FROM "'+name+'" ORDER BY rowid')));counts[name]=0
    oversized=0;max_bytes=0;statements=0
    with backup.open('rb') as source,output.open('xb') as dest:
        for line in source:
            match=re.match(rb'INSERT INTO "(sports_feed|sports_feed_parts|sports_resources)" ',line)
            row=None
            if match:
                name=match.group(1).decode();columns,rows=tables[name];row=next(rows);counts[name]+=1
            if len(line)<=90000:
                dest.write(line);max_bytes=max(max_bytes,len(line));continue
            if row is None:raise ValueError('Unexpected oversized export statement')
            payload_index=columns.index('payload')+1;payload=row[payload_index]
            if not isinstance(payload,str):raise ValueError('Expected text payload')
            values=list(row);values[payload_index]=''
            insert='INSERT INTO "'+name+'" (rowid,'+','.join('"'+c+'"' for c in columns)+') VALUES('+','.join(quote(v) for v in values)+');\n'
            chunks=[insert]+['UPDATE "'+name+'" SET payload=payload||'+quote(payload[start:start+12000])+' WHERE rowid='+str(row[0])+';\n' for start in range(0,len(payload),12000)]
            for statement in chunks:
                encoded=statement.encode('utf8')
                if len(encoded)>=90000:raise ValueError('Derived statement exceeds bounded import limit')
                dest.write(encoded);max_bytes=max(max_bytes,len(encoded));statements+=1
            oversized+=1
    for columns,rows in tables.values():
        if next(rows,None) is not None:raise ValueError('Export/restore row count disagreement')
    db.close();guard.close()
    return {'sourceUnchanged':str(backup),'derived':str(output),'convertedPayloadRows':oversized,'payloadTableRows':counts,'derivedPayloadStatements':statements,'maxLineBytes':max_bytes,'bytes':output.stat().st_size}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backup');p.add_argument('restored');p.add_argument('output');a=p.parse_args();print(json.dumps(prepare(a.backup,a.restored,a.output)))
