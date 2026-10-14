import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const slugs = [
  'candidate-fincaraiz-193916988','candidate-fincaraiz-192658136',
  'candidate-fincaraiz-194158672','candidate-fincaraiz-194188459',
  'candidate-fincaraiz-193811264','candidate-fincaraiz-194104380',
  'candidate-fincaraiz-194115640','candidate-fincaraiz-194096982',
  'candidate-fincaraiz-193522702',
];
const owner = 'a4da05ae-347e-4250-8ae0-83812ccc7703';
const source = readFileSync(new URL('../publish-fincaraiz-external-photos.mjs',import.meta.url),'utf8')
  .replace("import { createClient } from '@supabase/supabase-js';", '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction('createClient', 'process', 'console', 'fetch', 'AbortSignal', source);

function fixture(options = {}) {
  const rows = slugs.map((slug,i) => ({
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-' + i.toString(16).padStart(12,'0'),
    slug, landlord_id:owner, status:'inactive', listing_workflow_status:'draft',
    moderation_status:'pending', verified:false, available_from:'2026-10-14',
    price_monthly:i===0 && options.invalidPreflight ? 0 : 2100000+i*100000,
    currency:'COP', metadata:{inventory_kind:'external_candidate',allowed_action:'view_original_listing'},
    source_url:'https://www.fincaraiz.com.co/apartment/'+slug.split('-').at(-1), images:[],
  }));
  const images = rows.flatMap(row=>Array.from({length:4},(_,sort_order)=>({
    listing_id:row.id,sort_order,mime_type:'image/webp',
    storage_path:'partner-assets/source-review/fincaraiz/'+row.id+'/photo-'+sort_order+'.webp',
  })));
  // Supabase returns detached response objects: updating a DB row never mutates
  // the originally loaded preflight snapshot held by the publication script.
  const persisted = new Map(rows.map(row => [row.id, {...row, metadata:{...row.metadata},images:[...row.images]}]));
  const state = { rows, images, uploads:0, updates:0, rollbacks:0, log:[], errors:[], exitCode:0 };
  const db = {
    storage: {
      getBucket: async()=>({data:{public:true},error:null}),
      from:(bucket)=>{
        if (bucket==='partner-assets') return {
          download:async()=>({data:new Blob([Buffer.alloc(1300)]),error:null}),
        };
        return {
          getPublicUrl:(path)=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/listing-photos/'+path}}),
          list:async()=>({data:[],error:null}),
          upload:async()=>{state.uploads++;return {error:null}},
        };
      },
    },
    from:(table)=>{
      if(table==='rental_listing_images'){
        const chain={select:()=>chain,in:()=>chain,then:(done)=>Promise.resolve({data:images,error:null}).then(done)};
        return chain;
      }
      if(table!=='apartments') throw Error('Unexpected table '+table);
      let selection=''; let update=null; let id=null;
      const chain = {
        select:(columns)=>{selection=columns;return chain},
        in:()=>chain,
        eq:(column,value)=>{if(column==='id')id=value;return chain},
        update:(value)=>{update=value;return chain},
        then:(done)=>{
          if(update){
            const row=persisted.get(id);
            const isRollback=!update.metadata?.external_discovery_publication;
            if(isRollback) {
              state.rollbacks++;
              if (!options.emptyRollback) persisted.set(id,{...row,...update});
              return Promise.resolve({
                data:options.emptyRollback?[]:[{id:row.id}],error:null,
              }).then(done);
            }
            state.updates++;
            if(options.failSecondUpdate && state.updates===2)
              return Promise.resolve({data:null,error:new Error('simulated DB failure')}).then(done);
            const updated={...row,...update};
            persisted.set(id,updated);
            return Promise.resolve({data:[updated],error:null}).then(done);
          }
          if(selection.startsWith('slug,images,status')) {
            const result=[...persisted.values()].map(r=>({...r}));
            if(options.badFinalReadback)result[0].price_monthly=0;
            return Promise.resolve({data:result,error:null}).then(done);
          }
          return Promise.resolve({data:rows,error:null}).then(done);
        },
      };
      return chain;
    },
  };
  return {db,state};
}
async function simulate(options={}) {
  const {db,state}=fixture(options);
  const fakeProcess={
    argv:['node','script','--apply'],
    env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key'},
    exitCode:0,
    exit(code){throw new Error('Unexpected exit '+code)},
  };
  const consoleMock={
    log:(...args)=>state.log.push(args.join(' ')),
    error:(...args)=>state.errors.push(args.join(' ')),
  };
  const fetchMock=async()=>({ok:true,headers:{get:()=> 'image/webp'}});
  const timeoutShim={timeout:()=>new AbortController().signal};
  return {state,process:fakeProcess,run:()=>execute(()=>db,fakeProcess,consoleMock,fetchMock,timeoutShim)};
}

test('publication preflight rejects a zero monthly price before writing any files',async()=>{
  const f=await simulate({invalidPreflight:true});
  await assert.rejects(f.run(),/Refusing changed external candidate/);
  assert.equal(f.state.uploads,0);
  assert.equal(f.state.updates,0);
});

test('publication final readback rejects an invalid price and rolls back updated records',async()=>{
  const f=await simulate({badFinalReadback:true});
  await f.run();
  assert.equal(f.process.exitCode,1);
  assert.equal(f.state.updates,9);
  assert.equal(f.state.rollbacks,9);
  assert.ok(f.state.errors.some(msg=>msg.includes('PUBLICATION_INTERRUPTED')));
});

test('rollback reports ROLLBACK_FAILED if zero records are returned without an SQL error',async()=>{
  const f=await simulate({failSecondUpdate:true,emptyRollback:true});
  await f.run();
  assert.equal(f.process.exitCode,1);
  assert.equal(f.state.updates,2);
  assert.equal(f.state.rollbacks,1);
  assert.ok(f.state.errors.some(msg=>msg.includes('ROLLBACK_FAILED for '+slugs[0])));
});

test('valid batch reaches success with nine checked COP prices',async()=>{
  const f=await simulate();
  await f.run();
  assert.equal(f.process.exitCode,0);
  assert.equal(f.state.updates,9);
  assert.equal(f.state.uploads,36);
  assert.ok(f.state.log.some(msg=>msg.includes('SUCCESS: 9 externally discoverable')));
});
