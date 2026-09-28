/* 뉴영덕연합회 공통 스크립트 — 모든 페이지에서 사용 */
(function(){
  var SUPABASE_URL = 'https://nfpysoaykskfrhjchrfr.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mcHlzb2F5a3NrZnJoamNocmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTY4NDUsImV4cCI6MjEwMzc3Mjg0NX0.2LRo6_PuNrdK74JwQIagICTmkZPNJVgJ7vvgPf3QLHY';

  function noStoreFetch(url, options){
    options = options || {};
    options.cache = 'no-store';
    return fetch(url, options);
  }
  var ready = !!(window.supabase && window.supabase.createClient);
  // sb: 관리자 로그인 세션을 쓰는 클라이언트 (쓰기용)
  // sbRead: 항상 공개(anon) 권한으로 읽는 클라이언트 (읽기용)
  var sb = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: noStoreFetch } }) : null;
  var sbRead = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: noStoreFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }) : null;

  // 게시판 종류 — 여기에 한 줄 추가하면 게시판이 늘어납니다.
  var BOARDS = [
    { key: 'news',  name: '활동소식', desc: '뉴영덕연합회의 활동 소식을 전합니다.' },
    { key: 'press', name: '언론보도', desc: '언론에 소개된 뉴영덕연합회 이야기입니다.' },
    { key: 'data',  name: '자료실',   desc: '회의자료, 정관 등 연합회 자료를 모았습니다.' }
  ];

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  // 관리자가 입력한 글을 안전하게 HTML로: 줄바꿈 → <br>, *강조* → <em>
  function richText(str){
    return escapeHtml(str).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  }
  function formatDate(iso){
    if(!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if(isNaN(d)) return '';
    return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
  }
  function safeUrl(url){
    url = String(url || '').trim();
    if(/^(https?:)?\/\//i.test(url) || /^#[\w-]+$/.test(url) || /^[\w\-./]+(\?[\w\-=&%.]*)?(#[\w-]*)?$/.test(url)) return url;
    return '';
  }
  function youtubeId(url){
    var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/);
    return m ? m[1] : '';
  }

  /* 사진을 업로드 전에 적당한 크기(긴 변 2000px)로 줄여 빠르게 올리고 빠르게 보이게 */
  function resizeImage(file, maxSide, quality){
    maxSide = maxSide || 2000; quality = quality || 0.86;
    return new Promise(function(resolve){
      if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){ resolve(file); return; }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function(){
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        if(scale === 1 && file.size < 1500000){ resolve(file); return; }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob){
          if(!blob){ resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* site-media 저장소에 파일 업로드 → 공개 주소 반환 */
  async function uploadFile(file, folder, opts){
    opts = opts || {};
    var toSend = opts.raw ? file : await resizeImage(file);
    var ext = (toSend.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    var path = (folder || 'misc') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var res = await sb.storage.from('site-media').upload(path, toSend, { cacheControl: '31536000', upsert: false, contentType: toSend.type || undefined });
    if(res.error) throw res.error;
    return sb.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  }

  /* 헤더·모바일 메뉴·스크롤 등장 효과 (모든 페이지 공통) */
  function initChrome(){
    var header = document.getElementById('siteHeader');
    if(header){
      var onScroll = function(){ header.classList.toggle('is-scrolled', window.scrollY > 40); };
      document.addEventListener('scroll', onScroll, {passive:true});
      onScroll();
    }
    var burger = document.getElementById('burgerBtn');
    var panel = document.getElementById('mobilePanel');
    var closeBtn = document.getElementById('mobileClose');
    if(burger && panel){
      burger.addEventListener('click', function(){ panel.classList.add('open'); });
      if(closeBtn) closeBtn.addEventListener('click', function(){ panel.classList.remove('open'); });
      panel.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ panel.classList.remove('open'); }); });
    }
    observeReveal(document);
  }
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('is-visible'); io.unobserve(e.target); } });
  }, {threshold:0.12}) : null;
  function observeReveal(root){
    (root || document).querySelectorAll('.reveal:not(.is-visible)').forEach(function(el){
      if(io) io.observe(el); else el.classList.add('is-visible');
    });
  }

  // 조직도 기본 그룹 (관리자 화면에서 추가·이름 변경 가능)
  function defaultOrgGroups(st){
    st = st || {};
    return [
      { key:'leader', name:'회장단', type:'leader', show_head:false, badge:'' },
      { key:'branch', name:'지회', type:'cards', show_head:true, badge: st.org_branch_badge || '9개 읍·면' },
      { key:'committee', name:'위원회', type:'cards', show_head:true, badge: st.org_committee_badge || '12개 분과' }
    ];
  }
  function orgGroups(st){
    try{ var g = JSON.parse(st && st.org_groups || 'null'); if(Array.isArray(g) && g.length) return g; }catch(e){}
    return defaultOrgGroups(st);
  }
  function splitNames(str){
    return String(str || '').split(/[,\n、·]+/).map(function(x){ return x.trim(); }).filter(Boolean);
  }
  function parseList(v){ try{ var l = JSON.parse(v || '[]'); return Array.isArray(l) ? l : []; }catch(e){ return []; } }
  // 사진첩 주소에서 사진첩 번호 꺼내기
  function albumIdFromUrl(u){ var m = String(u || '').match(/gallery\.html\?album=([\w-]+)/); return m ? m[1] : null; }

  /* 조직도 → 회원 명단 연동: 조직도에 적힌 사람들을 (이름, 직책, 소속) 목록으로 */
  function unitGroupName(u, g){
    if(g && g.type === 'leader') return /사무국/.test(u.title || '') ? '사무국' : '임원단';
    return String(u.title || '').trim().replace(/위원장(?=\(|$)/, '위원회');
  }
  function orgPeople(groups, units){
    var byKey = {}; (groups || []).forEach(function(g){ byKey[g.key] = g; });
    var out = [];
    (units || []).forEach(function(u){
      var g = byKey[u.section] || { type:'cards' }, grp = unitGroupName(u, g);
      if(g.type === 'leader'){
        var role = String(u.title || '').trim();
        String(u.members || '').split(/[·,\n、]+/).forEach(function(tok){
          var parts = tok.trim().split(/\s+/).filter(Boolean); if(!parts.length) return;
          if(parts.length > 1) role = parts.slice(0, -1).join(' ');
          out.push({ name:parts[parts.length - 1], role:role, group:grp });
        });
      } else {
        var lead = String(u.leader || '').trim().split(/\s+/).filter(Boolean);
        if(lead.length) out.push({ name:lead[lead.length - 1], role: lead.length > 1 ? lead.slice(0, -1).join(' ') : (/위원장/.test(u.title || '') ? String(u.title).trim() : '대표'), group:grp });
        splitNames(u.members).forEach(function(n){ out.push({ name:n, role:'회원', group:grp }); });
      }
    });
    return out;
  }

  window.NYD = {
    unitGroupName: unitGroupName, orgPeople: orgPeople,
    defaultOrgGroups: defaultOrgGroups, orgGroups: orgGroups, splitNames: splitNames, parseList: parseList, albumIdFromUrl: albumIdFromUrl,
    sb: sb, sbRead: sbRead, ready: ready, BOARDS: BOARDS,
    escapeHtml: escapeHtml, richText: richText, formatDate: formatDate, safeUrl: safeUrl, youtubeId: youtubeId,
    resizeImage: resizeImage, uploadFile: uploadFile, initChrome: initChrome, observeReveal: observeReveal,
    boardName: function(key){ var b = BOARDS.find(function(x){ return x.key === key; }); return b ? b.name : key; }
  };
})();
