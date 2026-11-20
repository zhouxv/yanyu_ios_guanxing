/* Optional: replay historical routes with the shipped WASM, without opening or changing a save. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','web'); const C=require(path.join(root,'hengshan','sequence_core.js'));
global.window=globalThis;
for(const n of ['hengshan_engine_b64','hengshan_talent_data','hengshan_shop_data','hengshan_offline_boot','algorithm_wasm_bridge','wasm_algorithm_api'])vm.runInThisContext(fs.readFileSync(path.join(root,'shared',n+'.js'),'utf8'),{filename:n+'.js'});
async function main(){
 const base=process.argv[2],limit=Number(process.argv[3]||20);if(!base||!(limit>0))throw Error('用法：node dev/replay_hengshan_routes.cjs <成功结果目录> [条数]');
 const all=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(base,e.name,'路线.json')).filter(p=>fs.existsSync(p)).sort();
 if(!all.length)throw Error('没有找到旧助手路线');await WasmAlgorithmAPI.ready;const c=C.context(HengshanStudentEngine,HENGSHAN_TALENT_DATA);let washes=0,days=0;
 const count=Math.min(limit,all.length);for(let i=0;i<count;i++){const old=JSON.parse(fs.readFileSync(all[Math.floor(i*all.length/count)],'utf8').replace(/^\uFEFF/,''));
 const moves=old.rawRoute.map(a=>a.type==='day'?-1:a.slot),result=c.replay(old.initial,moves,old.targets,old.final);
 assert.equal(C.stable(result.steps),C.stable(old.steps));assert.equal(result.washes,old.washes);assert.equal(result.days,old.days);assert.deepEqual(result.finalTalents,old.finalTalents);washes+=result.washes;days+=result.days;}
 console.log(`已复验 ${count} 条旧路线，逐日推进 ${days} 次，洗练 ${washes} 次，最终状态与原记录全部一致。`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});