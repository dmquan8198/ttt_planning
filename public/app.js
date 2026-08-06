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

// ---- timeline / gantt ----
var sprints = [
  {code:'S14', label:'S14 · 20/07–31/07', start:new Date('2026-07-20'), end:new Date('2026-07-31')},
  {code:'S15', label:'S15 · 03/08–14/08', start:new Date('2026-08-03'), end:new Date('2026-08-14')},
  {code:'S16', label:'S16 · 17/08–28/08', start:new Date('2026-08-17'), end:new Date('2026-08-28')},
  {code:'S17', label:'S17 · 31/08–11/09', start:new Date('2026-08-31'), end:new Date('2026-09-11')}
];
var axisStart = sprints[0].start, axisEnd = sprints[sprints.length-1].end;
var axisSpan = axisEnd - axisStart;

var tasks = [
  {cat:'Product Foundation', name:'Thông kết nối API — MoMo call VCB', platform:'BE', phase:'P1', sprint:'S15', st:3},
  {cat:'Product Foundation', name:'Thông kết nối API — VCB call MoMo', platform:'BE', phase:'P1', sprint:'S15', st:3},
  {cat:'Product Foundation', name:'Mở kết nối leasedline', platform:'BE', phase:'P1', sprint:'S15', st:4},
  {cat:'Product Foundation', name:'CD nhận lãi hoặc đáo hạn', platform:'BE', phase:'P1', sprint:'S15', st:2},
  {cat:'Product Foundation', name:'Sửa thông tin TCPH', platform:'Web', phase:'P2', sprint:'S15', st:2},
  {cat:'Product Foundation', name:'Tích hợp SMS – OTP', platform:'BE', phase:'P2', sprint:'S15', st:1},
  {cat:'Product Foundation', name:'Tích hợp HSM', platform:'BE', phase:'P2', sprint:'S15', st:1},
  {cat:'Product Foundation', name:'Xóa hợp đồng ủy thác đầu tư', platform:'Web', phase:'P2', sprint:'S16', st:1},
  {cat:'Product Foundation', name:'Lịch sử nạp / rút kho', platform:'Web', phase:'P2', sprint:'S16', st:2},
  {cat:'Product Foundation', name:'Lịch sử mua bán tài sản giữa Kho và TCPH', platform:'Web', phase:'P2', sprint:'S16', st:2},
  {cat:'Product Foundation', name:'Quản lý thanh khoản của TVAM', platform:'Web', phase:'P2', sprint:'S16', st:1},
  {cat:'Product Foundation', name:'Build tool đối soát tự động MoMo x TVAM/ Finsight', platform:'BE', phase:'P2', sprint:'S16', st:0},
  {cat:'Product Foundation', name:'Sửa thông tin tài sản', platform:'Web', phase:'P2', sprint:'S17', st:0},
  {cat:'Cross Service Integration', name:'Hiển thị số dư ở Home MoMo, Finhub', platform:'App', phase:'P2', sprint:'S15', st:2},
  {cat:'Cross Service Integration', name:'Thanh toán bằng Túi', platform:'App', phase:'P2', sprint:'S16', st:2},
  {cat:'Cross Service Integration', name:'Chuyển tiền bằng Túi', platform:'App', phase:'P2', sprint:'S16', st:2},
  {cat:'Cross Service Integration', name:'Luồng QR thanh toán', platform:'BE', phase:'P2', sprint:'S16', st:0},
  {cat:'Cross Service Integration', name:'Auto receive', platform:'App', phase:'P2', sprint:'S17', st:0},
  {cat:'Cross Service Integration', name:'Nạp tiền ở CICO', platform:'App', phase:'P2', sprint:'S17', st:0},
  {cat:'Internal features', name:'Bảo trì Túi New', platform:'App', phase:'P2', sprint:'S16', st:0},
  {cat:'Internal features', name:'Chuyển khoản Virtual Account Sacombank', platform:'App', phase:'P2', sprint:'S17', st:0},
  {cat:'Convert & Scale', name:'Trial game "Tiền lời nhân đôi" (Phase 1)', platform:'App', phase:'P2', sprint:'S16', st:0}
];

function sprintOf(code){ return sprints.find(function(s){ return s.code===code; }); }
function pctPos(d){ return (d - axisStart) / axisSpan * 100; }

// header bands
var bandsEl = document.getElementById('sprintBands');
sprints.forEach(function(s){
  var w = (s.end - s.start) / axisSpan * 100;
  var band = document.createElement('div');
  band.className = 'sprint-band';
  band.style.width = w + '%';
  band.innerHTML = '<span class="lbl">' + s.code + '</span>' + s.label.split('· ')[1];
  bandsEl.appendChild(band);
});

// body grouped by category — first column shows the task name ("TASKS")
var body = document.getElementById('ganttBody');
var cats = [];
tasks.forEach(function(t){ if(cats.indexOf(t.cat) === -1) cats.push(t.cat); });
cats.forEach(function(cat){
  var group = document.createElement('div'); group.className = 'cat-group';
  var divider = document.createElement('div'); divider.className = 'cat-divider';
  divider.textContent = cat;
  group.appendChild(divider);
  tasks.filter(function(t){ return t.cat === cat; }).forEach(function(t){
    var row = document.createElement('div'); row.className = 'task-row';
    var label = document.createElement('div'); label.className = 'task-label';
    label.textContent = t.name;
    var track = document.createElement('div'); track.className = 'task-track';
    var sp = sprintOf(t.sprint);
    var left = pctPos(sp.start), width = pctPos(sp.end) - left;
    var bar = document.createElement('div');
    bar.className = 'bar st-' + t.st;
    bar.style.left = left + '%'; bar.style.width = width + '%';
    bar.textContent = t.sprint;
    bar.addEventListener('click', function(){ openDrawer('edit', t); });
    track.appendChild(bar);
    row.appendChild(label); row.appendChild(track);
    group.appendChild(row);
  });
  body.appendChild(group);
});
// today line across full gantt (overlay sits over the track region only, skipping the 186px label column)
var todayLeft = pctPos(new Date('2026-08-06'));
var overlay2 = document.createElement('div');
overlay2.className = 'gantt-track-overlay';
var line = document.createElement('div');
line.className = 'gantt-today-line';
line.style.left = todayLeft + '%';
overlay2.appendChild(line);
document.querySelector('.gantt').style.position = 'relative';
document.querySelector('.gantt').appendChild(overlay2);

// ---- board ----
var statusDefs = [
  {key:0, label:'Backlog', count:46},
  {key:1, label:'Ready for Dev', count:8},
  {key:2, label:'In Test', count:13},
  {key:3, label:'Ready for Staging', count:40},
  {key:4, label:'Done', count:1}
];
var cardData = {
  0: [
    {n:'Trial game "Tiền lời nhân đôi" (Phase 1)', c:'Convert & Scale', p:'App'},
    {n:'Bảo trì Túi New', c:'Internal features', p:'App'},
    {n:'Luồng QR thanh toán', c:'Cross Service Integration', p:'BE'},
    {n:'Build tool đối soát tự động MoMo x TVAM', c:'Product Foundation', p:'BE'},
    {n:'Sửa thông tin tài sản', c:'Product Foundation', p:'Web'},
    {n:'Merchant nhận doanh thu về Túi New', c:'Cross Service Integration', p:'App'}
  ],
  1: [
    {n:'Tích hợp SMS – OTP', c:'Product Foundation', p:'BE'},
    {n:'Tích hợp HSM', c:'Product Foundation', p:'BE'},
    {n:'Xóa hợp đồng ủy thác đầu tư', c:'Product Foundation', p:'Web'},
    {n:'Quản lý thanh khoản của TVAM', c:'Product Foundation', p:'Web'}
  ],
  2: [
    {n:'CD nhận lãi hoặc đáo hạn', c:'Product Foundation', p:'BE'},
    {n:'Sửa thông tin TCPH', c:'Product Foundation', p:'Web'},
    {n:'Hiển thị số dư ở Home MoMo, Finhub', c:'Cross Service Integration', p:'App'},
    {n:'Thanh toán bằng Túi', c:'Cross Service Integration', p:'App'},
    {n:'Lịch sử nạp / rút kho', c:'Product Foundation', p:'Web'}
  ],
  3: [
    {n:'Thông kết nối API — MoMo call VCB', c:'Product Foundation', p:'BE'},
    {n:'Khai báo TCPH', c:'Product Foundation', p:'Web'},
    {n:'Khai báo tài sản với NHLK', c:'Product Foundation', p:'Web'},
    {n:'Cập nhật lãi suất thả nổi', c:'Product Foundation', p:'Web'},
    {n:'Phân bổ và đối chiếu thực hiện quyền', c:'Product Foundation', p:'BE'}
  ],
  4: [
    {n:'Mở kết nối leasedline', c:'Product Foundation', p:'BE'}
  ]
};
var boardEl = document.getElementById('board');
statusDefs.forEach(function(s){
  var col = document.createElement('div'); col.className = 'col';
  var head = document.createElement('div'); head.className = 'col-head';
  head.innerHTML = '<span class="pill st-' + s.key + '">' + s.label + '</span><span class="col-count">' + s.count + '</span>';
  col.appendChild(head);
  var shown = cardData[s.key] || [];
  shown.forEach(function(t){
    var card = document.createElement('div'); card.className = 'card';
    card.innerHTML = t.n + '<div class="card-tags"><span class="tag">' + t.c + '</span><span class="tag">' + t.p + '</span></div>';
    card.addEventListener('click', function(){
      openDrawer('edit', {name:t.n, cat:t.c, platform:t.p, st:s.key});
    });
    col.appendChild(card);
  });
  if(s.count > shown.length){
    var more = document.createElement('div'); more.className = 'col-more';
    more.textContent = '+ ' + (s.count - shown.length) + ' khác';
    col.appendChild(more);
  }
  boardEl.appendChild(col);
});
