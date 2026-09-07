(function(){
  "use strict";

  var DATA = JSON.parse(document.getElementById('schedule-data').textContent);
  var SUBJECTS = DATA.subjects;
  var DAYS = DATA.days;
  var SLOT_LABELS = DATA.slotLabels;
  var SLOT_24H = DATA.slot24h;
  var EXAM_SCHEDULE = DATA.examSchedule || [];
  var STORE_KEY = 'iimt_t5_timetables_v1';

  var subjectCodes = Object.keys(SUBJECTS).sort();

  var LIGHT_PALETTE = [
    '#C1521B', '#3F7D4F', '#B33F3F', '#5B4B9E', '#2E6E8E',
    '#9C6B14', '#7A3E9D', '#1F6F5C', '#A6431B', '#4A5FA5'
  ];
  var colorCache = {};
  function subjectColor(code){
    if(colorCache[code]) return colorCache[code];
    var h = 0;
    for(var i=0;i<code.length;i++){ h = (h*31 + code.charCodeAt(i)) >>> 0; }
    var c = LIGHT_PALETTE[h % LIGHT_PALETTE.length];
    colorCache[code] = c;
    return c;
  }

  var state = {
    selected: {},   // subject -> true
    groupPick: {}   // subject -> group string (only for multi-group subjects)
  };

  // ---------- Step 1: subject chips ----------
  var grid = document.getElementById('subjectGrid');
  subjectCodes.forEach(function(code, idx){
    var s = SUBJECTS[code];
    var chip = document.createElement('div');
    chip.className = 'chip' + (s.groups.length === 0 ? ' solo' : '');
    chip.innerHTML = '<span class="code">' + code + '</span>';
    chip.dataset.code = code;
    chip.style.setProperty('--i', idx);
    chip.addEventListener('click', function(){
      toggleSubject(code, chip);
    });
    grid.appendChild(chip);
  });

  function toggleSubject(code, chipEl){
    if(state.selected[code]){
      delete state.selected[code];
      delete state.groupPick[code];
      chipEl.classList.remove('on');
    } else {
      state.selected[code] = true;
      chipEl.classList.add('on');
    }
    renderGroupStep();
    renderGenerateState();
  }

  // ---------- Step 2: group pickers ----------
  var groupStep = document.getElementById('groupStep');
  var groupGrid = document.getElementById('groupGrid');

  function renderGroupStep(){
    var codes = Object.keys(state.selected).sort();

    if(codes.length === 0){
      groupStep.style.display = 'none';
      groupGrid.innerHTML = '';
      return;
    }
    groupStep.style.display = '';
    groupGrid.innerHTML = '';

    var list = document.createElement('div');
    list.className = 'group-card-list';

    codes.forEach(function(code){
      var s = SUBJECTS[code];
      var color = subjectColor(code);
      var card = document.createElement('div');
      card.className = 'group-card';

      var name = document.createElement('div');
      name.className = 'gc-name';
      name.style.color = color;
      name.textContent = code;
      card.appendChild(name);

      if(s.groups.length === 0){
        var note = document.createElement('div');
        note.className = 'gc-note';
        note.textContent = 'Single group — auto assigned';
        card.appendChild(note);
      } else {
        var pillsWrap = document.createElement('div');
        pillsWrap.className = 'gc-pills';
        s.groups.forEach(function(g){
          var pill = document.createElement('span');
          pill.className = 'gc-pill' + (state.groupPick[code] === g ? ' on' : '');
          pill.textContent = 'Gr.' + g;
          pill.addEventListener('click', function(){
            state.groupPick[code] = g;
            renderGroupStep();
            renderGenerateState();
          });
          pillsWrap.appendChild(pill);
        });
        card.appendChild(pillsWrap);
      }
      list.appendChild(card);
    });

    groupGrid.appendChild(list);
  }

  // ---------- Generate button state ----------
  var generateBtn = document.getElementById('generateBtn');
  var selCount = document.getElementById('selCount');

  function renderGenerateState(){
    var codes = Object.keys(state.selected);
    selCount.textContent = codes.length + (codes.length === 1 ? ' subject selected' : ' subjects selected');
    var multiNeedingPick = codes.filter(function(c){
      return SUBJECTS[c].groups.length > 0 && !state.groupPick[c];
    });
    generateBtn.disabled = codes.length === 0 || multiNeedingPick.length > 0;
  }

  generateBtn.addEventListener('click', function(){
    generateSchedule();
    saveCombo();
  });

  document.getElementById('startOverBtn').addEventListener('click', function(){
    document.getElementById('result').style.display = 'none';
    document.getElementById('setupStep').scrollIntoView({behavior:'smooth'});
  });

  // ---------- Build a personal event list from DAYS ----------
  function itemMatchesSelection(item){
    if(item.kind === 'special') return true;
    var code = item.subject;
    if(!state.selected[code]) return false;
    var s = SUBJECTS[code];
    if(s.groups.length === 0) return true;
    return state.groupPick[code] === item.group;
  }

  function buildPersonalDays(){
    return DAYS.map(function(day){
      var items = day.items.filter(itemMatchesSelection).slice().sort(function(a,b){return a.slot-b.slot;});
      return {iso: day.iso, date: day.date, day: day.day, remarks: day.remarks, items: items};
    });
  }

  // ---------- Render agenda ----------
  var MONTHS_SHORT = {Jan:'Jan',Feb:'Feb',Mar:'Mar',Apr:'Apr',May:'May',Jun:'Jun',Jul:'Jul',Aug:'Aug',Sep:'Sep',Oct:'Oct',Nov:'Nov',Dec:'Dec'};

  function todayISO(){
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }

  function renderAgenda(personalDays){
    var agenda = document.getElementById('agenda');
    var monthNav = document.getElementById('monthNav');
    agenda.innerHTML = '';
    monthNav.innerHTML = '';
    var withItems = personalDays.filter(function(d){return d.items.length>0;});
    if(withItems.length === 0){
      agenda.innerHTML = '<p class="empty-note">Nothing on your schedule yet — go back and pick your electives.</p>';
      return;
    }
    var today = todayISO();
    var seenMonths = {};
    var monthChips = [];
    var todayRowEl = null;

    withItems.forEach(function(day, dayIdx){
      var dParts = day.date.split('-'); // DD-Mon-YYYY
      var monthKey = day.iso.slice(0,7); // YYYY-MM
      var anchorId = 'month-' + monthKey;

      if(!seenMonths[monthKey]){
        seenMonths[monthKey] = true;
        var mh = document.createElement('div');
        mh.className = 'month-header';
        mh.id = anchorId;
        mh.textContent = MONTHS_SHORT[dParts[1]] + ' ' + dParts[2];
        agenda.appendChild(mh);
        monthChips.push({id: anchorId, label: MONTHS_SHORT[dParts[1]] + ' ' + dParts[2]});
      }

      var row = document.createElement('div');
      row.className = 'day-row' + (day.iso === today ? ' today' : '');
      row.style.setProperty('--i', dayIdx);
      if(day.iso === today){ todayRowEl = row; }

      var label = document.createElement('div');
      label.className = 'day-label';
      label.innerHTML = '<div class="dow">' + day.day + '</div>' +
        '<div class="dnum">' + dParts[0] + '</div>' +
        '<div class="dmon">' + dParts[1] + ' ' + dParts[2] + '</div>';
      row.appendChild(label);

      var itemsWrap = document.createElement('div');

      if(day.remarks && day.remarks.length){
        var rb = document.createElement('div');
        rb.className = 'remark-banner';
        rb.textContent = day.remarks.join(' · ');
        itemsWrap.appendChild(rb);
      }

      var itemsBox = document.createElement('div');
      itemsBox.className = 'items';
      day.items.forEach(function(it){
        var el = document.createElement('div');
        el.className = 'item' + (it.kind === 'special' ? ' special' : '');
        var time = SLOT_LABELS[it.slot];
        var whatHtml;
        if(it.kind === 'special'){
          whatHtml = '<b>' + it.label + '</b>';
        } else {
          var groupStr = it.group ? ' · Gr.' + it.group : '';
          whatHtml = '<b>' + it.subject + groupStr + '</b>' +
            (it.room ? '<span class="meta">' + it.room + '</span>' : '') +
            (it.faculty ? '<span class="faculty">' + it.faculty + '</span>' : '');
        }
        el.innerHTML = '<div class="time">' + time + '</div><div class="what">' + whatHtml + '</div>';
        itemsBox.appendChild(el);
      });
      itemsWrap.appendChild(itemsBox);
      row.appendChild(itemsWrap);
      agenda.appendChild(row);
    });

    // Build the month quick-jump nav
    if(todayRowEl){
      var todayBtn = document.createElement('button');
      todayBtn.className = 'today-btn';
      todayBtn.textContent = '● Today';
      todayBtn.addEventListener('click', function(){
        todayRowEl.scrollIntoView({behavior:'smooth', block:'start'});
      });
      monthNav.appendChild(todayBtn);
    }
    monthChips.forEach(function(m){
      var btn = document.createElement('button');
      btn.textContent = m.label;
      btn.addEventListener('click', function(){
        document.getElementById(m.id).scrollIntoView({behavior:'smooth', block:'start'});
      });
      monthNav.appendChild(btn);
    });
  }

  // ---------- Free days ----------
  function renderFreeDays(personalDays){
    var bannerText = document.getElementById('freeDaysBannerText');
    var statsBox = document.getElementById('freeDaysStats');
    var list = document.getElementById('freeDaysList');
    var free = personalDays.filter(function(d){ return d.items.length === 0; });
    var weekend = free.filter(function(d){ return d.day === 'Sat' || d.day === 'Sun'; }).length;
    var weekday = free.length - weekend;

    bannerText.textContent = '📅 ' + free.length + ' Free Day' + (free.length===1?'':'s') +
      ' this term · ' + weekday + ' weekday' + (weekday===1?'':'s') +
      ' · ' + weekend + ' weekend' + (weekend===1?'':'s');

    statsBox.innerHTML =
      '<div class="stat"><div class="num">' + free.length + '</div><div class="lbl">total free days</div></div>' +
      '<div class="stat"><div class="num">' + weekday + '</div><div class="lbl">free weekdays</div></div>' +
      '<div class="stat"><div class="num">' + weekend + '</div><div class="lbl">free weekends</div></div>';

    if(free.length === 0){
      list.innerHTML = '<div>No fully free academic days this term for your picks.</div>';
      return;
    }
    list.innerHTML = free.map(function(d){
      var parts = d.date.split('-');
      return '<div>' + parts[0] + ' ' + parts[1] + '&nbsp;&nbsp;<b>' + d.day + '</b></div>';
    }).join('');
  }

  // ---------- Clash pill ----------
  function renderClashPill(personalDays){
    var el = document.getElementById('clashPill');
    if(!el) return;
    var clashDays = [];
    personalDays.forEach(function(d){
      var classItems = d.items.filter(function(it){ return it.kind === 'class'; });
      var bySlot = {};
      classItems.forEach(function(it){ bySlot[it.slot] = (bySlot[it.slot]||0) + 1; });
      if(Object.keys(bySlot).some(function(k){ return bySlot[k] > 1; })){ clashDays.push(d); }
    });
    if(clashDays.length === 0){
      el.classList.remove('has-clash');
      el.innerHTML = '✓ No time clashes detected — your combination is clean';
    } else {
      el.classList.add('has-clash');
      el.innerHTML = '⚠ Time clash on ' + clashDays.length + ' day' + (clashDays.length===1?'':'s') +
        ' — check ' + clashDays.map(function(d){return d.day + ' ' + d.date;}).join(', ');
    }
  }

  // ---------- Free-days panel toggle (click to expand) ----------
  var freeDaysBanner = document.getElementById('freeDaysBanner');
  var freeDaysContent = document.getElementById('freeDaysContent');
  function toggleFreeDaysPanel(){
    var isOpen = freeDaysBanner.classList.toggle('open');
    freeDaysContent.style.display = isOpen ? 'flex' : 'none';
  }
  if(freeDaysBanner){
    freeDaysBanner.addEventListener('click', toggleFreeDaysPanel);
    freeDaysBanner.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleFreeDaysPanel(); }
    });
  }

  // ---------- Stats (total / remaining classes) ----------
  function renderStats(personalDays){
    var today = todayISO();
    var total = 0, left = 0;
    personalDays.forEach(function(day){
      day.items.forEach(function(it){
        if(it.kind !== 'class') return;
        total++;
        if(day.iso >= today) left++;
      });
    });
    var bar = document.getElementById('statsBar');
    bar.innerHTML =
      '<div class="stat"><div class="num">' + total + '</div><div class="lbl">total classes</div></div>' +
      '<div class="stat attention"><div class="num">' + left + '</div><div class="lbl">classes left</div></div>';
  }

  // ---------- Exam timetable (auto-updates whenever examSchedule data is filled in) ----------
  function renderExamSection(){
    var badge = document.getElementById('examBadge');
    var listEl = document.getElementById('examList');
    var codes = state.selected;

    var relevant = EXAM_SCHEDULE.filter(function(ex){
      return !ex.subject || codes[ex.subject];
    }).slice().sort(function(a,b){
      return (a.iso || '').localeCompare(b.iso || '');
    });

    if(EXAM_SCHEDULE.length === 0){
      badge.textContent = 'Not published yet';
      badge.className = 'exam-badge pending';
      listEl.innerHTML = '<div class="exam-empty">The exam timetable hasn\'t been released yet — this section will fill in automatically once it is.</div>';
      return;
    }

    if(relevant.length === 0){
      badge.textContent = EXAM_SCHEDULE.length + ' published';
      badge.className = 'exam-badge';
      listEl.innerHTML = '<div class="exam-empty">No published exams match your selected subjects yet.</div>';
      return;
    }

    badge.textContent = relevant.length + (relevant.length === 1 ? ' exam' : ' exams');
    badge.className = 'exam-badge';
    listEl.innerHTML = '<div class="exam-list">' + relevant.map(function(ex){
      var whatBits = [];
      if(ex.subject) whatBits.push('<b>' + ex.subject + '</b>');
      else whatBits.push('<b>' + (ex.label || 'Exam') + '</b>');
      var metaBits = [];
      if(ex.time) metaBits.push(ex.time);
      if(ex.room) metaBits.push(ex.room);
      var meta = metaBits.length ? '<span class="meta">' + metaBits.join(' · ') + '</span>' : '';
      return '<div class="exam-item">' +
        '<div class="exam-date">' + (ex.day ? ex.day + ' ' : '') + (ex.date || '') + '</div>' +
        '<div class="exam-what">' + whatBits.join('') + meta + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  // ---------- Generate ----------
  var lastPersonalDays = null;

  function generateSchedule(){
    var personalDays = buildPersonalDays();
    lastPersonalDays = personalDays;
    renderAgenda(personalDays);
    renderFreeDays(personalDays);
    renderStats(personalDays);
    renderExamSection();
    renderClashPill(personalDays);

    var codes = Object.keys(state.selected).sort();
    var summary = codes.map(function(c){
      var s = SUBJECTS[c];
      return c + (state.groupPick[c] ? ' (Gr.' + state.groupPick[c] + ')' : '');
    }).join(', ');
    document.getElementById('picksSummary').innerHTML = '<b>Your subjects:</b> ' + summary;

    var resultEl = document.getElementById('result');
    resultEl.style.display = 'block';
    resultEl.classList.remove('showing');
    void resultEl.offsetWidth; // restart animation on repeat generates
    resultEl.classList.add('showing');
    resultEl.scrollIntoView({behavior:'smooth'});
  }

  // ---------- ICS export ----------
  function pad(n){ return (n<10?'0':'')+n; }

  function icsDateTime(iso, hhmm){
    var y = iso.slice(0,4), m = iso.slice(5,7), d = iso.slice(8,10);
    var hh = hhmm.split(':')[0], mm = hhmm.split(':')[1];
    return y+m+d+'T'+hh+mm+'00';
  }

  function buildICS(personalDays){
    var lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//IIM Trichy PGPM T5//Personal Timetable//EN');
    lines.push('CALSCALE:GREGORIAN');
    var count = 0;
    var now = new Date();
    var dtstampNow = now.getUTCFullYear() + pad(now.getUTCMonth()+1) + pad(now.getUTCDate()) +
      'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    personalDays.forEach(function(day){
      day.items.forEach(function(it){
        var times = SLOT_24H[it.slot];
        var dtStart = icsDateTime(day.iso, times[0]);
        var dtEnd = icsDateTime(day.iso, times[1]);
        var summary, location, description;
        if(it.kind === 'special'){
          summary = it.label;
          location = '';
          description = 'Term V — all-batch item';
        } else {
          summary = it.subject + (it.group ? ' Gr.' + it.group : '');
          location = it.room || '';
          description = it.faculty ? 'Faculty: ' + it.faculty : '';
        }
        count++;
        var uid = day.iso + '-' + it.slot + '-' + (it.subject||it.label).replace(/\s+/g,'') + (it.group||'') + '@iimt-t5';
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + uid);
        lines.push('DTSTAMP:' + dtstampNow);
        lines.push('DTSTART;TZID=Asia/Kolkata:' + dtStart);
        lines.push('DTEND;TZID=Asia/Kolkata:' + dtEnd);
        lines.push('SUMMARY:' + escapeICS(summary));
        if(location) lines.push('LOCATION:' + escapeICS(location));
        if(description) lines.push('DESCRIPTION:' + escapeICS(description));
        lines.push('END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return {text: lines.join('\r\n'), count: count};
  }

  function escapeICS(s){
    return String(s).replace(/[\\;,]/g, function(m){return '\\'+m;}).replace(/\n/g,'\\n');
  }

  document.getElementById('icsBtn').addEventListener('click', function(){
    if(!lastPersonalDays){ return; }
    var built = buildICS(lastPersonalDays);
    var blob = new Blob([built.text], {type:'text/calendar;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'term5-timetable.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  });

  // ---------- Saved combinations (localStorage) ----------
  function loadCombos(){
    try{
      return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    }catch(e){ return []; }
  }
  function persistCombos(list){
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  function saveCombo(){
    var codes = Object.keys(state.selected).sort();
    if(codes.length === 0) return;
    var label = codes.map(function(c){
      return c + (state.groupPick[c] ? '('+state.groupPick[c]+')' : '');
    }).join(', ');
    var combos = loadCombos();
    // avoid exact duplicates
    var exists = combos.some(function(c){ return c.label === label; });
    if(!exists){
      combos.unshift({label: label, selected: state.selected, groupPick: state.groupPick, ts: Date.now()});
      combos = combos.slice(0, 6);
      persistCombos(combos);
      renderSavedCombos();
    }
  }

  function renderSavedCombos(){
    var box = document.getElementById('savedBox');
    var combos = loadCombos();
    if(combos.length === 0){ box.innerHTML = ''; return; }
    var html = '<section class="step"><h2 style="font-size:15px;">Recent combinations</h2><div class="saved-list">';
    combos.forEach(function(c, idx){
      html += '<div class="saved-item">' +
        '<span>' + c.label + '</span>' +
        '<button data-idx="'+idx+'" class="load">Load</button>' +
        '<button data-idx="'+idx+'" class="del">Remove</button>' +
        '</div>';
    });
    html += '</div></section>';
    box.innerHTML = html;

    box.querySelectorAll('button.load').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = +btn.dataset.idx;
        var combo = loadCombos()[idx];
        if(!combo) return;
        applyCombo(combo);
      });
    });
    box.querySelectorAll('button.del').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = +btn.dataset.idx;
        var combos2 = loadCombos();
        combos2.splice(idx,1);
        persistCombos(combos2);
        renderSavedCombos();
      });
    });
  }

  function applyCombo(combo){
    state.selected = Object.assign({}, combo.selected);
    state.groupPick = Object.assign({}, combo.groupPick);
    // reflect chip UI
    grid.querySelectorAll('.chip').forEach(function(chip){
      var code = chip.dataset.code;
      chip.classList.toggle('on', !!state.selected[code]);
    });
    renderGroupStep();
    renderGenerateState();
    generateSchedule();
  }

  // ---------- Faculty visibility toggle ----------
  var facultyToggle = document.getElementById('facultyToggle');
  if(facultyToggle){
    facultyToggle.addEventListener('click', function(){
      var on = document.body.classList.toggle('show-faculty');
      facultyToggle.classList.toggle('on', on);
      facultyToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  renderSavedCombos();
  renderGenerateState();
})();
