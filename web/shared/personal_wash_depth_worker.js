/* The former local depth strategy, available only in the personal tab. */
'use strict';
self.window = self;
importScripts('data.js','wash_source_engine.js','auto_wash2_source_cache.js','auto_wash2_engine.js',
    'auto_wash2_optimizer.js','auto_wash2_model.js','anchor_route_planner.js','anchor_route_search.js',
    'auto_wash2_anchor.js','auto_wash2_seed_planner.js','auto_wash2_seed.js',
    'personal_wash_routes.js','personal_wash_conflict_windows.js','personal_wash_anchor.js');
self.onmessage = async event => {
    const {data:message} = event;
    if (message.type !== 'search') return;
    const send = (type, payload) => self.postMessage({type, requestId:message.requestId, ...payload});
    try {
        const input = message.input, branches = AutoWash2Model.combinations(input);
        let routes = [];
        const combined = () => ({routes});
        function collect(result) {
            const unique = new Map(routes.map(route => [JSON.stringify([route.finalState,route.steps]),route]));
            for (const route of result?.routes || [])
                unique.set(JSON.stringify([route.finalState,route.steps]),route);
            routes = [...unique.values()].sort((a,b) =>
                a.totalPills - b.totalPills || a.totalWashes - b.totalWashes).slice(0,20);
            if (routes.length) send('candidate',{result:combined()});
        }
        if (input.options.searchPolicy === 'full') {
            const limit = branches[0]?.length === 4 ? 900000 : 600000;
            const duration = Math.min(limit, message.searchTimeMs ?? limit);
            const start = Date.now();
            if (duration >= 10000) {
                PersonalWashConflictWindows.search(input,branches,start + Math.min(45000,duration * 0.08),
                    collect,progress => send('progress',{progress}));
            }
            const best = combined().routes[0];
            if (best?.totalPills === 0 || Date.now() >= start + duration) {
                send('result',{result:{...combined(),limited:best?.totalPills !== 0}});
                return;
            }
            const upstream = new Worker(new URL('auto_wash2_worker.js',self.location.href));
            try {
                await new Promise((resolve,reject) => {
                    upstream.onerror = error => reject(Error(error.message));
                    upstream.onmessage = ({data}) => {
                        if (data.type === 'error') return reject(Error(data.error));
                        if (data.type === 'progress') send('progress',{progress:data.progress});
                        if (data.result?.routes.length) collect(data.result);
                        if (data.type === 'result') {
                            send('result',{result:{...data.result,...combined()}});
                            resolve();
                        }
                    };
                    const options = {...input.options,maxTotalPills:Math.min(input.options.maxTotalPills,
                        (best?.totalPills ?? Infinity) - 1)};
                    upstream.postMessage({...message,input:{...input,options},searchTimeMs:start+duration-Date.now()});
                });
            } finally { upstream.terminate(); }
            return;
        }
        const level = Math.min(3, Math.max(1, Math.trunc(Number(input.options.depthLevel) || 2)));
        const intensity = [1, 2, 4][level - 1];
        const budget = input.options.maxTotalPills ?? 5000;
        let bestCost = Infinity;
        const receive = result => {
            for (const route of result?.routes || []) bestCost = Math.min(bestCost, route.totalPills);
            collect(result);
        };
        const optimal = () => bestCost === 0;
        const firstWashCost = Number(self.ZZ_DATA?.[input.initialState.zizhi]?.eat_xisui) || 0;
        const domestic = !WashSourceEngine.isInternationalChannel(
            input.initialState?.save_channel || input.initialState?.channel);
        const progress = progress => send('progress', {progress});
        const depthInput = {...input, options: {...input.options, depthLevel: level,
            searchIntensity: intensity, maxTotalPills: budget}};
        let limited = !!PersonalWashConflictWindows.search(depthInput, branches, Infinity, receive, progress);
        for (const [index, targets] of branches.entries()) {
            const cap = () => Math.min(budget, bestCost - 1);
            if (cap() < 0) break;
            const branchProgress = value => progress({...value,
                message: `目标组合 ${index + 1}/${branches.length} · ${value.message}`});
            const options = () => ({...depthInput.options, maxTotalPills: cap()});
            // Below the price of one wash only free moves are possible.
            // The tactical pass still checks those (including exchanges).
            if (cap() >= firstWashCost) {
                AutoWash2Seed.search({...depthInput, options: options()}, targets, receive,
                    branchProgress, {intensity, timeBudgetMs: Infinity});
            }
            if (cap() < 0) break;
            branchProgress({message: `战术搜索 · 最多 ${96 + (intensity - 1) * 16} 层关键操作`});
            const result = await AutoWash2Optimizer.searchWashRoutes({...depthInput,
                talentData: TALENT_DATA, targetIds: targets, options: options(),
                onCandidate: receive, onProgress: branchProgress, shouldCancel: optimal});
            limited ||= !!result.searchScope?.safetyLimitReached;
            receive(result);
            if (domestic && cap() > 0 && cap() >= firstWashCost) {
                const bounded = PersonalWashAnchor.search({...depthInput, options: options()},
                    targets, receive, branchProgress, optimal);
                limited ||= bounded;
            }
        }
        send('result',{result:{...combined(),limited}});
    } catch (error) {
        send('error',{error:error.message || String(error)});
    }
};
