// Compare the personal worker with a small independent enumeration of engine operations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.self = global;
global.importScripts = (...files) => files.forEach(file => vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, '../web/shared', file), 'utf8'), {filename:file}));
importScripts('personal_wash_worker.js');

const raw = {seed:12345, born_talent_rc:7, zizhi:153, role_id:10044, salt:278440,
    role_level:100, sex:1, vip:2, role_stats:{}, global_vars:{}, talents:[], tal_lucky:100000};
function input(initialState, targetIds, compatibleGroups, budget, maxZi) {
    return {initialState,targetIds,compatibleGroups,options:{maxTotalPills:budget,maxZi}};
}
async function run(job) {
    const messages = [];
    global.postMessage = message => messages.push(message);
    await self.onmessage({data:{type:'search',input:job,requestId:1}});
    assert.ok(!messages.some(m => m.type === 'error'), JSON.stringify(messages.at(-1)));
    return messages.find(m => m.type === 'result').result;
}
// Use a FIFO worklist with repeated cost relaxation. For exchange try every
// lock/position pair, without the production graph's deduplication by position.
function enumerate(initial, budget, maxZi) {
    const engine = new AutoWash2Engine.Engine(TALENT_DATA,initial);
    const queue = [], visited = new Map();
    function visit(state,cost) {
        const key = JSON.stringify(state);
        if (cost > budget || (visited.get(key) ?? Infinity) <= cost) return;
        visited.set(key,cost);
        queue.push({state,cost});
    }
    visit(engine.initialState(initial),0);
    for (let i=0;i<queue.length;i++) {
        const {state,cost} = queue[i];
        if (state.zizhi < maxZi) visit({...state,zizhi:state.zizhi+1},cost);
        for (let mask=0;mask<2**state.talents.length;mask++) {
            const positions = state.talents.map((_,index)=>index).filter(index=>(1<<index)&mask);
            if (positions.length < engine.slotCountFor(state.zizhi)) {
                const result = engine.wash(state,positions);
                visit(result.state,cost + result.cost);
            }
            const ids = positions.map(index=>state.talents[index]);
            for (const index of engine.replaceablePositions(state,ids))
                visit(engine.replace(state,index,ids).state,cost);
        }
    }
    return queue;
}
function report(route) {
    return '路线 1：' + route.totalPills + ' 丹\n' +
        route.steps.map((s,i)=>(i+1)+'. '+s.label+'：'+s.detail).join('\n');
}
async function checkDepthWorker() {
    let clock = 0;
    const messages = [];
    const context = vm.createContext({console,TextEncoder,TextDecoder,performance,atob,setTimeout,clearTimeout,
        Date:class extends Date { static now() { return clock += 3600000; } },
        postMessage:message=>messages.push(message)});
    context.self = context;
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(
        fs.readFileSync(path.join(__dirname,'../web/shared',file),'utf8'),context,{filename:file}));
    context.importScripts('personal_wash_depth_worker.js');
    for (const zizhi of [153,154]) {
        const start = {...raw,zizhi};
        const engine = new AutoWash2Engine.Engine(TALENT_DATA,start);
        const once = engine.wash(engine.initialState(start),[]);
        const purple = once.state.talents.find(id=>engine.quality(id)===4);
        assert.ok(purple);
        for (const depthLevel of [1,2,3]) {
            for (const cap of [once.cost-1,once.cost]) {
                messages.length = 0;
                const job = input(start,[purple],[],cap,zizhi);
                Object.assign(job.options,{searchPolicy:'depth',depthLevel});
                await context.onmessage({data:{type:'search',requestId:1,input:job}});
                assert.ok(!messages.some(m=>m.type==='error'),JSON.stringify(messages.at(-1)));
                assert.ok(messages.some(m=>m.progress?.message.includes('1/'+(2*depthLevel+1))));
                assert.ok(messages.some(m=>m.progress?.message.includes('战术搜索')));
                const route = messages.at(-1).result.routes[0];
                if (cap < once.cost) assert.equal(route,undefined);
                else assert.ok(route?.verified && route.totalPills===once.cost && route.totalWashes===1);
            }
        }
    }
}
async function main() {
    await checkDepthWorker();
    let checks = 0;
    const engine = new AutoWash2Engine.Engine(TALENT_DATA,raw);
    const carrier = engine.purpleIds.find(id=>!engine.isShenmai(id) &&
        [...engine.allowed].some(low=>engine.quality(low)<4 && engine.talentType(low)===engine.talentType(id)));
    const low = [...engine.allowed].find(id=>engine.quality(id)<4 && engine.talentType(id)===engine.talentType(carrier));
    const pair = [low,carrier].map(id=>({id,locked:false}));
    for (const initial of [raw,{...raw,seed:19,zizhi:150},{...raw,seed:722,talents:pair}]) {
        for (const maxZi of [initial.zizhi,154]) {
            const budget = initial.talents.length ? 5 : 6;
            const rows = enumerate(initial,budget,maxZi);
            const blues = [...new Set(rows.flatMap(r=>r.state.talents))].filter(id=>engine.quality(id)===4);
            const sets = blues.slice(0,4).map(id=>[[id],[]]);
            sets.push([[271],[]], [[],[[271,272]]]);
            if (blues.length>1) sets.push([[blues[0]],[[blues[1],271].filter(id=>id!==blues[0])]]);
            for (const [required,groups] of sets) {
                const matches = rows.filter(({state:s})=>required.every(id=>s.talents.includes(id))
                    && groups.every(group=>group.some(id=>s.talents.includes(id))));
                const minimum = Math.min(...matches.map(r=>r.cost));
                for (const cap of new Set([budget,Math.max(0,Math.min(budget,minimum-1))])) {
                    const job = input(initial,required,groups,cap,maxZi);
                    const result = await run(job);
                    assert.equal(result.proof,minimum<=cap ? 'optimal' : 'infeasible');
                    if (minimum<=cap) {
                        const route = result.routes[0];
                        assert.equal(route.totalPills,minimum);
                        assert.ok(route.verified && route.verifiedOptimal);
                        const imported = PersonalWashSearch.reference(PersonalWashSearch.context(job),report(route));
                        assert.equal(imported.totalPills,minimum);
                    }
                    checks++;
                }
            }
        }
    }
    // A compatible non-goal purple can be exchanged twice with no paid wash.
    let chained = false;
    for (let seed=1;seed<=300 && !chained;seed++) {
        const start={...raw,seed,zizhi:154,talents:[248,249,250].map(id=>({id}))};
        const states=enumerate(start,0,154);
        const original=start.talents.map(t=>t.id);
        const goal=states.find(({state})=>state.talents.filter(id=>!original.includes(id)).length>=2);
        if (!goal) continue;
        const result=await run(input(start,goal.state.talents,[],0,154));
        assert.equal(result.routes[0].totalPills,0);
        assert.ok(result.routes[0].exchangeCount>=2);
        chained=true;
    }
    assert.ok(chained);
    console.log('PASS',checks,'budget / goal comparisons and a zero-cost exchange chain');

    // Optional local replay: SAVE CHARACTER ROUTE... . No private fixture is bundled.
    const [savePath,roleName,...files] = process.argv.slice(2);
    if (!savePath) return;
    const save = JSON.parse(fs.readFileSync(savePath,'utf8'));
    const role = [save.MainRole,...Object.values(save.Roles)].find(r=>r?.Name===roleName);
    const start = AutoWash2Model.snapshot(save,role);
    for (const file of files) {
        const text = fs.readFileSync(file,'utf8');
        const ctx = PersonalWashSearch.context(input(start,[],[],20000,154));
        const route = PersonalWashSearch.reference(ctx,text);
        const ids = route.finalTalents.map(t=>t.id);
        const withTargets = PersonalWashSearch.context(input(start,ids,[],route.totalPills,154));
        const verified = PersonalWashSearch.reference(withTargets,text);
        assert.ok(verified.verified);
        assert.equal(PersonalWashSearch.reference(withTargets,report(verified)).totalPills,verified.totalPills);
        console.log(roleName,verified.totalPills,verified.totalWashes,verified.finalTalents.map(t=>t.name).join('、'));
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
