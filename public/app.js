// ---- nav switching ----
document.querySelectorAll('.nav-item').forEach(function(el){
  el.addEventListener('click', function(){
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    el.classList.add('active');
    document.getElementById('view-' + el.dataset.view).classList.add('active');
  });
});

// ---- drawer: shared by "create" and "edit" ----
var overlay = document.getElementById('overlay'), drawer = document.getElementById('drawer');
var statusLabel = {0:'0. Backlog', 1:'1. Ready for Dev', 2:'2. In Test', 3:'3. Ready for Staging', 4:'4. Done'};
var phaseLabel = {P1:'P1: Lived 10/08', P2:'P2: Rollout 01/09', P3:'P3: Convert 01/11', P4:'P4: Booming 01/01'};
var sprintRangeLabel = {S14:'S14 (20/07–31/07)', S15:'S15 (03/08–14/08)', S16:'S16 (17/08–28/08)', S17:'S17 (31/08–11/09)'};

// dotted status string (from the real API) -> numeric suffix used by the
// existing .pill.st-N / .bar.st-N CSS classes and the statusLabel map above.
var STATUS_ORDER = ['0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'];
function statusDotToNum(status){ return STATUS_ORDER.indexOf(status); }

function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function setSelect(id, text){
  var el = document.getElementById(id);
  if(!text){ return; }
  for(var i=0;i<el.options.length;i++){ if(el.options[i].text === text){ el.selectedIndex = i; return; } }
}

function openDrawer(mode, t){
  t = t || {};
  var isEdit = mode === 'edit';
  document.getElementById('drawerTitle').textContent = isEdit ? 'Sửa nghiệp vụ' : 'Nghiệp vụ mới';
  document.getElementById('drawerSub').textContent = isEdit
    ? 'Cập nhật thông tin cho nghiệp vụ này'
    : 'Các trường giữ nguyên như sheet Nghiệp vụ hiện tại';
  document.getElementById('saveBtn').textContent = isEdit ? 'Lưu thay đổi' : 'Lưu nghiệp vụ';
  document.getElementById('f-name').value = t.name || '';
  setSelect('f-cat', t.cat);
  setSelect('f-platform', t.platform);
  setSelect('f-phase', t.phase ? phaseLabel[t.phase] : null);
  var sp = t.sprint ? sprintRangeLabel[t.sprint] : null;
  setSelect('f-sprint', sp);
  setSelect('f-status', t.st !== undefined ? statusLabel[t.st] : null);
  if(t.sprint && sprintOf(t.sprint)){
    var sObj = sprintOf(t.sprint);
    document.getElementById('f-start').value = sObj.start.toISOString().slice(0,10);
    document.getElementById('f-due').value = sObj.end.toISOString().slice(0,10);
  }
  document.getElementById('logField').style.display = isEdit ? 'block' : 'none';
  overlay.classList.add('show'); drawer.classList.add('show');
}

document.getElementById('openDrawer').addEventListener('click', function(){ openDrawer('create'); });
document.getElementById('closeDrawer').addEventListener('click', close);
overlay.addEventListener('click', close);
function close(){ overlay.classList.remove('show'); drawer.classList.remove('show'); }

// ---- shared fetch helper: throws on network failure AND non-2xx responses ----
function fetchJSON(url){
  return fetch(url).then(function(res){
    if (!res.ok) {
      throw new Error(url + ' → HTTP ' + res.status);
    }
    return res.json();
  });
}

// ---- date formatting helpers (API always returns plain 'YYYY-MM-DD' strings) ----
function ddmm(iso){ var p = iso.split('-'); return p[2] + '/' + p[1]; }
function fmtDMY(iso){ var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtRange(startIso, endIso){ return ddmm(startIso) + '–' + ddmm(endIso); }

// ---- roadmap: phase cards + master axis (fetched from /api/phases) ----
function funnelLine(label, count, total){
  if (total === 0) return '<div>' + label + ' <span class="n">–</span></div>';
  if (count === 0 || count === total) return '<div>' + label + ' <span class="n">' + count + '/' + total + '</span></div>';
  var pct = Math.round((count / total) * 1000) / 10;
  return '<div>' + label + ' <span class="n">' + count + '/' + total + ' · ' + pct + '%</span></div>';
}
function analystLine(count, total){
  if (total === 0) return '<div>Analyst <span class="n">–</span></div>';
  return '<div>Analyst <span class="n">' + count + '/' + total + '</span></div>';
}

function isCurrentPhase(phase, allPhases){
  var firstInProgress = allPhases.find(function(p){ return p.pct_complete !== null && p.pct_complete < 100; });
  return firstInProgress ? phase.code === firstInProgress.code : false;
}

function renderPhaseCard(phase, allPhases){
  var card = document.createElement('div');
  card.className = 'phase-card' + (isCurrentPhase(phase, allPhases) ? ' is-current' : '');

  var pctText = phase.pct_complete === null ? '—' : Math.round(phase.pct_complete) + '%';
  var barWidth = phase.pct_complete === null ? 0 : phase.pct_complete;
  var barColor = phase.pct_complete === null
    ? 'transparent'
    : (phase.pct_complete === 100 ? 'var(--green-ink)' : 'var(--accent-ink)');

  var daysText = phase.days_remaining >= 0
    ? 'còn ' + phase.days_remaining + ' ngày'
    : 'đã qua ' + (-phase.days_remaining) + ' ngày';
  var daysHtml = phase.total === 0
    ? daysText + '<br>chưa lên nghiệp vụ'
    : daysText + '<br>' + phase.done_analyst + '/' + phase.total + ' nghiệp vụ';

  card.innerHTML =
    '<div class="phase-name">' + escapeHtml(phase.code) + ' · ' + escapeHtml(phase.name) + '</div>' +
    '<div class="phase-target">Mốc đích ' + fmtDMY(phase.target_date) + '</div>' +
    '<div class="phase-meta">' +
      '<div class="phase-pct">' + pctText + '</div>' +
      '<div class="phase-days">' + daysHtml + '</div>' +
    '</div>' +
    '<div class="stack"><i style="width:' + barWidth + '%; background:' + barColor + ';"></i></div>' +
    '<div class="funnel">' +
      analystLine(phase.done_analyst, phase.total) +
      funnelLine('Dev', phase.done_dev, phase.total) +
      funnelLine('UAT', phase.done_uat, phase.total) +
    '</div>';
  return card;
}

function renderMasterAxis(phases){
  var axis = document.getElementById('masterAxis');
  axis.innerHTML = '';
  var start = new Date('2026-06-01'), end = new Date('2027-01-15');
  var span = end - start;
  function pos(d){ return ((d - start) / span * 100).toFixed(2); }
  function addTick(d, label){
    var p = pos(d);
    var t = document.createElement('div'); t.className='tick'; t.style.left=p+'%'; axis.appendChild(t);
    var lb = document.createElement('div'); lb.className='tick-label'; lb.style.left=p+'%'; lb.textContent=label; axis.appendChild(lb);
  }
  addTick(new Date('2026-06-01'), '06/2026');
  phases.forEach(function(p){
    addTick(new Date(p.target_date), p.code + ' · ' + ddmm(p.target_date));
  });
  // today marker — kept as-is, not derived from API data
  var today = new Date('2026-08-06'), tp = pos(today);
  var tm = document.createElement('div'); tm.className='today-mark'; tm.style.left=tp+'%'; axis.appendChild(tm);
  var td = document.createElement('div'); td.className='today-dot'; td.style.left=tp+'%'; axis.appendChild(td);
  var tl = document.createElement('div'); tl.className='today-label'; tl.style.left=tp+'%'; tl.textContent='HÔM NAY'; axis.appendChild(tl);
}

function loadPhases(){
  var row = document.getElementById('phaseRow');
  return fetchJSON('/api/phases')
    .then(function(phases){
      row.innerHTML = '';
      phases.forEach(function(phase){ row.appendChild(renderPhaseCard(phase, phases)); });
      renderMasterAxis(phases);
    })
    .catch(function(err){
      console.error('Failed to load /api/phases', err);
      row.innerHTML = '<div class="view-sub">Không tải được dữ liệu Phase. Thử tải lại trang.</div>';
    });
}

// ---- sprint view: current + next (fetched from /api/sprints/current-next) ----
function renderSprintPanel(sprint, isCurrent){
  var panel = document.createElement('div');
  panel.className = 'sprint-panel' + (isCurrent ? ' is-current' : '');
  var titleText = isCurrent ? 'Sprint hiện tại' : 'Sprint tiếp theo';

  if (!sprint){
    panel.innerHTML =
      '<div class="sprint-panel-head">' +
        '<div class="sprint-panel-title">' + titleText + '</div>' +
      '</div>' +
      '<div class="sprint-panel-sub">Không có sprint</div>';
    return panel;
  }

  var tasksList = sprint.tasks || [];
  panel.innerHTML =
    '<div class="sprint-panel-head">' +
      '<div class="sprint-panel-title">' + titleText + '</div>' +
      '<div class="sprint-panel-range">' + escapeHtml(sprint.code) + ' (' + fmtRange(sprint.start_date, sprint.end_date) + ')</div>' +
    '</div>' +
    '<div class="sprint-panel-sub">' + tasksList.length + ' nghiệp vụ</div>';

  var listEl = document.createElement('div');
  tasksList.forEach(function(t){
    var n = statusDotToNum(t.status);
    var label = n >= 0 ? statusLabel[n].replace(/^\d\.\s*/, '') : '';
    var item = document.createElement('div'); item.className = 'sprint-task';
    item.innerHTML =
      '<div class="sprint-task-top">' +
        '<div class="sprint-task-name">' + escapeHtml(t.name) + '</div>' +
        '<span class="pill st-' + n + '">' + escapeHtml(label) + '</span>' +
      '</div>' +
      '<div class="card-tags"><span class="tag">' + escapeHtml(t.category) + '</span><span class="tag">' + escapeHtml(t.platform) + '</span></div>';
    item.addEventListener('click', function(){ openDrawer('edit', t); });
    listEl.appendChild(item);
  });
  panel.appendChild(listEl);
  return panel;
}

function loadSprintView(){
  var col = document.getElementById('sprintColumns');
  return fetchJSON('/api/sprints/current-next')
    .then(function(data){
      col.innerHTML = '';
      col.appendChild(renderSprintPanel(data.current, true));
      col.appendChild(renderSprintPanel(data.next, false));
    })
    .catch(function(err){
      console.error('Failed to load /api/sprints/current-next', err);
      col.innerHTML = '<div class="view-sub">Không tải được dữ liệu Sprint. Thử tải lại trang.</div>';
    });
}

loadPhases();
loadSprintView();

// ---- shared data cache: both Timeline and Board read /api/tasks; fetch it once ----
var _tasksPromise = null;
function loadTasks(){
  if (!_tasksPromise) _tasksPromise = fetchJSON('/api/tasks');
  return _tasksPromise;
}
var _sprintsPromise = null;
function loadSprints(){
  if (!_sprintsPromise) _sprintsPromise = fetchJSON('/api/sprints');
  return _sprintsPromise;
}

// ---- timeline / gantt ----
// Effective date range for a task per the hybrid rule: overridden tasks use their
// own start/due dates, otherwise the task inherits its sprint's date range.
// Returns null (task should be skipped from the Gantt) when neither is available.
function effectiveRange(t){
  if (t.date_overridden) {
    if (!t.start_date || !t.due_date) return null;
    return { start: new Date(t.start_date), end: new Date(t.due_date) };
  }
  if (t.sprint_start && t.sprint_end) {
    return { start: new Date(t.sprint_start), end: new Date(t.sprint_end) };
  }
  return null;
}

function renderGantt(tasks, sprints){
  var bandsEl = document.getElementById('sprintBands');
  var body = document.getElementById('ganttBody');
  bandsEl.innerHTML = '';
  body.innerHTML = '';
  var oldOverlay = document.querySelector('.gantt-track-overlay');
  if (oldOverlay) oldOverlay.parentNode.removeChild(oldOverlay);

  if (sprints.length === 0){
    body.innerHTML = '<div class="view-sub">Chưa có sprint nào để hiển thị Timeline.</div>';
    return;
  }

  var axisStart = new Date(sprints[0].start_date);
  var axisEnd = new Date(sprints[sprints.length - 1].end_date);
  var axisSpan = (axisEnd - axisStart) || 1; // guard against a zero-length axis
  function pctPos(d){ return (d - axisStart) / axisSpan * 100; }

  // header bands, sized proportionally along the full min/max sprint date range
  sprints.forEach(function(s){
    var w = (new Date(s.end_date) - new Date(s.start_date)) / axisSpan * 100;
    var band = document.createElement('div');
    band.className = 'sprint-band';
    band.style.width = w + '%';
    band.innerHTML = '<span class="lbl">' + escapeHtml(s.code) + '</span>' + fmtRange(s.start_date, s.end_date);
    bandsEl.appendChild(band);
  });

  // body grouped by category — one .cat-divider per category, one .task-row per task
  var cats = [];
  tasks.forEach(function(t){ if (cats.indexOf(t.category) === -1) cats.push(t.category); });

  cats.forEach(function(cat){
    var group = document.createElement('div'); group.className = 'cat-group';
    var divider = document.createElement('div'); divider.className = 'cat-divider';
    divider.textContent = cat;
    group.appendChild(divider);

    tasks.filter(function(t){ return t.category === cat; }).forEach(function(t){
      var range = effectiveRange(t);
      if (!range) return; // no sprint and not overridden — skip rather than crash

      var row = document.createElement('div'); row.className = 'task-row';
      var label = document.createElement('div'); label.className = 'task-label';
      label.textContent = t.name;
      var track = document.createElement('div'); track.className = 'task-track';

      var left = pctPos(range.start);
      var width = Math.max(pctPos(range.end) - left, 0.6); // keep a visible sliver for short/zero-width ranges
      var n = statusDotToNum(t.status);
      var bar = document.createElement('div');
      bar.className = 'bar st-' + n;
      bar.style.left = left + '%';
      bar.style.width = width + '%';
      bar.textContent = t.sprint_code || '';
      bar.addEventListener('click', function(){ openDrawer('edit', t); });
      track.appendChild(bar);
      row.appendChild(label); row.appendChild(track);
      group.appendChild(row);
    });
    body.appendChild(group);
  });

  // today line — real current date, drawn only if it falls within the sprint axis range
  var todayPct = pctPos(new Date());
  if (todayPct >= 0 && todayPct <= 100){
    var overlayEl = document.createElement('div');
    overlayEl.className = 'gantt-track-overlay';
    var line = document.createElement('div');
    line.className = 'gantt-today-line';
    line.style.left = todayPct + '%';
    overlayEl.appendChild(line);
    document.querySelector('.gantt').style.position = 'relative';
    document.querySelector('.gantt').appendChild(overlayEl);
  }
}

function loadTimelineView(){
  var bandsEl = document.getElementById('sprintBands');
  var body = document.getElementById('ganttBody');
  return Promise.all([loadTasks(), loadSprints()])
    .then(function(results){
      renderGantt(results[0], results[1]);
    })
    .catch(function(err){
      console.error('Failed to load Timeline data', err);
      bandsEl.innerHTML = '';
      body.innerHTML = '<div class="view-sub">Không tải được dữ liệu Timeline. Thử tải lại trang.</div>';
    });
}

// ---- board ----
function renderBoard(tasks){
  var boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  STATUS_ORDER.forEach(function(status, idx){
    var col = document.createElement('div'); col.className = 'col';
    var head = document.createElement('div'); head.className = 'col-head';
    var label = statusLabel[idx].replace(/^\d+\.\s*/, '');
    var tasksInCol = tasks.filter(function(t){ return t.status === status; });
    head.innerHTML = '<span class="pill st-' + idx + '">' + escapeHtml(label) + '</span><span class="col-count">' + tasksInCol.length + '</span>';
    col.appendChild(head);
    tasksInCol.forEach(function(t){
      var card = document.createElement('div'); card.className = 'card';
      card.innerHTML = escapeHtml(t.name) +
        '<div class="card-tags"><span class="tag">' + escapeHtml(t.category) + '</span><span class="tag">' + escapeHtml(t.platform) + '</span></div>';
      card.addEventListener('click', function(){ openDrawer('edit', t); });
      col.appendChild(card);
    });
    boardEl.appendChild(col);
  });
}

function loadBoardView(){
  var boardEl = document.getElementById('board');
  return loadTasks()
    .then(function(tasks){
      renderBoard(tasks);
    })
    .catch(function(err){
      console.error('Failed to load Board data', err);
      boardEl.innerHTML = '<div class="view-sub">Không tải được dữ liệu Board. Thử tải lại trang.</div>';
    });
}

loadTimelineView();
loadBoardView();
