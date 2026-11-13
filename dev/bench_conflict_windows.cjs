/* Local benchmark. Only the selected role is passed to the offline search.
 * node dev/bench_conflict_windows.cjs MODE SAVE ROLE BUDGET SECONDS TARGET...
 * Modes: windows, personal, fair, quick, worker, original. Slash-separated names form a compatible group.
 * Personal/fair/quick finish the strategy phase by depth; SECONDS is unused.
 * Add --out=FILE to export the independently generated candidate.
 * "original" loads upstream v3.0.5 scripts for a like-for-like comparison.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {isMainThread, Worker, parentPort} = require('node:worker_threads');
const [mode, saveFile, name, cap, seconds, ...args] = process.argv.slice(2);
const targets = args.filter(t => !t.startsWith('--out='));
const output = args.find(t=>t.startsWith('--out='))?.slice(6);
const root = path.resolve(__dirname, '..');
global.self = global;
global.importScripts = (...files) => files.forEach(file => {
    const relative = 'web/shared/' + file;
    const source = mode === 'original'
        ? execFileSync('git', ['show', '0a28d69:' + relative], {cwd: root, encoding: 'utf8', maxBuffer: 16000000})
        : fs.readFileSync(path.join(root, relative), 'utf8');
    vm.runInThisContext(source, {filename: relative});
});
if (!isMainThread) {
    global.postMessage = event => parentPort.postMessage(event);
    importScripts('personal_wash_worker.js');
    parentPort.on('message',data=>self.onmessage({data}));
    return;
}
if (!['windows', 'personal', 'fair', 'quick', 'worker', 'original'].includes(mode) || !targets.length)
    throw Error('Expected MODE SAVE ROLE BUDGET SECONDS TARGET...');
importScripts('auto_wash2_worker.js');
const save = JSON.parse(fs.readFileSync(saveFile));
const role = [save.MainRole, ...Object.values(save.Roles)].find(r => r?.Name === name);
const id = name => {
    const item = Object.entries(TALENT_DATA).find(([, talent]) => talent.name === name);
    if (!item) throw Error('Unknown talent ' + name);
    return Number(item[0]);
};
const initialState = AutoWash2Model.snapshot(save, role);
const selection = new Map();
let group = 0;
for (const target of targets) {
    if (target.includes('/')) {
        for (const option of target.split('/')) selection.set(id(option), group);
        group++;
    } else selection.set(id(target), -1);
}
const bagPills = Object.values(save.Items).filter(i=>i.ID===2601).reduce((n,i)=>n+Number(i.Num),0);
const input = {initialState, bagPills, hasBagPills:true, ...AutoWash2Model.targets(initialState, selection, TALENT_DATA),
    options: {maxTotalPills: Number(cap)}};
const started = Date.now();
let best;
function collect(result) {
    for (const route of result.routes) {
        if (!route.verified || route.totalPills > Number(cap)) throw Error('Invalid candidate');
        if (!best || best.totalPills > route.totalPills) best = route;
    }
}
async function main() {
    if (mode === 'personal') {
        Object.assign(input.options,{depthLevel:2,maxZi:154,strategyFirst:true});
        const worker = new Worker(__filename);
        try {
            await new Promise((resolve,reject)=>{
                worker.on('error',reject);
                worker.on('message',message=>{
                    if (message.type === 'error') reject(Error(message.error));
                    if (message.result) collect(message.result);
                    if (message.phase === 'exact' || message.type === 'result') resolve();
                });
                worker.postMessage({type:'search',input,requestId:1});
            });
        } finally { await worker.terminate(); }
    } else if (mode === 'fair' || mode === 'quick') {
        input.options.depthLevel = 2;
        input.options.maxZi = 154;
        const scans = AutoWashConflictWindows.iterate(input, AutoWash2Model.combinations(input),
            Infinity, collect, () => {}, true, mode === 'quick');
        for (const _ of scans) { /* drain all five layers */ }
    } else if (mode === 'windows') {
        AutoWashConflictWindows.search(input, AutoWash2Model.combinations(input),
            started + Number(seconds) * 1000, collect, () => {});
    } else {
        global.postMessage = event => {
            if (event.type === 'error') throw Error(event.error);
            if (event.result) collect(event.result);
        };
        await self.onmessage({data: {type: 'search', input, searchTimeMs: Number(seconds) * 1000}});
    }
    console.log(JSON.stringify({mode, name, pills: best?.totalPills ?? null, washes: best?.totalWashes,
        final: best?.finalTalents.map(t => t.name), seconds: Math.round((Date.now()-started)/1000)}));
    if (best && output) {
        const steps = best.steps.map((s,n)=>(n+1)+'. '+s.label+'：'+s.detail+
            '（累计 '+s.cumulativePills+' 丹，剩余 '+(bagPills-s.cumulativePills)+' 丹）');
        fs.writeFileSync(output,['路线 1：'+best.totalPills+' 丹',...steps].join('\n')+'\n',{flag:'wx'});
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
