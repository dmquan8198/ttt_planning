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
var statusLabel = {0:'0. Backlog', 1:'1. Ready for Dev', 2:'2. In Dev', 3:'3. Ready for Staging', 4:'4. Done'};

// dotted status string (from the real API) -> numeric suffix used by the
// existing .pill.st-N / .bar.st-N CSS classes and the statusLabel map above.
var STATUS_ORDER = ['0.backlog', '1.ready_for_dev', '2.in_test', '3.ready_for_staging', '4.done'];
function statusDotToNum(status){ return STATUS_ORDER.indexOf(status); }

// ---- light/dark theme toggle: persists the viewer's explicit choice in
// localStorage; a tiny inline script in <head> (index.html) applies it
// before first paint so there's no flash of the wrong theme. ----
var THEME_KEY = 'ttt_theme';
document.getElementById('themeToggle').addEventListener('click', function(){
  var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
});

function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// ---- toast: non-blocking success/failure feedback for every mutating
// action (drag, save, delete, ...) — replaces alert(), which freezes the
// whole page until dismissed, with a small auto-dismissing notice so the
// user can tell "did it work" without an interruption they have to clear. ----
function showToast(type, title, message){
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast is-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (type === 'success' ? '✓' : '✕') + '</span>' +
    '<span class="toast-body">' +
      '<div class="toast-title">' + escapeHtml(title) + '</div>' +
      (message ? '<div class="toast-message">' + escapeHtml(message) + '</div>' : '') +
    '</span>';
  container.appendChild(toast);
  var timer = setTimeout(remove, type === 'error' ? 6000 : 3000);
  toast.addEventListener('click', remove);
  function remove(){
    clearTimeout(timer);
    if (toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', function(){ toast.remove(); });
  }
}
function toastSuccess(message){ showToast('success', 'Thành công', message); }
function toastError(message){ showToast('error', 'Thất bại', message); }

// ---- FLIP animation: call before a container's contents get rebuilt (drag
// reorder/regroup, status change, resort, etc.), keep the returned function,
// then call it once the new DOM is in place — matched elements (by keyAttr,
// e.g. a task id) slide from their old position to the new one instead of
// just jumping, so swaps/moves between rows or blocks read as motion rather
// than a hard cut. Elements with no earlier position (newly appeared) are
// left alone; elements that didn't move are left alone too. ----
function captureFlipPositions(container, keyAttr){
  var positions = {};
  Array.from(container.querySelectorAll('[' + keyAttr + ']')).forEach(function(el){
    positions[el.getAttribute(keyAttr)] = el.getBoundingClientRect();
  });
  return function playFlip(){
    Array.from(container.querySelectorAll('[' + keyAttr + ']')).forEach(function(el){
      var oldRect = positions[el.getAttribute(keyAttr)];
      if (!oldRect) return;
      var newRect = el.getBoundingClientRect();
      var dx = oldRect.left - newRect.left;
      var dy = oldRect.top - newRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      requestAnimationFrame(function(){
        el.style.transition = 'transform .25s ease';
        el.style.transform = '';
        el.addEventListener('transitionend', function handler(e){
          if (e.propertyName !== 'transform') return;
          el.style.transition = '';
          el.removeEventListener('transitionend', handler);
        });
      });
    });
  };
}

// id of the task currently being edited, or null when the drawer is in "create" mode
var editingTaskId = null;
// the Analyst/Dev/UAT/Staging completion flags of the task currently being edited.
// These have no form fields in this drawer (they come from the Excel import and
// are tracked separately from the Kanban `status`) — we must pass them straight
// through on save or the PUT handler's `!!b.done_analyst` (etc.) will wipe them
// to false. null while in "create" mode, where a brand-new task has none yet.
var editingTaskDoneFlags = null;
// the manual sort position of the task currently being edited (from the
// Timeline's drag-to-reorder) — has no form field, so must be passed straight
// through on save or the PUT handler would wipe it to null. null in "create"
// mode, where a brand-new task has no position yet.
var editingTaskStt = null;
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
  editingTaskStt = null;

  // viewer: read-only (no save/delete, no adding a note, fields disabled) —
  // still allowed to open the drawer and look, since "chỉ xem" means read
  // access, not no access. editor: can save but not delete.
  var canEdit = hasRole('editor');
  var canDelete = hasRole('admin');

  document.getElementById('drawerTitle').textContent = isEdit ? 'Sửa nghiệp vụ' : 'Nghiệp vụ mới';
  document.getElementById('drawerSub').textContent = isEdit
    ? 'Cập nhật thông tin cho nghiệp vụ này'
    : 'Các trường giữ nguyên như sheet Nghiệp vụ hiện tại';
  document.getElementById('saveBtn').style.display = canEdit ? '' : 'none';
  document.getElementById('saveBtn').textContent = isEdit ? 'Lưu thay đổi' : 'Lưu nghiệp vụ';
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('deleteBtn').style.display = (isEdit && canDelete) ? 'block' : 'none';
  document.getElementById('deleteBtn').textContent = 'Xoá nghiệp vụ';
  document.getElementById('deleteBtn').disabled = false;
  document.getElementById('logField').style.display = isEdit ? 'block' : 'none';
  document.getElementById('f-newlog').style.display = canEdit ? '' : 'none';
  document.getElementById('addLogBtn').style.display = canEdit ? '' : 'none';
  document.getElementById('f-notes').value = '';
  document.getElementById('f-newlog').value = '';
  document.getElementById('addLogBtn').textContent = 'Thêm';
  document.getElementById('addLogBtn').disabled = false;
  manualDateEdit = false;

  ['f-cat', 'f-cat-new', 'f-name', 'f-platform', 'f-phase', 'f-sprint', 'f-status', 'f-start', 'f-due', 'f-notes'].forEach(function(id){
    document.getElementById(id).disabled = !canEdit;
  });

  overlay.classList.add('show'); drawer.classList.add('show');

  Promise.all([loadPhasesList(), loadSprints(), isEdit ? loadTasks() : Promise.resolve(null), fetchJSON('/api/sprints/current-next')])
    .then(function(results){
      var phases = results[0], sprints = results[1], allTasks = results[2], currentNext = results[3];
      var currentSprintId = currentNext.current ? currentNext.current.id : null;

      populateSelectOptions(document.getElementById('f-phase'), phases, function(p){
        return p.code + ': ' + p.name + ' (' + fmtDMY(p.target_date) + ')';
      }, '— không có —');
      populateSelectOptions(document.getElementById('f-sprint'), sprints, function(s){
        return s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')' + (s.id === currentSprintId ? ' — sprint hiện tại' : '');
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
        editingTaskStt = full.stt != null ? full.stt : null;
        document.getElementById('f-name').value = full.name || '';
        addCategoryOptionIfMissing(full.category);
        document.getElementById('f-cat').value = full.category || '';
        document.getElementById('f-cat-new').style.display = 'none';
        document.getElementById('f-platform').value = full.platform || '';
        document.getElementById('f-status').value = full.status || STATUS_ORDER[0];
        document.getElementById('f-phase').value = full.phase_id != null ? String(full.phase_id) : '';
        document.getElementById('f-sprint').value = full.sprint_id != null ? String(full.sprint_id) : '';
        document.getElementById('f-start').value = full.start_date || '';
        document.getElementById('f-due').value = full.due_date || '';
        fetchAndRenderLogs(full.id);
      } else {
        document.getElementById('f-name').value = '';
        document.getElementById('f-cat').value = 'Product Foundation';
        document.getElementById('f-cat-new').style.display = 'none';
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
      editingTaskStt = null;
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

// ---- who's making the change: sent as a header on every mutating request so
// the backend can attribute activity-log entries to a name, not just "someone".
// This is a soft accountability gate, not real security — the password is
// checked once client-side then remembered in localStorage; anyone reading
// the page source or calling the API directly can bypass it entirely. ----
var ACTOR_NAME_KEY = 'ttt_actor_name';
var ACTOR_ROLE_KEY = 'ttt_actor_role';
var LOGGED_IN_KEY = 'ttt_logged_in';
function getActorName(){ return localStorage.getItem(ACTOR_NAME_KEY) || ''; }
// safest default if a role was never stored (e.g. an older session from
// before roles existed) — deny-by-default, matching the server's own
// requireRole fallback for an unrecognized actor.
function getActorRole(){ return localStorage.getItem(ACTOR_ROLE_KEY) || 'viewer'; }
var ROLE_LEVEL = { viewer: 0, editor: 1, admin: 2 };
var ROLE_DISPLAY = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' };
// mirrors src/lib/roles.js's roleAtLeast — this is ONLY for showing/hiding
// controls; the server re-checks the real role on every mutating request,
// since a client-side check can't actually stop anyone.
function hasRole(minRole){
  var level = ROLE_LEVEL[getActorRole()];
  return level !== undefined && level >= ROLE_LEVEL[minRole];
}
function authFetch(url, options){
  options = options || {};
  // HTTP headers aren't reliably UTF-8 transparent (Node decodes them as
  // latin1), so a name with Vietnamese diacritics would arrive mangled —
  // percent-encode it here, decoded server-side in src/app.js.
  options.headers = Object.assign({}, options.headers, { 'X-Actor-Name': encodeURIComponent(getActorName()) });
  return fetch(url, options);
}

// show/hide the controls a role can't use — hides "+ Nghiệp vụ mới" and the
// Users nav item (admin only). Board/Timeline/Sprint/snapshots render at
// page load, BEFORE login finishes (the overlay just covers them visually,
// it doesn't block that background rendering) — at that point the role is
// still the pre-login default ('viewer'), so their drag handles/buttons
// would be stuck looking read-only for a real editor/admin unless
// something re-renders them once the actual role is known. refreshAllViews
// is a hoisted function declaration (defined further down), so calling it
// here — even though this runs earlier in the file — is safe.
// re-fetches the current actor's role from the server rather than trusting
// whatever's cached in localStorage — covers both a session left open from
// before roles existed (no cached role at all) and an admin changing
// someone's role while they're still logged in from an earlier page load.
function refreshActorRole(){
  var name = getActorName();
  if (!name) return Promise.resolve();
  return fetchJSON('/api/users').then(function(users){
    var match = users.filter(function(u){ return u.name === name; })[0];
    localStorage.setItem(ACTOR_ROLE_KEY, match ? match.role : 'viewer');
  }).catch(function(err){
    console.error('Failed to refresh actor role', err);
  });
}

function applyRoleUI(){
  document.getElementById('openDrawer').style.display = hasRole('editor') ? '' : 'none';
  document.getElementById('navUsers').style.display = hasRole('admin') ? '' : 'none';
  var captureBtn = document.getElementById('captureSnapshotBtn');
  if (captureBtn) captureBtn.style.display = hasRole('editor') ? '' : 'none';
  var nameEl = document.getElementById('userChipName');
  if (nameEl) nameEl.textContent = getActorName() + ' · ' + ROLE_DISPLAY[getActorRole()];
  if (typeof refreshAllViews === 'function') refreshAllViews();
}

function logout(){
  localStorage.removeItem(ACTOR_NAME_KEY);
  localStorage.removeItem(ACTOR_ROLE_KEY);
  localStorage.removeItem(LOGGED_IN_KEY);
  location.reload();
}
document.getElementById('logoutBtn').addEventListener('click', logout);

// populate the login dropdown from the real user list so anyone an admin
// adds via the Users page can actually log in — keeps the 6 hardcoded
// options as a fallback (in case this fetch fails, e.g. a Neon cold start)
// and only adds names not already present, rather than replacing them.
fetchJSON('/api/users').then(function(users){
  var sel = document.getElementById('login-name');
  var existing = Array.from(sel.options).map(function(o){ return o.value; });
  users.forEach(function(u){
    if (existing.indexOf(u.name) === -1){
      var opt = document.createElement('option');
      opt.value = u.name; opt.textContent = u.name;
      sel.appendChild(opt);
    }
  });
}).catch(function(err){ console.error('Failed to load users for login dropdown', err); });

(function initLogin(){
  var overlay = document.getElementById('loginOverlay');
  var errEl = document.getElementById('loginError');

  function showError(msg){
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  if (localStorage.getItem(LOGGED_IN_KEY) === '1' && getActorName()){
    overlay.style.display = 'none';
    refreshActorRole().then(applyRoleUI);
    return;
  }

  document.getElementById('login-name').focus();

  document.getElementById('loginBtn').addEventListener('click', function(){
    var name = document.getElementById('login-name').value.trim();
    var password = document.getElementById('login-password').value;
    errEl.style.display = 'none';
    if (!name || !password){
      showError('Vui lòng nhập đầy đủ Tên và Password.');
      return;
    }
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, password: password })
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){ return { ok: res.ok, body: body }; });
    }).then(function(result){
      if (!result.ok){
        showError(result.body.error || 'Đăng nhập thất bại.');
        return;
      }
      localStorage.setItem(ACTOR_NAME_KEY, name);
      localStorage.setItem(ACTOR_ROLE_KEY, result.body.role || 'viewer');
      localStorage.setItem(LOGGED_IN_KEY, '1');
      overlay.style.display = 'none';
      applyRoleUI();
    }).catch(function(err){
      showError('Lỗi kết nối: ' + err.message);
    });
  });

  ['login-name', 'login-password'].forEach(function(id){
    document.getElementById(id).addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ document.getElementById('loginBtn').click(); }
    });
  });
})();

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

  // alternating phase-segment bands behind the ticks, so the axis reads as a
  // detail view of the phase cards above it instead of a disconnected ruler —
  // each segment also gets its OWN progress fill using that phase's own
  // pct_complete (same number as the .phase-pct/.stack bar on its card above),
  // colored green once done, so the axis is a literal continuation of the
  // cards rather than a separate "elapsed time" concept.
  var segStart = start;
  phases.forEach(function(p, idx){
    var segEnd = new Date(p.target_date);
    var segStartPct = parseFloat(pos(segStart)), segEndPct = parseFloat(pos(segEnd));
    var segWidth = segEndPct - segStartPct;

    var band = document.createElement('div');
    band.className = 'axis-band' + (idx % 2 === 1 ? ' alt' : '');
    band.style.left = segStartPct + '%';
    band.style.width = segWidth + '%';
    axis.appendChild(band);

    var pct = p.pct_complete || 0;
    var fill = document.createElement('div');
    fill.className = 'axis-fill' + (pct === 100 ? ' is-done' : '');
    fill.style.left = segStartPct + '%';
    fill.style.width = (segWidth * pct / 100) + '%';
    axis.appendChild(fill);

    segStart = segEnd;
  });

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

// hover popup for a sprint-task row: the most recent activity log entry for
// that task, if any — lets a PM skim what happened on a task without
// opening the drawer for each one. A native title tooltip works but is
// plain/slow/browser-styled; this is a small styled popup anchored to the
// hovered row instead, reusing the same actor-parsing helpers the Log tab
// uses so the actor shows as its own badge rather than raw text in the note.
function showLogHoverPopup(targetEl, taskId, latestLogByTaskId){
  var popup = document.getElementById('logHoverPopup');
  var log = latestLogByTaskId ? latestLogByTaskId[taskId] : null;
  var bodyHtml;
  if (log){
    var actor = parseActorFromNote(log.note);
    var noteText = stripActorSuffix(log.note);
    bodyHtml = '<div class="log-hover-note">' + escapeHtml(noteText) + '</div>' +
      (actor ? '<span class="tag tag-actor">' + escapeHtml(actor) + '</span>' : '');
  } else {
    bodyHtml = '<div class="log-hover-empty">Chưa có log nào</div>';
  }
  popup.innerHTML =
    '<div class="log-hover-title"><span>Hoạt động gần nhất</span>' +
    (log ? '<span class="log-hover-date">' + fmtDateTime(log.created_at) + '</span>' : '') +
    '</div>' + bodyHtml;

  popup.classList.add('show');
  var rect = targetEl.getBoundingClientRect();
  var popupRect = popup.getBoundingClientRect();
  var top = rect.top - popupRect.height - 8;
  if (top < 8) top = rect.bottom + 8; // not enough room above — flip below
  var left = Math.min(rect.left, window.innerWidth - popupRect.width - 12);
  if (left < 8) left = 8;
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}
function hideLogHoverPopup(){
  document.getElementById('logHoverPopup').classList.remove('show');
}

// ---- sprint view: current + next (fetched from /api/sprints/current-next) ----
function renderSprintPanel(sprint, isCurrent, carryOverTasks, latestLogByTaskId){
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

  // Done → Ready for Staging → In Dev → Ready for Dev → Backlog, so the
  // finished/near-finished work is immediately visible without scrolling —
  // the whole point of this view being a compact one-page overview.
  var tasksList = (sprint.tasks || []).slice().sort(function(a, b){
    return statusDotToNum(b.status) - statusDotToNum(a.status);
  });
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
    item.setAttribute('data-task-id', t.id);
    item.innerHTML =
      '<span class="sprint-task-name">' + escapeHtml(t.name) + '</span>' +
      '<span class="tag">' + escapeHtml(t.category) + '</span>' +
      '<span class="tag">' + escapeHtml(t.platform) + '</span>' +
      '<span class="pill st-' + n + '">' + escapeHtml(label) + '</span>';
    item.addEventListener('click', function(){ openDrawer('edit', t); });
    item.addEventListener('mouseenter', function(){ showLogHoverPopup(item, t.id, latestLogByTaskId); });
    item.addEventListener('mouseleave', hideLogHoverPopup);
    listEl.appendChild(item);
  });
  panel.appendChild(listEl);

  // carry-over: tasks from sprints strictly before this one that haven't
  // reached Ready for Staging yet — surfaced here (current sprint only) so
  // lagging work from earlier sprints doesn't quietly fall out of view once
  // its own sprint ends. Each row tags its actual origin sprint since it's
  // not this panel's sprint.
  if (isCurrent && carryOverTasks && carryOverTasks.length > 0){
    var carryHead = document.createElement('div'); carryHead.className = 'carryover-head';
    carryHead.textContent = 'Việc tồn từ sprint trước (' + carryOverTasks.length + ')';
    panel.appendChild(carryHead);

    carryOverTasks.forEach(function(t){
      var n = statusDotToNum(t.status);
      var label = n >= 0 ? statusLabel[n].replace(/^\d\.\s*/, '') : '';
      var item = document.createElement('div'); item.className = 'sprint-task carryover';
      item.setAttribute('data-task-id', t.id);
      item.innerHTML =
        '<span class="sprint-task-name">' + escapeHtml(t.name) + '</span>' +
        '<span class="tag tag-sprint">' + escapeHtml(t.sprint_code || '') + '</span>' +
        '<span class="tag">' + escapeHtml(t.category) + '</span>' +
        '<span class="tag">' + escapeHtml(t.platform) + '</span>' +
        '<span class="pill st-' + n + '">' + escapeHtml(label) + '</span>';
      item.addEventListener('mouseenter', function(){ showLogHoverPopup(item, t.id, latestLogByTaskId); });
      item.addEventListener('mouseleave', hideLogHoverPopup);
      item.addEventListener('click', function(){ openDrawer('edit', t); });
      panel.appendChild(item);
    });
  }

  return panel;
}

// cross-sprint view: EVERY task in EVERY sprint, one row per sprint, tasks
// grouped by Platform within the row (the "who do I need" signal for
// staffing) and colored by status — so a PM can scan all sprints in one
// screen and still see what each task actually is, not just a count.
var SPRINT_OVERVIEW_PLATFORMS = ['Web', 'App', 'BE', 'App/Auto'];

// canonical platforms first (fixed order), then any other platform value
// found in the data (shouldn't normally happen — the drawer only offers
// the 4 above — but avoids silently dropping a task with an odd value)
function platformBucketsFor(sprintTasks){
  var extra = [];
  sprintTasks.forEach(function(t){
    if (SPRINT_OVERVIEW_PLATFORMS.indexOf(t.platform) === -1 && extra.indexOf(t.platform) === -1) extra.push(t.platform);
  });
  return SPRINT_OVERVIEW_PLATFORMS.concat(extra.sort());
}

// updates just a task's sprint (+ derived dates from that sprint, same as
// Timeline's drag-to-regroup-by-sprint) — a dedicated function rather than
// reusing updateTaskGroup/buildGroupChangeBody, since those branch on the
// Timeline's own _timelineGroupBy chip state, which has nothing to do with
// a drag happening on the Sprint page.
function updateTaskSprint(task, newSprintId, sprints){
  var sprint = sprints.filter(function(s){ return s.id === newSprintId; })[0];
  var body = {
    category: task.category, name: task.name, platform: task.platform, status: task.status,
    phase_id: task.phase_id, sprint_id: newSprintId, stt: task.stt,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: sprint ? sprint.start_date : task.start_date,
    due_date: sprint ? sprint.end_date : task.due_date,
    date_overridden: false
  };
  return authFetch('/api/tasks/' + task.id, {
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

var _draggingSprintOverviewTaskId = null;

function renderSprintOverviewTable(sprints, tasks, currentSprintId, nextSprintId){
  var wrap = document.getElementById('sprintOverviewWrap');
  wrap.innerHTML = '';
  if (sprints.length === 0){
    wrap.innerHTML = '<div class="view-sub">Chưa có sprint nào.</div>';
    return;
  }

  sprints.forEach(function(s){
    var sprintTasks = tasks.filter(function(t){ return t.sprint_id === s.id; });
    var doneCount = sprintTasks.filter(function(t){ return t.status === '4.done'; }).length;
    var isCurrent = s.id === currentSprintId, isNext = s.id === nextSprintId;

    var row = document.createElement('div');
    row.className = 'sprint-overview-row' + (isCurrent ? ' is-current' : (isNext ? ' is-next' : ''));

    var head = document.createElement('div'); head.className = 'sprint-overview-row-head';
    var tag = isCurrent ? '<span class="tag tag-sprint">hiện tại</span>' : (isNext ? '<span class="tag">sau</span>' : '');
    head.innerHTML =
      '<span class="sprint-overview-row-title"><span>' + escapeHtml(s.code) + ' (' + fmtRange(s.start_date, s.end_date) + ')</span>' + tag + '</span>' +
      '<span class="sprint-overview-row-count">' + sprintTasks.length + ' nghiệp vụ · ' + doneCount + '/' + sprintTasks.length + ' Done</span>';
    row.appendChild(head);

    // drop anywhere in this sprint's row (empty or not) moves the dragged
    // task here — derives new start/due from this sprint, same as Timeline's
    // drag-to-regroup, then refreshes every view so Board/Timeline/Log stay
    // in sync with the change.
    row.addEventListener('dragover', function(e){
      var draggedId = _draggingSprintOverviewTaskId;
      var draggedTask = draggedId != null ? tasks.filter(function(t){ return t.id === draggedId; })[0] : null;
      if (draggedTask && draggedTask.sprint_id !== s.id){
        e.preventDefault();
        row.classList.add('sprint-overview-row-drag-over');
      }
    });
    row.addEventListener('dragleave', function(){
      row.classList.remove('sprint-overview-row-drag-over');
    });
    row.addEventListener('drop', function(e){
      row.classList.remove('sprint-overview-row-drag-over');
      var draggedId = _draggingSprintOverviewTaskId;
      var draggedTask = draggedId != null ? tasks.filter(function(t){ return t.id === draggedId; })[0] : null;
      if (!draggedTask || draggedTask.sprint_id === s.id) return;
      e.preventDefault();
      updateTaskSprint(draggedTask, s.id, sprints)
        .then(function(){
          refreshAllViews();
          toastSuccess('Đã đổi sprint cho "' + draggedTask.name + '"');
        })
        .catch(function(err){
          console.error('Đổi sprint thất bại', err);
          toastError('Không đổi được sprint: ' + err.message);
        });
    });

    if (sprintTasks.length === 0){
      var empty = document.createElement('div'); empty.className = 'view-sub'; empty.textContent = 'Chưa có nghiệp vụ.';
      row.appendChild(empty);
    } else {
      var body = document.createElement('div'); body.className = 'sprint-overview-row-body';
      platformBucketsFor(sprintTasks).forEach(function(p){
        var platformTasks = sprintTasks.filter(function(t){ return t.platform === p; });
        if (platformTasks.length === 0) return;
        var group = document.createElement('div'); group.className = 'sprint-overview-platform-group';
        var label = document.createElement('span'); label.className = 'sprint-overview-platform-label'; label.textContent = p;
        group.appendChild(label);
        platformTasks.forEach(function(t){
          var n = statusDotToNum(t.status);
          var chip = document.createElement('span');
          chip.className = 'sprint-overview-task-chip st-' + n;
          chip.textContent = t.name;
          chip.title = hasRole('editor') ? (t.name + ' · kéo để đổi sprint') : t.name;
          chip.draggable = hasRole('editor');
          chip.addEventListener('click', function(){ openDrawer('edit', t); });
          chip.addEventListener('dragstart', function(e){
            _draggingSprintOverviewTaskId = t.id;
            chip.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(t.id));
          });
          chip.addEventListener('dragend', function(){
            chip.classList.remove('dragging');
            _draggingSprintOverviewTaskId = null;
          });
          group.appendChild(chip);
        });
        body.appendChild(group);
      });
      row.appendChild(body);
    }
    wrap.appendChild(row);
  });
}

function loadSprintView(){
  var col = document.getElementById('sprintColumns');
  return Promise.all([fetchJSON('/api/sprints/current-next'), loadTasks(), loadSprints(), fetchJSON('/api/logs')])
    .then(function(results){
      var data = results[0], tasks = results[1], sprints = results[2], allLogs = results[3];
      var playFlip = captureFlipPositions(col, 'data-task-id');
      col.innerHTML = '';

      // /api/logs is already sorted newest-first, so the first entry seen
      // per task_id is that task's most recent log.
      var latestLogByTaskId = {};
      allLogs.forEach(function(l){
        if (!(l.task_id in latestLogByTaskId)) latestLogByTaskId[l.task_id] = l;
      });

      renderSprintOverviewTable(sprints, tasks, data.current ? data.current.id : null, data.next ? data.next.id : null);

      var carryOver = [];
      if (data.current){
        var sprintById = {};
        sprints.forEach(function(s){ sprintById[s.id] = s; });
        var currentStart = new Date(data.current.start_date);
        var earlierSprintIds = sprints
          .filter(function(s){ return new Date(s.end_date) < currentStart; })
          .map(function(s){ return s.id; });
        carryOver = tasks
          .filter(function(t){
            return t.sprint_id != null && earlierSprintIds.indexOf(t.sprint_id) !== -1 && statusDotToNum(t.status) < 3;
          })
          .sort(function(a, b){
            return new Date(sprintById[a.sprint_id].start_date) - new Date(sprintById[b.sprint_id].start_date);
          });
      }

      col.appendChild(renderSprintPanel(data.current, true, carryOver, latestLogByTaskId));
      col.appendChild(renderSprintPanel(data.next, false, null, latestLogByTaskId));
      playFlip();
    })
    .catch(function(err){
      console.error('Failed to load /api/sprints/current-next', err);
      col.innerHTML = '<div class="view-sub">Không tải được dữ liệu Sprint. Thử tải lại trang.</div>';
    });
}

var SPRINT_TAB_SUB = {
  overview: 'Toàn bộ nghiệp vụ mỗi sprint, nhóm theo Platform — để phân bổ nhân sự, bấm vào 1 nghiệp vụ để sửa',
  'current-next': 'Biết ngay tuần này đang làm gì, tuần sau sắp tới gì — bấm vào 1 nghiệp vụ để sửa'
};
document.querySelectorAll('#sprintTabChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#sprintTabChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    var tab = btn.dataset.tab;
    document.getElementById('sprintTabOverview').style.display = tab === 'overview' ? '' : 'none';
    document.getElementById('sprintTabCurrentNext').style.display = tab === 'current-next' ? '' : 'none';
    document.getElementById('sprintTabSub').textContent = SPRINT_TAB_SUB[tab];
  });
});

// ---- risk report: tasks whose due date has already passed but aren't Done
// yet, grouped by Sprint and by Phase (chronological order, groups with zero
// at-risk tasks are skipped entirely). Also reused for the "due soon"
// (upcoming, not-yet-overdue) report via opts — same layout, different
// wording/color and day-count direction. ----
function renderRiskGroups(containerId, riskTasks, groupList, groupKeyFn, today, opts){
  opts = opts || {};
  var countLabel = opts.countLabel || function(n){ return n + ' trễ hạn'; };
  var daysLabel = opts.daysLabel || function(t){
    var days = Math.round((today - new Date(t.due_date)) / (24 * 60 * 60 * 1000));
    return 'Trễ ' + days + ' ngày';
  };
  var badgeClass = opts.badgeClass || '';
  var emptyText = opts.emptyText || 'Không có nghiệp vụ nào trễ hạn — tốt!';

  var container = document.getElementById(containerId);
  container.innerHTML = '';

  groupList.forEach(function(g){
    var groupRisk = riskTasks.filter(function(t){ return groupKeyFn(t) === g.key; });
    if (groupRisk.length === 0) return;
    groupRisk.sort(function(a, b){ return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0); });

    var card = document.createElement('div'); card.className = 'risk-group';
    var head = document.createElement('div'); head.className = 'risk-group-head';
    head.innerHTML = '<span>' + escapeHtml(g.label) + '</span><span class="risk-count ' + badgeClass + '">' + countLabel(groupRisk.length) + '</span>';
    card.appendChild(head);

    groupRisk.forEach(function(t){
      var row = document.createElement('div'); row.className = 'risk-task';
      row.innerHTML =
        '<div class="risk-task-name">' + escapeHtml(t.name) + '</div>' +
        '<div class="risk-task-meta">' +
          '<span class="risk-due">Due ' + fmtDMY(t.due_date) + '</span>' +
          '<span class="risk-days ' + badgeClass + '">' + daysLabel(t) + '</span>' +
        '</div>';
      row.addEventListener('click', function(){ openDrawer('edit', t); });
      card.appendChild(row);
    });
    container.appendChild(card);
  });

  if (container.children.length === 0){
    container.innerHTML = '<div class="view-sub">' + emptyText + '</div>';
  }
}

// which status a task must have reached to no longer count as "at risk";
// STATUS_ORDER index, so 3 = Ready for Staging, 4 = Done. Default per product
// call: Ready for Staging counts as "basically shipped", so only Backlog/Ready
// for Dev/In Dev tasks are flagged once overdue.
var _riskThreshold = 3;

document.querySelectorAll('#riskThresholdChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#riskThresholdChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _riskThreshold = Number(btn.dataset.threshold);
    loadRiskReports();
  });
});

// how many days ahead counts as "sắp đến hạn" (due soon) — a forward-looking
// companion to the overdue risk report above, so a PM can act before a task
// slips rather than only finding out after.
var _dueSoonWindow = 3;

document.querySelectorAll('#dueSoonWindowChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#dueSoonWindowChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _dueSoonWindow = Number(btn.dataset.window);
    loadRiskReports();
  });
});

function loadRiskReports(){
  var sprintEl = document.getElementById('riskBySprint');
  var phaseEl = document.getElementById('riskByPhase');
  var dueSoonSprintEl = document.getElementById('dueSoonBySprint');
  var dueSoonPhaseEl = document.getElementById('dueSoonByPhase');
  var thresholdLabel = _riskThreshold === 4 ? 'Done' : 'Ready for Staging';
  var subText = 'Nghiệp vụ đã quá due date nhưng chưa tới ' + thresholdLabel;
  document.getElementById('riskSubSprint').textContent = subText;
  document.getElementById('riskSubPhase').textContent = subText;
  var dueSoonSubText = 'Nghiệp vụ due trong ' + _dueSoonWindow + ' ngày tới nhưng chưa tới ' + thresholdLabel;
  document.getElementById('dueSoonSubSprint').textContent = dueSoonSubText;
  document.getElementById('dueSoonSubPhase').textContent = dueSoonSubText;

  return Promise.all([loadTasks(), loadSprints(), loadPhasesList()])
    .then(function(results){
      var tasks = results[0], sprints = results[1], phases = results[2];
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var todayIso = toIsoDate(today);
      var riskTasks = tasks.filter(function(t){
        return statusDotToNum(t.status) < _riskThreshold && t.due_date < todayIso;
      });
      var dueSoonEndIso = toIsoDate(new Date(today.getTime() + _dueSoonWindow * 24 * 60 * 60 * 1000));
      var dueSoonTasks = tasks.filter(function(t){
        return statusDotToNum(t.status) < _riskThreshold && t.due_date >= todayIso && t.due_date <= dueSoonEndIso;
      });

      var sprintGroups = sprints.map(function(s){ return { key: s.id, label: s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')' }; });
      sprintGroups.push({ key: null, label: 'Chưa gán sprint' });
      var phaseGroups = phases.map(function(p){ return { key: p.id, label: p.code + ': ' + p.name }; });
      phaseGroups.push({ key: null, label: 'Chưa gán phase' });

      renderRiskGroups('riskBySprint', riskTasks, sprintGroups, function(t){ return t.sprint_id; }, today);
      renderRiskGroups('riskByPhase', riskTasks, phaseGroups, function(t){ return t.phase_id; }, today);

      var dueSoonOpts = {
        countLabel: function(n){ return n + ' sắp đến hạn'; },
        daysLabel: function(t){
          var days = Math.round((new Date(t.due_date) - today) / (24 * 60 * 60 * 1000));
          return days === 0 ? 'Due hôm nay' : 'Còn ' + days + ' ngày';
        },
        badgeClass: 'is-soon',
        emptyText: 'Không có nghiệp vụ nào sắp đến hạn trong ' + _dueSoonWindow + ' ngày tới — tốt!'
      };
      renderRiskGroups('dueSoonBySprint', dueSoonTasks, sprintGroups, function(t){ return t.sprint_id; }, today, dueSoonOpts);
      renderRiskGroups('dueSoonByPhase', dueSoonTasks, phaseGroups, function(t){ return t.phase_id; }, today, dueSoonOpts);
    })
    .catch(function(err){
      console.error('Failed to load risk reports', err);
      sprintEl.innerHTML = phaseEl.innerHTML = '<div class="view-sub">Không tải được risk report.</div>';
      dueSoonSprintEl.innerHTML = dueSoonPhaseEl.innerHTML = '<div class="view-sub">Không tải được report.</div>';
    });
}

// ---- weekly snapshot report: a manual "chụp báo cáo" captures today's
// phase rollup + risk/due-soon counts into a saved row, so a PM can compare
// against a chosen earlier week instead of only ever seeing a live "as of
// now" view with no trend. Deliberately manual (no cron) — this app has no
// background worker, and Render's free tier sleeps when idle, so a
// scheduled job can't be trusted to fire on time anyway. ----
var _snapshotList = [];
var _snapshotCurrent = null;
var _snapshotCompareId = '';

function loadSnapshotSection(){
  return Promise.all([
    fetchJSON('/api/snapshots/current'),
    fetchJSON('/api/snapshots')
  ]).then(function(results){
    _snapshotCurrent = results[0];
    _snapshotList = results[1];
    renderSnapshotControls();
    renderSnapshotCompare();
    renderSnapshotList();
  }).catch(function(err){
    console.error('Failed to load snapshot report', err);
    document.getElementById('snapshotListWrap').innerHTML = '<div class="view-sub">Không tải được báo cáo tuần.</div>';
  });
}

function renderSnapshotControls(){
  var sel = document.getElementById('snapshotCompareSelect');
  var stillValid = _snapshotList.some(function(s){ return String(s.id) === String(_snapshotCompareId); });
  sel.innerHTML = '<option value="">— Chọn snapshot cũ —</option>';
  _snapshotList.forEach(function(s){
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = fmtDMY(s.snapshot_date) + (s.actor_name ? ' (' + s.actor_name + ')' : '');
    sel.appendChild(opt);
  });
  _snapshotCompareId = stillValid ? _snapshotCompareId : '';
  sel.value = _snapshotCompareId;
}

// goodDirection: 1 = higher is better (VD: % hoàn thành), -1 = lower is
// better (VD: số task trễ hạn), 0 = trung tính, không tô màu
function snapshotDeltaBadge(delta, unit, goodDirection){
  var sign = delta > 0 ? '+' : '';
  var cls = 'snap-delta';
  if (goodDirection !== 0 && delta !== 0){
    var isGood = goodDirection === 1 ? delta > 0 : delta < 0;
    cls += isGood ? ' is-good' : ' is-bad';
  }
  return '<span class="' + cls + '">' + sign + delta + unit + '</span>';
}

function renderSnapshotCompare(){
  var wrap = document.getElementById('snapshotCompareWrap');
  wrap.innerHTML = '';
  if (!_snapshotCompareId || !_snapshotCurrent) return;
  var chosen = _snapshotList.filter(function(s){ return String(s.id) === String(_snapshotCompareId); })[0];
  if (!chosen) return;

  var card = document.createElement('div'); card.className = 'risk-group';
  var head = document.createElement('div'); head.className = 'risk-group-head';
  head.innerHTML = '<span>So với ' + fmtDMY(chosen.snapshot_date) + (chosen.actor_name ? ' (' + escapeHtml(chosen.actor_name) + ')' : '') + '</span>';
  card.appendChild(head);

  chosen.data.phases.forEach(function(oldPhase){
    var newPhase = _snapshotCurrent.data.phases.filter(function(p){ return p.id === oldPhase.id; })[0];
    if (!newPhase) return; // phase removed since this snapshot — nothing to compare
    var oldPct = oldPhase.pct_complete, newPct = newPhase.pct_complete;
    var delta = (oldPct != null && newPct != null) ? Math.round((newPct - oldPct) * 10) / 10 : null;
    var row = document.createElement('div'); row.className = 'risk-task';
    row.innerHTML =
      '<div class="risk-task-name">' + escapeHtml(oldPhase.code) + ': ' + escapeHtml(oldPhase.name) + '</div>' +
      '<div class="risk-task-meta">' +
        '<span class="risk-due">' + (oldPct != null ? oldPct + '%' : '—') + ' → ' + (newPct != null ? newPct + '%' : '—') + '</span>' +
        (delta != null ? snapshotDeltaBadge(delta, '%', 1) : '') +
      '</div>';
    card.appendChild(row);
  });

  var riskDelta = _snapshotCurrent.data.risk_count - chosen.data.risk_count;
  var riskRow = document.createElement('div'); riskRow.className = 'risk-task';
  riskRow.innerHTML =
    '<div class="risk-task-name">Trễ hạn (risk)</div>' +
    '<div class="risk-task-meta">' +
      '<span class="risk-due">' + chosen.data.risk_count + ' → ' + _snapshotCurrent.data.risk_count + '</span>' +
      snapshotDeltaBadge(riskDelta, '', -1) +
    '</div>';
  card.appendChild(riskRow);

  var soonDelta = _snapshotCurrent.data.due_soon_count - chosen.data.due_soon_count;
  var soonRow = document.createElement('div'); soonRow.className = 'risk-task';
  soonRow.innerHTML =
    '<div class="risk-task-name">Sắp đến hạn (7 ngày)</div>' +
    '<div class="risk-task-meta">' +
      '<span class="risk-due">' + chosen.data.due_soon_count + ' → ' + _snapshotCurrent.data.due_soon_count + '</span>' +
      snapshotDeltaBadge(soonDelta, '', 0) +
    '</div>';
  card.appendChild(soonRow);

  wrap.appendChild(card);
}

function renderSnapshotList(){
  var wrap = document.getElementById('snapshotListWrap');
  wrap.innerHTML = '';
  if (_snapshotList.length === 0){
    wrap.innerHTML = '<div class="view-sub">Chưa có báo cáo tuần nào được chụp.</div>';
    return;
  }
  var card = document.createElement('div'); card.className = 'risk-group';
  var canDelete = hasRole('admin');
  _snapshotList.forEach(function(s){
    var row = document.createElement('div'); row.className = 'risk-task';
    row.innerHTML =
      '<div class="risk-task-name">' + fmtDateTime(s.created_at) + (s.actor_name ? ' — ' + escapeHtml(s.actor_name) : '') + '</div>' +
      '<div class="risk-task-meta">' + (canDelete ? '<button type="button" class="chip snapshot-delete-btn" data-id="' + s.id + '">Xoá</button>' : '') + '</div>';
    card.appendChild(row);
  });
  wrap.appendChild(card);
  wrap.querySelectorAll('.snapshot-delete-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      if (!confirm('Xoá báo cáo tuần này?')) return;
      authFetch('/api/snapshots/' + btn.dataset.id, { method: 'DELETE' })
        .then(function(res){
          if (!res.ok){
            return res.json().catch(function(){ return {}; }).then(function(errBody){
              throw new Error(errBody.error || ('HTTP ' + res.status));
            });
          }
          return loadSnapshotSection().then(function(){ toastSuccess('Đã xoá báo cáo tuần'); });
        })
        .catch(function(err){
          console.error('Failed to delete snapshot', err);
          toastError('Không xoá được: ' + err.message);
        });
    });
  });
}

document.getElementById('captureSnapshotBtn').addEventListener('click', function(){
  var btn = this;
  btn.disabled = true;
  authFetch('/api/snapshots', { method: 'POST' })
    .then(function(res){
      if (!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(errBody){
          throw new Error(errBody.error || ('HTTP ' + res.status));
        });
      }
      return loadSnapshotSection().then(function(){ toastSuccess('Đã chụp báo cáo tuần'); });
    })
    .catch(function(err){
      console.error('Failed to capture snapshot', err);
      toastError('Không chụp được báo cáo: ' + err.message);
    })
    .finally(function(){ btn.disabled = false; });
});

// ---- users & permissions (admin only) — the view itself is hidden for
// non-admins via applyRoleUI(), and every write here is re-checked
// server-side by requireRole regardless of what the client shows. ----
var ROLE_OPTIONS = ['viewer', 'editor', 'admin'];

function renderUsersList(users){
  var wrap = document.getElementById('usersListWrap');
  wrap.innerHTML = '';
  if (users.length === 0){
    wrap.innerHTML = '<div class="view-sub">Chưa có user nào.</div>';
    return;
  }
  var card = document.createElement('div'); card.className = 'risk-group';
  users.forEach(function(u){
    var row = document.createElement('div'); row.className = 'risk-task';
    var nameEl = document.createElement('div'); nameEl.className = 'risk-task-name';
    nameEl.textContent = u.name;
    row.appendChild(nameEl);

    var meta = document.createElement('div'); meta.className = 'risk-task-meta';
    var roleSelect = document.createElement('select');
    ROLE_OPTIONS.forEach(function(r){
      var opt = document.createElement('option');
      opt.value = r; opt.textContent = ROLE_DISPLAY[r];
      if (r === u.role) opt.selected = true;
      roleSelect.appendChild(opt);
    });
    roleSelect.addEventListener('change', function(){
      var newRole = roleSelect.value;
      authFetch('/api/users/' + u.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      }).then(function(res){
        if (!res.ok){
          return res.json().catch(function(){ return {}; }).then(function(errBody){
            throw new Error(errBody.error || ('HTTP ' + res.status));
          });
        }
        u.role = newRole;
        toastSuccess('Đã đổi quyền của "' + u.name + '" thành ' + ROLE_DISPLAY[newRole]);
      }).catch(function(err){
        console.error('Failed to change role', err);
        toastError('Không đổi được quyền: ' + err.message);
        roleSelect.value = u.role; // revert the select to the last known-good role
      });
    });
    meta.appendChild(roleSelect);
    row.appendChild(meta);
    card.appendChild(row);
  });
  wrap.appendChild(card);
}

function loadUsersView(){
  return fetchJSON('/api/users').then(renderUsersList).catch(function(err){
    console.error('Failed to load users', err);
    document.getElementById('usersListWrap').innerHTML = '<div class="view-sub">Không tải được danh sách user.</div>';
  });
}

document.getElementById('addUserBtn').addEventListener('click', function(){
  var nameInput = document.getElementById('newUserName');
  var name = nameInput.value.trim();
  var role = document.getElementById('newUserRole').value;
  if (!name){
    toastError('Vui lòng nhập tên đăng nhập.');
    return;
  }
  authFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, role: role })
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
    return res.json();
  }).then(function(){
    nameInput.value = '';
    toastSuccess('Đã thêm user "' + name + '"');
    return loadUsersView();
  }).catch(function(err){
    console.error('Failed to add user', err);
    toastError('Không thêm được user: ' + err.message);
  });
});

loadUsersView();

document.getElementById('snapshotCompareSelect').addEventListener('change', function(){
  _snapshotCompareId = this.value;
  renderSnapshotCompare();
});

loadPhases();
loadSprintView();
loadRiskReports();
loadSnapshotSection();

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

// ---- group-by chips: which dimension clusters the Gantt's rows ----
var _timelineGroupBy = 'sprint';

function groupsForMode(tasks, sprints, phases){
  if (_timelineGroupBy === 'sprint'){
    var order = sprints.map(function(s){ return { key: 's' + s.id, label: s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')' }; });
    order.push({ key: 'none', label: 'Chưa gán sprint' });
    return order;
  }
  if (_timelineGroupBy === 'phase'){
    var order = phases.map(function(p){ return { key: 'p' + p.id, label: p.code + ': ' + p.name }; });
    order.push({ key: 'none', label: 'Chưa gán phase' });
    return order;
  }
  // category / platform have no fixed canonical order — cluster in the order
  // they're first seen among the (already filtered) tasks, same as before
  // this function existed for plain category grouping.
  var field = _timelineGroupBy === 'platform' ? 'platform' : 'category';
  var seen = [], seenSet = {};
  tasks.forEach(function(t){
    var v = t[field];
    if (v && !seenSet[v]){ seenSet[v] = true; seen.push({ key: v, label: v }); }
  });
  return seen;
}

function taskGroupKey(t){
  if (_timelineGroupBy === 'sprint') return t.sprint_id != null ? 's' + t.sprint_id : 'none';
  if (_timelineGroupBy === 'phase') return t.phase_id != null ? 'p' + t.phase_id : 'none';
  if (_timelineGroupBy === 'platform') return t.platform || 'none';
  return t.category || 'none';
}

document.querySelectorAll('#groupByChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#groupByChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _timelineGroupBy = btn.dataset.groupby;
    if (_lastTimelineTasks && _lastTimelineSprints && _lastTimelinePhases){
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
    }
  });
});

// ---- day-level ruler: two-digit day-of-month ticks, a bolder one + dd/mm label every Monday ----
function fmtDdMm(d){ return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }

function renderDayRuler(axisStart, axisEnd, pctPos){
  var ruler = document.getElementById('dayRuler');
  ruler.innerHTML = '';
  var d = new Date(axisStart);
  d.setHours(0, 0, 0, 0);
  var end = new Date(axisEnd);
  while (d <= end){
    // labels only, no tick lines — the header is a solid bar and a vertical
    // line drawn across it reads as a stray mark/seam; the actual day
    // gridlines already live in the body's .gantt-track-overlay below it.
    if (d.getDay() === 1){ // Monday
      var p = pctPos(d);
      var lbl = document.createElement('div');
      // labels near the right edge would otherwise get clipped by .gantt's
      // overflow:hidden (rounded corners) since they anchor rightward by
      // default — flip them to anchor leftward instead once close to 100%
      lbl.className = 'day-tick-label' + (p > 95 ? ' align-end' : '');
      lbl.style.left = p + '%';
      lbl.textContent = fmtDdMm(d);
      ruler.appendChild(lbl);
    }
    d.setDate(d.getDate() + 1);
  }
}

// updates a task's dates directly (used by the Timeline's drag-to-move /
// drag-to-resize on bars) — always marks the task as date_overridden, since a
// hand-placed bar position is by definition a manual override of its sprint's
// default range, same as hand-editing the dates in the drawer would be.
function updateTaskDates(task, newStartIso, newDueIso){
  var body = {
    category: task.category, name: task.name, platform: task.platform, status: task.status,
    phase_id: task.phase_id, sprint_id: task.sprint_id, stt: task.stt,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: newStartIso, due_date: newDueIso, date_overridden: true
  };
  return authFetch('/api/tasks/' + task.id, {
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

function toIsoDate(d){
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// e.g. 15 (inclusive calendar days), daysPerWeek=7 -> "2w1d"; with
// daysPerWeek=5 (working-day mode, 1 working week = Mon-Fri) the same day
// count is expressed in working weeks instead.
function fmtWeeksDays(days, daysPerWeek){
  daysPerWeek = daysPerWeek || 7;
  var w = Math.floor(days / daysPerWeek), d = days % daysPerWeek;
  if (w === 0) return d + 'd';
  if (d === 0) return w + 'w';
  return w + 'w' + d + 'd';
}

// counts Mon-Fri days in [start, end] inclusive
function countWorkingDays(start, end){
  var count = 0;
  var d = new Date(start);
  d.setHours(0, 0, 0, 0);
  var last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last){
    var day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// which unit the Timeline's bar-duration labels use — toggled by the
// "Lịch"/"Working day" chip pair, default per product call: working day
var _timelineDayUnit = 'working';

// shared by the row's static duration label and the live drag tooltip —
// calendar mode groups into weeks (e.g. 7 calendar days incl. a Sat/Sun ->
// "1w"); working-day mode intentionally does NOT, it just shows the plain
// count (that same week -> "5d"), since "1 working week" as an abbreviation
// reads as ambiguous/misleading next to calendar weeks.
function formatDurationText(start, end){
  var calendarDays = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  var durationDays = _timelineDayUnit === 'working' ? countWorkingDays(start, end) : calendarDays;
  return _timelineDayUnit === 'working' ? (durationDays + 'd') : fmtWeeksDays(durationDays, 7);
}

document.querySelectorAll('#dayUnitChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#dayUnitChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _timelineDayUnit = btn.dataset.unit;
    if (_lastTimelineTasks && _lastTimelineSprints && _lastTimelinePhases){
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
    }
  });
});

// drag-to-regroup: dragging a task's label from one .cat-group to another
// changes whichever field the active group-by chip clusters by. Sprint moves
// also re-derive start_date/due_date from the target sprint (date_overridden
// reset to false) so the bar actually lands inside its new sprint's range —
// same idea as picking a new sprint in the drawer. Moving to "no sprint" has
// no sprint to derive dates from, so it keeps the task's current dates and
// marks them as a manual override instead.
var _draggingTimelineTaskId = null;

function buildGroupChangeBody(task, groupKey, sprints){
  var body = {
    category: task.category, name: task.name, platform: task.platform, status: task.status,
    phase_id: task.phase_id, sprint_id: task.sprint_id, stt: task.stt,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: task.start_date, due_date: task.due_date, date_overridden: task.date_overridden
  };
  if (_timelineGroupBy === 'category'){
    body.category = groupKey;
  } else if (_timelineGroupBy === 'platform'){
    body.platform = groupKey;
  } else if (_timelineGroupBy === 'phase'){
    body.phase_id = groupKey === 'none' ? null : Number(groupKey.slice(1));
  } else if (_timelineGroupBy === 'sprint'){
    if (groupKey === 'none'){
      body.sprint_id = null;
      body.date_overridden = true;
    } else {
      var newSprintId = Number(groupKey.slice(1));
      var sprint = sprints.filter(function(s){ return s.id === newSprintId; })[0];
      body.sprint_id = newSprintId;
      body.date_overridden = false;
      if (sprint){
        body.start_date = sprint.start_date;
        body.due_date = sprint.end_date;
      }
    }
  }
  return body;
}

function updateTaskGroup(task, groupKey, sprints){
  var body = buildGroupChangeBody(task, groupKey, sprints);
  return authFetch('/api/tasks/' + task.id, {
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

// swaps two tasks' stt (manual sort position) — a simple, low-risk way to
// let a drag-to-reorder-within-group swap two rows' positions without
// having to renumber every other task's stt to make room for an insert.
// Falls back to appending past the current max stt for whichever side (or
// both) doesn't have one yet, so tasks created without an stt can still be
// dragged into a meaningful order.
function reorderTimelineTask(draggedTask, targetTask){
  if (draggedTask.id === targetTask.id) return;
  var maxStt = _lastTimelineTasks.reduce(function(max, t){ return Math.max(max, t.stt || 0); }, 0);
  var draggedStt = draggedTask.stt != null ? draggedTask.stt : ++maxStt;
  var targetStt = targetTask.stt != null ? targetTask.stt : ++maxStt;
  if (draggedStt === targetStt) return;

  var updates = [];
  if (draggedTask.stt !== targetStt) updates.push({ task: draggedTask, newStt: targetStt });
  if (targetTask.stt !== draggedStt) updates.push({ task: targetTask, newStt: draggedStt });

  Promise.all(updates.map(function(u){
    var body = {
      category: u.task.category, name: u.task.name, platform: u.task.platform, status: u.task.status,
      phase_id: u.task.phase_id, sprint_id: u.task.sprint_id, stt: u.newStt,
      done_analyst: u.task.done_analyst, done_dev: u.task.done_dev, done_uat: u.task.done_uat, done_staging: u.task.done_staging,
      start_date: u.task.start_date, due_date: u.task.due_date, date_overridden: u.task.date_overridden
    };
    return authFetch('/api/tasks/' + u.task.id, {
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
  })).then(function(){
    refreshAllViews();
    toastSuccess('Đã đổi vị trí');
  }).catch(function(err){
    console.error('Đổi vị trí trên Timeline thất bại', err);
    toastError('Không đổi được vị trí: ' + err.message);
  });
}

function renderGantt(tasks, sprints, phases){
  var body = document.getElementById('ganttBody');
  var playFlip = captureFlipPositions(body, 'data-task-id');
  body.innerHTML = '';
  var oldOverlay = document.querySelector('.gantt-track-overlay');
  if (oldOverlay) oldOverlay.parentNode.removeChild(oldOverlay);

  // axis range must cover every sprint's start/end (the project's planned
  // calendar, even sprints with no tasks yet) AND every task's effective date
  // range — legacy pre-sprint tasks (date_overridden=true, no sprint, dated
  // well before the earliest sprint) fall outside a sprints-only range and
  // would otherwise render as bars with negative left%, overflowing into the
  // TASKS label column.
  var allDates = [];
  sprints.forEach(function(s){
    allDates.push(new Date(s.start_date), new Date(s.end_date));
  });
  tasks.forEach(function(t){
    var r = effectiveRange(t);
    if (r) { allDates.push(r.start, r.end); }
  });
  if (allDates.length === 0){
    body.innerHTML = '<div class="view-sub">Chưa có dữ liệu để hiển thị Timeline.</div>';
    return;
  }
  var axisStart = new Date(Math.min.apply(null, allDates));
  var axisEnd = new Date(Math.max.apply(null, allDates));
  var axisSpan = (axisEnd - axisStart) || 1; // guard against a zero-length axis
  function pctPos(d){ return (d - axisStart) / axisSpan * 100; }

  // give each day a real minimum pixel width instead of always squeezing the
  // whole axis to fit the viewport — .gantt scrolls horizontally once the
  // content is wider than it (header + body share this width so they stay
  // aligned; bars/day-ruler ticks inside them still use % of THIS width, so
  // no other positioning math changes). "max(100%, …)" keeps short axes
  // filling the view exactly as before instead of leaving dead space.
  var PX_PER_DAY = 8;
  var axisSpanDays = axisSpan / (24 * 60 * 60 * 1000);
  var trackPxWidth = axisSpanDays * PX_PER_DAY;
  var totalRowWidth = 186 + trackPxWidth;
  var headerEl = document.querySelector('.gantt-header');
  headerEl.style.width = 'max(100%, ' + totalRowWidth + 'px)';
  body.style.width = 'max(100%, ' + totalRowWidth + 'px)';

  renderDayRuler(axisStart, axisEnd, pctPos);

  // drag-to-move (grab the bar body) / drag-to-resize (grab an edge handle) —
  // converts the horizontal pixel delta into a whole-day delta using the same
  // axis scale as the bars themselves, live-previews the bar during the drag,
  // and on drop persists the new start/due via updateTaskDates().
  function startBarDrag(mode, downEvent, task, barEl, trackEl, origStart, origEnd, markDragged){
    if (!hasRole('editor')) return; // viewer: read-only, ignore the drag entirely
    var startX = downEvent.clientX;
    var trackWidth = trackEl.getBoundingClientRect().width;
    var msPerDay = 24 * 60 * 60 * 1000;
    var pxPerDay = (trackWidth * msPerDay) / axisSpan;
    var moved = false;
    var newStart = origStart, newEnd = origEnd;

    // shows the date range being dragged to + resulting duration, live —
    // mounted on trackEl (not barEl) since .bar has overflow:hidden, which
    // would clip a tooltip positioned above it via bottom:100%.
    var tooltip = document.createElement('div');
    tooltip.className = 'bar-drag-tooltip';
    trackEl.appendChild(tooltip);
    function updateTooltip(l, w){
      tooltip.style.left = (l + w / 2) + '%';
      tooltip.textContent = fmtDMY(toIsoDate(newStart)) + ' → ' + fmtDMY(toIsoDate(newEnd)) + ' · ' + formatDurationText(newStart, newEnd);
    }
    var initL = pctPos(origStart);
    updateTooltip(initL, Math.max(pctPos(origEnd) - initL, 0.6));

    function onMove(e){
      var deltaDays = Math.round((e.clientX - startX) / pxPerDay);
      if (deltaDays === 0 && !moved) return;
      moved = true;
      if (mode === 'move'){
        newStart = new Date(origStart); newStart.setDate(newStart.getDate() + deltaDays);
        newEnd = new Date(origEnd); newEnd.setDate(newEnd.getDate() + deltaDays);
      } else if (mode === 'resize-start'){
        newStart = new Date(origStart); newStart.setDate(newStart.getDate() + deltaDays);
        if (newStart > origEnd) newStart = new Date(origEnd);
        newEnd = origEnd;
      } else {
        newEnd = new Date(origEnd); newEnd.setDate(newEnd.getDate() + deltaDays);
        if (newEnd < origStart) newEnd = new Date(origStart);
        newStart = origStart;
      }
      var l = pctPos(newStart);
      var w = Math.max(pctPos(newEnd) - l, 0.6);
      barEl.style.left = l + '%';
      barEl.style.width = w + '%';
      updateTooltip(l, w);
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      barEl.classList.remove('bar-dragging');
      tooltip.remove();
      if (!moved) return;
      markDragged();
      updateTaskDates(task, toIsoDate(newStart), toIsoDate(newEnd))
        .then(function(){
          refreshAllViews();
          toastSuccess('Đã cập nhật ngày cho "' + task.name + '"');
        })
        .catch(function(err){
          console.error('Cập nhật ngày trên Timeline thất bại', err);
          toastError('Không cập nhật được ngày: ' + err.message);
          refreshAllViews(); // reload from the server truth to undo the live preview
        });
    }
    barEl.classList.add('bar-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // body grouped by the active group-by chip (category/sprint/phase/platform) —
  // one .cat-divider per group, one .task-row per task; groups with zero tasks
  // after filtering (e.g. "no sprint" when everything is scheduled) are skipped.
  var groups = groupsForMode(tasks, sprints, phases);

  groups.forEach(function(g){
    var groupTasks = tasks.filter(function(t){ return taskGroupKey(t) === g.key; });
    if (groupTasks.length === 0) return;

    var group = document.createElement('div'); group.className = 'cat-group';
    var divider = document.createElement('div'); divider.className = 'cat-divider';
    divider.textContent = g.label;
    group.appendChild(divider);

    group.addEventListener('dragover', function(e){
      e.preventDefault();
      group.classList.add('group-drag-over');
    });
    group.addEventListener('dragleave', function(){
      group.classList.remove('group-drag-over');
    });
    group.addEventListener('drop', function(e){
      e.preventDefault();
      group.classList.remove('group-drag-over');
      var taskId = _draggingTimelineTaskId;
      var task = tasks.filter(function(x){ return x.id === taskId; })[0];
      if (!task || taskGroupKey(task) === g.key) return;
      updateTaskGroup(task, g.key, sprints)
        .then(function(){
          refreshAllViews();
          toastSuccess('Đã đổi nhóm cho "' + task.name + '"');
        })
        .catch(function(err){
          console.error('Đổi nhóm trên Timeline thất bại', err);
          toastError('Không đổi được nhóm: ' + err.message);
        });
    });

    groupTasks.forEach(function(t){
      var range = effectiveRange(t);
      if (!range) return; // no sprint and not overridden — skip rather than crash

      var row = document.createElement('div'); row.className = 'task-row';
      row.setAttribute('data-task-id', t.id);
      var label = document.createElement('div'); label.className = 'task-label';
      label.textContent = t.name;
      label.draggable = hasRole('editor');
      label.title = hasRole('editor') ? 'Bấm để sửa · Kéo để chuyển nhóm hoặc đổi vị trí' : 'Bấm để xem';
      label.addEventListener('dragstart', function(e){
        _draggingTimelineTaskId = t.id;
        row.classList.add('row-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(t.id));
      });
      label.addEventListener('dragend', function(){
        row.classList.remove('row-dragging');
        _draggingTimelineTaskId = null;
      });
      // native HTML5 drag only kicks in once the mouse has actually moved past
      // the browser's own drag threshold, so a plain click (no movement) never
      // fires dragstart and still produces a normal click event here — no
      // extra "did it actually drag" flag needed, unlike the bar's custom drag.
      label.addEventListener('click', function(){
        openDrawer('edit', t);
      });

      // dropping directly on another row within the SAME group swaps their
      // manual positions (stt) instead of the group-level "change group"
      // behaviour — it stops propagation so the .cat-group drop handler above
      // doesn't also fire. Dropping on a row from a DIFFERENT group is left
      // to bubble up to that handler instead, since there's no "position"
      // for it to land on once its grouping field itself is changing.
      row.addEventListener('dragover', function(e){
        var draggedId = _draggingTimelineTaskId;
        var draggedTask = draggedId != null ? _lastTimelineTasks.filter(function(x){ return x.id === draggedId; })[0] : null;
        if (draggedTask && draggedTask.id !== t.id && taskGroupKey(draggedTask) === g.key){
          e.preventDefault();
          e.stopPropagation();
          row.classList.add('row-drop-target');
        }
      });
      row.addEventListener('dragleave', function(){
        row.classList.remove('row-drop-target');
      });
      row.addEventListener('drop', function(e){
        var draggedId = _draggingTimelineTaskId;
        var draggedTask = draggedId != null ? _lastTimelineTasks.filter(function(x){ return x.id === draggedId; })[0] : null;
        row.classList.remove('row-drop-target');
        if (!draggedTask || draggedTask.id === t.id || taskGroupKey(draggedTask) !== g.key) return;
        e.preventDefault();
        e.stopPropagation();
        reorderTimelineTask(draggedTask, t);
      });

      var track = document.createElement('div'); track.className = 'task-track';

      var left = pctPos(range.start);
      var width = Math.max(pctPos(range.end) - left, 0.6); // keep a visible sliver for short/zero-width ranges
      var n = statusDotToNum(t.status);
      var durationText = formatDurationText(range.start, range.end);
      var bar = document.createElement('div');
      bar.className = 'bar st-' + n;
      bar.style.left = left + '%';
      bar.style.width = width + '%';
      bar.title = t.name + ' · ' + durationText + (t.sprint_code ? ' · ' + t.sprint_code : '');
      if (!hasRole('editor')) bar.style.cursor = 'pointer';

      var durationLabel = document.createElement('span'); durationLabel.className = 'bar-duration';
      durationLabel.textContent = durationText;
      bar.appendChild(durationLabel);

      var handleL = document.createElement('div'); handleL.className = 'bar-handle bar-handle-l';
      var handleR = document.createElement('div'); handleR.className = 'bar-handle bar-handle-r';
      if (hasRole('editor')){
        bar.appendChild(handleL);
        bar.appendChild(handleR);
      }

      var dragMoved = false;
      function markDragged(){ dragMoved = true; }
      bar.addEventListener('mousedown', function(e){
        if (e.target === handleL || e.target === handleR) return;
        e.preventDefault();
        startBarDrag('move', e, t, bar, track, range.start, range.end, markDragged);
      });
      handleL.addEventListener('mousedown', function(e){
        e.preventDefault(); e.stopPropagation();
        startBarDrag('resize-start', e, t, bar, track, range.start, range.end, markDragged);
      });
      handleR.addEventListener('mousedown', function(e){
        e.preventDefault(); e.stopPropagation();
        startBarDrag('resize-end', e, t, bar, track, range.start, range.end, markDragged);
      });
      bar.addEventListener('click', function(){
        if (dragMoved){ dragMoved = false; return; }
        openDrawer('edit', t);
      });

      track.appendChild(bar);
      row.appendChild(label); row.appendChild(track);
      group.appendChild(row);
    });
    body.appendChild(group);
  });

  // overlay: day gridlines (every day, bolder on Mondays) plus the today
  // line (real current date, only if it falls within the axis range). Mounted
  // on .gantt itself (not the scrolling .gantt-body), so it stays vertically
  // pinned while gantt-body's own vertical scroll moves under it — but .gantt
  // now ALSO scrolls horizontally (see trackPxWidth above), and since the
  // overlay is a direct child of .gantt (not of the wide header/body), it
  // rides along with that horizontal scroll automatically. Positions are in
  // PIXELS against trackPxWidth rather than "%", because % on this overlay
  // would resolve against .gantt's own (narrower, viewport-clamped) box, not
  // the wider scrollable content the header/bars actually use.
  var overlayEl = document.createElement('div');
  overlayEl.className = 'gantt-track-overlay';
  var gd = new Date(axisStart);
  gd.setHours(0, 0, 0, 0);
  var gdEnd = new Date(axisEnd);
  while (gd <= gdEnd){
    var gLine = document.createElement('div');
    gLine.className = 'gantt-day-line' + (gd.getDay() === 1 ? ' is-week' : '');
    gLine.style.left = (pctPos(gd) / 100 * trackPxWidth) + 'px';
    overlayEl.appendChild(gLine);
    gd.setDate(gd.getDate() + 1);
  }
  var todayPct = pctPos(new Date());
  if (todayPct >= 0 && todayPct <= 100){
    var line = document.createElement('div');
    line.className = 'gantt-today-line';
    line.style.left = (todayPct / 100 * trackPxWidth) + 'px';
    overlayEl.appendChild(line);
  }
  var ganttEl = document.querySelector('.gantt');
  ganttEl.style.position = 'relative';
  ganttEl.appendChild(overlayEl);
  playFlip();
}

function renderStatusLegend(elementId){
  var el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = STATUS_ORDER.map(function(status, idx){
    var label = statusLabel[idx].replace(/^\d+\.\s*/, '');
    return '<span class="legend-item"><span class="legend-swatch st-' + idx + '"></span>' + escapeHtml(label) + '</span>';
  }).join('');
}
renderStatusLegend('ganttLegend');
renderStatusLegend('sprintLegend');

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

// last tasks/sprints/phases fetched for the Timeline, so changing a filter or
// group-by chip can re-render instantly without refetching from the API
var _lastTimelineTasks = null;
var _lastTimelineSprints = null;
var _lastTimelinePhases = null;

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
    if (_lastTimelineTasks && _lastTimelineSprints && _lastTimelinePhases){
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
    }
  });
});

function loadTimelineView(){
  var body = document.getElementById('ganttBody');
  return Promise.all([loadTasks(), loadSprints(), loadPhasesList()])
    .then(function(results){
      _lastTimelineTasks = results[0];
      _lastTimelineSprints = results[1];
      _lastTimelinePhases = results[2];
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
    })
    .catch(function(err){
      console.error('Failed to load Timeline data', err);
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
    phase_id: task.phase_id, sprint_id: task.sprint_id, stt: task.stt,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: task.start_date, due_date: task.due_date, date_overridden: task.date_overridden
  };
  return authFetch('/api/tasks/' + task.id, {
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
  var playFlip = captureFlipPositions(boardEl, 'data-task-id');
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
      var card = document.createElement('div'); card.className = 'card'; card.draggable = hasRole('editor');
      card.setAttribute('data-task-id', t.id);
      var sprintTag = t.sprint_code ? '<span class="tag tag-sprint">' + escapeHtml(t.sprint_code) + '</span>' : '';
      card.innerHTML = escapeHtml(t.name) +
        '<div class="card-tags">' + sprintTag + '<span class="tag">' + escapeHtml(t.category) + '</span><span class="tag">' + escapeHtml(t.platform) + '</span></div>';
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
        .then(function(){
          refreshAllViews();
          toastSuccess('Đã đổi trạng thái cho "' + task.name + '"');
        })
        .catch(function(err){
          console.error('Drag-and-drop status update failed', err);
          toastError('Không đổi được trạng thái: ' + err.message);
        });
    });

    boardEl.appendChild(col);
  });
  playFlip();
}

// populate the Board's Sprint filter once (options never change during a
// session — new sprints only ever come from a fresh Excel import)
loadSprints().then(function(sprints){
  var sel = document.getElementById('board-filter-sprint');
  sprints.forEach(function(s){
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')';
    sel.appendChild(opt);
  });
}).catch(function(err){ console.error('Failed to load sprints for Board filter', err); });

document.getElementById('board-filter-sprint').addEventListener('change', function(){
  loadBoardView();
  syncBoardQuickChips();
});

// quick chips for the two sprints people actually care about day-to-day —
// jump straight to them instead of hunting through the full Sprint dropdown
var _boardCurrentSprintId = null, _boardNextSprintId = null;

function syncBoardQuickChips(){
  var sel = document.getElementById('board-filter-sprint');
  document.querySelectorAll('#boardSprintQuick .chip').forEach(function(btn){
    var targetId = btn.dataset.quick === 'current' ? _boardCurrentSprintId : _boardNextSprintId;
    btn.disabled = targetId == null;
    btn.classList.toggle('active', targetId != null && String(targetId) === String(sel.value));
  });
}

fetchJSON('/api/sprints/current-next').then(function(data){
  _boardCurrentSprintId = data.current ? data.current.id : null;
  _boardNextSprintId = data.next ? data.next.id : null;
  syncBoardQuickChips();
}).catch(function(err){ console.error('Failed to load current/next sprint for Board quick chips', err); });

document.querySelectorAll('#boardSprintQuick .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    var targetId = btn.dataset.quick === 'current' ? _boardCurrentSprintId : _boardNextSprintId;
    if (targetId == null) return;
    document.getElementById('board-filter-sprint').value = String(targetId);
    loadBoardView();
    syncBoardQuickChips();
  });
});

function loadBoardView(){
  var boardEl = document.getElementById('board');
  return loadTasks()
    .then(function(tasks){
      var sprintFilter = document.getElementById('board-filter-sprint').value;
      var filtered = sprintFilter
        ? tasks.filter(function(t){ return String(t.sprint_id) === String(sprintFilter); })
        : tasks;
      var sel = document.getElementById('board-filter-sprint');
      var scopeLabel = sprintFilter ? sel.options[sel.selectedIndex].textContent : 'toàn bộ dự án';
      document.getElementById('boardSub').textContent = filtered.length + ' nghiệp vụ · ' + scopeLabel;
      renderBoard(filtered);
    })
    .catch(function(err){
      console.error('Failed to load Board data', err);
      boardEl.innerHTML = '<div class="view-sub">Không tải được dữ liệu Board. Thử tải lại trang.</div>';
    });
}

// ---- log: cross-task history of every start/end date change (drawer edits
// and Timeline drag/resize both funnel through the same auto-logging PUT) ----
function fmtDateTime(iso){
  var d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// pulls the day-delta(s) back out of a buildDateChangeNote()-formatted note.
// "kết thúc" (due date) delta is preferred as the representative number for
// a task, since that's the deadline actually slipping; falls back to the
// "bắt đầu" (start date) delta when only the start moved.
function isDateChangeNote(note){
  // matches both "Dịch ngày: ..." (no actor) and "Dịch ngày (Quân): ..."
  // (with one) — same for "Đổi ngày" — an exact ":"-suffixed prefix check
  // would miss every attributed entry once an actor name is inserted
  // between the label and the colon (see buildDateChangeNote server-side).
  return /^(Dịch ngày|Đổi ngày)\b/.test(note);
}

// pulls the actor's name back out as its own value, so the Log tab can show
// "who" as a distinct badge instead of leaving it buried inside the note
// text. Date-change notes carry it as "...ngày (Tên): ..."; manual notes
// carry it as a "... — Tên" suffix (see logs.js / dateChangeNote.js).
function parseActorFromNote(note){
  var m1 = note.match(/^(?:Dịch ngày|Đổi ngày)\s*\(([^)]+)\):/);
  if (m1) return m1[1];
  var m2 = note.match(/—\s*([^—]+)$/);
  if (m2) return m2[1].trim();
  return null;
}

// for display only: drops the trailing " — Tên" suffix from a manual note
// once its actor is already shown as a separate badge, so the name isn't
// printed twice. Date-change notes keep their inline "(Tên)" as-is since
// it reads naturally as part of the sentence, not a bolted-on suffix.
function stripActorSuffix(note){
  if (isDateChangeNote(note)) return note;
  return note.replace(/\s*—\s*[^—]+$/, '');
}

function parseDateChangeNote(note){
  var moveMatch = note.match(/\(([+-]\d+) ngày\)$/);
  if (note.indexOf('Dịch ngày') === 0){
    return { deltaDays: moveMatch ? Number(moveMatch[1]) : null };
  }
  var startMatch = note.match(/bắt đầu [\d/]+ → [\d/]+ \(([+-]\d+) ngày\)/);
  var endMatch = note.match(/kết thúc [\d/]+ → [\d/]+ \(([+-]\d+) ngày\)/);
  var startDelta = startMatch ? Number(startMatch[1]) : null;
  var endDelta = endMatch ? Number(endMatch[1]) : null;
  return { deltaDays: endDelta != null ? endDelta : startDelta, startDelta: startDelta, endDelta: endDelta };
}

var _logSummaryGroupBy = 'sprint';

document.querySelectorAll('#logSummaryGroupChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#logSummaryGroupChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _logSummaryGroupBy = btn.dataset.groupby;
    loadLogView();
  });
});

// one row per task (its most recent date-change entry only), clustered by
// the active chip — reuses the risk-report's card/row look since both are
// "which tasks, how much schedule slip" reports.
function renderLogSummary(dateChangeLogs, tasks, sprints, phases){
  var wrap = document.getElementById('logSummaryWrap');
  wrap.innerHTML = '';

  var taskById = {};
  tasks.forEach(function(t){ taskById[t.id] = t; });

  // dateChangeLogs is already sorted DESC by created_at, so the first entry
  // seen per task_id is that task's most recent date change.
  var latestByTask = {};
  dateChangeLogs.forEach(function(l){
    if (!(l.task_id in latestByTask)) latestByTask[l.task_id] = l;
  });

  var summaryRows = Object.keys(latestByTask).map(function(taskId){
    var l = latestByTask[taskId];
    var task = taskById[l.task_id];
    if (!task) return null;
    return { task: task, log: l, deltaDays: parseDateChangeNote(l.note).deltaDays };
  }).filter(Boolean);

  if (summaryRows.length === 0){
    wrap.innerHTML = '<div class="view-sub">Chưa có nghiệp vụ nào bị đổi ngày.</div>';
    return;
  }

  var groups, rowGroupKey;
  if (_logSummaryGroupBy === 'sprint'){
    groups = sprints.map(function(s){ return { key: s.id, label: s.code }; });
    groups.push({ key: null, label: 'Chưa gán sprint' });
    rowGroupKey = function(r){ return r.task.sprint_id; };
  } else if (_logSummaryGroupBy === 'phase'){
    groups = phases.map(function(p){ return { key: p.id, label: p.code + ': ' + p.name }; });
    groups.push({ key: null, label: 'Chưa gán phase' });
    rowGroupKey = function(r){ return r.task.phase_id; };
  } else {
    var seen = [], seenSet = {};
    summaryRows.forEach(function(r){
      var v = r.task.category;
      if (v && !seenSet[v]){ seenSet[v] = true; seen.push({ key: v, label: v }); }
    });
    groups = seen;
    rowGroupKey = function(r){ return r.task.category; };
  }

  groups.forEach(function(g){
    var rowsInGroup = summaryRows.filter(function(r){ return rowGroupKey(r) === g.key; });
    if (rowsInGroup.length === 0) return;
    rowsInGroup.sort(function(a, b){ return Math.abs(b.deltaDays || 0) - Math.abs(a.deltaDays || 0); });

    var card = document.createElement('div'); card.className = 'risk-group';
    var head = document.createElement('div'); head.className = 'risk-group-head';
    head.innerHTML = '<span>' + escapeHtml(g.label) + '</span><span class="risk-count">' + rowsInGroup.length + ' task</span>';
    card.appendChild(head);

    rowsInGroup.forEach(function(r){
      var d = r.deltaDays;
      var deltaText = d == null ? '?' : (d > 0 ? '+' + d : String(d));
      var actor = parseActorFromNote(r.log.note);
      var row = document.createElement('div'); row.className = 'risk-task';
      row.innerHTML =
        '<div class="risk-task-name">' + escapeHtml(r.task.name) +
          (actor ? ' <span class="tag tag-actor">' + escapeHtml(actor) + '</span>' : '') +
        '</div>' +
        '<div class="risk-task-meta">' +
          '<span class="risk-due">' + fmtDateTime(r.log.created_at) + '</span>' +
          '<span class="risk-days">' + deltaText + ' ngày</span>' +
        '</div>';
      row.addEventListener('click', function(){ openDrawer('edit', r.task); });
      card.appendChild(row);
    });
    wrap.appendChild(card);
  });
}

function loadLogView(){
  var wrap = document.getElementById('logListWrap');
  return Promise.all([fetchJSON('/api/logs'), loadTasks(), loadSprints(), loadPhasesList()])
    .then(function(results){
      var logs = results[0], tasks = results[1], sprints = results[2], phases = results[3];
      var taskById = {};
      tasks.forEach(function(t){ taskById[t.id] = t; });

      var dateChangeLogs = logs.filter(function(l){ return isDateChangeNote(l.note); });

      renderLogSummary(dateChangeLogs, tasks, sprints, phases);

      wrap.innerHTML = '';
      if (dateChangeLogs.length === 0){
        wrap.innerHTML = '<div class="view-sub">Chưa có nghiệp vụ nào bị đổi ngày.</div>';
        return;
      }

      dateChangeLogs.forEach(function(l){
        var task = taskById[l.task_id];
        var actor = parseActorFromNote(l.note);
        var row = document.createElement('div'); row.className = 'log-row';
        row.innerHTML =
          '<div class="log-row-time">' + fmtDateTime(l.created_at) + '</div>' +
          '<div class="log-row-body">' +
            '<div class="log-row-task">' + escapeHtml(l.task_name) +
              (actor ? ' <span class="tag tag-actor">' + escapeHtml(actor) + '</span>' : '') +
            '</div>' +
            '<div class="log-row-note">' + escapeHtml(stripActorSuffix(l.note)) + '</div>' +
          '</div>';
        if (task){
          row.addEventListener('click', function(){ openDrawer('edit', task); });
        }
        wrap.appendChild(row);
      });
    })
    .catch(function(err){
      console.error('Failed to load /api/logs', err);
      wrap.innerHTML = '<div class="view-sub">Không tải được log. Thử tải lại trang.</div>';
    });
}

loadTimelineView();
loadBoardView();
loadLogView();

// keep the drawer's Category <select> in sync with whatever custom category
// names have actually been used before, not just the 4 known defaults —
// inserted before the "+ Thêm category mới..." option, which always stays last
function addCategoryOptionIfMissing(name){
  if (!name) return;
  var sel = document.getElementById('f-cat');
  var exists = Array.from(sel.options).some(function(o){ return o.value === name; });
  if (exists) return;
  var opt = document.createElement('option');
  opt.value = name; opt.textContent = name;
  sel.insertBefore(opt, sel.querySelector('option[value="__add_new__"]'));
}

loadTasks().then(function(tasks){
  tasks.forEach(function(t){ addCategoryOptionIfMissing(t.category); });
}).catch(function(err){ console.error('Failed to load categories for f-cat', err); });

// "+ Thêm category mới..." reveals a text input; committing it (Enter or
// blur) inserts it as a real option and selects it, so the field still reads
// and behaves like a normal dropdown once a custom category has been added
function commitNewCategory(){
  var sel = document.getElementById('f-cat');
  var newInput = document.getElementById('f-cat-new');
  var name = newInput.value.trim();
  newInput.style.display = 'none';
  if (!name) { sel.value = 'Product Foundation'; return; }
  addCategoryOptionIfMissing(name);
  sel.value = name;
}

document.getElementById('f-cat').addEventListener('change', function(){
  var newInput = document.getElementById('f-cat-new');
  if (this.value === '__add_new__'){
    newInput.style.display = 'block';
    newInput.value = '';
    newInput.focus();
  } else {
    newInput.style.display = 'none';
  }
});
document.getElementById('f-cat-new').addEventListener('keydown', function(e){
  if (e.key === 'Enter'){ e.preventDefault(); commitNewCategory(); }
});
document.getElementById('f-cat-new').addEventListener('blur', commitNewCategory);

// ---- drawer: create / update / delete / activity log wiring ----
// after any task mutation, invalidate the shared tasks cache and re-run every
// loader that could be affected by it (phase rollups, sprint panel, timeline, board)
function refreshAllViews(){
  _tasksPromise = null;
  loadPhases();
  loadSprintView();
  loadTimelineView();
  loadBoardView();
  loadRiskReports();
  loadLogView();
  loadSnapshotSection();
}

// guards saveBtn/deleteBtn against double-submit (double-click, or clicking
// the other button while one request is still in flight) — both act on the
// same task, so they share one busy flag rather than tracking independently
var _drawerActionBusy = false;

document.getElementById('saveBtn').addEventListener('click', function(){
  if (_drawerActionBusy) return;
  var name = document.getElementById('f-name').value.trim();
  var category = document.getElementById('f-cat').value;
  if (category === '__add_new__'){
    category = document.getElementById('f-cat-new').value.trim();
  }
  var platform = document.getElementById('f-platform').value;
  var status = document.getElementById('f-status').value;
  var phaseVal = document.getElementById('f-phase').value;
  var sprintVal = document.getElementById('f-sprint').value;
  var startVal = document.getElementById('f-start').value || null;
  var dueVal = document.getElementById('f-due').value || null;

  if (!name || !category || !platform || !status || !startVal || !dueVal){
    toastError('Vui lòng nhập đầy đủ Tên nghiệp vụ, Category, Platform, Status, Start và Due.');
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
    stt: editingTaskId ? editingTaskStt : null,
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

  _drawerActionBusy = true;
  var saveBtnEl = document.getElementById('saveBtn');
  var deleteBtnEl = document.getElementById('deleteBtn');
  saveBtnEl.disabled = true;
  deleteBtnEl.disabled = true;
  saveBtnEl.textContent = isCreate ? 'Đang lưu...' : 'Đang lưu thay đổi...';

  authFetch(url, {
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
      return authFetch('/api/tasks/' + savedTask.id + '/logs', {
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
    toastSuccess(isCreate ? 'Đã tạo nghiệp vụ "' + name + '"' : 'Đã lưu thay đổi cho "' + name + '"');
  }).catch(function(err){
    console.error('Save task failed', err);
    toastError('Không lưu được nghiệp vụ: ' + err.message);
  }).finally(function(){
    _drawerActionBusy = false;
    saveBtnEl.disabled = false;
    deleteBtnEl.disabled = false;
    saveBtnEl.textContent = isCreate ? 'Lưu nghiệp vụ' : 'Lưu thay đổi';
  });
});

document.getElementById('deleteBtn').addEventListener('click', function(){
  if (_drawerActionBusy) return;
  if (!editingTaskId) return;
  if (!confirm('Xoá nghiệp vụ này? Không thể hoàn tác.')) return;

  _drawerActionBusy = true;
  var saveBtnEl = document.getElementById('saveBtn');
  var deleteBtnEl = document.getElementById('deleteBtn');
  saveBtnEl.disabled = true;
  deleteBtnEl.disabled = true;
  deleteBtnEl.textContent = 'Đang xoá...';

  var deletedTaskName = document.getElementById('f-name').value;
  authFetch('/api/tasks/' + editingTaskId, { method: 'DELETE' })
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
      toastSuccess('Đã xoá "' + deletedTaskName + '"');
    })
    .catch(function(err){
      console.error('Delete task failed', err);
      toastError('Không xoá được nghiệp vụ: ' + err.message);
    })
    .finally(function(){
      _drawerActionBusy = false;
      saveBtnEl.disabled = false;
      deleteBtnEl.disabled = false;
      deleteBtnEl.textContent = 'Xoá nghiệp vụ';
    });
});

// independent guard — adding a log entry doesn't touch the task itself, so
// it isn't blocked by (and doesn't block) a save/delete in flight
var _addLogBusy = false;

document.getElementById('addLogBtn').addEventListener('click', function(){
  if (_addLogBusy) return;
  var input = document.getElementById('f-newlog');
  var note = input.value.trim();
  if (!note || !editingTaskId) return;

  _addLogBusy = true;
  var addLogBtnEl = document.getElementById('addLogBtn');
  addLogBtnEl.disabled = true;
  addLogBtnEl.textContent = 'Đang thêm...';

  authFetch('/api/tasks/' + editingTaskId + '/logs', {
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
    return fetchAndRenderLogs(editingTaskId).then(function(){ toastSuccess('Đã thêm ghi chú'); });
  }).catch(function(err){
    console.error('Add log failed', err);
    toastError('Không thêm được ghi chú: ' + err.message);
  }).finally(function(){
    _addLogBusy = false;
    addLogBtnEl.disabled = false;
    addLogBtnEl.textContent = 'Thêm';
  });
});
