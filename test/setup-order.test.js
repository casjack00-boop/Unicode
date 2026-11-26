const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('fresh installer guards populated databases and includes every schema migration once',()=>{
 const s=fs.readFileSync(path.join(root,'db/setup.sql'),'utf8');const order=[...s.matchAll(/^\\ir (\S+)$/gm)].map(m=>m[1]);
 assert.match(s,/ON_ERROR_STOP on/);assert.match(s,/empty public schema/);assert.deepEqual(order,['schema.sql','messaging.sql','message-replies.sql','isbn.sql','discovery.sql','seller-tools.sql','transactions.sql','notifications.sql','safety.sql','academic.sql','reputation.sql','personalisation.sql','meetups.sql','support.sql','integration.sql']);
 assert.deepEqual([...order].sort(),fs.readdirSync(path.join(root,'db')).filter(f=>f.endsWith('.sql')&&!['setup.sql','seed.sql'].includes(f)).sort());
});
test('roommate upgrade preserves legacy date and fresh schema uses canonical name',()=>{const schema=fs.readFileSync(path.join(root,'db/schema.sql'),'utf8'),migration=fs.readFileSync(path.join(root,'db/integration.sql'),'utf8');assert.match(schema,/move_in\s+DATE/);assert.doesNotMatch(schema,/movie_in\s+DATE/);assert.match(migration,/RENAME COLUMN movie_in TO move_in/);assert.match(migration,/SET move_in=movie_in WHERE move_in IS NULL/);});
