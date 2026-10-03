(function () {
  'use strict';

  var STORE_KEY = 'aiCounselor.v1';
  // 危機字眼清單。ai-counselor-worker/worker.js 裡也有一份同樣的，修改時請兩邊一起改。
  var CRISIS_RE = /想死|自殺|輕生|不想活|結束生命|結束自己|傷害自己|自殘|割腕|跳樓|活不下去|了結|想消失|不想存在|不想醒來|活著(好累|沒意義|沒有意義|沒意思)|消失在這個世界/;
  var REFLECTS = [
    '謝謝你願意說出來。聽起來是「{t}」，這對你一定不輕鬆。',
    '我聽到了：「{t}」。這樣的感受是可以被理解的。',
    '嗯，「{t}」。謝謝你信任地告訴我。'
  ];

  var $ = function (s) { return document.querySelector(s); };
  var views = { home: $('#home'), chat: $('#chat'), result: $('#result') };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = null;   // { topicId, nodeId, answers, tips, log, done }
  var busy = false;
  var session = 0;    // 離開對話畫面時 +1，讓還在跑的舊對話自動停止

  /* ---------- 儲存（localStorage 可能被封鎖，所以都包 try/catch） ---------- */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function wipe() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 忽略 */ }
    state = null;
  }

  /* ---------- 小工具 ---------- */
  function topicById(id) {
    return TOPICS.filter(function (t) { return t.id === id; })[0];
  }
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, reduceMotion ? 0 : ms); });
  }
  function clip(text, n) {
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n) + '…' : text;
  }
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  function renderHotlines(ul) {
    ul.textContent = '';
    HOTLINES.forEach(function (h) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = 'tel:' + h.number.split(' ')[0];
      a.textContent = h.number;
      a.className = 'num';
      var name = document.createElement('span');
      name.className = 'hl-name';
      name.textContent = h.name;
      var note = document.createElement('span');
      note.className = 'hl-note';
      note.textContent = h.note;
      li.appendChild(a); li.appendChild(name); li.appendChild(note);
      ul.appendChild(li);
    });
  }

  /* ---------- 諮商師：決定「說什麼、下一步去哪」 ----------
   * 這是整個網站唯一需要替換的「大腦」。
   * 現在用腳本（scripts.js）回應；日後要接真正的 AI，
   * 只要把這個函式改成呼叫 AI 服務，回傳同樣格式即可：
   *   { lines: ['要說的話', ...], nextId: '下一個節點 id' }
   */
  var Counselor = {
    step: function (topic, st, answer) {
      var node = topic.nodes[st.nodeId];
      if (answer.type === 'choice') {
        var c = answer.choice;
        return { lines: c.reply ? [c.reply] : [], nextId: c.next };
      }
      var t = clip(answer.text, 36);
      var line = REFLECTS[st.answers.length % REFLECTS.length].replace('{t}', t);
      return { lines: [line], nextId: node.next };
    }
  };

  /* ---------- 對話畫面 ---------- */
  var logEl = $('#log');
  var choicesEl = $('#choices');
  var form = $('#textForm');
  var input = $('#textInput');
  var skipBtn = $('#skipBtn');
  var summarizeBtn = $('#summarizeBtn');

  function addBubble(role, text) {
    var div = document.createElement('div');
    div.className = 'bubble ' + role;
    div.textContent = text;
    logEl.appendChild(div);
    div.scrollIntoView({ block: 'end', behavior: reduceMotion ? 'auto' : 'smooth' });
    return div;
  }

  async function counselorSay(lines) {
    var mine = session;
    for (var i = 0; i < lines.length; i++) {
      var dots = document.createElement('div');
      dots.className = 'bubble counselor typing';
      dots.setAttribute('aria-hidden', 'true');
      dots.innerHTML = '<span></span><span></span><span></span>';
      logEl.appendChild(dots);
      dots.scrollIntoView({ block: 'end' });
      await sleep(500 + Math.min(lines[i].length * 18, 900));
      dots.remove();
      if (mine !== session) return false;
      addBubble('counselor', lines[i]);
      state.log.push({ role: 'counselor', text: lines[i] });
      save();
      await sleep(250);
      if (mine !== session) return false;
    }
    return true;
  }

  function setControls(enabled) {
    choicesEl.querySelectorAll('button').forEach(function (b) { b.disabled = !enabled; });
    input.disabled = !enabled;
    form.querySelector('button[type=submit]').disabled = !enabled;
    skipBtn.disabled = !enabled;
    summarizeBtn.disabled = !enabled;
  }

  /* ---------- AI 模式（經由中轉 Worker 呼叫 Gemini） ---------- */
  function aiConfigured() {
    return !!(window.AI_CONFIG && window.AI_CONFIG.endpoint);
  }
  function isAi() { return !!state && state.mode === 'ai'; }
  function userTurns() {
    return state.log.filter(function (m) { return m.role === 'user'; }).length;
  }

  // 呼叫中轉 Worker。mode 為 'chat'（回話）或 'summary'（整理摘要）
  function callAI(mode) {
    var msgs = state.log.slice(-30).map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', text: m.text };
    });
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 40000);
    return fetch(window.AI_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode, topic: topicById(state.topicId).title, messages: msgs }),
      signal: ctrl.signal
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.error) {
          var e = new Error(d.error || ('HTTP ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    }).finally(function () { clearTimeout(timer); });
  }

  function showTyping() {
    var dots = document.createElement('div');
    dots.className = 'bubble counselor typing';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span></span><span></span><span></span>';
    logEl.appendChild(dots);
    dots.scrollIntoView({ block: 'end' });
    return dots;
  }

  // 對話區裡的提示訊息，可附上按鈕（例如「重試」）
  function addNotice(text, actions) {
    var div = document.createElement('div');
    div.className = 'bubble notice';
    var p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    var row = document.createElement('div');
    row.className = 'row wrap';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = a.label;
      b.addEventListener('click', function () { div.remove(); a.run(); });
      row.appendChild(b);
    });
    div.appendChild(row);
    logEl.appendChild(div);
    div.scrollIntoView({ block: 'end' });
  }

  function aiErrorText(err) {
    if (err && err.status === 429) return '現在使用的人比較多，或今天的免費額度用完了，請稍後再試。';
    if (err && err.name === 'AbortError') return 'AI 回應太久了，連線可能不穩。';
    return 'AI 暫時沒有回應。';
  }

  function renderAiControls() {
    choicesEl.textContent = '';
    var topic = topicById(state.topicId);
    var first = userTurns() === 0;
    if (first && topic.nodes[topic.start].choices) {
      topic.nodes[topic.start].choices.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = c.label;
        b.addEventListener('click', function () { handleAiAnswer(c.label); });
        choicesEl.appendChild(b);
      });
    }
    input.placeholder = first ? '或是用自己的話說說看…' : '想說什麼都可以，一句話也行…';
    skipBtn.hidden = true;
    summarizeBtn.hidden = userTurns() < 3;
    input.value = '';
    setControls(true);
  }

  async function handleAiAnswer(text) {
    if (busy) return;
    busy = true;
    setControls(false);
    var mine = session;
    addBubble('user', text);
    state.log.push({ role: 'user', text: text });
    save();
    if (CRISIS_RE.test(text)) {
      await openDialog($('#crisisDialog'));
      if (mine !== session) { busy = false; return; }
    }
    await aiTurn(mine);
  }

  async function aiTurn(mine) {
    busy = true;
    setControls(false);
    var typing = showTyping();
    try {
      var d = await callAI('chat');
      typing.remove();
      if (mine !== session) { busy = false; return; }
      var reply = String(d.text || '').trim();
      if (!reply) throw new Error('empty');
      addBubble('counselor', reply);
      state.log.push({ role: 'counselor', text: reply });
      save();
      busy = false;
      renderAiControls();
    } catch (err) {
      typing.remove();
      if (mine !== session) { busy = false; return; }
      busy = false;
      addNotice(aiErrorText(err), [
        { label: '重試', run: function () { aiTurn(session); } },
        { label: '改用引導式問答（會重新開始）', run: function () { startTopic(state.topicId, true); } }
      ]);
    }
  }

  async function summarizeWithAi() {
    if (busy) return;
    busy = true;
    setControls(false);
    var mine = session;
    var typing = showTyping();
    try {
      var d = await callAI('summary');
      typing.remove();
      if (mine !== session) { busy = false; return; }
      if (!d.summary || typeof d.summary !== 'object') throw new Error('bad summary');
      state.aiSummary = d.summary;
      state.done = true;
      save();
      busy = false;
      showResult();
    } catch (err) {
      typing.remove();
      if (mine !== session) { busy = false; return; }
      busy = false;
      renderAiControls();
      addNotice('整理失敗：' + aiErrorText(err), [
        { label: '再試一次', run: summarizeWithAi }
      ]);
    }
  }

  function renderControls(node) {
    choicesEl.textContent = '';
    var hasChoices = !!node.choices;
    if (hasChoices) {
      node.choices.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = c.label;
        b.addEventListener('click', function () { handleAnswer({ type: 'choice', choice: c }); });
        choicesEl.appendChild(b);
      });
    }
    input.placeholder = hasChoices ? '或是用自己的話說說看…' : '想到什麼就寫什麼，一句話也可以…';
    skipBtn.hidden = hasChoices;
    input.value = '';
    setControls(true);
    if (!hasChoices) input.focus({ preventScroll: true });
  }

  async function enterNode(id, silent) {
    var mine = session;
    var topic = topicById(state.topicId);
    var node = topic.nodes[id];
    state.nodeId = id;
    if (!silent && !(await counselorSay(node.say))) return;
    save();
    if (isAi()) { renderAiControls(); return; }
    if (node.end) {
      state.done = true;
      save();
      await sleep(400);
      if (mine !== session) return;
      showResult();
      return;
    }
    renderControls(node);
  }

  async function handleAnswer(answer) {
    if (busy) return;
    busy = true;
    setControls(false);
    var mine = session;
    var topic = topicById(state.topicId);
    var node = topic.nodes[state.nodeId];
    var label = answer.type === 'choice' ? answer.choice.label : answer.text;

    addBubble('user', label);
    state.log.push({ role: 'user', text: label });

    var isCrisis = CRISIS_RE.test(label) || (answer.choice && answer.choice.crisis);
    var gentle = [];
    if (isCrisis) {
      await openDialog($('#crisisDialog'));
      if (mine !== session) { busy = false; return; }
      gentle = ['謝謝你告訴我這些。上面的專線隨時都在，我們也可以繼續慢慢聊。'];
    }

    if (answer.type === 'choice') {
      state.answers.push({ slot: node.slot, text: label });
      if (answer.choice.tip) state.tips.push(answer.choice.tip);
    } else if (!answer.skipped) {
      state.answers.push({ slot: node.slot, text: label });
    }

    var res = Counselor.step(topic, state, answer);
    var ok = await counselorSay(gentle.concat(res.lines));
    busy = false;
    if (!ok || mine !== session) return;
    await enterNode(res.nextId, false);
  }

  function openDialog(dlg) {
    return new Promise(function (resolve) {
      var finished = false;
      var timer;
      // 同時監聽 close 事件與輪詢 open 狀態，避免個別瀏覽器漏發事件而讓對話卡住
      function done() {
        if (finished) return;
        finished = true;
        clearInterval(timer);
        dlg.removeEventListener('close', done);
        resolve(dlg.returnValue);
      }
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else { dlg.setAttribute('open', ''); }
      timer = setInterval(function () { if (!dlg.open) done(); }, 200);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (isAi()) handleAiAnswer(text);
    else handleAnswer({ type: 'text', text: text });
  });
  summarizeBtn.addEventListener('click', summarizeWithAi);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });
  skipBtn.addEventListener('click', function () {
    if (busy) return;
    busy = true;
    setControls(false);
    var topic = topicById(state.topicId);
    var node = topic.nodes[state.nodeId];
    addBubble('user', '（先跳過）');
    state.log.push({ role: 'user', text: '（先跳過）' });
    counselorSay(['沒關係，不想說的我們就先放著。']).then(function (ok) {
      busy = false;
      return ok ? enterNode(node.next, false) : null;
    });
  });

  /* ---------- 開始／繼續／重來 ---------- */
  async function startTopic(id, forceScript) {
    var topic = topicById(id);
    state = {
      topicId: id, nodeId: topic.start, answers: [], tips: [], log: [], done: false,
      mode: aiConfigured() && !forceScript ? 'ai' : 'script'
    };
    save();
    openChat(topic);
    await enterNode(topic.start, false);
  }

  function openChat(topic) {
    session++;
    $('#chatTitle').textContent = topic.title;
    logEl.textContent = '';
    choicesEl.textContent = '';
    summarizeBtn.hidden = true;
    $('#aiBanner').hidden = !isAi();
    show('chat');
  }

  function resume(saved) {
    state = saved;
    var topic = topicById(state.topicId);
    if (!topic || !topic.nodes[state.nodeId]) { wipe(); showHome(); return; }
    openChat(topic);
    state.log.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'bubble ' + m.role;
      d.textContent = m.text;
      logEl.appendChild(d);
    });
    if (state.done) { showResult(); return; }
    enterNode(state.nodeId, true);
  }

  /* ---------- 摘要 ---------- */
  function buildSummary() {
    var topic = topicById(state.topicId);
    var groups = {};
    var tips;
    if (state.aiSummary) {
      // AI 整理的內容：只接受字串陣列，避免奇怪的格式弄壞畫面
      var clean = function (v) {
        return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string' && x.trim(); })
          .slice(0, 5).map(function (x) { return x.trim().slice(0, 120); });
      };
      Object.keys(SLOT_LABELS).forEach(function (slot) { groups[slot] = clean(state.aiSummary[slot]); });
      tips = clean(state.aiSummary.tips);
    } else {
      state.answers.forEach(function (a) {
        (groups[a.slot] = groups[a.slot] || []).push(a.text);
      });
      tips = state.tips.filter(function (t, i, arr) { return arr.indexOf(t) === i; });
    }
    for (var i = 0; tips.length < 2 && i < GENERIC_TIPS.length; i++) {
      if (tips.indexOf(GENERIC_TIPS[i]) === -1) tips.push(GENERIC_TIPS[i]);
    }
    return { topic: topic, groups: groups, tips: tips };
  }

  function showResult() {
    var s = buildSummary();
    $('#resultTopic').textContent = '主題：' + s.topic.title;
    var body = $('#resultBody');
    body.textContent = '';

    Object.keys(SLOT_LABELS).forEach(function (slot) {
      var items = s.groups[slot];
      if (!items || !items.length) return;
      body.appendChild(card(SLOT_LABELS[slot], items));
    });
    body.appendChild(card('可以試試的小步驟', s.tips, true));

    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = '這份整理只是幫你看見自己，不是診斷。如果這些感受持續很久，請考慮找專業的心理師聊聊。';
    body.appendChild(note);
    show('result');
  }

  function card(title, items, ordered) {
    var sec = document.createElement('section');
    sec.className = 'card';
    var h = document.createElement('h3');
    h.textContent = title;
    var list = document.createElement(ordered ? 'ol' : 'ul');
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      list.appendChild(li);
    });
    sec.appendChild(h);
    sec.appendChild(list);
    return sec;
  }

  function summaryText() {
    var s = buildSummary();
    var out = ['【心語小屋】' + s.topic.title, ''];
    Object.keys(SLOT_LABELS).forEach(function (slot) {
      var items = s.groups[slot];
      if (!items || !items.length) return;
      out.push('■ ' + SLOT_LABELS[slot]);
      items.forEach(function (t) { out.push('・' + t); });
      out.push('');
    });
    out.push('■ 可以試試的小步驟');
    s.tips.forEach(function (t, i) { out.push((i + 1) + '. ' + t); });
    out.push('', '（自我整理工具，不是診斷。需要協助請撥 1925 安心專線或 1995 生命線）');
    return out.join('\n');
  }

  function setStatus(msg) {
    var el = $('#status');
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 4000);
  }

  $('#copyBtn').addEventListener('click', function () {
    var text = summaryText();
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      ta.remove();
      setStatus(ok ? '已複製。' : '複製失敗，請改用「下載成文字檔」。');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { setStatus('已複製。'); }, fallback);
    } else { fallback(); }
  });

  $('#downloadBtn').addEventListener('click', function () {
    var blob = new Blob([summaryText()], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '心語小屋-整理.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('已下載。');
  });

  /* ---------- 首頁 ---------- */
  function renderTopics() {
    var grid = $('#topicGrid');
    grid.textContent = '';
    TOPICS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'topic-row reveal';
      var img = document.createElement('img');
      img.src = t.icon; img.alt = ''; img.width = 64; img.height = 64;
      var box = document.createElement('div');
      var h = document.createElement('h3');
      h.textContent = t.title;
      var p = document.createElement('p');
      p.textContent = t.desc;
      box.appendChild(h); box.appendChild(p);
      var arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      b.appendChild(img); b.appendChild(box); b.appendChild(arrow);
      b.addEventListener('click', function () { startTopic(t.id); });
      grid.appendChild(b);
    });
  }

  function showHome() {
    session++;
    busy = false;
    var saved = load();
    var box = $('#resumeBox');
    var topic = saved && topicById(saved.topicId);
    if (topic) {
      $('#resumeTitle').textContent = topic.title + (saved.done ? '（已完成，可查看摘要）' : '');
      $('#resumeBtn').textContent = saved.done ? '查看上次的摘要' : '繼續上次的對話';
      box.hidden = false;
    } else {
      box.hidden = true;
    }
    show('home');
  }

  $('#resumeBtn').addEventListener('click', function () { resume(load()); });
  $('#discardBtn').addEventListener('click', function () { wipe(); showHome(); });
  $('#brandBtn').addEventListener('click', function () { if (state) save(); showHome(); });
  $('#backBtn').addEventListener('click', function () { showHome(); });
  $('#againBtn').addEventListener('click', function () { showHome(); });
  $('#clearBtn').addEventListener('click', function () { wipe(); showHome(); });
  $('#restartBtn').addEventListener('click', function () {
    if (busy) return;
    if (window.confirm('要清掉目前的對話，重新開始這個主題嗎？')) startTopic(state.topicId);
  });
  $('#helpBtn').addEventListener('click', function () { $('#helpDialog').showModal(); });

  $('#privacyNote').textContent = aiConfigured()
    ? '【DEMO 展示站】AI 模式下，你輸入的內容會經由中轉服務送到 Google Gemini 免費版處理，Google 可能用來改進產品，也可能有人工審閱。請不要輸入真實姓名、聯絡方式或任何敏感隱私，用虛構的情境來體驗就好。'
    : '你說的內容只會留在這台裝置的瀏覽器，不會傳到任何伺服器。';

  renderHotlines($('#footerHotlines'));
  renderHotlines($('#crisisHotlines'));
  renderHotlines($('#helpHotlines'));
  renderTopics();
  showHome();

  // 捲動到畫面內時才淡入。沒有 IntersectionObserver 或使用者要求減少動態時，直接全部顯示
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    document.documentElement.classList.add('js');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.2 });
    items.forEach(function (el) { io.observe(el); });
  }
  initReveal();
})();
