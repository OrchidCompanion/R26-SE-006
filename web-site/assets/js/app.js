/* TRAVION — interactions & widgets */
(function() {
  'use strict';

  /* ---------- Preloader ---------- */
  window.addEventListener('load', () => {
    const pl = document.getElementById('preloader');
    if (pl) setTimeout(() => pl.classList.add('hide'), 500);
  });

  /* ---------- Scroll progress ---------- */
  const progressBar = document.getElementById('progressBar');
  const onScroll = () => {
    const h = document.documentElement;
    const scrolled = (h.scrollTop) / (h.scrollHeight - h.clientHeight);
    if (progressBar) progressBar.style.width = (scrolled * 100) + '%';
    const bt = document.getElementById('backTop');
    if (bt) bt.classList.toggle('show', h.scrollTop > 600);
    // Update active nav link
    const sections = document.querySelectorAll('section[id], header[id]');
    let active = '';
    sections.forEach(s => {
      const top = s.getBoundingClientRect().top;
      if (top <= 120) active = s.id;
    });
    document.querySelectorAll('.dk-item, .tabbar a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href === '#' + active) a.classList.add('active');
      else a.classList.remove('active');
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Cursor (desktop only) ---------- */
  if (window.matchMedia('(pointer: fine)').matches) {
    const cursor = document.getElementById('cursor');
    const dot = document.getElementById('cursorDot');
    if (cursor && dot) {
      let mx = 0, my = 0, cx = 0, cy = 0;
      document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`; });
      const tick = () => { cx += (mx - cx) * 0.18; cy += (my - cy) * 0.18; cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`; requestAnimationFrame(tick); };
      tick();
      document.querySelectorAll('a, button, [data-hover]').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
      });
    }
  }

  /* ---------- Reveal-on-scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------- Typed hero word ---------- */
  const typed = document.getElementById('typedText');
  if (typed) {
    const words = ['Ceylon', 'the Pearl', 'Serendib', 'Sri Lanka'];
    let wi = 0, ci = 0, del = false;
    const typeTick = () => {
      const w = words[wi];
      if (!del) {
        ci++;
        typed.textContent = w.slice(0, ci);
        if (ci === w.length) { del = true; setTimeout(typeTick, 1500); return; }
      } else {
        ci--;
        typed.textContent = w.slice(0, ci);
        if (ci === 0) { del = false; wi = (wi+1) % words.length; }
      }
      setTimeout(typeTick, del ? 55 : 100);
    };
    setTimeout(typeTick, 600);
  }

  /* ---------- Animated counters ---------- */
  const counters = document.querySelectorAll('[data-count]');
  const countIO = new IntersectionObserver((ents) => {
    ents.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const end = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      let start = 0, dur = 1400, t0 = performance.now();
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        const e2 = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(start + (end - start) * e2) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => countIO.observe(c));

  /* ---------- Phone slideshow (hero) ---------- */
  const phSlides = document.querySelectorAll('.ph-slide');
  const phDots = document.querySelectorAll('.ph-dots i');
  let phIdx = 0;
  const goPh = (i) => {
    phSlides.forEach(s => s.classList.remove('active'));
    phDots.forEach(d => d.classList.remove('active'));
    phSlides[i]?.classList.add('active');
    phDots[i]?.classList.add('active');
    phIdx = i;
  };
  phDots.forEach((d,i) => d.addEventListener('click', () => goPh(i)));
  if (phSlides.length) setInterval(() => goPh((phIdx+1) % phSlides.length), 4200);

  /* ---------- Dock dropdown ---------- */
  document.querySelectorAll('[data-popover]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.popover;
      document.querySelectorAll('.dk-popover').forEach(p => { if (p.id !== id) p.classList.remove('open'); });
      document.getElementById(id)?.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.dk-popover').forEach(p => p.classList.remove('open'));
  });

  /* ---------- Smooth scroll for anchors ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const h = a.getAttribute('href');
      if (h.length > 1) {
        const t = document.querySelector(h);
        if (t) {
          e.preventDefault();
          document.querySelectorAll('.dk-popover').forEach(p => p.classList.remove('open'));
          window.scrollTo({ top: t.offsetTop - 20, behavior: 'smooth' });
        }
      }
    });
  });

  /* =======================================================
     WIDGET — Interactive Sri Lanka Map
     ======================================================= */
  const destinations = [
    { id:'sigiriya', x:52, y:34, name:'Sigiriya', region:'Cultural Triangle', desc:'UNESCO rock fortress with ancient frescoes rising 200m above the jungle. Best visited at sunrise.', img:'https://images.unsplash.com/photo-1588428895011-6082a719447b?q=80&w=800&auto=format&fit=crop', meta:['5 hr hike','UNESCO','Best: 6–10am'] },
    { id:'kandy', x:52, y:48, name:'Kandy', region:'Central Highlands', desc:'Sacred city cradled around a lake, home to the Temple of the Tooth Relic and nightly cultural dance.', img:'https://images.unsplash.com/photo-1578922746465-3a80a228f223?q=80&w=800&auto=format&fit=crop', meta:['UNESCO','Temple','1 day'] },
    { id:'ella', x:62, y:62, name:'Ella', region:'Hill Country', desc:'Misty mountain town with the Nine Arch Bridge, cascading waterfalls and the world\'s most scenic train.', img:'https://images.unsplash.com/photo-1620736203049-d191eb5a67a9?q=80&w=800&auto=format&fit=crop', meta:['Train','Hiking','2 days'] },
    { id:'galle', x:38, y:82, name:'Galle', region:'Southern Coast', desc:'Dutch colonial fort on a sun-baked peninsula. Cobbled lanes, artisan cafes and lighthouse sunsets.', img:'https://images.unsplash.com/photo-1566296314736-6eaac1ca0cb9?q=80&w=800&auto=format&fit=crop', meta:['UNESCO','Coast','1 day'] },
    { id:'mirissa', x:42, y:89, name:'Mirissa', region:'South Coast', desc:'Coconut tree hill and blue whale watching. Crescent beach perfect for stilt-fisher silhouettes.', img:'https://images.unsplash.com/photo-1566369421085-c95bf99c5a95?q=80&w=800&auto=format&fit=crop', meta:['Whales','Beach','Surf'] },
    { id:'yala', x:62, y:78, name:'Yala', region:'South-East', desc:'Leopard-density capital of the world. Safari among rock outcrops, lagoons and jungle at dawn.', img:'https://images.unsplash.com/photo-1567596388756-f6d710c8fa8c?q=80&w=800&auto=format&fit=crop', meta:['Safari','Wildlife','Sunrise'] },
    { id:'nuwara', x:50, y:58, name:'Nuwara Eliya', region:'Tea Country', desc:'Little England — manicured tea estates, pink post offices and a cool mountain climate.', img:'https://images.unsplash.com/photo-1591294391014-1f6a53055e03?q=80&w=800&auto=format&fit=crop', meta:['Tea tour','Cool','17°C'] },
    { id:'trincomalee', x:78, y:34, name:'Trincomalee', region:'East Coast', desc:'Turquoise coral bays, Pigeon Island snorkelling and the towering Koneswaram temple.', img:'https://images.unsplash.com/photo-1578330985946-e83eff7e5d4b?q=80&w=800&auto=format&fit=crop', meta:['Snorkel','Temple','Beach'] }
  ];
  const slMap = document.getElementById('slMap');
  if (slMap) {
    const pinLayer = document.getElementById('slPins');
    const detail = document.getElementById('slDetail');
    destinations.forEach(d => {
      const pin = document.createElement('div');
      pin.className = 'sl-pin'; pin.style.left = d.x + '%'; pin.style.top = d.y + '%';
      pin.innerHTML = `<div class="pin-dot"></div>`;
      pin.addEventListener('click', () => showDest(d));
      pinLayer.appendChild(pin);
    });
    const showDest = (d) => {
      document.querySelectorAll('.sl-pin').forEach(p => p.classList.remove('active'));
      const pins = document.querySelectorAll('.sl-pin');
      const idx = destinations.findIndex(x => x.id === d.id);
      if (pins[idx]) pins[idx].classList.add('active');
      detail.innerHTML = `
        <div class="sl-img"><img src="${d.img}" alt="${d.name}" loading="lazy"></div>
        <span class="sl-region">${d.region}</span>
        <h4>${d.name}</h4>
        <p>${d.desc}</p>
        <div class="sl-meta">${d.meta.map(m => `<span><i class="fa-solid fa-circle-check"></i>${m}</span>`).join('')}</div>
      `;
    };
    showDest(destinations[0]);
  }

  /* =======================================================
     WIDGET — UV Dial
     ======================================================= */
  const uvCities = {
    Colombo:  { uv:9, t:31, hum:78, wind:14, tip:'Extreme. Apply SPF 50+ every 90min. Hydrate now.', c:'extreme' },
    Kandy:    { uv:8, t:26, hum:72, wind:8,  tip:'Very high. Seek shade 11am–2pm. Wear a hat.', c:'very high' },
    Ella:     { uv:7, t:22, hum:68, wind:10, tip:'High. Sunscreen recommended on skin.', c:'high' },
    Jaffna:   { uv:10,t:33, hum:70, wind:16, tip:'Extreme. Limit direct exposure. SPF 50+.', c:'extreme' },
    Mirissa:  { uv:9, t:30, hum:82, wind:18, tip:'Extreme. Reapply sunscreen after swimming.', c:'extreme' }
  };
  const uvDialFill = document.getElementById('uvFill');
  const uvDialNum  = document.getElementById('uvNum');
  const uvDialLvl  = document.getElementById('uvLvl');
  const uvBars     = document.getElementById('uvBars');
  const uvTip      = document.getElementById('uvTip');
  const uvTabs     = document.getElementById('uvTabs');
  if (uvDialFill) {
    const R = 95; const C = 2 * Math.PI * R;
    uvDialFill.setAttribute('stroke-dasharray', C);
    const setCity = (name) => {
      const d = uvCities[name]; if (!d) return;
      const frac = Math.min(d.uv / 11, 1);
      uvDialFill.setAttribute('stroke-dashoffset', C * (1 - frac));
      uvDialNum.textContent = d.uv;
      uvDialLvl.textContent = d.c.toUpperCase();
      uvTip.innerHTML = `<i class="fa-solid fa-droplet"></i>${d.tip}`;
      uvBars.innerHTML = `
        <div class="uv-r"><i class="fa-solid fa-temperature-three-quarters"></i><div class="uv-r-bar"><div style="width:${d.t*2.5}%"></div></div><span>${d.t}°C</span></div>
        <div class="uv-r"><i class="fa-solid fa-droplet"></i><div class="uv-r-bar"><div style="width:${d.hum}%;background:linear-gradient(90deg,#14a7b7,#0d7d8f)"></div></div><span>${d.hum}%</span></div>
        <div class="uv-r"><i class="fa-solid fa-wind"></i><div class="uv-r-bar"><div style="width:${d.wind*4}%;background:linear-gradient(90deg,#2d6b3e,#14a7b7)"></div></div><span>${d.wind}km/h</span></div>
      `;
    };
    Object.keys(uvCities).forEach((name,i) => {
      const b = document.createElement('button');
      b.textContent = name; if (i===0) b.classList.add('on');
      b.addEventListener('click', () => {
        uvTabs.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); setCity(name);
      });
      uvTabs.appendChild(b);
    });
    setCity('Colombo');
  }

  /* =======================================================
     WIDGET — Chatbot Demo
     ======================================================= */
  const chatBody = document.getElementById('chatBody');
  const chatInput = document.getElementById('chatInput');
  const chatSend  = document.getElementById('chatSend');
  const scripted = {
    '7-day': [
      { t:'Crafting a 7-day itinerary…', dly:600 },
      { t:'<strong>Day 1–2:</strong> Colombo · Galle Face sunset, Gangaramaya Temple, Pettah market.', dly:900 },
      { t:'<strong>Day 3–4:</strong> Kandy & Sigiriya · Temple of the Tooth, rock fortress at dawn.', dly:900 },
      { t:'<strong>Day 5:</strong> Train to Ella · Nine Arch Bridge, Little Adam\'s Peak.', dly:900 },
      { t:'<strong>Day 6–7:</strong> Mirissa · whale-watching, coconut tree hill sunset.', dly:900 },
      { t:'Want me to add Yala safari? <em>Just say the word.</em>', dly:700 }
    ],
    'yala': [
      { t:'Adding <strong>Yala National Park</strong> safari on Day 8 — 5am pickup, leopard-density peak at sunrise.', dly:1100 },
      { t:'Shall I reserve a 4x4 jeep + park tickets (~LKR 15,000)?', dly:700 }
    ],
    'budget': [
      { t:'Budget breakdown for 7 days (backpacker tier):', dly:600 },
      { t:'🏨 Stays LKR 35,000 · 🍛 Food LKR 15,000 · 🚂 Transit LKR 8,500 · 🎟️ Sites LKR 12,000 · 💡 Total ≈ <strong>LKR 70,500</strong> (~$235)', dly:900 }
    ],
    'food': [
      { t:'Sri Lanka is a flavour festival! Try:', dly:500 },
      { t:'🍛 Rice & curry (at any family home-stay) · 🥥 Kottu roti (Pilawoos, Colombo) · 🐟 Ambul thiyal (sour fish curry) · 🍃 Ceylon tea at Mackwoods estate.', dly:900 }
    ],
    'default': [
      { t:'I can plan itineraries, find transport, suggest food and watch over your safety. Try asking about a 7-day trip, budget, or food!', dly:700 }
    ]
  };
  const addBubble = (text, who='bot', html=false) => {
    const m = document.createElement('div'); m.className = 'chat-msg ' + who;
    const b = document.createElement('div'); b.className = 'bubble';
    if (html) b.innerHTML = text; else b.textContent = text;
    m.appendChild(b); chatBody.appendChild(m);
    chatBody.scrollTop = chatBody.scrollHeight;
  };
  const addTyping = () => {
    const m = document.createElement('div'); m.className = 'chat-msg bot typing-row';
    m.innerHTML = `<div class="chat-typing"><i></i><i></i><i></i></div>`;
    chatBody.appendChild(m); chatBody.scrollTop = chatBody.scrollHeight; return m;
  };
  const matchScript = (q) => {
    q = q.toLowerCase();
    if (/7|seven|itiner|plan/.test(q)) return scripted['7-day'];
    if (/yala|safari|leopard/.test(q)) return scripted['yala'];
    if (/budget|cost|price|money/.test(q)) return scripted['budget'];
    if (/food|eat|curry|cuisine/.test(q)) return scripted['food'];
    return scripted['default'];
  };
  const runBot = async (userMsg) => {
    const script = matchScript(userMsg);
    for (const step of script) {
      const typing = addTyping();
      await new Promise(r => setTimeout(r, step.dly));
      typing.remove();
      addBubble(step.t, 'bot', true);
      await new Promise(r => setTimeout(r, 200));
    }
  };
  if (chatSend && chatInput) {
    const send = () => {
      const q = chatInput.value.trim(); if (!q) return;
      addBubble(q, 'user'); chatInput.value = '';
      runBot(q);
    };
    chatSend.addEventListener('click', send);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    document.querySelectorAll('.chat-suggest button').forEach(b => {
      b.addEventListener('click', () => { chatInput.value = b.dataset.q; send(); });
    });
    // seed
    setTimeout(() => {
      addBubble('Ayubowan! 👋 I\'m Travion — your Sri Lanka travel agent. Ask me anything, or tap a suggestion.', 'bot', true);
    }, 400);
  }

  /* =======================================================
     WIDGET — Fare Calculator
     ======================================================= */
  const routes = {
    'colombo-kandy':    { km: 116, scenic: 1.1 },
    'colombo-galle':    { km: 125, scenic: 1.0 },
    'kandy-ella':       { km: 140, scenic: 1.2 },
    'colombo-sigiriya': { km: 175, scenic: 1.05 },
    'ella-mirissa':     { km: 175, scenic: 1.0 },
    'colombo-jaffna':   { km: 400, scenic: 0.95 }
  };
  const fareFrom = document.getElementById('fareFrom');
  const fareTo   = document.getElementById('fareTo');
  const farePax  = document.getElementById('farePax');
  const fareComf = document.getElementById('fareComf');
  const fareCV   = document.getElementById('fareComfV');
  const fareRes  = document.getElementById('fareRes');

  const computeFare = () => {
    if (!fareFrom) return;
    const key = fareFrom.value + '-' + fareTo.value;
    const rev = fareTo.value + '-' + fareFrom.value;
    const r = routes[key] || routes[rev];
    if (!r || fareFrom.value === fareTo.value) {
      fareRes.innerHTML = '<div class="fare-res"><div class="ic car"><i class="fa-solid fa-circle-info"></i></div><div><h5>Pick two different cities</h5><small>Choose a route to see fare options</small></div><div></div></div>';
      return;
    }
    const pax = +farePax.value || 1;
    const comf = +fareComf.value; fareCV.textContent = ['Budget','Standard','Comfort','Premium'][comf-1];
    const options = [
      { key:'tuk', ic:'tuk', icon:'fa-tuk-tuk', name:'Tuk-tuk', rate:75, time:r.km/38, bad:pax>3, note: pax>3 ? 'Max 3 pax' : `${pax} pax · open-air`, comfBoost:0.9 },
      { key:'bus', ic:'bus', icon:'fa-bus', name:'Public Bus', rate:12, time:r.km/45, note:'AC coach · frequent', comfBoost:0.7 },
      { key:'train', ic:'train', icon:'fa-train', name:'Scenic Train', rate:14, time:r.km/42*r.scenic, note:r.scenic>1 ? 'Window-seat scenic' : '2nd class reserved', comfBoost:0.95 },
      { key:'car', ic:'car', icon:'fa-car', name:'Private Car', rate:90, time:r.km/55, note:`Driver incl. · ${pax} pax`, comfBoost:1.1 }
    ];
    const comfMul = [0.85, 1.0, 1.2, 1.6][comf-1];
    options.forEach(o => {
      o.price = Math.round(r.km * o.rate * comfMul * o.comfBoost);
      o.totalTime = (o.time).toFixed(1) + 'h';
      o.score = (comfMul * o.comfBoost) / (o.price / 1000) * (o.bad ? 0.1 : 1);
    });
    const best = options.reduce((a,b) => a.score > b.score ? a : b);
    fareRes.innerHTML = options.map(o => `
      <div class="fare-res ${o === best ? 'best' : ''} ${o.bad ? 'disabled' : ''}">
        <div class="ic ${o.ic}"><i class="fa-solid ${o.icon}"></i></div>
        <div><h5>${o.name}</h5><small>${o.note} · ${o.totalTime}</small></div>
        <div class="price">LKR ${o.price.toLocaleString()}<small>${r.km}km</small></div>
      </div>`).join('');
  };
  [fareFrom, fareTo, farePax, fareComf].forEach(el => el && el.addEventListener('input', computeFare));
  computeFare();

  /* =======================================================
     WIDGET — Safety Alert Feed (live-ish)
     ======================================================= */
  const feed = document.getElementById('safetyFeed');
  const alertPool = [
    { lvl:'info', icon:'fa-cloud-sun-rain', t:'Weather update', s:'Light afternoon showers expected in Kandy region. Carry an umbrella.', time:'2m' },
    { lvl:'warn', icon:'fa-hippo', t:'Wildlife proximity', s:'Elephant herd spotted 800m from Habarana main road. Drive cautiously after 5pm.', time:'9m' },
    { lvl:'crit', icon:'fa-triangle-exclamation', t:'Flash flood advisory', s:'Heavy rain in Nuwara Eliya. Avoid Horton Plains trail until morning.', time:'14m' },
    { lvl:'info', icon:'fa-shield-heart', t:'All clear', s:'Galle Fort area reports no incidents. Safe for evening walks.', time:'22m' },
    { lvl:'warn', icon:'fa-sun', t:'Extreme UV', s:'Colombo UV index at 10. Apply SPF 50+ and hydrate every hour.', time:'31m' },
    { lvl:'info', icon:'fa-train', t:'Train on time', s:'Kandy → Ella 08:30 service running to schedule.', time:'44m' },
    { lvl:'crit', icon:'fa-fire', t:'Restricted zone', s:'Yala block 3 closed for anti-poaching patrol. Use block 1 entry only.', time:'1h' },
    { lvl:'info', icon:'fa-users', t:'Community tip', s:'Locals recommend Mirissa Parrot Rock for sunset — less crowded.', time:'1h' }
  ];
  if (feed) {
    feed.innerHTML = alertPool.slice(0,6).map((a,i) => `
      <div class="alert-item lvl-${a.lvl}" style="animation-delay:${i*0.08}s">
        <div class="ic"><i class="fa-solid ${a.icon}"></i></div>
        <div><strong>${a.t}</strong><small>${a.s}</small></div>
        <span class="time">${a.time}</span>
      </div>`).join('');
    // Auto-prepend a new random alert every 6s (simulated)
    let counter = 0;
    setInterval(() => {
      if (document.hidden) return;
      const a = alertPool[counter % alertPool.length]; counter++;
      const div = document.createElement('div');
      div.className = 'alert-item lvl-' + a.lvl;
      div.innerHTML = `<div class="ic"><i class="fa-solid ${a.icon}"></i></div><div><strong>${a.t}</strong><small>${a.s}</small></div><span class="time">now</span>`;
      feed.prepend(div);
      if (feed.children.length > 8) feed.lastElementChild.remove();
    }, 6500);
  }

  /* =======================================================
     WIDGET — Itinerary Drag-Drop
     ======================================================= */
  const itinList = document.getElementById('itinList');
  const itinDays = document.querySelectorAll('.itin-day-slot');
  const activities = [
    { id:'a1', label:'Sigiriya Rock', cat:'culture', h:'5h', sub:'Dambulla · UNESCO' },
    { id:'a2', label:'Temple of Tooth', cat:'culture', h:'2h', sub:'Kandy · Buddhist' },
    { id:'a3', label:'Ella Train Ride', cat:'adventure', h:'3h', sub:'Nine Arch scenic' },
    { id:'a4', label:'Mirissa Whale Watch', cat:'nature', h:'4h', sub:'Blue whales · AM' },
    { id:'a5', label:'Yala Safari', cat:'nature', h:'6h', sub:'Leopards at dawn' },
    { id:'a6', label:'Galle Fort Walk', cat:'culture', h:'2h', sub:'Sunset stroll' },
    { id:'a7', label:'Rice & Curry Feast', cat:'food', h:'1h', sub:'Village home-stay' },
    { id:'a8', label:'Tea Plantation', cat:'nature', h:'3h', sub:'Nuwara Eliya · cool' },
    { id:'a9', label:'Kitesurf Kalpitiya', cat:'adventure', h:'4h', sub:'June–Sep peak' },
    { id:'a10', label:'Beach Yoga Mirissa', cat:'beach', h:'1h', sub:'Sunrise only' }
  ];
  const iconOf = { culture:'fa-place-of-worship', nature:'fa-leaf', adventure:'fa-person-hiking', food:'fa-utensils', beach:'fa-umbrella-beach' };
  if (itinList) {
    itinList.innerHTML = activities.map(a => `
      <div class="itin-chip" draggable="true" data-id="${a.id}">
        <div class="ic ${a.cat}"><i class="fa-solid ${iconOf[a.cat]}"></i></div>
        <div class="label">${a.label}<small>${a.sub}</small></div>
        <div class="h">${a.h}</div>
      </div>`).join('');

    let dragged = null;
    document.querySelectorAll('.itin-chip').forEach(c => {
      c.addEventListener('dragstart', e => {
        dragged = c; c.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      c.addEventListener('dragend', () => { c.classList.remove('dragging'); dragged = null; });
    });
    itinDays.forEach(d => {
      d.addEventListener('dragover', e => { e.preventDefault(); d.parentElement.classList.add('over'); });
      d.addEventListener('dragleave', () => d.parentElement.classList.remove('over'));
      d.addEventListener('drop', e => {
        e.preventDefault();
        d.parentElement.classList.remove('over');
        if (dragged) {
          const clone = dragged.cloneNode(true);
          clone.classList.remove('dragging');
          clone.setAttribute('draggable', 'false');
          clone.addEventListener('click', () => clone.remove());
          clone.style.cursor = 'pointer';
          clone.title = 'Click to remove';
          d.appendChild(clone);
          d.classList.remove('empty');
        }
      });
    });
  }

  /* =======================================================
     WIDGET — Testimonials carousel
     ======================================================= */
  const track = document.getElementById('testTrack');
  const testDots = document.getElementById('testDots');
  if (track) {
    const count = track.children.length;
    let tIdx = 0;
    const perView = () => window.innerWidth > 860 ? 3 : window.innerWidth > 520 ? 2 : 1;
    const update = () => {
      const card = track.children[0]; if (!card) return;
      const cw = card.getBoundingClientRect().width + 20;
      const max = Math.max(0, count - perView());
      tIdx = Math.min(tIdx, max);
      track.style.transform = `translateX(${-tIdx * cw}px)`;
      if (testDots) testDots.querySelectorAll('i').forEach((d,i) => d.classList.toggle('on', i === tIdx));
    };
    if (testDots) {
      for (let i = 0; i <= count - perView(); i++) {
        const dot = document.createElement('i');
        dot.addEventListener('click', () => { tIdx = i; update(); });
        testDots.appendChild(dot);
      }
      testDots.children[0]?.classList.add('on');
    }
    let aut = setInterval(() => { tIdx = (tIdx + 1) % Math.max(1, count - perView() + 1); update(); }, 4500);
    track.addEventListener('pointerenter', () => clearInterval(aut));
    window.addEventListener('resize', update);
    update();
  }

  /* =======================================================
     WIDGET — AI Demo (3-step)
     ======================================================= */
  const steps = document.querySelectorAll('.aidemo-step');
  const panes = document.querySelectorAll('.aidemo-pane');
  let adStep = 0;
  let adPrefs = new Set();
  let adDays = 5;
  const goStep = (i) => {
    adStep = i;
    steps.forEach((s,k) => {
      s.classList.toggle('on', k === i);
      s.classList.toggle('done', k < i);
    });
    panes.forEach((p,k) => p.classList.toggle('on', k === i));
    if (i === 2) renderPlan();
  };
  steps.forEach((s,i) => s.addEventListener('click', () => goStep(i)));
  document.querySelectorAll('[data-ad-next]').forEach(b => b.addEventListener('click', () => goStep(Math.min(adStep+1, 2))));
  document.querySelectorAll('[data-ad-prev]').forEach(b => b.addEventListener('click', () => goStep(Math.max(adStep-1, 0))));

  document.querySelectorAll('.ad-pref').forEach(p => {
    p.addEventListener('click', () => { p.classList.toggle('on'); const k = p.dataset.pref; if (adPrefs.has(k)) adPrefs.delete(k); else adPrefs.add(k); });
  });
  document.querySelectorAll('.ad-days button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.ad-days button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); adDays = +b.dataset.days;
    });
  });

  const planTemplates = {
    culture: ['Sigiriya Rock sunrise climb','Temple of the Tooth ceremony','Dambulla cave frescoes','Galle Fort lighthouse walk','Anuradhapura sacred city'],
    nature:  ['Yala safari sunrise','Sinharaja rainforest trek','Horton Plains World\'s End','Udawalawe elephants','Knuckles range misty hike'],
    beach:   ['Mirissa whale watching','Weligama surf session','Unawatuna reef snorkel','Arugam Bay kitesurf','Pasikudah sandbar'],
    food:    ['Pilawoos kottu feast','Home-stay rice & curry','Pettah market street tour','Ceylon tea estate lunch','Ambul thiyal cooking class'],
    adventure:['Nine Arch train ride','Ella Little Adam\'s Peak','Kitulgala white-water raft','Adam\'s Peak pre-dawn climb','Knuckles camping'],
    wellness:['Ayurveda spa Bentota','Yoga retreat Mirissa','Hot springs Kanniya','Meditation Polonnaruwa','Herbal tea at a tea estate']
  };
  const renderPlan = () => {
    const wrap = document.getElementById('adPlan'); if (!wrap) return;
    const picks = adPrefs.size ? [...adPrefs] : ['culture','nature','food'];
    let items = [];
    picks.forEach(k => items.push(...(planTemplates[k] || [])));
    items = items.sort(() => Math.random() - 0.5).slice(0, adDays);
    while (items.length < adDays) items.push(planTemplates.culture[items.length % 5]);
    wrap.innerHTML = items.map((it,i) => `
      <div class="ad-plan-day" style="animation-delay:${i*0.08}s">
        <h5>Day ${i+1} · ${it}</h5>
        <p>Travion AI has scheduled this around weather, opening hours, transit availability and your pace preferences.</p>
      </div>`).join('');
  };

  /* =======================================================
     TWEAKS panel
     ======================================================= */
  const tweaksBtn = document.getElementById('tweaksBtn');
  const tweaksPanel = document.getElementById('tweaksPanel');
  if (tweaksBtn && tweaksPanel) {
    tweaksBtn.addEventListener('click', (e) => { e.stopPropagation(); tweaksPanel.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!tweaksPanel.contains(e.target) && e.target !== tweaksBtn) tweaksPanel.classList.remove('open'); });
    // Motion intensity
    document.querySelectorAll('[data-motion]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-motion]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const m = b.dataset.motion;
        document.body.classList.remove('motion-low','motion-med','motion-high');
        document.body.classList.add('motion-' + m);
        document.documentElement.style.setProperty('--motion', m === 'low' ? 0.3 : m === 'high' ? 1.2 : 1);
      });
    });
    // Accent color
    document.querySelectorAll('[data-accent]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-accent]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const acc = b.dataset.accent;
        const map = {
          sunset: { a:'#e85d3c', b:'#d9401f' },
          gold:   { a:'#e4a830', b:'#c48a1b' },
          ocean:  { a:'#0d7d8f', b:'#085360' },
          lotus:  { a:'#d94671', b:'#b8345d' },
          jungle: { a:'#2d6b3e', b:'#1f4f2b' }
        };
        const c = map[acc]; if (!c) return;
        document.documentElement.style.setProperty('--c-sunset', c.a);
        document.documentElement.style.setProperty('--c-sunset-2', c.b);
        document.documentElement.style.setProperty('--accent', c.a);
      });
    });
    // Hero variant
    document.querySelectorAll('[data-variant]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-variant]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const hero = document.getElementById('home');
        hero.classList.remove('variant-v1','variant-v2','variant-v3');
        hero.classList.add('variant-' + b.dataset.variant);
      });
    });
  }

  /* Contact form is handled by the EmailJS block in index.html */

})();
