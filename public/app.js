// ---- nav switching ----
document.querySelectorAll('.nav-item').forEach(function(el){
  el.addEventListener('click', function(){
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    el.classList.add('active');
    document.getElementById('view-' + el.dataset.view).classList.add('active');
  });
});

// ---- sidebar "today" chip: real current date, not a frozen literal ----
(function renderTodayChip(){
  var chip = document.getElementById('todayChip');
  if (!chip) return;
  var weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  var now = new Date();
  var dd = String(now.getDate()).padStart(2, '0');
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var yyyy = now.getFullYear();
  chip.textContent = weekdayNames[now.getDay()] + ', ' + dd + '/' + mm + '/' + yyyy;
})();

// ---- drawer: shared by "create" and "edit" ----
var overlay = document.getElementById('overlay'), drawer = document.getElementById('drawer');
var statusLabel = {0:'0. Backlog', 1:'1. Ready for Dev', 2:'2. In Test', 3:'3. Ready for Staging', 4:'4. Done'};

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

// id of the task currently being edited, or null when the drawer is in "create" mode
var editingTaskId = null;
// the Analyst/Dev/UAT/Staging completion flags of the task currently being edited.
// These have no form fields in this drawer (they come from the Excel import and
// are tracked separately from the Kanban `status`) — we must pass them straight
// through on save or the PUT handler's `!!b.done_analyst` (etc.) will wipe them
// to false. null while in "create" mode, where a brand-new task has none yet.
var editingTaskDoneFlags = null;
// whether the task currently being edited already had date_overridden=true when
// loaded. manualDateEdit alone can't detect this — it only tracks hand-edits
// made THIS drawer session, so it resets to false on every open and can't see
// an existing override from a previous save. Without this, editing a task that
// has both a sprint AND hand-set override dates (so !sprintVal is false) would
// compute date_overridden=false on save and silently wipe the override's dates.
var editingTaskWasOverridden = false;
// becomes true once the user hand-edits #f-start/#f-due since the last time we
// auto-filled them from a sprint change (or since the drawer was opened)
var manualDateEdit = false;

function populateSelectOptions(selectEl, items, labelFn, noneLabel){
  var previousValue = selectEl.value;
  selectEl.innerHTML = '';
  var noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = noneLabel;
  selectEl.appendChild(noneOpt);
  items.forEach(function(item){
    var opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
  return previousValue;
}

function fetchAndRenderLogs(taskId){
  var preview = document.getElementById('logPreview');
  preview.innerHTML = '<div class="view-sub">Đang tải...</div>';
  return fetchJSON('/api/tasks/' + taskId + '/logs')
    .then(function(logs){
      if (logs.length === 0){
        preview.innerHTML = '<div class="view-sub">Chưa có ghi chú nào.</div>';
        return;
      }
      preview.innerHTML = logs.map(function(l){
        return '<div class="log-item"><span class="log-date">' + fmtDMY(String(l.created_at).slice(0,10)) + '</span>' + escapeHtml(l.note) + '</div>';
      }).join('');
    })
    .catch(function(err){
      console.error('Failed to load activity log', err);
      preview.innerHTML = '<div class="view-sub">Không tải được nhật ký.</div>';
    });
}

function openDrawer(mode, t){
  t = t || {};
  var isEdit = mode === 'edit';

  // Bind editingTaskId synchronously, to the id we're actually opening for,
  // BEFORE any async load starts — never wait for the Promise.all below to
  // resolve before this is set. Otherwise, if the user closes this drawer and
  // reopens for a different task while a previous open's load is still the
  // last one to have resolved, Save/Delete could act on the wrong (stale)
  // task. editingTaskDoneFlags is only ever trustworthy once the load below
  // actually succeeds, so it's cleared here and (re)populated only on success.
  editingTaskId = isEdit ? (t && typeof t === 'object' ? t.id : t) : null;
  editingTaskDoneFlags = null;
  editingTaskWasOverridden = false;

  document.getElementById('drawerTitle').textContent = isEdit ? 'Sửa nghiệp vụ' : 'Nghiệp vụ mới';
  document.getElementById('drawerSub').textContent = isEdit
    ? 'Cập nhật thông tin cho nghiệp vụ này'
    : 'Các trường giữ nguyên như sheet Nghiệp vụ hiện tại';
  document.getElementById('saveBtn').textContent = isEdit ? 'Lưu thay đổi' : 'Lưu nghiệp vụ';
  document.getElementById('deleteBtn').style.display = isEdit ? 'block' : 'none';
  document.getElementById('logField').style.display = isEdit ? 'block' : 'none';
  document.getElementById('f-notes').value = '';
  document.getElementById('f-newlog').value = '';
  manualDateEdit = false;

  overlay.classList.add('show'); drawer.classList.add('show');

  Promise.all([loadPhasesList(), loadSprints(), isEdit ? loadTasks() : Promise.resolve(null)])
    .then(function(results){
      var phases = results[0], sprints = results[1], allTasks = results[2];

      populateSelectOptions(document.getElementById('f-phase'), phases, function(p){
        return p.code + ': ' + p.name + ' (' + fmtDMY(p.target_date) + ')';
      }, '— không có —');
      populateSelectOptions(document.getElementById('f-sprint'), sprints, function(s){
        return s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')';
      }, '— không có —');

      if (isEdit){
        var full = (allTasks || []).filter(function(x){ return x.id === editingTaskId; })[0] || t;
        editingTaskDoneFlags = {
          done_analyst: !!full.done_analyst,
          done_dev: !!full.done_dev,
          done_uat: !!full.done_uat,
          done_staging: !!full.done_staging
        };
        editingTaskWasOverridden = !!full.date_overridden;
        document.getElementById('f-name').value = full.name || '';
        document.getElementById('f-cat').value = full.category || '';
        document.getElementById('f-platform').value = full.platform || '';
        document.getElementById('f-status').value = full.status || STATUS_ORDER[0];
        document.getElementById('f-phase').value = full.phase_id != null ? String(full.phase_id) : '';
        document.getElementById('f-sprint').value = full.sprint_id != null ? String(full.sprint_id) : '';
        document.getElementById('f-start').value = full.start_date || '';
        document.getElementById('f-due').value = full.due_date || '';
        fetchAndRenderLogs(full.id);
      } else {
        document.getElementById('f-name').value = '';
        document.getElementById('f-cat').selectedIndex = 0;
        document.getElementById('f-platform').selectedIndex = 0;
        document.getElementById('f-status').value = STATUS_ORDER[0];
        document.getElementById('f-phase').value = '';
        document.getElementById('f-sprint').value = '';
        document.getElementById('f-start').value = '';
        document.getElementById('f-due').value = '';
        document.getElementById('logPreview').innerHTML = '';
      }
    })
    .catch(function(err){
      console.error('Failed to load drawer reference data', err);
      alert('Không tải được nghiệp vụ. Vui lòng thử lại.');
      // a failed load must never leave a drawer open bound to a stale
      // editingTaskId/editingTaskDoneFlags — close it outright rather than
      // risk Save/Delete silently acting on the wrong (or no) task.
      editingTaskId = null;
      editingTaskDoneFlags = null;
      editingTaskWasOverridden = false;
      close();
    });
}

document.getElementById('openDrawer').addEventListener('click', function(){ openDrawer('create'); });
document.getElementById('closeDrawer').addEventListener('click', close);
overlay.addEventListener('click', close);
function close(){ overlay.classList.remove('show'); drawer.classList.remove('show'); }

// hybrid date UX: picking a sprint auto-fills start/due unless the user has
// already hand-edited the dates since the last time we auto-filled them
document.getElementById('f-sprint').addEventListener('change', function(){
  var sprintId = this.value;
  if (!sprintId || manualDateEdit) return;
  loadSprints().then(function(sprints){
    var s = sprints.filter(function(x){ return String(x.id) === String(sprintId); })[0];
    if (!s) return;
    document.getElementById('f-start').value = s.start_date;
    document.getElementById('f-due').value = s.end_date;
    manualDateEdit = false;
  });
});
['f-start', 'f-due'].forEach(function(id){
  document.getElementById(id).addEventListener('input', function(){ manualDateEdit = true; });
});

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
  // today marker — the real current date, not a frozen literal
  var today = new Date(), tp = pos(today);
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

// ---- drawer's Phase <select>: id/code/name/target_date never change from this
// task (only tasks are mutated), so this list is cached separately from the
// always-fresh /api/phases fetch loadPhases() uses to refresh rollup counts.
var _phasesListPromise = null;
function loadPhasesList(){
  if (!_phasesListPromise) _phasesListPromise = fetchJSON('/api/phases');
  return _phasesListPromise;
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

  // axis range must cover every sprint's start/end AND every task's effective
  // date range — legacy pre-sprint tasks (date_overridden=true, no sprint,
  // dated well before the earliest sprint) fall outside a sprints-only range
  // and would otherwise render as bars with negative left%, overflowing into
  // the TASKS label column.
  var allDates = [];
  sprints.forEach(function(s){
    allDates.push(new Date(s.start_date), new Date(s.end_date));
  });
  tasks.forEach(function(t){
    var r = effectiveRange(t);
    if (r) { allDates.push(r.start, r.end); }
  });
  var axisStart = new Date(Math.min.apply(null, allDates));
  var axisEnd = new Date(Math.max.apply(null, allDates));
  var axisSpan = (axisEnd - axisStart) || 1; // guard against a zero-length axis
  function pctPos(d){ return (d - axisStart) / axisSpan * 100; }

  // header bands, sized proportionally along the full axis (not just the sprint
  // range) so they stay aligned with the bars below even when the axis is wider
  // than the sprints — e.g. a legacy pre-sprint task pushes axisStart earlier
  // than the first sprint. Bands stay normal flex-flow children (so they keep
  // contributing their own content height to the header row, same as before);
  // any gap between axisStart/axisEnd and the sprint range is filled with a
  // plain unlabeled spacer div of the right width instead of shifting the bands.
  function appendGapSpacer(widthPct){
    if (widthPct <= 0.01) return;
    var spacer = document.createElement('div');
    spacer.style.width = widthPct + '%';
    spacer.style.flex = 'none';
    bandsEl.appendChild(spacer);
  }
  appendGapSpacer(pctPos(new Date(sprints[0].start_date)));
  sprints.forEach(function(s){
    var w = (pctPos(new Date(s.end_date)) - pctPos(new Date(s.start_date)));
    var band = document.createElement('div');
    band.className = 'sprint-band';
    band.style.width = w + '%';
    band.innerHTML = '<span class="lbl">' + escapeHtml(s.code) + '</span>' + fmtRange(s.start_date, s.end_date);
    bandsEl.appendChild(band);
  });
  appendGapSpacer(100 - pctPos(new Date(sprints[sprints.length - 1].end_date)));

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
      bar.title = t.name + (t.sprint_code ? ' · ' + t.sprint_code : '');
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

function renderGanttLegend(){
  var el = document.getElementById('ganttLegend');
  if (!el) return;
  el.innerHTML = STATUS_ORDER.map(function(status, idx){
    var label = statusLabel[idx].replace(/^\d+\.\s*/, '');
    return '<span class="legend-item"><span class="legend-swatch st-' + idx + '"></span>' + escapeHtml(label) + '</span>';
  }).join('');
}
renderGanttLegend();

// dynamic Phase <select> options for the Timeline filter row (kept in sync with
// the real phase codes/names from the API rather than a hardcoded guess)
loadPhasesList().then(function(phases){
  var sel = document.getElementById('filter-phase');
  if (!sel) return;
  phases.forEach(function(p){
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.code + ': ' + p.name;
    sel.appendChild(opt);
  });
}).catch(function(err){ console.error('Failed to load phases for Timeline filter', err); });

// last tasks/sprints fetched for the Timeline, so changing a filter can
// re-render instantly without refetching from the API
var _lastTimelineTasks = null;
var _lastTimelineSprints = null;

function applyTimelineFilters(tasks){
  var phaseId = document.getElementById('filter-phase').value;
  var category = document.getElementById('filter-category').value;
  var platform = document.getElementById('filter-platform').value;
  return tasks.filter(function(t){
    if (phaseId && String(t.phase_id) !== String(phaseId)) return false;
    if (category && t.category !== category) return false;
    if (platform && t.platform !== platform) return false;
    return true;
  });
}

['filter-phase', 'filter-category', 'filter-platform'].forEach(function(id){
  document.getElementById(id).addEventListener('change', function(){
    if (_lastTimelineTasks && _lastTimelineSprints){
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints);
    }
  });
});

function loadTimelineView(){
  var bandsEl = document.getElementById('sprintBands');
  var body = document.getElementById('ganttBody');
  return Promise.all([loadTasks(), loadSprints()])
    .then(function(results){
      _lastTimelineTasks = results[0];
      _lastTimelineSprints = results[1];
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints);
    })
    .catch(function(err){
      console.error('Failed to load Timeline data', err);
      bandsEl.innerHTML = '';
      body.innerHTML = '<div class="view-sub">Không tải được dữ liệu Timeline. Thử tải lại trang.</div>';
    });
}

// ---- board ----
// dragged task id, held between dragstart and drop (dataTransfer.getData is
// unreliable to read during dragover in some browsers, so we keep our own ref)
var _draggingTaskId = null;

function updateTaskStatus(task, newStatus){
  var body = {
    category: task.category, name: task.name, platform: task.platform, status: newStatus,
    phase_id: task.phase_id, sprint_id: task.sprint_id,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: task.start_date, due_date: task.due_date, date_overridden: task.date_overridden
  };
  return fetch('/api/tasks/' + task.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
  });
}

function renderBoard(tasks){
  var boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  STATUS_ORDER.forEach(function(status, idx){
    var col = document.createElement('div'); col.className = 'col';
    col.dataset.status = status;
    var head = document.createElement('div'); head.className = 'col-head';
    var label = statusLabel[idx].replace(/^\d+\.\s*/, '');
    var tasksInCol = tasks.filter(function(t){ return t.status === status; });
    head.innerHTML = '<span class="pill st-' + idx + '">' + escapeHtml(label) + '</span><span class="col-count">' + tasksInCol.length + '</span>';
    col.appendChild(head);
    tasksInCol.forEach(function(t){
      var card = document.createElement('div'); card.className = 'card'; card.draggable = true;
      card.innerHTML = escapeHtml(t.name) +
        '<div class="card-tags"><span class="tag">' + escapeHtml(t.category) + '</span><span class="tag">' + escapeHtml(t.platform) + '</span></div>';
      card.addEventListener('click', function(){ openDrawer('edit', t); });
      card.addEventListener('dragstart', function(e){
        _draggingTaskId = t.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(t.id));
      });
      card.addEventListener('dragend', function(){
        card.classList.remove('dragging');
        _draggingTaskId = null;
      });
      col.appendChild(card);
    });

    col.addEventListener('dragover', function(e){
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', function(){
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', function(e){
      e.preventDefault();
      col.classList.remove('drag-over');
      var taskId = _draggingTaskId;
      var task = tasks.filter(function(t){ return t.id === taskId; })[0];
      if (!task || task.status === status) return;
      updateTaskStatus(task, status)
        .then(refreshAllViews)
        .catch(function(err){
          console.error('Drag-and-drop status update failed', err);
          alert('Không đổi được trạng thái: ' + err.message);
        });
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

// ---- drawer: create / update / delete / activity log wiring ----
// after any task mutation, invalidate the shared tasks cache and re-run every
// loader that could be affected by it (phase rollups, sprint panel, timeline, board)
function refreshAllViews(){
  _tasksPromise = null;
  loadPhases();
  loadSprintView();
  loadTimelineView();
  loadBoardView();
}

document.getElementById('saveBtn').addEventListener('click', function(){
  var name = document.getElementById('f-name').value.trim();
  var category = document.getElementById('f-cat').value;
  var platform = document.getElementById('f-platform').value;
  var status = document.getElementById('f-status').value;
  var phaseVal = document.getElementById('f-phase').value;
  var sprintVal = document.getElementById('f-sprint').value;
  var startVal = document.getElementById('f-start').value || null;
  var dueVal = document.getElementById('f-due').value || null;

  if (!name || !category || !platform || !status || !startVal || !dueVal){
    alert('Vui lòng nhập đầy đủ Tên nghiệp vụ, Category, Platform, Status, Start và Due.');
    return;
  }

  // date_overridden: the user hand-edited the dates since the last sprint-driven
  // autofill, OR the task being edited already had an override before this
  // session touched it (manualDateEdit alone can't see that — it always resets
  // to false on open, even when a sprint IS selected, which is exactly the case
  // where an existing override's dates would otherwise get silently wiped),
  // OR there is no sprint selected (dates are mandatory, so with no sprint to
  // auto-fill them they must have been entered/kept by hand).
  var dateOverridden = manualDateEdit || editingTaskWasOverridden || !sprintVal;

  var body = {
    category: category,
    name: name,
    platform: platform,
    status: status,
    phase_id: phaseVal ? Number(phaseVal) : null,
    sprint_id: sprintVal ? Number(sprintVal) : null,
    date_overridden: dateOverridden,
    start_date: startVal,
    due_date: dueVal
  };

  // this form has no Analyst/Dev/UAT/Staging fields (they're tracked separately
  // from the Kanban status and come from the Excel import) — on edit, pass the
  // task's existing flags straight through so the PUT handler's `!!b.done_x`
  // doesn't silently wipe them to false. On create there is nothing to preserve.
  if (editingTaskId && editingTaskDoneFlags){
    body.done_analyst = editingTaskDoneFlags.done_analyst;
    body.done_dev = editingTaskDoneFlags.done_dev;
    body.done_uat = editingTaskDoneFlags.done_uat;
    body.done_staging = editingTaskDoneFlags.done_staging;
  }

  var isCreate = !editingTaskId;
  var url = isCreate ? '/api/tasks' : ('/api/tasks/' + editingTaskId);
  var method = isCreate ? 'POST' : 'PUT';
  var notesValue = document.getElementById('f-notes').value.trim();

  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
    return res.json();
  }).then(function(savedTask){
    // spec requires an optional initial note on CREATE only; best-effort — a
    // failure here shouldn't block the drawer from closing, the task itself
    // was already created successfully.
    if (isCreate && notesValue && savedTask && savedTask.id){
      return fetch('/api/tasks/' + savedTask.id + '/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notesValue })
      }).then(function(logRes){
        if (!logRes.ok) console.error('Failed to save initial note: HTTP ' + logRes.status);
      }).catch(function(err){
        console.error('Failed to save initial note', err);
      });
    }
  }).then(function(){
    close();
    refreshAllViews();
  }).catch(function(err){
    console.error('Save task failed', err);
    alert('Không lưu được nghiệp vụ: ' + err.message);
  });
});

document.getElementById('deleteBtn').addEventListener('click', function(){
  if (!editingTaskId) return;
  if (!confirm('Xoá nghiệp vụ này? Không thể hoàn tác.')) return;

  fetch('/api/tasks/' + editingTaskId, { method: 'DELETE' })
    .then(function(res){
      if (!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(errBody){
          throw new Error(errBody.error || ('HTTP ' + res.status));
        });
      }
    })
    .then(function(){
      close();
      refreshAllViews();
    })
    .catch(function(err){
      console.error('Delete task failed', err);
      alert('Không xoá được nghiệp vụ: ' + err.message);
    });
});

document.getElementById('addLogBtn').addEventListener('click', function(){
  var input = document.getElementById('f-newlog');
  var note = input.value.trim();
  if (!note || !editingTaskId) return;

  fetch('/api/tasks/' + editingTaskId + '/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note })
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
    return res.json();
  }).then(function(){
    input.value = '';
    return fetchAndRenderLogs(editingTaskId);
  }).catch(function(err){
    console.error('Add log failed', err);
    alert('Không thêm được ghi chú: ' + err.message);
  });
});
