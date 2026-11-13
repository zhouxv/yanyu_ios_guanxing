(function () {
    'use strict';
    const workerBase = document.currentScript.src;
    const $ = id => document.getElementById('wp' + id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const name = id => TALENT_DATA[id]?.name || '#' + id;
    const clone = value => JSON.parse(JSON.stringify(value));
    let raw = null, worker = null, request = 0, running = false, available = [], assignments = new Map();
    let source = null, context = '', lastResult = null, bag = 0, activeRole = '';
    let referenceText = '', dbName = null, paused = false, refVersion = 0;
    const panel = document.getElementById('personalWashModePanel');
    if (!panel) return;
    const tab = document.getElementById('btnPersonalWashMode');
    // Upstream handles its own tabs. Only manage our extra panel when entering
    // or leaving it, without changing any upstream listeners or search state.
    tab.closest('[role=tablist]').addEventListener('click', event => {
        const selected = event.target.closest('[role=tab]');
        if (!selected) return;
        if (selected === tab) {
            for (const button of tab.parentElement.querySelectorAll('[role=tab]')) {
                const active = button === tab;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', String(active));
                document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
            }
            document.getElementById('aiPredictionTitle').textContent = tab.textContent;
            document.querySelector('#aiPredictionPanel > .ai-prediction-intro').textContent =
                '先按冲突脉和置换序列找路，再逐丹检验有没有更省的组合。可直接穷举，也可导入已知路线作为上限。';
            document.querySelector('#aiPredictionPanel .ai-kicker').textContent = 'LOCAL WASH ROUTE PLANNER';
            refresh();
        } else if (!panel.hidden) {
            panel.hidden = true;
            tab.classList.remove('is-active');
            tab.setAttribute('aria-selected', 'false');
        }
    });
    panel.innerHTML = `
        <div class="w2-note"><strong>自用洗脉</strong><span>从当前导入的存档起算，生成的路线需在游戏中手动执行。</span></div>
        <section class="w2-section">
            <h3><span>01</span>选择人物</h3>
            <div class="w2-fields">
                <label>存档人物<select id="wpRole"><option value="">请先导入存档</option></select></label>
                <label>VIP<select id="wpVip"><option value="0">无 VIP</option><option value="1" selected>VIP 1+</option><option value="2">VIP 2+</option></select></label>
                <label>最大耗丹数量<input id="wpBudget" type="number" min="0" max="20000" step="100" value="5000"></label>
                <label>搜索方式<select id="wpDepth">
                    <optgroup label="预算内穷举">
                        <option value="1">策略 3 层，再穷举</option><option value="2" selected>策略 5 层，再穷举</option>
                        <option value="3">策略 7 层，再穷举</option><option value="0">直接穷举</option>
                    </optgroup>
                    <optgroup label="旧版自用策略">
                        <option value="depth-1">仅深搜 3 层</option><option value="depth-2">仅深搜 5 层</option>
                        <option value="depth-3">仅深搜 7 层</option><option value="timed">冲突预搜＋限时搜索</option>
                    </optgroup>
                </select></label>
                <label>开槽范围<select id="wpSlots"><option value="4">允许逐步开到四槽</option><option value="0">只用当前槽数</option></select></label><label>参考路线（选填）<input type="file" id="wpReference" accept=".txt,.md"></label><button type="button" id="wpForget" class="btn btn-reset" hidden>移除参考路线</button>
                <div class="w2-stock">背包洗髓丹<strong id="wpBag">—</strong></div>
            </div>
            <p id="wpSummary" class="w2-muted">请先在首页导入存档，再选择人物。</p>
        </section>
        <section class="w2-section">
            <h3><span>02</span>保留当前天赋</h3>
            <p class="w2-muted">锁定作为起始状态；已锁紫脉自动加入必选目标。路线中可暂时解锁再取得，最终仍须包含这些紫脉。</p>
            <div id="wpLocks" class="w2-locks"></div>
        </section>
        <section class="w2-section">
            <h3><span>03</span>选择目标紫脉<strong id="wpCount"></strong></h3>
            <div class="w2-fields w2-target-tools">
                <label>筛选紫脉<input id="wpFilter" type="search" placeholder="输入名称"></label>
                <label>选入分组<select id="wpGroup"><option value="-1">必选脉</option><option value="0">兼容组一 · 任选一条</option><option value="1">兼容组二 · 任选一条</option><option value="2">兼容组三 · 任选一条</option><option value="3">兼容组四 · 任选一条</option></select></label>
                <button id="wpPreset" type="button" class="btn btn-reset">金顶混</button>
                <button id="wpClear" type="button" class="btn btn-reset">清空选择</button>
            </div>
            <p class="w2-muted">必选脉全部取得，每个兼容组至少取得一条，合计最多四槽。策略阶段轮流扩展不同起点。穷举按耗丹从低到高展开，含零丹置换；只计洗髓丹，开槽需自行满足资质条件。大预算可能耗时很长，可在本页暂停续搜。</p>
            <p class="w2-credit">特别鸣谢 B站大佬「庸丶人」提供欧气种子路线、吞脉/跳脉及统一路线构造的研究方案</p>
            <div id="wpTargets" class="w2-targets"></div>
            <p id="wpRequirements" class="w2-requirements"></p>
        </section>
        <div class="w2-actions"><button id="wpRun" class="btn btn-ai-predict" disabled>开始规划路线</button><button id="wpStop" class="btn btn-reset" hidden>停止搜索</button><button id="wpExport" class="btn btn-reset" disabled>导出路线</button></div>
        <div class="w2-actions"><button type="button" class="btn btn-reset" id="wpPause" hidden>暂停</button><button type="button" class="btn btn-reset" id="wpSkip" hidden>立即进入穷举</button></div>
        <p id="wpStatus" role="status" aria-live="polite">等待选择人物。</p>
        <div id="wpResults"><div class="ai-result-empty">选择人物及目标后开始规划。</div></div>`;

    function status(text, error = false) {
        $('Status').textContent = text;
        $('Status').classList.toggle('w2-error', error);
    }
    function stop(text) {
        request++;
        worker?.terminate(); worker = null; running = false;
        paused = false;
        $('Pause').hidden = $('Skip').hidden = true;
        if (dbName && window.indexedDB) indexedDB.deleteDatabase(dbName);
        dbName = null;
        $('Stop').hidden = true;
        $('Run').disabled = !raw || !available.length;
        if (text) status(text);
    }
    function invalidate() {
        stop(); lastResult = null;
        $('Export').disabled = true;
        $('Results').innerHTML = '<div class="ai-result-empty">条件已改变，请重新规划路线。</div>';
    }
    function preserved() {
        return raw?.talents.filter(t => t.locked && Number(TALENT_DATA[t.id]?.weight) === 4).map(t => t.id) || [];
    }
    function renderTargets() {
        const filter = $('Filter').value.trim();
        const locked = preserved();
        $('Targets').innerHTML = available.filter(id => name(id).includes(filter)).map(id => {
            const kept = locked.includes(id), group = assignments.get(id);
            const label = kept ? '已保留' : group == null ? '' : group === -1 ? '必选' : '组' + (group + 1);
            return `<button type="button" class="w2-target ${label ? 'is-selected' : ''}" data-id="${id}" aria-pressed="${!!label}" ${kept ? 'disabled' : ''} title="${esc(TALENT_DATA[id]?.desc)}"><span>${esc(name(id))}</span><small>${label || '＋'}</small></button>`;
        }).join('') || '<p class="w2-muted">暂无可选紫脉。</p>';
        try {
            const selection = AutoWash2Model.targets(raw || {talents: []}, assignments, TALENT_DATA);
            $('Count').textContent = `${selection.targetIds.length + selection.compatibleGroups.length} / 4 槽`;
            $('Requirements').textContent = ['必选：' + (selection.targetIds.map(name).join('、') || '无'),
                ...selection.compatibleGroups.map((g, i) => `兼容组${i + 1}：${g.map(name).join(' / ')}`)].join('；');
        } catch (error) {
            $('Count').textContent = '待选择'; $('Requirements').textContent = error.message;
        }
    }
    function renderLocks() {
        $('Locks').innerHTML = raw?.talents.length ? raw.talents.map((t, i) => `<button type="button" class="w2-lock ${t.locked ? 'is-selected' : ''}" data-index="${i}" aria-pressed="${t.locked}"><strong>${esc(name(t.id))}</strong><span>${t.locked ? '已锁定' : '未锁定 · 点击保留'}</span></button>`).join('') : '<p class="w2-muted">当前无天赋。</p>';
    }
    function usingPreviousStrategy() {
        return $('Depth').value.startsWith('depth-') || $('Depth').value === 'timed';
    }
    function makeWorker(file = 'personal_wash_worker.js') {
        if (worker) return worker;
        worker = new Worker(new URL(file, workerBase));
        const current = worker;
        worker.onerror = event => {
            if (current !== worker) return;
            stop(); status('后台计算失败：' + (event.message || '请重新进入此页面重试'), true);
        };
        return worker;
    }
    function inspect() {
        const id = ++request;
        status('正在读取人物可用紫脉…');
        const w = makeWorker();
        w.onmessage = ({data}) => {
            if (data.requestId !== id || request !== id) return;
            if (data.type === 'error') { stop(); status(data.error, true); return; }
            if (data.type !== 'summary') return;
            const allowed = new Set(data.summary.allowed);
            available = data.summary.purpleIds.filter(id => allowed.has(id));
            assignments = new Map([...assignments].filter(([id]) => available.includes(id)));
            renderTargets(); $('Run').disabled = false; status('已就绪，选择目标后开始规划。');
        };
        w.postMessage({type: 'inspect', requestId: id, raw});
    }
    function chooseRole() {
        invalidate(); raw = null; available = []; activeRole = $('Role').value;
        $('Run').disabled = true;
        const s = window.state || {}, entry = s.saveRoles?.find(e => e.key === activeRole);
        if (!entry) { $('Run').disabled = true; renderLocks(); renderTargets(); status('请选择人物。'); return; }
        try {
            if (s.dlcMode || /international|oversea|国际|國際/i.test([s.saveChannel, s.savePlatform].join(' '))) throw new Error('此模块暂支持国服及先行服，国际服请使用原有功能。');
            raw = AutoWash2Model.snapshot(s.saveData, entry.role, {vip: $('Vip').value, channel: s.saveChannel});
            if (![150, 151, 152, 153, 154].includes(raw.zizhi)) throw new Error('该人物资质不受支持。');
            bag = (Array.isArray(s.saveData.Items) ? s.saveData.Items : Object.values(s.saveData.Items || {})).reduce((n, t) => n + (Number(t.ID) === 2601 ? Number(t.Num) || 0 : 0), 0);
            $('Bag').textContent = bag.toLocaleString() + ' 丹';
            $('Summary').textContent = `${entry.tag} · ${entry.role.Name || '无名'} · ${ZZ_DATA[raw.zizhi]?.zz_name || ZZ_DATA[raw.zizhi]?.name || ['资质平平', '资质过人', '武林俊杰', '绝世奇才', '空前绝后'][raw.zizhi - 150]} · ${raw.zizhi - 150} 槽 · 从导入存档的原始状态起算`;
            renderLocks(); renderTargets(); inspect();
        } catch (error) { raw = null; $('Run').disabled = true; renderLocks(); renderTargets(); status(error.message, true); }
    }
    function refresh() {
        const s = window.state || {}, signature = JSON.stringify([s.saveChannel, s.savePlatform, s.dlcMode]);
        if (source === s.saveData && context === signature) return;
        source = s.saveData; context = signature; invalidate(); raw = null; available = []; assignments.clear();
        $('Role').innerHTML = '<option value="">请选择人物</option>' + (s.saveRoles || []).map(e => `<option value="${esc(e.key)}">${esc(e.tag + ' · ' + (e.role.Name || e.role.ID))}</option>`).join('');
        $('Role').disabled = !s.saveRoles?.length; $('Run').disabled = true;
        $('Bag').textContent = '—'; $('Summary').textContent = s.saveData ? '存档已导入，请明确选择一名人物。' : '请先在首页导入存档，再选择人物。';
        renderLocks(); renderTargets(); status('等待选择人物。');
    }
    function renderResult(result) {
        if (!result) return;
        lastResult = result;
        const routes = result.routes || [];
        $('Export').disabled = !routes.length;
        $('Results').innerHTML = routes.length ? `<p class="w2-muted">${result.proof === 'optimal' ? '本次存档与所选开槽范围内，已证明最低丹耗。' : '已找到 ' + routes.length + ' 条已回放候选，尚未证明最低丹耗。'}</p>` + routes.slice(0, 20).map((r, i) => {
            const remaining = bag - Number(r.totalPills || 0);
            const method = r.kind === 'unified-seed-route' ? `欧气种子统一路线 · ${r.seedMethod || '统一构造'}`
                : r.kind === 'luck-seed-replay' ? `欧气种子路线 · ${r.seedMethod || '种子优化'}`
                : r.kind === 'anchor-replay' ? '锚点路线' : r.kind === 'personal-reference' ? '参考路线回放' : r.kind === 'personal-exact' ? '组合穷举' : (r.strategyLabel || '分级战术搜索');
            return `<details class="w2-route" ${i === 0 ? 'open' : ''}><summary><strong>路线 ${i + 1} · ${Number(r.totalPills).toLocaleString()} 丹</strong><span>${esc(method)} · ${Number(r.totalWashes)} 次洗脉 · ${remaining < 0 ? '缺' + -remaining : '余' + remaining} 丹</span></summary><p>最终天赋：${esc((r.finalTalents || []).map(t => t.name || name(t.id)).join('、'))}</p><div class="w2-table"><table><thead><tr><th>步骤</th><th>操作与核对</th><th>本步丹耗</th><th>累计丹耗</th><th>剩余丹数</th></tr></thead><tbody>${(r.steps || []).map((step, n) => `<tr><td>${n + 1}</td><td><strong>${esc(step.label)}</strong><p>${esc(step.detail)}</p><small>${esc((step.after?.talents || []).map(t => (t.name || name(t.id)) + (t.locked ? '（锁）' : '')).join('、'))}</small></td><td>${Number(step.pills || 0)}</td><td>${Number(step.cumulativePills || 0)}</td><td>${bag - Number(step.cumulativePills || 0)}</td></tr>`).join('')}</tbody></table></div></details>`;
        }).join('') : `<div class="ai-result-empty">${esc(result.noResultReason || '本轮搜索暂未找到路线，可以增加耗丹上限或调整目标。')}</div>`;
    }
    function run() {
        refresh();
        if (!raw || running) return;
        try {
            const budget = Number($('Budget').value);
            if (!Number.isInteger(budget) || budget < 0 || budget > 20000) throw new Error('耗丹上限须为 0–20000 的整数。');
            const selection = AutoWash2Model.targets(raw, assignments, TALENT_DATA);
            const previous = usingPreviousStrategy();
            const mode = $('Depth').value;
            if (previous) AutoWash2Model.combinations(selection);
            invalidate();
            running = true; $('Run').disabled = true; $('Stop').hidden = false;
            const id = ++request, started = Date.now(), input = {initialState: clone(raw), ...selection,
                bagPills: bag, hasBagPills: true, dlcMode: false,
                options: {maxTotalPills: budget, maxStoredStates: 500000}};
            status('正在启动本地路线搜索…');
            const w = makeWorker(previous ? 'personal_wash_depth_worker.js' : 'personal_wash_worker.js');
            if (previous) {
                input.options.searchPolicy = mode === 'timed' ? 'full' : 'depth';
                input.options.depthLevel = Number(mode.split('-')[1]) || 0;
            } else {
                Object.assign(input.options, {depthLevel:Number(mode), strategyFirst:mode !== '0',
                    maxZi:Number($('Slots').value) ? 154 : raw.zizhi, referenceText});
                dbName = 'personal-wash-' + crypto.randomUUID();
                $('Pause').hidden = false;
                $('Pause').disabled = false;
                $('Pause').textContent = '暂停';
            }
            w.onmessage = ({data}) => {
                if (data.requestId !== id || request !== id) return;
                if (data.type === 'progress') status(`${data.progress?.message || '搜索中…'} · ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
                if (data.type === 'candidate') renderResult(data.result);
                if (data.type === 'phase') { $('Skip').hidden = data.phase !== 'strategy'; $('Skip').disabled = false; }
                if (data.type === 'paused' || data.type === 'resumed') {
                    paused = data.type === 'paused'; $('Pause').disabled = false;
                    $('Pause').textContent = paused ? '继续' : '暂停';
                    status(paused ? '已暂停，继续后从当前位置搜索。关闭页面将结束本轮。' : '已继续搜索。');
                }
                if (data.type === 'error') { stop(); status(data.error, true); }
                if (data.type === 'result') { renderResult(data.result); stop(); status(data.result.proof
                    ? (data.result.proof === 'optimal' ? '预算内验证完成，已证最低丹耗。' : '已证当前预算与开槽范围内无解。')
                    : `本轮搜索${data.result?.limited ? '已达计算上限' : '完成'} · ${((Date.now() - started) / 1000).toFixed(1)} 秒。${data.result?.routes?.length ? '可展开查看操作路线。' : '本轮未找到不代表不存在可行路线。'}`); }
            };
            w.postMessage({type: 'search', requestId: id, input, dbName});
        } catch (error) { stop(); status(error.message, true); }
    }
    $('Slots').addEventListener('change', invalidate);
    $('Pause').addEventListener('click', () => {
        $('Pause').disabled = true;
        worker?.postMessage({type:paused ? 'resume' : 'pause', requestId:request});
    });
    $('Skip').addEventListener('click', () => {
        $('Skip').disabled = true;
        worker?.postMessage({type:'skip',requestId:request});
    });
    $('Forget').addEventListener('click', () => {
        refVersion++; referenceText = ''; $('Reference').value = ''; $('Forget').hidden = true; invalidate();
    });
    $('Reference').addEventListener('change', async () => {
        const version = ++refVersion, file = $('Reference').files[0];
        invalidate(); referenceText = ''; $('Forget').hidden = !file;
        if (!file) return;
        try {
            if (file.size > 1024 * 1024) throw Error('参考路线文件超过 1 MB');
            $('Run').disabled = true;
            const content = await file.text();
            if (version !== refVersion) return;
            referenceText = content; invalidate(); status('已载入参考路线，开始时将在当前存档回放。');
        } catch (error) {
            if (version !== refVersion) return;
            $('Reference').value = ''; $('Forget').hidden = true; invalidate(); status(error.message,true);
        }
    });
    $('Role').addEventListener('change', () => { assignments.clear(); chooseRole(); });
    $('Vip').addEventListener('change', chooseRole);
    $('Budget').addEventListener('input', () => { invalidate(); status('耗丹上限已修改，请重新规划。'); });
    $('Depth').addEventListener('change', () => {
        invalidate();
        const previous = usingPreviousStrategy();
        $('Slots').disabled = $('Reference').disabled = previous;
        status(previous ? '旧版策略自行选择开槽时机，可停止并导出候选。' : '搜索方式已修改，请重新规划。');
    });
    $('Filter').addEventListener('input', renderTargets);
    $('Targets').addEventListener('click', event => {
        const button = event.target.closest('[data-id]'); if (!button || button.disabled) return;
        invalidate(); const id = Number(button.dataset.id), group = Number($('Group').value);
        if (assignments.get(id) === group) assignments.delete(id); else assignments.set(id, group);
        renderTargets();
    });
    $('Locks').addEventListener('click', event => {
        const button = event.target.closest('[data-index]'); if (!button || !raw) return;
        invalidate(); const talent = raw.talents[Number(button.dataset.index)]; talent.locked = !talent.locked;
        renderLocks(); renderTargets();
    });
    $('Preset').addEventListener('click', () => {
        if (![271, 272, 250].every(id => available.includes(id))) { status('当前人物无法选择完整的金顶混组合，请检查 VIP 和人物条件。', true); return; }
        invalidate(); assignments = new Map([271, 272, 250].map(id => [id, -1])); renderTargets();
    });
    $('Clear').addEventListener('click', () => { invalidate(); assignments.clear(); renderTargets(); });
    $('Run').addEventListener('click', run);
    $('Stop').addEventListener('click', () => {
        const best = lastResult?.routes?.[0];
        stop(best ? '已停止，保留 ' + best.totalPills + ' 丹候选，可导出。最低丹耗尚未证实。'
            : '已停止，尚未找到候选。当前预算内是否有解仍待验证。');
    });
    $('Export').addEventListener('click', () => {
        if (!lastResult?.routes?.length) return;
        const text = lastResult.routes.map((r, i) => `路线 ${i + 1}：${r.totalPills} 丹\n` + r.steps.map((s, n) => `${n + 1}. ${s.label}：${s.detail}（累计 ${s.cumulativePills || 0} 丹，剩余 ${bag - Number(s.cumulativePills || 0)} 丹）`).join('\n')).join('\n\n');
        const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
        const a = document.createElement('a'); a.href = url; a.download = '自动模拟（自用）_路线.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    refresh();
    const watch = setInterval(refresh, 500);
    window.addEventListener('pagehide', () => { clearInterval(watch); stop(); });
})();
