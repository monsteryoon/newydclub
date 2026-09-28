/* 회원카드: 이름에 마우스를 올리면(휴대폰은 누르면) 사진·직책·소속·지역·전화·직업이 담긴 카드가 뜸
   사용법: NYDPerson.load() 로 회원 정보를 불러오고, 이름 요소에 class="person" data-name data-group 을 붙이면 됨 */
window.NYDPerson = (function(){
  var N = window.NYD, esc = N.escapeHtml;
  var people = {}, byName = {}, card = null, showTimer = null, hideTimer = null, current = null, loaded = null;
  var hoverable = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function key(name, group){ return String(name || '').trim() + '|' + String(group || '').trim(); }
  function add(p){
    var k = key(p.name, p.group);
    people[k] = Object.assign({}, people[k] || {}, p);
    (byName[p.name] = byName[p.name] || []).push(people[k]);
  }
  function find(name, group){
    var p = people[key(name, group)];
    if(p) return p;
    var list = byName[String(name || '').trim()] || [];
    return list.length === 1 ? list[0] : { name:name, group:group };
  }

  // 회원 명단 + 공개 전화번호 + (선택) 조직도에서 뽑은 사람들
  function load(orgPeopleList){
    if(loaded) return loaded;
    var R = N.sbRead;
    loaded = !R ? Promise.resolve() : Promise.all([
      R.from('members').select('*').then(function(r){ return r.error ? [] : r.data || []; }, function(){ return []; }),
      R.from('member_contacts').select('member_id,phone').then(function(r){ return r.error ? [] : r.data || []; }, function(){ return []; })
    ]).then(function(res){
      var phones = {};
      res[1].forEach(function(c){ phones[c.member_id] = c.phone; });
      res[0].forEach(function(m){ add({ name:m.name, role:m.role, group:m.group, business:m.business, region:m.region, photo:m.photo_url, phone:phones[m.id] || '' }); });
      (orgPeopleList || []).forEach(function(p){ if(!people[key(p.name, p.group)]) add({ name:p.name, role:p.role, group:p.group }); });
    });
    return loaded;
  }
  function addPeople(list){ (list || []).forEach(function(p){ if(!people[key(p.name, p.group)]) add(p); }); }

  function telHref(t){ var d = String(t || '').replace(/[^\d+]/g, ''); return d.length >= 8 ? 'tel:' + d : ''; }
  function html(p){
    var photo = N.safeUrl(p.photo);
    var initial = String(p.name || '?').trim().charAt(0);
    var rows = [];
    if(p.region) rows.push(['지역', esc(p.region)]);
    if(p.phone){ var h = telHref(p.phone); rows.push(['전화', h ? '<a href="' + h + '">' + esc(p.phone) + '</a>' : esc(p.phone)]); }
    if(p.business) rows.push(['직업·사업체', esc(p.business)]);
    return '<div class="pc-top">' +
        (photo ? '<span class="pc-photo" style="background-image:url(&quot;' + esc(photo) + '&quot;)"></span>' : '<span class="pc-photo pc-initial">' + esc(initial) + '</span>') +
        '<span class="pc-head"><b>' + esc(p.name) + '</b>' +
          (p.role ? '<span class="pc-role">' + esc(p.role) + '</span>' : '') +
          (p.group ? '<span class="pc-group">' + esc(p.group) + '</span>' : '') + '</span>' +
        '<button type="button" class="pc-close" aria-label="닫기">×</button></div>' +
      (rows.length ? '<dl class="pc-rows">' + rows.map(function(r){ return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'
                   : '<p class="pc-empty">등록된 추가 정보가 없습니다.</p>');
  }
  function ensureCard(){
    if(card) return card;
    card = document.createElement('div');
    card.className = 'person-card';
    card.setAttribute('role', 'dialog');
    card.addEventListener('mouseenter', function(){ clearTimeout(hideTimer); });
    card.addEventListener('mouseleave', function(){ if(hoverable) hideSoon(); });
    card.addEventListener('click', function(e){ if(e.target.closest('.pc-close')) hide(); });
    document.body.appendChild(card);
    return card;
  }
  function position(el){
    var c = ensureCard();
    if(window.innerWidth <= 560){ c.classList.add('sheet'); c.style.left = ''; c.style.top = ''; return; }
    c.classList.remove('sheet');
    var r = el.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight, gap = 10;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    var top = r.bottom + gap;
    if(top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - gap);
    c.style.left = left + 'px'; c.style.top = top + 'px';
  }
  function show(el){
    clearTimeout(hideTimer);
    var p = find(el.getAttribute('data-name'), el.getAttribute('data-group'));
    var c = ensureCard();
    c.innerHTML = html(p);
    c.setAttribute('aria-label', (p.name || '') + ' 회원 정보');
    c.classList.add('open');
    current = el;
    position(el);
  }
  function hide(){ clearTimeout(showTimer); if(card) card.classList.remove('open'); current = null; }
  function hideSoon(){ clearTimeout(hideTimer); hideTimer = setTimeout(hide, 220); }

  // 문서 전체에서 .person 에 반응
  document.addEventListener('mouseover', function(e){
    if(!hoverable) return;
    var el = e.target.closest && e.target.closest('.person'); if(!el) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    showTimer = setTimeout(function(){ loaded ? loaded.then(function(){ show(el); }) : show(el); }, 120);
  });
  document.addEventListener('mouseout', function(e){
    if(!hoverable) return;
    var el = e.target.closest && e.target.closest('.person'); if(!el) return;
    if(e.relatedTarget && (el.contains(e.relatedTarget) || (card && card.contains(e.relatedTarget)))) return;
    clearTimeout(showTimer); hideSoon();
  });
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('.person');
    if(el){
      e.preventDefault(); e.stopPropagation();   // 조직 카드가 접히지 않게
      if(current === el && card && card.classList.contains('open')){ if(!hoverable) hide(); }
      else (loaded || Promise.resolve()).then(function(){ show(el); });
      return;
    }
    if(card && card.classList.contains('open') && !card.contains(e.target)) hide();
  }, true);
  document.addEventListener('focusin', function(e){ var el = e.target.closest && e.target.closest('.person'); if(el && hoverable) (loaded || Promise.resolve()).then(function(){ show(el); }); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') hide(); });
  window.addEventListener('scroll', function(){ if(current && card && card.classList.contains('open') && !card.classList.contains('sheet')) position(current); }, { passive:true });

  function tag(name, group, text){
    return '<button type="button" class="person" data-name="' + esc(name) + '" data-group="' + esc(group || '') + '">' + esc(text == null ? name : text) + '</button>';
  }
  return { load: load, addPeople: addPeople, tag: tag, show: show, hide: hide };
})();
