/* 메인 화면: 관리자 화면에서 바꾼 문구·사진·조직도·사진첩을 불러와 반영
   DB에 아무것도 없거나 연결이 안 되면 index.html에 적힌 원래 내용이 그대로 보입니다. */
(function(){
  var N = window.NYD;
  var esc = N.escapeHtml, rich = N.richText;

  function splitNames(str){
    return String(str || '').split(/[,\n、·]+/).map(function(x){ return x.trim(); }).filter(Boolean);
  }
  var chevron = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  var dotIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>';

  /* ---------- 1. 문구·사진 ---------- */
  function applySettings(st){
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
      if(url) el.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    });

    // 흐르는 띠
    if(st.marquee_items){
      var items = st.marquee_items.split(/\n|,/).map(function(x){ return x.trim(); }).filter(Boolean);
      var track = document.getElementById('marqueeTrack');
      if(track && items.length){
        var one = items.map(function(t){ return '<span class="marquee-item">' + dotIcon + esc(t) + '</span>'; }).join('');
        var reps = Math.max(2, Math.ceil(8 / items.length) * 2);
        var html = ''; for(var i = 0; i < reps; i++) html += one;
        track.innerHTML = html;
      }
    }

    // 테마곡 영상
    if(st.song_url != null){
      var sec = document.getElementById('themesong');
      var id = N.youtubeId(st.song_url);
      if(id){ document.getElementById('songFrame').src = 'https://www.youtube.com/embed/' + id; }
      else if(!String(st.song_url).trim() && sec){ sec.style.display = 'none'; }
    }

    // 추진 경과 목록
    if(st.progress_items){
      try{
        var list = JSON.parse(st.progress_items);
        var box = document.getElementById('progressList');
        if(box && Array.isArray(list) && list.length){
          box.innerHTML = list.map(function(it){
            var cls = ['done','active','upcoming'].indexOf(it.status) >= 0 ? it.status : 'done';
            return '<div class="progress-item ' + cls + '"><span class="st">' + esc(it.label) + '</span><h3>' + esc(it.title) + '</h3><p>' + rich(it.desc) + '</p></div>';
          }).join('');
        }
      }catch(e){}
    }

    // 팝업
    var inviteImg = document.getElementById('inviteImg');
    if(st.popup_image && inviteImg){ inviteImg.src = N.safeUrl(st.popup_image) || inviteImg.src; }
    if(st.popup_title){
      var head = document.querySelector('#inviteModal .modal-head span');
      if(head) head.innerHTML = '<span class="badge-dot"></span>' + esc(st.popup_title);
      document.querySelectorAll('.qb-label').forEach(function(l){ if(l.textContent === '초대장') l.textContent = '팝업'; });
    }
    if(st.popup_enabled === 'off'){
      ['heroInviteBtn','noticeInviteBtn','foundingInviteBtn','quickInviteBtn'].forEach(function(id){
        var el = document.getElementById(id); if(el) el.style.display = 'none';
      });
    }
  }

  /* ---------- 2. 카운트다운 (행사가 끝나면 자동으로 '종료' 문구) ---------- */
  function setupCountdown(st){
    var when = st.event_datetime ? new Date(st.event_datetime + (st.event_datetime.length <= 16 ? ':00' : '') + '+09:00') : null;
    if(when && !isNaN(when) && window.nydSetCountdownTarget) window.nydSetCountdownTarget(when.getTime());
    var targetMs = (when && !isNaN(when)) ? when.getTime() : new Date('2026-09-17T17:30:00+09:00').getTime();
    var card = document.getElementById('countdownCard');
    var feature = document.getElementById('countdownFeature');
    if(st.countdown_enabled === 'off'){
      if(card) card.style.display = 'none';
      if(feature) feature.style.display = 'none';
      return;
    }
    if(Date.now() > targetMs){
      var msg = st.countdown_done_text || '성황리에 마무리되었습니다. 함께해 주셔서 감사합니다.';
      var lbl = document.querySelector('[data-edit="countdown_label"]');
      if(lbl) lbl.innerHTML = rich(st.countdown_done_label || '창립총회 개최 완료');
      [document.getElementById('countdownHero'), feature].forEach(function(g){
        if(!g) return;
        var p = document.createElement('p');
        p.className = 'cd-done';
        p.innerHTML = rich(msg);
        g.replaceWith(p);
      });
    }
  }

  /* ---------- 3. 조직도 ---------- */
  function renderOrg(units){
    if(!units || !units.length) return;
    var leaders = units.filter(function(u){ return u.section === 'leader'; });
    var branches = units.filter(function(u){ return u.section === 'branch'; });
    var committees = units.filter(function(u){ return u.section === 'committee'; });

    var box = document.getElementById('orgLeaders');
    if(box && leaders.length){
      var tiers = {};
      leaders.forEach(function(u){ (tiers[u.tier] = tiers[u.tier] || []).push(u); });
      box.innerHTML = Object.keys(tiers).sort(function(a,b){ return a - b; }).map(function(t, i){
        return '<div class="leader-tier reveal" style="--i:' + (i+1) + '">' + tiers[t].map(function(u){
          var cls = 'leader-card' + (u.featured ? ' featured' : '') + (u.wide ? ' wide' : '');
          return '<div class="' + cls + '"><span class="lc-role">' + esc(u.title) + '</span><span class="lc-name">' + esc(u.members || u.leader || '') + '</span></div>';
        }).join('') + '</div>';
      }).join('');
    }
    function cards(list){
      return list.map(function(u){
        var names = splitNames(u.members);
        var chips = names.length ? names.map(function(n){ return '<span class="member-chip">' + esc(n) + '</span>'; }).join('')
                                 : '<span class="member-chip muted">회원 명단 준비 중</span>';
        return '<details class="org-card"><summary><span class="oc-title"><b>' + esc(u.title) + '</b><i>' + esc(u.leader || '') + '</i></span>' +
               '<span class="oc-meta">' + (names.length ? names.length + '명' : '-') + ' ' + chevron + '</span></summary>' +
               '<div class="org-members">' + chips + '</div></details>';
      }).join('');
    }
    var b = document.getElementById('orgBranches'), c = document.getElementById('orgCommittees');
    if(b && branches.length) b.innerHTML = cards(branches);
    if(c && committees.length) c.innerHTML = cards(committees);
    N.observeReveal(document.getElementById('orgchart'));
  }

  /* ---------- 4. 사진첩 미리보기 ---------- */
  function renderAlbums(albums){
    var grid = document.getElementById('galleryGrid');
    if(!grid || !albums || !albums.length) return;
    grid.innerHTML = albums.slice(0, 6).map(function(a){
      var cover = N.safeUrl(a.cover_url);
      var style = cover ? ' style="background-image:url(&quot;' + esc(cover) + '&quot;)"' : '';
      return '<a class="gallery-tile ' + (cover ? 'photo' : 'g1') + '" href="gallery.html?album=' + encodeURIComponent(a.id) + '"' + style + '>' +
             '<span>' + esc(a.title) + (a.event_date ? '<small>' + N.formatDate(a.event_date) + '</small>' : '') + '</span></a>';
    }).join('');
  }

  /* ---------- 불러오기 ---------- */
  var popupDone = false;
  function popupOnce(st){
    if(popupDone) return; popupDone = true;
    if(st && st.popup_enabled === 'off') return;
    if(window.nydMaybeOpenPopup) window.nydMaybeOpenPopup();
  }
  // 연결이 느리거나 실패해도 원래 팝업은 뜨도록 안전장치
  var fallbackTimer = setTimeout(function(){ popupOnce(null); setupCountdown({}); }, 2500);

  if(!N.sbRead){ clearTimeout(fallbackTimer); popupOnce(null); setupCountdown({}); return; }

  N.sbRead.from('site_settings').select('key,value').then(function(res){
    var st = {};
    if(!res.error && res.data){ res.data.forEach(function(r){ st[r.key] = r.value; }); }
    clearTimeout(fallbackTimer);
    applySettings(st);
    setupCountdown(st);
    popupOnce(st);
  }, function(){ clearTimeout(fallbackTimer); setupCountdown({}); popupOnce(null); });

  N.sbRead.from('org_units').select('*').order('sort', {ascending:true}).then(function(res){
    if(!res.error) renderOrg(res.data);
  });
  N.sbRead.from('albums').select('id,title,event_date,cover_url,created_at')
    .order('event_date', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false}).limit(6)
    .then(function(res){ if(!res.error) renderAlbums(res.data); });
})();
