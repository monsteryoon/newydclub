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
  var homeDefaults = {}, homeSaved = {}, homeValues = {}, homeDoc = null;

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

  // 화면에 직접 보이지 않는 설정들 (그룹별로 끼워 넣음)
  function extraFields(doc){
    var marquee = Array.prototype.map.call(doc.querySelectorAll('#marqueeTrack .marquee-item'), function(x){ return x.textContent.trim(); });
    var uniq = marquee.slice(0, Math.max(1, marquee.length / 2));
    var progress = Array.prototype.map.call(doc.querySelectorAll('#progressList .progress-item'), function(it){
      return { status: it.classList.contains('active') ? 'active' : it.classList.contains('upcoming') ? 'upcoming' : 'done',
               label: it.querySelector('.st').textContent.trim(), title: it.querySelector('h3').textContent.trim(), desc: htmlToText(it.querySelector('p')) };
    });
    var iframe = doc.getElementById('songFrame');
    var songId = iframe ? N.youtubeId(iframe.getAttribute('src')) : '';
    return {
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
      '⑧ 추진 경과 제목': [
        { key:'progress_items', label:'추진 경과 단계', type:'progress', def: JSON.stringify(progress) }
      ],
      '⑪ 테마곡': [
        { key:'song_url', label:'유튜브 주소 (비우면 테마곡 칸 숨김)', type:'text', def: songId ? 'https://www.youtube.com/watch?v=' + songId : '' }
      ]
    };
  }

  loaders.home = async function(){
    var box = $('homeFields');
    try{
      var doc = await fetchHomeDoc();
      var groups = {}, order = [];
      function add(group, f){ if(!groups[group]){ groups[group] = []; order.push(group); } groups[group].push(f); homeDefaults[f.key] = f.def; }
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
      homeValues = {};
      Object.keys(homeDefaults).forEach(function(k){ homeValues[k] = (k in homeSaved && homeSaved[k] != null) ? homeSaved[k] : homeDefaults[k]; });

      box.innerHTML = order.map(function(g, gi){
        return '<details class="panel"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g) + '<span class="hint" style="margin:0;">' + groups[g].length + '개 항목</span></summary>' +
          groups[g].map(fieldHtml).join('') + '</details>';
      }).join('');
      bindHomeFields(box);
    }catch(e){ box.innerHTML = '<p class="state-msg">불러오지 못했습니다: ' + esc(errText(e)) + '</p>'; }
  };

  function fieldHtml(f){
    var v = homeValues[f.key] == null ? '' : homeValues[f.key];
    var id = 'f_' + f.key;
    var head = '<span>' + esc(f.label) + '</span>';
    if(f.type === 'image'){
      return '<div class="field" data-key="' + f.key + '">' + head + '<div class="img-field"><div class="thumb" id="' + id + '_t" style="background-image:url(&quot;' + esc(v) + '&quot;)"></div>' +
        '<label class="btn btn-line btn-sm" style="cursor:pointer;">사진 바꾸기<input type="file" accept="image/*" hidden data-img-key="' + f.key + '"></label>' +
        '<button type="button" class="btn-mini" data-reset="' + f.key + '">원래 사진으로</button></div></div>';
    }
    if(f.type === 'select'){
      return '<label class="field" data-key="' + f.key + '">' + head + '<select id="' + id + '" data-k="' + f.key + '">' +
        f.options.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    }
    if(f.type === 'datetime'){
      return '<label class="field" data-key="' + f.key + '">' + head + '<input type="datetime-local" id="' + id + '" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
    }
    if(f.type === 'progress'){
      return '<div class="field" data-key="' + f.key + '">' + head + '<div id="progressEditor"></div><button type="button" class="btn btn-line btn-sm" id="progressAdd">+ 단계 추가</button></div>';
    }
    if(f.type === 'textarea'){
      var rows = Math.min(10, Math.max(2, Math.ceil(String(v).length / 60) + (String(v).match(/\n/g) || []).length));
      return '<label class="field" data-key="' + f.key + '">' + head + '<textarea id="' + id + '" data-k="' + f.key + '" rows="' + rows + '">' + esc(v) + '</textarea></label>';
    }
    return '<label class="field" data-key="' + f.key + '">' + head + '<input type="text" id="' + id + '" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
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
    box.addEventListener('input', function(e){ var k = e.target.dataset && e.target.dataset.k; if(k){ homeValues[k] = e.target.value; markHome(); } });
    box.addEventListener('change', function(e){ var k = e.target.dataset && e.target.dataset.k; if(k){ homeValues[k] = e.target.value; markHome(); } });
    box.querySelectorAll('input[data-img-key]').forEach(function(inp){
      pickFiles(inp, async function(files){
        var key = inp.dataset.imgKey, thumb = $('f_' + key + '_t');
        if(!(await ensureSession())) return;
        toast('사진 올리는 중…');
        try{
          var url = await N.uploadFile(files[0], 'site');
          homeValues[key] = url; thumb.style.backgroundImage = 'url("' + url + '")'; markHome();
          toast('사진이 준비됐습니다. 저장을 눌러 반영하세요.');
        }catch(e){ fail(e); }
      });
    });
    box.querySelectorAll('[data-reset]').forEach(function(b){
      b.addEventListener('click', function(){
        var key = b.dataset.reset; homeValues[key] = homeDefaults[key];
        $('f_' + key + '_t').style.backgroundImage = 'url("' + homeDefaults[key] + '")'; markHome();
      });
    });
    renderProgressEditor();
    var add = $('progressAdd');
    if(add) add.addEventListener('click', function(){
      var list = progressList(); list.push({ status:'upcoming', label:'예정', title:'', desc:'' });
      homeValues.progress_items = JSON.stringify(list); renderProgressEditor(); markHome();
    });
  }

  function progressList(){ try{ var l = JSON.parse(homeValues.progress_items || '[]'); return Array.isArray(l) ? l : []; }catch(e){ return []; } }
  function renderProgressEditor(){
    var box = $('progressEditor'); if(!box) return;
    var list = progressList();
    box.innerHTML = list.map(function(it, i){
      return '<div class="org-edit-card" data-i="' + i + '"><div class="row">' +
        '<select class="admin-input" data-pf="status" style="width:auto;">' + [['done','완료 (파란 점)'],['active','진행 중 (빨간 점)'],['upcoming','예정 (빈 점)']].map(function(o){ return '<option value="' + o[0] + '"' + (it.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<input class="admin-input grow" data-pf="label" placeholder="작은 표시 (예: 완료, 2026.09.17)" value="' + esc(it.label) + '"></div>' +
        '<div class="row"><input class="admin-input grow" data-pf="title" placeholder="단계 제목" value="' + esc(it.title) + '"></div>' +
        '<textarea data-pf="desc" placeholder="설명">' + esc(it.desc) + '</textarea>' +
        '<div class="row" style="margin-top:8px;"><button type="button" class="btn-mini" data-pm="up">▲ 위로</button><button type="button" class="btn-mini" data-pm="down">▼ 아래로</button><button type="button" class="btn-mini danger" data-pm="del">삭제</button></div></div>';
    }).join('');
    box.oninput = box.onchange = function(e){
      var card = e.target.closest('[data-i]'); var f = e.target.dataset.pf; if(!card || !f) return;
      var l = progressList(); l[+card.dataset.i][f] = e.target.value; homeValues.progress_items = JSON.stringify(l); markHome();
      e.stopPropagation();
    };
    box.onclick = function(e){
      var b = e.target.closest('[data-pm]'); if(!b) return;
      var i = +b.closest('[data-i]').dataset.i, l = progressList(), m = b.dataset.pm;
      if(m === 'del'){ if(!confirm('이 단계를 삭제할까요?')) return; l.splice(i, 1); }
      else { var j = m === 'up' ? i - 1 : i + 1; if(j < 0 || j >= l.length) return; var t = l[i]; l[i] = l[j]; l[j] = t; }
      homeValues.progress_items = JSON.stringify(l); renderProgressEditor(); markHome();
    };
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
  async function loadAlbums(){
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
  function openPostForm(p){
    editing = p || null;
    $('postTitleInput').value = p ? p.title : '';
    $('postBodyInput').value = p ? (p.body || '') : '';
    postImages = p ? (isNotice() ? (p.image_url ? [p.image_url] : []) : (p.images || []).slice()) : [];
    $('postLinkInput').value = p && p.link_url || '';
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
  }
  function closePostForm(){ $('postForm').style.display = 'none'; editing = null; }
  $('newPostBtn').addEventListener('click', function(){ openPostForm(null); });
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
        payload = { board:curBoard, title:title, body:body, images:postImages, link_url:$('postLinkInput').value.trim() || null, pinned:$('postPinnedInput').checked };
        if(postFile){ payload.file_url = await N.uploadFile(postFile, 'files', { raw:true }); payload.file_name = postFile.name; }
        else if(postFileRemoved){ payload.file_url = null; payload.file_name = null; }
      }
      var table = isNotice() ? 'notices' : 'posts';
      if(editing) await must(sb.from(table).update(payload).eq('id', editing.id));
      else await must(sb.from(table).insert(payload));
      toast(editing ? '수정했습니다.' : '등록했습니다.');
      closePostForm(); loadPosts();
    }catch(e){ fail(e); }
    btn.disabled = false;
  });

  /* ======================================================================
     4. 조직도
     ====================================================================== */
  var orgUnits = [], orgOriginal = '[]', orgDeleted = [];
  var ORG_SECTIONS = [
    { key:'leader', name:'회장단 · 감사 · 부회장 · 사무국', hint:'같은 "줄 번호"끼리 한 줄에 나란히 보입니다.' },
    { key:'branch', name:'지회', hint:'' },
    { key:'committee', name:'위원회', hint:'' }
  ];
  function splitNames(s){ return String(s || '').split(/[,\n、·]+/).map(function(x){ return x.trim(); }).filter(Boolean); }

  loaders.org = async function(){
    try{
      orgUnits = await must(sb.from('org_units').select('*').order('sort', {ascending:true}));
      orgOriginal = JSON.stringify(orgUnits); orgDeleted = [];
      if(!orgUnits.length){
        orgUnits = await orgFromHomepage();
        if(orgUnits.length) toast('현재 홈페이지 조직도를 불러왔습니다. 저장을 누르면 관리가 시작됩니다.');
      }
      renderOrg(); markOrg();
    }catch(e){ $('orgEditor').innerHTML = '<p class="state-msg">' + esc(errText(e)) + '</p>'; }
  };
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
    $('orgEditor').innerHTML = ORG_SECTIONS.map(function(sec){
      var items = orgUnits.map(function(u, i){ return { u:u, i:i }; }).filter(function(x){ return x.u.section === sec.key; });
      return '<div class="panel"><div class="panel-head"><h3>' + esc(sec.name) + ' <span class="hint" style="font-weight:600;">(' + items.length + ')</span></h3><button type="button" class="btn btn-line btn-sm" data-oadd="' + sec.key + '">+ 추가</button></div>' +
        (sec.hint ? '<p class="hint" style="margin:-6px 0 12px;">' + sec.hint + '</p>' : '') +
        items.map(function(x){ return orgCard(x.u, x.i); }).join('') + '</div>';
    }).join('');
  }
  function orgCard(u, i){
    var move = '<button type="button" class="btn-mini" data-oa="up">▲</button><button type="button" class="btn-mini" data-oa="down">▼</button><button type="button" class="btn-mini danger" data-oa="del">삭제</button>';
    if(u.section === 'leader'){
      return '<div class="org-edit-card" data-i="' + i + '"><div class="row">' +
        '<input class="admin-input" style="width:150px;" data-of="title" placeholder="직책 (예: 회장)" value="' + esc(u.title) + '">' +
        '<input class="admin-input grow" data-of="members" placeholder="이름" value="' + esc(u.members) + '"></div>' +
        '<div class="row"><label class="chk">줄 번호 <input class="admin-input" type="number" min="1" max="20" style="width:70px;" data-of="tier" value="' + (u.tier || 1) + '"></label>' +
        '<label class="chk"><input type="checkbox" data-of="featured"' + (u.featured ? ' checked' : '') + '> 빨간 강조</label>' +
        '<label class="chk"><input type="checkbox" data-of="wide"' + (u.wide ? ' checked' : '') + '> 넓게</label>' +
        '<span class="grow"></span>' + move + '</div></div>';
    }
    var n = splitNames(u.members).length;
    return '<div class="org-edit-card" data-i="' + i + '"><div class="row">' +
      '<input class="admin-input grow" data-of="title" placeholder="' + (u.section === 'branch' ? '지회 이름 (예: 영덕읍지회)' : '위원회 이름 (예: 홍보위원장)') + '" value="' + esc(u.title) + '">' +
      '<input class="admin-input grow" data-of="leader" placeholder="' + (u.section === 'branch' ? '예: 지회장 홍길동' : '위원장 이름') + '" value="' + esc(u.leader) + '"></div>' +
      '<textarea data-of="members" placeholder="회원 이름을 쉼표로 구분해 적어주세요">' + esc(u.members) + '</textarea>' +
      '<div class="row" style="margin-top:8px;"><span class="count" data-count>' + n + '명</span><span class="grow"></span>' + move + '</div></div>';
  }
  function markOrg(){
    var changed = JSON.stringify(orgUnits) !== orgOriginal || orgDeleted.length > 0;
    setDirty('org', changed, changed ? '조직도에 저장하지 않은 변경사항이 있습니다' : '');
  }
  $('orgEditor').addEventListener('input', function(e){
    var card = e.target.closest('[data-i]'), f = e.target.dataset.of; if(!card || !f) return;
    var u = orgUnits[+card.dataset.i];
    u[f] = e.target.type === 'checkbox' ? e.target.checked : (f === 'tier' ? (parseInt(e.target.value, 10) || 1) : e.target.value);
    if(f === 'members'){ var c = card.querySelector('[data-count]'); if(c) c.textContent = splitNames(u.members).length + '명'; }
    markOrg();
  });
  $('orgEditor').addEventListener('change', function(e){
    if(e.target.type !== 'checkbox' || !e.target.dataset.of) return;
    orgUnits[+e.target.closest('[data-i]').dataset.i][e.target.dataset.of] = e.target.checked; markOrg();
  });
  $('orgEditor').addEventListener('click', function(e){
    var add = e.target.closest('[data-oadd]');
    if(add){
      var sec = add.dataset.oadd, same = orgUnits.filter(function(u){ return u.section === sec; });
      var tier = sec === 'leader' ? (same.length ? Math.max.apply(null, same.map(function(u){ return u.tier || 1; })) + 1 : 1) : 0;
      var lastIdx = -1; orgUnits.forEach(function(u, i){ if(u.section === sec) lastIdx = i; });
      var nu = { section:sec, tier:tier, title:'', leader:'', members:'', featured:false, wide:false };
      if(lastIdx >= 0) orgUnits.splice(lastIdx + 1, 0, nu); else orgUnits.push(nu);
      renderOrg(); markOrg();
      var cards = $('orgEditor').querySelectorAll('[data-i="' + orgUnits.indexOf(nu) + '"] input');
      if(cards[0]) cards[0].focus();
      return;
    }
    var b = e.target.closest('[data-oa]'); if(!b) return;
    var i = +b.closest('[data-i]').dataset.i, u = orgUnits[i], act = b.dataset.oa;
    if(act === 'del'){
      if(!confirm('"' + (u.title || '빈 칸') + '"을(를) 삭제할까요?')) return;
      if(u.id) orgDeleted.push(u.id);
      orgUnits.splice(i, 1);
    } else {
      var dir = act === 'up' ? -1 : 1, j = i + dir;
      while(j >= 0 && j < orgUnits.length && orgUnits[j].section !== u.section) j += dir;
      if(j < 0 || j >= orgUnits.length) return;
      orgUnits[i] = orgUnits[j]; orgUnits[j] = u;
    }
    renderOrg(); markOrg();
  });
  saveHandlers.org = async function(){
    if(!(await ensureSession())) return;
    var bad = orgUnits.find(function(u){ return !String(u.title || '').trim(); });
    if(bad){ toast('이름(직책)이 비어 있는 칸이 있습니다.', true); return; }
    orgUnits.forEach(function(u, i){ u.sort = i + 1; u.title = String(u.title).trim(); });
    if(orgDeleted.length) await must(sb.from('org_units').delete().in('id', orgDeleted));
    var existing = orgUnits.filter(function(u){ return u.id; }), fresh = orgUnits.filter(function(u){ return !u.id; });
    if(existing.length) await must(sb.from('org_units').upsert(existing, { onConflict:'id' }));
    if(fresh.length){
      var ins = await must(sb.from('org_units').insert(fresh).select());
      (ins || []).forEach(function(r){ var t = fresh.find(function(f){ return !f.id && f.sort === r.sort; }); if(t) t.id = r.id; });
    }
    orgOriginal = JSON.stringify(orgUnits); orgDeleted = [];
    renderOrg(); markOrg();
    toast('조직도를 저장했습니다.');
  };
  discardHandlers.org = function(){ orgUnits = JSON.parse(orgOriginal); orgDeleted = []; renderOrg(); markOrg(); };

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
    members = list; membersOriginal = JSON.stringify(members); membersDeleted = [];
    renderMembers(); markMembers();
    toast('회원 명단을 저장했습니다.');
  };
  discardHandlers.members = function(){ members = JSON.parse(membersOriginal); membersDeleted = []; renderMembers(); markMembers(); };
})();
