/**
 * UangKu — Aplikasi Android Pencatat Keuangan Pribadi (Standalone Offline App)
 * Fitur Utama:
 * 1. Pencatatan Pemasukan & Pengeluaran Cepat
 * 2. Grafik Interaktif: Harian (7 Hari), Mingguan (4 Minggu), Bulanan (6 Bulan)
 * 3. Tema Clean Minimalist Light / Dark
 * 4. Penyimpanan Lokal Permanen (100% Offline via localStorage)
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'uangku_transactions_v1';
  const THEME_KEY = 'uangku_theme_v1';
  const HIDE_BALANCE_KEY = 'uangku_hide_balance_v1';

  const CATEGORIES = {
    expense: [
      { id: 'makan', name: 'Makan & Minum', emoji: '🍜' },
      { id: 'transport', name: 'Transportasi', emoji: '🛵' },
      { id: 'belanja', name: 'Belanja', emoji: '🛍️' },
      { id: 'tagihan', name: 'Tagihan', emoji: '⚡' },
      { id: 'hiburan', name: 'Hiburan', emoji: '🎬' },
      { id: 'kesehatan', name: 'Kesehatan', emoji: '💊' },
      { id: 'pendidikan', name: 'Pendidikan', emoji: '📚' },
      { id: 'lainnya_out', name: 'Lainnya', emoji: '📦' }
    ],
    income: [
      { id: 'gaji', name: 'Gaji', emoji: '💼' },
      { id: 'bonus', name: 'Bonus & THR', emoji: '🎁' },
      { id: 'usaha', name: 'Hasil Usaha', emoji: '🏪' },
      { id: 'investasi', name: 'Investasi', emoji: '📈' },
      { id: 'lainnya_in', name: 'Lainnya', emoji: '💰' }
    ]
  };

  // Application State
  let state = {
    transactions: [],
    chartPeriod: 'daily', // 'daily' | 'weekly' | 'monthly'
    periodOffset: 0, // 0 = periode saat ini, 1 = 1 periode sebelumnya, dst
    selectedBucketIndex: -1,
    filterType: 'all', // 'all' | 'income' | 'expense'
    searchQuery: '', // filter teks pencarian
    currentPage: 1, // halaman saat ini
    pageSize: 8, // jumlah catatan per halaman
    hideBalance: false,
    modalType: 'expense',
    selectedCategory: 'makan',
    pendingDeleteTxId: null
  };

  // Helper Tanggal Lokal (YYYY-MM-DD)
  function toLocalISOString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Helper Jam Lokal (HH:mm)
  function toLocalTimeString(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function parseLocalDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Format Rupiah
  function formatRupiah(amount, withSign = false, type = '') {
    const absVal = Math.abs(Math.round(amount));
    const formatted = 'Rp ' + absVal.toLocaleString('id-ID');
    if (!withSign) {
      return amount < 0 ? '- ' + formatted : formatted;
    }
    if (type === 'income') return '+' + formatted;
    if (type === 'expense') return '-' + formatted;
    return formatted;
  }

  function formatCompact(amount) {
    const abs = Math.abs(amount);
    if (abs >= 1000000) {
      return (amount / 1000000).toFixed(1).replace('.0', '') + 'jt';
    }
    if (abs >= 1000) {
      return Math.round(amount / 1000) + 'rb';
    }
    return String(amount);
  }

  // Seed Sample Data supaya grafik langsung terlihat informatif saat pertama kali dibuka
  function createInitialSampleData() {
    const today = new Date();
    const d = (offsetDays) => {
      const copy = new Date(today);
      copy.setDate(copy.getDate() - offsetDays);
      return toLocalISOString(copy);
    };

    return [
      { id: 'tx-1', type: 'income', amount: 6500000, category: 'gaji', note: 'Gaji Bulanan', date: d(18), time: '09:00', createdAt: Date.now() - 1800000 },
      { id: 'tx-2', type: 'expense', amount: 450000, category: 'tagihan', note: 'Token Listrik & Internet', date: d(14), time: '13:45', createdAt: Date.now() - 1400000 },
      { id: 'tx-3', type: 'expense', amount: 275000, category: 'belanja', note: 'Belanja Kebutuhan Dapur', date: d(9), time: '10:15', createdAt: Date.now() - 900000 },
      { id: 'tx-4', type: 'income', amount: 850000, category: 'usaha', note: 'Proyek Desain Freelance', date: d(5), time: '16:30', createdAt: Date.now() - 500000 },
      { id: 'tx-5', type: 'expense', amount: 65000, category: 'transport', note: 'Isi Bensin Full Tank', date: d(3), time: '08:20', createdAt: Date.now() - 300000 },
      { id: 'tx-6', type: 'expense', amount: 120000, category: 'makan', note: 'Makan Malam Keluarga', date: d(1), time: '19:40', createdAt: Date.now() - 100000 },
      { id: 'tx-7', type: 'expense', amount: 45000, category: 'makan', note: 'Kopi & Sarapan Pagi', date: d(0), time: '07:15', createdAt: Date.now() - 50000 }
    ];
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.transactions = JSON.parse(raw);
      } else {
        state.transactions = createInitialSampleData();
        saveData();
      }
    } catch (e) {
      state.transactions = createInitialSampleData();
    }

    state.hideBalance = localStorage.getItem(HIDE_BALANCE_KEY) === 'true';

    // Load Theme (Default clean dark / system preference)
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      applyTheme(savedTheme);
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      applyTheme(prefersLight ? 'light' : 'dark');
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    } catch (e) {
      console.error('Gagal menyimpan ke localStorage:', e);
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0B0C0E' : '#F8F8F6');
    }
  }

  // Ambil metadata kategori
  function getCategoryMeta(type, catId) {
    const list = CATEGORIES[type] || CATEGORIES.expense;
    return list.find((c) => c.id === catId) || list[list.length - 1];
  }

  // =========================================================================
  // Perhitungan Grafik: Harian (7 Hari), Mingguan (4 Minggu), Bulanan (6 Bulan)
  // Mendukung penggeseran rentang (offset) ke hari/minggu/bulan sebelumnya
  // =========================================================================
  function getChartBuckets(period, offset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [];

    if (period === 'daily') {
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const totalShiftDays = offset * 7;
      const refEnd = new Date(today);
      refEnd.setDate(today.getDate() - totalShiftDays);

      for (let i = 6; i >= 0; i--) {
        const d = new Date(refEnd);
        d.setDate(refEnd.getDate() - i);
        const iso = toLocalISOString(d);

        let label = dayNames[d.getDay()];
        if (offset === 0 && i === 0) {
          label = 'Hari Ini';
        } else if (offset === 0 && i === 1) {
          label = 'Kemarin';
        }

        const fullLabel = d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });

        buckets.push({
          key: iso,
          shortLabel: label,
          fullLabel,
          start: d,
          end: d,
          income: 0,
          expense: 0
        });
      }
    } else if (period === 'weekly') {
      // 4 Minggu (masing-masing rentang 7 hari), dengan offset blok 4 minggu
      const baseWeekShift = offset * 4;
      for (let w = 3; w >= 0; w--) {
        const actualWeekOffset = baseWeekShift + w;
        const end = new Date(today);
        end.setDate(today.getDate() - actualWeekOffset * 7);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);

        const shortLabel = actualWeekOffset === 0 ? 'Mgg Ini' : `${actualWeekOffset} Mgg Lalu`;
        const fullLabel = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
        buckets.push({
          key: `week-${actualWeekOffset}`,
          shortLabel,
          fullLabel,
          start,
          end,
          income: 0,
          expense: 0
        });
      }
    } else if (period === 'monthly') {
      // 6 Bulan, dengan offset blok 6 bulan
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const baseMonthShift = offset * 6;
      for (let m = 5; m >= 0; m--) {
        const actualMonthOffset = baseMonthShift + m;
        const ref = new Date(today.getFullYear(), today.getMonth() - actualMonthOffset, 1);
        const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        const shortLabel = monthNames[ref.getMonth()];
        const fullLabel = ref.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        buckets.push({
          key: `${ref.getFullYear()}-${ref.getMonth()}`,
          shortLabel,
          fullLabel,
          start,
          end,
          income: 0,
          expense: 0
        });
      }
    }

    // Akumulasikan transaksi ke setiap bucket
    for (const tx of state.transactions) {
      const txDate = parseLocalDate(tx.date);
      txDate.setHours(0, 0, 0, 0);
      for (const b of buckets) {
        if (txDate >= b.start && txDate <= b.end) {
          if (tx.type === 'income') {
            b.income += Number(tx.amount) || 0;
          } else {
            b.expense += Number(tx.amount) || 0;
          }
          break;
        }
      }
    }

    return buckets;
  }

  // Render Ringkasan Saldo Utama
  function renderBalanceSummary() {
    let totalIn = 0;
    let totalOut = 0;

    for (const tx of state.transactions) {
      if (tx.type === 'income') totalIn += Number(tx.amount) || 0;
      else totalOut += Number(tx.amount) || 0;
    }

    const netBalance = totalIn - totalOut;
    const balanceEl = document.getElementById('total-balance');
    const incomeEl = document.getElementById('period-income');
    const expenseEl = document.getElementById('period-expense');
    const eyeOpen = document.getElementById('eye-open');
    const eyeClosed = document.getElementById('eye-closed');

    if (state.hideBalance) {
      balanceEl.textContent = 'Rp ••••••••';
      incomeEl.textContent = 'Rp ••••••';
      expenseEl.textContent = 'Rp ••••••';
      eyeOpen.classList.add('hidden');
      eyeClosed.classList.remove('hidden');
    } else {
      balanceEl.textContent = formatRupiah(netBalance);
      incomeEl.textContent = formatRupiah(totalIn);
      expenseEl.textContent = formatRupiah(totalOut);
      eyeOpen.classList.remove('hidden');
      eyeClosed.classList.add('hidden');
    }
  }

  // Render Grafik SVG Interaktif
  function renderChart() {
    const buckets = getChartBuckets(state.chartPeriod, state.periodOffset);
    const rangeLabelEl = document.getElementById('chart-range-label');
    const netSummaryEl = document.getElementById('chart-net-summary');
    const container = document.getElementById('chart-container');
    const windowLabelEl = document.getElementById('chart-window-label');
    const btnNext = document.getElementById('btn-chart-next');
    const btnReset = document.getElementById('btn-chart-reset');

    const firstBucket = buckets[0];
    const lastBucket = buckets[buckets.length - 1];
    const rangeText = `${firstBucket.start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${lastBucket.end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    if (state.chartPeriod === 'daily') {
      if (state.periodOffset === 0) {
        rangeLabelEl.textContent = '7 Hari Terakhir';
        windowLabelEl.textContent = '7 Hari Ini';
      } else {
        rangeLabelEl.textContent = `${state.periodOffset * 7} Hari Sebelumnya`;
        windowLabelEl.textContent = rangeText;
      }
    } else if (state.chartPeriod === 'weekly') {
      if (state.periodOffset === 0) {
        rangeLabelEl.textContent = '4 Minggu Terakhir';
        windowLabelEl.textContent = '4 Minggu Ini';
      } else {
        rangeLabelEl.textContent = `${state.periodOffset * 4} Minggu Sebelumnya`;
        windowLabelEl.textContent = rangeText;
      }
    } else {
      if (state.periodOffset === 0) {
        rangeLabelEl.textContent = '6 Bulan Terakhir';
        windowLabelEl.textContent = '6 Bulan Ini';
      } else {
        rangeLabelEl.textContent = `${state.periodOffset * 6} Bulan Sebelumnya`;
        windowLabelEl.textContent = rangeText;
      }
    }

    // Tombol navigasi 'Berikutnya' hanya aktif jika offset > 0
    if (state.periodOffset > 0) {
      btnNext.removeAttribute('disabled');
      btnReset.classList.remove('hidden');
    } else {
      btnNext.setAttribute('disabled', 'true');
      btnReset.classList.add('hidden');
    }

    // Default pilih bucket paling akhir (periode saat ini dalam window)
    if (state.selectedBucketIndex < 0 || state.selectedBucketIndex >= buckets.length) {
      state.selectedBucketIndex = buckets.length - 1;
    }

    const periodIncome = buckets.reduce((acc, b) => acc + b.income, 0);
    const periodExpense = buckets.reduce((acc, b) => acc + b.expense, 0);
    const periodNet = periodIncome - periodExpense;

    netSummaryEl.innerHTML = `Selisih Periode: <strong>${state.hideBalance ? 'Rp •••••' : (periodNet >= 0 ? '+' : '') + formatRupiah(periodNet)}</strong>`;

    const maxVal = Math.max(
      100000,
      ...buckets.map((b) => Math.max(b.income, b.expense))
    );

    const svgWidth = 380;
    const svgHeight = 185;
    const padLeft = 38;
    const padRight = 8;
    const padTop = 14;
    const padBottom = 28;
    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    // Grid lines (0%, 50%, 100%)
    const gridLevels = [0, 0.5, 1];
    const gridMarkup = gridLevels
      .map((lvl) => {
        const y = padTop + plotHeight * (1 - lvl);
        const val = Math.round(maxVal * lvl);
        const label = lvl === 0 ? '0' : formatCompact(val);
        return `
          <line x1="${padLeft}" y1="${y}" x2="${svgWidth - padRight}" y2="${y}" class="chart-grid-line" />
          <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" class="chart-axis-text">${label}</text>
        `;
      })
      .join('');

    const slotWidth = plotWidth / buckets.length;
    const barWidth = Math.min(13, Math.max(7, slotWidth * 0.24));
    const barGap = 4;

    const barsMarkup = buckets
      .map((b, idx) => {
        const centerX = padLeft + idx * slotWidth + slotWidth / 2;
        const inHeight = b.income > 0 ? Math.max(5, (b.income / maxVal) * plotHeight) : 3;
        const outHeight = b.expense > 0 ? Math.max(5, (b.expense / maxVal) * plotHeight) : 3;

        const inY = padTop + plotHeight - inHeight;
        const outY = padTop + plotHeight - outHeight;
        const isSelected = idx === state.selectedBucketIndex;

        return `
          <g class="chart-group ${isSelected ? 'selected' : ''}" data-idx="${idx}">
            <rect class="bar-hit-area" x="${centerX - slotWidth * 0.42}" y="${padTop - 4}" width="${slotWidth * 0.84}" height="${plotHeight + 8}" />
            <rect class="bar-income" x="${centerX - barWidth - barGap / 2}" y="${inY}" width="${barWidth}" height="${inHeight}" rx="2.5" opacity="${b.income > 0 ? 1 : 0.2}" />
            <rect class="bar-expense" x="${centerX + barGap / 2}" y="${outY}" width="${barWidth}" height="${outHeight}" rx="2.5" opacity="${b.expense > 0 ? 1 : 0.2}" />
            <text x="${centerX}" y="${svgHeight - 6}" text-anchor="middle" class="chart-axis-text">${b.shortLabel}</text>
          </g>
        `;
      })
      .join('');

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">
        ${gridMarkup}
        ${barsMarkup}
      </svg>
    `;

    updateSelectedBucketDetail(buckets[state.selectedBucketIndex]);

    // Pasang event klik pada masing-masing batang grafik
    container.querySelectorAll('.chart-group').forEach((groupEl) => {
      groupEl.addEventListener('click', () => {
        const idx = Number(groupEl.getAttribute('data-idx'));
        state.selectedBucketIndex = idx;
        container.querySelectorAll('.chart-group').forEach((g) => g.classList.remove('selected'));
        groupEl.classList.add('selected');
        updateSelectedBucketDetail(buckets[idx]);
      });
    });
  }

  function updateSelectedBucketDetail(bucket) {
    if (!bucket) return;
    const periodNameEl = document.getElementById('detail-period-name');
    const detailInEl = document.getElementById('detail-in');
    const detailOutEl = document.getElementById('detail-out');

    periodNameEl.textContent = bucket.fullLabel;
    if (state.hideBalance) {
      detailInEl.textContent = '+Rp ••••';
      detailOutEl.textContent = '-Rp ••••';
    } else {
      detailInEl.textContent = formatRupiah(bucket.income, true, 'income');
      detailOutEl.textContent = formatRupiah(bucket.expense, true, 'expense');
    }
  }

  // Render Daftar Transaksi (dengan Pencarian, Pagination Next Page, Hari, Tanggal, dan Jam)
  function renderTransactionsList() {
    const listEl = document.getElementById('transactions-list');
    const countLabel = document.getElementById('tx-count-label');
    const paginationEl = document.getElementById('pagination-container');
    const pageIndicatorEl = document.getElementById('page-indicator');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');

    // 1. Filter berdasarkan tipe (semua, masuk, keluar)
    let filtered = state.transactions.filter((tx) =>
      state.filterType === 'all' ? true : tx.type === state.filterType
    );

    // 2. Filter berdasarkan search query jika ada
    const query = (state.searchQuery || '').trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((tx) => {
        const cat = getCategoryMeta(tx.type, tx.category);
        const matchNote = (tx.note || '').toLowerCase().includes(query);
        const matchCat = cat.name.toLowerCase().includes(query);
        const matchAmount = String(tx.amount).includes(query);
        return matchNote || matchCat || matchAmount;
      });
    }

    // 3. Urutkan dari transaksi terbaru
    filtered.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      if (timeB !== timeA) return timeB.localeCompare(timeA);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const totalFiltered = filtered.length;

    countLabel.textContent = query
      ? `Ditemukan ${totalFiltered} catatan untuk "${state.searchQuery}"`
      : `${totalFiltered} catatan tersimpan offline`;

    // 4. Kelompokkan per tanggal TERLEBIH DAHULU agar transaksi di hari yang sama
    //    tidak pernah terpisah/terpotong saat berpindah halaman (Next Page)
    const allGroupsMap = new Map();
    for (const tx of filtered) {
      if (!allGroupsMap.has(tx.date)) {
        allGroupsMap.set(tx.date, []);
      }
      allGroupsMap.get(tx.date).push(tx);
    }

    const allDateGroups = [];
    for (const [dateStr, items] of allGroupsMap.entries()) {
      allDateGroups.push({ dateStr, items });
    }

    // Susun halaman berdasarkan grup hari utuh (target maks state.pageSize item per halaman,
    // namun 1 hari penuh selalu dijaga utuh dalam halaman yang sama)
    const pages = [];
    let currentPageGroups = [];
    let currentPageCount = 0;

    for (const group of allDateGroups) {
      if (currentPageGroups.length > 0 && currentPageCount + group.items.length > state.pageSize) {
        pages.push(currentPageGroups);
        currentPageGroups = [group];
        currentPageCount = group.items.length;
      } else {
        currentPageGroups.push(group);
        currentPageCount += group.items.length;
      }
    }
    if (currentPageGroups.length > 0) {
      pages.push(currentPageGroups);
    }

    const totalPages = Math.max(1, pages.length);
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const currentGroups = pages[state.currentPage - 1] || [];

    // Update kontrol pagination
    if (totalPages > 1) {
      paginationEl.classList.remove('hidden');
      pageIndicatorEl.textContent = `Hal ${state.currentPage} / ${totalPages}`;
      btnPrevPage.disabled = state.currentPage <= 1;
      btnNextPage.disabled = state.currentPage >= totalPages;
    } else {
      paginationEl.classList.add('hidden');
    }

    if (currentGroups.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state animate-enter-tactile">
          <div class="empty-icon">${query ? '🔍' : '📒'}</div>
          <h4>${query ? 'Catatan Tidak Ditemukan' : 'Belum Ada Catatan'}</h4>
          <p>${query ? 'Coba gunakan kata kunci pencarian yang lain.' : 'Ketuk tombol <strong>Catat Keuangan</strong> di bawah untuk mulai mencatat.'}</p>
        </div>
      `;
      return;
    }

    const todayStr = toLocalISOString(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = toLocalISOString(yesterdayDate);

    let html = '';
    let staggerIdx = 0;

    for (const { dateStr, items } of currentGroups) {
      const parsedD = parseLocalDate(dateStr);
      let dayName = parsedD.toLocaleDateString('id-ID', { weekday: 'long' });
      let fullDateFormatted = parsedD.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      let headerLabel = `${dayName}, ${fullDateFormatted}`;
      if (dateStr === todayStr) {
        headerLabel = `Hari Ini • ${dayName}, ${fullDateFormatted}`;
      } else if (dateStr === yesterdayStr) {
        headerLabel = `Kemarin • ${dayName}, ${fullDateFormatted}`;
      }

      const dayTotal = items.reduce(
        (sum, t) => sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)),
        0
      );

      html += `
        <div class="date-group-header animate-enter-tactile" style="--stagger-idx: ${staggerIdx++}">
          <span>${headerLabel}</span>
          <span class="date-group-total">${state.hideBalance ? '' : (dayTotal >= 0 ? '+' : '') + formatRupiah(dayTotal)}</span>
        </div>
      `;

      for (const tx of items) {
        const cat = getCategoryMeta(tx.type, tx.category);
        const title = tx.note && tx.note.trim() ? tx.note : cat.name;
        const timeDisplay = tx.time ? ` • ${tx.time} WIB` : '';
        const subtitle = `${cat.name}${timeDisplay}`;
        const amountDisplay = state.hideBalance
          ? 'Rp •••••'
          : formatRupiah(tx.amount, true, tx.type);

        html += `
          <article class="tx-item ${tx.type} animate-enter-tactile" style="--stagger-idx: ${staggerIdx++}" data-id="${tx.id}" role="button" tabindex="0" aria-label="Edit ${title}">
            <div class="tx-left">
              <div class="tx-cat-icon" aria-hidden="true">${cat.emoji}</div>
              <div class="tx-details">
                <div class="tx-title">${escapeHtml(title)}</div>
                <div class="tx-meta">${escapeHtml(subtitle)}</div>
              </div>
            </div>
            <div class="tx-right">
              <div class="tx-amount ${tx.type}">${amountDisplay}</div>
              <button type="button" class="tx-delete-inline-btn" data-delete-id="${tx.id}" title="Hapus catatan ini" aria-label="Hapus catatan ${title}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </article>
        `;
      }
    }

    listEl.innerHTML = html;

    // Klik tombol hapus inline
    listEl.querySelectorAll('.tx-delete-inline-btn').forEach((delBtn) => {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Mencegah membuka modal edit
        const txId = delBtn.getAttribute('data-delete-id');
        promptDeleteTransaction(txId);
      });
    });

    // Klik item untuk edit / detail
    listEl.querySelectorAll('.tx-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const txId = itemEl.getAttribute('data-id');
        openModalForEdit(txId);
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // Modal Tambah & Edit Transaksi
  // =========================================================================
  function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const list = CATEGORIES[state.modalType] || CATEGORIES.expense;

    if (!list.some((c) => c.id === state.selectedCategory)) {
      state.selectedCategory = list[0].id;
    }

    grid.innerHTML = list
      .map(
        (cat) => `
        <button type="button" class="cat-option ${cat.id === state.selectedCategory ? 'active' : ''}" data-cat="${cat.id}">
          <span class="cat-emoji">${cat.emoji}</span>
          <span>${cat.name}</span>
        </button>
      `
      )
      .join('');

    grid.querySelectorAll('.cat-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedCategory = btn.getAttribute('data-cat');
        renderCategoryGrid();
      });
    });
  }

  function setModalType(type) {
    state.modalType = type;
    const btnExp = document.getElementById('type-expense');
    const btnInc = document.getElementById('type-income');
    if (type === 'expense') {
      btnExp.classList.add('active');
      btnInc.classList.remove('active');
    } else {
      btnInc.classList.add('active');
      btnExp.classList.remove('active');
    }
    renderCategoryGrid();
  }

  function openModalForCreate() {
    const now = new Date();
    document.getElementById('modal-title').textContent = 'Catat Keuangan';
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    document.getElementById('tx-date').value = toLocalISOString(now);
    document.getElementById('tx-time').value = toLocalTimeString(now);
    document.getElementById('btn-delete-tx').classList.add('hidden');
    setModalType('expense');
    state.selectedCategory = 'makan';
    renderCategoryGrid();

    const modal = document.getElementById('tx-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('tx-amount').focus();
    }, 100);
  }

  function openModalForEdit(txId) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;

    document.getElementById('modal-title').textContent = 'Edit Catatan';
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-amount').value = Number(tx.amount).toLocaleString('id-ID');
    document.getElementById('tx-note').value = tx.note || '';
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-time').value = tx.time || '12:00';
    document.getElementById('btn-delete-tx').classList.remove('hidden');

    setModalType(tx.type);
    state.selectedCategory = tx.category;
    renderCategoryGrid();

    document.getElementById('tx-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('tx-modal').classList.add('hidden');
  }

  function parseNumericInput(raw) {
    const digits = String(raw).replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function renderAll() {
    renderBalanceSummary();
    renderChart();
    renderTransactionsList();
  }

  // =========================================================================
  // Event Listeners & PWA Initialization
  // =========================================================================
  function initEvents() {
    // Toggle Tema Terang / Gelap
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Sembunyikan / tampilkan saldo
    document.getElementById('btn-toggle-visibility').addEventListener('click', () => {
      state.hideBalance = !state.hideBalance;
      localStorage.setItem(HIDE_BALANCE_KEY, String(state.hideBalance));
      renderAll();
    });

    // Tab Periode Grafik (Harian, Mingguan, Bulanan)
    document.querySelectorAll('.segment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.segment-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        state.chartPeriod = btn.getAttribute('data-period');
        state.periodOffset = 0; // Reset ke rentang terkini saat ganti tab
        state.selectedBucketIndex = -1;
        renderChart();
      });
    });

    // Navigasi Grafik: Geser ke Periode Sebelumnya (Mundur ke masa lalu)
    document.getElementById('btn-chart-prev').addEventListener('click', () => {
      state.periodOffset += 1;
      state.selectedBucketIndex = -1;
      renderChart();
    });

    // Navigasi Grafik: Geser ke Periode Berikutnya (Maju ke arah hari ini)
    document.getElementById('btn-chart-next').addEventListener('click', () => {
      if (state.periodOffset > 0) {
        state.periodOffset -= 1;
        state.selectedBucketIndex = -1;
        renderChart();
      }
    });

    // Navigasi Grafik: Reset langsung kembali ke Hari Ini
    document.getElementById('btn-chart-reset').addEventListener('click', () => {
      state.periodOffset = 0;
      state.selectedBucketIndex = -1;
      renderChart();
    });

    // Dialog Konfirmasi Hapus Transaksi
    const deleteModal = document.getElementById('delete-confirm-modal');
    const confirmInfoEl = document.getElementById('confirm-tx-info');

    window.promptDeleteTransaction = function (txId) {
      const tx = state.transactions.find((t) => t.id === txId);
      if (!tx) return;
      state.pendingDeleteTxId = txId;
      const cat = getCategoryMeta(tx.type, tx.category);
      const title = tx.note && tx.note.trim() ? tx.note : cat.name;
      const nominal = formatRupiah(tx.amount);
      confirmInfoEl.innerHTML = `Apakah Anda yakin ingin menghapus catatan <strong>"${escapeHtml(title)}"</strong> sebesar <strong>${nominal}</strong>? Tindakan ini tidak dapat dibatalkan.`;
      deleteModal.classList.remove('hidden');
    };

    function closeDeleteModal() {
      state.pendingDeleteTxId = null;
      deleteModal.classList.add('hidden');
    }

    document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', (e) => {
      if (e.target.id === 'delete-confirm-modal') closeDeleteModal();
    });

    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
      if (!state.pendingDeleteTxId) return;
      const idToDelete = state.pendingDeleteTxId;
      state.transactions = state.transactions.filter((t) => t.id !== idToDelete);
      saveData();
      state.selectedBucketIndex = -1;
      renderAll();
      closeDeleteModal();
      closeModal(); // jika modal edit sedang terbuka
    });

    // Filter Transaksi (Semua, Masuk, Keluar)
    document.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterType = btn.getAttribute('data-filter');
        state.currentPage = 1; // Reset ke halaman 1 saat filter diubah
        renderTransactionsList();
      });
    });

    // Fitur Search Transaksi
    const searchInput = document.getElementById('tx-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        state.currentPage = 1; // Reset ke halaman 1 saat pencarian baru
        if (state.searchQuery.trim().length > 0) {
          clearSearchBtn.classList.remove('hidden');
        } else {
          clearSearchBtn.classList.add('hidden');
        }
        renderTransactionsList();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        state.currentPage = 1;
        clearSearchBtn.classList.add('hidden');
        searchInput.focus();
        renderTransactionsList();
      });
    }

    // Fitur Pagination (Next Page & Prev Page)
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');

    if (btnPrevPage) {
      btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage -= 1;
          renderTransactionsList();
          // Scroll halus ke awal bagian catatan
          document.querySelector('.transactions-section').scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    if (btnNextPage) {
      btnNextPage.addEventListener('click', () => {
        state.currentPage += 1;
        renderTransactionsList();
        document.querySelector('.transactions-section').scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Buka & Tutup Modal Catatan
    document.getElementById('btn-add-tx').addEventListener('click', openModalForCreate);
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('tx-modal').addEventListener('click', (e) => {
      if (e.target.id === 'tx-modal') closeModal();
    });

    // Pilih Tipe di Modal
    document.getElementById('type-expense').addEventListener('click', () => setModalType('expense'));
    document.getElementById('type-income').addEventListener('click', () => setModalType('income'));

    // Format ribuan otomatis saat ketik nominal
    const amountInput = document.getElementById('tx-amount');
    amountInput.addEventListener('input', () => {
      const num = parseNumericInput(amountInput.value);
      amountInput.value = num > 0 ? num.toLocaleString('id-ID') : '';
    });

    // Tombol cepat nominal (+10rb, +25rb, dst)
    document.querySelectorAll('.chip-amount').forEach((chip) => {
      chip.addEventListener('click', () => {
        const addVal = Number(chip.getAttribute('data-val')) || 0;
        const currentVal = parseNumericInput(amountInput.value);
        const nextVal = currentVal + addVal;
        amountInput.value = nextVal.toLocaleString('id-ID');
      });
    });

    // Simpan Catatan Baru / Edit
    document.getElementById('tx-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseNumericInput(amountInput.value);
      if (amount <= 0) {
        amountInput.focus();
        return;
      }

      const id = document.getElementById('tx-id').value;
      const note = document.getElementById('tx-note').value.trim();
      const date = document.getElementById('tx-date').value || toLocalISOString(new Date());
      const time = document.getElementById('tx-time').value || toLocalTimeString(new Date());

      if (id) {
        const idx = state.transactions.findIndex((t) => t.id === id);
        if (idx !== -1) {
          state.transactions[idx] = {
            ...state.transactions[idx],
            type: state.modalType,
            amount,
            category: state.selectedCategory,
            note,
            date,
            time
          };
        }
      } else {
        state.transactions.push({
          id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: state.modalType,
          amount,
          category: state.selectedCategory,
          note,
          date,
          time,
          createdAt: Date.now()
        });
      }

      saveData();
      state.selectedBucketIndex = -1;
      renderAll();
      closeModal();
    });

    // Hapus Catatan dari dalam modal edit
    document.getElementById('btn-delete-tx').addEventListener('click', () => {
      const id = document.getElementById('tx-id').value;
      if (!id) return;
      promptDeleteTransaction(id);
    });

    // Status Offline / Online Indicator
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('.status-dot');
    const updateNetworkBadge = () => {
      if (navigator.onLine) {
        statusText.textContent = 'Mode Online';
        if (statusDot) statusDot.style.backgroundColor = 'var(--income-color)';
      } else {
        // Jangan ganti tulisan saat offline, tetap konsisten "Mode Offline"
        statusText.textContent = 'Mode Offline';
        if (statusDot) statusDot.style.backgroundColor = '#38BDF8';
      }
    };
    window.addEventListener('online', updateNetworkBadge);
    window.addEventListener('offline', updateNetworkBadge);
    updateNetworkBadge();

    // Animasi Mewah Splash Screen Saat Membuka Aplikasi
    const splashEl = document.getElementById('splash-screen');
    if (splashEl) {
      setTimeout(() => {
        splashEl.classList.add('fade-out');
        setTimeout(() => {
          splashEl.remove();
        }, 600);
      }, 1000);
    }
  }

  // Bootstrap Native Android App
  loadData();
  initEvents();
  renderAll();
})();
