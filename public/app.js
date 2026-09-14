// ---- nav switching ----
document.querySelectorAll('.nav-item').forEach(function(el){
  el.addEventListener('click', function(){
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    el.classList.add('active');
    document.getElementById('view-' + el.dataset.view).classList.add('active');
    // Bảng danh sách's task-name textareas auto-grow from scrollHeight,
    // which reads as 0 for anything rendered while this view was hidden
    // (e.g. the very first render, on initial page load, before any nav
    // click) — redo it now that the view is actually visible.
    if (el.dataset.view === 'table' && typeof autoGrowAllTableTextareas === 'function') autoGrowAllTableTextareas();
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
var statusLabel = {0:'0. Backlog', 1:'1. In Analyst', 2:'2. Ready for Dev', 3:'3. In Dev', 4:'4. Done UAT', 5:'5. Done'};

// dotted status string (from the real API) -> numeric suffix used by the
// existing .pill.st-N / .bar.st-N CSS classes and the statusLabel map above.
// 'in_analyst' sits between backlog and ready_for_dev — every code from
// ready_for_dev on is shifted up one from what it used to be (see
// migrations/001_init.sql for the constraint/data migration).
var STATUS_ORDER = ['0.backlog', '1.in_analyst', '2.ready_for_dev', '3.in_test', '4.ready_for_staging', '5.done'];
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

// ---- nav rail: always collapsed to icons by default — .rail.collapsed:hover
// in styles.css handles the temporary "peek" expand on hover, no persisted
// toggle/expanded state anymore.

function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// ---- reusable multi-select dropdown filter (Timeline/Roadmap/Sprint Report) ----
// containerEl: element to render into (its content is fully replaced) — so
// callers must only invoke this on a genuine data reload (new option list),
// never from inside onChange, or every checkbox click would tear down and
// re-close the panel the user is still working in.
// buttonLabel: text shown on the closed button (plus a live "(N)" count).
// options: [{key, label}]. selected: the array to read/mutate in place —
// callers own this array's identity, so external code can also read or
// reset it directly. onChange(selected): called after every toggle.
// defaultSelectAll: if true, the FIRST time this is ever called for a given
// `selected` array, it's populated with every option key (a flag stashed on
// the array itself makes this one-time — later rebuilds, e.g. after a real
// data reload, never stomp a selection the user already made, including an
// intentionally-cleared one).
// opts.allowAddNew: if true, adds a "+ Thêm ... mới" row at the bottom of the
// panel (same reveal-a-text-input UX as the category field's "+ Thêm category
// mới...") that appends a new option to `options` in place, selects it, and
// re-renders — used by the drawer's "Resource cần" role picker so new
// teams/roles are addable without a separate admin screen.
function renderMultiSelectDropdown(containerEl, buttonLabel, options, selected, onChange, defaultSelectAll, opts){
  if (defaultSelectAll && !selected._msInitialized){
    selected._msInitialized = true;
    options.forEach(function(opt){ if (selected.indexOf(opt.key) === -1) selected.push(opt.key); });
  }
  containerEl.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'multiselect';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'multiselect-btn';
  var panel = document.createElement('div'); panel.className = 'multiselect-panel';
  // anchor the panel to the button's RIGHT edge instead of its left — for
  // a trigger sitting near the page's right edge (e.g. the Table view's
  // "Cột" button), the default left-anchor lets a wide panel spill off the
  // right side of the viewport and force a horizontal scrollbar; opening
  // it inward (growing leftward) instead keeps it fully on-screen.
  if (opts && opts.alignRight) panel.classList.add('multiselect-panel-right');
  panel.style.display = 'none';

  function updateBtn(){
    btn.textContent = buttonLabel + (selected.length ? ' (' + selected.length + ')' : '');
    btn.classList.toggle('active', selected.length > 0);
  }

  var actions = document.createElement('div'); actions.className = 'multiselect-actions';
  var selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button'; selectAllBtn.className = 'multiselect-action-btn'; selectAllBtn.textContent = 'Chọn tất cả';
  var clearBtn = document.createElement('button');
  clearBtn.type = 'button'; clearBtn.className = 'multiselect-action-btn'; clearBtn.textContent = 'Bỏ chọn';
  actions.appendChild(selectAllBtn); actions.appendChild(clearBtn);
  panel.appendChild(actions);

  var checkboxes = [];
  options.forEach(function(opt){
    var row = document.createElement('label'); row.className = 'multiselect-option';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.indexOf(opt.key) !== -1;
    cb.addEventListener('change', function(){
      var idx = selected.indexOf(opt.key);
      if (cb.checked && idx === -1) selected.push(opt.key);
      else if (!cb.checked && idx !== -1) selected.splice(idx, 1);
      updateBtn();
      onChange(selected);
    });
    row.appendChild(cb);
    row.appendChild(document.createTextNode(opt.label));
    panel.appendChild(row);
    checkboxes.push({ cb: cb, key: opt.key });
  });

  selectAllBtn.addEventListener('click', function(){
    selected.length = 0;
    options.forEach(function(opt){ selected.push(opt.key); });
    checkboxes.forEach(function(c){ c.cb.checked = true; });
    updateBtn();
    onChange(selected);
  });
  clearBtn.addEventListener('click', function(){
    selected.length = 0;
    checkboxes.forEach(function(c){ c.cb.checked = false; });
    updateBtn();
    onChange(selected);
  });

  if (opts && opts.allowAddNew){
    var addRow = document.createElement('div'); addRow.className = 'multiselect-add-new';
    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'multiselect-action-btn';
    addBtn.textContent = opts.addNewLabel || '+ Thêm mục mới...';
    var addInput = document.createElement('input');
    addInput.type = 'text'; addInput.placeholder = opts.addNewPlaceholder || 'Nhập tên mới, Enter để xác nhận';
    addInput.style.display = 'none';
    addBtn.addEventListener('click', function(){
      addBtn.style.display = 'none';
      addInput.style.display = '';
      addInput.focus();
    });
    function commitAddNew(val){
      if (!options.some(function(o){ return o.key === val; })) options.push({ key: val, label: val });
      if (selected.indexOf(val) === -1) selected.push(val);
      onChange(selected);
      renderMultiSelectDropdown(containerEl, buttonLabel, options, selected, onChange, defaultSelectAll, opts);
      var reopenPanel = containerEl.querySelector('.multiselect-panel');
      if (reopenPanel) reopenPanel.style.display = 'flex';
    }
    addInput.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      var val = addInput.value.trim();
      if (!val) return;
      // onAddNew: optional async persistence hook (e.g. POST /api/resource-roles)
      // — if given, the option/selection only get added once it succeeds, so a
      // rejected duplicate name etc. doesn't leave a phantom local-only option.
      if (opts.onAddNew){
        addInput.disabled = true;
        Promise.resolve(opts.onAddNew(val))
          .then(function(){ commitAddNew(val); })
          .catch(function(err){
            addInput.disabled = false;
            toastError(err.message || 'Không thêm được.');
          });
      } else {
        commitAddNew(val);
      }
    });
    addRow.appendChild(addBtn);
    addRow.appendChild(addInput);
    panel.appendChild(addRow);
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    var willOpen = panel.style.display === 'none';
    document.querySelectorAll('.multiselect-panel').forEach(function(p){ p.style.display = 'none'; });
    panel.style.display = willOpen ? 'flex' : 'none';
  });
  panel.addEventListener('click', function(e){ e.stopPropagation(); });

  updateBtn();
  wrap.appendChild(btn);
  wrap.appendChild(panel);
  containerEl.appendChild(wrap);
}
document.addEventListener('click', function(){
  document.querySelectorAll('.multiselect-panel').forEach(function(p){ p.style.display = 'none'; });
});

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
// bumped on every openDrawer call — lets a load's async .then()/.catch() tell
// whether it's still the MOST RECENT open (and so should hide the loading
// overlay / populate fields) or a stale one superseded by a newer open
// (close+reopen before the first load finished), in which case it no-ops.
var _drawerLoadToken = 0;
// the Analyst/Dev/UAT/Staging completion flags of the task currently being edited.
// These have no form fields in this drawer (they come from the Excel import and
// are tracked separately from the Kanban `status`) — we must pass them straight
// through on save or the PUT handler's `!!b.done_analyst` (etc.) will wipe them
// to false. null while in "create" mode, where a brand-new task has none yet.
var editingTaskDoneFlags = null;
// the manual sort position of the task currently being edited (from the
// Timeline's drag-to-reorder) — has no form field, so must be passed straight
// through on save or the PUT handler would wipe it to null. In "create" mode
// this is set to max(existing STT)+1 once openDrawer's data loads (see
// below), not left null — a brand-new task used to get no STT at all,
// which is exactly why some rows have no sequence number in Bảng danh sách.
var editingTaskStt = null;
// whether the task currently being edited already had date_overridden=true when
// loaded. manualDateEdit alone can't detect this — it only tracks hand-edits
// made THIS drawer session, so it resets to false on every open and can't see
// an existing override from a previous save. Without this, editing a task that
// has both a sprint AND hand-set override dates (so !sprintVal is false) would
// compute date_overridden=false on save and silently wipe the override's dates.
var editingTaskWasOverridden = false;
// the due_date the task had when the drawer was opened — compared against
// f-due on save to detect a date change, and checked against today to
// decide whether a "Cập nhật tình trạng task" note is mandatory (see
// dueDateIsDueOrOverdue). null in "create" mode, where there's no prior
// due date to compare against.
var editingTaskOriginalDueDate = null;
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

// only manually-typed notes are editable — a date-change note is an
// auto-generated audit record (see dateChangeNote.js) the server itself
// refuses to modify, so there's no point offering an edit control for it.
function renderLogPreviewList(taskId, logs){
  var preview = document.getElementById('logPreview');
  if (logs.length === 0){
    preview.innerHTML = '<div class="view-sub">Chưa có ghi chú nào.</div>';
    return;
  }
  preview.innerHTML = '';
  logs.forEach(function(l){
    var canEditThis = hasRole('editor') && !isDateChangeNote(l.note);
    var actor = parseActorFromNote(l.note);
    var item = document.createElement('div'); item.className = 'log-item';
    item.innerHTML =
      '<div class="log-item-head">' +
        '<span class="log-date">' + fmtDMY(String(l.created_at).slice(0,10)) + '</span>' +
        (canEditThis ? '<button type="button" class="log-edit-btn">Sửa</button>' : '') +
      '</div>' +
      '<div class="log-item-note">' + escapeHtml(stripActorSuffix(l.note)) + '</div>' +
      (actor ? '<span class="tag tag-actor">' + escapeHtml(actor) + '</span>' : '');
    if (canEditThis){
      item.querySelector('.log-edit-btn').addEventListener('click', function(){
        startEditingLog(taskId, l, item);
      });
    }
    preview.appendChild(item);
  });
}

function startEditingLog(taskId, log, itemEl){
  var noteText = stripActorSuffix(log.note);
  itemEl.innerHTML =
    '<textarea class="log-edit-textarea" rows="3"></textarea>' +
    '<div class="log-edit-actions">' +
      '<button type="button" class="save-btn log-edit-save" style="width:auto; padding:6px 12px; margin-bottom:0;">Lưu</button>' +
      '<button type="button" class="chip log-edit-cancel">Hủy</button>' +
    '</div>';
  var textarea = itemEl.querySelector('.log-edit-textarea');
  textarea.value = noteText; // set as a value, not interpolated into innerHTML, so it round-trips exactly
  textarea.focus();
  itemEl.querySelector('.log-edit-cancel').addEventListener('click', function(){
    fetchAndRenderLogs(taskId);
  });
  itemEl.querySelector('.log-edit-save').addEventListener('click', function(){
    var newNote = textarea.value.trim();
    if (!newNote){
      toastError('Ghi chú không được để trống.');
      return;
    }
    authFetch('/api/tasks/' + taskId + '/logs/' + log.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: newNote })
    }).then(function(res){
      if (!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(errBody){
          throw new Error(errBody.error || ('HTTP ' + res.status));
        });
      }
      toastSuccess('Đã cập nhật log');
      return fetchAndRenderLogs(taskId);
    }).catch(function(err){
      console.error('Failed to update log', err);
      toastError('Không cập nhật được: ' + err.message);
    });
  });
}

function fetchAndRenderLogs(taskId){
  var preview = document.getElementById('logPreview');
  preview.innerHTML = '<div class="view-sub">Đang tải...</div>';
  return fetchJSON('/api/tasks/' + taskId + '/logs')
    .then(function(logs){
      renderLogPreviewList(taskId, logs);
    })
    .catch(function(err){
      console.error('Failed to load activity log', err);
      preview.innerHTML = '<div class="view-sub">Không tải được nhật ký.</div>';
    });
}

// ---- resource roles (Resource cần): which teams a task needs (PO, ITBA,
// BE Dev, App Dev, Web Dev, Core, by default, but fully managed via
// /api/resource-roles — see the Resource view's team add/rename/delete
// controls). Deliberately named apart from the existing `platform` field
// (Web/App) — platform is which team OWNS a task (single-select), this
// is which teams' effort it NEEDS (multi-select, e.g. a task can need both
// BE Dev and App Dev).
var _resourceRolesPromise = null;
function loadResourceRoles(){
  if (!_resourceRolesPromise) _resourceRolesPromise = fetchJSON('/api/resource-roles');
  return _resourceRolesPromise;
}
// shared by the drawer's "+ Thêm team mới..." and the Resource matrix's
// "+ Thêm team" — both need the same persist-then-invalidate-cache flow.
function addResourceRole(name){
  return authFetch('/api/resource-roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name })
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
    _resourceRolesPromise = null;
  });
}

// inline, always-visible checkbox group for the drawer's "Resource cần"
// field — unlike the dropdown-panel multiselect used for Timeline/Sprint
// Report filters, ticking a team here shouldn't require opening a panel
// first, so this renders every option directly with the "+ Thêm team
// mới..." affordance inline alongside them.
function renderResourceRoleCheckboxes(containerEl, options, selected, canEdit){
  containerEl.innerHTML = '';
  var group = document.createElement('div'); group.className = 'resource-checkbox-group';

  options.forEach(function(opt){
    var label = document.createElement('label'); label.className = 'resource-checkbox-chip';
    var cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = selected.indexOf(opt.key) !== -1;
    cb.disabled = !canEdit;
    cb.addEventListener('change', function(){
      var idx = selected.indexOf(opt.key);
      if (cb.checked && idx === -1) selected.push(opt.key);
      else if (!cb.checked && idx !== -1) selected.splice(idx, 1);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt.label));
    group.appendChild(label);
  });

  if (canEdit){
    var addWrap = document.createElement('span'); addWrap.className = 'resource-checkbox-add-new';
    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'multiselect-action-btn'; addBtn.textContent = '+ Thêm team mới...';
    var addInput = document.createElement('input');
    addInput.type = 'text'; addInput.placeholder = 'Nhập tên team mới, Enter để xác nhận'; addInput.style.display = 'none';
    addBtn.addEventListener('click', function(){
      addBtn.style.display = 'none';
      addInput.style.display = '';
      addInput.focus();
    });
    addInput.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      var val = addInput.value.trim();
      if (!val) return;
      addInput.disabled = true;
      addResourceRole(val).then(function(){
        if (!options.some(function(o){ return o.key === val; })) options.push({ key: val, label: val });
        if (selected.indexOf(val) === -1) selected.push(val);
        renderResourceRoleCheckboxes(containerEl, options, selected, canEdit);
      }).catch(function(err){
        addInput.disabled = false;
        toastError(err.message || 'Không thêm được.');
      });
    });
    addWrap.appendChild(addBtn);
    addWrap.appendChild(addInput);
    group.appendChild(addWrap);
  }

  containerEl.appendChild(group);
}
var _drawerResourceRoles = [];
// every task the drawer's last load saw — stashed here (not just used
// inline) so both the clone name-suggester and the Save handler's
// duplicate-name check can use it without an extra fetch.
var _drawerAllTasks = [];
// "<name>" -> "<name> (Copy)", or " (Copy 2)", " (Copy 3)"... the first one
// that doesn't collide with an existing task name (case/whitespace
// insensitive) — so a clone opens already save-able instead of immediately
// tripping the duplicate-name check below.
function suggestCloneName(baseName, allTasks){
  var taken = {};
  (allTasks || []).forEach(function(t){ taken[(t.name || '').trim().toLowerCase()] = true; });
  var n = 1, candidate;
  do {
    candidate = baseName + (n === 1 ? ' (Copy)' : ' (Copy ' + n + ')');
    n++;
  } while (taken[candidate.trim().toLowerCase()]);
  return candidate;
}

// Platform: same single-value field as before (still one platform per
// task — every group-by/report/export downstream still assumes a scalar),
// just rendered as tick chips instead of a <select> for faster picking.
// Reuses the exact ".resource-checkbox-chip" visual (containerEl already
// carries "resource-checkbox-group"), with radio inputs sharing one `name`
// so the browser enforces single-select natively — no manual exclusivity
// bookkeeping needed like the real multi-select checkboxes above.
// BE and App/Auto folded into App (see migrations/001_init.sql) — Platform
// is just these 2 now.
var PLATFORM_OPTIONS = ['Web', 'App'];
function renderPlatformChips(containerEl, selectedValue, canEdit){
  containerEl.innerHTML = '';
  PLATFORM_OPTIONS.forEach(function(opt){
    var label = document.createElement('label'); label.className = 'resource-checkbox-chip';
    var radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'f-platform-radio'; radio.value = opt;
    radio.checked = opt === selectedValue;
    radio.disabled = !canEdit;
    label.appendChild(radio);
    label.appendChild(document.createTextNode(opt));
    containerEl.appendChild(label);
  });
}
function getSelectedPlatform(){
  var checked = document.querySelector('#f-platform-chips input[type=radio]:checked');
  return checked ? checked.value : '';
}

function openDrawer(mode, t){
  t = t || {};
  var isEdit = mode === 'edit';
  // clone: opens as a not-yet-saved create, pre-filled from an existing
  // task (`t`/its id below) instead of blank defaults — editingTaskId stays
  // null the whole time (Save hits POST, same as a plain create) so there's
  // no way for it to accidentally overwrite the task it was cloned from.
  var isClone = mode === 'clone';
  var cloneSourceId = isClone ? (t && typeof t === 'object' ? t.id : t) : null;
  var loadToken = ++_drawerLoadToken;

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
  editingTaskOriginalDueDate = null;

  // viewer: read-only (no save/delete, no adding a note, fields disabled) —
  // still allowed to open the drawer and look, since "chỉ xem" means read
  // access, not no access. editor: can save but not delete.
  var canEdit = hasRole('editor');
  var canDelete = hasRole('admin');

  document.getElementById('drawerTitle').textContent = isEdit ? 'Sửa nghiệp vụ' : (isClone ? 'Nhân bản nghiệp vụ' : 'Nghiệp vụ mới');
  document.getElementById('drawerSub').textContent = isEdit
    ? 'Cập nhật thông tin cho nghiệp vụ này'
    : isClone ? 'Bản sao — chỉnh sửa rồi lưu để tạo thành nghiệp vụ mới'
    : 'Các trường giữ nguyên như sheet Nghiệp vụ hiện tại';
  document.getElementById('saveBtn').style.display = canEdit ? '' : 'none';
  document.getElementById('saveBtn').textContent = isEdit ? 'Lưu thay đổi' : 'Lưu nghiệp vụ';
  document.getElementById('saveBtn').disabled = false;
  // clone is only offered from an already-saved task, so only in edit mode.
  document.getElementById('cloneBtn').style.display = (isEdit && canEdit) ? 'flex' : 'none';
  document.getElementById('cloneBtn').disabled = false;
  document.getElementById('deleteBtn').style.display = (isEdit && canDelete) ? 'flex' : 'none';
  document.getElementById('deleteBtn').disabled = false;
  // always visible (not just isEdit) — "Ghi chú" was removed as a separate
  // create-only field, so this is now the single place to write a note on
  // both create and edit; the placeholder below explains what happens to it
  // in each mode.
  document.getElementById('logField').style.display = 'block';
  document.getElementById('f-newlog').style.display = canEdit ? '' : 'none';
  document.getElementById('f-newlog').placeholder = isEdit
    ? 'Ghi chú mới — sẽ được lưu cùng lúc bấm "Lưu thay đổi"'
    : 'Ghi chú ban đầu (tuỳ chọn) — sẽ được lưu cùng lúc tạo nghiệp vụ';
  document.getElementById('f-newlog').value = '';
  manualDateEdit = false;

  ['f-cat', 'f-cat-new', 'f-name', 'f-why', 'f-phase', 'f-sprint', 'f-status', 'f-start', 'f-due'].forEach(function(id){
    document.getElementById(id).disabled = !canEdit;
  });

  overlay.classList.add('show'); drawer.classList.add('show');
  document.getElementById('drawerLoadingText').textContent = 'Đang tải...';
  document.getElementById('drawerLoading').style.display = 'flex';

  // always loaded (not just isEdit) so the "Resource cần" picker's option
  // list is available in create mode too; loadTasks() is cached, so this
  // costs nothing extra once the app's initial load has already fetched it.
  Promise.all([loadPhasesList(), loadSprints(), loadTasks(), fetchJSON('/api/sprints/current-next'), loadResourceRoles()])
    .then(function(results){
      if (loadToken !== _drawerLoadToken) return; // superseded by a newer openDrawer call
      var phases = results[0], sprints = results[1], allTasks = results[2], currentNext = results[3], roles = results[4];
      var currentSprintId = currentNext.current ? currentNext.current.id : null;
      var nextSprint = currentNext.next || null;
      // same "current phase" rule as the phase pivot in Bảng danh sách
      // (renderPhaseSummary/_tableSummaryPhaseIdx) and the Roadmap's
      // isCurrentPhase: the first phase, in order, that isn't 100% done yet.
      var currentPhase = phases.find(function(p){ return p.pct_complete !== null && p.pct_complete < 100; }) || null;
      _drawerAllTasks = allTasks || [];

      var roleOptions = roles.map(function(r){ return { key: r.name, label: r.name }; });

      populateSelectOptions(document.getElementById('f-phase'), phases, function(p){
        return p.code + ': ' + p.name + ' (' + fmtDMY(p.target_date) + ')';
      }, '— không có —');
      populateSelectOptions(document.getElementById('f-sprint'), sprints, function(s){
        return s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')' + (s.id === currentSprintId ? ' — sprint hiện tại' : '');
      }, '— không có —');

      // create/clone both default to "phase hiện tại + sprint tiếp theo" —
      // a task being newly added (or a clone of one) is future work, not
      // something that belongs in a sprint already running. Dates follow
      // the sprint, same as picking it by hand would (see f-sprint's own
      // 'change' listener) — falls back to blank/unset if either is
      // unavailable (no phase in progress, or no sprint planned after
      // the current one), same as before this default existed.
      function applyDefaultPhaseSprint(){
        document.getElementById('f-phase').value = currentPhase ? String(currentPhase.id) : '';
        document.getElementById('f-sprint').value = nextSprint ? String(nextSprint.id) : '';
        document.getElementById('f-start').value = nextSprint ? nextSprint.start_date : '';
        document.getElementById('f-due').value = nextSprint ? nextSprint.end_date : '';
      }

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
        editingTaskOriginalDueDate = full.due_date || null;
        document.getElementById('f-name').value = full.name || '';
        document.getElementById('f-why').value = full.why || '';
        addCategoryOptionIfMissing(full.category);
        document.getElementById('f-cat').value = full.category || '';
        document.getElementById('f-cat-new').style.display = 'none';
        renderPlatformChips(document.getElementById('f-platform-chips'), full.platform || PLATFORM_OPTIONS[0], canEdit);
        document.getElementById('f-status').value = full.status || STATUS_ORDER[0];
        document.getElementById('f-phase').value = full.phase_id != null ? String(full.phase_id) : '';
        document.getElementById('f-sprint').value = full.sprint_id != null ? String(full.sprint_id) : '';
        document.getElementById('f-start').value = full.start_date || '';
        document.getElementById('f-due').value = full.due_date || '';
        fetchAndRenderLogs(full.id);
        _drawerResourceRoles = (full.resource_roles || []).slice();
      } else if (isClone){
        // same "next STT" auto-assign as a plain create — this becomes a
        // brand new task on Save, not a copy of the source's STT/position.
        var source = (allTasks || []).filter(function(x){ return x.id === cloneSourceId; })[0] || t;
        editingTaskStt = allTasks.reduce(function(max, x){ return x.stt != null && x.stt > max ? x.stt : max; }, 0) + 1;
        document.getElementById('f-name').value = suggestCloneName(source.name || '', allTasks);
        document.getElementById('f-why').value = source.why || '';
        addCategoryOptionIfMissing(source.category);
        document.getElementById('f-cat').value = source.category || '';
        document.getElementById('f-cat-new').style.display = 'none';
        renderPlatformChips(document.getElementById('f-platform-chips'), source.platform || PLATFORM_OPTIONS[0], canEdit);
        document.getElementById('f-status').value = source.status || STATUS_ORDER[0];
        // phase/sprint/dates default forward (current phase, next sprint) —
        // NOT copied from the source, which is very likely sitting in a
        // phase/sprint already past.
        applyDefaultPhaseSprint();
        // a clone is a new task with its own story — it doesn't inherit the
        // source's activity log (fetchAndRenderLogs is only for isEdit).
        document.getElementById('logPreview').innerHTML = '';
        _drawerResourceRoles = (source.resource_roles || []).slice();
      } else {
        // auto-assign the next STT rather than leaving it null — every task
        // created through this drawer used to have no sequence number at
        // all (only rows from the original Excel import ever got one),
        // which is exactly why "Bảng danh sách" sorts by STT show gaps.
        editingTaskStt = allTasks.reduce(function(max, t){ return t.stt != null && t.stt > max ? t.stt : max; }, 0) + 1;
        document.getElementById('f-name').value = '';
        document.getElementById('f-why').value = '';
        document.getElementById('f-cat').value = 'TTT New - Product Foundation';
        document.getElementById('f-cat-new').style.display = 'none';
        renderPlatformChips(document.getElementById('f-platform-chips'), PLATFORM_OPTIONS[0], canEdit);
        document.getElementById('f-status').value = STATUS_ORDER[0];
        applyDefaultPhaseSprint();
        document.getElementById('logPreview').innerHTML = '';
        _drawerResourceRoles = [];
      }
      renderResourceRoleCheckboxes(document.getElementById('f-resource-roles-ms'), roleOptions, _drawerResourceRoles, canEdit);
      updateGenerateWhyBtnState();
      document.getElementById('drawerLoading').style.display = 'none';
    })
    .catch(function(err){
      if (loadToken !== _drawerLoadToken) return; // superseded by a newer openDrawer call
      console.error('Failed to load drawer reference data', err);
      document.getElementById('drawerLoading').style.display = 'none';
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
// re-opens the SAME drawer already showing this task, now pre-filled as a
// not-yet-saved clone — reuses openDrawer's normal load/populate path
// rather than a bespoke copy routine.
document.getElementById('cloneBtn').addEventListener('click', function(){
  if (_drawerActionBusy || !editingTaskId) return;
  openDrawer('clone', editingTaskId);
});
// closeDrawer/overlay only close on a DIRECT user click while nothing is
// saving — a save/delete request in flight keeps going in the background
// regardless of what the UI shows, so letting the user escape mid-request
// (then navigate away or close the tab) was a real way to lose an edit
// that looked "cancelled" but was actually still in flight. The drawer's
// own internal close() calls (after a save/delete actually finishes) are
// unaffected since they call close() directly, not through these guards.
document.getElementById('closeDrawer').addEventListener('click', function(){
  if (_drawerActionBusy) return;
  close();
});
overlay.addEventListener('click', function(){
  if (_drawerActionBusy) return;
  close();
});
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

// ---- AI "why" suggestion — enabled only once Tên nghiệp vụ is filled (an
// empty/placeholder name gives the LLM nothing to reason about), and only
// for whoever could actually save the result (editor+, same as every other
// field in this drawer). Purely fills the textarea client-side — nothing
// is persisted until the user hits Lưu like normal. ----
function updateGenerateWhyBtnState(){
  var btn = document.getElementById('generateWhyBtn');
  var hasName = document.getElementById('f-name').value.trim().length > 0;
  var canUse = hasRole('editor') && hasName;
  btn.disabled = !canUse;
  btn.title = canUse ? '' : 'Nhập Tên nghiệp vụ trước';
}
document.getElementById('f-name').addEventListener('input', updateGenerateWhyBtnState);

document.getElementById('generateWhyBtn').addEventListener('click', function(){
  var btn = this;
  var name = document.getElementById('f-name').value.trim();
  if (!name) return;
  var category = document.getElementById('f-cat').value;
  if (category === '__add_new__') category = document.getElementById('f-cat-new').value.trim();
  var platform = getSelectedPlatform();

  btn.disabled = true;
  var originalLabel = btn.textContent;
  btn.textContent = 'Đang tạo...';
  authFetch('/api/ai-suggestions/why', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, category: category, platform: platform })
  })
    .then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        return body;
      });
    })
    .then(function(body){
      document.getElementById('f-why').value = body.content || '';
    })
    .catch(function(err){
      console.error('Failed to generate why suggestion', err);
      toastError('Không tạo được gợi ý: ' + err.message);
    })
    .finally(function(){
      btn.textContent = originalLabel;
      updateGenerateWhyBtnState();
    });
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

// ---- who's making the change: sent as headers on every mutating request so
// the backend can attribute activity-log entries to a display name, and look
// up the actor's role by their verified Google email. This is a soft
// accountability gate, not real security — Google sign-in only happens once
// at login, then the email is just remembered in localStorage; anyone
// reading the page source or calling the API directly can bypass it
// entirely by sending whatever header they want. ----
var ACTOR_NAME_KEY = 'ttt_actor_name';
var ACTOR_EMAIL_KEY = 'ttt_actor_email';
var ACTOR_ROLE_KEY = 'ttt_actor_role';
var LOGGED_IN_KEY = 'ttt_logged_in';
function getActorName(){ return localStorage.getItem(ACTOR_NAME_KEY) || ''; }
function getActorEmail(){ return localStorage.getItem(ACTOR_EMAIL_KEY) || ''; }
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
  options.headers = Object.assign({}, options.headers, {
    'X-Actor-Name': encodeURIComponent(getActorName()),
    'X-Actor-Email': encodeURIComponent(getActorEmail())
  });
  return fetch(url, options);
}

// show/hide the controls a role can't use — hides "+ Nghiệp vụ mới" and the
// Users nav item (admin only). Timeline/Sprint render at page load,
// BEFORE login finishes (the overlay just covers them visually,
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
  var email = getActorEmail();
  if (!email) return Promise.resolve();
  return fetchJSON('/api/users').then(function(users){
    var match = users.filter(function(u){ return u.email === email; })[0];
    localStorage.setItem(ACTOR_ROLE_KEY, match ? match.role : 'viewer');
  }).catch(function(err){
    console.error('Failed to refresh actor role', err);
  });
}

function applyRoleUI(){
  document.getElementById('openDrawer').style.display = hasRole('editor') ? '' : 'none';
  document.getElementById('navUsers').style.display = hasRole('admin') ? '' : 'none';
  var nameEl = document.getElementById('userChipName');
  if (nameEl) nameEl.textContent = getActorName() + ' · ' + ROLE_DISPLAY[getActorRole()];
  if (typeof refreshAllViews === 'function') refreshAllViews();
}

function logout(){
  localStorage.removeItem(ACTOR_NAME_KEY);
  localStorage.removeItem(ACTOR_EMAIL_KEY);
  localStorage.removeItem(ACTOR_ROLE_KEY);
  localStorage.removeItem(LOGGED_IN_KEY);
  // otherwise Google's "One Tap" auto-select can silently sign the same
  // browser profile straight back in on the next page load, defeating the
  // point of an explicit logout.
  if (window.google && window.google.accounts && window.google.accounts.id){
    window.google.accounts.id.disableAutoSelect();
  }
  location.reload();
}
document.getElementById('logoutBtn').addEventListener('click', logout);

(function initLogin(){
  var overlay = document.getElementById('loginOverlay');
  var errEl = document.getElementById('loginError');

  function showError(msg){
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  if (localStorage.getItem(LOGGED_IN_KEY) === '1' && getActorEmail()){
    overlay.style.display = 'none';
    refreshActorRole().then(applyRoleUI);
    return;
  }

  // the verified email is what actually matters (role lookup, log
  // attribution security); the display name is Google's own name for
  // that account, used only to make logs/toasts read like a person, not
  // an email address.
  function handleGoogleCredential(response){
    errEl.style.display = 'none';
    fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){ return { ok: res.ok, body: body }; });
    }).then(function(result){
      if (!result.ok){
        showError(result.body.error || 'Đăng nhập thất bại.');
        return;
      }
      localStorage.setItem(ACTOR_EMAIL_KEY, result.body.email);
      localStorage.setItem(ACTOR_NAME_KEY, result.body.name || result.body.email);
      localStorage.setItem(ACTOR_ROLE_KEY, result.body.role || 'viewer');
      localStorage.setItem(LOGGED_IN_KEY, '1');
      overlay.style.display = 'none';
      applyRoleUI();
    }).catch(function(err){
      showError('Lỗi kết nối: ' + err.message);
    });
  }

  fetchJSON('/api/config').then(function(config){
    if (!config.googleClientId){
      showError('Google Client ID chưa được cấu hình. Liên hệ admin.');
      return;
    }
    // accounts.google.com/gsi/client loads async — GSI itself, not this
    // fetch, is the slower of the two in practice, so by the time config
    // arrives `google` is almost always already on window; poll briefly
    // just in case the script is still loading.
    function whenGoogleReady(cb){
      if (window.google && window.google.accounts && window.google.accounts.id) return cb();
      setTimeout(function(){ whenGoogleReady(cb); }, 50);
    }
    whenGoogleReady(function(){
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleCredential
      });
      google.accounts.id.renderButton(document.getElementById('googleSignInButton'), {
        theme: 'outline', size: 'large', width: 280
      });
    });
  }).catch(function(err){
    console.error('Failed to load Google sign-in config', err);
    showError('Không tải được cấu hình đăng nhập. Thử tải lại trang.');
  });
})();

// ---- date formatting helpers (API always returns plain 'YYYY-MM-DD' strings) ----
function ddmm(iso){ var p = iso.split('-'); return p[2] + '/' + p[1]; }
function fmtDMY(iso){ var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtRange(startIso, endIso){ return ddmm(startIso) + '–' + ddmm(endIso); }
// a full timestamp (status-transition stamp) → "dd/mm/yyyy HH:mm" local; '' for null.
function fmtStamp(iso){
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var p = function(n){ return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ---- roadmap: phase cards + master axis (fetched from /api/phases) ----
var _roadmapPctMode = 'done_dev_qc'; // 'done_dev_qc' (Done UAT) or 'golive'
var _lastPhases = null;

// headline %: backend's pct_complete is always done_dev_qc/total, so that
// mode reads straight off it; golive mode is derived client-side from the
// raw golive count so the toggle doesn't need a second backend field.
function phasePct(phase){
  if (_roadmapPctMode === 'golive'){
    return phase.total === 0 ? null : Math.round((phase.golive / phase.total) * 1000) / 10;
  }
  return phase.pct_complete;
}

function funnelLine(label, count, total){
  if (total === 0) return '<div>' + label + ' <span class="n">–</span></div>';
  if (count === 0 || count === total) return '<div>' + label + ' <span class="n">' + count + '/' + total + '</span></div>';
  var pct = Math.round((count / total) * 1000) / 10;
  return '<div>' + label + ' <span class="n">' + count + '/' + total + ' · ' + pct + '%</span></div>';
}
function analystLine(count, total){
  if (total === 0) return '<div>Done Analyst <span class="n">–</span></div>';
  return '<div>Done Analyst <span class="n">' + count + '/' + total + '</span></div>';
}

function isCurrentPhase(phase, allPhases){
  var firstInProgress = allPhases.find(function(p){ var pct = phasePct(p); return pct !== null && pct < 100; });
  return firstInProgress ? phase.code === firstInProgress.code : false;
}

function renderPhaseCard(phase, allPhases){
  var card = document.createElement('div');
  card.className = 'phase-card' + (isCurrentPhase(phase, allPhases) ? ' is-current' : '');
  card.dataset.phaseId = phase.id;

  var editBtnHtml = hasRole('admin')
    ? '<button type="button" class="phase-edit-btn" title="Sửa mốc golive">✎</button>'
    : '';

  var pct = phasePct(phase);
  var pctText = pct === null ? '—' : Math.round(pct) + '%';
  var barWidth = pct === null ? 0 : pct;
  var barColor = pct === null
    ? 'transparent'
    : (pct === 100 ? 'var(--green-ink)' : 'var(--accent-ink)');

  var daysText = phase.days_remaining >= 0
    ? 'còn ' + phase.days_remaining + ' ngày'
    : 'đã qua ' + (-phase.days_remaining) + ' ngày';
  var daysHtml = phase.total === 0
    ? daysText + '<br>chưa lên nghiệp vụ'
    : daysText + '<br>' + phase.done_analyst + '/' + phase.total + ' nghiệp vụ';

  card.innerHTML =
    '<div class="phase-name">' + escapeHtml(phase.code) + ' · ' + escapeHtml(phase.name) + '</div>' +
    '<div class="phase-target-row">' +
      '<div class="phase-target">Mốc đích ' + fmtDMY(phase.target_date) + '</div>' +
      editBtnHtml +
    '</div>' +
    '<div class="phase-meta">' +
      '<div class="phase-pct">' + pctText + '</div>' +
      '<div class="phase-days">' + daysHtml + '</div>' +
    '</div>' +
    '<div class="stack"><i style="width:' + barWidth + '%; background:' + barColor + ';"></i></div>' +
    '<div class="funnel">' +
      analystLine(phase.done_analyst, phase.total) +
      funnelLine('Done Dev,QC', phase.done_dev_qc, phase.total) +
      funnelLine('Golive', phase.golive, phase.total) +
    '</div>' +
    '<button type="button" class="phase-not-done-cta">Những task chưa done dev/QC →</button>';
  return card;
}

function renderPhases(phases){
  var row = document.getElementById('phaseRow');
  row.innerHTML = '';
  phases.forEach(function(phase){ row.appendChild(renderPhaseCard(phase, phases)); });
}

// empty selection = no filter (whole-project rollup, straight from the
// server). When categories are selected, each phase's counts/% are
// recomputed client-side from the full task list — same cumulative-funnel
// math as src/lib/phaseRollup.js's computePhaseRollup, just scoped to
// tasks in the selected categories, since the backend rollup has no
// per-category breakdown to ask for.
var _roadmapPhaseCategoryFilter = [];

function computePhaseRollupClient(phase, tasksForPhase){
  var total = tasksForPhase.length;
  var doneAnalyst = tasksForPhase.filter(function(t){ return statusDotToNum(t.status) >= 2; }).length;
  var doneDevQc = tasksForPhase.filter(function(t){ return statusDotToNum(t.status) >= 4; }).length;
  var golive = tasksForPhase.filter(function(t){ return statusDotToNum(t.status) >= 5; }).length;
  var pctComplete = total === 0 ? null : Math.round((doneDevQc / total) * 1000) / 10;
  return {
    id: phase.id, code: phase.code, name: phase.name, target_date: phase.target_date,
    updated_at: phase.updated_at, days_remaining: phase.days_remaining,
    total: total, done_analyst: doneAnalyst, done_dev_qc: doneDevQc, golive: golive, pct_complete: pctComplete
  };
}

// cached from the last real fetch, so a checkbox toggle can re-render just
// the phase cards (renderPhasesDisplay) without re-fetching or rebuilding
// the category dropdown itself — rebuilding it would reset panel.style.display
// and close the dropdown mid-selection.
var _lastPhasesRaw = null;
var _lastTasksForPhaseFilter = null;

function renderRoadmapCategoryFilter(allTasks){
  renderMultiSelectDropdown(
    document.getElementById('roadmapCategoryFilter'), 'Category',
    bucketsForGroupBy(allTasks, 'category'),
    _roadmapPhaseCategoryFilter,
    function(){ renderPhasesDisplay(); },
    true
  );
}

function renderPhasesDisplay(){
  if (!_lastPhasesRaw || !_lastTasksForPhaseFilter) return;
  var displayPhases = _roadmapPhaseCategoryFilter.length === 0
    ? _lastPhasesRaw
    : _lastPhasesRaw.map(function(p){
        var tasksForPhase = _lastTasksForPhaseFilter.filter(function(t){
          return t.phase_id === p.id && _roadmapPhaseCategoryFilter.indexOf(t.category) !== -1;
        });
        return computePhaseRollupClient(p, tasksForPhase);
      });
  _lastPhases = displayPhases;
  renderPhases(displayPhases);
}

function loadPhases(){
  var row = document.getElementById('phaseRow');
  return Promise.all([fetchJSON('/api/phases'), loadTasks()])
    .then(function(results){
      _lastPhasesRaw = results[0];
      _lastTasksForPhaseFilter = results[1];
      renderRoadmapCategoryFilter(_lastTasksForPhaseFilter);
      renderPhasesDisplay();
    })
    .catch(function(err){
      console.error('Failed to load /api/phases', err);
      row.innerHTML = '<div class="view-sub">Không tải được dữ liệu Phase. Thử tải lại trang.</div>';
    });
}

function enterPhaseDateEdit(card, phase){
  var row = card.querySelector('.phase-target-row');
  row.classList.add('is-editing');
  row.innerHTML =
    '<input type="date" class="phase-date-input" value="' + phase.target_date + '">' +
    '<button type="button" class="phase-date-save">Lưu</button>' +
    '<button type="button" class="phase-date-cancel">Hủy</button>';
}

// admin-only inline editor for a phase's go-live date, with optimistic
// concurrency: every save sends back the updated_at this admin last saw, so
// if someone else changed the date in between, the server returns 409
// instead of one edit silently clobbering the other.
// jumps to the Timeline pre-filtered to this phase + every status short of
// Done UAT (Backlog/In Analyst/Ready for Dev/In Dev) — "what's still not
// done dev/QC for this phase", one click from the roadmap card that flags it.
function goToTimelineNotYetDoneDevQc(phase){
  var notYetDoneDevQc = STATUS_ORDER.slice(0, STATUS_ORDER.indexOf('4.ready_for_staging'));
  _timelineFilterPhase.length = 0; _timelineFilterPhase.push(String(phase.id));
  _timelineFilterStatus.length = 0; notYetDoneDevQc.forEach(function(s){ _timelineFilterStatus.push(s); });
  _timelineFilterCategory.length = 0;
  _timelineFilterPlatform.length = 0;
  var navItem = document.querySelector('.nav-item[data-view="timeline"]');
  if (navItem) navItem.click();
  if (_lastTimelineTasks && _lastTimelinePhases){
    renderTimelineFilterDropdowns(_lastTimelineTasks, _lastTimelinePhases);
    renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
  }
}

document.getElementById('phaseRow').addEventListener('click', function(e){
  var notDoneCta = e.target.closest('.phase-not-done-cta');
  if (notDoneCta){
    var ctaCard = notDoneCta.closest('.phase-card');
    var ctaPhase = _lastPhases.find(function(p){ return String(p.id) === ctaCard.dataset.phaseId; });
    if (ctaPhase) goToTimelineNotYetDoneDevQc(ctaPhase);
    return;
  }

  var editBtn = e.target.closest('.phase-edit-btn');
  if (editBtn){
    var card = editBtn.closest('.phase-card');
    var phase = _lastPhases.find(function(p){ return String(p.id) === card.dataset.phaseId; });
    if (phase) enterPhaseDateEdit(card, phase);
    return;
  }

  if (e.target.closest('.phase-date-cancel')){
    if (_lastPhases) renderPhases(_lastPhases);
    return;
  }

  var saveBtn = e.target.closest('.phase-date-save');
  if (saveBtn){
    var saveCard = saveBtn.closest('.phase-card');
    var phaseId = saveCard.dataset.phaseId;
    var savePhase = _lastPhases.find(function(p){ return String(p.id) === phaseId; });
    var newDate = saveCard.querySelector('.phase-date-input').value;
    if (!newDate) return;

    saveBtn.disabled = true;
    authFetch('/api/phases/' + phaseId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_date: newDate, updated_at: savePhase.updated_at })
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        toastSuccess('Đã cập nhật mốc golive.');
      });
    }).catch(function(err){
      toastError(err.message);
    }).then(function(){
      loadPhases();
    });
  }
});

// ---- onboarding spotlight: "Bạn có thể làm gì ở đây?" cards on Roadmap
// don't just describe a feature, they take the user there — either by
// switching view/tab (the target is somewhere else) or, when the target is
// already on screen (nav rail buttons, the AI assessment button further
// down this same page), by pulsing a ring around it so "bấm vào đây" has
// an obvious, hard-to-miss landing spot. Clearing on the target's own next
// click (not just a timeout) means a slow reader doesn't get the ring
// pulled out from under them right as they reach for it. ----
function spotlightElement(el){
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('onboarding-spotlight');
  var cleared = false;
  function clear(){
    if (cleared) return;
    cleared = true;
    el.classList.remove('onboarding-spotlight');
    el.removeEventListener('click', clear);
  }
  el.addEventListener('click', clear);
  setTimeout(clear, 6000);
}

// resets scroll before switching views via one of these onboarding cards,
// so the user lands at the top of wherever they were just sent — carrying
// over Roadmap's own scroll position into a different view would bury the
// thing they just asked to see.
function goToViewFromIntro(view){
  document.querySelector('.main').scrollTop = 0;
  var navItem = document.querySelector('.nav-item[data-view="' + view + '"]');
  if (navItem) navItem.click();
}

document.getElementById('introGoSprintOverview').addEventListener('click', function(){
  goToViewFromIntro('sprint');
  var overviewChip = document.querySelector('#sprintTabChips [data-tab="overview"]');
  if (overviewChip) overviewChip.click();
  setTimeout(function(){
    // today can fall in the gap between two sprint cycles (see
    // pickCurrentAndNextSprint), in which case there's no .is-current row
    // at all — falling back to .is-next keeps this from silently doing
    // nothing, and still lands on the most relevant "sprint sắp tới" row.
    spotlightElement(
      document.querySelector('.sprint-overview-row.is-current') ||
      document.querySelector('.sprint-overview-row.is-next')
    );
  }, 350);
});

document.getElementById('introGoTimeline').addEventListener('click', function(){
  goToViewFromIntro('timeline');
});

// polls #drawerLoading instead of a blind setTimeout — the drawer's own
// open fetches phases/sprints/tasks over the network, so a fixed delay
// would either spotlight before the fields are ready or make the user
// wait longer than necessary. Gives up after ~4s so a slow/failed load
// can't leave this hanging forever.
function waitForDrawerReady(callback, attemptsLeft){
  attemptsLeft = attemptsLeft == null ? 40 : attemptsLeft;
  var loading = document.getElementById('drawerLoading');
  if (loading.style.display === 'none' || attemptsLeft <= 0){
    callback();
  } else {
    setTimeout(function(){ waitForDrawerReady(callback, attemptsLeft - 1); }, 100);
  }
}

document.getElementById('introUpdateTaskProgress').addEventListener('click', function(){
  goToViewFromIntro('sprint');
  var currentNextChip = document.querySelector('#sprintTabChips [data-tab="current-next"]');
  if (currentNextChip) currentNextChip.click();
  setTimeout(function(){
    var firstTask = document.querySelector('#sprintColumns .sprint-task');
    if (!firstTask) return;
    firstTask.click(); // opens the edit drawer for this task
    waitForDrawerReady(function(){
      spotlightElement(document.getElementById('logField'));
    });
  }, 350);
});

document.getElementById('introSpotlightNewTask').addEventListener('click', function(){
  var rail = document.getElementById('rail');
  rail.classList.add('peek');
  spotlightElement(document.getElementById('openDrawer'));
  setTimeout(function(){ rail.classList.remove('peek'); }, 6000);
});

document.getElementById('introSpotlightAssessment').addEventListener('click', function(){
  spotlightElement(document.getElementById('generateAssessmentBtn'));
});

document.querySelectorAll('#roadmapPctChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#roadmapPctChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _roadmapPctMode = btn.dataset.pctMode;
    if (_lastPhases) renderPhases(_lastPhases);
  });
});

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

  // Done → Done UAT → In Dev → Ready for Dev → Backlog, so the
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
  // reached Done UAT yet — surfaced here (current sprint only) so
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

// "effectively complete" threshold for progress headlines — same threshold
// the Roadmap's own default % uses: literal '5.done' lags behind a formal
// golive event and stays near-zero for most of a sprint's life, which would
// make an in-progress sprint look falsely empty in front of an audience.
// Done UAT is the point work is realistically finished. Shared by the
// Table view's phase-summary "Hoàn thành" column.
function isEffectivelyDone(t){ return statusDotToNum(t.status) >= 4; }

// canonical category order first (matches the Sprint Overview's own
// grouping), any other value sorted alphabetically after — same fallback
// bucketsForGroupBy uses. Shared by the Sprint "hiện tại & sau" Excel
// export's row order (sprint, then category, then STT).
function categorySortIndex(category){
  var idx = SPRINT_OVERVIEW_CATEGORIES.indexOf(category);
  return idx === -1 ? SPRINT_OVERVIEW_CATEGORIES.length : idx;
}

// cross-sprint view: EVERY task in EVERY sprint, one row per sprint, tasks
// grouped within the row (default: Platform, the "who do I need" signal for
// staffing — also selectable as Category or Status) and colored by status —
// so a PM can scan all sprints in one screen and still see what each task
// actually is, not just a count.
var SPRINT_OVERVIEW_PLATFORMS = ['Web', 'App'];
var SPRINT_OVERVIEW_CATEGORIES = [
  'TTT New - Product Foundation', 'TTT New - Cross Service Integration',
  'TTT New - Internal Features', 'TTT New - Convert & Scale'
];
var _sprintOverviewGroupBy = 'category';
// cached inputs from the last renderSprintOverviewTable call, so switching
// the group-by chip can just re-render instantly instead of refetching.
var _lastSprintOverviewArgs = null;

// canonical values first (fixed order), then any other value actually found
// in the data (shouldn't normally happen for platform/category, since the
// drawer only offers a fixed set — but avoids silently dropping a task with
// an odd value), sorted alphabetically after the canonical ones.
function bucketsForGroupBy(sprintTasks, groupBy){
  if (groupBy === 'status'){
    return STATUS_ORDER.map(function(s, idx){
      return { key: s, label: statusLabel[idx].replace(/^\d+\.\s*/, '') };
    });
  }
  var field = groupBy === 'category' ? 'category' : 'platform';
  var canonical = groupBy === 'category' ? SPRINT_OVERVIEW_CATEGORIES : SPRINT_OVERVIEW_PLATFORMS;
  var extra = [];
  sprintTasks.forEach(function(t){
    if (canonical.indexOf(t[field]) === -1 && extra.indexOf(t[field]) === -1) extra.push(t[field]);
  });
  return canonical.concat(extra.sort()).map(function(v){ return { key: v, label: v }; });
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
    why: task.why, resource_roles: task.resource_roles,
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
    var doneCount = sprintTasks.filter(function(t){ return t.status === '5.done'; }).length;
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
    // drag-to-regroup, then refreshes every view so Timeline/Log/Bảng danh
    // sách stay in sync with the change.
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
      function commitSprintChange(reason){
        updateTaskSprint(draggedTask, s.id, sprints)
          .then(function(){
            if (reason) return postDateChangeReasonLog(draggedTask.id, reason);
          })
          .then(function(){
            refreshAllViews();
            toastSuccess('Đã đổi sprint cho "' + draggedTask.name + '"');
          })
          .catch(function(err){
            console.error('Đổi sprint thất bại', err);
            toastError('Không đổi được sprint: ' + err.message);
          });
      }
      if (dueDateIsDueOrOverdue(draggedTask.due_date)){
        promptDateChangeReason(draggedTask.name, commitSprintChange, function(){});
      } else {
        commitSprintChange(null);
      }
    });

    if (sprintTasks.length === 0){
      var empty = document.createElement('div'); empty.className = 'view-sub'; empty.textContent = 'Chưa có nghiệp vụ.';
      row.appendChild(empty);
    } else {
      var body = document.createElement('div'); body.className = 'sprint-overview-row-body';
      var groupByField = _sprintOverviewGroupBy === 'status' ? 'status' : (_sprintOverviewGroupBy === 'category' ? 'category' : 'platform');
      bucketsForGroupBy(sprintTasks, _sprintOverviewGroupBy).forEach(function(bucket){
        var bucketTasks = sprintTasks.filter(function(t){ return t[groupByField] === bucket.key; });
        if (bucketTasks.length === 0) return;
        var group = document.createElement('div'); group.className = 'sprint-overview-platform-group';
        var label = document.createElement('span'); label.className = 'sprint-overview-platform-label'; label.textContent = bucket.label;
        group.appendChild(label);
        bucketTasks.forEach(function(t){
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
  // col isn't touched here (it FLIP-animates from its current contents once
  // data arrives — wiping it early would leave nothing to animate from).
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

      _lastSprintOverviewArgs = [sprints, tasks, data.current ? data.current.id : null, data.next ? data.next.id : null];
      renderSprintOverviewTable.apply(null, _lastSprintOverviewArgs);

      var sprintById = {};
      sprints.forEach(function(s){ sprintById[s.id] = s; });

      var carryOver = [];
      if (data.current){
        var currentStart = new Date(data.current.start_date);
        var earlierSprintIds = sprints
          .filter(function(s){ return new Date(s.end_date) < currentStart; })
          .map(function(s){ return s.id; });
        carryOver = tasks
          .filter(function(t){
            return t.sprint_id != null && earlierSprintIds.indexOf(t.sprint_id) !== -1 && statusDotToNum(t.status) < 4;
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

// ---- export JSON (Sprint tab: "Overview tất cả Sprint" / "Sprint hiện tại
// & sau") — shaped to match an existing external delivery-plan JSON format
// (title/source/asOf/sprints/tasks) this app's data can stand in for, so an
// export here is a drop-in replacement for that file. ----
var SPRINT_STATUS_TO_EXPORT_CODE = {
  '0.backlog': 'backlog',
  '1.in_analyst': 'in-analyst',
  '2.ready_for_dev': 'ready-dev',
  '3.in_test': 'in-test',
  '4.ready_for_staging': 'ready-stg',
  '5.done': 'done'
};
function buildDeliveryPlanExport(tasksSubset, sprintsSubset, scopeLabel, allLogs){
  var sprintCodeById = {};
  sprintsSubset.forEach(function(s){ sprintCodeById[s.id] = s.code; });
  // notes: every activity-log entry for the task, newest first (same order
  // /api/logs already returns) — exports stay complete rather than
  // guessing which log entries count as "real" status notes.
  var notesByTaskId = {};
  allLogs.forEach(function(l){
    if (!notesByTaskId[l.task_id]) notesByTaskId[l.task_id] = [];
    notesByTaskId[l.task_id].push({ date: (l.created_at || '').slice(0, 10), text: l.note });
  });
  return {
    title: 'TTT New — Delivery Plan',
    source: 'Túi Thần Tài — ' + scopeLabel,
    asOf: todayIsoLocal(),
    sprints: sprintsSubset.map(function(s){
      return { id: s.code, label: s.code, start: s.start_date, end: s.end_date };
    }),
    tasks: tasksSubset.map(function(t){
      // effectiveRange (not the task's raw start_date/due_date columns)
      // so a non-overridden task's dates always match what the rest of the
      // app shows — those columns can go stale if its sprint's own dates
      // shift later, since effectiveRange re-derives from the sprint live.
      var range = effectiveRange(t);
      return {
        id: 't' + String(t.id).padStart(3, '0'),
        stt: t.stt != null ? t.stt : null,
        label: t.name,
        category: t.category,
        platform: t.platform,
        sprint: t.sprint_id != null ? (sprintCodeById[t.sprint_id] || null) : null,
        status: SPRINT_STATUS_TO_EXPORT_CODE[t.status] || t.status,
        start: range ? toIsoDate(range.start) : (t.start_date || null),
        end: range ? toIsoDate(range.end) : (t.due_date || null),
        progress: { analyst: !!t.done_analyst, dev: !!t.done_dev, uat: !!t.done_uat, staging: !!t.done_staging },
        notes: notesByTaskId[t.id] || undefined
      };
    })
  };
}
function downloadJsonFile(obj, filename){
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}
function wireExportJsonButton(btnId, buildScopeFn, filenamePrefix){
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', function(){
    var origText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang xuất...';
    buildScopeFn()
      .then(function(exportObj){
        downloadJsonFile(exportObj, filenamePrefix + '-' + todayIsoLocal() + '.json');
        toastSuccess('Đã xuất JSON');
      })
      .catch(function(err){
        console.error('Export JSON failed (' + btnId + ')', err);
        toastError('Không xuất được JSON: ' + err.message);
      })
      .finally(function(){
        btn.disabled = false; btn.textContent = origText;
      });
  });
}
wireExportJsonButton('exportOverviewJsonBtn', function(){
  return Promise.all([loadTasks(), loadSprints(), fetchJSON('/api/logs')])
    .then(function(results){
      return buildDeliveryPlanExport(results[0], results[1], 'Overview tất cả Sprint', results[2]);
    });
}, 'ttt-overview-tat-ca-sprint');
wireExportJsonButton('exportCurrentNextJsonBtn', function(){
  return Promise.all([loadTasks(), loadSprints(), fetchJSON('/api/sprints/current-next'), fetchJSON('/api/logs')])
    .then(function(results){
      var tasks = results[0], sprints = results[1], currentNext = results[2], allLogs = results[3];
      var relevantSprintIds = [currentNext.current, currentNext.next]
        .filter(Boolean).map(function(s){ return s.id; });
      var relevantSprints = sprints.filter(function(s){ return relevantSprintIds.indexOf(s.id) !== -1; });
      var relevantTasks = tasks.filter(function(t){ return relevantSprintIds.indexOf(t.sprint_id) !== -1; });
      return buildDeliveryPlanExport(relevantTasks, relevantSprints, 'Sprint hiện tại & sau', allLogs);
    });
}, 'ttt-sprint-hien-tai-va-sau');

// ---- export Excel (Sprint tab: "Sprint hiện tại & sau" only) — a flat,
// report-ready table (one row per task, human-readable status/dates/latest
// note) rather than the JSON export's nested machine format, so people can
// select-all and paste straight into their own report doc/sheet. Uses the
// xlsx package already vendored for the server-side import script
// (public/vendor/xlsx.mini.min.js), not a new dependency. ----
function buildSprintExcelRows(tasksSubset, sprintsSubset, allLogs){
  var sprintCodeById = {};
  sprintsSubset.forEach(function(s){ sprintCodeById[s.id] = s.code; });
  var latestLogByTaskId = {};
  allLogs.forEach(function(l){
    if (!(l.task_id in latestLogByTaskId)) latestLogByTaskId[l.task_id] = l;
  });
  var header = ['STT', 'Category', 'Nghiệp vụ', 'Platform', 'Sprint', 'Trạng thái', 'Bắt đầu', 'Hạn chót', 'Lý do', 'Cập nhật mới nhất'];
  var rows = tasksSubset.slice().sort(function(a, b){
    var sprintDelta = (a.sprint_id || 0) - (b.sprint_id || 0);
    if (sprintDelta !== 0) return sprintDelta;
    var catDelta = categorySortIndex(a.category) - categorySortIndex(b.category);
    if (catDelta !== 0) return catDelta;
    return (a.stt || 0) - (b.stt || 0);
  }).map(function(t){
    var range = effectiveRange(t);
    var log = latestLogByTaskId[t.id];
    return [
      t.stt != null ? t.stt : '',
      t.category, t.name, t.platform,
      t.sprint_id != null ? (sprintCodeById[t.sprint_id] || '') : '',
      statusLabel[statusDotToNum(t.status)].replace(/^\d+\.\s*/, ''),
      range ? fmtDMY(toIsoDate(range.start)) : (t.start_date ? fmtDMY(t.start_date) : ''),
      range ? fmtDMY(toIsoDate(range.end)) : (t.due_date ? fmtDMY(t.due_date) : ''),
      t.why || '',
      log ? stripActorSuffix(log.note) : ''
    ];
  });
  return [header].concat(rows);
}
// same shape as wireExportJsonButton, for the Excel export: buildRowsFn
// resolves to an array-of-arrays (buildSprintExcelRows' output), reused by
// every "Xuất Excel" button in the app so they all share one busy-state/
// toast/error pattern instead of each hand-rolling it.
function wireExportExcelButton(btnId, buildRowsFn, filenamePrefix, sheetName){
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', function(){
    var origText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang xuất...';
    buildRowsFn()
      .then(function(aoa){
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        // column widths sized from actual content (header label vs. a
        // sample of row values) instead of a hardcoded per-column list —
        // this same helper now backs exports with very different column
        // sets/orders (Sprint's fixed 10 columns, Bảng danh sách's
        // user-chosen ones), so a fixed-position width array would
        // silently misalign the moment the column count/order differs.
        ws['!cols'] = aoa.length ? aoa[0].map(function(header, i){
          var maxLen = String(header || '').length;
          aoa.slice(1, 200).forEach(function(row){
            var len = row[i] == null ? 0 : String(row[i]).length;
            if (len > maxLen) maxLen = len;
          });
          return { wch: Math.min(Math.max(maxLen + 2, 8), 60) };
        }) : [];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filenamePrefix + '-' + todayIsoLocal() + '.xlsx');
        toastSuccess('Đã xuất Excel');
      })
      .catch(function(err){
        console.error('Export Excel failed (' + btnId + ')', err);
        toastError('Không xuất được Excel: ' + err.message);
      })
      .finally(function(){
        btn.disabled = false; btn.textContent = origText;
      });
  });
}
wireExportExcelButton('exportCurrentNextExcelBtn', function(){
  return Promise.all([loadTasks(), loadSprints(), fetchJSON('/api/sprints/current-next'), fetchJSON('/api/logs')])
    .then(function(results){
      var tasks = results[0], sprints = results[1], currentNext = results[2], allLogs = results[3];
      var relevantSprintIds = [currentNext.current, currentNext.next].filter(Boolean).map(function(s){ return s.id; });
      var relevantSprints = sprints.filter(function(s){ return relevantSprintIds.indexOf(s.id) !== -1; });
      var relevantTasks = tasks.filter(function(t){ return relevantSprintIds.indexOf(t.sprint_id) !== -1; });
      return buildSprintExcelRows(relevantTasks, relevantSprints, allLogs);
    });
}, 'ttt-sprint-hien-tai-va-sau', 'Sprint hien tai va sau');

var GROUP_BY_LABEL = { platform: 'Platform', category: 'Category', status: 'Status' };
var _sprintActiveTab = 'overview';
var SPRINT_TAB_SUB = {
  overview: function(){ return 'Toàn bộ nghiệp vụ mỗi sprint, nhóm theo ' + GROUP_BY_LABEL[_sprintOverviewGroupBy] + ' — bấm vào 1 nghiệp vụ để sửa'; },
  'current-next': function(){ return 'Biết ngay tuần này đang làm gì, tuần sau sắp tới gì — bấm vào 1 nghiệp vụ để sửa'; }
};
function updateSprintTabSub(){
  document.getElementById('sprintTabSub').textContent = SPRINT_TAB_SUB[_sprintActiveTab]();
}
document.querySelectorAll('#sprintTabChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#sprintTabChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _sprintActiveTab = btn.dataset.tab;
    document.getElementById('sprintTabOverview').style.display = _sprintActiveTab === 'overview' ? '' : 'none';
    document.getElementById('sprintTabCurrentNext').style.display = _sprintActiveTab === 'current-next' ? '' : 'none';
    document.getElementById('sprintOverviewGroupChips').style.display = _sprintActiveTab === 'overview' ? '' : 'none';
    updateSprintTabSub();
  });
});
// set once on load too (not just on chip click) — otherwise the subtitle
// shows whatever text was hardcoded in index.html until the user clicks a
// chip, which silently goes stale the moment a default above changes.
updateSprintTabSub();
document.querySelectorAll('#sprintOverviewGroupChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#sprintOverviewGroupChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _sprintOverviewGroupBy = btn.dataset.groupby;
    updateSprintTabSub();
    if (_lastSprintOverviewArgs) renderSprintOverviewTable.apply(null, _lastSprintOverviewArgs);
  });
});


// ---- AI-generated project assessment (Roadmap page) — a manual "Đánh giá"
// click sends current phase/sprint/task data to an LLM and shows the result;
// nothing is written to the DB until the user explicitly clicks "Lưu" on a
// result they've already read. ----
var _aiAssessmentCurrent = null; // { loading } | { error } | { content, generated_at, saved }
var _aiAssessmentHistory = [];

// intentionally minimal — the prompt only ever asks for ## headings, "- "
// bullets and **bold**, so pulling in a full markdown library would be
// overkill for rendering it back.
function renderSimpleMarkdown(text){
  var lines = escapeHtml(text).split('\n');
  var html = '';
  var inList = false;
  function closeList(){ if (inList){ html += '</ul>'; inList = false; } }
  lines.forEach(function(line){
    var headingMatch = line.match(/^#{2,4}\s+(.*)$/);
    var bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (headingMatch){
      closeList();
      html += '<h4>' + headingMatch[1] + '</h4>';
    } else if (bulletMatch){
      if (!inList){ html += '<ul>'; inList = true; }
      html += '<li>' + bulletMatch[1] + '</li>';
    } else if (line.trim() === ''){
      closeList();
    } else {
      closeList();
      html += '<p>' + line + '</p>';
    }
  });
  closeList();
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderAiAssessmentResult(){
  var wrap = document.getElementById('aiAssessmentResultWrap');
  wrap.innerHTML = '';
  if (!_aiAssessmentCurrent) return;

  if (_aiAssessmentCurrent.loading){
    wrap.innerHTML = '<div class="ai-assessment-loading">Đang phân tích dữ liệu dự án bằng AI, vui lòng đợi...</div>';
    return;
  }
  if (_aiAssessmentCurrent.error){
    wrap.innerHTML = '<div class="ai-assessment-error">Không tạo được đánh giá: ' + escapeHtml(_aiAssessmentCurrent.error) + '</div>';
    return;
  }

  var card = document.createElement('div'); card.className = 'ai-assessment-card';
  card.innerHTML =
    '<div class="ai-assessment-meta">Tạo lúc ' + fmtDateTime(_aiAssessmentCurrent.generated_at) + ' — chưa lưu</div>' +
    '<div class="ai-assessment-content">' + renderSimpleMarkdown(_aiAssessmentCurrent.content) + '</div>';
  wrap.appendChild(card);

  var actions = document.createElement('div'); actions.className = 'ai-assessment-actions';
  if (_aiAssessmentCurrent.saved){
    actions.innerHTML = '<span class="view-sub">Đã lưu vào lịch sử bên dưới</span>';
  } else if (hasRole('editor')){
    actions.innerHTML = '<button type="button" class="ai-assessment-save-btn" id="saveAssessmentBtn">Lưu đánh giá này</button>';
  }
  wrap.appendChild(actions);

  var saveBtn = document.getElementById('saveAssessmentBtn');
  if (saveBtn){
    saveBtn.addEventListener('click', function(){
      saveBtn.disabled = true;
      authFetch('/api/ai-assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: _aiAssessmentCurrent.content })
      })
        .then(function(res){
          if (!res.ok){
            return res.json().catch(function(){ return {}; }).then(function(errBody){
              throw new Error(errBody.error || ('HTTP ' + res.status));
            });
          }
          _aiAssessmentCurrent.saved = true;
          renderAiAssessmentResult();
          return loadAiAssessmentHistory().then(function(){ toastSuccess('Đã lưu đánh giá'); });
        })
        .catch(function(err){
          console.error('Failed to save AI assessment', err);
          toastError('Không lưu được: ' + err.message);
          saveBtn.disabled = false;
        });
    });
  }
}

function renderAiAssessmentHistory(){
  var wrap = document.getElementById('aiAssessmentHistoryWrap');
  wrap.innerHTML = '';
  if (_aiAssessmentHistory.length === 0){
    wrap.innerHTML = '<div class="view-sub">Chưa có đánh giá nào được lưu.</div>';
    return;
  }
  var canDelete = hasRole('admin');
  var group = document.createElement('div'); group.className = 'risk-group';
  _aiAssessmentHistory.forEach(function(a){
    var row = document.createElement('div'); row.className = 'risk-task'; row.style.cursor = 'default';
    row.innerHTML =
      '<div class="risk-task-name">' + fmtDateTime(a.created_at) + (a.actor_name ? ' — ' + escapeHtml(a.actor_name) : '') + '</div>' +
      '<div class="risk-task-meta">' +
        '<button type="button" class="ai-assessment-history-toggle" data-id="' + a.id + '">Xem</button>' +
        (canDelete ? '<button type="button" class="chip ai-assessment-delete-btn" data-id="' + a.id + '">Xoá</button>' : '') +
      '</div>';
    group.appendChild(row);

    var contentEl = document.createElement('div');
    contentEl.className = 'ai-assessment-content ai-assessment-history-content';
    contentEl.style.display = 'none';
    contentEl.innerHTML = renderSimpleMarkdown(a.content);
    group.appendChild(contentEl);

    row.querySelector('.ai-assessment-history-toggle').addEventListener('click', function(){
      var willShow = contentEl.style.display === 'none';
      contentEl.style.display = willShow ? 'block' : 'none';
      this.textContent = willShow ? 'Ẩn' : 'Xem';
    });
  });
  wrap.appendChild(group);

  wrap.querySelectorAll('.ai-assessment-delete-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      if (!confirm('Xoá đánh giá này?')) return;
      authFetch('/api/ai-assessments/' + btn.dataset.id, { method: 'DELETE' })
        .then(function(res){
          if (!res.ok){
            return res.json().catch(function(){ return {}; }).then(function(errBody){
              throw new Error(errBody.error || ('HTTP ' + res.status));
            });
          }
          return loadAiAssessmentHistory().then(function(){ toastSuccess('Đã xoá đánh giá'); });
        })
        .catch(function(err){
          console.error('Failed to delete AI assessment', err);
          toastError('Không xoá được: ' + err.message);
        });
    });
  });
}

function loadAiAssessmentHistory(){
  return fetchJSON('/api/ai-assessments')
    .then(function(list){
      _aiAssessmentHistory = list;
      renderAiAssessmentHistory();
    })
    .catch(function(err){
      console.error('Failed to load AI assessment history', err);
      document.getElementById('aiAssessmentHistoryWrap').innerHTML = '<div class="view-sub">Không tải được lịch sử đánh giá.</div>';
    });
}

document.getElementById('generateAssessmentBtn').addEventListener('click', function(){
  var btn = this;
  btn.disabled = true;
  _aiAssessmentCurrent = { loading: true };
  renderAiAssessmentResult();
  authFetch('/api/ai-assessments/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
    .then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        return body;
      });
    })
    .then(function(body){
      _aiAssessmentCurrent = { content: body.content, generated_at: body.generated_at, saved: false };
      renderAiAssessmentResult();
    })
    .catch(function(err){
      console.error('Failed to generate AI assessment', err);
      _aiAssessmentCurrent = { error: err.message };
      renderAiAssessmentResult();
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
    // before their first Google login, an admin-pre-provisioned row may
    // have no display name yet — fall back to the email so the row isn't
    // blank.
    nameEl.textContent = u.email + (u.name && u.name !== u.email ? ' · ' + u.name : '');
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
        toastSuccess('Đã đổi quyền của "' + u.email + '" thành ' + ROLE_DISPLAY[newRole]);
      }).catch(function(err){
        console.error('Failed to change role', err);
        toastError('Không đổi được quyền: ' + err.message);
        roleSelect.value = u.role; // revert the select to the last known-good role
      });
    });
    meta.appendChild(roleSelect);

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button'; deleteBtn.className = 'chip user-delete-btn';
    deleteBtn.textContent = 'Xoá';
    deleteBtn.addEventListener('click', function(){
      if (!confirm('Xoá user "' + u.email + '"?')) return;
      authFetch('/api/users/' + u.id, { method: 'DELETE' }).then(function(res){
        if (!res.ok){
          return res.json().catch(function(){ return {}; }).then(function(errBody){
            throw new Error(errBody.error || ('HTTP ' + res.status));
          });
        }
        toastSuccess('Đã xoá user "' + u.email + '"');
        return loadUsersView();
      }).catch(function(err){
        console.error('Failed to delete user', err);
        toastError('Không xoá được: ' + err.message);
      });
    });
    meta.appendChild(deleteBtn);

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
  var emailInput = document.getElementById('newUserEmail');
  var email = emailInput.value.trim();
  var role = document.getElementById('newUserRole').value;
  if (!email){
    toastError('Vui lòng nhập email Google.');
    return;
  }
  authFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, role: role })
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
    return res.json();
  }).then(function(){
    emailInput.value = '';
    toastSuccess('Đã thêm user "' + email + '"');
    return loadUsersView();
  }).catch(function(err){
    console.error('Failed to add user', err);
    toastError('Không thêm được user: ' + err.message);
  });
});

loadUsersView();

loadPhases();
loadSprintView();
loadAiAssessmentHistory();

// ---- shared data cache: every view reads /api/tasks; fetch it once ----
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
    why: task.why, resource_roles: task.resource_roles,
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

function todayIsoLocal(){
  var d = new Date(); d.setHours(0, 0, 0, 0);
  return toIsoDate(d);
}

// scopes the mandatory-reason requirement to tasks already due today or
// overdue — silently pushing out a date that's already (about to be) a
// problem is exactly the case worth a reason; a task still comfortably in
// the future being replanned is routine and doesn't need one.
function dueDateIsDueOrOverdue(dueDateIso){
  return !!dueDateIso && dueDateIso <= todayIsoLocal();
}

// ---- date-change reason modal: shown for any date change that happens
// OUTSIDE the drawer (drag on Timeline/Sprint Overview) for a task whose
// due date is already due today or overdue. Blocks until a reason is
// typed; the caller only proceeds with the actual date-changing request
// from onConfirm. ----
function promptDateChangeReason(taskName, onConfirm, onCancel){
  var overlay = document.getElementById('dateReasonOverlay');
  var modal = document.getElementById('dateReasonModal');
  var input = document.getElementById('dateReasonInput');
  var errorEl = document.getElementById('dateReasonError');
  var confirmBtn = document.getElementById('dateReasonConfirm');
  var cancelBtn = document.getElementById('dateReasonCancel');

  document.getElementById('dateReasonSub').textContent =
    '"' + taskName + '" đã tới hạn hoặc quá hạn — vui lòng nêu lý do dời ngày.';
  input.value = '';
  errorEl.style.display = 'none';
  overlay.classList.add('show');
  modal.classList.add('show');
  input.focus();

  function cleanup(){
    overlay.classList.remove('show');
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
    overlay.removeEventListener('click', handleCancel);
  }
  function handleConfirm(){
    var reason = input.value.trim();
    if (!reason){
      errorEl.style.display = 'block';
      input.focus();
      return;
    }
    cleanup();
    onConfirm(reason);
  }
  function handleCancel(){
    cleanup();
    if (onCancel) onCancel();
  }
  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
  overlay.addEventListener('click', handleCancel);
}

// records the typed reason as its own activity-log entry, right alongside
// the server's own auto-generated "Dịch ngày/Đổi ngày" note for the same
// change (see dateChangeNote.js) — best-effort, matching how the drawer's
// own initial-note posting doesn't block on failure either.
function postDateChangeReasonLog(taskId, reason){
  return authFetch('/api/tasks/' + taskId + '/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'Lý do dời ngày: ' + reason })
  }).catch(function(err){
    console.error('Failed to save date-change reason log', err);
  });
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
    why: task.why, resource_roles: task.resource_roles,
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
      category: u.task.category, name: u.task.name, why: u.task.why, resource_roles: u.task.resource_roles,
      platform: u.task.platform, status: u.task.status,
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
    function commitBarDrag(reason){
      var newStartIso = toIsoDate(newStart), newDueIso = toIsoDate(newEnd);
      updateTaskDates(task, newStartIso, newDueIso)
        .then(function(){
          if (reason) return postDateChangeReasonLog(task.id, reason);
        })
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
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      barEl.classList.remove('bar-dragging');
      tooltip.remove();
      if (!moved) return;
      markDragged();
      if (dueDateIsDueOrOverdue(task.due_date)){
        promptDateChangeReason(task.name, function(reason){
          commitBarDrag(reason);
        }, function(){
          refreshAllViews(); // cancelled — snap the bar back to server truth
        });
      } else {
        commitBarDrag(null);
      }
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
      function commitGroupChange(reason){
        updateTaskGroup(task, g.key, sprints)
          .then(function(){
            if (reason) return postDateChangeReasonLog(task.id, reason);
          })
          .then(function(){
            refreshAllViews();
            toastSuccess('Đã đổi nhóm cho "' + task.name + '"');
          })
          .catch(function(err){
            console.error('Đổi nhóm trên Timeline thất bại', err);
            toastError('Không đổi được nhóm: ' + err.message);
          });
      }
      // only re-grouping by sprint (to an actual sprint, not "no sprint")
      // touches dates — see buildGroupChangeBody.
      var changesDates = _timelineGroupBy === 'sprint' && g.key !== 'none';
      if (changesDates && dueDateIsDueOrOverdue(task.due_date)){
        promptDateChangeReason(task.name, commitGroupChange, function(){});
      } else {
        commitGroupChange(null);
      }
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
  // phase go-live milestones (P1/P2/P3/P4 target_date) — same guarded
  // pattern as the "today" line below: only drawn if the milestone falls
  // within the axis this render happens to have (sprint/task dates), so a
  // phase filter that narrows the axis simply hides milestones outside it
  // rather than stretching the whole Timeline to fit every phase.
  phases.forEach(function(p){
    var pct = pctPos(new Date(p.target_date));
    if (pct < 0 || pct > 100) return;
    var pLine = document.createElement('div');
    pLine.className = 'gantt-phase-line';
    pLine.style.left = (pct / 100 * trackPxWidth) + 'px';
    var pLabel = document.createElement('div');
    pLabel.className = 'gantt-phase-line-label';
    pLabel.textContent = p.code;
    pLine.appendChild(pLabel);
    overlayEl.appendChild(pLine);
  });
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
renderStatusLegend('gtLegend');

// ---- Timeline nhóm: a separate, roadmap-style Timeline view. Rows are
// GROUPS (category/sprint/phase/platform) rather than individual tasks —
// each task instead floats as a card at its real date position within its
// group's row. Deliberately its own groupsForMode/taskGroupKey and groupBy
// state (gtGroupsForMode/gtTaskGroupKey/_gtGroupBy) rather than reusing the
// existing Timeline's, so switching the group-by chip here never affects
// (or is affected by) the original Timeline view.
var _gtGroupBy = 'category';
// which groups the user has expanded past MAX_VISIBLE_TRACKS (see the
// "+N task khác" / "Thu gọn" toggle in renderGroupedTimeline) — keyed by
// group key, reset whenever the group-by dimension changes since group
// keys aren't comparable across dimensions.
var _gtExpandedGroups = {};

function gtGroupsForMode(tasks, sprints, phases, groupBy){
  if (groupBy === 'sprint'){
    var order = sprints.map(function(s){ return { key: 's' + s.id, label: s.code }; });
    order.push({ key: 'none', label: 'Chưa gán sprint' });
    return order;
  }
  if (groupBy === 'phase'){
    var order2 = phases.map(function(p){ return { key: 'p' + p.id, label: p.code }; });
    order2.push({ key: 'none', label: 'Chưa gán phase' });
    return order2;
  }
  var field = groupBy === 'platform' ? 'platform' : 'category';
  var seen = [], seenSet = {};
  tasks.forEach(function(t){
    var v = t[field];
    if (v && !seenSet[v]){ seenSet[v] = true; seen.push({ key: v, label: v }); }
  });
  return seen;
}
function gtTaskGroupKey(t, groupBy){
  if (groupBy === 'sprint') return t.sprint_id != null ? 's' + t.sprint_id : 'none';
  if (groupBy === 'phase') return t.phase_id != null ? 'p' + t.phase_id : 'none';
  if (groupBy === 'platform') return t.platform || 'none';
  return t.category || 'none';
}

var GT_MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Timeline nhóm's own Phase/Sprint/Category filters — separate state from
// the original Timeline's (_timelineFilterPhase etc.), same reasoning as
// _gtGroupBy: this view's controls shouldn't affect or be affected by the
// other one. Empty selection = no filter, same convention as everywhere else.
var _gtFilterPhase = [];
var _gtFilterSprint = [];
var _gtFilterCategory = [];
var _gtLastTasks = null, _gtLastSprints = null, _gtLastPhases = null;
// most recent activity-log entry per task_id — same map shape/source as
// the Sprint page's hover popup (loadSprintView), reused here via the
// existing showLogHoverPopup/hideLogHoverPopup helpers so hovering a task
// card or a cluster's bullet name shows the same "Hoạt động gần nhất" popup.
var _gtLatestLogByTaskId = {};

function applyGtFilters(tasks){
  return tasks.filter(function(t){
    if (_gtFilterPhase.length && _gtFilterPhase.indexOf(String(t.phase_id)) === -1) return false;
    if (_gtFilterSprint.length && _gtFilterSprint.indexOf(String(t.sprint_id)) === -1) return false;
    if (_gtFilterCategory.length && _gtFilterCategory.indexOf(t.category) === -1) return false;
    return true;
  });
}

function gtFilterOnChange(){
  if (_gtLastTasks && _gtLastSprints && _gtLastPhases){
    renderGroupedTimeline(applyGtFilters(_gtLastTasks), _gtLastSprints, _gtLastPhases);
  }
}

// bucket options are built from the full unfiltered task list (not the
// already-filtered result) so narrowing one filter never removes options
// from the others — same choice the original Timeline's filters make.
// currentSprintId: marks that one sprint's option " — sprint hiện tại",
// same label the drawer's own Sprint <select> already uses.
function renderGtFilterDropdowns(allTasks, sprints, phases, currentSprintId){
  renderMultiSelectDropdown(
    document.getElementById('filter-gt-phase-ms'), 'Phase',
    phases.map(function(p){ return { key: String(p.id), label: p.code + ': ' + p.name }; }),
    _gtFilterPhase, gtFilterOnChange
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-gt-sprint-ms'), 'Sprint',
    sprints.map(function(s){ return { key: String(s.id), label: s.code + (s.id === currentSprintId ? ' — sprint hiện tại' : '') }; }),
    _gtFilterSprint, gtFilterOnChange
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-gt-category-ms'), 'Category',
    bucketsForGroupBy(allTasks, 'category'),
    _gtFilterCategory, gtFilterOnChange, true
  );
}

function loadGroupedTimelineView(){
  return Promise.all([loadTasks(), loadSprints(), loadPhasesList(), fetchJSON('/api/sprints/current-next'), fetchJSON('/api/logs')])
    .then(function(results){
      _gtLastTasks = results[0]; _gtLastSprints = results[1]; _gtLastPhases = results[2];
      var currentSprintId = results[3].current ? results[3].current.id : null;
      // /api/logs is already sorted newest-first, so the first entry seen
      // per task_id is that task's most recent log — same reduction as loadSprintView.
      _gtLatestLogByTaskId = {};
      results[4].forEach(function(l){
        if (!(l.task_id in _gtLatestLogByTaskId)) _gtLatestLogByTaskId[l.task_id] = l;
      });
      renderGtFilterDropdowns(_gtLastTasks, _gtLastSprints, _gtLastPhases, currentSprintId);
      renderGroupedTimeline(applyGtFilters(_gtLastTasks), _gtLastSprints, _gtLastPhases);
    })
    .catch(function(err){ console.error('Failed to load Timeline nhóm', err); });
}

// export: whatever is currently on screen (respecting the active Phase/
// Sprint/Category filter chips), not a fresh independent fetch — Timeline
// nhóm's whole point is filtering, so the export should match exactly what
// the user is looking at right now, same _gtLastTasks/applyGtFilters the
// chart itself renders from. allLogs is still fetched fresh at click time
// (not reused from _gtLatestLogByTaskId, which only keeps each task's
// single latest entry) since the JSON export wants full history per task.
wireExportJsonButton('exportGtJsonBtn', function(){
  return fetchJSON('/api/logs').then(function(allLogs){
    return buildDeliveryPlanExport(applyGtFilters(_gtLastTasks || []), _gtLastSprints || [], 'Timeline nhóm', allLogs);
  });
}, 'ttt-timeline-nhom');
wireExportExcelButton('exportGtExcelBtn', function(){
  return fetchJSON('/api/logs').then(function(allLogs){
    return buildSprintExcelRows(applyGtFilters(_gtLastTasks || []), _gtLastSprints || [], allLogs);
  });
}, 'ttt-timeline-nhom', 'Timeline nhom');

// ---- Bảng danh sách: every task, every column, on/off per column (which
// columns are visible persists in localStorage — see save/loadTableColumnPrefs),
// filterable, and groupable — the "spreadsheet" view this app never had
// after replacing the original Excel sheet. A row click opens the same
// edit drawer every other view uses instead of a second, parallel
// inline-editing UI. Reuses gtGroupsForMode/gtTaskGroupKey (defined above
// for Timeline nhóm) for the category/sprint/phase/platform grouping —
// only 'status' and the ungrouped default are specific to this view. ----
var TABLE_COLUMNS = [
  { key: 'stt', label: 'STT' },
  { key: 'category', label: 'Category' },
  { key: 'name', label: 'Nghiệp vụ' },
  { key: 'why', label: 'Tại sao cần làm' },
  { key: 'platform', label: 'Platform' },
  { key: 'phase', label: 'Phase' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'status', label: 'Status' },
  { key: 'in_analyst_at', label: 'Mốc In Analyst' },
  { key: 'ready_for_dev_at', label: 'Mốc Ready Dev' },
  { key: 'in_test_at', label: 'Mốc In Dev' },
  { key: 'ready_for_staging_at', label: 'Mốc Done UAT' },
  { key: 'done_at', label: 'Mốc Done' },
  { key: 'start', label: 'Start' },
  { key: 'due', label: 'Due' },
  { key: 'resource_roles', label: 'Resource cần' },
  { key: 'done_analyst', label: 'Done Analyst' },
  { key: 'done_dev', label: 'Done Dev' },
  { key: 'done_uat', label: 'Done UAT' },
  { key: 'done_staging', label: 'Done Staging' },
  { key: 'latest_note', label: 'Cập nhật mới nhất' }
];
var TABLE_DEFAULT_VISIBLE = ['stt', 'category', 'name', 'platform', 'phase', 'sprint', 'status', 'start', 'due'];

function loadTableColumnPrefs(){
  try {
    var saved = JSON.parse(localStorage.getItem('ttt_table_columns') || 'null');
    if (Array.isArray(saved) && saved.length){
      return saved.filter(function(k){ return TABLE_COLUMNS.some(function(c){ return c.key === k; }); });
    }
  } catch (e) { /* corrupt/blocked storage — fall through to the default */ }
  return TABLE_DEFAULT_VISIBLE.slice();
}
function saveTableColumnPrefs(){
  try { localStorage.setItem('ttt_table_columns', JSON.stringify(_tableVisibleColumns)); } catch (e) {}
}

var _tableVisibleColumns = loadTableColumnPrefs();
var _tableFilterCategory = [], _tableFilterPlatform = [], _tableFilterStatus = [], _tableFilterPhase = [], _tableFilterSprint = [];
// an optional extra predicate the column-header filters can't express —
// e.g. "Sprint này"'s composed total (this sprint's tasks OR an earlier
// sprint's In-Dev carry-over). Set only by the summary widgets; any
// column-header filter change or "Bỏ lọc" drops it back to null.
var _tableFilterFn = null;
var _tableGroupBy = 'sprint';
// which TABLE_COLUMNS key each group-by mode duplicates — hidden while
// grouped by it (every row in a group already shares that value, shown
// once in the group header instead), layered on top of the user's own
// saved column picks rather than mutating them.
var TABLE_GROUPBY_COLUMN_KEY = { category: 'category', sprint: 'sprint', phase: 'phase', platform: 'platform', status: 'status' };
var _lastTableTasks = null, _lastTableSprints = null, _lastTablePhases = null;
var _tableLatestLogByTaskId = {};

function applyTableFilters(tasks){
  return tasks.filter(function(t){
    if (_tableFilterFn && !_tableFilterFn(t)) return false;
    if (_tableFilterCategory.length && _tableFilterCategory.indexOf(t.category) === -1) return false;
    if (_tableFilterPlatform.length && _tableFilterPlatform.indexOf(t.platform) === -1) return false;
    if (_tableFilterStatus.length && _tableFilterStatus.indexOf(t.status) === -1) return false;
    if (_tableFilterPhase.length && _tableFilterPhase.indexOf(String(t.phase_id)) === -1) return false;
    if (_tableFilterSprint.length && _tableFilterSprint.indexOf(String(t.sprint_id)) === -1) return false;
    return true;
  });
}
function tableFilterOnChange(){
  // touching any column-header filter means the user's back in the plain
  // dimension-by-dimension model — the composed predicate can't coexist
  // with it legibly.
  _tableFilterFn = null;
  if (_lastTableTasks) renderTableView(applyTableFilters(_lastTableTasks));
}

// filters live IN the column headers now (a small dropdown trigger next to
// each filterable column's label), not a separate "Lọc theo" row — these
// two lookups are what renderTableView's header-building code needs per
// column: which array holds that column's current selection, and what
// options to offer for it.
function tableColumnFilterArray(colKey){
  switch (colKey){
    case 'category': return _tableFilterCategory;
    case 'platform': return _tableFilterPlatform;
    case 'status': return _tableFilterStatus;
    case 'phase': return _tableFilterPhase;
    case 'sprint': return _tableFilterSprint;
    default: return null;
  }
}
function tableColumnFilterOptions(colKey){
  switch (colKey){
    case 'category': return bucketsForGroupBy(_lastTableTasks || [], 'category');
    case 'platform': return bucketsForGroupBy(_lastTableTasks || [], 'platform');
    case 'status': return bucketsForGroupBy(_lastTableTasks || [], 'status');
    case 'phase': return (_lastTablePhases || []).map(function(p){ return { key: String(p.id), label: p.code + ': ' + p.name }; });
    case 'sprint': return (_lastTableSprints || []).map(function(s){ return { key: String(s.id), label: s.code }; });
    default: return [];
  }
}

// 'status' plus sprint/phase (both with their own date range, unlike
// Timeline nhóm's plain-code labels — this view's whole point is a quick
// data scan, and "S16" alone doesn't say when that is) are specific to
// this view; category/platform still delegate to the shared
// gtGroupsForMode (Timeline nhóm) since a bare name is enough for those.
// 'none' never reaches this, renderTableView handles it directly.
function tableGroupsForMode(tasks, sprints, phases, groupBy){
  if (groupBy === 'status'){
    return STATUS_ORDER.map(function(s, idx){ return { key: s, label: statusLabel[idx].replace(/^\d+\.\s*/, '') }; });
  }
  if (groupBy === 'sprint'){
    var sprintGroups = sprints.map(function(s){ return { key: 's' + s.id, label: s.code + ' (' + fmtRange(s.start_date, s.end_date) + ')' }; });
    sprintGroups.push({ key: 'none', label: 'Chưa gán sprint' });
    return sprintGroups;
  }
  if (groupBy === 'phase'){
    var phaseGroups = phases.map(function(p){ return { key: 'p' + p.id, label: p.code + ' — mốc ' + fmtDMY(p.target_date) }; });
    phaseGroups.push({ key: 'none', label: 'Chưa gán phase' });
    return phaseGroups;
  }
  return gtGroupsForMode(tasks, sprints, phases, groupBy);
}
function tableTaskGroupKey(t, groupBy){
  return groupBy === 'status' ? t.status : gtTaskGroupKey(t, groupBy);
}

// rows within each group sort A-Z by whichever column is currently 2nd
// among the VISIBLE ones — always skipping STT (a sequence number, not
// something to alphabetize), and computed fresh each render since which
// column ends up 2nd shifts as columns are hidden/shown or by the active
// group-by (that column itself drops out of visibleCols while grouped by it).
function tableRowSortColumn(visibleCols){
  return visibleCols.filter(function(c){ return c.key !== 'stt'; })[0] || visibleCols[0];
}
function tableSortByColumn(col){
  return function(a, b){
    var av = String(tableCellPlainText(col, a) || '');
    var bv = String(tableCellPlainText(col, b) || '');
    return av.localeCompare(bv, 'vi');
  };
}

// the flat task list in the exact top-to-bottom order the rows render —
// grouped-then-sorted when a group-by is active, plain-sorted when not.
// Shared by renderTableView and the export builders so the STT running
// number (just a 1..N row counter now, not t.stt) and the row order stay
// identical between what's on screen and what gets exported.
function tableOrderedTasks(tasks, visibleCols){
  var rowSortFn = tableSortByColumn(tableRowSortColumn(visibleCols));
  if (_tableGroupBy === 'none') return tasks.slice().sort(rowSortFn);
  var ordered = [];
  tableGroupsForMode(tasks, _lastTableSprints || [], _lastTablePhases || [], _tableGroupBy).forEach(function(g){
    tasks.filter(function(t){ return tableTaskGroupKey(t, _tableGroupBy) === g.key; })
      .sort(rowSortFn)
      .forEach(function(t){ ordered.push(t); });
  });
  return ordered;
}

function tableCellHtml(col, t){
  switch (col.key){
    case 'stt': return t.stt != null ? String(t.stt) : '';
    case 'category': return escapeHtml(t.category || '');
    case 'name': return escapeHtml(t.name || '');
    case 'why': return escapeHtml(t.why || '');
    case 'platform': return escapeHtml(t.platform || '');
    case 'phase': return escapeHtml(t.phase_code || '');
    case 'sprint': return escapeHtml(t.sprint_code || '');
    case 'status': {
      var idx = statusDotToNum(t.status);
      return '<span class="pill st-' + idx + '">' + escapeHtml(statusLabel[idx].replace(/^\d+\.\s*/, '')) + '</span>';
    }
    case 'start': {
      var r1 = effectiveRange(t);
      return r1 ? fmtDMY(toIsoDate(r1.start)) : (t.start_date ? fmtDMY(t.start_date) : '');
    }
    case 'due': {
      var r2 = effectiveRange(t);
      return r2 ? fmtDMY(toIsoDate(r2.end)) : (t.due_date ? fmtDMY(t.due_date) : '');
    }
    case 'resource_roles': return escapeHtml((t.resource_roles || []).join(', '));
    case 'done_analyst': return t.done_analyst ? '✓' : '';
    case 'done_dev': return t.done_dev ? '✓' : '';
    case 'done_uat': return t.done_uat ? '✓' : '';
    case 'done_staging': return t.done_staging ? '✓' : '';
    case 'in_analyst_at': case 'ready_for_dev_at': case 'in_test_at':
    case 'ready_for_staging_at': case 'done_at':
      return escapeHtml(fmtStamp(t[col.key]));
    case 'latest_note': {
      var log = _tableLatestLogByTaskId[t.id];
      return log ? escapeHtml(stripActorSuffix(log.note)) : '<span class="sprint-report-empty">Chưa có log</span>';
    }
    default: return '';
  }
}

// ---- inline cell editing (editor role only) — name/why/start/due as
// plain inputs, category/platform/phase/sprint/status as <select>. Saving
// happens on the native 'change' event (fires on blur-with-a-real-change
// for text/date inputs, and immediately on pick for selects — exactly
// "sửa xong rời khỏi cell là lưu" for both widget kinds with one listener).
// STT is a plain 1..N row counter (see renderTableRow) — not editable and
// not tied to any task. resource_roles/done_*/latest_note stay read-only
// here too — click the row to open the full drawer for those. ----
var TABLE_EDITABLE_FIELDS = ['name', 'why', 'category', 'platform', 'phase', 'sprint', 'status', 'start', 'due'];

function appendEditableInput(td, type, field, task, value){
  var input = document.createElement('input');
  input.type = type; input.className = 'table-cell-input';
  input.dataset.field = field; input.dataset.taskId = task.id;
  input.value = value != null ? value : '';
  input.dataset.original = input.value;
  td.appendChild(input);
}
// a plain <input> can never wrap — for the one field long enough that
// clipping it defeats the point of a "see the full name" table (the task
// name), a <textarea> that grows with its content instead. Height is set
// once here from scrollHeight (only accurate once the row is actually in
// the live DOM, so renderTableView does a pass over every one of these
// right after inserting the table) and again live on 'input' below.
function appendEditableTextarea(td, field, task, value){
  var ta = document.createElement('textarea');
  ta.className = 'table-cell-input table-cell-textarea'; ta.rows = 1;
  ta.dataset.field = field; ta.dataset.taskId = task.id;
  ta.value = value != null ? value : '';
  ta.dataset.original = ta.value;
  td.appendChild(ta);
}
function autoGrowTableTextarea(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
// scrollHeight reads as 0 for every element inside a hidden ancestor (an
// unavoidable browser fact, not a bug to fix here) — so a pass run while
// the Bảng danh sách view itself isn't the active/visible one bakes in a
// permanent 0px for every row. renderTableView (which may run before the
// view is ever switched to, e.g. on initial page load) can't avoid that by
// itself, so nav-switching into this view re-runs the same pass — cheap
// (a couple hundred rows at most) and a no-op if heights are already right.
function autoGrowAllTableTextareas(){
  var wrap = document.getElementById('tableViewWrap');
  if (!wrap) return;
  wrap.querySelectorAll('.table-cell-textarea').forEach(autoGrowTableTextarea);
}
function appendEditableSelect(td, field, task, options, selectedValue, emptyLabel){
  var select = document.createElement('select');
  select.className = 'table-cell-input';
  select.dataset.field = field; select.dataset.taskId = task.id;
  if (emptyLabel){
    var emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = emptyLabel;
    select.appendChild(emptyOpt);
  }
  options.forEach(function(opt){
    var o = document.createElement('option'); o.value = opt.key; o.textContent = opt.label;
    if (opt.key === selectedValue) o.selected = true;
    select.appendChild(o);
  });
  select.dataset.original = selectedValue;
  td.appendChild(select);
}
function appendEditableCell(td, col, t){
  switch (col.key){
    case 'name': appendEditableTextarea(td, 'name', t, t.name || ''); return;
    case 'why': appendEditableInput(td, 'text', 'why', t, t.why || ''); return;
    case 'start': appendEditableInput(td, 'date', 'start', t, t.start_date || ''); return;
    case 'due': appendEditableInput(td, 'date', 'due', t, t.due_date || ''); return;
    case 'category':
      appendEditableSelect(td, 'category', t, bucketsForGroupBy(_lastTableTasks || [], 'category'), t.category || '');
      return;
    case 'platform':
      appendEditableSelect(td, 'platform', t, PLATFORM_OPTIONS.map(function(p){ return { key: p, label: p }; }), t.platform || '');
      return;
    case 'phase':
      appendEditableSelect(
        td, 'phase', t,
        (_lastTablePhases || []).map(function(p){ return { key: String(p.id), label: p.code + ': ' + p.name }; }),
        t.phase_id != null ? String(t.phase_id) : '', '— không có —'
      );
      return;
    case 'sprint':
      appendEditableSelect(
        td, 'sprint', t,
        (_lastTableSprints || []).map(function(s){ return { key: String(s.id), label: s.code }; }),
        t.sprint_id != null ? String(t.sprint_id) : '', '— không có —'
      );
      return;
    case 'status':
      appendEditableSelect(
        td, 'status', t,
        STATUS_ORDER.map(function(s, idx){ return { key: s, label: statusLabel[idx].replace(/^\d+\.\s*/, '') }; }),
        t.status
      );
      return;
  }
}
// appendEditableSelect's `options` take {key,label} — same shape
// bucketsForGroupBy/renderMultiSelectDropdown already use elsewhere — so
// every call above (bucketsForGroupBy's own output, or a hand-built list)
// passes straight through without reshaping.

function renderTableRow(t, visibleCols, canEdit, rowNum){
  var tr = document.createElement('tr');
  tr.className = 'data-table-row';
  tr.dataset.taskId = t.id;
  visibleCols.forEach(function(col){
    var td = document.createElement('td');
    if (col.key === 'stt'){
      // just the row's position top-to-bottom in the current sort/grouping
      // — not t.stt, not editable.
      td.className = 'data-table-stt';
      td.textContent = rowNum;
    } else if (col.key === 'latest_note'){
      td.className = 'data-table-cell-wrap data-table-cell-notes';
      td.innerHTML = tableCellHtml(col, t);
    } else {
      if (col.key === 'why' || col.key === 'name') td.className = 'data-table-cell-wrap';
      if (canEdit && TABLE_EDITABLE_FIELDS.indexOf(col.key) !== -1) appendEditableCell(td, col, t);
      else td.innerHTML = tableCellHtml(col, t);
    }
    tr.appendChild(td);
  });
  return tr;
}

// full PUT body for a task, same field set the drawer's own save handler
// sends — this endpoint full-replaces every field, so every caller (this
// one included) must carry forward whatever it isn't changing, or that
// field gets silently cleared.
function buildTaskPutBody(task, overrides){
  var body = {
    category: task.category, name: task.name, platform: task.platform, status: task.status,
    phase_id: task.phase_id, sprint_id: task.sprint_id, stt: task.stt, why: task.why,
    resource_roles: task.resource_roles,
    done_analyst: task.done_analyst, done_dev: task.done_dev, done_uat: task.done_uat, done_staging: task.done_staging,
    start_date: task.start_date, due_date: task.due_date, date_overridden: !!task.date_overridden
  };
  Object.keys(overrides).forEach(function(k){ body[k] = overrides[k]; });
  return body;
}
function saveTaskInlineField(task, overrides){
  return authFetch('/api/tasks/' + task.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskPutBody(task, overrides))
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(body){
        throw new Error(body.error || ('HTTP ' + res.status));
      });
    }
  });
}

// due date changes go through the same mandatory-reason gate as every
// other date change made outside the drawer (Timeline/Sprint Overview drag)
// once the task's CURRENT due date is already due or overdue.
function handleInlineDueChange(task, newDue, input){
  function commit(reason){
    input.disabled = true;
    saveTaskInlineField(task, { due_date: newDue, date_overridden: true })
      .then(function(){ if (reason) return postDateChangeReasonLog(task.id, reason); })
      .then(function(){ toastSuccess('Đã lưu.'); refreshAllViews(); })
      .catch(function(err){
        toastError('Không lưu được: ' + err.message);
        input.value = input.dataset.original;
        input.disabled = false;
      });
  }
  if (dueDateIsDueOrOverdue(task.due_date)){
    promptDateChangeReason(task.name, commit, function(){ input.value = input.dataset.original; });
  } else {
    commit(null);
  }
}
// same gate + the exact updateTaskSprint helper the Sprint Overview drag-
// to-regroup already uses, so an inline sprint change re-derives start/due
// from the new sprint (and clears date_overridden) identically either way.
function handleInlineSprintChange(task, newSprintIdStr, input){
  var newSprintId = newSprintIdStr === '' ? null : Number(newSprintIdStr);
  function commit(reason){
    input.disabled = true;
    updateTaskSprint(task, newSprintId, _lastTableSprints || [])
      .then(function(){ if (reason) return postDateChangeReasonLog(task.id, reason); })
      .then(function(){ toastSuccess('Đã đổi sprint cho "' + task.name + '"'); refreshAllViews(); })
      .catch(function(err){
        toastError('Không đổi được sprint: ' + err.message);
        input.value = input.dataset.original;
        input.disabled = false;
      });
  }
  if (dueDateIsDueOrOverdue(task.due_date)){
    promptDateChangeReason(task.name, commit, function(){ input.value = input.dataset.original; });
  } else {
    commit(null);
  }
}

document.getElementById('tableViewWrap').addEventListener('input', function(e){
  if (e.target.classList.contains('table-cell-textarea')) autoGrowTableTextarea(e.target);
});

document.getElementById('tableViewWrap').addEventListener('change', function(e){
  var input = e.target.closest('.table-cell-input');
  if (!input) return;
  var task = _lastTableTasks && _lastTableTasks.find(function(t){ return String(t.id) === input.dataset.taskId; });
  if (!task) return;
  var field = input.dataset.field;
  var newValue = input.value;
  if (newValue === input.dataset.original) return; // left the cell without really changing it

  if (field === 'sprint'){ handleInlineSprintChange(task, newValue, input); return; }
  if (field === 'due'){ handleInlineDueChange(task, newValue, input); return; }

  var overrides;
  switch (field){
    case 'phase': overrides = { phase_id: newValue === '' ? null : Number(newValue) }; break;
    case 'start': overrides = { start_date: newValue, date_overridden: true }; break;
    default: overrides = {}; overrides[field] = newValue; break; // name, why, category, platform, status
  }
  input.disabled = true;
  saveTaskInlineField(task, overrides).then(function(){
    toastSuccess('Đã lưu.');
    refreshAllViews();
  }).catch(function(err){
    toastError('Không lưu được: ' + err.message);
    input.value = input.dataset.original;
    input.disabled = false;
  });
});

// each filterable column's <th> gets its own small dropdown trigger —
// built the same way the old standalone "Lọc theo" row's dropdowns were,
// just rendered into a holder inside the header cell instead. Column
// order still comes entirely from TABLE_COLUMNS/visibleCols; this only
// decides whether a given <th> also carries a filter trigger.
function appendColumnHeaderFilter(th, colKey){
  var arr = tableColumnFilterArray(colKey);
  if (!arr) return;
  var holder = document.createElement('span');
  holder.className = 'data-table-th-filter';
  th.appendChild(holder);
  renderMultiSelectDropdown(holder, '', tableColumnFilterOptions(colKey), arr, tableFilterOnChange);
}

function renderTableView(tasks){
  var wrap = document.getElementById('tableViewWrap');
  if (!wrap) return;
  var hiddenByGroup = TABLE_GROUPBY_COLUMN_KEY[_tableGroupBy];
  var visibleCols = TABLE_COLUMNS.filter(function(c){ return _tableVisibleColumns.indexOf(c.key) !== -1 && c.key !== hiddenByGroup; });
  if (visibleCols.length === 0){
    wrap.innerHTML = '<div class="view-sub" style="padding:16px;">Chưa chọn cột nào để hiển thị — bấm "Cột" ở trên.</div>';
    return;
  }

  var table = document.createElement('table'); table.className = 'data-table';
  var thead = document.createElement('thead');
  var headRow = document.createElement('tr');
  visibleCols.forEach(function(col){
    var th = document.createElement('th');
    var labelSpan = document.createElement('span'); labelSpan.textContent = col.label;
    th.appendChild(labelSpan);
    appendColumnHeaderFilter(th, col.key);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var canEdit = hasRole('editor');
  var rowSortFn = tableSortByColumn(tableRowSortColumn(visibleCols));
  var tbody = document.createElement('tbody');
  var rowNum = 0; // STT: a running 1..N counter down the whole table
  if (tasks.length === 0){
    var emptyTr = document.createElement('tr');
    var emptyTd = document.createElement('td'); emptyTd.colSpan = visibleCols.length;
    emptyTd.className = 'view-sub'; emptyTd.style.padding = '16px'; emptyTd.textContent = 'Không có nghiệp vụ nào khớp filter.';
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
  } else if (_tableGroupBy === 'none'){
    tasks.slice().sort(rowSortFn).forEach(function(t){ tbody.appendChild(renderTableRow(t, visibleCols, canEdit, ++rowNum)); });
  } else {
    tableGroupsForMode(tasks, _lastTableSprints || [], _lastTablePhases || [], _tableGroupBy).forEach(function(g){
      var groupTasks = tasks.filter(function(t){ return tableTaskGroupKey(t, _tableGroupBy) === g.key; }).sort(rowSortFn);
      if (groupTasks.length === 0) return;
      var headTr = document.createElement('tr'); headTr.className = 'data-table-group-row';
      var th = document.createElement('td'); th.colSpan = visibleCols.length;
      th.textContent = g.label + ' (' + groupTasks.length + ')';
      headTr.appendChild(th);
      tbody.appendChild(headTr);
      groupTasks.forEach(function(t){ tbody.appendChild(renderTableRow(t, visibleCols, canEdit, ++rowNum)); });
    });
  }
  table.appendChild(tbody);
  wrap.innerHTML = '';
  wrap.appendChild(table);
  // scrollHeight is only reliably accurate once the browser has actually
  // laid the table out — for a big rebuild (100+ rows at once) reading it
  // synchronously right after appendChild measured stale (pre-layout)
  // heights for some rows. requestAnimationFrame would be the usual fix,
  // but rAF callbacks are suspended entirely on a backgrounded tab (a
  // real scenario: switching tabs mid-load), so a textarea could be left
  // permanently un-grown. setTimeout still fires on a hidden tab (only
  // throttled, never suspended), so it defers past the same layout race
  // without that risk. (If this view itself isn't the visible one right
  // now, scrollHeight is 0 regardless of timing — see the nav-switch call
  // to autoGrowAllTableTextareas() that covers that case.)
  setTimeout(autoGrowAllTableTextareas, 0);
}

document.getElementById('tableViewWrap').addEventListener('click', function(e){
  if (e.target.closest('.table-cell-input')) return; // let the input/select handle its own interaction
  var row = e.target.closest('.data-table-row');
  if (!row || !_lastTableTasks) return;
  var task = _lastTableTasks.find(function(t){ return String(t.id) === row.dataset.taskId; });
  if (task) openDrawer('edit', task);
});

// scoped to [data-groupby] specifically — the export JSON/Excel buttons
// now sit inside this same chip row (to share the line, see
// .table-export-actions) and are plain .chip too, but aren't group-by chips.
document.querySelectorAll('#tableGroupByChips .chip[data-groupby]').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#tableGroupByChips .chip[data-groupby]').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _tableGroupBy = btn.dataset.groupby;
    if (_lastTableTasks) renderTableView(applyTableFilters(_lastTableTasks));
  });
});

// column-visibility picker: static list (TABLE_COLUMNS never changes), so
// wired once here rather than re-rendered on every loadTableView() — a
// re-render would also risk closing the panel mid-click.
renderMultiSelectDropdown(
  document.getElementById('tableColumnsMs'), 'Cột', TABLE_COLUMNS, _tableVisibleColumns,
  function(){
    saveTableColumnPrefs();
    if (_lastTableTasks) renderTableView(applyTableFilters(_lastTableTasks));
  },
  false, { alignRight: true }
);

function loadTableView(){
  return Promise.all([loadTasks(), loadSprints(), loadPhasesList(), fetchJSON('/api/logs')])
    .then(function(results){
      _lastTableTasks = results[0]; _lastTableSprints = results[1]; _lastTablePhases = results[2];
      // /api/logs is already sorted newest-first, so the first entry seen
      // per task_id is that task's most recent log — same reduction used
      // by the Sprint page and Timeline nhóm.
      _tableLatestLogByTaskId = {};
      results[3].forEach(function(l){
        if (!(l.task_id in _tableLatestLogByTaskId)) _tableLatestLogByTaskId[l.task_id] = l;
      });
      // only pick the default phase to show ONCE — a data refresh (task
      // save, filter elsewhere, refreshAllViews) must not yank the user
      // back to "today's phase" while they're looking at another one.
      if (!_tableSummaryInitialized && _lastTablePhases.length){
        _tableSummaryInitialized = true;
        var idx = _lastTablePhases.findIndex(function(p){ return p.pct_complete !== null && p.pct_complete < 100; });
        _tableSummaryPhaseIdx = idx === -1 ? _lastTablePhases.length - 1 : idx;
        // the table below starts scoped to that same phase (the pivot's
        // ‹ › then moves both together); don't override a filter the user
        // somehow already set before this first load finished.
        var initPhase = _lastTablePhases[_tableSummaryPhaseIdx];
        if (initPhase && !_tableFilterPhase.length) _tableFilterPhase.push(String(initPhase.id));
      }
      renderTableView(applyTableFilters(_lastTableTasks));
      // rebuilt on every load (categories are live data, not a static
      // list) — same "genuine data reload" rule renderMultiSelectDropdown
      // itself calls out; its onChange only re-renders the 2 summary
      // widgets below, never this dropdown, so an open panel never gets
      // torn out from under a mid-click user.
      renderMultiSelectDropdown(
        document.getElementById('tableSummaryCategoryMs'), 'Category',
        bucketsForGroupBy(_lastTableTasks, 'category'), _tableSummaryCategoryFilter,
        function(){ renderPhaseSummary(); renderSprintSummary(); }
      );
      renderPhaseSummary();
      renderSprintSummary();
    })
    .catch(function(err){
      console.error('Failed to load Bảng danh sách', err);
      var wrap = document.getElementById('tableViewWrap');
      if (wrap) wrap.innerHTML = '<div class="view-sub" style="padding:16px;">Không tải được dữ liệu. Thử tải lại trang.</div>';
    });
}

// ---- phase summary: category x status pivot for one phase at a time
// (the one "current" today by default — same isCurrentPhase definition
// the Roadmap cards use: the first phase whose pct_complete hasn't hit
// 100 yet), with prev/next arrows to page through every other phase.
// Reuses the phases' own server-computed pct_complete (already on
// _lastTablePhases from /api/phases) rather than recomputing it. ----
var _tableSummaryPhaseIdx = 0;
var _tableSummaryInitialized = false;
// one Category filter shared by the phase pivot AND both sprint boxes
// (rendered via #tableSummaryCategoryMs, see loadTableView) — separate
// from the detail table's own per-column Category filter. Empty = every
// category, same "no filter" convention as every other filter array here.
var _tableSummaryCategoryFilter = [];

function buildPhaseSummaryRows(phaseTasks){
  return bucketsForGroupBy(phaseTasks, 'category').map(function(cat){
    var catTasks = phaseTasks.filter(function(t){ return t.category === cat.key; });
    return {
      key: cat.key,
      label: cat.label,
      total: catTasks.length,
      byStatus: STATUS_ORDER.map(function(s){ return catTasks.filter(function(t){ return t.status === s; }).length; }),
      doneCount: catTasks.filter(isEffectivelyDone).length
    };
  }).filter(function(row){ return row.total > 0; });
}

// shows BOTH numbers, not just the ratio — "6/9 · 66.7%" instead of a bare
// "66.7%" that leaves you guessing what the two counts behind it were.
function phaseSummaryPctText(doneCount, total){
  if (total === 0) return '';
  return doneCount + '/' + total + ' · ' + (Math.round((doneCount / total) * 1000) / 10) + '%';
}

// statuses "Hoàn thành" counts as done — same >= Done UAT threshold
// isEffectivelyDone itself uses, so a click on that column filters to
// exactly the same set of tasks the percentage was computed from.
var PHASE_SUMMARY_DONE_STATUSES = STATUS_ORDER.filter(function(s){ return statusDotToNum(s) >= 4; });

// every count cell doubles as a filter shortcut into the table below —
// data-cat/data-status ("" means "every category"/"every status") plus
// data-done for the Hoàn thành column, read back in the click handler.
function phaseSummaryCellAttrs(catKey, status, isDone){
  return 'data-clickable="1" data-cat="' + escapeHtml(catKey || '') + '"' +
    (isDone ? ' data-done="1"' : ' data-status="' + escapeHtml(status || '') + '"');
}

function renderPhaseSummary(){
  var titleEl = document.getElementById('phaseSummaryTitle');
  var wrap = document.getElementById('phaseSummaryTableWrap');
  var prevBtn = document.getElementById('phaseSummaryPrev');
  var nextBtn = document.getElementById('phaseSummaryNext');
  var phases = _lastTablePhases || [];
  if (phases.length === 0){
    titleEl.textContent = 'Chưa có phase nào.';
    wrap.innerHTML = '';
    prevBtn.disabled = nextBtn.disabled = true;
    return;
  }
  var phase = phases[_tableSummaryPhaseIdx];
  titleEl.textContent = phase.code + ': ' + phase.name + ' — mốc ' + fmtDMY(phase.target_date);
  prevBtn.disabled = _tableSummaryPhaseIdx === 0;
  nextBtn.disabled = _tableSummaryPhaseIdx === phases.length - 1;

  var phaseTasks = (_lastTableTasks || []).filter(function(t){
    return t.phase_id === phase.id &&
      (!_tableSummaryCategoryFilter.length || _tableSummaryCategoryFilter.indexOf(t.category) !== -1);
  });
  var rows = buildPhaseSummaryRows(phaseTasks);
  if (rows.length === 0){
    wrap.innerHTML = '<div class="view-sub" style="padding:6px 0;">Phase này chưa có nghiệp vụ khớp filter.</div>';
    return;
  }

  var statusLabels = STATUS_ORDER.map(function(s, idx){ return statusLabel[idx].replace(/^\d+\.\s*/, ''); });
  var headHtml = '<tr><th>Category</th>' + statusLabels.map(function(l){ return '<th>' + escapeHtml(l) + '</th>'; }).join('') +
    '<th>Tổng</th><th>Hoàn thành</th></tr>';

  var bodyHtml = rows.map(function(r){
    var statusCells = r.byStatus.map(function(c, idx){
      return '<td class="phase-summary-value" ' + phaseSummaryCellAttrs(r.key, STATUS_ORDER[idx]) + '>' + (c || '') + '</td>';
    }).join('');
    return '<tr><td class="phase-summary-cat">' + escapeHtml(r.label) + '</td>' + statusCells +
      '<td class="phase-summary-value" ' + phaseSummaryCellAttrs(r.key, '') + '>' + r.total + '</td>' +
      '<td class="phase-summary-value" ' + phaseSummaryCellAttrs(r.key, null, true) + '>' + phaseSummaryPctText(r.doneCount, r.total) + '</td></tr>';
  }).join('');

  var totalByStatus = STATUS_ORDER.map(function(s){ return phaseTasks.filter(function(t){ return t.status === s; }).length; });
  var totalDone = phaseTasks.filter(isEffectivelyDone).length;
  var totalStatusCells = totalByStatus.map(function(c, idx){
    return '<td class="phase-summary-value" ' + phaseSummaryCellAttrs('', STATUS_ORDER[idx]) + '>' + (c || '') + '</td>';
  }).join('');
  var totalRow = '<tr class="phase-summary-total-row"><td class="phase-summary-cat">Tổng</td>' + totalStatusCells +
    '<td class="phase-summary-value" ' + phaseSummaryCellAttrs('', '') + '>' + phaseTasks.length + '</td>' +
    '<td class="phase-summary-value" ' + phaseSummaryCellAttrs('', null, true) + '>' + phaseSummaryPctText(totalDone, phaseTasks.length) + '</td></tr>';

  wrap.innerHTML = '<table class="phase-summary-table"><thead>' + headHtml + '</thead><tbody>' + bodyHtml + totalRow + '</tbody></table>';
}

// the table below is scoped to whichever phase this pivot is on by
// default — so paging the pivot re-scopes the table to match. The user
// widens it again by changing the Phase column filter (or "Bỏ lọc").
function syncTablePhaseFilterToSummary(){
  var phases = _lastTablePhases || [];
  var phase = phases[_tableSummaryPhaseIdx];
  if (!phase) return;
  _tableFilterFn = null;
  _tableFilterPhase.length = 0;
  _tableFilterPhase.push(String(phase.id));
  if (_lastTableTasks) renderTableView(applyTableFilters(_lastTableTasks));
}
document.getElementById('phaseSummaryPrev').addEventListener('click', function(){
  if (_tableSummaryPhaseIdx > 0){ _tableSummaryPhaseIdx--; renderPhaseSummary(); syncTablePhaseFilterToSummary(); }
});
document.getElementById('phaseSummaryNext').addEventListener('click', function(){
  if (_lastTablePhases && _tableSummaryPhaseIdx < _lastTablePhases.length - 1){ _tableSummaryPhaseIdx++; renderPhaseSummary(); syncTablePhaseFilterToSummary(); }
});

// clicking a count in the pivot jumps the table below straight to that
// slice (phase + category + status, or the Done UAT/Done pair for "Hoàn
// thành") — resets Platform/Sprint since they're unrelated to what this
// widget is slicing by, same as clearAllTableFilters below.
document.getElementById('phaseSummaryTableWrap').addEventListener('click', function(e){
  var cell = e.target.closest('td[data-clickable]');
  if (!cell || !_lastTablePhases || !_lastTablePhases.length) return;
  var phase = _lastTablePhases[_tableSummaryPhaseIdx];
  _tableFilterFn = null;
  _tableFilterPhase.length = 0; _tableFilterPhase.push(String(phase.id));
  _tableFilterCategory.length = 0;
  if (cell.dataset.cat) _tableFilterCategory.push(cell.dataset.cat);
  // Tổng row (no single category of its own) — carry the shared summary
  // Category filter through, so the table lands on exactly what "Tổng"
  // just counted instead of silently widening back to every category.
  else _tableSummaryCategoryFilter.forEach(function(c){ _tableFilterCategory.push(c); });
  _tableFilterStatus.length = 0;
  if (cell.dataset.done === '1') PHASE_SUMMARY_DONE_STATUSES.forEach(function(s){ _tableFilterStatus.push(s); });
  else if (cell.dataset.status) _tableFilterStatus.push(cell.dataset.status);
  _tableFilterPlatform.length = 0;
  _tableFilterSprint.length = 0;
  renderTableView(applyTableFilters(_lastTableTasks));
  document.getElementById('tableViewWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function clearAllTableFilters(){
  _tableFilterFn = null;
  _tableFilterCategory.length = 0; _tableFilterPlatform.length = 0; _tableFilterStatus.length = 0;
  _tableFilterPhase.length = 0; _tableFilterSprint.length = 0;
  if (_lastTableTasks) renderTableView(applyTableFilters(_lastTableTasks));
}
document.getElementById('tableClearFiltersBtn').addEventListener('click', clearAllTableFilters);

// ---- sprint summary: the sprint that contains today ("Sprint này") and
// the one right after it ("Sprint sau"), picked by date exactly like the
// Sprint tab's /current-next endpoint. "Sprint này" also folds in
// carry-over from earlier sprints (a sprint that ended before this one
// started): tasks still In Dev, plus tasks that reached Done UAT/Done but
// were last touched during THIS sprint (updated_at is the only "when did
// it move" signal — status changes aren't logged — so it stands in for
// "finished as carry-over, not on time"). "Sprint sau" is just its own
// tasks. Each box shows the sprint code + range, a total, a per-status
// split, a ratio, and (for "này") how the total breaks down. Every number
// click-filters the table below via _tableFilterFn. ----
var SPRINT_SUMMARY_DEFS = [
  {
    label: 'Sprint này', pick: 'current',
    statuses: ['3.in_test', '4.ready_for_staging', '5.done'],
    ratioStatuses: ['4.ready_for_staging', '5.done'], ratioLabel: 'Hoàn thành',
    carryOver: true
  },
  {
    label: 'Sprint sau', pick: 'next',
    statuses: ['0.backlog', '1.in_analyst', '2.ready_for_dev'],
    ratioStatuses: ['2.ready_for_dev'], ratioLabel: 'Sẵn sàng'
  }
];
var SPRINT_CARRY_DONE_STATUSES = ['4.ready_for_staging', '5.done'];
// same rule as src/lib/pickCurrentAndNextSprint.js: the sprint whose range
// covers today is "current" and the next one by start_date is "next"; if
// today sits in a gap between cycles, current is null and next is the
// first upcoming sprint.
function pickTableCurrentNextSprint(){
  var sorted = (_lastTableSprints || []).slice().sort(function(a, b){ return a.start_date.localeCompare(b.start_date); });
  var today = todayIsoLocal();
  var ci = sorted.findIndex(function(s){ return s.start_date <= today && today <= s.end_date; });
  if (ci === -1) return { current: null, next: sorted.find(function(s){ return s.start_date > today; }) || null };
  return { current: sorted[ci], next: sorted[ci + 1] || null };
}
// is `t` carry-over into the sprint that started on `startIso`, given the
// ids of every sprint that ended before then? Still In Dev (dev work that
// slipped), OR reached Done UAT/Done but only entered that status during
// this sprint (the *_at stamp, set server-side on the status change, is
// the precise "when it moved" — updated_at would also catch unrelated
// edits).
function isSprintCarryOver(t, carrySprintIds, startIso){
  if (t.sprint_id == null || carrySprintIds.indexOf(t.sprint_id) === -1) return false;
  if (t.status === '3.in_test') return true;
  if (t.status === '4.ready_for_staging') return !!t.ready_for_staging_at && t.ready_for_staging_at >= startIso;
  if (t.status === '5.done') return !!t.done_at && t.done_at >= startIso;
  return false;
}
// data-* an element needs for the click handler to rebuild its exact task
// set: which sprint is "own", which are carry sources, this sprint's start
// (for the updated_at cutoff), the scope (own / carry / both) and an
// optional status whitelist.
function sprintScopeAttrs(ownId, carrySprintIds, startIso, scope, statuses){
  return 'data-cur="' + ownId + '" data-carry="' + carrySprintIds.join(',') + '" data-start="' + startIso +
    '" data-scope="' + scope + '"' + (statuses && statuses.length ? ' data-statuses="' + statuses.join(',') + '"' : '');
}
function renderSprintSummary(){
  var wrap = document.getElementById('sprintSummaryWrap');
  if (!wrap) return;
  var picks = pickTableCurrentNextSprint();
  var tasks = (_lastTableTasks || []).filter(function(t){
    return !_tableSummaryCategoryFilter.length || _tableSummaryCategoryFilter.indexOf(t.category) !== -1;
  });
  wrap.innerHTML = SPRINT_SUMMARY_DEFS.map(function(def){
    var sprint = picks[def.pick];
    var labelHtml = escapeHtml(def.label) + (sprint ? ' · ' + escapeHtml(sprint.code) +
      '<span class="sprint-summary-box-range">' + escapeHtml(fmtRange(sprint.start_date, sprint.end_date)) + '</span>' : '');
    if (!sprint){
      return '<div class="sprint-summary-box"><div class="sprint-summary-box-label">' + labelHtml + '</div>' +
        '<div class="sprint-summary-box-empty">Chưa xác định sprint theo ngày hôm nay.</div></div>';
    }
    var start = sprint.start_date;
    var ownTasks = tasks.filter(function(t){ return t.sprint_id === sprint.id; });
    var carrySprintIds = [], carryTasks = [];
    if (def.carryOver){
      carrySprintIds = (_lastTableSprints || [])
        .filter(function(s){ return s.end_date < start; })
        .map(function(s){ return s.id; });
      carryTasks = tasks.filter(function(t){ return isSprintCarryOver(t, carrySprintIds, start); });
    }
    var sprintTasks = ownTasks.concat(carryTasks);
    if (sprintTasks.length === 0){
      return '<div class="sprint-summary-box"><div class="sprint-summary-box-label">' + labelHtml + '</div>' +
        '<div class="sprint-summary-box-empty">Chưa có nghiệp vụ.</div></div>';
    }
    var attrs = function(scope, statuses){ return sprintScopeAttrs(sprint.id, carrySprintIds, start, scope, statuses); };

    var breakdown = def.statuses.map(function(s){
      var n = sprintTasks.filter(function(t){ return t.status === s; }).length;
      var lbl = statusLabel[statusDotToNum(s)].replace(/^\d+\.\s*/, '');
      return '<span class="sprint-summary-stat" ' + attrs('both', [s]) + '>' + escapeHtml(lbl) + ' <b>' + n + '</b></span>';
    }).join('');
    var ratioCount = sprintTasks.filter(function(t){ return def.ratioStatuses.indexOf(t.status) !== -1; }).length;

    // "Sprint này": spell out total = own + carry-over, and split the
    // carry-over into still-in-dev vs finished-this-sprint.
    var compHtml = '';
    if (carryTasks.length){
      var carryInDev = carryTasks.filter(function(t){ return t.status === '3.in_test'; }).length;
      var carryDone = carryTasks.length - carryInDev;
      compHtml = '<div class="sprint-summary-box-comp">Gồm: ' +
        '<span class="sprint-summary-stat" ' + attrs('own', null) + '>sprint này <b>' + ownTasks.length + '</b></span> + ' +
        '<span class="sprint-summary-stat" ' + attrs('carry', null) + '>trôi từ trước <b>' + carryTasks.length + '</b></span>' +
        '<span class="sprint-summary-box-comp-sub">(' +
          '<span class="sprint-summary-stat" ' + attrs('carry', ['3.in_test']) + '>đang dev <b>' + carryInDev + '</b></span> · ' +
          '<span class="sprint-summary-stat" ' + attrs('carry', SPRINT_CARRY_DONE_STATUSES) + '>đã xong <b>' + carryDone + '</b></span>' +
        ')</span></div>';
    }

    return '<div class="sprint-summary-box">' +
      '<div class="sprint-summary-box-label">' + labelHtml + '</div>' +
      '<div class="sprint-summary-box-total sprint-summary-stat" ' + attrs('both', null) + '>' + sprintTasks.length + '</div>' +
      '<div class="sprint-summary-box-breakdown">' + breakdown + '</div>' +
      compHtml +
      '<div class="sprint-summary-box-ratio sprint-summary-stat" ' + attrs('both', def.ratioStatuses) + '>' +
        escapeHtml(def.ratioLabel) + ': ' + phaseSummaryPctText(ratioCount, sprintTasks.length) + '</div>' +
    '</div>';
  }).join('');
}
document.getElementById('sprintSummaryWrap').addEventListener('click', function(e){
  var el = e.target.closest('[data-scope]');
  if (!el || !_lastTableTasks) return;
  var cur = Number(el.dataset.cur);
  var carry = el.dataset.carry ? el.dataset.carry.split(',').map(Number) : [];
  var start = el.dataset.start || '';
  var scope = el.dataset.scope;
  var statuses = el.dataset.statuses ? el.dataset.statuses.split(',') : null;
  // one predicate covers every element: own sprint and/or carry-over
  // (In Dev, or Done UAT/Done finished during this sprint), narrowed to a
  // status whitelist when the element represents one, AND to the shared
  // summary Category filter (these numbers were computed under it, so the
  // click has to match). The plain column filters can't express the
  // updated_at cutoff, so it goes through the _tableFilterFn slot; a
  // column-filter change or "Bỏ lọc" clears it.
  _tableFilterFn = function(t){
    if (statuses && statuses.indexOf(t.status) === -1) return false;
    if (_tableSummaryCategoryFilter.length && _tableSummaryCategoryFilter.indexOf(t.category) === -1) return false;
    var own = t.sprint_id === cur;
    var carried = isSprintCarryOver(t, carry, start);
    return scope === 'own' ? own : scope === 'carry' ? carried : (own || carried);
  };
  _tableFilterSprint.length = 0; _tableFilterStatus.length = 0;
  _tableFilterPhase.length = 0; _tableFilterCategory.length = 0; _tableFilterPlatform.length = 0;
  renderTableView(applyTableFilters(_lastTableTasks));
  document.getElementById('tableViewWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---- export (Bảng danh sách): plain-text mirror of tableCellHtml — same
// per-column values, just as bare strings instead of <span>/<select> HTML,
// and reusing the CURRENT visible-columns/order/filters/group-hide state
// exactly as buildTaskExportColumns computes it for on-screen rendering —
// so "what you export" always matches "what you're looking at". ----
function tableCellPlainText(col, t){
  switch (col.key){
    case 'stt': return t.stt != null ? t.stt : '';
    case 'category': return t.category || '';
    case 'name': return t.name || '';
    case 'why': return t.why || '';
    case 'platform': return t.platform || '';
    case 'phase': return t.phase_code || '';
    case 'sprint': return t.sprint_code || '';
    case 'status': return statusLabel[statusDotToNum(t.status)].replace(/^\d+\.\s*/, '');
    case 'start': { var r1 = effectiveRange(t); return r1 ? fmtDMY(toIsoDate(r1.start)) : (t.start_date ? fmtDMY(t.start_date) : ''); }
    case 'due': { var r2 = effectiveRange(t); return r2 ? fmtDMY(toIsoDate(r2.end)) : (t.due_date ? fmtDMY(t.due_date) : ''); }
    case 'resource_roles': return (t.resource_roles || []).join(', ');
    case 'done_analyst': return t.done_analyst ? 'Có' : '';
    case 'done_dev': return t.done_dev ? 'Có' : '';
    case 'done_uat': return t.done_uat ? 'Có' : '';
    case 'done_staging': return t.done_staging ? 'Có' : '';
    case 'in_analyst_at': case 'ready_for_dev_at': case 'in_test_at':
    case 'ready_for_staging_at': case 'done_at':
      return fmtStamp(t[col.key]);
    case 'latest_note': { var log = _tableLatestLogByTaskId[t.id]; return log ? stripActorSuffix(log.note) : ''; }
    default: return '';
  }
}
// same visible-columns computation renderTableView uses (saved column
// picks minus whichever one the active group-by already shows in the row
// header), and the same grouped+sorted row order (tableOrderedTasks) — one
// shared source so the JSON/Excel export can never drift from the
// on-screen table, STT included.
function buildTableExportData(){
  var hiddenByGroup = TABLE_GROUPBY_COLUMN_KEY[_tableGroupBy];
  var visibleCols = TABLE_COLUMNS.filter(function(c){ return _tableVisibleColumns.indexOf(c.key) !== -1 && c.key !== hiddenByGroup; });
  var tasks = tableOrderedTasks(applyTableFilters(_lastTableTasks || []), visibleCols);
  return { visibleCols: visibleCols, tasks: tasks };
}
// STT mirrors the on-screen counter: 1..N in export row order, not t.stt.
function tableExportCell(col, t, i){
  return col.key === 'stt' ? i + 1 : tableCellPlainText(col, t);
}
function buildTableExportJson(){
  var data = buildTableExportData();
  return data.tasks.map(function(t, i){
    var obj = {};
    data.visibleCols.forEach(function(col){ obj[col.label] = tableExportCell(col, t, i); });
    return obj;
  });
}
function buildTableExportAoa(){
  var data = buildTableExportData();
  var header = data.visibleCols.map(function(c){ return c.label; });
  var rows = data.tasks.map(function(t, i){ return data.visibleCols.map(function(col){ return tableExportCell(col, t, i); }); });
  return [header].concat(rows);
}
wireExportJsonButton('exportTableJsonBtn', function(){ return Promise.resolve(buildTableExportJson()); }, 'ttt-bang-danh-sach');
wireExportExcelButton('exportTableExcelBtn', function(){ return Promise.resolve(buildTableExportAoa()); }, 'ttt-bang-danh-sach', 'Bang danh sach');

// hidden scratchpad for measuring how tall a card's real content (with
// wrapping enabled) actually renders at a given width — position:fixed +
// visibility:hidden (NOT display:none) so it still takes part in layout
// even when the Timeline nhóm tab isn't the currently active view. Task/
// cluster box heights are measured this way, using the real CSS classes,
// rather than estimated from a hand-picked line-height constant — an
// estimate is exactly what clipped real text once already here (a too-
// tight guess compounding across a long cluster's bullet list).
var _gtMeasureEl = null;
function gtMeasureHeight(buildFn){
  if (!_gtMeasureEl){
    _gtMeasureEl = document.createElement('div');
    _gtMeasureEl.style.cssText = 'position:fixed; visibility:hidden; left:-9999px; top:-9999px; pointer-events:none;';
    document.body.appendChild(_gtMeasureEl);
  }
  _gtMeasureEl.innerHTML = '';
  _gtMeasureEl.appendChild(buildFn());
  var h = _gtMeasureEl.getBoundingClientRect().height;
  _gtMeasureEl.innerHTML = '';
  return Math.ceil(h) + 1; // +1px safety margin against sub-pixel rounding
}
function measureTaskCardHeight(taskName, datesText, widthPx){
  return gtMeasureHeight(function(){
    var card = document.createElement('div');
    card.className = 'gt-task-card st-0';
    card.style.position = 'static'; card.style.width = widthPx + 'px'; card.style.height = 'auto';
    var titleEl = document.createElement('div'); titleEl.className = 'gt-task-card-title'; titleEl.textContent = taskName;
    var datesEl = document.createElement('div'); datesEl.className = 'gt-task-card-dates'; datesEl.textContent = datesText;
    card.appendChild(titleEl); card.appendChild(datesEl);
    return card;
  });
}
function measureClusterCardHeight(items, metaText, widthPx){
  return gtMeasureHeight(function(){
    var card = document.createElement('div');
    card.className = 'gt-cluster-card st-0';
    card.style.position = 'static'; card.style.width = widthPx + 'px'; card.style.height = 'auto';
    var metaEl = document.createElement('div'); metaEl.className = 'gt-cluster-card-meta'; metaEl.textContent = metaText;
    var listEl = document.createElement('div'); listEl.className = 'gt-cluster-card-list';
    items.forEach(function(it){
      var nameEl = document.createElement('div'); nameEl.className = 'gt-cluster-card-name'; nameEl.textContent = it.task.name;
      listEl.appendChild(nameEl);
    });
    card.appendChild(metaEl); card.appendChild(listEl);
    return card;
  });
}

function renderGroupedTimeline(tasks, sprints, phases){
  var chart = document.getElementById('gtChart');
  if (!chart) return;
  // preserve scroll position and animate cards into their new spot across a
  // re-render (e.g. expand/collapse) instead of snapping back to the top —
  // same captureFlipPositions/playFlip trick used for the Timeline/Sprint
  // panel reflows elsewhere in this file.
  var prevScrollLeft = chart.scrollLeft;
  var prevBody = chart.querySelector('.gt-body');
  var prevScrollTop = prevBody ? prevBody.scrollTop : 0;
  var playFlip = captureFlipPositions(chart, 'data-task-id');
  chart.innerHTML = '';
  chart.onscroll = null;

  var allDates = [];
  tasks.forEach(function(t){
    var r = effectiveRange(t);
    if (r) { allDates.push(r.start, r.end); }
  });
  phases.forEach(function(p){ allDates.push(new Date(p.target_date)); });
  if (allDates.length === 0){
    chart.innerHTML = '<div class="view-sub" style="padding:20px;">Chưa có dữ liệu để hiển thị.</div>';
    return;
  }
  var axisStart = new Date(Math.min.apply(null, allDates));
  var axisEnd = new Date(Math.max.apply(null, allDates));
  axisStart.setDate(axisStart.getDate() - 3); // small padding so edge items aren't flush against the border
  // the trailing end needs much more than that: the last milestone's label
  // is centered on its date (see translateX(-50%) below), so half of it
  // extends PAST that date — with only a few days of buffer there, it (and
  // its dashed line) rendered clipped/broken right at the axis edge. A
  // couple of empty months of headroom, even with nothing scheduled there,
  // keeps the layout intact regardless of where the last real date falls.
  axisEnd.setMonth(axisEnd.getMonth() + 2);
  var axisSpanMs = (axisEnd - axisStart) || 1;

  var PX_PER_DAY = 8; // same scale as the existing Timeline, for a familiar zoom level
  var axisSpanDays = axisSpanMs / (24 * 60 * 60 * 1000);
  var trackPxWidth = Math.max(axisSpanDays * PX_PER_DAY, 600);
  function xPx(d){ return (d - axisStart) / axisSpanMs * trackPxWidth; }

  var LABEL_WIDTH = 160;

  // ---- header: milestone-label row + quarter row + month row ----
  var header = document.createElement('div'); header.className = 'gt-header';
  var corner = document.createElement('div'); corner.className = 'gt-corner'; corner.textContent = 'NHÓM';
  var axisCol = document.createElement('div'); axisCol.className = 'gt-axis-col';
  axisCol.style.width = trackPxWidth + 'px';

  var milestoneLabelRow = document.createElement('div'); milestoneLabelRow.className = 'gt-milestone-label-row';
  var quarterRow = document.createElement('div'); quarterRow.className = 'gt-quarter-row';
  var monthRow = document.createElement('div'); monthRow.className = 'gt-month-row';

  var qCursor = new Date(axisStart.getFullYear(), Math.floor(axisStart.getMonth() / 3) * 3, 1);
  while (qCursor < axisEnd){
    var qEndReal = new Date(qCursor.getFullYear(), qCursor.getMonth() + 3, 1);
    var qStart = qCursor < axisStart ? axisStart : qCursor;
    var qEnd = qEndReal > axisEnd ? axisEnd : qEndReal;
    var qLeft = xPx(qStart), qWidth = xPx(qEnd) - qLeft;
    if (qWidth > 0){
      var weeks = Math.round((qEnd - qStart) / (7 * 24 * 60 * 60 * 1000));
      var qIdx = Math.floor(qCursor.getMonth() / 3);
      var qCell = document.createElement('div'); qCell.className = 'gt-quarter-cell';
      qCell.style.left = qLeft + 'px'; qCell.style.width = qWidth + 'px';
      qCell.innerHTML = 'Q' + (qIdx + 1) + ' \'' + String(qCursor.getFullYear()).slice(2) +
        '<span class="gt-quarter-cell-count">(' + weeks + ')</span>';
      quarterRow.appendChild(qCell);
    }
    qCursor = qEndReal;
  }

  var mCursor = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1);
  while (mCursor < axisEnd){
    var mEndReal = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1);
    var mStart = mCursor < axisStart ? axisStart : mCursor;
    var mEnd = mEndReal > axisEnd ? axisEnd : mEndReal;
    var mLeft = xPx(mStart), mWidth = xPx(mEnd) - mLeft;
    if (mWidth > 0){
      var mCell = document.createElement('div'); mCell.className = 'gt-month-cell';
      mCell.style.left = mLeft + 'px'; mCell.style.width = mWidth + 'px';
      mCell.textContent = GT_MONTH_ABBR[mCursor.getMonth()] + ' \'' + String(mCursor.getFullYear()).slice(2);
      monthRow.appendChild(mCell);
    }
    mCursor = mEndReal;
  }

  // phase go-live dates double as this view's milestones — the label sits
  // in the reserved header row, the dashed line (added to the overlay
  // below) runs the full height of the chart at the same x position.
  // Milestones close together in time would otherwise render overlapping
  // label text, so they're packed into vertical lanes first (same greedy
  // first-fit idea as the task cards below) using an estimated text width —
  // cheap and good enough here since there are only ever a handful of these,
  // and it avoids a real DOM-measurement pass mid-construction.
  function estimateMilestoneLabelWidth(title, dateStr){
    return Math.max(title.length * 6.4, dateStr.length * 5.4, 40) + 6;
  }
  var milestoneBoxes = phases.map(function(p){
    var d = new Date(p.target_date);
    if (d < axisStart || d > axisEnd) return null;
    var dateStr = fmtDMY(toIsoDate(d));
    var centerX = xPx(d);
    var halfWidth = estimateMilestoneLabelWidth(p.name, dateStr) / 2;
    return { phase: p, dateStr: dateStr, centerX: centerX, left: centerX - halfWidth, right: centerX + halfWidth + 10 };
  }).filter(Boolean).sort(function(a, b){ return a.left - b.left; });

  var milestoneLaneEnds = [];
  milestoneBoxes.forEach(function(m){
    var laneIdx = milestoneLaneEnds.findIndex(function(end){ return end <= m.left; });
    if (laneIdx === -1){ laneIdx = milestoneLaneEnds.length; milestoneLaneEnds.push(m.right); }
    else milestoneLaneEnds[laneIdx] = m.right;
    m.lane = laneIdx;
  });
  var MILESTONE_LANE_HEIGHT = 24;
  milestoneLabelRow.style.height = (Math.max(milestoneLaneEnds.length, 1) * MILESTONE_LANE_HEIGHT + 8) + 'px';

  milestoneBoxes.forEach(function(m){
    var lbl = document.createElement('div'); lbl.className = 'gt-milestone-label';
    lbl.style.left = m.centerX + 'px';
    lbl.style.bottom = (3 + m.lane * MILESTONE_LANE_HEIGHT) + 'px';
    lbl.innerHTML = escapeHtml(m.phase.name) + '<span class="gt-milestone-label-date">' + m.dateStr + '</span>';
    milestoneLabelRow.appendChild(lbl);
  });

  axisCol.appendChild(milestoneLabelRow);
  axisCol.appendChild(quarterRow);
  axisCol.appendChild(monthRow);
  header.appendChild(corner);
  header.appendChild(axisCol);
  header.style.width = (LABEL_WIDTH + trackPxWidth) + 'px';

  // ---- body: one row per group, tasks packed into as few vertical tracks
  // as their footprint (not just raw date overlap) actually requires ----
  var body = document.createElement('div'); body.className = 'gt-body';
  body.style.width = (LABEL_WIDTH + trackPxWidth) + 'px';

  // BADGE_HEIGHT is the fixed height of the "+N task khác" overflow badge
  // only — every other box (plain task card, cluster card) is sized to its
  // own real measured content (see measureTaskCardHeight/
  // measureClusterCardHeight above), since names wrap in full instead of
  // truncating with an ellipsis — a box still widens past MIN_CARD_WIDTH
  // for a genuinely long-duration task, but width no longer tracks a
  // short task's real span down to a narrow box (reverted per feedback:
  // back to the wider, more legible fixed floor).
  var BADGE_HEIGHT = 44, CARD_GAP = 8, MIN_CARD_WIDTH = 210, ROW_PAD = 8, MAX_VISIBLE_TRACKS = 4;
  var groups = gtGroupsForMode(tasks, sprints, phases, _gtGroupBy);

  groups.forEach(function(g){
    var withRange = tasks
      .filter(function(t){ return gtTaskGroupKey(t, _gtGroupBy) === g.key; })
      .map(function(t){
        var r = effectiveRange(t);
        return r ? { task: t, start: r.start, end: r.end } : null;
      })
      .filter(Boolean);
    if (withRange.length === 0) return; // nothing to show — skip the row entirely

    // Two compaction layers stack here; only the second responds to the
    // group's expand state (see isExpanded below) — the first never hides
    // any task, so there's nothing about it that expanding needs to undo.
    //
    // Layer 1 — same-start-date + same-status clustering. Many tasks here
    // share an identical (often just-a-placeholder) start date and status,
    // and would otherwise each fight for their own track at that exact x.
    // Two cases:
    // - every task in the cluster ALSO shares the same end date: their
    //   footprint is genuinely identical, so merging into one date-accurate
    //   card (real width, real position) loses no information at all.
    // - end dates differ: a box spanning to the furthest end date would
    //   visually claim they all run that whole length, which isn't true —
    //   so this becomes a fixed-width box instead, positioned at the shared
    //   start.
    // Either way the box lists every task's real name (scrollable if there
    // are more than fit) rather than hiding them behind a "+N" count —
    // clustering here is purely a layout compaction, not a content one, so
    // it always applies regardless of the group's expand state below (that
    // toggle now only concerns Layer 2's track cap).
    var clusters = {}, clusterOrder = [];
    withRange.forEach(function(item){
      var key = toIsoDate(item.start) + '|' + item.task.status;
      if (!clusters[key]){ clusters[key] = []; clusterOrder.push(key); }
      clusters[key].push(item);
    });
    var packItems = clusterOrder.map(function(key){
      var items = clusters[key];
      if (items.length === 1) return { kind: 'task', item: items[0] };
      var sameEnd = items.every(function(it){ return toIsoDate(it.end) === toIsoDate(items[0].end); });
      return { kind: 'cluster', items: items, start: items[0].start, end: sameEnd ? items[0].end : null };
    });
    var isExpanded = !!_gtExpandedGroups[g.key];

    var CLUSTER_CHIP_WIDTH = 150;
    function clusterMetaText(p){
      var statusIdx = statusDotToNum(p.items[0].task.status); // clustered by status, so all share this
      return p.items.length + ' nghiệp vụ · ' + statusLabel[statusIdx].replace(/^\d+\.\s*/, '') + ' — ' + (
        p.end
          ? (fmtDMY(toIsoDate(p.start)) + ' → ' + fmtDMY(toIsoDate(p.end)))
          : ('bắt đầu ' + fmtDMY(toIsoDate(p.start)))
      );
    }
    // pack by each card's actual pixel footprint (after the minimum-width
    // floor below), not raw date overlap — two tasks close enough in time
    // to collide once padded to a legible width still need separate tracks,
    // even if their real date ranges don't technically overlap. This greedy
    // first-fit assignment is what keeps a busy time slot "gọn": it opens a
    // new track only when every existing one is still occupied at that x.
    var boxed = packItems.map(function(p){
      var start = p.kind === 'task' ? p.item.start : p.start;
      var left = xPx(start);
      var width = p.kind === 'task' ? Math.max(xPx(p.item.end) - left, MIN_CARD_WIDTH)
        : (p.end ? Math.max(xPx(p.end) - left, MIN_CARD_WIDTH) : CLUSTER_CHIP_WIDTH);
      var height = p.kind === 'task'
        ? measureTaskCardHeight(p.item.task.name, fmtDMY(toIsoDate(p.item.start)) + ' → ' + fmtDMY(toIsoDate(p.item.end)) + ' · ' + formatDurationText(p.item.start, p.item.end), width)
        : measureClusterCardHeight(p.items, clusterMetaText(p), width);
      return { kind: p.kind, item: p.item, cluster: p, left: left, width: width, height: height, right: left + width + CARD_GAP };
    }).sort(function(a, b){ return a.left - b.left; });

    // Layer 2 — greedy first-fit track packing, capped at MAX_VISIBLE_TRACKS
    // unless expanded: even after clustering, a row can still have more
    // distinct (start,status) groups than fit — anything past the cap
    // collapses into a clickable "+N task khác" badge, same idea as a
    // calendar month view's "+N more" on an overloaded day, merged with the
    // previous badge if their spans still touch so a whole overflowing
    // cluster becomes one badge rather than one per item.
    var effectiveMaxTracks = isExpanded ? Infinity : MAX_VISIBLE_TRACKS;
    // a boxed item's underlying tasks — 1 for a plain task, N for a cluster
    // chip — used by the overflow badge below, which doesn't care which
    // kind of item it's absorbing, just how many real tasks it represents.
    function bTasks(b){ return b.kind === 'task' ? [b.item.task] : b.cluster.items.map(function(it){ return it.task; }); }
    var trackEnds = [];
    var overflowBadges = [];
    boxed.forEach(function(b){
      var trackIdx = trackEnds.findIndex(function(end){ return end <= b.left; });
      if (trackIdx === -1 && trackEnds.length < effectiveMaxTracks){ trackIdx = trackEnds.length; }
      if (trackIdx !== -1){
        trackEnds[trackIdx] = b.right;
        b.track = trackIdx;
        return;
      }
      var bts = bTasks(b);
      var lastBadge = overflowBadges[overflowBadges.length - 1];
      if (lastBadge && lastBadge.right > b.left){
        lastBadge.count += bts.length;
        lastBadge.tasks = lastBadge.tasks.concat(bts);
        lastBadge.right = Math.max(lastBadge.right, b.right);
      } else {
        overflowBadges.push({ left: b.left, right: b.right, count: bts.length, tasks: bts });
      }
    });
    var placed = boxed.filter(function(b){ return b.track !== undefined; });
    var badgeTrackIdx = trackEnds.length; // the one extra track the overflow badge (if any) sits in

    // tracks can now have different heights (a cluster box is taller than
    // a plain card), so each track's vertical offset is the running total
    // of every track above it — a tall cluster only pushes down tracks
    // that are actually below it, not the whole canvas indiscriminately.
    var trackMaxHeight = [];
    placed.forEach(function(b){
      trackMaxHeight[b.track] = Math.max(trackMaxHeight[b.track] || 0, b.height);
    });
    if (overflowBadges.length) trackMaxHeight[badgeTrackIdx] = Math.max(trackMaxHeight[badgeTrackIdx] || 0, BADGE_HEIGHT);
    var trackTop = [];
    var runningTop = ROW_PAD;
    for (var ti = 0; ti < trackMaxHeight.length; ti++){
      trackTop[ti] = runningTop;
      runningTop += (trackMaxHeight[ti] || BADGE_HEIGHT) + CARD_GAP;
    }

    var row = document.createElement('div'); row.className = 'gt-group-row';
    var label = document.createElement('div'); label.className = 'gt-group-label';
    var labelText = document.createElement('span'); labelText.className = 'gt-group-label-text'; labelText.textContent = g.label;
    label.appendChild(labelText);
    if (isExpanded){
      var collapseBtn = document.createElement('button');
      collapseBtn.type = 'button'; collapseBtn.className = 'gt-group-toggle'; collapseBtn.textContent = '▴ Thu gọn';
      collapseBtn.addEventListener('click', function(){
        delete _gtExpandedGroups[g.key];
        renderGroupedTimeline(tasks, sprints, phases);
      });
      label.appendChild(collapseBtn);
    }
    var canvas = document.createElement('div'); canvas.className = 'gt-group-canvas';
    canvas.style.height = (runningTop - CARD_GAP + ROW_PAD) + 'px';

    placed.forEach(function(b){
      if (b.kind === 'cluster'){
        var items = b.cluster.items;
        var statusIdx = statusDotToNum(items[0].task.status); // clustered by status, so all share this
        var chip = document.createElement('div');
        chip.className = 'gt-cluster-card st-' + statusIdx;
        chip.style.left = b.left + 'px';
        chip.style.width = b.width + 'px';
        chip.style.height = b.height + 'px';
        chip.style.top = trackTop[b.track] + 'px';

        var metaEl = document.createElement('div'); metaEl.className = 'gt-cluster-card-meta';
        metaEl.textContent = clusterMetaText(b.cluster);
        var listEl = document.createElement('div'); listEl.className = 'gt-cluster-card-list';
        items.forEach(function(it){
          var nameEl = document.createElement('div'); nameEl.className = 'gt-cluster-card-name';
          nameEl.textContent = it.task.name;
          nameEl.addEventListener('click', function(){ openDrawer('edit', it.task); });
          nameEl.addEventListener('mouseenter', function(){ showLogHoverPopup(nameEl, it.task.id, _gtLatestLogByTaskId); });
          nameEl.addEventListener('mouseleave', hideLogHoverPopup);
          listEl.appendChild(nameEl);
        });
        chip.appendChild(metaEl);
        chip.appendChild(listEl);
        canvas.appendChild(chip);
        return;
      }

      var t = b.item.task;
      var card = document.createElement('div');
      card.className = 'gt-task-card st-' + statusDotToNum(t.status);
      card.setAttribute('data-task-id', t.id);
      card.style.left = b.left + 'px';
      card.style.width = b.width + 'px';
      card.style.height = b.height + 'px';
      card.style.top = trackTop[b.track] + 'px';

      var titleEl = document.createElement('div'); titleEl.className = 'gt-task-card-title';
      titleEl.textContent = t.name;
      var datesEl = document.createElement('div'); datesEl.className = 'gt-task-card-dates';
      datesEl.textContent = fmtDMY(toIsoDate(b.item.start)) + ' → ' + fmtDMY(toIsoDate(b.item.end)) +
        ' · ' + formatDurationText(b.item.start, b.item.end);
      card.appendChild(titleEl);
      card.appendChild(datesEl);
      card.addEventListener('click', function(){ openDrawer('edit', t); });
      card.addEventListener('mouseenter', function(){ showLogHoverPopup(card, t.id, _gtLatestLogByTaskId); });
      card.addEventListener('mouseleave', hideLogHoverPopup);
      canvas.appendChild(card);
    });

    overflowBadges.forEach(function(badge){
      var chip = document.createElement('div'); chip.className = 'gt-overflow-badge';
      chip.style.left = badge.left + 'px';
      chip.style.width = Math.max(badge.right - badge.left - CARD_GAP, MIN_CARD_WIDTH) + 'px';
      chip.style.height = BADGE_HEIGHT + 'px';
      chip.style.top = trackTop[badgeTrackIdx] + 'px';
      chip.textContent = '+' + badge.count + ' task khác — bấm để xem tất cả';
      chip.title = badge.tasks.map(function(t){ return t.name; }).join('\n');
      chip.addEventListener('click', function(){
        _gtExpandedGroups[g.key] = true;
        renderGroupedTimeline(tasks, sprints, phases);
      });
      canvas.appendChild(chip);
    });

    row.appendChild(label);
    row.appendChild(canvas);
    body.appendChild(row);
  });

  // milestone dashed lines + today line — mounted on .gt-chart itself (not
  // .gt-body), so they stay visually pinned while .gt-body's own vertical
  // scroll moves the group rows underneath them.
  var overlay = document.createElement('div'); overlay.className = 'gt-milestone-overlay';
  phases.forEach(function(p){
    var d = new Date(p.target_date);
    if (d < axisStart || d > axisEnd) return;
    var line = document.createElement('div'); line.className = 'gt-milestone-line';
    line.style.left = xPx(d) + 'px';
    overlay.appendChild(line);
  });
  var todayD = new Date();
  if (todayD >= axisStart && todayD <= axisEnd){
    var todayLine = document.createElement('div'); todayLine.className = 'gt-today-line';
    todayLine.style.left = xPx(todayD) + 'px';
    overlay.appendChild(todayLine);
  }

  chart.appendChild(header);
  chart.appendChild(body);
  chart.appendChild(overlay);

  chart.scrollLeft = prevScrollLeft;
  body.scrollTop = prevScrollTop;

  // .gt-group-label can't use plain CSS sticky (same reason .task-label
  // above can't: .gt-body's own vertical scroll breaks it at that nesting
  // depth) — shift it by the live horizontal scrollLeft instead.
  chart.addEventListener('scroll', function(){
    var shift = chart.scrollLeft + 'px';
    chart.querySelectorAll('.gt-group-label').forEach(function(el){
      el.style.transform = 'translateX(' + shift + ')';
    });
  });
  // apply the group label's scroll-sync transform immediately (not just on
  // the next scroll event) so it's correctly offset right after a
  // scrollLeft restore above — otherwise it'd sit at left:0 until the user
  // scrolls again.
  var initShift = chart.scrollLeft + 'px';
  chart.querySelectorAll('.gt-group-label').forEach(function(el){
    el.style.transform = 'translateX(' + initShift + ')';
  });

  playFlip();
}

document.querySelectorAll('#gtGroupByChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#gtGroupByChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _gtGroupBy = btn.dataset.groupby;
    _gtExpandedGroups = {};
    loadGroupedTimelineView();
  });
});

// Timeline filters: multi-select dropdowns (Phase/Category/Platform/Status).
// Empty selection = no filter (show everything), same convention as every
// other filter in this app. Arrays are read by reference from
// renderMultiSelectDropdown, so an in-progress selection survives a rebuild.
var _timelineFilterPhase = [];
var _timelineFilterCategory = [];
var _timelineFilterPlatform = [];
var _timelineFilterStatus = [];

function timelineFilterOnChange(){
  if (_lastTimelineTasks && _lastTimelineSprints && _lastTimelinePhases){
    renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
  }
}

// rebuilt each time Timeline data loads, so option lists (phases especially)
// stay in sync with real data.
function renderTimelineFilterDropdowns(tasks, phases){
  renderMultiSelectDropdown(
    document.getElementById('filter-phase-ms'), 'Phase',
    phases.map(function(p){ return { key: String(p.id), label: p.code + ': ' + p.name }; }),
    _timelineFilterPhase, timelineFilterOnChange
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-category-ms'), 'Category',
    bucketsForGroupBy(tasks, 'category'),
    _timelineFilterCategory, timelineFilterOnChange, true
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-platform-ms'), 'Platform',
    bucketsForGroupBy(tasks, 'platform'),
    _timelineFilterPlatform, timelineFilterOnChange
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-status-ms'), 'Status',
    STATUS_ORDER.map(function(s, idx){ return { key: s, label: statusLabel[idx].replace(/^\d+\.\s*/, '') }; }),
    _timelineFilterStatus, timelineFilterOnChange
  );
}

// last tasks/sprints/phases fetched for the Timeline, so changing a filter or
// group-by chip can re-render instantly without refetching from the API
var _lastTimelineTasks = null;
var _lastTimelineSprints = null;
var _lastTimelinePhases = null;

function applyTimelineFilters(tasks){
  return tasks.filter(function(t){
    if (_timelineFilterPhase.length && _timelineFilterPhase.indexOf(String(t.phase_id)) === -1) return false;
    if (_timelineFilterCategory.length && _timelineFilterCategory.indexOf(t.category) === -1) return false;
    if (_timelineFilterPlatform.length && _timelineFilterPlatform.indexOf(t.platform) === -1) return false;
    if (_timelineFilterStatus.length && _timelineFilterStatus.indexOf(t.status) === -1) return false;
    return true;
  });
}

function loadTimelineView(){
  var body = document.getElementById('ganttBody');
  return Promise.all([loadTasks(), loadSprints(), loadPhasesList()])
    .then(function(results){
      _lastTimelineTasks = results[0];
      _lastTimelineSprints = results[1];
      _lastTimelinePhases = results[2];
      renderTimelineFilterDropdowns(_lastTimelineTasks, _lastTimelinePhases);
      renderGantt(applyTimelineFilters(_lastTimelineTasks), _lastTimelineSprints, _lastTimelinePhases);
    })
    .catch(function(err){
      console.error('Failed to load Timeline data', err);
      body.innerHTML = '<div class="view-sub">Không tải được dữ liệu Timeline. Thử tải lại trang.</div>';
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

// ---- Resource view: which teams/roles each task needs (managed via
// /api/resource-roles, fetched by loadResourceRoles() near the drawer's
// "Resource cần" picker above). Three parts:
// - team management (add/rename/delete), right in the matrix header — see
//   renderResourceRoleHeaderCell and the "+ Thêm team" toolbar below;
// - a rollup grid (role x sprint/phase counts), always computed over the
//   full project so "how many tasks need BE Dev in S16" is a real answer
//   regardless of what the matrix below is currently filtered to;
// - a tick matrix (task x role checkboxes), filtered by Sprint/Phase so it
//   stays usable — an unfiltered 130+ task x 6+ role grid was the "matrix
//   thô" problem raised when this feature was scoped (defaults to the
//   current sprint so it's immediately useful on first load).
var _resourceSprintFilter = [];
var _resourcePhaseFilter = [];
var _resourceRollupTab = 'sprint';
var _resourceTasksCache = [];
var _resourceSprintsCache = [];
var _resourcePhasesCache = [];
var _resourceRolesCache = []; // [{id, name, task_count}], from /api/resource-roles
var _resourceFiltersInitialized = false;

document.querySelectorAll('#resourceRollupTabChips .chip').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#resourceRollupTabChips .chip').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    _resourceRollupTab = btn.dataset.rolluptab;
    renderResourceRollup();
  });
});

function loadResourceView(){
  return Promise.all([loadTasks(), loadSprints(), loadPhasesList(), fetchJSON('/api/sprints/current-next'), loadResourceRoles()])
    .then(function(results){
      var tasks = results[0], sprints = results[1], phases = results[2], currentNext = results[3], roles = results[4];
      _resourceTasksCache = tasks;
      _resourceSprintsCache = sprints;
      _resourcePhasesCache = phases;
      _resourceRolesCache = roles;
      if (!_resourceFiltersInitialized){
        _resourceFiltersInitialized = true;
        // same current/next gap-day fallback as Sprint Overview and Sprint
        // Report: when today falls between two sprint cycles, current-next
        // returns no current sprint at all — default to next rather than
        // showing every task in the project unfiltered.
        var defaultSprint = currentNext.current || currentNext.next;
        if (defaultSprint) _resourceSprintFilter.push(defaultSprint.id);
      }
      renderResourceFilters();
      renderResourceRollup();
      renderResourceMatrix();
    })
    .catch(function(err){ console.error('Failed to load Resource view', err); });
}

// after any team add/rename/delete: the tasks cache may now embed a stale
// role name (rename) or a role that no longer exists (delete), and the
// roles list itself changed — reload both rather than trying to patch
// every task's resource_roles array in place.
function reloadResourceRolesAndViews(){
  _resourceRolesPromise = null;
  _tasksPromise = null;
  return loadResourceView();
}

function renderResourceFilters(){
  var sprintOptions = _resourceSprintsCache.map(function(s){ return { key: s.id, label: s.code }; });
  var phaseOptions = _resourcePhasesCache.map(function(p){ return { key: p.id, label: p.code }; });
  renderMultiSelectDropdown(
    document.getElementById('filter-resource-sprint-ms'), 'Sprint', sprintOptions, _resourceSprintFilter,
    function(){ renderResourceMatrix(); }, false
  );
  renderMultiSelectDropdown(
    document.getElementById('filter-resource-phase-ms'), 'Phase', phaseOptions, _resourcePhaseFilter,
    function(){ renderResourceMatrix(); }, false
  );
}

function renderResourceRollup(){
  var wrap = document.getElementById('resourceRollupWrap');
  wrap.innerHTML = '';
  var roles = _resourceRolesCache.map(function(r){ return r.name; });

  var buckets, labelFor, keyFor;
  if (_resourceRollupTab === 'phase'){
    buckets = _resourcePhasesCache.slice();
    labelFor = function(p){ return p.code; };
    keyFor = function(t){ return t.phase_id; };
  } else {
    buckets = _resourceSprintsCache.slice();
    labelFor = function(s){ return s.code; };
    keyFor = function(t){ return t.sprint_id; };
  }
  buckets = buckets.concat([{ id: null }]); // tasks with no sprint/phase assigned

  var scroll = document.createElement('div'); scroll.className = 'resource-rollup-scroll';
  var table = document.createElement('div'); table.className = 'resource-rollup-table';
  table.style.gridTemplateColumns = '90px repeat(' + roles.length + ', minmax(64px,1fr))';

  var head = document.createElement('div'); head.className = 'resource-rollup-row resource-rollup-head'; head.style.display = 'contents';
  var headLabel = document.createElement('div'); headLabel.className = 'resource-rollup-cell resource-rollup-label';
  headLabel.textContent = _resourceRollupTab === 'phase' ? 'Phase' : 'Sprint';
  head.appendChild(headLabel);
  roles.forEach(function(r){
    var c = document.createElement('div'); c.className = 'resource-rollup-cell'; c.textContent = r;
    head.appendChild(c);
  });
  table.appendChild(head);

  buckets.forEach(function(b){
    var row = document.createElement('div'); row.className = 'resource-rollup-row'; row.style.display = 'contents';
    var labelCell = document.createElement('div'); labelCell.className = 'resource-rollup-cell resource-rollup-label';
    labelCell.textContent = b.id === null ? '— không có —' : labelFor(b);
    row.appendChild(labelCell);
    var tasksInBucket = _resourceTasksCache.filter(function(t){ return keyFor(t) === b.id; });
    roles.forEach(function(r){
      var count = tasksInBucket.filter(function(t){ return (t.resource_roles || []).indexOf(r) !== -1; }).length;
      var cell = document.createElement('div');
      cell.className = 'resource-rollup-cell' + (count === 0 ? ' resource-rollup-count-zero' : (count >= 3 ? ' resource-rollup-count-hot' : ''));
      cell.textContent = String(count);
      row.appendChild(cell);
    });
    table.appendChild(row);
  });

  scroll.appendChild(table);
  wrap.appendChild(scroll);
}

// renames/deletes a team from the Resource matrix header — see the "Sửa"/
// "Xóa" icons per role column in renderResourceMatrix. Both reload the
// whole Resource view on success (reloadResourceRolesAndViews) since a
// rename changes the role name embedded in every affected task.
function renameResourceRole(id, newName){
  return authFetch('/api/resource-roles/' + id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName })
  }).then(function(res){
    if (!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
  });
}
function deleteResourceRole(id){
  return authFetch('/api/resource-roles/' + id, { method: 'DELETE' }).then(function(res){
    if (!res.ok && res.status !== 204){
      return res.json().catch(function(){ return {}; }).then(function(errBody){
        throw new Error(errBody.error || ('HTTP ' + res.status));
      });
    }
  });
}

// one header cell per team column: name + inline-rename ("Sửa") + delete
// ("Xóa", confirm() then blocked server-side with a toast if any task
// still uses it) — the whole reason "quản lý team" lives in the matrix
// header rather than a separate settings screen.
function renderResourceRoleHeaderCell(roleRow, canEdit, canDelete){
  var cell = document.createElement('div'); cell.className = 'resource-matrix-cell resource-matrix-role-head';

  function renderDisplayMode(){
    cell.innerHTML = '';
    var nameEl = document.createElement('span'); nameEl.className = 'resource-matrix-role-name'; nameEl.textContent = roleRow.name;
    cell.appendChild(nameEl);
    if (canEdit || canDelete){
      var actions = document.createElement('span'); actions.className = 'resource-matrix-role-actions';
      if (canEdit){
        var editBtn = document.createElement('button');
        editBtn.type = 'button'; editBtn.className = 'resource-matrix-role-action-btn'; editBtn.title = 'Sửa tên team';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', renderEditMode);
        actions.appendChild(editBtn);
      }
      if (canDelete){
        var delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'resource-matrix-role-action-btn'; delBtn.title = 'Xóa team';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function(){
          if (!confirm('Xóa team "' + roleRow.name + '"?' + (roleRow.task_count ? ' Còn ' + roleRow.task_count + ' task đang gắn team này.' : ''))) return;
          deleteResourceRole(roleRow.id).then(reloadResourceRolesAndViews).catch(function(err){
            toastError(err.message || 'Không xóa được team.');
          });
        });
        actions.appendChild(delBtn);
      }
      cell.appendChild(actions);
    }
  }

  function renderEditMode(){
    cell.innerHTML = '';
    var input = document.createElement('input'); input.type = 'text'; input.value = roleRow.name;
    input.className = 'resource-matrix-role-edit-input';
    cell.appendChild(input);
    input.focus(); input.select();
    function commit(){
      var val = input.value.trim();
      if (!val || val === roleRow.name){ renderDisplayMode(); return; }
      input.disabled = true;
      renameResourceRole(roleRow.id, val).then(reloadResourceRolesAndViews).catch(function(err){
        toastError(err.message || 'Không đổi tên được.');
        renderDisplayMode();
      });
    }
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') renderDisplayMode();
    });
    input.addEventListener('blur', commit);
  }

  renderDisplayMode();
  return cell;
}

function renderResourceMatrix(){
  var wrap = document.getElementById('resourceMatrixWrap');
  wrap.innerHTML = '';
  var roles = _resourceRolesCache.map(function(r){ return r.name; });
  var canEdit = hasRole('editor');
  var canDelete = hasRole('admin');

  // team management toolbar: add a new team right here, where the ticking
  // happens, rather than a separate settings screen.
  var toolbar = document.createElement('div'); toolbar.className = 'resource-team-toolbar';
  if (canEdit){
    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'multiselect-action-btn'; addBtn.textContent = '+ Thêm team';
    var addInput = document.createElement('input');
    addInput.type = 'text'; addInput.placeholder = 'Nhập tên team mới, Enter để xác nhận'; addInput.style.display = 'none';
    addBtn.addEventListener('click', function(){ addBtn.style.display = 'none'; addInput.style.display = ''; addInput.focus(); });
    addInput.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      var val = addInput.value.trim();
      if (!val) return;
      addInput.disabled = true;
      addResourceRole(val).then(reloadResourceRolesAndViews).catch(function(err){
        addInput.disabled = false;
        toastError(err.message || 'Không thêm được team.');
      });
    });
    toolbar.appendChild(addBtn);
    toolbar.appendChild(addInput);
  }
  wrap.appendChild(toolbar);

  var filtered = _resourceTasksCache.filter(function(t){
    if (_resourceSprintFilter.length && _resourceSprintFilter.indexOf(t.sprint_id) === -1) return false;
    if (_resourcePhaseFilter.length && _resourcePhaseFilter.indexOf(t.phase_id) === -1) return false;
    return true;
  }).sort(function(a, b){ return (a.stt || 0) - (b.stt || 0); });

  if (filtered.length === 0){
    wrap.innerHTML += '<div class="resource-matrix-empty">Không có task nào khớp bộ lọc.</div>';
    return;
  }

  var scroll = document.createElement('div'); scroll.className = 'resource-matrix-scroll';
  var matrix = document.createElement('div'); matrix.className = 'resource-matrix';
  matrix.style.gridTemplateColumns = '260px repeat(' + roles.length + ', 88px)';

  var head = document.createElement('div'); head.className = 'resource-matrix-head'; head.style.display = 'contents';
  var headTask = document.createElement('div'); headTask.className = 'resource-matrix-cell resource-matrix-task'; headTask.textContent = 'Task';
  head.appendChild(headTask);
  _resourceRolesCache.forEach(function(roleRow){
    head.appendChild(renderResourceRoleHeaderCell(roleRow, canEdit, canDelete));
  });
  matrix.appendChild(head);

  filtered.forEach(function(task){
    var row = document.createElement('div'); row.style.display = 'contents';
    var taskCell = document.createElement('div'); taskCell.className = 'resource-matrix-cell resource-matrix-task';
    var nameEl = document.createElement('div'); nameEl.className = 'resource-matrix-task-name';
    nameEl.title = task.name; nameEl.textContent = task.name;
    var tagsEl = document.createElement('div'); tagsEl.className = 'resource-matrix-task-tags';
    tagsEl.innerHTML = '<span class="tag">' + escapeHtml(task.category) + '</span><span class="tag">' + escapeHtml(task.platform) + '</span>';
    taskCell.appendChild(nameEl); taskCell.appendChild(tagsEl);
    taskCell.addEventListener('click', function(e){ if (e.target.tagName !== 'INPUT') openDrawer('edit', task); });
    taskCell.style.cursor = 'pointer';
    row.appendChild(taskCell);

    roles.forEach(function(role){
      var cell = document.createElement('div'); cell.className = 'resource-matrix-cell';
      var cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = (task.resource_roles || []).indexOf(role) !== -1;
      cb.disabled = !canEdit;
      cb.addEventListener('change', function(){
        var prev = (task.resource_roles || []).slice();
        var next = prev.slice();
        var idx = next.indexOf(role);
        if (cb.checked && idx === -1) next.push(role);
        else if (!cb.checked && idx !== -1) next.splice(idx, 1);
        task.resource_roles = next;
        cb.disabled = true;
        authFetch('/api/tasks/' + task.id + '/resources', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: next })
        }).then(function(res){
          if (!res.ok){
            return res.json().catch(function(){ return {}; }).then(function(errBody){
              throw new Error(errBody.error || ('HTTP ' + res.status));
            });
          }
          renderResourceRollup();
        }).catch(function(err){
          task.resource_roles = prev;
          cb.checked = !cb.checked;
          toastError('Không lưu được: ' + err.message);
        }).then(function(){
          cb.disabled = !canEdit;
        });
      });
      cell.appendChild(cb);
      row.appendChild(cell);
    });
    matrix.appendChild(row);
  });

  scroll.appendChild(matrix);
  wrap.appendChild(scroll);
}

// keep the Tasks column visible while scrolling the Timeline horizontally.
// .gantt-corner (in the header) has no scrolling ancestor between it and
// .gantt, so its own position:sticky already works. .task-label rows sit
// inside .gantt-body, which independently scrolls vertically
// (overflow-y:auto) — that alone makes .gantt-body the nearest CSS
// "scrolling ancestor" for sticky purposes regardless of its overflow-x, so
// a pure-CSS sticky left:0 on .task-label never actually tracks .gantt's
// horizontal scroll (verified empirically). Shifting it by the live
// scrollLeft via transform gets the same frozen-column look without
// touching the working vertical-scroll setup.
document.querySelector('.gantt').addEventListener('scroll', function(){
  var shift = this.scrollLeft + 'px';
  document.querySelectorAll('.task-label').forEach(function(el){
    el.style.transform = 'translateX(' + shift + ')';
  });
});

loadTimelineView();
loadGroupedTimelineView();
loadLogView();
loadResourceView();
loadTableView();

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
  if (!name) { sel.value = 'TTT New - Product Foundation'; return; }
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
// loader that could be affected by it (phase rollups, sprint panel, timeline, table)
function refreshAllViews(){
  _tasksPromise = null;
  loadPhases();
  loadSprintView();
  loadTimelineView();
  loadGroupedTimelineView();
  loadLogView();
  loadAiAssessmentHistory();
  loadResourceView();
  loadTableView();
}

// guards saveBtn/deleteBtn against double-submit (double-click, or clicking
// the other button while one request is still in flight) — both act on the
// same task, so they share one busy flag rather than tracking independently
var _drawerActionBusy = false;

// closing the drawer mid-save doesn't cancel the underlying request (see
// the closeDrawer/overlay guards above) — but closing the TAB or reloading
// the page does. A save that takes a few seconds (a cold-started DB, a
// slow connection) is exactly when a user is most likely to give up and
// navigate away, right when doing so would actually lose the edit — so
// warn before that specific action, not just the in-app ones.
window.addEventListener('beforeunload', function(e){
  if (!_drawerActionBusy) return;
  e.preventDefault();
  e.returnValue = '';
});

document.getElementById('saveBtn').addEventListener('click', function(){
  if (_drawerActionBusy) return;
  var name = document.getElementById('f-name').value.trim();
  var category = document.getElementById('f-cat').value;
  if (category === '__add_new__'){
    category = document.getElementById('f-cat-new').value.trim();
  }
  var platform = getSelectedPlatform();
  var status = document.getElementById('f-status').value;
  var phaseVal = document.getElementById('f-phase').value;
  var sprintVal = document.getElementById('f-sprint').value;
  var startVal = document.getElementById('f-start').value || null;
  var dueVal = document.getElementById('f-due').value || null;
  var progressNoteValue = document.getElementById('f-newlog').value.trim();

  if (!name || !category || !platform || !status || !startVal || !dueVal){
    toastError('Vui lòng nhập đầy đủ Tên nghiệp vụ, Category, Platform, Status, Start và Due.');
    return;
  }

  // duplicate-name guard (case/whitespace insensitive) — excludes this
  // task itself on edit, so saving without renaming isn't flagged against
  // its own old name. Catches an un-renamed clone (see cloneBtn) as much
  // as any accidental name collision on a plain create/edit.
  var dupTask = _drawerAllTasks.find(function(x){
    return x.id !== editingTaskId && (x.name || '').trim().toLowerCase() === name.toLowerCase();
  });
  if (dupTask){
    toastError('Đã có nghiệp vụ trùng tên: "' + dupTask.name + '" (#' + dupTask.id + '). Vui lòng đổi tên khác trước khi lưu.');
    document.getElementById('f-name').focus();
    return;
  }

  // rescheduling a task whose due date is already due today or overdue is
  // a deliberate call — require a note explaining why, same reasoning as
  // the mandatory popup for a date change made outside the drawer (drag on
  // Timeline/Sprint Overview). Tasks still comfortably in the future don't
  // need this: replanning something not yet due is routine.
  var dueDateChangedInDrawer = editingTaskId && editingTaskOriginalDueDate && dueVal !== editingTaskOriginalDueDate;
  if (dueDateChangedInDrawer && dueDateIsDueOrOverdue(editingTaskOriginalDueDate) && !progressNoteValue){
    toastError('Ngày Due đã đổi (nghiệp vụ đã tới hạn hoặc quá hạn) — vui lòng nêu lý do dời ngày trong "Cập nhật tình trạng task" trước khi lưu.');
    document.getElementById('f-newlog').focus();
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
    why: document.getElementById('f-why').value.trim() || null,
    resource_roles: _drawerResourceRoles.slice(),
    platform: platform,
    status: status,
    phase_id: phaseVal ? Number(phaseVal) : null,
    sprint_id: sprintVal ? Number(sprintVal) : null,
    stt: editingTaskStt,
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

  _drawerActionBusy = true;
  var saveBtnEl = document.getElementById('saveBtn');
  var deleteBtnEl = document.getElementById('deleteBtn');
  saveBtnEl.disabled = true;
  deleteBtnEl.disabled = true;
  saveBtnEl.textContent = isCreate ? 'Đang lưu...' : 'Đang lưu thay đổi...';
  document.getElementById('drawerLoadingText').textContent = isCreate ? 'Đang lưu...' : 'Đang lưu thay đổi...';
  document.getElementById('drawerLoading').style.display = 'flex';

  // tracks a note/log POST that failed AFTER the task itself already saved
  // successfully — that's a real partial failure (the task's fields are
  // safe in the DB, but the note the user just wrote is not), and it must
  // never be papered over by the blanket "Đã lưu thay đổi" success toast
  // below. console.error alone was the bug here: it recorded the failure
  // where only a developer would ever see it, while the user got told
  // everything worked.
  var noteSaveError = null;

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
    // "Cập nhật tình trạng task" always saves as a real log entry alongside
    // the task itself when there's anything in it — on both create (the
    // old separate "Ghi chú" field was removed; this is now the one place
    // for an initial note too) and edit, and not just when it was the
    // mandatory date-change explanation (validated above). Single save
    // action — no separate "Thêm" button.
    if (progressNoteValue && savedTask && savedTask.id){
      return authFetch('/api/tasks/' + savedTask.id + '/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: progressNoteValue })
      }).then(function(logRes){
        if (!logRes.ok) noteSaveError = 'HTTP ' + logRes.status;
        else document.getElementById('f-newlog').value = '';
      }).catch(function(err){
        noteSaveError = err.message;
      });
    }
  }).then(function(){
    close();
    refreshAllViews();
    var taskSavedMsg = isCreate ? 'Đã tạo nghiệp vụ "' + name + '"' : 'Đã lưu thay đổi cho "' + name + '"';
    if (noteSaveError){
      console.error('Note/log save failed after task save succeeded', noteSaveError);
      toastError(taskSavedMsg + ', nhưng KHÔNG lưu được ghi chú (' + noteSaveError + ') — vui lòng nhập lại ghi chú.');
    } else {
      toastSuccess(taskSavedMsg);
    }
  }).catch(function(err){
    console.error('Save task failed', err);
    toastError('Không lưu được nghiệp vụ: ' + err.message);
  }).finally(function(){
    _drawerActionBusy = false;
    saveBtnEl.disabled = false;
    deleteBtnEl.disabled = false;
    saveBtnEl.textContent = isCreate ? 'Lưu nghiệp vụ' : 'Lưu thay đổi';
    document.getElementById('drawerLoading').style.display = 'none';
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
    });
});

// "Thêm" (add a progress note independent of Save) used to be a separate
// button/action here — removed because it created a real deadlock: typing
// a note, clicking Thêm, then Lưu thay đổi would find the field it had
// just cleared and re-demand the very reason the user already gave. Save
// now posts whatever's in "Cập nhật tình trạng task" itself (see saveBtn's
// handler below), so there's only ever one action to take.
