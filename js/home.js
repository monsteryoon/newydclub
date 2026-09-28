/* 메인 화면: 관리자 화면에서 바꾼 문구·사진·조직도·사진첩을 불러와 반영
   DB에 아무것도 없거나 연결이 안 되면 index.html에 적힌 원래 내용이 그대로 보입니다. */
(function(){
  var N = window.NYD;
  var esc = N.escapeHtml, rich = N.richText, list = N.parseList;
  var $ = function(id){ return document.getElementById(id); };
  var chevron = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  var dotIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>';
  function bg(url){ return 'url("' + String(url).replace(/"/g, '%22') + '")'; }
  function hide(el){ if(el) el.style.display = 'none'; }

  /* ---------- 1. 문구·사진 ---------- */
  function applyTexts(st){
    document.querySelectorAll('[data-edit]').forEach(function(el){
      var key = el.getAttribute('data-edit');
      if(!(key in st) || st[key] == null) return;
      var val = String(st[key]);
      if(el.getAttribute('data-edit-mode') === 'paras'){
        el.innerHTML = val.split(/\n\s*\n/).map(function(p){ return p.trim(); }).filter(Boolean)
          .map(function(p){ return '<p class="message-body">' + rich(p) + '</p>'; }).join('');
      } else {
        el.innerHTML = rich(val);
      }
    });
    document.querySelectorAll('[data-edit-bg]').forEach(function(el){
      var url = N.safeUrl(st[el.getAttribute('data-edit-bg')]);
      if(url) el.style.backgroundImage = bg(url);
    });
  }

  // 첫 화면 주 버튼: 켜기/끄기 + 연결 주소
  function applyHeroButton(st){
    var btn = document.querySelector('[data-edit="hero_button"]');
    if(!btn) return;
    if(st.hero_button_enabled === 'off'){ hide(btn); return; }
    var link = N.safeUrl(st.hero_button_link);
    if(link) btn.setAttribute('href', link);
  }

  // 첫 화면 배경 사진: 여러 장을 차례로 바꿔 보여줌
  function applyHeroSlides(st){
    var box = $('heroBg'); if(!box) return;
    var photos = list(st.hero_photos).map(function(x){ return N.safeUrl(x && x.img); }).filter(Boolean);
    if(!photos.length){
      // 예전 방식(사진 1~3) 값이 있으면 그대로 사용
      var old = box.querySelectorAll('.hero-bg-slide');
      [1,2,3].forEach(function(n){ var u = N.safeUrl(st['hero_photo_' + n]); if(u && old[n-1]) old[n-1].style.backgroundImage = bg(u); });
      photos = Array.prototype.map.call(old, function(el){ var m = (el.getAttribute('style') || '').match(/url\(['"]?([^'")]+)/); return m ? m[1] : ''; }).filter(Boolean);
    }
    box.classList.add('js-slides');
    box.innerHTML = photos.map(function(u, i){ return '<div class="hero-bg-slide' + (i === 0 ? ' on' : '') + '" style="background-image:' + esc(bg(u)) + '"></div>'; }).join('');
    var slides = box.querySelectorAll('.hero-bg-slide');
    if(slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cur = 0, secs = Math.max(3, parseInt(st.hero_slide_seconds, 10) || 6);
    setInterval(function(){
      slides[cur].classList.remove('on');
      cur = (cur + 1) % slides.length;
      slides[cur].classList.add('on');
    }, secs * 1000);
  }

  function applyMarquee(st){
    if(!st.marquee_items) return;
    var items = st.marquee_items.split(/\n|,/).map(function(x){ return x.trim(); }).filter(Boolean);
    var track = $('marqueeTrack');
    if(!track || !items.length) return;
    var one = items.map(function(t){ return '<span class="marquee-item">' + dotIcon + esc(t) + '</span>'; }).join('');
    var reps = Math.max(2, Math.ceil(8 / items.length) * 2), html = '';
    for(var i = 0; i < reps; i++) html += one;
    track.innerHTML = html;
  }

  function applySong(st){
    if(st.song_url == null) return;
    var id = N.youtubeId(st.song_url);
    if(id) $('songFrame').src = 'https://www.youtube.com/embed/' + id;
    else if(!String(st.song_url).trim()) hide($('themesong'));
  }

  function applyProgress(st){
    var items = list(st.progress_items), box = $('progressList');
    if(!box || !items.length) return;
    box.innerHTML = items.map(function(it){
      var cls = ['done','active','upcoming'].indexOf(it.status) >= 0 ? it.status : 'done';
      return '<div class="progress-item ' + cls + '"><span class="st">' + esc(it.label) + '</span><h3>' + esc(it.title) + '</h3><p>' + rich(it.desc) + '</p></div>';
    }).join('');
  }

  function applyInvitePopup(st){
    var inviteImg = $('inviteImg');
    if(st.popup_image && inviteImg) inviteImg.src = N.safeUrl(st.popup_image) || inviteImg.src;
    if(st.popup_title){
      var head = document.querySelector('#inviteModal .modal-head span');
      if(head) head.innerHTML = '<span class="badge-dot"></span>' + esc(st.popup_title);
      document.querySelectorAll('.qb-label').forEach(function(l){ if(l.textContent === '초대장') l.textContent = '팝업'; });
    }
    if(st.popup_enabled === 'off'){
      ['heroInviteBtn','noticeInviteBtn','foundingInviteBtn','quickInviteBtn'].forEach(function(id){ hide($(id)); });
    }
  }

  // 행사 안내 칸 켜기/끄기
  function applyFounding(st){
    if(st.founding_enabled !== 'off') return;
    hide($('founding'));
    document.querySelectorAll('a[href="#founding"], a[href="index.html#founding"]').forEach(function(a){
      if(a.closest('.gnb, .mobile-panel, .footer-col')){ var li = a.closest('li'); hide(li || a); }
    });
  }

  /* ---------- 2. 문의 팝업 ---------- */
  function contactLineHtml(l){
    var t = String(l.text || '').trim(), href = '';
    if(/^(\+82[- ]?)?0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}$/.test(t) || /^1[5-9]\d{2}-?\d{4}$/.test(t)) href = 'tel:' + t.replace(/[^\d+]/g, ''); // 전화번호만 (사업자번호 등 제외)
    else if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) href = 'mailto:' + t;
    else if(/^https?:\/\//i.test(t)) href = t;
    var val = href ? '<a href="' + esc(href) + '"' + (/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(t) + '</a>' : rich(t);
    return '<li>' + (l.label ? '<b>' + esc(l.label) + '</b>' : '') + '<span>' + val + '</span></li>';
  }
  function setupContactPopup(st){
    if(st.cta_popup_enabled === 'off') return;
    var lines = list(st.cta_popup_lines);
    if(!lines.length){
      // 기본값: 문의 칸에 적힌 내용
      document.querySelectorAll('#contact .contact-row').forEach(function(r){
        var b = r.querySelector('b'), p = r.querySelector('p');
        if(b && p && !/창립총회/.test(b.textContent) && (b.textContent.trim() || p.textContent.trim())) lines.push({ label:b.textContent.trim(), text:p.textContent.trim() });
      });
    }
    var modal = document.createElement('div');
    modal.className = 'modal-overlay contact-pop';
    modal.id = 'contactModal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="modal-card"><div class="modal-head"><span><span class="badge-dot"></span>' + esc(st.cta_popup_title || '가입 · 참석 문의') + '</span><button type="button" aria-label="닫기" data-close>×</button></div>' +
      '<div class="modal-body">' + (st.cta_popup_intro ? '<p class="cp-intro">' + rich(st.cta_popup_intro) + '</p>' : '') + '<ul class="cp-lines">' + lines.filter(function(l){ return l && (String(l.label || '').trim() || String(l.text || '').trim()); }).map(contactLineHtml).join('') + '</ul></div></div>';
    document.body.appendChild(modal);
    function open(e){ if(e) e.preventDefault(); modal.classList.add('open'); }
    function close(){ modal.classList.remove('open'); }
    modal.addEventListener('click', function(e){ if(e.target === modal || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
    var targets = [document.querySelector('[data-edit="cta_button"]'), document.querySelector('.quick-menu a[href="#contact"]')];
    targets.forEach(function(t){ if(t) t.addEventListener('click', open); });
  }

  /* ---------- 3. 카운트다운 (행사가 끝나면 자동으로 '종료' 문구) ---------- */
  var countdownDone = false;
  function setupCountdown(st){
    if(countdownDone) return; countdownDone = true;
    var when = st.event_datetime ? new Date(st.event_datetime + (st.event_datetime.length <= 16 ? ':00' : '') + '+09:00') : null;
    if(when && !isNaN(when) && window.nydSetCountdownTarget) window.nydSetCountdownTarget(when.getTime());
    var targetMs = (when && !isNaN(when)) ? when.getTime() : new Date('2026-09-17T17:30:00+09:00').getTime();
    var card = $('countdownCard'), feature = $('countdownFeature');
    if(st.countdown_enabled === 'off'){ hide(card); hide(feature); return; }
    if(Date.now() > targetMs){
      var lbl = document.querySelector('[data-edit="countdown_label"]');
      if(lbl) lbl.innerHTML = rich(st.countdown_done_label || '창립총회 개최 완료');
      [$('countdownHero'), feature].forEach(function(g){
        if(!g) return;
        var p = document.createElement('p'); p.className = 'cd-done';
        p.innerHTML = rich(st.countdown_done_text || '성황리에 마무리되었습니다. 함께해 주셔서 감사합니다.');
        g.replaceWith(p);
      });
    }
  }

  /* ---------- 4. 조직도 (그룹별) ---------- */
  function renderOrg(st, units){
    var body = $('orgBody');
    if(!body || !units || !units.length) return;
    var groups = N.orgGroups(st);
    var html = '', i = 0;
    groups.forEach(function(g){
      var mine = units.filter(function(u){ return u.section === g.key; });
      if(!mine.length) return;
      if(g.show_head){
        var badge = (g.badge != null && String(g.badge).trim()) ? g.badge : mine.length + '개';
        html += '<div class="org-group-head reveal" style="--i:0;' + (i ? ' margin-top:44px;' : '') + '"><h3>' + esc(g.name) + ' <span>' + esc(badge) + '</span></h3></div>';
      }
      var P = window.NYDPerson;
      if(g.type === 'leader'){
        var tiers = {};
        mine.forEach(function(u){ (tiers[u.tier || 1] = tiers[u.tier || 1] || []).push(u); });
        html += '<div class="org-leaders">' + Object.keys(tiers).sort(function(a, b){ return a - b; }).map(function(t, k){
          return '<div class="leader-tier reveal" style="--i:' + (k+1) + '">' + tiers[t].map(function(u){
            var cls = 'leader-card' + (u.featured ? ' featured' : '') + (u.wide ? ' wide' : '');
            var grp = N.unitGroupName(u, g);
            // "국장 권순용 · 차장 조주현" → 이름마다 회원카드
            var names = String(u.members || u.leader || '').split(/\s*[·,、]\s*/).filter(Boolean).map(function(tok){
              var parts = tok.trim().split(/\s+/), nm = parts.pop();
              return (parts.length ? esc(parts.join(' ')) + ' ' : '') + (P ? P.tag(nm, grp) : esc(nm));
            }).join(' · ');
            return '<div class="' + cls + '"><span class="lc-role">' + esc(u.title) + '</span><span class="lc-name">' + names + '</span></div>';
          }).join('') + '</div>';
        }).join('') + '</div>';
      } else {
        html += '<div class="org-grid reveal" style="--i:1">' + mine.map(function(u){
          var names = N.splitNames(u.members), grp = N.unitGroupName(u, g);
          var chips = names.length ? names.map(function(n){
                        return P ? '<button type="button" class="member-chip person" data-name="' + esc(n) + '" data-group="' + esc(grp) + '">' + esc(n) + '</button>' : '<span class="member-chip">' + esc(n) + '</span>';
                      }).join('')
                                   : '<span class="member-chip muted">회원 명단 준비 중</span>';
          var lead = String(u.leader || '').trim().split(/\s+/).filter(Boolean), leadHtml = '';
          if(lead.length){ var ln = lead.pop(); leadHtml = (lead.length ? esc(lead.join(' ')) + ' ' : '') + (P ? P.tag(ln, grp) : esc(ln)); }
          return '<details class="org-card"><summary><span class="oc-title"><b>' + esc(u.title) + '</b><i>' + leadHtml + '</i></span>' +
                 '<span class="oc-meta">' + (names.length ? names.length + '명' : '-') + ' ' + chevron + '</span></summary>' +
                 '<div class="org-members">' + chips + '</div></details>';
        }).join('') + '</div>';
      }
      i++;
    });
    body.innerHTML = html;
    N.observeReveal($('orgchart'));
    if(window.NYDPerson) window.NYDPerson.load(N.orgPeople(groups, units));
  }
  // DB 조직도가 없어도 그룹 표시(예: 9개 읍·면)는 반영
  function applyOrgBadges(st){
    N.orgGroups(st).forEach(function(g){
      var el = document.querySelector('[data-org-badge="' + g.key + '"]');
      if(el && g.badge) el.textContent = g.badge;
    });
  }

  /* ---------- 5. 사진첩 미리보기 · 활동 카드 연결 ---------- */
  function tileHtml(img, title, sub, href){
    img = N.safeUrl(img);
    return '<a class="gallery-tile ' + (img ? 'photo' : 'g1') + '" href="' + esc(href || 'gallery.html') + '"' + (img ? ' style="background-image:' + esc(bg(img)) + '"' : '') + '>' +
           '<span>' + esc(title || '') + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></a>';
  }
  function renderGallery(st, albums){
    var grid = $('galleryGrid'); if(!grid) return;
    var tiles = list(st.gallery_tiles).filter(function(t){ return t && N.safeUrl(t.img); });
    if(st.gallery_mode === 'manual' && tiles.length){
      grid.innerHTML = tiles.map(function(t){ return tileHtml(t.img, t.title, '', N.safeUrl(t.link) || 'gallery.html'); }).join('');
      return;
    }
    if(!albums || !albums.length) return;
    grid.innerHTML = albums.slice(0, 6).map(function(a){
      return tileHtml(a.cover_url, a.title, a.event_date ? N.formatDate(a.event_date) : '', 'gallery.html?album=' + encodeURIComponent(a.id));
    }).join('');
  }
  function linkActivities(st, albums){
    var byId = {}; (albums || []).forEach(function(a){ byId[a.id] = a; });
    document.querySelectorAll('[data-activity]').forEach(function(card){
      var a = byId[st['activity_' + card.getAttribute('data-activity') + '_album']];
      if(!a) return;
      var link = document.createElement('a');
      link.className = 'activity-album';
      link.href = 'gallery.html?album=' + encodeURIComponent(a.id);
      link.innerHTML = (N.safeUrl(a.cover_url) ? '<span class="aa-thumb" style="background-image:' + esc(bg(a.cover_url)) + '"></span>' : '') +
                       '<span class="aa-text">' + esc(a.title) + ' 사진 보기 →</span>';
      card.appendChild(link);
    });
  }

  /* ---------- 불러오기 ---------- */
  var popupDone = false;
  function popupOnce(st){
    if(popupDone) return; popupDone = true;
    if(st && st.popup_enabled === 'off') return;
    if(window.nydMaybeOpenPopup) window.nydMaybeOpenPopup();
  }
  function fallback(){ popupOnce(null); setupCountdown({}); }
  var fallbackTimer = setTimeout(fallback, 2500);
  if(!N.sbRead){ clearTimeout(fallbackTimer); fallback(); setupContactPopup({}); applyHeroSlides({}); return; }

  function rows(q){ return q.then(function(r){ return r.error ? null : r.data; }, function(){ return null; }); }
  Promise.all([
    rows(N.sbRead.from('site_settings').select('key,value')),
    rows(N.sbRead.from('org_units').select('*').order('sort', {ascending:true})),
    rows(N.sbRead.from('albums').select('id,title,event_date,cover_url,created_at').order('event_date', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false}))
  ]).then(function(res){
    clearTimeout(fallbackTimer);
    var st = {};
    (res[0] || []).forEach(function(r){ st[r.key] = r.value; });
    var steps = [
      function(){ applyTexts(st); }, function(){ applyHeroButton(st); }, function(){ applyHeroSlides(st); },
      function(){ applyMarquee(st); }, function(){ applySong(st); }, function(){ applyProgress(st); },
      function(){ applyInvitePopup(st); }, function(){ applyFounding(st); }, function(){ setupContactPopup(st); },
      function(){ setupCountdown(st); }, function(){ applyOrgBadges(st); }, function(){ renderOrg(st, res[1]); },
      function(){ renderGallery(st, res[2]); }, function(){ linkActivities(st, res[2]); }
    ];
    // 한 부분에 문제가 생겨도 나머지는 계속 반영
    steps.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
    popupOnce(st);
  });
})();
