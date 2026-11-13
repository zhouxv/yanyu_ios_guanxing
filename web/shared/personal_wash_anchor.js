/* Depth-bounded anchor search using the upstream planner and route converter. */
(function (root) {
    'use strict';
    function search(input, targets, collect, progress, shouldCancel) {
        const raw = input.initialState, planner = root.AnchorRoutePlanner;
        const intensity = Math.max(1, Math.min(4,
            Math.trunc(Number(input.options?.searchIntensity) || 1)));
        // Locks describe the initial game state, not a permanent restriction.
        // Model.targets already adds every preserved purple to the final targets,
        // matching the tactical planner's unlock-and-reacquire semantics.
        if (![153, 154].includes(Number(raw.zizhi)) || targets.length < 1 || targets.length > 4
                || Number(input.options?.maxTotalPills) === 0) return false;
        const purples = planner.scan(raw, 24);
        const choices = [purples.filter(p => !p.fromPity && p.id !== 251).slice(0, targets.length),
            purples.slice(0, targets.length), purples.filter(p => p.id !== 251).slice(0, targets.length)];
        const seen = new Set();
        let best = null, bestAnchors = null, bounded = false;
        const accepted = new Set();
        const accept = (route, anchors) => {
            const key = root.AnchorRouteSearch.routeKey(route);
            if (accepted.has(key)) return;
            accepted.add(key);
            const converted = root.AutoWash2Anchor.convert(raw, anchors, route, targets, input);
            if (!converted) return;
            if (!best || route.cost < best.cost) { best = route; bestAnchors = anchors; }
            collect({routes: [converted]});
        };
        for (const anchors of choices) {
            if (shouldCancel()) break;
            const key = anchors.map(p => p.key).join('|');
            if (anchors.length !== targets.length || seen.has(key)) continue;
            seen.add(key);
            const pass = root.AnchorRouteSearch.run({mode: 'auto', raw, anchors, purples,
                options: {targets, maxCost: Number(input.options?.maxTotalPills ?? 10000),
                    maxNodes: 3000 + (intensity - 1) * 2500,
                    sequenceBasis: 'theory2', exhaustive: true,
                    perJobMs: 0,
                    stages: [{limit:150 * intensity,depth:24 + (intensity - 1) * 8},
                        {limit:450 * intensity,depth:36 + (intensity - 1) * 12},
                        {limit:900 * intensity,depth:48 + (intensity - 1) * 16}],
                    shouldCancel}}, packet => {
                if (packet.type === 'progress') progress({message: `置换路线比较 · 序列 ${packet.pad} · 深度 ${packet.depth}`});
                if (packet.candidate || packet.routes?.length) {
                    (packet.candidate ? [packet.candidate] : packet.routes).forEach(route => accept(route, anchors));
                }
            });
            bounded ||= !!pass?.meta?.stages?.some(stage => stage.bounded > 0);
        }
        // Fast sequence comparison must not skip the legacy late-lock and slot
        // optimizations. Refine the best verified sequence with a separate budget.
        if (best && !shouldCancel()) {
            const source = purples.find(p => p.key === best.source.key);
            progress({message: '继续优化已找到路线的锁脉时机与开槽步骤…'});
            const result = planner.search(raw, bestAnchors, source, best.pad,
                {targets, maxCost: Math.min(Number(input.options?.maxTotalPills ?? 10000), best.cost + 1),
                    depth: best.sequence.pool.length, maxNodes: 500 * intensity,
                    sequenceBasis: 'theory2', shouldCancel},
                packet => { if (packet.candidate) accept(packet.candidate, bestAnchors); });
            result.routes.forEach(route => accept(route, bestAnchors));
        }
        return bounded || shouldCancel();
    }
    root.PersonalWashAnchor = Object.freeze({search});
})(self);
