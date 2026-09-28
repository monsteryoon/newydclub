/* 뉴영덕연합회 홈페이지 관리자 */
(function(){
  var N = window.NYD, sb = N.sb, esc = N.escapeHtml;
  var $ = function(id){ return document.getElementById(id); };

  /* ================= 공통 도우미 ================= */
  var toastTimer;
  function toast(msg, isErr){
    var t = $('toast');
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.className = 'toast' + (isErr ? ' err' : ''); }, isErr ? 6000 : 2600);
  }
  function errText(e){
    var m = (e && (e.message || e.error_description || e.error)) || String(e);
    if(/row-level security|permission denied|42501|Unauthorized|403/i.test(m)) return '권한이 없습니다. 관리자 계정인지, 초기 설정(SQL)을 실행했는지 확인해주세요.';
    if(/does not exist|PGRST205|42P01|schema cache/i.test(m)) return '저장 공간이 아직 없습니다. 초기 설정(SQL)을 먼저 실행해주세요.';
    if(/Failed to fetch|NetworkError/i.test(m)) return '인터넷 연결을 확인해주세요.';
    return m;
  }
  function fail(e){ console.error(e); toast('실패: ' + errText(e), true); }
  async function must(promise){
    var r = await promise;
    if(r && r.error) throw r.error;
    return r ? r.data : null;
  }
  async function ensureSession(){
    var r = await sb.auth.getSession();
    if(r.data && r.data.session) return true;
    toast('로그인이 만료되었습니다. 다시 로그인해주세요.', true);
    showLogin();
    return false;
  }
  function storagePath(url){
    var m = String(url || '').match(/\/site-media\/(.+)$/);
    return m ? decodeURIComponent(m[1].split('?')[0]) : null;
  }
  function removeFiles(urls){
    var paths = urls.map(storagePath).filter(Boolean);
    if(paths.length) sb.storage.from('site-media').remove(paths).then(function(){}, function(){});
  }
  function pickFiles(input, cb){
    input.addEventListener('change', function(){
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if(files.length) cb(files);
    });
  }

  /* ================= 저장 막대 (메인·조직도·회원 공용) ================= */
  var dirty = { home: false, org: false, members: false };
  var currentTab = 'home';
  var saveHandlers = {}, discardHandlers = {};
  function setDirty(tab, on, text){
    dirty[tab] = on;
    if(tab === currentTab) refreshSavebar(text);
  }
  function refreshSavebar(text){
    var on = !!dirty[currentTab];
    $('savebar').classList.toggle('show', on);
    if(text) $('savebarText').textContent = text;
    else if(on) $('savebarText').textContent = '저장하지 않은 변경사항이 있습니다';
  }
  $('saveBtn').addEventListener('click', async function(){
    var h = saveHandlers[currentTab]; if(!h) return;
    var btn = this; btn.disabled = true; btn.textContent = '저장 중…';
    try{ await h(); }catch(e){ fail(e); }
    btn.disabled = false; btn.textContent = '저장';
  });
  $('discardBtn').addEventListener('click', function(){
    if(!confirm('고친 내용을 저장하지 않고 되돌릴까요?')) return;
    var h = discardHandlers[currentTab]; if(h) h();
  });
  window.addEventListener('beforeunload', function(e){
    if(dirty.home || dirty.org || dirty.members){ e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= 탭 ================= */
  var loaded = {};
  var loaders = {};
  document.querySelectorAll('.admin-tabs button').forEach(function(b){
    b.addEventListener('click', function(){ openTab(b.dataset.tab); });
  });
  function openTab(tab){
    currentTab = tab;
    document.querySelectorAll('.admin-tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === tab); });
    document.querySelectorAll('[data-panel]').forEach(function(p){ p.style.display = p.dataset.panel === tab ? '' : 'none'; });
    refreshSavebar();
    if(!loaded[tab] && loaders[tab]){ loaded[tab] = true; loaders[tab](); }
    else if(tab === 'home' && albumsChanged && !dirty.home){ albumsChanged = false; loaders.home(); } // 새 사진첩을 연결 목록에 반영
    try{ history.replaceState(null, '', '#' + tab); }catch(e){}
    window.scrollTo(0, 0);
  }

  /* ================= 로그인 ================= */
  function showLogin(){ $('loginView').style.display = ''; $('adminView').style.display = 'none'; }
  var started = false;
  async function showAdmin(){
    $('loginView').style.display = 'none'; $('adminView').style.display = '';
    if(started) return; started = true;
    // 초기 설정 여부 / 관리자 여부 확인
    var chk = await sb.from('site_settings').select('key').limit(1);
    if(chk.error && /does not exist|PGRST205|42P01|schema cache/i.test(chk.error.message || chk.error.code || '')) $('setupWarning').style.display = '';
    else {
      var adm = await sb.rpc('is_site_admin');
      if(!adm.error && adm.data === false) $('notAdminWarning').style.display = '';
    }
    var t = (location.hash || '').replace('#', '');
    openTab(['home','albums','board','org','members'].indexOf(t) >= 0 ? t : 'home');
  }
  if(!sb){ document.body.innerHTML = '<p class="state-msg" style="margin:40px;">관리자 기능을 불러올 수 없습니다. 인터넷 연결을 확인해주세요.</p>'; return; }
  $('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var err = $('loginError'); err.style.display = 'none';
    var r = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    if(r.error){ err.textContent = '로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.'; err.style.display = 'block'; return; }
    $('loginPassword').value = '';
    showAdmin();
  });
  $('logoutBtn').addEventListener('click', async function(){
    if((dirty.home || dirty.org || dirty.members) && !confirm('저장하지 않은 변경사항이 있습니다. 그래도 로그아웃할까요?')) return;
    await sb.auth.signOut(); location.reload();
  });
  sb.auth.getSession().then(function(r){ if(r.data && r.data.session) showAdmin(); else showLogin(); });

  /* ======================================================================
     1. 메인 화면 문구·사진
     ====================================================================== */
  var homeDefaults = {}, homeSaved = {}, homeValues = {}, homeDoc = null, homeFields = {}, albumsCache = null;

  function htmlToText(el){
    var html = el.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?em[^>]*>/gi, '*')
      .replace(/<\/?(b|strong)[^>]*>/gi, '**')
      .replace(/<[^>]+>/g, '');
    var ta = document.createElement('textarea'); ta.innerHTML = html;
    return ta.value.split('\n').map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).join('\n').trim();
  }
  function bgUrl(el){
    var m = (el.getAttribute('style') || '').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    return m ? m[1] : '';
  }
  async function fetchHomeDoc(){
    if(homeDoc) return homeDoc;
    var res = await fetch('index.html', { cache: 'no-store' });
    homeDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return homeDoc;
  }
  async function getAlbums(){
    if(albumsCache) return albumsCache;
    var r = await sb.from('albums').select('id,title,event_date,cover_url').order('event_date', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false});
    albumsCache = r.error ? [] : (r.data || []);
    return albumsCache;
  }

  /* ---- 연결(링크) 고르기 ---- */
  var LINK_OPTIONS = [
    ['#founding','메인 화면 · 행사 안내'], ['#message','메인 화면 · 회장 인사말'], ['#orgchart','메인 화면 · 조직도'],
    ['#activities','메인 화면 · 활동 계획'], ['#gallery','메인 화면 · 사진첩 미리보기'], ['#contact','메인 화면 · 문의'],
    ['gallery.html','사진첩 페이지 (전체)'], ['board.html','게시판'], ['notice.html','공지사항'], ['members.html','회원검색']
  ];
  function linkChoices(noneLabel){
    var opts = noneLabel ? [['', noneLabel]] : [];
    opts = opts.concat(LINK_OPTIONS);
    (albumsCache || []).forEach(function(a){ opts.push(['gallery.html?album=' + a.id, '사진첩 · ' + a.title]); });
    return opts;
  }
  function linkFieldHtml(attr, value, noneLabel){
    value = value == null ? '' : String(value);
    var opts = linkChoices(noneLabel), known = opts.some(function(o){ return o[0] === value; });
    var custom = !known && value !== '';
    return '<div class="link-field" ' + attr + '><select class="admin-input">' +
      opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (!custom && o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '<option value="__custom"' + (custom ? ' selected' : '') + '>직접 주소 입력…</option></select>' +
      '<input class="admin-input" type="text" placeholder="https:// 로 시작하는 주소" value="' + (custom ? esc(value) : '') + '"' + (custom ? '' : ' style="display:none;"') + '></div>';
  }
  function readLinkField(box){
    var sel = box.querySelector('select'), inp = box.querySelector('input');
    var isCustom = sel.value === '__custom';
    inp.style.display = isCustom ? '' : 'none';
    return isCustom ? inp.value.trim() : sel.value;
  }

  /* ---- 사진 고르기 창 (사진첩에서) ---- */
  function pickPhoto(){
    return new Promise(async function(resolve){
      var wrap = document.createElement('div');
      wrap.className = 'modal-overlay picker open';
      wrap.innerHTML = '<div class="modal-card"><div class="modal-head"><span><span class="badge-dot"></span>사진첩에서 사진 고르기</span><button type="button" data-x aria-label="닫기">×</button></div><div class="modal-body"><p class="hint">불러오는 중…</p></div></div>';
      document.body.appendChild(wrap);
      var body = wrap.querySelector('.modal-body');
      function done(v){ wrap.remove(); resolve(v); }
      wrap.addEventListener('click', function(e){ if(e.target === wrap || e.target.closest('[data-x]')) done(null); });
      async function showAlbums(){
        var albums = await getAlbums();
        if(!albums.length){ body.innerHTML = '<p class="state-msg">아직 사진첩이 없습니다. "행사 사진첩" 메뉴에서 먼저 사진을 올려주세요.</p>'; return; }
        body.innerHTML = '<p class="hint" style="margin:0 0 12px;">사진첩을 고르세요</p><div class="picker-grid">' + albums.map(function(a){
          return '<button type="button" data-a="' + a.id + '"><span class="ph" style="background-image:url(&quot;' + esc(a.cover_url || '') + '&quot;)"></span><span class="cap">' + esc(a.title) + '</span></button>';
        }).join('') + '</div>';
        body.querySelectorAll('[data-a]').forEach(function(b){ b.onclick = function(){ showPhotos(b.dataset.a, b.querySelector('.cap').textContent); }; });
      }
      async function showPhotos(id, title){
        body.innerHTML = '<p class="hint">불러오는 중…</p>';
        var r = await sb.from('album_photos').select('url').eq('album_id', id).order('sort', {ascending:true});
        var ph = r.error ? [] : r.data || [];
        body.innerHTML = '<div class="row" style="margin-bottom:12px;"><button type="button" class="btn-mini" data-back>← 사진첩 목록</button><b>' + esc(title) + '</b></div>' +
          (ph.length ? '<div class="picker-grid">' + ph.map(function(p){ return '<button type="button" data-u="' + esc(p.url) + '"><span class="ph" style="background-image:url(&quot;' + esc(p.url) + '&quot;)"></span></button>'; }).join('') + '</div>' : '<p class="state-msg">사진이 없습니다.</p>');
        body.querySelector('[data-back]').onclick = showAlbums;
        body.querySelectorAll('[data-u]').forEach(function(b){ b.onclick = function(){ done(b.dataset.u); }; });
      }
      showAlbums();
    });
  }

  // 화면에 직접 보이지 않는 설정들 (그룹별로 끼워 넣음, first:true 는 그룹 맨 위)
  function extraFields(doc){
    var marquee = Array.prototype.map.call(doc.querySelectorAll('#marqueeTrack .marquee-item'), function(x){ return x.textContent.trim(); });
    var uniq = marquee.slice(0, Math.max(1, marquee.length / 2));
    var progress = Array.prototype.map.call(doc.querySelectorAll('#progressList .progress-item'), function(it){
      return { status: it.classList.contains('active') ? 'active' : it.classList.contains('upcoming') ? 'upcoming' : 'done',
               label: it.querySelector('.st').textContent.trim(), title: it.querySelector('h3').textContent.trim(), desc: htmlToText(it.querySelector('p')) };
    });
    var iframe = doc.getElementById('songFrame');
    var songId = iframe ? N.youtubeId(iframe.getAttribute('src')) : '';
    var heroPhotos = Array.prototype.map.call(doc.querySelectorAll('#heroBg .hero-bg-slide'), function(el){ return { img: bgUrl(el) }; });
    var heroBtn = doc.querySelector('[data-edit="hero_button"]');
    var contactLines = [];
    doc.querySelectorAll('#contact .contact-row').forEach(function(r){
      var b = r.querySelector('b'), p = r.querySelector('p');
      if(b && p && !/창립총회/.test(b.textContent) && (b.textContent.trim() || p.textContent.trim())) contactLines.push({ label:b.textContent.trim(), text:p.textContent.trim() });
    });
    var onOff = [['on','사용'],['off','사용 안 함']];
    var extras = {
      '① 첫 화면': [
        { key:'hero_photos', label:'배경 사진 (여러 장이면 차례로 바뀝니다)', type:'list', first:true, grid:true, addUpload:true, addPick:true,
          item:[{ name:'img', type:'image' }], def: JSON.stringify(heroPhotos) },
        { key:'hero_slide_seconds', label:'사진이 바뀌는 간격', type:'select', first:true, options:[['4','4초'],['6','6초'],['8','8초'],['10','10초']], def:'6' },
        { key:'hero_button_enabled', label:'주 버튼', type:'select', options:onOff, def:'on' },
        { key:'hero_button_link', label:'주 버튼을 누르면 이동할 곳', type:'link', def: heroBtn ? heroBtn.getAttribute('href') : '#founding' }
      ],
      '② 행사 카운트다운': [
        { key:'event_datetime', label:'행사 일시 (카운트다운 기준)', type:'datetime', def:'2026-09-17T17:30' },
        { key:'countdown_enabled', label:'카운트다운 표시', type:'select', options:[['on','보이기'],['off','숨기기']], def:'on' },
        { key:'countdown_done_label', label:'행사가 끝난 뒤 제목', type:'text', def:'창립총회 개최 완료' },
        { key:'countdown_done_text', label:'행사가 끝난 뒤 보일 문구', type:'text', def:'성황리에 마무리되었습니다. 함께해 주셔서 감사합니다.' }
      ],
      '③ 공지 띠 · 팝업': [
        { key:'marquee_items', label:'흐르는 띠 문구 (한 줄에 하나씩)', type:'textarea', def: uniq.join('\n') },
        { key:'popup_enabled', label:'첫 화면 팝업', type:'select', options:[['on','켜기'],['off','끄기']], def:'on' },
        { key:'popup_title', label:'팝업 제목', type:'text', def:'창립총회 초대장' },
        { key:'popup_image', label:'팝업 이미지 (초대장·포스터)', type:'image', def:'images/invite.png' }
      ],
      '⑦ 행사 안내 (창립총회)': [
        { key:'founding_enabled', label:'행사 안내 칸', type:'select', first:true, options:[['on','사용 (행사가 있을 때)'],['off','사용 안 함 (숨기기)']], def:'on' }
      ],
      '⑧ 추진 경과 제목': [
        { key:'progress_items', label:'추진 경과 단계', type:'list', addLabel:'+ 단계 추가', newItem:{ status:'upcoming', label:'예정', title:'', desc:'' },
          item:[{ name:'status', type:'select', options:[['done','완료 (파란 점)'],['active','진행 중 (빨간 점)'],['upcoming','예정 (빈 점)']] },
                { name:'label', type:'text', ph:'작은 표시 (예: 완료, 2026.09.17)' }, { name:'title', type:'text', ph:'단계 제목' }, { name:'desc', type:'textarea', ph:'설명' }],
          def: JSON.stringify(progress) }
      ],
      '⑨ 활동 계획': [1,2,3,4,5,6].map(function(n){ return { key:'activity_' + n + '_album', label:'활동 ' + n + ' 사진첩 연결 (고르면 카드에 "사진 보기"가 생깁니다)', type:'album', def:'' }; }),
      '⑩ 사진첩 소개': [
        { key:'gallery_mode', label:'메인 화면 사진 구성', type:'select', options:[['auto','자동 — 최근 사진첩 6개'],['manual','직접 구성 — 아래 사진들']], def:'auto' },
        { key:'gallery_tiles', label:'직접 구성할 사진 (첫 번째 사진이 크게 보입니다)', type:'list', addLabel:'+ 사진 칸 추가', newItem:{ img:'', title:'', link:'gallery.html' },
          item:[{ name:'img', type:'image' }, { name:'title', type:'text', ph:'사진 제목 (예: 창립총회)' }, { name:'link', type:'link', label:'누르면 이동할 곳' }], def:'[]' }
      ],
      '⑪ 테마곡': [
        { key:'song_url', label:'유튜브 주소 (비우면 테마곡 칸 숨김)', type:'text', def: songId ? 'https://www.youtube.com/watch?v=' + songId : '' }
      ],
      '⑫ 문의': [
        { key:'cta_popup_enabled', label:'맨 아래 버튼을 누르면', type:'select', options:[['on','작은 문의 팝업 띄우기'],['off','문의 칸으로 이동']], def:'on' },
        { key:'cta_popup_title', label:'문의 팝업 제목', type:'text', def:'가입 · 참석 문의' },
        { key:'cta_popup_intro', label:'문의 팝업 안내 문구 (선택)', type:'textarea', def:'' },
        { key:'cta_popup_lines', label:'문의 팝업 내용 (전화번호·이메일은 누르면 바로 연결됩니다)', type:'list', addLabel:'+ 줄 추가', newItem:{ label:'', text:'' },
          item:[{ name:'label', type:'text', ph:'항목 (예: 전화, 카카오톡, 이메일)' }, { name:'text', type:'text', ph:'내용 (예: 010-1234-5678)' }], def: JSON.stringify(contactLines) }
      ]
    };
    return extras;
  }

  loaders.home = async function(){
    var box = $('homeFields');
    try{
      var doc = await fetchHomeDoc();
      await getAlbums();
      var groups = {}, order = [];
      homeFields = {};
      function add(group, f){
        if(!groups[group]){ groups[group] = []; order.push(group); }
        if(f.first){ var k = 0; while(k < groups[group].length && groups[group][k].first) k++; groups[group].splice(k, 0, f); }
        else groups[group].push(f);
        homeDefaults[f.key] = f.def; homeFields[f.key] = f;
      }
      doc.querySelectorAll('[data-edit], [data-edit-bg]').forEach(function(el){
        var isBg = el.hasAttribute('data-edit-bg');
        var key = el.getAttribute(isBg ? 'data-edit-bg' : 'data-edit');
        var def;
        if(isBg) def = bgUrl(el);
        else if(el.getAttribute('data-edit-mode') === 'paras') def = Array.prototype.map.call(el.querySelectorAll('p'), htmlToText).join('\n\n');
        else def = htmlToText(el);
        add(el.getAttribute('data-edit-group') || '기타', { key:key, label:el.getAttribute('data-edit-label') || key, type: isBg ? 'image' : (def.length > 50 || def.indexOf('\n') >= 0 || el.getAttribute('data-edit-mode') ? 'textarea' : 'text'), def:def });
      });
      var extras = extraFields(doc);
      Object.keys(extras).forEach(function(g){ extras[g].forEach(function(f){ add(g, f); }); });
      order.sort(function(a, b){ return a.localeCompare(b, 'ko'); });

      var rows = await sb.from('site_settings').select('key,value');
      homeSaved = {};
      if(!rows.error) (rows.data || []).forEach(function(r){ homeSaved[r.key] = r.value; });
      // 예전 방식(배경 사진 1~3)으로 저장된 값이 있으면 목록으로 옮겨 보여줌
      if(!homeSaved.hero_photos && (homeSaved.hero_photo_1 || homeSaved.hero_photo_2 || homeSaved.hero_photo_3)){
        var hp = N.parseList(homeDefaults.hero_photos);
        [1,2,3].forEach(function(n){ if(homeSaved['hero_photo_' + n] && hp[n-1]) hp[n-1].img = homeSaved['hero_photo_' + n]; });
        homeDefaults.hero_photos = JSON.stringify(hp);
      }
      homeValues = {};
      Object.keys(homeDefaults).forEach(function(k){ homeValues[k] = (k in homeSaved && homeSaved[k] != null) ? homeSaved[k] : homeDefaults[k]; });

      box.innerHTML = order.map(function(g, gi){
        return '<details class="panel"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g) + '<span class="hint" style="margin:0;">' + groups[g].length + '개 항목</span></summary>' +
          groups[g].map(fieldHtml).join('') + '</details>';
      }).join('');
      Object.keys(homeFields).forEach(function(k){ if(homeFields[k].type === 'list') renderList(k); });
      if(!box.dataset.bound){ box.dataset.bound = '1'; bindHomeFields(box); }
    }catch(e){ box.innerHTML = '<p class="state-msg">불러오지 못했습니다: ' + esc(errText(e)) + '</p>'; }
  };

  function fieldHtml(f){
    var v = homeValues[f.key] == null ? '' : homeValues[f.key];
    var id = 'f_' + f.key;
    var head = '<span>' + esc(f.label) + '</span>';
    if(f.type === 'image'){
      return '<div class="field" data-key="' + f.key + '">' + head + '<div class="img-field"><div class="thumb" id="' + id + '_t" style="background-image:url(&quot;' + esc(v) + '&quot;)"></div>' +
        '<label class="btn btn-line btn-sm" style="cursor:pointer;">사진 올리기<input type="file" accept="image/*" hidden data-img-key="' + f.key + '"></label>' +
        '<button type="button" class="btn btn-line btn-sm" data-img-pick="' + f.key + '">사진첩에서 고르기</button>' +
        '<button type="button" class="btn-mini" data-reset="' + f.key + '">원래 사진으로</button></div></div>';
    }
    if(f.type === 'select' || f.type === 'album'){
      var opts = f.type === 'album' ? [['', '연결 안 함']].concat((albumsCache || []).map(function(a){ return [a.id, a.title + (a.event_date ? ' (' + N.formatDate(a.event_date) + ')' : '')]; })) : f.options;
      return '<label class="field" data-key="' + f.key + '">' + head + '<select id="' + id + '" data-k="' + f.key + '">' +
        opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    }
    if(f.type === 'link'){
      return '<div class="field" data-key="' + f.key + '">' + head + linkFieldHtml('data-lk="' + f.key + '"', v) + '</div>';
    }
    if(f.type === 'datetime'){
      return '<label class="field" data-key="' + f.key + '">' + head + '<input type="datetime-local" id="' + id + '" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
    }
    if(f.type === 'list'){
      var acts = '';
      if(f.addUpload) acts += '<label class="btn btn-line btn-sm" style="cursor:pointer;">+ 사진 올리기 (여러 장)<input type="file" accept="image/*" multiple hidden data-list-upload="' + f.key + '"></label>';
      if(f.addPick) acts += '<button type="button" class="btn btn-line btn-sm" data-list-pick="' + f.key + '">+ 사진첩에서 고르기</button>';
      if(f.addLabel) acts += '<button type="button" class="btn btn-line btn-sm" data-list-add="' + f.key + '">' + esc(f.addLabel) + '</button>';
      return '<div class="field" data-key="' + f.key + '">' + head + '<div id="le_' + f.key + '" data-list="' + f.key + '"' + (f.grid ? ' class="le-photos"' : '') + '></div><div class="row" style="margin-top:10px;">' + acts + '</div></div>';
    }
    if(f.type === 'textarea'){
      var rows = Math.min(10, Math.max(2, Math.ceil(String(v).length / 60) + (String(v).match(/\n/g) || []).length));
      return '<label class="field" data-key="' + f.key + '">' + head + '<textarea id="' + id + '" data-k="' + f.key + '" rows="' + rows + '">' + esc(v) + '</textarea></label>';
    }
    return '<label class="field" data-key="' + f.key + '">' + head + '<input type="text" id="' + id + '" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
  }

  /* ---- 목록 편집기 (배경 사진, 추진 경과, 사진 칸, 문의 팝업 줄) ---- */
  function getList(key){ return N.parseList(homeValues[key]); }
  function setList(key, l, rerender){ homeValues[key] = JSON.stringify(l); if(rerender) renderList(key); markHome(); }
  function renderList(key){
    var f = homeFields[key], box = $('le_' + key); if(!f || !box) return;
    var l = getList(key);
    var acts = '<div class="le-acts"><span class="row" style="gap:4px;"><button type="button" class="btn-mini" data-la="up" title="앞으로">▲</button><button type="button" class="btn-mini" data-la="down" title="뒤로">▼</button></span><button type="button" class="btn-mini danger" data-la="del">삭제</button></div>';
    if(!l.length){ box.innerHTML = '<p class="hint" style="grid-column:1/-1;">비어 있습니다.' + (key === 'gallery_tiles' ? ' 비어 있으면 최근 사진첩이 자동으로 보입니다.' : '') + '</p>'; return; }
    box.innerHTML = l.map(function(it, i){
      var inner = f.item.map(function(sf){
        var v = it[sf.name] == null ? '' : it[sf.name];
        if(sf.type === 'image'){
          var up = '<label class="btn-mini" style="cursor:pointer;">올리기<input type="file" accept="image/*" hidden data-lup="' + i + '"></label><button type="button" class="btn-mini" data-la="pick">사진첩에서</button>';
          return f.grid ? '<div class="thumb" style="background-image:url(&quot;' + esc(v) + '&quot;)"></div>'
                        : '<div class="le-img"><div class="thumb" style="background-image:url(&quot;' + esc(v) + '&quot;)"></div>' + up + '</div>';
        }
        if(sf.type === 'select') return '<div class="row"><select class="admin-input" data-lf="' + sf.name + '">' + sf.options.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
        if(sf.type === 'textarea') return '<div class="row"><textarea class="admin-input" data-lf="' + sf.name + '" rows="2" placeholder="' + esc(sf.ph || '') + '">' + esc(v) + '</textarea></div>';
        if(sf.type === 'link') return '<div class="row"><span class="hint" style="margin:0;">' + esc(sf.label || '연결') + '</span></div><div class="row">' + linkFieldHtml('data-llink="' + sf.name + '"', v) + '</div>';
        return '<div class="row"><input class="admin-input grow" type="text" data-lf="' + sf.name + '" placeholder="' + esc(sf.ph || '') + '" value="' + esc(v) + '"></div>';
      }).join('');
      return '<div class="le-item" data-i="' + i + '">' + inner + acts + '</div>';
    }).join('');
  }
  async function uploadInto(key, files, index){
    if(!(await ensureSession())) return;
    toast('사진 올리는 중… (' + files.length + '장)');
    try{
      for(var k = 0; k < files.length; k++){
        var url = await N.uploadFile(files[k], 'site');
        var l = getList(key);
        if(index != null) l[index].img = url; else l.push(Object.assign({}, homeFields[key].newItem || {}, { img:url }));
        setList(key, l, true);
      }
      toast('사진이 준비됐습니다. 저장을 눌러 반영하세요.');
    }catch(e){ fail(e); }
  }

  function homeChangedKeys(){
    return Object.keys(homeValues).filter(function(k){
      var base = (k in homeSaved && homeSaved[k] != null) ? homeSaved[k] : homeDefaults[k];
      return String(homeValues[k] == null ? '' : homeValues[k]) !== String(base == null ? '' : base);
    });
  }
  function markHome(){
    var keys = homeChangedKeys();
    document.querySelectorAll('#homeFields .field').forEach(function(f){ f.classList.toggle('changed', keys.indexOf(f.dataset.key) >= 0); });
    setDirty('home', keys.length > 0, keys.length ? '고친 항목 ' + keys.length + '개 — 저장해야 홈페이지에 반영됩니다' : '');
  }

  function bindHomeFields(box){
    function onEdit(e){
      var t = e.target;
      if(t.dataset && t.dataset.k){ homeValues[t.dataset.k] = t.value; markHome(); return; }
      var lk = t.closest('[data-lk]');
      if(lk){ homeValues[lk.dataset.lk] = readLinkField(lk); markHome(); return; }
      var list = t.closest('[data-list]'), item = t.closest('[data-i]');
      if(list && item){
        var key = list.dataset.list, l = getList(key), i = +item.dataset.i;
        var ll = t.closest('[data-llink]');
        if(ll) l[i][ll.dataset.llink] = readLinkField(ll);
        else if(t.dataset.lf) l[i][t.dataset.lf] = t.value;
        else return;
        setList(key, l, false);
      }
    }
    box.addEventListener('input', onEdit);
    box.addEventListener('change', async function(e){
      var t = e.target;
      if(t.type === 'file'){
        var files = Array.prototype.slice.call(t.files || []); t.value = '';
        if(!files.length) return;
        if(t.dataset.imgKey){
          var key = t.dataset.imgKey;
          if(!(await ensureSession())) return;
          toast('사진 올리는 중…');
          try{ var url = await N.uploadFile(files[0], 'site'); homeValues[key] = url; $('f_' + key + '_t').style.backgroundImage = 'url("' + url + '")'; markHome(); toast('사진이 준비됐습니다. 저장을 눌러 반영하세요.'); }catch(err){ fail(err); }
        } else if(t.dataset.listUpload){ uploadInto(t.dataset.listUpload, files, null); }
        else if(t.dataset.lup != null){ uploadInto(t.closest('[data-list]').dataset.list, files.slice(0, 1), +t.dataset.lup); }
        return;
      }
      onEdit(e);
    });
    box.addEventListener('click', async function(e){
      var b = e.target.closest('button'); if(!b) return;
      if(b.dataset.reset){
        var key = b.dataset.reset; homeValues[key] = homeDefaults[key];
        $('f_' + key + '_t').style.backgroundImage = 'url("' + homeDefaults[key] + '")'; markHome(); return;
      }
      if(b.dataset.imgPick){
        var u = await pickPhoto(); if(!u) return;
        homeValues[b.dataset.imgPick] = u; $('f_' + b.dataset.imgPick + '_t').style.backgroundImage = 'url("' + u + '")'; markHome(); return;
      }
      if(b.dataset.listAdd){
        var f = homeFields[b.dataset.listAdd], l0 = getList(f.key);
        l0.push(JSON.parse(JSON.stringify(f.newItem || {}))); setList(f.key, l0, true); return;
      }
      if(b.dataset.listPick){
        var pu = await pickPhoto(); if(!pu) return;
        var lp = getList(b.dataset.listPick); lp.push(Object.assign({}, homeFields[b.dataset.listPick].newItem || {}, { img:pu })); setList(b.dataset.listPick, lp, true); return;
      }
      if(b.dataset.la){
        var listEl = b.closest('[data-list]'), key2 = listEl.dataset.list, i = +b.closest('[data-i]').dataset.i, l = getList(key2);
        if(b.dataset.la === 'del'){ if(!confirm('삭제할까요?')) return; l.splice(i, 1); }
        else if(b.dataset.la === 'pick'){ var pk = await pickPhoto(); if(!pk) return; l[i].img = pk; }
        else { var j = b.dataset.la === 'up' ? i - 1 : i + 1; if(j < 0 || j >= l.length) return; var tmp = l[i]; l[i] = l[j]; l[j] = tmp; }
        setList(key2, l, true);
      }
    });
  }

  saveHandlers.home = async function(){
    var keys = homeChangedKeys(); if(!keys.length) return;
    if(!(await ensureSession())) return;
    var now = new Date().toISOString();
    await must(sb.from('site_settings').upsert(keys.map(function(k){ return { key:k, value:homeValues[k], updated_at:now }; }), { onConflict:'key' }));
    keys.forEach(function(k){ homeSaved[k] = homeValues[k]; });
    markHome();
    toast('저장했습니다. 홈페이지에 반영되었습니다.');
  };
  discardHandlers.home = function(){ $('homeFields').innerHTML = '<p class="state-msg">불러오는 중…</p>'; setDirty('home', false); loaders.home(); };


  /* ======================================================================
     2. 행사 사진첩
     ====================================================================== */
  var albums = [], curAlbum = null, curPhotos = [];

  loaders.albums = loadAlbums;
  var albumsChanged = false;
  async function loadAlbums(){
    albumsCache = null; albumsChanged = true;
    var box = $('albumList');
    try{
      albums = await must(sb.from('albums').select('*').order('event_date', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false}));
      var counts = {};
      var ph = await sb.from('album_photos').select('album_id');
      if(!ph.error) (ph.data || []).forEach(function(p){ counts[p.album_id] = (counts[p.album_id] || 0) + 1; });
      if(!albums.length){ box.innerHTML = '<p class="state-msg">아직 사진첩이 없습니다. 위의 "새 사진첩 만들기"를 눌러 시작하세요.</p>'; return; }
      box.innerHTML = albums.map(function(a){
        return '<div class="list-item"><div class="thumb" style="background-image:url(&quot;' + esc(a.cover_url || '') + '&quot;)"></div>' +
          '<div class="txt"><b>' + esc(a.title) + '</b><span>' + (a.event_date ? N.formatDate(a.event_date) + ' · ' : '') + '사진 ' + (counts[a.id] || 0) + '장</span></div>' +
          '<div class="acts"><button class="btn btn-line btn-sm" data-edit-album="' + a.id + '">사진 올리기·편집</button></div></div>';
      }).join('');
    }catch(e){ box.innerHTML = '<p class="state-msg">' + esc(errText(e)) + '</p>'; }
  }
  $('albumList').addEventListener('click', function(e){
    var b = e.target.closest('[data-edit-album]'); if(b) openAlbum(b.dataset.editAlbum);
  });
  $('newAlbumBtn').addEventListener('click', function(){ $('newAlbumForm').style.display = ''; $('newAlbumTitle').focus(); });
  $('cancelAlbumBtn').addEventListener('click', function(){ $('newAlbumForm').style.display = 'none'; });
  $('createAlbumBtn').addEventListener('click', async function(){
    var title = $('newAlbumTitle').value.trim();
    if(!title){ toast('행사 이름을 입력해주세요.', true); return; }
    if(!(await ensureSession())) return;
    try{
      var row = await must(sb.from('albums').insert({ title:title, event_date: $('newAlbumDate').value || null }).select().single());
      $('newAlbumTitle').value = ''; $('newAlbumDate').value = ''; $('newAlbumForm').style.display = 'none';
      toast('사진첩을 만들었습니다. 이제 사진을 올려주세요.');
      await loadAlbums();
      openAlbum(row.id);
    }catch(e){ fail(e); }
  });

  async function openAlbum(id){
    try{
      curAlbum = await must(sb.from('albums').select('*').eq('id', id).single());
      $('albumListPanel').style.display = 'none'; $('albumEditPanel').style.display = '';
      $('albumTitleInput').value = curAlbum.title || '';
      $('albumDateInput').value = curAlbum.event_date || '';
      $('albumDescInput').value = curAlbum.description || '';
      $('albumViewLink').href = 'gallery.html?album=' + encodeURIComponent(id);
      await loadPhotos();
      window.scrollTo(0, 0);
    }catch(e){ fail(e); }
  }
  async function loadPhotos(){
    curPhotos = await must(sb.from('album_photos').select('*').eq('album_id', curAlbum.id).order('sort', {ascending:true}).order('created_at', {ascending:true}));
    renderPhotos();
  }
  function renderPhotos(){
    $('photoCount').textContent = '사진 ' + curPhotos.length + '장';
    $('adminPhotos').innerHTML = curPhotos.length ? curPhotos.map(function(p, i){
      var isCover = curAlbum.cover_url === p.url;
      return '<div class="admin-photo' + (isCover ? ' cover' : '') + '" data-i="' + i + '"><img loading="lazy" src="' + esc(p.url) + '" alt="">' +
        (isCover ? '<span class="cover-badge">대표</span>' : '') +
        '<div class="ph-move"><button type="button" data-pa="left" title="앞으로" aria-label="앞으로">◀</button><button type="button" data-pa="right" title="뒤로" aria-label="뒤로">▶</button></div>' +
        '<div class="ph-acts">' + (isCover ? '' : '<button type="button" data-pa="cover">대표로</button>') + '<button type="button" class="del" data-pa="del">삭제</button></div></div>';
    }).join('') : '<p class="hint">아직 사진이 없습니다.</p>';
  }
  $('adminPhotos').addEventListener('click', async function(e){
    var b = e.target.closest('[data-pa]'); if(!b) return;
    var i = +b.closest('[data-i]').dataset.i, p = curPhotos[i], act = b.dataset.pa;
    if(!(await ensureSession())) return;
    try{
      if(act === 'cover'){
        await must(sb.from('albums').update({ cover_url:p.url }).eq('id', curAlbum.id));
        curAlbum.cover_url = p.url; renderPhotos(); toast('대표 사진으로 정했습니다.');
      } else if(act === 'del'){
        if(!confirm('이 사진을 삭제할까요?')) return;
        await must(sb.from('album_photos').delete().eq('id', p.id));
        removeFiles([p.url]);
        curPhotos.splice(i, 1);
        if(curAlbum.cover_url === p.url){
          var next = curPhotos[0] ? curPhotos[0].url : null;
          await must(sb.from('albums').update({ cover_url:next }).eq('id', curAlbum.id)); curAlbum.cover_url = next;
        }
        renderPhotos(); toast('삭제했습니다.');
      } else {
        var j = act === 'left' ? i - 1 : i + 1; if(j < 0 || j >= curPhotos.length) return;
        var t = curPhotos[i]; curPhotos[i] = curPhotos[j]; curPhotos[j] = t;
        renderPhotos();
        await must(sb.from('album_photos').upsert(curPhotos.map(function(x, k){ return { id:x.id, album_id:x.album_id, url:x.url, caption:x.caption, sort:k }; }), { onConflict:'id' }));
      }
    }catch(err){ fail(err); }
  });
  $('albumBackBtn').addEventListener('click', function(){ $('albumEditPanel').style.display = 'none'; $('albumListPanel').style.display = ''; curAlbum = null; loadAlbums(); });
  $('albumSaveBtn').addEventListener('click', async function(){
    var title = $('albumTitleInput').value.trim(); if(!title){ toast('행사 이름을 입력해주세요.', true); return; }
    if(!(await ensureSession())) return;
    try{
      await must(sb.from('albums').update({ title:title, event_date:$('albumDateInput').value || null, description:$('albumDescInput').value.trim() || null }).eq('id', curAlbum.id));
      curAlbum.title = title; toast('저장했습니다.');
    }catch(e){ fail(e); }
  });
  $('albumDeleteBtn').addEventListener('click', async function(){
    if(!confirm('"' + curAlbum.title + '" 사진첩과 사진 ' + curPhotos.length + '장을 모두 삭제할까요? 되돌릴 수 없습니다.')) return;
    if(!(await ensureSession())) return;
    try{
      await must(sb.from('album_photos').delete().eq('album_id', curAlbum.id));
      await must(sb.from('albums').delete().eq('id', curAlbum.id));
      removeFiles(curPhotos.map(function(p){ return p.url; }));
      toast('사진첩을 삭제했습니다.');
      $('albumBackBtn').click();
    }catch(e){ fail(e); }
  });

  async function uploadPhotos(files){
    files = files.filter(function(f){ return /^image\//.test(f.type); });
    if(!files.length){ toast('사진 파일만 올릴 수 있습니다.', true); return; }
    if(!(await ensureSession())) return;
    var bar = $('uploadBar'), txt = $('uploadText'), box = $('uploadProgress');
    box.style.display = ''; var done = 0, failed = 0;
    var sort = curPhotos.length ? Math.max.apply(null, curPhotos.map(function(p){ return p.sort || 0; })) + 1 : 0;
    function tick(){ bar.style.width = Math.round((done + failed) / files.length * 100) + '%'; txt.textContent = files.length + '장 중 ' + (done + failed) + '장 처리됨' + (failed ? ' (실패 ' + failed + '장)' : '') + ' — 창을 닫지 마세요'; }
    tick();
    var queue = files.map(function(f, i){ return { f:f, sort: sort + i }; });
    async function worker(){
      while(queue.length){
        var job = queue.shift();
        try{
          var url = await N.uploadFile(job.f, 'albums/' + curAlbum.id);
          var row = await must(sb.from('album_photos').insert({ album_id:curAlbum.id, url:url, sort:job.sort }).select().single());
          curPhotos.push(row); done++;
        }catch(e){ console.error(e); failed++; }
        tick();
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    curPhotos.sort(function(a, b){ return (a.sort || 0) - (b.sort || 0); });
    if(!curAlbum.cover_url && curPhotos[0]){
      try{ await must(sb.from('albums').update({ cover_url:curPhotos[0].url }).eq('id', curAlbum.id)); curAlbum.cover_url = curPhotos[0].url; }catch(e){}
    }
    renderPhotos();
    txt.textContent = done + '장을 올렸습니다.' + (failed ? ' ' + failed + '장은 실패했습니다 — 다시 시도해주세요.' : '');
    toast(failed ? '일부 사진이 올라가지 않았습니다.' : '사진 ' + done + '장을 올렸습니다.', !!failed);
    setTimeout(function(){ if(!queue.length) box.style.display = 'none'; }, 5000);
  }
  pickFiles($('photoInput'), uploadPhotos);
  var dz = $('dropzone');
  ['dragenter','dragover'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', function(e){ uploadPhotos(Array.prototype.slice.call(e.dataTransfer.files || [])); });

  /* ======================================================================
     3. 게시판
     ====================================================================== */
  var boardOpts = [{ key:'__notice', name:'공지사항' }].concat(N.BOARDS);
  $('boardSelect').innerHTML = boardOpts.map(function(b){ return '<option value="' + b.key + '">' + esc(b.name) + '</option>'; }).join('');
  var curBoard = '__notice', posts = [], editing = null, postImages = [], postFile = null, postFileRemoved = false;
  function isNotice(){ return curBoard === '__notice'; }

  loaders.board = loadPosts;
  $('boardSelect').addEventListener('change', function(){ curBoard = this.value; closePostForm(); loadPosts(); });
  async function loadPosts(){
    var box = $('postAdminList'); box.innerHTML = '<p class="state-msg">불러오는 중…</p>';
    try{
      posts = isNotice()
        ? await must(sb.from('notices').select('*').order('created_at', {ascending:false}))
        : await must(sb.from('posts').select('*').eq('board', curBoard).order('pinned', {ascending:false}).order('created_at', {ascending:false}));
      if(!posts.length){ box.innerHTML = '<p class="state-msg">아직 글이 없습니다.</p>'; return; }
      box.innerHTML = posts.map(function(p, i){
        var img = isNotice() ? p.image_url : (p.images || [])[0];
        var view = isNotice() ? 'notice.html?id=' + encodeURIComponent(p.id) : 'board.html?b=' + curBoard + '&id=' + encodeURIComponent(p.id);
        return '<div class="list-item"><div class="thumb" style="background-image:url(&quot;' + esc(img || '') + '&quot;)"></div>' +
          '<div class="txt"><b>' + (p.pinned ? '<span class="pin-badge">고정</span>' : '') + esc(p.title) + '</b><span>' + N.formatDate(p.created_at) + '</span></div>' +
          '<div class="acts"><a class="btn-mini" href="' + view + '" target="_blank" rel="noopener">보기</a><button class="btn-mini" data-pedit="' + i + '">수정</button><button class="btn-mini danger" data-pdel="' + i + '">삭제</button></div></div>';
      }).join('');
    }catch(e){ box.innerHTML = '<p class="state-msg">' + esc(errText(e)) + '</p>'; }
  }
  $('postAdminList').addEventListener('click', async function(e){
    var ed = e.target.closest('[data-pedit]'), del = e.target.closest('[data-pdel]');
    if(ed) openPostForm(posts[+ed.dataset.pedit]);
    if(del){
      var p = posts[+del.dataset.pdel];
      if(!confirm('"' + p.title + '" 글을 삭제할까요?')) return;
      if(!(await ensureSession())) return;
      try{ await must(sb.from(isNotice() ? 'notices' : 'posts').delete().eq('id', p.id)); toast('삭제했습니다.'); loadPosts(); }catch(err){ fail(err); }
    }
  });
  async function openPostForm(p){
    editing = p || null;
    await getAlbums();
    $('postTitleInput').value = p ? p.title : '';
    $('postBodyInput').value = p ? (p.body || '') : '';
    postImages = p ? (isNotice() ? (p.image_url ? [p.image_url] : []) : (p.images || []).slice()) : [];
    $('postLinkBox').innerHTML = linkFieldHtml('id="postLinkField"', p && p.link_url || '', '연결 안 함');
    $('postPinnedInput').checked = !!(p && p.pinned);
    postFile = null; postFileRemoved = false;
    $('postFileName').textContent = p && p.file_url ? '현재: ' + (p.file_name || '첨부파일') : '';
    $('postFileRemove').style.display = p && p.file_url ? '' : 'none';
    $('postExtraFields').style.display = isNotice() ? 'none' : '';
    $('postImgLabel').textContent = isNotice() ? '사진 (1장)' : '사진 (여러 장 가능)';
    $('postSaveBtn').textContent = p ? '수정 저장' : '등록';
    renderPostImages();
    $('postForm').style.display = '';
    $('postTitleInput').focus();
    refreshLinkPreview();
  }
  function closePostForm(){ $('postForm').style.display = 'none'; editing = null; }

  /* ---- 링크 미리보기: 입력하는 동안 보여주고, 저장할 때 미리보기 정보를 저장 ---- */
  var L = window.NYDLinks, fetchedPreviews = {}, previewTimer = null;
  function postUrls(){
    var urls = [];
    if(!isNotice()){ var lf = $('postLinkField'); var lu = lf ? readLinkField(lf) : ''; if(/^https?:\/\//i.test(lu)) urls.push(lu); }
    L.extract($('postBodyInput').value).forEach(function(u){ if(urls.indexOf(u) < 0) urls.push(u); });
    return urls.slice(0, 8);
  }
  async function refreshLinkPreview(){
    var urls = postUrls(), box = $('postLinkPreview');
    $('postLinkPreviewWrap').style.display = urls.length ? '' : 'none';
    if(!urls.length){ box.innerHTML = ''; return; }
    var saved = await L.load(urls);
    box.innerHTML = urls.map(function(u){ return L.cardHtml(u, saved[u] || fetchedPreviews[u]); }).join('');
    for(var i = 0; i < urls.length; i++){
      var u = urls[i];
      if(saved[u] || fetchedPreviews[u] !== undefined) continue;
      fetchedPreviews[u] = null;
      var p = await L.fetchPreview(u);
      fetchedPreviews[u] = p;
      if(p && postUrls().indexOf(u) >= 0) box.innerHTML = postUrls().map(function(x){ return L.cardHtml(x, saved[x] || fetchedPreviews[x]); }).join('');
    }
  }
  function schedulePreview(){ clearTimeout(previewTimer); previewTimer = setTimeout(refreshLinkPreview, 700); }
  $('postBodyInput').addEventListener('input', schedulePreview);
  $('postLinkBox').addEventListener('input', schedulePreview);
  $('postLinkBox').addEventListener('change', schedulePreview);
  async function savePreviews(urls){
    if(!urls.length) return;
    var saved = await L.load(urls), rows = [];
    for(var i = 0; i < urls.length; i++){
      var u = urls[i]; if(saved[u]) continue;
      var p = fetchedPreviews[u] || await L.fetchPreview(u);
      if(p) rows.push({ key:'lp:' + u, value:JSON.stringify(p), updated_at:new Date().toISOString() });
    }
    if(rows.length) await sb.from('site_settings').upsert(rows, { onConflict:'key' });
  }
  $('newPostBtn').addEventListener('click', function(){ openPostForm(null); });
  $('postLinkBox').addEventListener('change', function(){ var f = $('postLinkField'); if(f) readLinkField(f); });
  $('postCancelBtn').addEventListener('click', closePostForm);
  function renderPostImages(){
    $('postImagePreview').innerHTML = postImages.map(function(u, i){
      return '<div class="admin-photo" data-i="' + i + '"><img src="' + esc(u) + '" alt=""><div class="ph-acts"><span></span><button type="button" class="del" data-rm="' + i + '">빼기</button></div></div>';
    }).join('');
  }
  $('postImagePreview').addEventListener('click', function(e){ var b = e.target.closest('[data-rm]'); if(b){ postImages.splice(+b.dataset.rm, 1); renderPostImages(); } });
  pickFiles($('postImageInput'), async function(files){
    if(!(await ensureSession())) return;
    if(isNotice()) files = files.slice(0, 1);
    toast('사진 올리는 중…');
    try{
      for(var i = 0; i < files.length; i++){
        var url = await N.uploadFile(files[i], 'posts');
        if(isNotice()) postImages = [url]; else postImages.push(url);
        renderPostImages();
      }
      toast('사진을 붙였습니다.');
    }catch(e){ fail(e); }
  });
  pickFiles($('postFileInput'), function(files){ postFile = files[0]; postFileRemoved = false; $('postFileName').textContent = postFile.name; $('postFileRemove').style.display = ''; });
  $('postFileRemove').addEventListener('click', function(){ postFile = null; postFileRemoved = true; $('postFileName').textContent = ''; this.style.display = 'none'; });
  $('postSaveBtn').addEventListener('click', async function(){
    var title = $('postTitleInput').value.trim(); if(!title){ toast('제목을 입력해주세요.', true); return; }
    if(!(await ensureSession())) return;
    var btn = this; btn.disabled = true;
    try{
      var body = $('postBodyInput').value.trim(), payload;
      if(isNotice()){
        payload = { title:title, body:body, image_url: postImages[0] || null };
      } else {
        payload = { board:curBoard, title:title, body:body, images:postImages, link_url:readLinkField($('postLinkField')) || null, pinned:$('postPinnedInput').checked };
        if(postFile){ payload.file_url = await N.uploadFile(postFile, 'files', { raw:true }); payload.file_name = postFile.name; }
        else if(postFileRemoved){ payload.file_url = null; payload.file_name = null; }
      }
      var table = isNotice() ? 'notices' : 'posts';
      var urls = postUrls();
      if(urls.length){ toast('링크 미리보기를 만드는 중…'); try{ await savePreviews(urls); }catch(err){ console.error(err); } }
      if(editing) await must(sb.from(table).update(payload).eq('id', editing.id));
      else await must(sb.from(table).insert(payload));
      toast(editing ? '수정했습니다.' : '등록했습니다.');
      closePostForm(); loadPosts();
    }catch(e){ fail(e); }
    btn.disabled = false;
  });

  /* ======================================================================
     4. 조직도 — 그룹(회장단·지회·위원회…) > 조직 > 회원
     ====================================================================== */
  var orgGroupsList = [], orgUnits = [], orgOriginal = '', orgDeleted = [], orgOpen = {}, orgKeySeq = 0;
  var TYPE_LABEL = { leader:'임원 카드형 (회장단처럼)', cards:'펼쳐보기형 (지회·위원회처럼)' };

  function orgSnapshot(){
    return JSON.stringify({ g: orgGroupsList, u: orgUnits.map(function(u){ var c = Object.assign({}, u); delete c._k; return c; }) });
  }
  function tagUnits(){ orgUnits.forEach(function(u){ if(!u._k) u._k = 'k' + (++orgKeySeq); }); }

  loaders.org = async function(){
    try{
      var st = {};
      var sr = await sb.from('site_settings').select('key,value');
      if(!sr.error) (sr.data || []).forEach(function(r){ st[r.key] = r.value; });
      orgGroupsList = JSON.parse(JSON.stringify(N.orgGroups(st)));
      orgUnits = await must(sb.from('org_units').select('*').order('sort', {ascending:true}));
      tagUnits();
      orgDeleted = [];
      orgOriginal = st.org_groups ? orgSnapshot() : '';
      if(orgUnits.length && !st.org_groups) orgOriginal = orgSnapshot();
      if(!orgUnits.length){
        orgUnits = await orgFromHomepage(); tagUnits();
        if(orgUnits.length) toast('현재 홈페이지 조직도를 불러왔습니다. 저장을 누르면 관리가 시작됩니다.');
      }
      // DB에 있지만 그룹 목록에 없는 조직은 새 그룹으로 보여줌
      orgUnits.forEach(function(u){
        if(!orgGroupsList.some(function(g){ return g.key === u.section; })) orgGroupsList.push({ key:u.section, name:'기타 (' + u.section + ')', type:'cards', show_head:true, badge:'' });
      });
      orgPeopleAtLoad = N.orgPeople(orgGroupsList, orgUnits);
      renderOrg(); markOrg();
    }catch(e){ $('orgEditor').innerHTML = '<p class="state-msg">' + esc(errText(e)) + '</p>'; }
  };
  var orgPeopleAtLoad = [];
  function pkey(p){ return String(p.name || '').trim() + '|' + String(p.group || '').trim(); }

  /* 조직도를 저장하면 회원 명단(회원검색)도 맞춰 줌
     - 조직도에 있는데 명단에 없는 사람 → 명단에 추가
     - 다른 조직으로 옮긴 사람 → 명단의 소속·직책만 바꿈 (업체 정보 유지)
     - 조직도에서 뺀 사람 → 명단에서 삭제 (업체·직업이 적혀 있으면 남겨 둠) */
  async function syncMembersFromOrg(before, after){
    var rows = await must(sb.from('members').select('*').order('sort', {ascending:true}));
    var byKey = {}, maxSort = 0;
    rows.forEach(function(r){ byKey[pkey(r)] = r; maxSort = Math.max(maxSort, r.sort || 0); });
    var afterK = {}, beforeK = {};
    after.forEach(function(p){ afterK[pkey(p)] = p; });
    before.forEach(function(p){ beforeK[pkey(p)] = p; });
    var removed = before.filter(function(p){ return !afterK[pkey(p)]; });
    var removedByName = {};
    removed.forEach(function(p){ (removedByName[p.name] = removedByName[p.name] || []).push(p); });
    var inserts = [], updates = {}, used = {}, kept = 0;
    after.forEach(function(p){
      var k = pkey(p), r = byKey[k];
      if(r){
        var old = beforeK[k];
        if(old && old.role !== p.role && r.role !== p.role) updates[r.id] = Object.assign({}, r, { role:p.role });
        return;
      }
      var from = (removedByName[p.name] || []).shift(), fr = from && byKey[pkey(from)];
      if(fr && !used[fr.id]){ used[fr.id] = true; updates[fr.id] = Object.assign({}, fr, { group:p.group, role:p.role }); return; }
      if(inserts.some(function(x){ return pkey(x) === k; })) return;
      inserts.push({ name:p.name, role:p.role, group:p.group, business:'', sort:++maxSort });
    });
    var deletes = [];
    removed.forEach(function(p){
      var r = byKey[pkey(p)]; if(!r || used[r.id]) return;
      if(String(r.business || '').trim()) kept++; else deletes.push(r.id);
    });
    var upd = Object.keys(updates).map(function(id){ return updates[id]; });
    if(deletes.length) await must(sb.from('members').delete().in('id', deletes));
    if(upd.length) await must(sb.from('members').upsert(upd, { onConflict:'id' }));
    if(inserts.length) await must(sb.from('members').insert(inserts));
    if(!dirty.members) loaded.members = false;   // 회원 명단 탭을 다시 열면 새로 불러옴
    return { added:inserts.length, changed:upd.length, removed:deletes.length, kept:kept };
  }
  async function orgFromHomepage(){
    var doc = await fetchHomeDoc(), out = [], sort = 0;
    doc.querySelectorAll('#orgLeaders .leader-tier').forEach(function(t, ti){
      t.querySelectorAll('.leader-card').forEach(function(c){
        out.push({ section:'leader', tier:ti+1, title:c.querySelector('.lc-role').textContent.trim(), leader:'', members:c.querySelector('.lc-name').textContent.trim(), featured:c.classList.contains('featured'), wide:c.classList.contains('wide'), sort:++sort });
      });
    });
    [['orgBranches','branch'],['orgCommittees','committee']].forEach(function(pair){
      doc.querySelectorAll('#' + pair[0] + ' .org-card').forEach(function(c){
        out.push({ section:pair[1], tier:0, title:c.querySelector('.oc-title b').textContent.trim(), leader:c.querySelector('.oc-title i').textContent.trim(),
          members:Array.prototype.map.call(c.querySelectorAll('.member-chip:not(.muted)'), function(m){ return m.textContent.trim(); }).join(', '), featured:false, wide:false, sort:++sort });
      });
    });
    return out;
  }

  function renderOrg(){
    var groupOpts = orgGroupsList.map(function(g){ return [g.key, g.name]; });
    var html = orgGroupsList.map(function(g, gi){
      var items = orgUnits.map(function(u, i){ return { u:u, i:i }; }).filter(function(x){ return x.u.section === g.key; });
      var members = items.reduce(function(n, x){ return n + (g.type === 'leader' ? 0 : N.splitNames(x.u.members).length); }, 0);
      return '<details class="panel og-panel" open data-g="' + gi + '"><summary><span class="og-sum">' + esc(g.name || '(이름 없음)') +
          ' <span class="og-tag">' + (g.type === 'leader' ? '임원 카드형' : '펼쳐보기형') + '</span><span class="hint" style="margin:0;">조직 ' + items.length + '개' + (members ? ' · 회원 ' + members + '명' : '') + '</span></span></summary>' +
        '<div class="og-settings"><div class="row">' +
          '<label class="chk">그룹 이름 <input class="admin-input" style="width:160px;" data-gf="name" value="' + esc(g.name) + '"></label>' +
          '<label class="chk">옆 표시 <input class="admin-input" style="width:140px;" data-gf="badge" placeholder="비우면 자동 (예: ' + items.length + '개)" value="' + esc(g.badge || '') + '"></label>' +
          '<label class="chk"><input type="checkbox" data-gf="show_head"' + (g.show_head ? ' checked' : '') + '> 홈페이지에 그룹 제목 보이기</label></div>' +
          '<div class="row"><label class="chk">보여주는 모양 <select class="admin-input" style="width:auto;" data-gf="type">' +
            Object.keys(TYPE_LABEL).map(function(t){ return '<option value="' + t + '"' + (g.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>'; }).join('') + '</select></label>' +
          '<span class="grow"></span><button type="button" class="btn-mini" data-ga="up">▲ 그룹 위로</button><button type="button" class="btn-mini" data-ga="down">▼ 그룹 아래로</button><button type="button" class="btn-mini danger" data-ga="del">그룹 삭제</button></div></div>' +
        items.map(function(x){ return unitCard(x.u, x.i, g, groupOpts); }).join('') +
        '<button type="button" class="btn btn-line btn-sm" data-oadd="' + esc(g.key) + '" style="margin-top:6px;">+ "' + esc(g.name) + '"에 ' + (g.type === 'leader' ? '임원 추가' : '조직 추가') + '</button>' +
      '</details>';
    }).join('');
    html += '<div class="panel"><div class="row"><button type="button" class="btn btn-primary btn-sm" data-gnew="cards">+ 새 그룹 추가 (펼쳐보기형)</button><button type="button" class="btn btn-line btn-sm" data-gnew="leader">+ 새 그룹 추가 (임원 카드형)</button></div>' +
      '<p class="hint">예: "자문위원단", "청년부" 같은 새 묶음을 만들 수 있습니다.</p></div>';
    $('orgEditor').innerHTML = html;
  }
  function unitCard(u, i, g, groupOpts){
    var open = orgOpen[u._k] ? ' open' : '';
    var move = '<div class="row" style="margin-top:12px;"><label class="chk">그룹 이동 <select class="admin-input" style="width:auto;" data-omove>' +
      groupOpts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === u.section ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
      '<span class="grow"></span><button type="button" class="btn-mini" data-oa="up">▲</button><button type="button" class="btn-mini" data-oa="down">▼</button><button type="button" class="btn-mini danger" data-oa="del">삭제</button></div>';
    if(g.type === 'leader'){
      return '<details class="ou-card" data-i="' + i + '"' + open + '><summary><span><b data-sum="title">' + esc(u.title || '(직책 없음)') + '</b><i data-sum="members">' + esc(u.members || '') + '</i></span><span class="cnt">' + (u.tier || 1) + '번째 줄</span></summary>' +
        '<div class="ou-body"><div class="row"><input class="admin-input" style="width:160px;" data-of="title" placeholder="직책 (예: 회장)" value="' + esc(u.title) + '">' +
        '<input class="admin-input grow" data-of="members" placeholder="이름 (여러 명이면 · 로 구분)" value="' + esc(u.members) + '"></div>' +
        '<div class="row"><label class="chk">몇 번째 줄 <input class="admin-input" type="number" min="1" max="20" style="width:70px;" data-of="tier" value="' + (u.tier || 1) + '"></label>' +
        '<label class="chk"><input type="checkbox" data-of="featured"' + (u.featured ? ' checked' : '') + '> 빨간 강조</label>' +
        '<label class="chk"><input type="checkbox" data-of="wide"' + (u.wide ? ' checked' : '') + '> 넓게</label></div>' + move + '</div></details>';
    }
    var names = N.splitNames(u.members);
    return '<details class="ou-card" data-i="' + i + '"' + open + '><summary><span><b data-sum="title">' + esc(u.title || '(이름 없음)') + '</b><i data-sum="leader">' + esc(u.leader || '') + '</i></span><span class="cnt" data-sum="cnt">' + names.length + '명</span></summary>' +
      '<div class="ou-body"><div class="row"><input class="admin-input grow" data-of="title" placeholder="조직 이름 (예: 영덕읍지회)" value="' + esc(u.title) + '">' +
      '<input class="admin-input grow" data-of="leader" placeholder="대표 (예: 지회장 홍길동)" value="' + esc(u.leader) + '"></div>' +
      '<div class="chips">' + (names.length ? names.map(function(n, k){ return '<span class="chip">' + esc(n) + '<button type="button" data-chipdel="' + k + '" aria-label="' + esc(n) + ' 빼기">×</button></span>'; }).join('') : '<span class="hint" style="margin:0;">회원이 없습니다.</span>') + '</div>' +
      '<div class="chip-add"><input class="admin-input" data-chipin placeholder="회원 이름 (여러 명은 쉼표로: 홍길동, 김철수)"><button type="button" class="btn btn-line btn-sm" data-chipadd>+ 회원 추가</button></div>' +
      move + '</div></details>';
  }
  function markOrg(){
    var changed = orgSnapshot() !== orgOriginal || orgDeleted.length > 0;
    setDirty('org', changed, changed ? '조직도에 저장하지 않은 변경사항이 있습니다' : '');
  }
  function unitOf(el){ var c = el.closest('.ou-card[data-i]'); return c ? orgUnits[+c.dataset.i] : null; }
  function groupOf(el){ var c = el.closest('[data-g]'); return c ? orgGroupsList[+c.dataset.g] : null; }
  function addChips(card){
    var inp = card.querySelector('[data-chipin]'), u = orgUnits[+card.dataset.i];
    var add = N.splitNames(inp.value); if(!add.length){ inp.focus(); return; }
    u.members = N.splitNames(u.members).concat(add).join(', ');
    orgOpen[u._k] = true; renderOrg(); markOrg();
    var again = $('orgEditor').querySelector('.ou-card[data-i="' + orgUnits.indexOf(u) + '"] [data-chipin]'); if(again) again.focus();
  }

  var oe = $('orgEditor');
  oe.addEventListener('toggle', function(e){ var t = e.target; if(t.classList && t.classList.contains('ou-card')){ var u = orgUnits[+t.dataset.i]; if(u) orgOpen[u._k] = t.open; } }, true);
  oe.addEventListener('input', function(e){
    var t = e.target;
    if(t.dataset.gf && t.type !== 'checkbox' && t.tagName !== 'SELECT'){ groupOf(t)[t.dataset.gf] = t.value; markOrg(); return; }
    if(t.dataset.of && t.type !== 'checkbox'){
      var u = unitOf(t); u[t.dataset.of] = t.dataset.of === 'tier' ? (parseInt(t.value, 10) || 1) : t.value;
      var s = t.closest('.ou-card').querySelector('[data-sum="' + t.dataset.of + '"]'); if(s) s.textContent = t.value;
      markOrg();
    }
  });
  oe.addEventListener('change', function(e){
    var t = e.target;
    if(t.dataset.gf){
      var g = groupOf(t); g[t.dataset.gf] = t.type === 'checkbox' ? t.checked : t.value;
      if(t.dataset.gf === 'type' || t.dataset.gf === 'name') renderOrg();
      markOrg(); return;
    }
    if(t.dataset.of && t.type === 'checkbox'){ unitOf(t)[t.dataset.of] = t.checked; markOrg(); return; }
    if(t.hasAttribute('data-omove')){
      var u = unitOf(t); u.section = t.value;
      var tg = orgGroupsList.find(function(x){ return x.key === t.value; });
      if(tg && tg.type === 'leader' && !u.tier) u.tier = 1;
      // 옮긴 그룹의 맨 끝으로
      orgUnits.splice(orgUnits.indexOf(u), 1); orgUnits.push(u);
      orgOpen[u._k] = true; renderOrg(); markOrg();
      toast('"' + (tg ? tg.name : '') + '" 그룹으로 옮겼습니다.');
    }
  });
  oe.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && e.target.hasAttribute('data-chipin')){ e.preventDefault(); addChips(e.target.closest('.ou-card')); }
  });
  oe.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-chipadd')){ addChips(b.closest('.ou-card')); return; }
    if(b.dataset.chipdel != null){
      var u = unitOf(b), names = N.splitNames(u.members); names.splice(+b.dataset.chipdel, 1);
      u.members = names.join(', '); orgOpen[u._k] = true; renderOrg(); markOrg(); return;
    }
    if(b.dataset.gnew){
      orgGroupsList.push({ key:'g' + Date.now().toString(36), name:'새 그룹', type:b.dataset.gnew, show_head:true, badge:'' });
      renderOrg(); markOrg();
      var gin = oe.querySelector('[data-g="' + (orgGroupsList.length - 1) + '"] [data-gf="name"]');
      if(gin){ gin.focus(); gin.select(); gin.scrollIntoView({block:'center'}); }
      toast('새 그룹을 만들었습니다. 그룹 이름을 바꾸고 조직을 추가하세요.'); return;
    }
    if(b.dataset.ga){
      var gi = +b.closest('[data-g]').dataset.g, g = orgGroupsList[gi];
      if(b.dataset.ga === 'del'){
        var inside = orgUnits.filter(function(u){ return u.section === g.key; });
        if(!confirm('"' + g.name + '" 그룹을 삭제할까요?' + (inside.length ? '\n그룹 안의 조직 ' + inside.length + '개도 함께 삭제됩니다.' : ''))) return;
        inside.forEach(function(u){ if(u.id) orgDeleted.push(u.id); });
        orgUnits = orgUnits.filter(function(u){ return u.section !== g.key; });
        orgGroupsList.splice(gi, 1);
      } else {
        var j = b.dataset.ga === 'up' ? gi - 1 : gi + 1; if(j < 0 || j >= orgGroupsList.length) return;
        orgGroupsList[gi] = orgGroupsList[j]; orgGroupsList[j] = g;
      }
      renderOrg(); markOrg(); return;
    }
    if(b.dataset.oadd){
      var sec = b.dataset.oadd, grp = orgGroupsList.find(function(x){ return x.key === sec; });
      var same = orgUnits.filter(function(u){ return u.section === sec; });
      var tier = grp && grp.type === 'leader' ? (same.length ? Math.max.apply(null, same.map(function(u){ return u.tier || 1; })) + 1 : 1) : 0;
      var nu = { section:sec, tier:tier, title:'', leader:'', members:'', featured:false, wide:false };
      var lastIdx = -1; orgUnits.forEach(function(u, i){ if(u.section === sec) lastIdx = i; });
      if(lastIdx >= 0) orgUnits.splice(lastIdx + 1, 0, nu); else orgUnits.push(nu);
      tagUnits(); orgOpen[nu._k] = true;
      renderOrg(); markOrg();
      var inp = oe.querySelector('.ou-card[data-i="' + orgUnits.indexOf(nu) + '"] [data-of="title"]'); if(inp) inp.focus();
      return;
    }
    if(b.dataset.oa){
      var card = b.closest('.ou-card'), i = +card.dataset.i, u2 = orgUnits[i];
      if(b.dataset.oa === 'del'){
        if(!confirm('"' + (u2.title || '빈 칸') + '"을(를) 삭제할까요?')) return;
        if(u2.id) orgDeleted.push(u2.id);
        orgUnits.splice(i, 1);
      } else {
        var dir = b.dataset.oa === 'up' ? -1 : 1, k = i + dir;
        while(k >= 0 && k < orgUnits.length && orgUnits[k].section !== u2.section) k += dir;
        if(k < 0 || k >= orgUnits.length) return;
        orgUnits[i] = orgUnits[k]; orgUnits[k] = u2;
      }
      renderOrg(); markOrg();
    }
  });

  saveHandlers.org = async function(){
    if(!(await ensureSession())) return;
    var badG = orgGroupsList.find(function(g){ return !String(g.name || '').trim(); });
    if(badG){ toast('이름이 비어 있는 그룹이 있습니다.', true); return; }
    var bad = orgUnits.find(function(u){ return !String(u.title || '').trim(); });
    if(bad){ orgOpen[bad._k] = true; renderOrg(); toast('이름(직책)이 비어 있는 칸이 있습니다.', true); return; }
    // 그룹 순서대로 정렬해서 번호 매기기
    var ordered = [];
    orgGroupsList.forEach(function(g){ orgUnits.forEach(function(u){ if(u.section === g.key) ordered.push(u); }); });
    orgUnits = ordered;
    orgUnits.forEach(function(u, i){ u.sort = i + 1; u.title = String(u.title).trim(); });
    function clean(u){ var c = Object.assign({}, u); delete c._k; return c; }
    await must(sb.from('site_settings').upsert([{ key:'org_groups', value:JSON.stringify(orgGroupsList), updated_at:new Date().toISOString() }], { onConflict:'key' }));
    if(orgDeleted.length) await must(sb.from('org_units').delete().in('id', orgDeleted));
    var existing = orgUnits.filter(function(u){ return u.id; }), fresh = orgUnits.filter(function(u){ return !u.id; });
    if(existing.length) await must(sb.from('org_units').upsert(existing.map(clean), { onConflict:'id' }));
    if(fresh.length){
      var ins = await must(sb.from('org_units').insert(fresh.map(clean)).select());
      (ins || []).forEach(function(r){ var t = fresh.find(function(f){ return !f.id && f.sort === r.sort; }); if(t) t.id = r.id; });
    }
    orgDeleted = [];
    orgOriginal = orgSnapshot();
    var peopleNow = N.orgPeople(orgGroupsList, orgUnits), msg = '조직도를 저장했습니다.';
    try{
      var r = await syncMembersFromOrg(orgPeopleAtLoad, peopleNow);
      var parts = [];
      if(r.added) parts.push(r.added + '명 추가'); if(r.changed) parts.push(r.changed + '명 소속 변경'); if(r.removed) parts.push(r.removed + '명 삭제');
      if(parts.length) msg += ' 회원검색에도 반영: ' + parts.join(', ') + '.';
      if(r.kept) msg += ' (업체 정보가 있는 ' + r.kept + '명은 회원 명단에 남겨 두었습니다)';
    }catch(e){ console.error(e); msg += ' (회원 명단 반영은 실패했습니다: ' + errText(e) + ')'; }
    orgPeopleAtLoad = peopleNow;
    renderOrg(); markOrg();
    toast(msg);
  };
  discardHandlers.org = function(){ setDirty('org', false); $('orgEditor').innerHTML = '<p class="state-msg">불러오는 중…</p>'; loaders.org(); };

  /* ======================================================================
     5. 회원 명단
     ====================================================================== */
  var members = [], membersOriginal = '[]', membersDeleted = [];
  loaders.members = async function(){
    try{
      members = await must(sb.from('members').select('*').order('sort', {ascending:true}));
      membersOriginal = JSON.stringify(members); membersDeleted = [];
      if(!members.length){
        try{
          var file = await (await fetch('members-data.json', { cache:'no-store' })).json();
          members = file.map(function(m, i){ return { name:m.name || '', role:m.role || '', group:m.group || '', business:m.business || '', sort:i+1 }; });
          if(members.length) toast('기존 회원 명단 파일을 불러왔습니다. 저장을 누르면 관리가 시작됩니다.');
        }catch(e){}
      }
      // 조직도에만 있고 명단에 없는 사람을 찾아 추가 (저장하면 반영)
      try{
        var st = {}, sr = await sb.from('site_settings').select('key,value').eq('key', 'org_groups');
        (sr.data || []).forEach(function(r){ st[r.key] = r.value; });
        var ou = await sb.from('org_units').select('*').order('sort', {ascending:true});
        if(!ou.error && ou.data && ou.data.length){
          var have = {}; members.forEach(function(m){ have[pkey(m)] = true; });
          var missing = N.orgPeople(N.orgGroups(st), ou.data).filter(function(p){ if(have[pkey(p)]) return false; have[pkey(p)] = true; return true; });
          if(missing.length){
            missing.reverse().forEach(function(p){ members.unshift({ name:p.name, role:p.role, group:p.group, business:'' }); });
            toast('조직도에만 있던 ' + missing.length + '명을 명단 맨 위에 추가했습니다. 저장을 누르면 반영됩니다.');
          }
        }
      }catch(e){ console.error(e); }
      renderMembers(); markMembers();
    }catch(e){ $('memberRows').innerHTML = '<tr><td colspan="5"><p class="state-msg">' + esc(errText(e)) + '</p></td></tr>'; }
  };
  function renderMembers(){
    var q = $('memberFilter').value.trim();
    $('memberRows').innerHTML = members.map(function(m, i){
      if(q && [m.name, m.role, m.group, m.business].join(' ').indexOf(q) < 0) return '';
      return '<tr data-i="' + i + '">' + ['name','role','group','business'].map(function(f){
        return '<td><input data-mf="' + f + '" value="' + esc(m[f] || '') + '"></td>';
      }).join('') + '<td><button type="button" class="btn-mini danger" data-mdel>삭제</button></td></tr>';
    }).join('') || '<tr><td colspan="5"><p class="hint" style="padding:12px;">해당하는 회원이 없습니다.</p></td></tr>';
  }
  function markMembers(){
    var changed = JSON.stringify(members) !== membersOriginal || membersDeleted.length > 0;
    setDirty('members', changed, changed ? '회원 명단에 저장하지 않은 변경사항이 있습니다' : '');
  }
  $('memberFilter').addEventListener('input', renderMembers);
  $('memberRows').addEventListener('input', function(e){
    var tr = e.target.closest('[data-i]'), f = e.target.dataset.mf; if(!tr || !f) return;
    members[+tr.dataset.i][f] = e.target.value; markMembers();
  });
  $('memberRows').addEventListener('click', function(e){
    if(!e.target.closest('[data-mdel]')) return;
    var i = +e.target.closest('[data-i]').dataset.i, m = members[i];
    if(!confirm((m.name || '이 회원') + '을(를) 명단에서 삭제할까요?')) return;
    if(m.id) membersDeleted.push(m.id);
    members.splice(i, 1); renderMembers(); markMembers();
  });
  $('addMemberBtn').addEventListener('click', function(){
    $('memberFilter').value = '';
    members.unshift({ name:'', role:'회원', group:'', business:'' });
    renderMembers(); markMembers();
    var first = $('memberRows').querySelector('input'); if(first) first.focus();
  });
  saveHandlers.members = async function(){
    if(!(await ensureSession())) return;
    var list = members.filter(function(m){ return String(m.name || '').trim(); });
    members.forEach(function(m){ if(!String(m.name || '').trim() && m.id) membersDeleted.push(m.id); });
    list.forEach(function(m, i){ m.sort = i + 1; m.name = m.name.trim(); });
    if(membersDeleted.length) await must(sb.from('members').delete().in('id', membersDeleted));
    var existing = list.filter(function(m){ return m.id; }), fresh = list.filter(function(m){ return !m.id; });
    if(existing.length) await must(sb.from('members').upsert(existing, { onConflict:'id' }));
    if(fresh.length){
      var ins = await must(sb.from('members').insert(fresh).select());
      (ins || []).forEach(function(r){ var t = fresh.find(function(f){ return !f.id && f.sort === r.sort; }); if(t) t.id = r.id; });
    }
    var before = JSON.parse(membersOriginal), deletedIds = membersDeleted.slice();
    members = list; membersOriginal = JSON.stringify(members); membersDeleted = [];
    renderMembers(); markMembers();
    var msg = '회원 명단을 저장했습니다.';
    try{ var n = await syncOrgFromMembers(before, list, deletedIds); if(n) msg += ' 조직도에도 ' + n + '곳 반영했습니다.'; }
    catch(e){ console.error(e); msg += ' (조직도 반영은 실패했습니다: ' + errText(e) + ')'; }
    toast(msg);
  };
  /* 회원 명단에서 일반 회원(직책 '회원')을 추가·삭제·소속 변경하면 조직도의 해당 조직 회원에도 반영 */
  async function syncOrgFromMembers(before, after, deletedIds){
    var st = {}, sr = await sb.from('site_settings').select('key,value').eq('key', 'org_groups');
    (sr.data || []).forEach(function(r){ st[r.key] = r.value; });
    var groups = N.orgGroups(st), gByKey = {};
    groups.forEach(function(g){ gByKey[g.key] = g; });
    var units = await must(sb.from('org_units').select('*').order('sort', {ascending:true}));
    function unitFor(groupName){
      return units.find(function(u){ var g = gByKey[u.section]; return g && g.type !== 'leader' && N.unitGroupName(u, g) === String(groupName || '').trim(); });
    }
    var changed = {};
    function removeFrom(p){
      if(p.role !== '회원') return; var u = unitFor(p.group); if(!u) return;
      var names = N.splitNames(u.members), i = names.indexOf(String(p.name).trim());
      if(i >= 0){ names.splice(i, 1); u.members = names.join(', '); changed[u.id] = u; }
    }
    function addTo(p){
      if(p.role !== '회원') return; var u = unitFor(p.group); if(!u) return;
      var names = N.splitNames(u.members), nm = String(p.name).trim();
      if(names.indexOf(nm) < 0){ names.push(nm); u.members = names.join(', '); changed[u.id] = u; }
    }
    var beforeById = {}; before.forEach(function(m){ if(m.id) beforeById[m.id] = m; });
    deletedIds.forEach(function(id){ if(beforeById[id]) removeFrom(beforeById[id]); });
    after.forEach(function(m){
      var old = m.id ? beforeById[m.id] : null;
      if(!old){ addTo(m); return; }
      if(pkey(old) !== pkey(m) || old.role !== m.role){ removeFrom(old); addTo(m); }
    });
    var list = Object.keys(changed).map(function(id){ return changed[id]; });
    if(list.length){
      await must(sb.from('org_units').upsert(list, { onConflict:'id' }));
      if(!dirty.org) loaded.org = false;   // 조직도 탭을 다시 열면 새로 불러옴
    }
    return list.length;
  }
  discardHandlers.members = function(){ members = JSON.parse(membersOriginal); membersDeleted = []; renderMembers(); markMembers(); };
})();
