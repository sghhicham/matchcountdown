<script>
(function(){
  // ---- أدوات مساعدة ----
  function parseMatchDate(txt){
    if(!txt) return null;
    // قبول ISO أو HH:MM
    if(txt.indexOf('T') !== -1 || txt.indexOf('-') !== -1) return new Date(txt);
    const m = txt.match(/^(\d{1,2}):(\d{2})$/);
    if(m){
      const hh = parseInt(m[1],10), mm = parseInt(m[2],10);
      const n = new Date(), y = n.getFullYear(), mo = n.getMonth(), d = n.getDate();
      return new Date(Date.UTC(y,mo,d,hh-1,mm,0)); // لاحظ تعويض UTC+1 كما في كودك الأصلي
    }
    return new Date(txt);
  }

  function formatTimeFromMatch(dateStr){
    if(!dateStr) return '';
    try{
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Africa/Algiers' }).format(d);
    }catch(e){ return ''; }
  }

  function safeHideElement(el){
    try{ el.style.display = 'none'; }catch(e){}
  }

  // ---- معايير ضبط الوميض والسلوك الفوري ----
  const immediateGuard = 800;      // ms قبل البدء نعتبره "فوري" لتجنب السباق/الوميض
  const alertMinRemaining = 5000;  // ms: لا نُنشئ شريط إلا إن بقي أكثر من 5s
  const alertStabilityInterval = 90;
  const alertStabilityChecks = 4;

  // ---- دالة إدراج iframe فورياً (بدون عدّاد ولا شريط) ----
  function insertIframeImmediately(el, src, hideDate){
    try{ // تنظيف أي شريط متبقٍ حول العنصر
      if(el.parentNode) {
        const parent = el.parentNode;
        parent.querySelectorAll('.mc-alert').forEach(a => { try{ a.remove(); }catch(e){} });
      }
    }catch(e){}

    // إن كان العنصر فارغًا أو قد أُدرج مسبقًا نتحقق
    if(el._iframeInserted) return;
    el._iframeInserted = true;

    // إنشاء وادراج iframe بلا مؤثرات
    const player = document.createElement('div');
    player.style.marginTop = '12px';
    try{ el.appendChild(player); }catch(e){}

    const ifr = document.createElement('iframe');
    ifr.src = src || 'about:blank';
    ifr.width = '100%';
    ifr.height = '600';
    ifr.setAttribute('frameborder','0');
    ifr.setAttribute('allowfullscreen','');
    ifr.setAttribute('sandbox','allow-scripts allow-same-origin');
    ifr.setAttribute('referrerPolicy','no-referrer');
    ifr.className = 'mc-iframe';
    ifr.style.border = '0';
    ifr.style.boxSizing = 'border-box';
    ifr.style.borderRadius = '10px';
    ifr.style.boxShadow = '0 0 25px rgba(0,0,0,0.25)';
    try{ player.appendChild(ifr); }catch(e){}
    // حدث لإبلاغ أي مراقب (الشريط/غيره) أن iframe أُدرج
    try{ el.dispatchEvent(new Event('mc:iframe-inserted')); }catch(e){}

    // لو כבר مرت data-hide نُخفي المحتوى بأمان
    if(hideDate && new Date() >= hideDate){
      setTimeout(()=>{ safeHideElement(el); }, 10);
      return;
    }

    // مراقبة hideDate بعد الإدراج
    const watch = setInterval(()=>{
      if(hideDate && new Date() >= hideDate){
        try{ ifr.style.transition = 'opacity .6s ease, transform .6s ease'; ifr.style.opacity = '0'; ifr.style.transform = 'translateY(-8px)'; }catch(e){}
        setTimeout(()=>{ safeHideElement(el); clearInterval(watch); }, 620);
      }
      if(!document.body.contains(el)) clearInterval(watch);
    }, 1000);
  }

  // ---- الشريط الآمن (لن يدخل إلى DOM إطلاقًا حتى نتأكد) ----
  function initSafeAlert(el){
    if(el._alertInit) return;
    el._alertInit = true;

    const hideDate = el.dataset.hide ? parseMatchDate(el.dataset.hide) : null;
    const matchDate = el.dataset.match ? parseMatchDate(el.dataset.match) : null;

    // لو انتهى hideDate مسبقاً نخفي العنصر بأمان
    if(hideDate && new Date() >= hideDate){
      safeHideElement(el);
      return;
    }

    // لو الوقت فوري أو قريب جدًا — لا نعرض الشريط إطلاقًا
    const now = new Date();
    if(!matchDate || now >= matchDate || (matchDate - now) <= immediateGuard){
      // لا شيء — العدّاد أو السكربت الأساسي سيتعامل مع الإدراج
      return;
    }

    // كذلك، إذا العنصر قد أشعر بأنه سيفعل إدراج iframe قريبًا (بحكم العدّاد) فلن نعرض
    if(el._willInsertIframe) return;

    // نراقب DOM لو دخل iframe قبل انتهاء نافذة الاستقرار (فورًا نلغي)
    let mo = null;
    try{
      mo = new MutationObserver(muts=>{
        for(const m of muts){
          if(m.type === 'childList'){
            for(const n of m.addedNodes){
              if(n && n.tagName && n.tagName.toLowerCase() === 'iframe'){
                if(el._stabTimer){ clearInterval(el._stabTimer); delete el._stabTimer; }
                try{ mo.disconnect(); }catch(e){}
                return;
              }
            }
          }
        }
      });
      mo.observe(el, { childList: true, subtree: true });
    }catch(e){
      mo = null;
    }

    // نافذة استقرار صارمة: نتحقق N مرات متتاليات قبل الإنشاء
    let good = 0;
    el._stabTimer = setInterval(()=>{
      // قبل أي إنشاء نتحقق: لازال الوقت كافياً (> alertMinRemaining)؟ لا يوجد iframe؟ لم يُعلَم willInsert؟
      const now2 = new Date();
      const rem = matchDate - now2;
      const ok = (document.body.contains(el) &&
                  !el.querySelector('iframe') &&
                  !el._willInsertIframe &&
                  (!hideDate || new Date() < hideDate) &&
                  rem > alertMinRemaining);
      if(ok) good++; else good = 0;

      if(good >= alertStabilityChecks){
        clearInterval(el._stabTimer); delete el._stabTimer;
        try{ if(mo) mo.disconnect(); }catch(e){}
        // فحص نهائي للسباق
        const now3 = new Date();
        if(!document.body.contains(el)) return;
        if(el.querySelector('iframe')) return;
        if(el._willInsertIframe) return;
        if(hideDate && new Date() >= hideDate) { safeHideElement(el); return; }
        if(!matchDate) return;
        if((matchDate - now3) <= alertMinRemaining) return;

        // الآن آمن لإنشاء الشريط — نُنشئه وندخله
        const timeStr = formatTimeFromMatch(el.dataset.match || '');
        const msg = timeStr ? `⚠️ المباراة ستنطلق على الساعة ${timeStr} — الرجاء البقاء معنا حتى يبدأ البث.` :
                              `⚠️ انتبه — البث سيبدأ عند انتهاء العدّاد. الرجاء البقاء معنا.`;
        const bar = document.createElement('div');
        bar.className = 'mc-alert';
        bar.innerHTML = `<div class="mc-text">${msg}</div><button class="mc-close" aria-label="إغلاق">×</button>`;

        // style (مرة واحدة)
        if(!document.getElementById('mc-alert-style')){
          const style = document.createElement('style'); style.id = 'mc-alert-style';
          style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@700;800&display=swap');
            .mc-alert{direction:rtl;box-sizing:border-box;width:100%;max-width:820px;margin:10px auto 14px;padding:12px 16px;border-radius:10px;
              background:#007bff;color:#fff;font-family:'Tajawal',sans-serif;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:12px;
              box-shadow:0 4px 18px rgba(0,0,0,0.1);transform:translateY(-8px);opacity:0;transition:all .45s ease;}
            .mc-alert.show{transform:translateY(0);opacity:1}
            .mc-alert .mc-text{flex:1;font-size:17px}
            .mc-alert .mc-close{background:rgba(255,255,255,0.15);border:0;color:#fff;padding:5px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:18px}
            .mc-alert .mc-close:hover{background:rgba(255,255,255,0.25)}
          `;
          document.head.appendChild(style);
        }

        // إدراج الشريط في DOM (هذا السطر يُنفّذ فقط بعد التحقق الكامل — يقتل كل وميض)
        try{ el.parentNode.insertBefore(bar, el); }catch(e){}
        setTimeout(()=> bar.classList.add('show'), 12);
        bar.querySelector('.mc-close').addEventListener('click', ()=> bar.remove());

        // راقب لاحقًا لو دخل iframe نحذفه فوراً
        const rr = setInterval(()=>{
          if(!document.body.contains(el) || el.querySelector('iframe')){
            try{ bar.remove(); }catch(e){}
            clearInterval(rr);
          }
        }, 250);
      }
    }, alertStabilityInterval);

    // تنظيف لو اختفى العنصر
    const domWatch = setInterval(()=>{
      if(!document.body.contains(el)){
        if(el._stabTimer){ clearInterval(el._stabTimer); delete el._stabTimer; }
        try{ if(mo) mo.disconnect(); }catch(e){}
        clearInterval(domWatch);
      }
    }, 800);
  }

  // ---- العدّاد والإدراج (نسخة آمنة ومختصرة) ----
  function initCountdown(el){
    if(el._inited) return; el._inited = true;

    const matchDate = el.dataset.match ? parseMatchDate(el.dataset.match) : null;
    const iframeSrc = el.dataset.iframe || 'about:blank';
    const hideDate = el.dataset.hide ? parseMatchDate(el.dataset.hide) : null;

    // إذا hideDate مضى — نخفي العنصر بأمان
    if(hideDate && new Date() >= hideDate){
      safeHideElement(el);
      return;
    }

    if(!matchDate || isNaN(matchDate.getTime())){
      el.innerHTML = "<div style='color:#a00;padding:12px;text-align:center'>⚠️ خطأ في توقيت المباراة</div>";
      return;
    }

    const now = new Date();
    // إذا الوقت وصل أو قريب جدًا => إدراج iframe فوراً (بدون عدّاد ولا شريط)
    if(now >= matchDate || (matchDate - now) <= immediateGuard){
      insertIframeImmediately(el, iframeSrc, hideDate);
      return;
    }

    // خلاف ذلك: نبني واجهة العدّاد (كما في النسخة الأصلية) + نبلغ الشريط عندما يقترب الإدراج
    if(!document.getElementById('mc-count-style')){
      const s = document.createElement('style'); s.id = 'mc-count-style';
      s.textContent = `
        .cd-wrap{font-family:Tajawal,system-ui,Arial; text-align:center;color:#222;box-sizing:border-box;width:100%;margin:0 auto;}
        .count-pair{display:flex;gap:14px;justify-content:center;flex-wrap:nowrap;align-items:flex-start}
        .count-card{flex:0 0 calc(50% - 14px);max-width:calc(50% - 14px);min-width:120px;box-sizing:border-box;
                    padding:6px;border-radius:12px;background:linear-gradient(180deg,#fff,#f5f8ff);
                    box-shadow:0 8px 22px rgba(0,0,0,0.05);position:relative}
        .cd-ring-holder{position:relative;width:100%;max-width:120px;margin:0 auto;height:130px}
        .cd-num{position:absolute;left:50%;top:60%;transform:translate(-55%,-50%);font-size:34px;font-weight:900}
        .cd-label{margin-top:8px;color:#444;font-size:13px;font-weight:500}
        .fade-out{opacity:0;transform:translateY(-8px);transition:opacity .6s ease,transform .6s ease}
        .mc-iframe{width:100%;height:600px;border:0;border-radius:10px;box-shadow:0 0 25px rgba(0,0,0,0.25);display:block}
        @media(max-width:420px){ .cd-num{font-size:28px} .cd-ring-holder{height:110px} }
      `;
      document.head.appendChild(s);
    }

    // بناء واجهة العدّاد (مطابقة تقريبًا لنسختك الأصلية)
    el.innerHTML = ''; el.classList.add('cd-wrap');
    const content = document.createElement('div'); el.appendChild(content);
    const pair = document.createElement('div'); pair.className = 'count-pair'; content.appendChild(pair);

    function createRing(color,label){
      const card = document.createElement('div'); card.className = 'count-card';
      const holder = document.createElement('div'); holder.className = 'cd-ring-holder';
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox','0 0 130 130'); svg.style.width='100%'; svg.style.height='130px';
      const base = document.createElementNS(svgNS,'circle'); base.setAttribute('cx',65); base.setAttribute('cy',65); base.setAttribute('r',52);
      base.setAttribute('stroke','#e6eef3'); base.setAttribute('stroke-width',10); base.setAttribute('fill','none'); svg.appendChild(base);
      for(let i=0;i<60;i++){
        const ang=(i/60)*Math.PI*2; const out=58; const inn=(i%5===0)?43:48;
        const x1=65+Math.cos(ang)*inn, y1=65+Math.sin(ang)*inn, x2=65+Math.cos(ang)*out, y2=65+Math.sin(ang)*out;
        const ln=document.createElementNS(svgNS,'line'); ln.setAttribute('x1',x1); ln.setAttribute('y1',y1); ln.setAttribute('x2',x2); ln.setAttribute('y2',y2);
        ln.setAttribute('stroke',(i%5===0)?color:'#dfe8ee'); ln.setAttribute('stroke-width',(i%5===0)?1.6:0.9); ln.setAttribute('stroke-linecap','round'); svg.appendChild(ln);
      }
      const prog = document.createElementNS(svgNS,'circle'); prog.setAttribute('cx',65); prog.setAttribute('cy',65); prog.setAttribute('r',52);
      prog.setAttribute('fill','none'); prog.setAttribute('stroke-linecap','round'); prog.setAttribute('stroke-width',9); prog.setAttribute('transform','rotate(-90 65 65)');
      const C = 2*Math.PI*52; prog.setAttribute('stroke-dasharray',C); prog.setAttribute('stroke-dashoffset',C); prog.setAttribute('stroke',color); prog.style.transition='stroke-dashoffset .4s linear';
      svg.appendChild(prog);
      holder.appendChild(svg); card.appendChild(holder);
      const num = document.createElement('div'); num.className='cd-num'; num.style.color=color; num.textContent='00'; holder.appendChild(num);
      const lbl = document.createElement('div'); lbl.className='cd-label'; lbl.textContent=label; card.appendChild(lbl);
      return {card, prog, C, num};
    }

    const left = createRing('#00caff','دقيقة');
    const right = createRing('#00d87a','ثانية');
    pair.appendChild(left.card); pair.appendChild(right.card);

    const player = document.createElement('div'); player.style.marginTop='12px'; el.appendChild(player);

    let shown = false; let timer = null;
    let willNotified = false;
    const willInsertThreshold = 900; // ms قبل الإدراج نبلّغ الشريط (وهذا يمنع وميض لاحق)

    function tick(){
      const now2 = new Date(); const diff = Math.max(0, matchDate - now2);
      const totalS = Math.floor(diff/1000);
      const mins = Math.floor((totalS % 3600) / 60);
      const secs = Math.floor(totalS % 60);
      left.num.textContent = String(mins).padStart(2,'0');
      right.num.textContent = String(secs).padStart(2,'0');
      left.prog.setAttribute('stroke-dashoffset', left.C * (1 - (mins/60)));
      right.prog.setAttribute('stroke-dashoffset', right.C * (1 - (secs/60)));

      // إن اقتربنا نعلم الشريط أنه "سيُدرَج" قريباً — الشريط عند سمعه لن يبدأ أبداً.
      if(!willNotified && diff <= willInsertThreshold){
        willNotified = true;
        try{ el._willInsertIframe = true; el.dispatchEvent(new Event('mc:iframe-will-insert')); }catch(e){}
      }

      if(diff === 0 && !shown){
        shown = true;
        content.classList.add('fade-out');
        setTimeout(()=>{
          content.style.display = 'none';
          // إدراج iframe بعد العدّاد
          const ifr = document.createElement('iframe');
          ifr.src = iframeSrc; ifr.width='100%'; ifr.height='600';
          ifr.setAttribute('frameborder','0'); ifr.setAttribute('allowfullscreen',''); ifr.setAttribute('sandbox','allow-scripts allow-same-origin');
          ifr.setAttribute('referrerPolicy','no-referrer'); ifr.className='mc-iframe';
          ifr.style.border='0'; ifr.style.boxSizing='border-box'; ifr.style.borderRadius='10px'; ifr.style.boxShadow='0 0 25px rgba(0,0,0,0.25)';
          player.appendChild(ifr);
          try{ el.dispatchEvent(new Event('mc:iframe-inserted')); }catch(e){}
          // لو hideDate فات بعد الإدراج نُخفي المحتوى بأمان
          if(hideDate && new Date() >= hideDate){
            setTimeout(()=>{ safeHideElement(el); }, 10);
            return;
          }
          // راقب hideDate بعد الإدراج
          const watch2 = setInterval(()=>{
            if(hideDate && new Date() >= hideDate){
              try{ ifr.style.transition='opacity .6s ease, transform .6s ease'; ifr.style.opacity='0'; ifr.style.transform='translateY(-8px)'; }catch(e){}
              setTimeout(()=>{ safeHideElement(el); clearInterval(watch2); }, 620);
            }
            if(!document.body.contains(el)) clearInterval(watch2);
          }, 1000);
        }, 600);
        if(timer){ clearInterval(timer); timer = null; }
      }
    }

    tick();
    timer = setInterval(tick, 1000);
    // كذلك نهيّئ الشريط الآمن هنا (كذلك لن يُدرج إلا بعد تحقق صارم)
    initSafeAlert(el);
  }

  // تهيئة كل العناصر عند تحميل الصفحة
  function setupAll(){
    document.querySelectorAll('.match-countdown').forEach(function(el){
      // في التحميل الأولي نقرر إن كان الiframe يُدرج فورا (تفادي الوميض)
      const matchDate = el.dataset.match ? parseMatchDate(el.dataset.match) : null;
      const hideDate = el.dataset.hide ? parseMatchDate(el.dataset.hide) : null;
      const now = new Date();

      // لو hideDate انتهت — نخفي العنصر فوراً
      if(hideDate && now >= hideDate){
        try{ el.style.display = 'none'; }catch(e){}
        return;
      }

      // إذا الوقت وصل أو قريب جدًا — إدراج iframe فوراً وارجاء أي عدّاد/شريط
      if(!matchDate){ initSafeAlert(el); return; }
      if(now >= matchDate || (matchDate - now) <= immediateGuard){
        insertIframeImmediately(el, el.dataset.iframe || 'about:blank', hideDate);
        return;
      }

      // خلاف ذلك نهيئ العدّاد (الذي بدوره ينشئ iframe عند الصفر) والشريط الآمن
      initCountdown(el);
    });
  }

  document.addEventListener('DOMContentLoaded', setupAll);
  setTimeout(setupAll, 800);
})();
</script>
