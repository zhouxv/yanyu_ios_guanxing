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
    let phase = 'idle', progressTitle = '', progressDetail = '';
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
                '先按所选层数寻找路线。策略结束后可继续穷举，检查同一存档有没有更省丹的走法。';
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
                    <option value="1">策略 3 层</option><option value="2" selected>策略 5 层</option>
                    <option value="3">策略 7 层</option><option value="0">直接穷举</option>
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
        <label class="wp-auto"><input type="checkbox" id="wpAutoExact">策略结束后自动穷举</label>
        <div id="wpStatusBox" class="wp-status-box" data-state="idle" aria-label="搜索状态">
            <div><strong id="wpStatus" role="status">等待选择人物</strong><p id="wpDetail" hidden></p></div>
            <div class="wp-best" hidden id="wpBestBox"><span>当前最低丹耗</span><strong id="wpBest"></strong></div>
        </div>
        <div class="w2-actions"><button id="wpExact" class="btn btn-ai-predict" hidden>开始穷举</button>
            <button id="wpRun" class="btn btn-ai-predict" disabled>开始策略搜索</button>
            <button id="wpPause" class="btn btn-reset" hidden>暂停</button><button id="wpStop" class="btn btn-reset" hidden>停止搜索</button>
            <button id="wpExport" class="btn btn-reset" disabled>导出路线</button></div>
        <div id="wpResults"><div class="ai-result-empty">选择人物及目标后开始规划。</div></div>`;

    function status(text, error = false, detail = '') {
        if ($('Status').textContent !== text) $('Status').textContent = text;
        $('Status').classList.toggle('w2-error', error);
        $('StatusBox').dataset.state = error ? 'error' : phase;
        $('Detail').textContent = detail;
        $('Detail').hidden = !detail;
    }
    function showProgress(title, detail) {
        progressTitle = title;
        progressDetail = detail;
        status(paused ? '已暂停 · ' + title : title,false,detail);
    }
    function stop(text) {
        request++;
        worker?.terminate(); worker = null; running = false;
        paused = false;
        phase = 'idle';
        $('Pause').hidden = $('Exact').hidden = true;
        $('Exact').disabled = false;
        $('AutoExact').disabled = $('Depth').value === '0';
        $('Run').textContent = $('Depth').value === '0' ? '开始穷举' : '开始策略搜索';
        if (dbName && window.indexedDB) indexedDB.deleteDatabase(dbName);
        dbName = null;
        $('Stop').hidden = true;
        $('Run').disabled = !raw || !available.length;
        if (text) status(text);
    }
    function invalidate() {
        stop(); lastResult = null;
        $('BestBox').hidden = true;
        status('等待开始',false,'搜索条件已更新。');
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
    function makeWorker() {
        if (worker) return worker;
        worker = new Worker(new URL('personal_wash_worker.js', workerBase));
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
        $('Best').textContent = routes.length ? routes[0].totalPills.toLocaleString() + ' 丹' : '暂无路线';
        $('Export').disabled = !routes.length;
        $('Results').innerHTML = routes.length ? `<p class="w2-muted">${result.proof === 'optimal' ? '本次存档与所选开槽范围内，已证明最低丹耗。' : '已找到 ' + routes.length + ' 条已回放候选，尚未证明最低丹耗。'}</p>` + routes.slice(0, 20).map((r, i) => {
            const remaining = bag - Number(r.totalPills || 0);
            const method = r.kind === 'personal-start' ? '存档起点' : r.kind === 'personal-reference' ? '参考路线回放'
                : r.kind === 'personal-exact' ? '组合穷举' : r.strategyLabel || '策略搜索';
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
            const mode = $('Depth').value;
            invalidate();
            running = true; $('Run').disabled = true; $('Stop').hidden = false;
            const id = ++request, input = {initialState: clone(raw), ...selection,
                bagPills: bag, hasBagPills: true, dlcMode: false,
                options: {maxTotalPills:budget,depthLevel:Number(mode),strategyFirst:mode !== '0',
                    autoExact:$('AutoExact').checked,maxZi:Number($('Slots').value) ? 154 : raw.zizhi,referenceText}};
            const w = makeWorker();
            dbName = 'personal-wash-' + crypto.randomUUID();
            $('AutoExact').disabled = true;
            $('BestBox').hidden = false;
            $('Best').textContent = '暂无路线';
            $('Results').innerHTML = '';
            phase = 'starting';
            showProgress('正在准备搜索', referenceText ? '正在回放参考路线。' : '正在读取存档起点。');
            function exactScope() {
                const best = lastResult?.routes?.[0]?.totalPills;
                if (best === 0) return '已取得零丹路线，正在确认最低丹耗。';
                return best == null ? '搜索上限 ' + budget.toLocaleString() + ' 丹。'
                    : '已有 ' + best.toLocaleString() + ' 丹路线，只检查 ' + (best-1).toLocaleString() + ' 丹以内的走法。';
            }
            w.onmessage = ({data}) => {
                if (data.requestId !== id || request !== id) return;
                if (data.type === 'progress') {
                    const p = data.progress;
                    if (p.layer != null) showProgress('策略搜索中 · 第 ' + p.layer + ' / ' + p.layers + ' 层',
                        '第 ' + p.pass + ' / ' + p.passes + ' 轮 · ' + p.method + ' · 本层已试洗 ' + p.washes.toLocaleString() + ' 次');
                    else if (p.expanded != null) showProgress('穷举中 · 正在检查 ' + p.cost.toLocaleString() + ' 丹的走法',
                        '已展开 ' + p.expanded.toLocaleString() + ' 个状态。' + exactScope());
                    else showProgress(progressTitle,p.message);
                }
                if (data.type === 'candidate') renderResult(data.result);
                if (data.type === 'phase') {
                    phase = data.phase;
                    const waiting = phase === 'awaitingExact';
                    running = !waiting;
                    $('Pause').hidden = $('Stop').hidden = waiting;
                    $('Pause').disabled = false;
                    $('Pause').textContent = '暂停';
                    $('Run').disabled = !waiting;
                    $('Run').textContent = waiting ? '重新搜索策略' : (mode === '0' ? '开始穷举' : '开始策略搜索');
                    $('Exact').hidden = !waiting;
                    $('Exact').disabled = false;
                    if (waiting) {
                        const hint = lastResult?.routes?.length ? '可导出当前路线，或点「开始穷举」检查有没有更省的走法。'
                            : '尚未找到路线。点「开始穷举」可检查当前预算内的所有组合。';
                        status('策略已结束 · 等待手动穷举',false,(data.reason || '') + hint);
                    } else if (phase === 'exact') showProgress('正在穷举',exactScope());
                    else showProgress('正在搜索策略',input.options.autoExact ? '结束后将自动穷举。' : '策略结束后由你决定是否穷举。');
                }
                if (data.type === 'paused' || data.type === 'resumed') {
                    paused = data.type === 'paused'; $('Pause').disabled = false;
                    $('Pause').textContent = paused ? '继续' : '暂停';
                    showProgress(progressTitle,progressDetail);
                }
                if (data.type === 'error') { stop(); status(data.error, true); }
                if (data.type === 'result') {
                    renderResult(data.result); stop(); phase = 'done';
                    status(data.result.proof === 'optimal' ? '穷举完成 · 已证最低丹耗' : '穷举完成 · 预算内无解',
                        false,'已检查本次存档、目标和开槽范围。');
                }
            };
            w.postMessage({type: 'search', requestId: id, input, dbName});
        } catch (error) { stop(); status(error.message, true); }
    }
    $('Slots').addEventListener('change', invalidate);
    $('Pause').addEventListener('click', () => {
        $('Pause').disabled = true;
        worker?.postMessage({type:paused ? 'resume' : 'pause', requestId:request});
    });
    $('Exact').addEventListener('click', () => {
        refresh();
        if (phase !== 'awaitingExact' || !worker) return;
        $('Exact').disabled = $('Run').disabled = true;
        worker.postMessage({type:'exact',requestId:request});
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
    $('Depth').addEventListener('change', invalidate);
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
