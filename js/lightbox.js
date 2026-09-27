/* 사진 크게 보기 (좌우 넘기기, 키보드, 스와이프) */
window.NYDLightbox = (function(){
  var box, img, cap, cnt, list = [], idx = 0, startX = null;
  function el(id){ return document.getElementById(id); }
  function show(i){
    if(!list.length) return;
    idx = (i + list.length) % list.length;
    img.src = list[idx].url; img.alt = list[idx].caption || '사진 ' + (idx+1);
    cap.textContent = list[idx].caption || '';
    cnt.textContent = (idx+1) + ' / ' + list.length;
    var multi = list.length > 1;
    el('lbPrev').style.display = multi ? '' : 'none';
    el('lbNext').style.display = multi ? '' : 'none';
  }
  function open(items, i){ list = items; box.classList.add('open'); document.body.style.overflow = 'hidden'; show(i || 0); }
  function close(){ box.classList.remove('open'); document.body.style.overflow = ''; img.src = ''; }
  function init(){
    box = el('lightbox'); if(!box) return;
    img = el('lbImg'); cap = el('lbCaption'); cnt = el('lbCount');
    el('lbClose').onclick = close;
    el('lbPrev').onclick = function(e){ e.stopPropagation(); show(idx-1); };
    el('lbNext').onclick = function(e){ e.stopPropagation(); show(idx+1); };
    box.addEventListener('click', function(e){ if(e.target === box) close(); });
    document.addEventListener('keydown', function(e){
      if(!box.classList.contains('open')) return;
      if(e.key === 'Escape') close();
      else if(e.key === 'ArrowLeft') show(idx-1);
      else if(e.key === 'ArrowRight') show(idx+1);
    });
    box.addEventListener('touchstart', function(e){ startX = e.touches[0].clientX; }, {passive:true});
    box.addEventListener('touchend', function(e){
      if(startX == null) return;
      var dx = e.changedTouches[0].clientX - startX; startX = null;
      if(Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { open: open, close: close };
})();
