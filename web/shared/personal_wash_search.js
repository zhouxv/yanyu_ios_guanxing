(function (root) {
    'use strict';
    const keyOf = state => root.AutoWash2Engine.stateKey(state);
    const actions = () => root.AutoWash2Optimizer.routeActions;
    function context(input) {
        const raw = input.initialState;
        const engine = new root.AutoWash2Engine.Engine(root.TALENT_DATA, raw);
        return {...input, engine, startState:engine.initialState(raw)};
    }
    function goal(ctx, state) {
        if (!ctx.targetIds.every(id => state.talents.includes(id))) return null;
        const ids = ctx.targetIds.slice();
        for (const group of ctx.compatibleGroups || []) {
            const id = group.find(value => state.talents.includes(value));
            if (id == null) return null;
            ids.push(id);
        }
        return [...new Set(ids)];
    }
    // Required talents and mutually disjoint unsatisfied groups each need a
    // different slot. This is a lower bound even for overlapping external inputs.
    function fitsSlots(ctx) {
        const used = new Set(ctx.targetIds);
        let needed = used.size;
        for (const group of ctx.compatibleGroups || []) {
            if (group.some(id => used.has(id))) continue;
            needed++;
            for (const id of group) used.add(id);
        }
        return needed <= ctx.engine.slotCountFor(ctx.options.maxZi);
    }
    function apply(ctx, state, move) {
        const {engine} = ctx;
        if (move.type === 'open') {
            if (state.zizhi >= ctx.options.maxZi) throw Error('路线需要开槽，超出所选范围');
            const next = {...root.AutoWash2Engine.cloneState(state), zizhi:state.zizhi + 1};
            return {state:next, action:{kind:'openSlot', mode:'open-next', keepIds:[],
                cost:0, draws:0, generatedBars:0, after:next}};
        }
        if (move.type === 'exchange') {
            return actions().actionReplace(engine, state, move.pos, 'window-exchange', move.keep);
        }
        if (move.keep.length >= engine.slotCountFor(state.zizhi)) throw Error('没有可洗的空槽');
        return actions().actionWash(engine, state, move.keep, 'personal-wash');
    }
    function* moves(ctx, state, remaining = Infinity) {
        if (state.zizhi < ctx.options.maxZi) yield {type:'open'};
        const talents = state.talents, slots = ctx.engine.slotCountFor(state.zizhi);
        const basePrice = ctx.engine.at(state.zizhi).eat;
        // For a fixed position, locks decide legality only. Once legal, replace()
        // draws from exactly the same state, independent of the enabling subset.
        const exchanged = new Set();
        for (let mask = 0; mask < 2 ** talents.length; mask++) {
            const keep = talents.filter((_, i) => mask & (1 << i));
            if (keep.length < slots && basePrice + Math.max(0,2*keep.length-1) <= remaining)
                yield {type:'wash', keep};
            for (const pos of ctx.engine.replaceablePositions(state, keep)) {
                if (exchanged.has(pos)) continue;
                exchanged.add(pos);
                yield {type:'exchange', pos, keep};
            }
        }
    }
    function route(ctx, moves, kind) {
        let state = ctx.startState, cost = 0, trace = null;
        for (const move of moves) {
            const next = apply(ctx, state, move);
            state = next.state;
            cost += next.action.cost;
            trace = actions().traceAppend(trace, next.action);
        }
        const targetIds = goal(ctx, state);
        if (!targetIds || cost > ctx.options.maxTotalPills) throw Error('回放未达目标或丹耗超过预算');
        return {...actions().routeFromNode({...ctx, targetIds}, {state,cost,trace,serial:0}), kind};
    }
    // Accept action text only. The selected snapshot supplies every seed,
    // price, lock position and target. Never trust totals stated in a file.
    function reference(ctx, text) {
        const md = text.includes('## 照着操作');
        const rows = md ? text.split('## 照着操作')[1].split(/^最终槽位[：:]/m)[0]
            : text.split(/^路线\s+\d+[：:]/m)[1] || text;
        let state = ctx.startState, keep = [], cost = 0;
        const path = [];
        const names = value => [...value.matchAll(/「([^」]+)」/g)].flatMap(m => m[1].split('、'));
        const ids = labels => labels.map(label => {
            const id = state.talents.find(id => ctx.engine.name(id) === label.trim());
            if (id == null) throw Error('当前槽位没有「' + label + '」');
            return id;
        });
        function advance(move) {
            const next = apply(ctx,state,move);
            state = next.state;
            cost += next.action.cost;
            if (cost > ctx.options.maxTotalPills) throw Error('参考路线超出丹预算');
            path.push(move);
        }
        for (const line of rows.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
            if (/^(?:\d+[.、]\s*)?\d槽起手/.test(line)) {
                if (Number(line.match(/(\d)槽起手/)[1]) !== ctx.engine.slotCountFor(state.zizhi)) throw Error('起始槽数不一致');
                continue;
            }
            if (line.includes('当前锁定') || line.includes('当前未锁定')) { keep = ids(names(line)); continue; }
            const wash = line.match(/(?:连续洗脉|洗)\s*(\d+)\s*次/);
            if (wash) {
                if (!md) {
                    const plain = line.match(/(?:^|\s)锁定\s*([^「，：]+)，洗\s*\d+\s*次/);
                    keep = ids(plain ? plain[1].split('、') : names(line.split('连续洗脉')[0].split(/[：:]/).at(-1)));
                }
                const count = Number(wash[1]);
                if (count > 20000) throw Error('单步洗数过大');
                for (let i=0;i<count;i++) advance({type:'wash',keep});
                const hit = line.match(/出现「([^」]+)」/);
                if (hit) ids([hit[1]]);
            }
            const ex = line.match(/将「([^」]+)」置换为「([^」]+)」|置换「([^」]+)」，应得到「([^」]+)」|置换\s+([^→：]+?)\s*→\s*([^：:（]+?)\s*[：:（]/);
            if (ex) {
                const [from] = ids([ex[1] || ex[3] || ex[5]]), pos = state.talents.indexOf(from);
                const plainLocks = line.match(/[：:]锁定([^；：:]+?)(?:后置换|；置换)/);
                const locks = plainLocks && ex[5] ? ids(plainLocks[1].split('、')) : md || ex[5]
                    ? state.talents.slice(0,pos).filter(id => ctx.engine.quality(id)<4 &&
                        ctx.engine.talentType(id)===ctx.engine.talentType(from))
                    : ids(names(line.split('置换「')[0]));
                advance({type:'exchange',pos,keep:locks});
                if (ctx.engine.name(state.talents.at(-1)) !== (ex[2] || ex[4] || ex[6]).trim()) throw Error('置换结果不同，存档可能已推进');
            }
            if (wash || ex) continue;
            const opening = line.match(/(?:开启第\s*|开)([1-4]|四)\s*(槽|脉)/);
            if (opening) {
                const n = opening[1];
                if ((n === '四' ? 4 : Number(n)) !== state.zizhi-149) throw Error('开槽步骤与起点不一致');
                advance({type:'open'}); continue;
            }
            if (/^\d+[.、]/.test(line) && !/核对最终目标|确认最终槽位/.test(line)) throw Error('无法识别步骤：' + line.slice(0,55));
        }
        return route(ctx,path,'personal-reference');
    }

    async function exact(ctx, graph, initialBest, candidate, progress, checkpoint) {
        if (!fitsSlots(ctx)) return {best:null,expanded:0,proof:'infeasible'};
        const budget = ctx.options.maxTotalPills;
        let best = initialBest, expanded = 0, lower = 0;
        const first = {key:keyOf(ctx.startState), state:ctx.startState, cost:0, pending:0};
        await graph.commit([],new Map([[first.key,first]]));
        async function accept(row) {
            const path = [];
            for (let n=row; n.parent != null; n=await graph.read(n.parent)) path.push(n.move);
            const checked = route(ctx,path.reverse(),'personal-exact');
            if (checked.totalPills !== row.cost || !goal(ctx,row.state)) throw Error('路线成本回放不一致');
            best = checked;
            candidate(best);
        }
        while (true) {
            await checkpoint();
            const batch = await graph.take(64);
            if (!batch.length || (best && batch[0].cost >= best.totalPills)) break;
            lower = batch[0].cost;
            const next = new Map();
            for (const row of batch) {
                if (goal(ctx,row.state) && (!best || row.cost < best.totalPills)) await accept(row);
                if (best && lower >= best.totalPills) break;
                expanded++;
                const remaining = Math.min(budget,(best?.totalPills ?? Infinity)-1) - row.cost;
                for (const move of moves(ctx,row.state,remaining)) {
                    const successor = apply(ctx,row.state,move);
                    const cost = row.cost + successor.action.cost;
                    if (cost > budget || (best && cost >= best.totalPills)) continue;
                    const state = successor.state, key = keyOf(state);
                    if ((next.get(key)?.cost ?? Infinity) <= cost) continue;
                    const child = {key,state,cost,pending:cost,parent:row.key,move};
                    if (goal(ctx,state)) await accept(child);
                    else next.set(key,child);
                }
            }
            if (best && lower >= best.totalPills) break;
            await graph.commit(batch,next);
            progress({expanded,lower,best:best?.totalPills});
        }
        return {best:best ? {...best,verifiedOptimal:true} : null, expanded,
            proof:best ? 'optimal' : 'infeasible'};
    }
    root.PersonalWashSearch = {context,goal,fitsSlots,apply,moves,route,reference,exact};
})(self);
