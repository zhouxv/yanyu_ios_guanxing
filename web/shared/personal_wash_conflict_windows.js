/* Search conflict windows shared by all compatible target combinations. */
(function (root) {
    'use strict';
    function* iterate(input, branches, deadline, collect, progress, fair = false, quick = false) {
        const engine = new root.AutoWash2Engine.Engine(root.TALENT_DATA, input.initialState,
            {dlcMode: !!input.dlcMode, eligibleTalentIds: input.eligibleTalentIds});
        const startState = engine.initialState(input.initialState);
        if (![153, 154].includes(startState.zizhi) || !branches.length) return;
        const {actionWash, actionReplace, actionUpgrade, traceAppend, routeFromNode} =
            root.PersonalWashRoutes;
        const initialLocks = (input.initialState.talents || []).filter(t => t.locked).map(t => t.id);
        const wanted = new Set(branches.flat());
        const required = new Set(input.targetIds || []);
        const size = state => engine.slotCountFor(state.zizhi);
        const level = input.options.depthLevel;
        const byDepth = Number.isInteger(level) && level >= 1 && level <= 3;
        const layers = byDepth ? 2 * level + 1 : 5;
        const layerBudget = byDepth ? 250000 * level : Infinity;
        let phaseDeadline = deadline, washes = 0, washLimit = layerBudget, limited = false;
        const expired = () => byDepth ? washes >= washLimit : Date.now() >= phaseDeadline;
        let ceiling = input.options.maxTotalPills;
        let frontier = new Map();
        const windows = new Map();
        function step(node, result) {
            return {state: result.state, cost: node.cost + result.action.cost,
                trace: traceAppend(node.trace, result.action)};
        }
        function wash(node, locks) {
            washes++;
            return step(node, actionWash(engine, node.state, locks, 'conflict-window'));
        }
        // Balance the two nested searches (lock onset and exchange timing)
        // against the number of remaining affordable washes.
        function windowLength(node, lockCount) {
            const slots = size(node.state);
            const unitCost = engine.at(node.state.zizhi).eat + Math.max(0, 2 * lockCount - 1);
            const affordable = Math.max(0, Math.floor((ceiling - node.cost) / unitCost));
            return Math.ceil(Math.sqrt(affordable) * slots);
        }
        function nextLocks(state, held) {
            // Prefer required targets when more than one compatible talent appears.
            let best = held;
            for (const ids of branches) {
                if (!held.every(id => ids.includes(id) || initialLocks.includes(id))) continue;
                const locks = state.talents.filter(id => ids.includes(id) || initialLocks.includes(id));
                if (locks.length > best.length) best = locks;
            }
            return best;
        }
        function finish(node) {
            if (node.cost > ceiling) return false;
            const ids = branches.find(group => group.every(id => node.state.talents.includes(id)));
            if (!ids) return false;
            const route = routeFromNode({...input, startState, engine, targetIds: ids},
                {...node, serial: 0});
            route.strategyLabel = quick ? '邻近前置与连续置换' : '冲突脉回溯 · 延迟置换';
            collect({routes: [route]});
            ceiling = node.cost - 1;
            return true;
        }
        function keep(node, held) {
            if (node.cost > ceiling || finish(node)) return;
            const group = node.state.luckSeed + '/' + held.join(',');
            const bucket = frontier.get(group) || [];
            const key = root.AutoWash2Engine.stateKey(node.state);
            const same = bucket.findIndex(other => other.key === key);
            if (same >= 0) {
                if (bucket[same].cost <= node.cost) return;
                bucket.splice(same, 1);
            }
            // A bounded beam per luck seed and target subset, in pill order.
            if (bucket.length === 3 && bucket[2].cost <= node.cost) return;
            bucket.push({...node, held, key});
            bucket.sort((a, b) => a.cost - b.cost);
            if (bucket.length > 3) bucket.pop();
            frontier.set(group, bucket);
        }
        function* exchangeWindow(start, held, carrier, depth) {
            const key = root.AutoWash2Engine.stateKey(start.state) + '/' + held.join(',')
                + '/' + carrier + '/' + depth;
            if ((windows.get(key) ?? Infinity) <= start.cost) return;
            if (windows.size >= 30000) windows.clear();
            windows.set(key, start.cost);
            const locks = [...new Set([...held, carrier])];
            let node = start;
            const limit = quick && start.state.luckSeed != null
                ? (depth === 0 ? 8 : 0) : windowLength(start, locks.length);
            for (let pad = 0; pad <= limit && node.cost <= ceiling && !expired(); pad++) {
                const {state} = node;
                const pos = state.talents.indexOf(carrier);
                if (!engine.replaceablePositions(state, held).includes(pos)) break;
                const swapped = step(node, actionReplace(engine, state, pos, 'window-exchange', held));
                const added = swapped.state.talents.at(-1);
                const protectedIds = held.filter(id => wanted.has(id) || initialLocks.includes(id));
                const retained = nextLocks(swapped.state, protectedIds);
                if (wanted.has(added)) keep(swapped, retained);
                if (quick && protectedIds.length && !required.has(added))
                    keep(swapped, protectedIds);
                // After seed fixation the same exchange can land on a different
                // blocker. Try the legal relay immediately, including zero washes.
                if (depth + 1 < size(state) && !initialLocks.includes(added)) {
                    const block = swapped.state.talents.find(id => engine.quality(id) < 4
                        && engine.talentType(id) === engine.talentType(added));
                    const relayLocks = [...new Set(block ? [...protectedIds, block] : protectedIds)];
                    if (protectedIds.length && (depth > 0 || wanted.has(added))) keep(swapped, protectedIds);
                    if (engine.replaceablePositions(swapped.state, relayLocks).includes(swapped.state.talents.indexOf(added))) {
                        yield* exchangeWindow(swapped, relayLocks, added, depth + 1);
                    }
                }
                if (locks.length >= size(state)) break;
                node = wash(node, locks);
                if (fair && washes % 128 === 0) yield;
            }
        }
        function* scan(node, held, explore) {
            const recent = [];
            const lookback = windowLength(node, held.length);
            // Save the most recent conflict talents before a natural purple,
            // then replay from those positions under the proposed locks.
            while (held.length < size(node.state) && node.cost <= ceiling && !expired()) {
                const next = wash(node, held);
                if (fair && washes % 128 === 0) yield;
                if (next.cost > ceiling) break;
                const fresh = next.state.talents.filter(id => !held.includes(id));
                for (const purple of explore ? fresh : []) {
                    if (engine.quality(purple) !== 4) continue;
                    const type = engine.talentType(purple);
                    const anchors = quick ? recent.slice().reverse() : recent;
                    let matches = 0;
                    for (const before of anchors) {
                        const anchor = before.state.talents.find(id => !held.includes(id)
                            && engine.quality(id) < 4 && engine.talentType(id) === type);
                        if (!anchor) continue;
                        // This first pass samples nearby onset points. The wider
                        // pass and cost-ordered search start afresh afterwards.
                        if (quick && ++matches > 3) break;
                        const locks = [...held, anchor];
                        let pivot = before;
                        while (locks.length < size(pivot.state) && !expired()
                            && pivot.state.bornRC <= next.state.bornRC) {
                            // Pity draws need not advance the ordinary sequence.
                            const priorCost = pivot.cost;
                            pivot = wash(pivot, locks);
                            if (fair && washes % 128 === 0) yield;
                            if (pivot.cost <= priorCost || pivot.cost > ceiling) break;
                            const pos = engine.replaceablePositions(pivot.state, locks)
                                .find(i => pivot.state.talents[i] === purple);
                            if (pos !== undefined) { yield* exchangeWindow(pivot, locks, purple, 0); break; }
                        }
                    }
                }
                if (finish(next)) break;
                const gained = nextLocks(next.state, held);
                if (gained.length > held.length) {
                    if (explore) {
                        keep(next, gained);
                        const mandatory = gained.filter(id=>required.has(id));
                        if (quick && mandatory.length > held.length && mandatory.length < gained.length)
                            keep(next, mandatory);
                    }
                    else held = gained;
                }
                recent.push(node);
                if (recent.length > lookback) recent.shift();
                node = next;
            }
        }
        const start = {state: startState, cost: 0, trace: null, held: initialLocks};
        if (finish(start)) return;
        let layer = [start];
        const luckScores = new Map();
        function seedScore(node) {
            const key = node.state.luckSeed + '/' + node.held.join(',');
            if (luckScores.has(key)) return luckScores.get(key);
            let seed = node.state.luckSeed;
            const seen = new Set(node.held);
            if (seed != null) {
                for (let i = 0, accepted = 0; i < 32 && accepted < 4; i++) {
                    const [id, next] = engine.draw(seed, true);
                    seed = next;
                    if (!engine.isAllowedAt(id, 154) || seen.has(id)) continue;
                    seen.add(id); accepted++;
                }
            }
            const coverage = Math.max(...branches.map(group => group.filter(id => seen.has(id)).length));
            const score = coverage + [...required].filter(id => seen.has(id)).length;
            luckScores.set(key, score);
            return score;
        }
        for (let depth = 0; layer.length && depth < layers && (byDepth || Date.now() < deadline); depth++) {
            washes = 0;
            washLimit = Math.floor(layerBudget * 0.8);
            const now = Date.now();
            phaseDeadline = now + (deadline - now) * (depth === 0 ? 0.25 : depth < 3 ? 0.55 : 1);
            progress({message: (quick ? '邻近前置和连续置换' : '冲突脉回溯') + ' · 第 ' + (depth + 1) + '/' + layers + ' 层'});
            frontier = new Map();
            windows.clear();
            function* runLayer(items, explore) {
                function task(item) {
                    const open = item.state.zizhi === 153 && (depth > 0 || !explore)
                        && (input.options.maxZi ?? 154) >= 154
                        ? step(item, actionUpgrade(engine, item.state)) : item;
                    return scan(open, item.held, explore);
                }
                if (!fair) {
                    for (const item of items) {
                        if (expired()) break;
                        yield* task(item);
                    }
                    return;
                }
                // Each iterator retains its prefix, inner pad and relay cursors.
                // Give every start a quantum before revisiting an expensive start.
                let active = items.map(task);
                while (active.length && !expired()) {
                    const next = [];
                    for (const job of active) {
                        if (expired()) break;
                        if (!job.next().done) next.push(job);
                        yield;
                    }
                    active = next;
                }
            }
            yield* runLayer(layer, true);
            // Different starting locks often converge on the same luck seed.
            // Reserve expansion slots for distinct seeds and target subsets.
            layer = [...frontier.values()].flat().sort((a, b) => b.held.length - a.held.length
                || seedScore(b) - seedScore(a) || a.cost - b.cost);
            if (byDepth && expired()) limited = true;
            washLimit = layerBudget;
            phaseDeadline = Math.min(deadline, Math.max(phaseDeadline, Date.now() + (deadline-Date.now())*0.12));
            yield* runLayer(layer, false);
            if (byDepth && expired()) limited = true;
        }
        return limited;
    }
    function search(...args) {
        const jobs = iterate(...args);
        let result;
        do { result = jobs.next(); } while (!result.done);
        return result.value;
    }
    root.PersonalWashConflictWindows = {search, iterate};
})(self);
