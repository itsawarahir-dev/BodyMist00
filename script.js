/* ==========================================================
   Body Scent — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : แสดงสินค้า + กรองตาม mood
   - order.html   : เติมฟอร์มจาก URL + ส่งคำสั่งซื้อไป Apps Script
   - admin.html   : แสดงคำสั่งซื้อจาก Google Sheet (CSV)

   id ที่ใช้ในไฟล์นี้:
   product.html : #filter-bar, #product-list
   order.html   : #orderForm, #customerName, #contact, #items, #total, #note
   admin.html   : #ordersTable (tbody อยู่ข้างใน)
   ========================================================== */
(function () {
  'use strict';

  /* ---------- ค่าคงที่ ---------- */
  var PRODUCTS_URL = 'products.json';

  var APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwomWLkRYgy_MAZaoRFpx9-8X_VNac-mzs6SFc4p6hYXYbJmM_ym0FAnX3AGuCQAAoWjw/exec';

  var ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vREJA16aeouPttZ1ufL7brRCGXCsu3IoRqGEPDoRXjOJT2k0SIo46IENJdAAqiN_9qSq3qtDHpiL-1t/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance', label: 'Romance' }
  ];

  var TYPE_LABEL = { spray: 'น้ำหอมฉีดตัว', rollon: 'โรลออน' };

  /* ---------- helper ---------- */
  // สร้าง element โดยใส่ข้อความผ่าน textContent เสมอ (กัน XSS)
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function moodLabel(key) {
    for (var i = 0; i < MOODS.length; i++) {
      if (MOODS[i].key === key) return MOODS[i].label;
    }
    return key;
  }

  /* ==========================================================
     1) product.html
     ========================================================== */
  function initProductPage() {
    var bar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!bar || !list) return;

    bar.classList.add('filters');
    list.classList.add('product-grid');

    var products = [];
    var current = 'all';

    // กรองอัตโนมัติจาก ?mood=xxx
    var wanted = (new URLSearchParams(window.location.search).get('mood') || '').toLowerCase();
    if (MOODS.some(function (m) { return m.key === wanted; })) {
      current = wanted;
    }

    function orderUrl(p) {
      var itemText = [p.name, p.size].filter(Boolean).join(' ');
      var q = new URLSearchParams({ item: itemText, price: p.price });
      return 'order.html?' + q.toString();
    }

    function buildCard(p) {
      var card = el('article', 'product-card');
      card.setAttribute('data-mood', p.mood);

      var media = el('div', 'product-card__media');
      var img = document.createElement('img');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      media.appendChild(img);

      var body = el('div', 'product-card__body');

      var mood = el('div', 'product-card__mood');
      mood.appendChild(el('span', 'mood-dot'));
      mood.appendChild(document.createTextNode(moodLabel(p.mood)));

      var name = el('h3', 'product-card__name', p.name);
      var meta = el('div', 'product-card__meta', p.size || TYPE_LABEL[p.type] || '');

      var foot = el('div', 'product-card__foot');
      foot.appendChild(el('span', 'price', p.price + ' บาท'));
      var btn = el('a', 'btn btn--small', 'สั่งซื้อ');
      btn.href = orderUrl(p);
      foot.appendChild(btn);

      body.appendChild(mood);
      body.appendChild(name);
      body.appendChild(meta);
      body.appendChild(foot);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.textContent = '';
      var shown = products.filter(function (p) {
        return current === 'all' || p.mood === current;
      });
      if (!shown.length) {
        list.appendChild(el('p', 'muted', 'ยังไม่มีสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    function renderFilters() {
      bar.textContent = '';
      MOODS.forEach(function (m) {
        var b = el('button', 'filter', m.label);
        b.type = 'button';
        b.setAttribute('data-mood', m.key === 'all' ? '' : m.key);
        b.setAttribute('aria-pressed', String(m.key === current));
        b.addEventListener('click', function () {
          current = m.key;
          Array.prototype.forEach.call(bar.children, function (child) {
            child.setAttribute('aria-pressed', String(child === b));
          });
          render();
        });
        bar.appendChild(b);
      });
    }

    renderFilters();
    list.appendChild(el('p', 'muted', 'กำลังโหลดสินค้า...'));

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.textContent = '';
        list.appendChild(el('p', 'muted', 'ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง'));
      });
  }

  /* ==========================================================
     2) order.html
     ========================================================== */
  function initOrderPage() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var itemsEl = document.getElementById('items');
    var totalEl = document.getElementById('total');

    // เติมชื่อสินค้า (#items) และราคา (#total) จาก URL ทันที
    var params = new URLSearchParams(window.location.search);
    var item = params.get('item');
    var price = params.get('price');
    if (item && itemsEl) itemsEl.value = item;
    if (price && totalEl) totalEl.value = price;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var payload = {
        customerName: document.getElementById('customerName').value,
        contact: document.getElementById('contact').value,
        items: document.getElementById('items').value,
        total: document.getElementById('total').value,
        note: document.getElementById('note').value
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        if (submitBtn) submitBtn.disabled = false;
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
    });
  }

  /* ==========================================================
     3) admin.html
     ========================================================== */

  // parse CSV เอง: รองรับ "..." , "" (เครื่องหมายคำพูดซ้อน), คอมมา/ขึ้นบรรทัดใหม่ในช่อง, CRLF
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    text = text.replace(/^\uFEFF/, '');

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // ตัดแถวว่างทิ้ง
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    var COLS = 6;

    function showMessage(text) {
      tbody.textContent = '';
      var tr = document.createElement('tr');
      var td = el('td', 'muted', text);
      td.colSpan = COLS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);

        // ข้ามแถวหัวตาราง (ถ้าช่องแรกไม่มีตัวเลข แปลว่าไม่ใช่วันที่ = แถวหัวตาราง)
        if (rows.length && !/\d/.test(rows[0][0] || '')) {
          rows.shift();
        }

        if (!rows.length) {
          showMessage('ยังไม่มีคำสั่งซื้อ');
          return;
        }

        // ล่าสุดขึ้นก่อน (Sheet เรียงเก่า → ใหม่ตามลำดับที่เพิ่มแถว)
        rows.reverse();

        tbody.textContent = '';
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          for (var i = 0; i < COLS; i++) {
            tr.appendChild(el('td', '', r[i] !== undefined ? r[i] : ''));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- เริ่มทำงาน (ทำเฉพาะหน้าที่มี element นั้นๆ) ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
