/* Processing Contribution Manager - web version.
   Reads contributions.yaml live from GitHub. No build step. */

(function () {
  'use strict';

  var DATA_URL = 'https://raw.githubusercontent.com/processing/processing-contributions/main/contributions.yaml';
  var TYPES = ['library', 'mode', 'tool', 'examples'];

  // The source data has a few hand-typed category spellings. Fold them together.
  var CATEGORY_ALIASES = {
    'data': 'Data',
    'other': 'Other',
    'utilities': 'Utilities',
    'book': 'Books',
    'compilation': 'Compilations',
    'data / protocols': 'Data',
    'simulation / math': 'Simulation',
    'unknown': 'Other'
  };

  var el = {
    status: document.getElementById('status'),
    table: document.getElementById('table'),
    rows: document.getElementById('rows'),
    empty: document.getElementById('empty'),
    filter: document.getElementById('filter'),
    category: document.getElementById('category'),
    meta: document.getElementById('meta'),
    openInfo: document.getElementById('open-info'),
    infoModal: document.getElementById('info-modal'),
    closeInfo: document.getElementById('close-info'),
    installLinks: Array.prototype.slice.call(document.querySelectorAll('[data-open-install]')),
    installModal: document.getElementById('install-modal'),
    closeModal: document.getElementById('close-modal'),
    tabs: Array.prototype.slice.call(document.querySelectorAll('.tabs button')),
    heads: Array.prototype.slice.call(document.querySelectorAll('thead th button'))
  };

  var state = {
    all: [],
    type: 'library',
    q: '',
    cat: '',
    sort: 'name',
    desc: false,
    open: null
  };

  /* ---------- data ---------- */

  function normCategory(c) {
    if (typeof c !== 'string') return null;
    var s = c.trim();
    if (!s || s.indexOf('${') === 0) return null; // unresolved template placeholder
    return CATEGORY_ALIASES[s.toLowerCase()] || s;
  }

  // authors is markdown: "[Name](url), [Name2](url2)"
  function parseAuthors(md) {
    if (!md) return [];
    var out = [];
    var re = /\[([^\]]*)\]\(([^)]*)\)/g;
    var m;
    while ((m = re.exec(md))) out.push({ name: m[1].trim(), url: m[2].trim() });
    if (!out.length) {
      md.split(/,|\band\b/).forEach(function (n) {
        n = n.replace(/[\[\]()]/g, '').trim();
        if (n) out.push({ name: n, url: '' });
      });
    }
    return out;
  }

  function clean(v) {
    return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  }

  // sentence/paragraph fields contain markdown links: "see [Box2D](http://box2d.org/)"
  var MD_LINK = /\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g;

  function stripMd(s) {
    return s.replace(MD_LINK, '$1');
  }

  function mdFrag(s) {
    var frag = document.createDocumentFragment();
    var last = 0, m;
    MD_LINK.lastIndex = 0;
    while ((m = MD_LINK.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      frag.appendChild(link(m[1] || m[2], m[2]));
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    return frag;
  }

  function normalize(raw) {
    return raw
      .filter(function (c) {
        return c && c.status === 'VALID' && TYPES.indexOf(c.type) > -1 && c.name && c.download;
      })
      .map(function (c) {
        var cats = (c.categories || []).map(normCategory).filter(Boolean);
        var authors = parseAuthors(c.authors);
        return {
          id: c.id,
          type: c.type,
          name: clean(c.name),
          sortName: clean(c.name).toLowerCase(),
          sentence: stripMd(clean(c.sentence)),
          paragraph: clean(c.paragraph),
          url: clean(c.url),
          download: clean(c.download),
          version: clean(c.prettyVersion) || clean(String(c.version || '')),
          categories: cats.filter(function (v, i) { return cats.indexOf(v) === i; }),
          authors: authors,
          authorText: authors.map(function (a) { return a.name; }).join(', '),
          minRevision: c.minRevision || 0,
          maxRevision: c.maxRevision || 0
        };
      });
  }

  function load() {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        var doc = jsyaml.load(text);
        state.all = normalize((doc && doc.contributions) || []);
        if (!state.all.length) throw new Error('no valid contributions found');
        el.status.hidden = true;
        el.table.hidden = false;
        counts();
        readHash();
        buildCategories();
        render();
        el.meta.textContent = state.all.length + ' contributions';
      })
      .catch(function (e) {
        el.status.className = 'status err';
        el.status.textContent = 'Could not load contributions.yaml (' + e.message + '). ' +
          'Open the source on GitHub instead.';
      });
  }

  /* ---------- view ---------- */

  function counts() {
    el.tabs.forEach(function (t) {
      var n = state.all.filter(function (c) { return c.type === t.dataset.type; }).length;
      t.querySelector('.count').textContent = '(' + n + ')';
    });
  }

  function buildCategories() {
    var seen = {};
    state.all.filter(function (c) { return c.type === state.type; })
      .forEach(function (c) { c.categories.forEach(function (k) { seen[k] = (seen[k] || 0) + 1; }); });
    var keys = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
    var cur = state.cat;
    el.category.innerHTML = '';
    el.category.appendChild(opt('', 'All'));
    keys.forEach(function (k) { el.category.appendChild(opt(k, k + ' (' + seen[k] + ')')); });
    if (keys.indexOf(cur) === -1) cur = '';
    state.cat = cur;
    el.category.value = cur;
    el.category.disabled = keys.length === 0;
  }

  function opt(value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function visible() {
    var q = state.q.toLowerCase();
    var list = state.all.filter(function (c) {
      if (c.type !== state.type) return false;
      if (state.cat && c.categories.indexOf(state.cat) === -1) return false;
      if (!q) return true;
      return (c.name + ' ' + c.authorText + ' ' + c.sentence + ' ' + stripMd(c.paragraph) + ' ' +
        c.categories.join(' ')).toLowerCase().indexOf(q) > -1;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var r;
      if (key === 'author') r = a.authorText.localeCompare(b.authorText, undefined, { sensitivity: 'base' });
      else r = 0;
      if (!r) r = a.sortName < b.sortName ? -1 : (a.sortName > b.sortName ? 1 : 0);
      return state.desc ? -r : r;
    });
    return list;
  }

  function render() {
    var list = visible();
    el.rows.textContent = '';
    list.forEach(function (c) { el.rows.appendChild(row(c)); });
    el.empty.hidden = list.length > 0;
    el.table.hidden = list.length === 0;
    el.heads.forEach(function (b) {
      var th = b.parentNode;
      th.classList.toggle('sorted', b.dataset.sort === state.sort);
      th.classList.toggle('desc', b.dataset.sort === state.sort && state.desc);
    });
  }

  function row(c) {
    var frag = document.createDocumentFragment();
    var tr = document.createElement('tr');
    tr.className = state.open === c.id ? 'open' : '';

    var name = document.createElement('td');
    name.className = 'name';
    name.title = 'Show details';
    var n = document.createElement('span');
    n.className = 'n';
    n.textContent = c.name;
    name.appendChild(n);
    if (c.sentence) {
      var s = document.createElement('span');
      s.className = 's';
      s.textContent = c.sentence;
      name.appendChild(s);
    }
    name.addEventListener('click', function () {
      state.open = state.open === c.id ? null : c.id;
      render();
    });
    tr.appendChild(name);

    var au = document.createElement('td');
    au.className = 'author';
    c.authors.forEach(function (a, i) {
      if (i) au.appendChild(document.createTextNode(', '));
      au.appendChild(link(a.name, a.url));
    });
    tr.appendChild(au);

    var ver = document.createElement('td');
    ver.className = 'version';
    ver.textContent = c.version;
    tr.appendChild(ver);

    var dl = document.createElement('td');
    var actions = document.createElement('div');
    actions.className = 'download-actions';
    var a = document.createElement('a');
    a.className = 'dl';
    a.href = c.download;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Download zip';
    a.title = 'Open download from publisher: ' + c.download.split('/').pop();
    actions.appendChild(a);

    var copy = document.createElement('button');
    copy.className = 'copy-link';
    copy.type = 'button';
    copy.textContent = 'Copy link';
    copy.title = 'Copy publisher download link';
    copy.setAttribute('aria-label', 'Copy download link for ' + c.name);
    copy.addEventListener('click', function () {
      copyText(c.download).then(function () {
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy link'; }, 1500);
      }).catch(function () {
        copy.textContent = 'Failed';
        setTimeout(function () { copy.textContent = 'Copy link'; }, 1500);
      });
    });
    actions.appendChild(copy);
    dl.appendChild(actions);
    tr.appendChild(dl);

    frag.appendChild(tr);
    if (state.open === c.id) frag.appendChild(detail(c));
    return frag;
  }

  function detail(c) {
    var tr = document.createElement('tr');
    tr.className = 'detail';
    var td = document.createElement('td');
    td.colSpan = 4;

    if (c.paragraph) {
      var p = document.createElement('p');
      p.appendChild(mdFrag(c.paragraph));
      td.appendChild(p);
    }

    var kv = document.createElement('div');
    kv.className = 'kv';
    if (c.categories.length) kv.appendChild(span('Categories: ' + c.categories.join(', ')));
    if (c.minRevision || c.maxRevision) {
      kv.appendChild(span('Processing revision: ' +
        (c.minRevision ? c.minRevision : 'any') + '–' + (c.maxRevision ? c.maxRevision : 'any')));
    }
    if (c.url) {
      var w = document.createElement('span');
      w.appendChild(link('Homepage', c.url));
      kv.appendChild(w);
    }
    var g = document.createElement('span');
    g.appendChild(link('Source entry', 'https://github.com/processing/processing-contributions/blob/main/contributions.yaml'));
    kv.appendChild(g);
    td.appendChild(kv);

    tr.appendChild(td);
    return tr;
  }

  function span(text) {
    var s = document.createElement('span');
    s.textContent = text;
    return s;
  }

  function link(text, href) {
    if (!href) return document.createTextNode(text);
    var a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        if (document.execCommand('copy')) resolve();
        else reject(new Error('Copy command failed'));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(input);
    });
  }

  /* ---------- state / events ---------- */

  function writeHash() {
    var p = new URLSearchParams();
    p.set('type', state.type);
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('c', state.cat);
    var h = '#' + p.toString();
    if (h !== location.hash) history.replaceState(null, '', h);
  }

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    var t = p.get('type');
    if (TYPES.indexOf(t) > -1) state.type = t;
    state.q = p.get('q') || '';
    state.cat = p.get('c') || '';
    el.filter.value = state.q;
    el.tabs.forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.type === state.type));
    });
  }

  el.tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.dataset.type;
      state.open = null;
      state.cat = '';
      el.tabs.forEach(function (x) {
        x.setAttribute('aria-selected', String(x === b));
      });
      buildCategories();
      writeHash();
      render();
    });
  });

  el.filter.addEventListener('input', function () {
    state.q = el.filter.value.trim();
    state.open = null;
    writeHash();
    render();
  });

  el.category.addEventListener('change', function () {
    state.cat = el.category.value;
    state.open = null;
    writeHash();
    render();
  });

  window.addEventListener('hashchange', function () {
    if (!state.all.length) return;
    readHash();
    state.open = null;
    buildCategories();
    render();
  });

  el.heads.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.sort;
      state.desc = state.sort === k ? !state.desc : false;
      state.sort = k;
      render();
    });
  });

  el.openInfo.addEventListener('click', function () {
    el.infoModal.showModal();
  });

  el.closeInfo.addEventListener('click', function () {
    el.infoModal.close();
  });

  el.infoModal.addEventListener('click', function (e) {
    if (e.target === el.infoModal) el.infoModal.close();
  });

  el.installLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (el.infoModal.open) el.infoModal.close();
      el.installModal.showModal();
    });
  });

  el.closeModal.addEventListener('click', function () {
    el.installModal.close();
  });

  el.installModal.addEventListener('click', function (e) {
    if (e.target === el.installModal) el.installModal.close();
  });

  load();
})();
