/* ── Hotel Revenue Intelligence · Dashboard ──────────────────────────────── */

// Chart.js global defaults
Chart.defaults.color = '#8b92a8';
Chart.defaults.borderColor = '#2e3348';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.animation = false;        // kills scroll-triggered repaints
Chart.defaults.animations = false;
Chart.defaults.transitions = {};

// ── State ─────────────────────────────────────────────────────────────────────
let RAW = null;           // full kpi_data.json payload
let CHARTS = {};          // Chart instances keyed by id
let ALL_MONTHS = [];      // sorted array of "YYYY-MM" strings
let ALL_CHANNELS = [];    // all distinct channel names

// Active filter state
let F = {
  hotel:    'all',        // 'all' | 'City Hotel' | 'Resort Hotel'
  from:     null,         // "YYYY-MM"
  to:       null,         // "YYYY-MM"
  channels: new Set(),    // selected channel names (empty = all)
};

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    // kpi_data.json is co-located in dashboard/ for static hosting (Netlify/GitHub Pages)
    // When running locally via python3 -m http.server from project root, also works
    const res = await fetch('./kpi_data.json').catch(() => null)
      ?? await fetch('../output/kpi_data.json');
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? 'network error'}`);
    RAW = await res.json();
  } catch (e) {
    document.body.innerHTML =
      `<div style="padding:60px;text-align:center;color:#ef4444;">
        <strong>Cannot load data.</strong><br>
        Run from project root: <code>cd hotel-revenue-intelligence &amp;&amp; python3 -m http.server 8080</code><br>
        then open <code>http://localhost:8080/dashboard/index.html</code><br><br>
        <small>${e.message}</small>
      </div>`;
    return;
  }

  ALL_MONTHS   = RAW.monthly_kpis.map(r => r.month).sort();
  ALL_CHANNELS = RAW.channel_analysis.map(r => r.channel);

  F.from = ALL_MONTHS[0];
  F.to   = ALL_MONTHS[ALL_MONTHS.length - 1];
  F.channels = new Set(ALL_CHANNELS);

  buildFilters();
  render();
})();

// ── Build filter controls ─────────────────────────────────────────────────────
function buildFilters() {
  // Date dropdowns
  const selFrom = document.getElementById('filter-from');
  const selTo   = document.getElementById('filter-to');
  ALL_MONTHS.forEach(m => {
    selFrom.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`);
    selTo.insertAdjacentHTML('beforeend',   `<option value="${m}">${m}</option>`);
  });
  selFrom.value = F.from;
  selTo.value   = F.to;

  selFrom.addEventListener('change', () => { F.from = selFrom.value; render(); });
  selTo.addEventListener('change',   () => { F.to   = selTo.value;   render(); });

  // Hotel type
  document.getElementById('filter-hotel').addEventListener('change', e => {
    F.hotel = e.target.value; render();
  });

  // Channel pills
  const pillsContainer = document.getElementById('filter-channels');
  ALL_CHANNELS.forEach(ch => {
    const pill = document.createElement('span');
    pill.className = 'channel-pill active';
    pill.textContent = ch;
    pill.dataset.channel = ch;
    pill.addEventListener('click', () => {
      if (F.channels.has(ch)) {
        if (F.channels.size === 1) return; // keep at least one
        F.channels.delete(ch);
        pill.classList.remove('active');
      } else {
        F.channels.add(ch);
        pill.classList.add('active');
      }
      render();
    });
    pillsContainer.appendChild(pill);
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    F.hotel    = 'all';
    F.from     = ALL_MONTHS[0];
    F.to       = ALL_MONTHS[ALL_MONTHS.length - 1];
    F.channels = new Set(ALL_CHANNELS);

    document.getElementById('filter-hotel').value = 'all';
    selFrom.value = F.from;
    selTo.value   = F.to;
    document.querySelectorAll('.channel-pill').forEach(p => p.classList.add('active'));
    render();
  });
}

// ── Filter helpers ────────────────────────────────────────────────────────────
function filteredMonthly() {
  return RAW.monthly_kpis.filter(r => r.month >= F.from && r.month <= F.to);
}

function filteredChannels() {
  return RAW.channel_analysis.filter(r => F.channels.has(r.channel));
}

function filteredHeatmap() {
  return RAW.room_type_heatmap.filter(r => r.month >= F.from && r.month <= F.to);
}

function filteredPricing() {
  return RAW.pricing_recommendations.filter(r => r.month >= F.from && r.month <= F.to);
}

// ── Main render orchestrator ──────────────────────────────────────────────────
function render() {
  const monthly  = filteredMonthly();
  const channels = filteredChannels();
  const heatmap  = filteredHeatmap();
  const pricing  = filteredPricing();

  renderKPICards(monthly);
  renderTrend(monthly);
  renderChannelRev(channels);
  renderChannelCancel(channels);
  renderHeatmap(heatmap);
  renderPricingTable(pricing);
  renderElasticity();
}

// ── KPI Cards ────────────────────────────────────────────────────────────────
function renderKPICards(monthly) {
  if (!monthly.length) return;

  const avg = (key) => monthly.reduce((s, r) => s + r[key], 0) / monthly.length;
  const sum = (key) => monthly.reduce((s, r) => s + r[key], 0);

  const revpar  = avg('revpar');
  const adr     = avg('adr');
  const occ     = avg('occupancy_rate');
  const cancel  = avg('cancellation_rate');

  // MoM comparison: last month vs second-to-last in selection
  const last = monthly[monthly.length - 1];
  const prev = monthly.length > 1 ? monthly[monthly.length - 2] : null;

  setKPI('revpar', `$${revpar.toFixed(0)}`,   prev ? delta(last.revpar,          prev.revpar,          false) : null);
  setKPI('adr',    `$${adr.toFixed(2)}`,       prev ? delta(last.adr,             prev.adr,             false) : null);
  setKPI('occ',    `${occ.toFixed(1)}%`,       prev ? delta(last.occupancy_rate,  prev.occupancy_rate,  false) : null);
  setKPI('cancel', `${cancel.toFixed(1)}%`,    prev ? delta(last.cancellation_rate, prev.cancellation_rate, true) : null);
}

function delta(curr, prev, invert) {
  const d = curr - prev;
  if (Math.abs(d) < 0.01) return { label: '±0', dir: 'flat' };
  const up = invert ? d < 0 : d > 0;
  return {
    label: `${d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)}`,
    dir: up ? 'up' : 'down',
  };
}

function setKPI(id, value, deltaObj) {
  document.getElementById(`val-${id}`).textContent = value;
  const el = document.getElementById(`delta-${id}`);
  if (!el) return;
  if (!deltaObj) { el.textContent = ''; el.className = 'kpi-delta'; return; }
  el.textContent = deltaObj.label;
  el.className   = `kpi-delta ${deltaObj.dir}`;
}

// ── Trend chart (RevPAR + ADR dual-axis) ─────────────────────────────────────
function renderTrend(monthly) {
  const labels = monthly.map(r => r.month);
  const revpar  = monthly.map(r => r.revpar);
  const adr     = monthly.map(r => r.adr);

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'RevPAR',
          data: revpar,
          borderColor: '#00d4aa',
          backgroundColor: 'rgba(0,212,170,0.08)',
          yAxisID: 'y',
          tension: 0.3,
          pointRadius: 3,
          fill: true,
        },
        {
          label: 'ADR',
          data: adr,
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          yAxisID: 'y1',
          tension: 0.3,
          borderDash: [5, 3],
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#2e3348' } },
        y: {
          type: 'linear', position: 'left',
          title: { display: true, text: 'RevPAR ($)', color: '#8b92a8' },
          grid: { color: '#2e3348' },
          ticks: { callback: v => `$${v}` },
        },
        y1: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'ADR ($)', color: '#8b92a8' },
          grid: { drawOnChartArea: false },
          ticks: { callback: v => `$${v}` },
        },
      },
    },
  };

  upsertChart('chart-trend', cfg);
}

// ── Channel revenue bar ───────────────────────────────────────────────────────
function renderChannelRev(channels) {
  const COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
  const cfg = {
    type: 'bar',
    data: {
      labels: channels.map(c => c.channel),
      datasets: [{
        label: 'Total Revenue',
        data: channels.map(c => c.total_revenue),
        backgroundColor: channels.map((_, i) => COLORS[i % COLORS.length]),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `$${ctx.parsed.y.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#2e3348' },
          ticks: { callback: v => `$${(v / 1e6).toFixed(1)}M` },
        },
      },
    },
  };
  upsertChart('chart-channel-rev', cfg);
}

// ── Channel cancellation rate horizontal bar ──────────────────────────────────
function renderChannelCancel(channels) {
  // Sort descending by cancellation rate for clarity
  const sorted = [...channels].sort((a, b) => b.cancellation_rate - a.cancellation_rate);
  const cfg = {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.channel),
      datasets: [{
        label: 'Cancellation Rate (%)',
        data: sorted.map(c => c.cancellation_rate),
        backgroundColor: sorted.map(c =>
          c.cancellation_rate > 35 ? 'rgba(239,68,68,0.7)' :
          c.cancellation_rate > 20 ? 'rgba(245,158,11,0.7)' :
                                     'rgba(34,197,94,0.7)'
        ),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}%` },
        },
      },
      scales: {
        x: {
          grid: { color: '#2e3348' },
          max: 100,
          ticks: { callback: v => `${v}%` },
        },
        y: { grid: { display: false } },
      },
    },
  };
  upsertChart('chart-channel-cancel', cfg);
}

// ── Room-type heatmap ─────────────────────────────────────────────────────────
function renderHeatmap(cells) {
  const months    = [...new Set(cells.map(c => c.month))].sort();
  const roomTypes = [...new Set(cells.map(c => c.room_type))].sort();

  // Build lookup
  const lookup = {};
  cells.forEach(c => { lookup[`${c.room_type}||${c.month}`] = c.avg_adr; });

  const allADR = cells.map(c => c.avg_adr).filter(v => v > 0);
  const minADR = Math.min(...allADR);
  const maxADR = Math.max(...allADR);

  // Build data points: {x: month_index, y: room_index, v: adr}
  const data = [];
  roomTypes.forEach((rt, ri) => {
    months.forEach((mo, mi) => {
      const v = lookup[`${rt}||${mo}`] ?? 0;
      data.push({ x: mi, y: ri, v });
    });
  });

  function adrColor(v) {
    if (!v) return 'rgba(30,30,50,0.4)';
    const t = (v - minADR) / (maxADR - minADR || 1);
    // cool → warm gradient
    const r = Math.round(15  + t * 220);
    const g = Math.round(40  + t * 100);
    const b = Math.round(120 - t * 80);
    return `rgba(${r},${g},${b},0.85)`;
  }

  // Fixed cell dimensions: derive width from container, fix height per row
  const container = document.getElementById('chart-heatmap')?.parentElement;
  const containerW = container ? container.clientWidth - 100 : 600;
  const CELL_H = 30; // fixed px per room-type row — never depends on container height

  // Set canvas height explicitly so the chart box doesn't overflow
  const canvas = document.getElementById('chart-heatmap');
  if (canvas) canvas.style.height = (roomTypes.length * (CELL_H + 4) + 60) + 'px';

  const cellW = Math.max(6, containerW / months.length - 2);
  const cellH = CELL_H;

  const cfg = {
    type: 'matrix',
    data: {
      datasets: [{
        label: 'ADR',
        data,
        backgroundColor: ctx => adrColor(ctx.dataset.data[ctx.dataIndex]?.v),
        borderColor: '#0f1117',
        borderWidth: 2,
        width:  cellW,
        height: cellH,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => {
              const d = ctx[0].raw;
              return `${roomTypes[d.y]} · ${months[d.x]}`;
            },
            label: ctx => ctx.raw.v ? `ADR: $${ctx.raw.v.toFixed(2)}` : 'No data',
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.5,
          max: months.length - 0.5,
          ticks: {
            stepSize: 1,
            callback: (v) => months[Math.round(v)] ?? '',
            maxRotation: 45,
          },
          grid: { display: false },
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: roomTypes.length - 0.5,
          ticks: {
            stepSize: 1,
            callback: (v) => roomTypes[Math.round(v)] ?? '',
          },
          grid: { display: false },
        },
      },
    },
  };

  // Matrix charts must always be rebuilt — in-place update doesn't work for this type
  if (CHARTS['chart-heatmap']) { CHARTS['chart-heatmap'].destroy(); delete CHARTS['chart-heatmap']; }
  if (canvas) CHARTS['chart-heatmap'] = new Chart(canvas, cfg);
}

// ── Pricing recommendations table ─────────────────────────────────────────────
function renderPricingTable(pricing) {
  const tbody = document.getElementById('pricing-tbody');
  tbody.innerHTML = '';

  pricing.forEach(r => {
    const actionClass = r.action.toLowerCase();
    const deltaSign   = r.adr_change_pct > 0 ? '+' : '';
    const revSign     = r.expected_revenue_change_pct > 0 ? '+' : '';

    const tr = document.createElement('tr');
    tr.className = `row-${actionClass}`;
    tr.innerHTML = `
      <td>${r.month}</td>
      <td>${r.occupancy_rate.toFixed(1)}%</td>
      <td>$${r.current_adr.toFixed(2)}</td>
      <td>$${r.recommended_adr.toFixed(2)}</td>
      <td style="color:${r.adr_change_pct === 0 ? '#8b92a8' : r.adr_change_pct > 0 ? '#22c55e' : '#3b82f6'}">
        ${deltaSign}${r.adr_change_pct.toFixed(1)}%
      </td>
      <td style="color:${r.expected_revenue_change_pct === 0 ? '#8b92a8' : r.expected_revenue_change_pct > 0 ? '#22c55e' : '#3b82f6'}">
        ${revSign}${r.expected_revenue_change_pct.toFixed(0)}%
      </td>
      <td><span class="action-badge action-badge--${actionClass}">${r.action}</span></td>
      <td class="rationale">${r.rationale}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Elasticity panel ──────────────────────────────────────────────────────────
function renderElasticity() {
  const e = RAW.price_elasticity;
  document.getElementById('e-coef').textContent  = e.coefficient.toFixed(4);
  document.getElementById('e-r2').textContent    = e.r_squared.toFixed(3);
  document.getElementById('e-interp').textContent = e.interpretation;
}

// ── Chart upsert helper ───────────────────────────────────────────────────────
function upsertChart(id, cfg) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
  CHARTS[id] = new Chart(canvas, cfg);
}
