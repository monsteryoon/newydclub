/* 게시글 속 인터넷 주소 → 미리보기 카드 (누르면 새 창)
   미리보기 정보(제목·설명·대표 이미지)는 관리자가 글을 저장할 때 한 번 받아서
   site_settings 에 'lp:주소' 로 저장해 두고, 방문자는 저장된 것을 읽기만 합니다. */
window.NYDLinks = (function(){
  var URL_RE = /https?:\/\/[^\s<>"'`]+/g;
  function clean(u){ return String(u).replace(/[.,!?;:)\]]+$/, ''); }
  function esc(s){ return window.NYD ? window.NYD.escapeHtml(s) : String(s == null ? '' : s); }

  // 글에서 주소 뽑기 (중복 제거)
  function extract(text){
    var out = [];
    (String(text || '').match(URL_RE) || []).forEach(function(u){ u = clean(u); if(out.indexOf(u) < 0) out.push(u); });
    return out;
  }
  // 이미 HTML로 바뀐 본문 안의 주소를 새 창 링크로
  function linkify(html){
    return String(html).replace(/https?:\/\/[^\s<"']+/g, function(m){
      var u = clean(m), rest = m.slice(u.length);
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer" class="body-link">' + u + '</a>' + rest;
    });
  }
  function domain(u){ try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return u; } }
  function youtubeThumb(u){ var id = window.NYD && window.NYD.youtubeId(u); return id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : ''; }

  function cardHtml(u, p){
    p = p || {};
    var img = /^https:\/\//.test(p.image || '') ? p.image : youtubeThumb(u);
    var title = p.title || domain(u);
    return '<a class="link-card' + (img ? '' : ' no-img') + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' +
      (img ? '<span class="lc-img" style="background-image:url(&quot;' + esc(img) + '&quot;)"></span>' : '<span class="lc-img lc-icon" aria-hidden="true">🔗</span>') +
      '<span class="lc-txt"><b>' + esc(title) + '</b>' + (p.description ? '<span class="lc-desc">' + esc(p.description) + '</span>' : '') +
      '<span class="lc-site">' + esc(p.site || domain(u)) + ' ↗</span></span></a>';
  }

  async function load(urls){
    var map = {};
    if(!urls.length || !window.NYD || !window.NYD.sbRead) return map;
    try{
      var r = await window.NYD.sbRead.from('site_settings').select('key,value').in('key', urls.map(function(u){ return 'lp:' + u; }));
      (r.data || []).forEach(function(row){ try{ map[row.key.slice(3)] = JSON.parse(row.value); }catch(e){} });
    }catch(e){}
    return map;
  }

  // container 에 카드들을 그림
  async function render(container, urls){
    if(!container) return;
    urls = (urls || []).filter(Boolean).slice(0, 8);
    if(!urls.length){ container.innerHTML = ''; return; }
    container.innerHTML = urls.map(function(u){ return cardHtml(u, null); }).join('');
    var data = await load(urls);
    container.innerHTML = urls.map(function(u){ return cardHtml(u, data[u]); }).join('');
  }

  // 관리자용: 주소의 미리보기 정보 받아오기 (무료 미리보기 서비스 사용)
  async function fetchPreview(u){
    // 유튜브는 유튜브 공식 정보(oEmbed)로 제목·썸네일을 받음
    if(window.NYD && window.NYD.youtubeId(u)){
      try{
        var y = await (await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u))).json();
        return { title:(y.title || '').slice(0, 200), description:y.author_name ? y.author_name + ' · YouTube' : '', image:youtubeThumb(u) || y.thumbnail_url || '', site:'YouTube' };
      }catch(e){ return { title:'', description:'', image:youtubeThumb(u), site:'YouTube' }; }
    }
    try{
      var r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(u));
      var j = await r.json();
      if(j.status !== 'success' || !j.data) return null;
      var d = j.data;
      return { title: (d.title || '').slice(0, 200), description: (d.description || '').slice(0, 300),
               image: d.image && d.image.url || (d.logo && d.logo.url) || '', site: d.publisher || domain(u) };
    }catch(e){ return null; }
  }

  return { extract: extract, linkify: linkify, render: render, cardHtml: cardHtml, load: load, fetchPreview: fetchPreview, domain: domain };
})();
