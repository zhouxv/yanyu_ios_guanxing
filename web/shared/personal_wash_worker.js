/* Dedicated worker for the personal tab. The original tab uses its own worker. */
'use strict';
self.window = self;
importScripts('data.js','wash_source_engine.js','auto_wash2_source_cache.js','auto_wash2_engine.js',
    'auto_wash2_optimizer.js','auto_wash2_model.js','personal_wash_routes.js','personal_wash_conflict_windows.js',
    'personal_wash_search.js','personal_wash_graph.js');
let active;
self.onmessage = async ({data}) => {
    const send = (type,payload) => self.postMessage({type,requestId:data.requestId,...payload});
    if (data.type === 'inspect') {
        try {
            const e = new AutoWash2Engine.Engine(TALENT_DATA,data.raw);
            send('summary',{summary:{allowed:[...e.allowed],purpleIds:e.purpleIds}});
        } catch (err) { send('error',{error:err.message}); }
        return;
    }
    if (data.type !== 'search') {
        if (!active || active.id !== data.requestId) return;
        if (data.type === 'pause') active.paused = true;
        if (data.type === 'resume') { active.paused = false; active.wake?.(); }
        if (data.type === 'skip') active.skip = true;
        return;
    }
    if (active) return;
    let graph, best = null;
    const job = active = {id:data.requestId,paused:false,skip:false};
    try {
        const input = data.input, opts = input.options;
        if (!Number.isInteger(opts.maxTotalPills) || opts.maxTotalPills < 0 || opts.maxTotalPills > 20000 ||
            !Number.isInteger(opts.maxZi) || opts.maxZi > 154 || opts.maxZi < input.initialState.zizhi) throw Error('预算或开槽范围无效');
        const ctx = PersonalWashSearch.context(input);
        const progress = message => send('progress',{progress:{message}});
        let lastYield = performance.now();
        async function checkpoint() {
            if (performance.now() - lastYield >= 20) {
                await new Promise(resolve => setTimeout(resolve,0));
                lastYield = performance.now();
            }
            if (job.paused) {
                send('paused',{});
                await new Promise(resolve => { job.wake = resolve; });
                job.wake = null;
                send('resumed',{});
            }
        }
        function accept(route) {
            if (!best || route.totalPills < best.totalPills) {
                best = route;
                send('candidate',{result:{routes:[best]}});
            }
        }
        if (opts.referenceText) {
            const referenceCtx = {...ctx, options:{...opts,maxTotalPills:20000}};
            const reference = PersonalWashSearch.reference(referenceCtx,opts.referenceText);
            if (reference.totalPills <= opts.maxTotalPills) accept(reference);
            else progress('已回放参考路线，共 ' + reference.totalPills + ' 丹，继续搜索所设预算内的路线');
        }
        if (opts.strategyFirst && PersonalWashSearch.fitsSlots(ctx) &&
            !PersonalWashSearch.goal(ctx,ctx.startState) && opts.maxTotalPills > 0 && best?.totalPills !== 0) {
            send('phase',{phase:'strategy'});
            const combinationCount = (input.compatibleGroups || []).reduce((n,group) => n * group.length,1);
            if (combinationCount <= 256) {
                const branches = AutoWash2Model.combinations(input);
                // A large hypothetical budget expands every window and changes
                // the order in which the bounded strategy spends its work.
                // Give routes affordable from the actual bag a separate pass.
                const caps = [];
                if (input.hasBagPills && input.bagPills > 0 && input.bagPills < opts.maxTotalPills)
                    caps.push({quick:true,cap:input.bagPills});
                caps.push({quick:true,cap:opts.maxTotalPills},{quick:false,cap:opts.maxTotalPills});
                let previousQuickCap;
                for (const {quick,cap} of caps) {
                    if (job.skip || best?.totalPills === 0) break;
                    const searchCap = Math.min(cap,(best?.totalPills ?? Infinity)-1);
                    if (quick && searchCap === previousQuickCap) continue;
                    if (quick) previousQuickCap = searchCap;
                    const warm = {...input, options:{...opts,maxTotalPills:searchCap}};
                    const runner = PersonalWashConflictWindows.iterate(warm,branches,Infinity,
                        r => r.routes.forEach(accept), p => progress(p.message + ' · 上限 ' + searchCap + ' 丹'),true,quick);
                    try {
                        while (!job.skip && !runner.next().done) await checkpoint();
                    } catch (err) {
                        progress('策略分支未完成，转入预算内穷举 · ' + err.message);
                        break;
                    } finally {
                        runner.return();
                    }
                }
            }
        }
        send('phase',{phase:'exact'});
        progress('开始预算内穷举 · ' + (best ? '检验低于 ' + best.totalPills + ' 丹的全部合法路线' : '从当前存档逐层展开'));
        graph = new PersonalWashGraph(data.dbName);
        let lastReport = 0;
        const output = await PersonalWashSearch.exact(ctx,graph,best,accept,stats=>{
            if (performance.now()-lastReport < 200) return;
            lastReport = performance.now();
            progress('预算内穷举 · 当前丹耗层 ' + stats.lower + ' · 已展开 ' + stats.expanded.toLocaleString() +
                ' 个状态 · ' + (stats.best == null ? '尚无候选' : '当前最好 ' + stats.best + ' 丹'));
        },checkpoint);
        send('result',{result:{routes:output.best ? [output.best] : [],proof:output.proof,
            noResultReason:'已穷尽本次开槽范围和预算内的合法操作，未找到目标组合。'}});
    } catch (err) {
        send('error',{error:'搜索未完成：' + (err.message || err) + (best ? '。已保留经过回放的候选。' : '')});
    } finally {
        graph?.close();
        active = null;
    }
};
