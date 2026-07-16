const { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } = React;

// ── STICKY HEADER MEASUREMENT ───────────────────────────────────────
// The app header, each table's toolbar bar, and its filter bar are all
// position:sticky and stack on top of one another. Instead of guessing
// fixed pixel heights (fragile — breaks the moment text wraps or the
// screen gets narrower/mobile), we measure the *real* rendered height of
// each layer and publish it as a CSS variable that the next layer reads.
// This keeps the stack correctly aligned on every screen size, including
// the taller, stacked mobile header.
//
// Ordering note: --stk-1 (app topbar height) is published from a passive
// effect in App, which can commit slightly after a table's toolbar bar
// (a plain callback ref, fired during commit) does its first measurement.
// To avoid that one-time race leaving --stk-2/--stk-3 stale, every
// publisher also listens for a shared 'stk-recalc' event and anyone who
// (re)computes a value fires that event, so all downstream layers redo
// their math too.
function readStkVar(name) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return isNaN(v) ? 0 : v;
}
function setStkVar(name, px) {
  document.documentElement.style.setProperty(name, Math.round(px) + 'px');
}
// Callback ref used directly on the per-table toolbar bars (plain DOM nodes,
// not React components), so a single stable function works everywhere.
// Each publisher is fully independent (own ResizeObserver + resize listener,
// no cross-variable event chaining) — chaining synchronous events between
// publishers previously caused a real infinite-recursion crash when a value
// oscillated (e.g. a wrapping toolbar row nudging the page's scrollbar on/off).
// A couple of delayed re-checks after mount cover the one-time race where the
// app topbar hasn't finished measuring itself yet.
function measureToStk2(el) {
  if (!el) return;
  const compute = () => setStkVar('--stk-2', readStkVar('--stk-1') + el.offsetHeight);
  compute();
  if (!el.__stkRO) {
    el.__stkRO = new ResizeObserver(compute);
    el.__stkRO.observe(el);
    window.addEventListener('resize', compute);
    // Belt-and-suspenders: --stk-1 (app topbar height) can still change shortly
    // after this element mounts — e.g. async employee data arriving changes
    // whether the "pending IDs" pill renders, which can change the topbar's
    // height. ResizeObserver only watches THIS element, not --stk-1, so poll
    // for a few seconds after mount and self-stop once the tab is switched
    // away (element removed from the DOM) or things settle.
    let ticks = 0;
    const iv = setInterval(() => {
      if (!el.isConnected || ++ticks > 20) { clearInterval(iv); return; }
      compute();
    }, 250);
  }
}
// Hook version for real components (App's topbar, FilterBar) that can hold refs.
// Uses a callback ref (via state) rather than useRef + effect-with-no-deps.
// Reason: App() calls this before it knows whether the user is logged in, so
// its very first render(s) return null/LoginScreen with nothing mounted yet.
// A plain useRef + `useLayoutEffect(fn, [])` would run its one and only pass
// while ref.current is still null, see "no element", and never run again —
// exactly what was leaving --stk-1 stuck at its fallback. A callback ref
// re-fires (and the effect re-runs, since it depends on the node in state)
// the moment the real DOM node actually shows up.
function useStkPublish(varName, baseVarName) {
  const [node, setNode] = useState(null);
  const ref = useCallback((n) => setNode(n), []);
  useLayoutEffect(() => {
    const el = node;
    if (!el) return;
    const compute = () => setStkVar(varName, (baseVarName ? readStkVar(baseVarName) : 0) + el.offsetHeight);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    // Same belt-and-suspenders re-check as measureToStk2 — covers a base var
    // (e.g. --stk-1 or --stk-2) finishing its own measurement a beat later.
    let ticks = 0;
    const iv = setInterval(() => { if (++ticks > 20) { clearInterval(iv); return; } compute(); }, 250);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); clearInterval(iv); };
  }, [node]);
  return ref;
}

// Drag-scroll helper: HR/Finance users with a mouse can click and drag wide tables left/right.
function useDragScroll() {
  useEffect(() => {
    let active = null;
    const stop = () => {
      if (active && active.el) active.el.classList.remove('dragging');
      active = null;
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest && e.target.closest('.drag-scroll');
      if (!el) return;
      if (e.target.closest('button,input,select,textarea,a,label,[contenteditable="true"]')) return;
      if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
      active = { el, startX:e.clientX, startY:e.clientY, left:el.scrollLeft, top:el.scrollTop, moved:false };
      el.classList.add('dragging');
    };
    const onMove = (e) => {
      if (!active) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) active.moved = true;
      active.el.scrollLeft = active.left - dx;
      active.el.scrollTop = active.top - dy;
      e.preventDefault();
    };
    const onClick = (e) => {
      if (active && active.moved) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stop);
    document.addEventListener('mouseleave', stop);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('mouseleave', stop);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
}

// ── CONFIG ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://mbwsfwebbrzurpozyxks.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1id3Nmd2ViYnJ6dXJwb3p5eGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODA0MzMsImV4cCI6MjA5Njg1NjQzM30.K2GhBkRnCCjwSv0n42fL-92k1HwXvmDnMszpFo4C8aY';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const HR_URL = 'https://oaerqjrkdpuhiproppaz.supabase.co';
const HR_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZXJxanJrZHB1aGlwcm9wcGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTQ0NjksImV4cCI6MjA5NTUzMDQ2OX0.qBtb3OV1aFGX8e1QUg19qZmOwIIjipF6IZwBOLXY3YI';
const hrDb = supabase.createClient(HR_URL, HR_KEY);


// ── HR SALARY BRIDGE ──────────────────────────────────────────────
// Finance should not re-enter basic salary / fixed allowance every month.
// This bridge first tries a safe HR view (recommended) and then falls back to
// the HR employees table. If HR RLS blocks it, the portal shows the exact error
// and keeps Finance's local salary profile sheet editable.
const HR_SALARY_VIEW = 'v_finance_employee_salary';
const HR_SALARY_VIEW_SQL = `-- SATCO HR → Finance bridge setup
-- Run this in the HR Supabase SQL Editor, not the Finance project.
-- Fixes: ERROR 42P16: cannot drop columns from view
-- This drops only the Finance bridge views. It does NOT drop employee data/tables.

DROP VIEW IF EXISTS public.v_temp_candidates CASCADE;
DROP VIEW IF EXISTS public.v_finance_employee_mob_demob CASCADE;
DROP VIEW IF EXISTS public.v_finance_employee_salary CASCADE;

-- Salary / WPS safe bridge for Finance portal
CREATE VIEW public.v_finance_employee_salary AS
SELECT
  e.employee_id,
  e.full_name,
  e.position,
  e.nationality,
  e.joining_date,
  e.hired_from,
  e.supplier_name,
  e.status,
  e.visa_trade,
  e.department,
  e.bank_iban AS iban,
  e.basic_salary,
  e.allowance AS fixed_allowance
FROM public.employees e
WHERE e.employee_id IS NOT NULL;

-- Full mobilization/demobilization history bridge for Finance portal (v2 — returns every
-- assignment row per employee, not just the latest, so Finance can reconstruct every
-- demob→remob gap for Camp Cost tracking, not only the employee's current status).
CREATE VIEW public.v_finance_employee_mob_demob AS
SELECT
  m.employee_id,
  m.mobilization_date,
  m.demobilization_date,
  m.location,
  m.supply
FROM public.mob_demob m
WHERE m.employee_id IS NOT NULL
ORDER BY m.employee_id, m.mobilization_date ASC NULLS FIRST, m.demobilization_date ASC NULLS FIRST;

-- Temporary candidate bridge for Finance deposits/advances before final employee ID
CREATE VIEW public.v_temp_candidates AS
SELECT
  h.temp_employee_id,
  h.candidate_name,
  COALESCE(h.position_selected, h.position) AS position_display,
  h.status
FROM public.hiring_pipeline h
WHERE h.temp_employee_id IS NOT NULL;

-- Finance portal uses HR anon key, therefore anon SELECT is required for these limited views.
-- If later you move Finance-to-HR access behind logged-in/authenticated users, remove anon grant.
-- IMPORTANT: The views read from public.employees — anon must have SELECT on that base table too.
GRANT SELECT ON public.employees TO anon, authenticated;
GRANT SELECT ON public.mob_demob TO anon, authenticated;
GRANT SELECT ON public.hiring_pipeline TO anon, authenticated;
GRANT SELECT ON public.v_finance_employee_salary TO anon, authenticated;
GRANT SELECT ON public.v_finance_employee_mob_demob TO anon, authenticated;
GRANT SELECT ON public.v_temp_candidates TO anon, authenticated;

-- Refresh Supabase/PostgREST schema cache so the browser stops showing 404/schema-cache errors.
NOTIFY pgrst, 'reload schema';

-- Quick test queries. Run after setup if needed:
-- SELECT * FROM public.v_finance_employee_salary LIMIT 5;
-- SELECT * FROM public.v_finance_employee_mob_demob LIMIT 5;
-- SELECT * FROM public.v_temp_candidates LIMIT 5;`

function toMoneyNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n) ? n : null;
}
function firstValue(row, keys) {
  for (const k of keys) if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  return null;
}
function firstNumber(row, keys) {
  for (const k of keys) {
    const n = toMoneyNumber(row && row[k]);
    if (n !== null) return n;
  }
  return null;
}
function humanDbError(error) {
  if (!error) return '';
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return parts.join(' · ') || String(error);
}
function extractHrSalary(row) {
  const employee_id = String(firstValue(row, ['employee_id','emp_id','employee_code','employee_no','staff_id','code','id']) || '').trim();
  return {
    employee_id,
    full_name: String(firstValue(row, ['full_name','employee_name','name','candidate_name']) || '').trim(),
    position: firstValue(row, ['position','designation','position_display','trade']) || '',
    iban: String(firstValue(row, ['iban','bank_iban','account_iban','salary_iban']) || '').replace(/\s/g,'').toUpperCase(),
    basic_salary: firstNumber(row, ['basic_salary','basic','basic_pay','basic_wage','monthly_basic','salary_basic','basic_aed','wps_basic_salary']),
    fixed_allowance: firstNumber(row, ['fixed_allowance','allowance','allowances','total_allowance','monthly_allowance','salary_allowance','fixed_allowances','allowance_aed','wps_fixed_allowance']),
    raw: row,
  };
}
function salaryMapFromRows(rows) {
  const m = {};
  (rows||[]).forEach(r => { if (r.employee_id) m[r.employee_id] = r; });
  return m;
}
async function loadHrSalaryRows() {
  // Important: do NOT fall back to hrDb.from('employees') here.
  // HR employees is intentionally protected by RLS; Finance should read only
  // the narrow bridge view created by HR. This removes the repeated 401 errors.
  try {
    const { data, error } = await hrDb.from(HR_SALARY_VIEW).select('*').order('employee_id',{ascending:true});
    if (!error && Array.isArray(data)) {
      const rows = data.map(extractHrSalary).filter(r=>r.employee_id);
      return { rows, source:'HR bridge view '+HR_SALARY_VIEW, error:null };
    }
    return { rows:[], source:null, error:`${HR_SALARY_VIEW}: ${humanDbError(error)}` };
  } catch (e) {
    return { rows:[], source:null, error:`${HR_SALARY_VIEW}: ${e.message || String(e)}` };
  }
}
async function pullHrFinanceEmployee(employeeId) {
  const id = String(employeeId||'').trim();
  if (!id) return { row:null, error:'Employee ID required' };
  const { data, error } = await hrDb.from(HR_SALARY_VIEW).select('*').eq('employee_id', id).maybeSingle();
  if (!error && data) return { row:extractHrSalary(data), error:null, source:HR_SALARY_VIEW };
  return { row:null, error:`${HR_SALARY_VIEW}: ${humanDbError(error) || 'No HR salary/IBAN record found'}` };
}

// ── SATCO LETTERHEAD (base64 PNG, embedded for invoice document generation) ──
// Letterhead header/footer banners live as real .png files (./letterhead-header.png,
// ./letterhead-footer.png) instead of inline base64 — fetched once and cached as Uint8Array
// for the docx ImageRun calls below (all of which run inside async export handlers).
let _letterheadAssetsPromise = null;
function loadLetterheadAssets() {
  if (!_letterheadAssetsPromise) {
    _letterheadAssetsPromise = Promise.all([
      fetch('./letterhead-header.png').then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)),
      fetch('./letterhead-footer.png').then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)),
    ]).then(([header, footer]) => ({ header, footer }));
  }
  return _letterheadAssetsPromise;
}


// ── STYLES ───────────────────────────────────────────────────────
const S = {
  th:     { textAlign:'left', padding:'8px 12px', fontSize:'11px', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' },
  td:     { padding:'7px 12px', verticalAlign:'middle', whiteSpace:'nowrap' },
  tdWrap: { padding:'7px 12px', verticalAlign:'middle', whiteSpace:'normal', maxWidth:'200px' },
  input:  { padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'13px', fontFamily:'inherit' },
  label:  { display:'block', fontSize:'12px', fontWeight:600, color:'#475569', marginBottom:'4px' },
  card:   { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'visible' },
  btnPri: { background:'#0f172a', color:'#fff', border:'none', padding:'9px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor:'pointer' },
  btnExp: { background:'#166534', color:'#fff', border:'none', padding:'9px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  btnSec: { background:'#fff', color:'#475569', border:'1px solid #cbd5e1', padding:'9px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  iconBtn:{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', color:'#94a3b8', padding:'2px 6px' },
};

// ── CSV EXPORT HELPER ─────────────────────────────────────────────
function exportCSV(rows, filename, colDefs) {
  if (!rows || rows.length === 0) return alert('No data to export');
  const headers = colDefs.map(c => c.label);
  const lines   = [headers.join(',')];
  rows.forEach(r => {
    const vals = colDefs.map(c => {
      const v = r[c.key] !== undefined && r[c.key] !== null ? r[c.key] : '';
      const s = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(vals.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── MULTI-SECTION CSV EXPORT (one combined file, multiple labeled blocks) ─
function csvRow(vals) {
  return vals.map(v => {
    const s = String(v===undefined||v===null?'':v).replace(/"/g,'""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  }).join(',');
}
function exportMultiSectionCSV(sections, filename) {
  const hasData = sections.some(s => s.rows && s.rows.length>0);
  if (!hasData) return alert('No data to export');
  const lines = [];
  sections.forEach(sec => {
    lines.push(csvRow([sec.title]));
    lines.push(csvRow(sec.cols.map(c=>c.label)));
    if (!sec.rows || sec.rows.length===0) {
      lines.push(csvRow(['(no entries)']));
    } else {
      sec.rows.forEach(r => lines.push(csvRow(sec.cols.map(c=>r[c.key]))));
    }
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── HELPERS ──────────────────────────────────────────────────────
const fmt      = (n) => (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
// Recoverable Amount cap (v9): a Visa/Flight/Training cost row can record what was actually
// recovered from the employee separately from what was actually spent (row.cost) — e.g. spent
// AED 7,014.72 but only AED 6,000 was agreed to be recovered, with the remaining AED 1,014.72 a
// straight company write-off. Blank/null recoverable_amount just falls back to the full cost.
const recoverableCap = (row, amountKey) => (row && row.recoverable_amount!==null && row.recoverable_amount!==undefined && row.recoverable_amount!=='') ? Number(row.recoverable_amount)||0 : Number(row&&row[amountKey])||0;
// Single source of truth for the "WPS paid vs employee's actual Client Billing share" split on
// an invoice. Every tab that touches this number (Client Billing sync/summary/rows, Salary
// Pipeline, P&L Dashboard, Employee Detail) calls this — nobody re-derives the formula locally
// anymore — so a future formula change or bugfix happens in exactly one place instead of six.
// Returns null if the invoice doesn't have enough data (received/hours/wps) to compute.
const wpsInvoiceSplit = (inv, lines) => {
  const lns = lines || [];
  const hours = lns.reduce((s,l)=>s+(Number(l.hours)||0),0);
  const totalCcy = lns.reduce((s,l)=>s+(Number(l.hours)||0)*(Number(l.rate_eur_hr)||inv.brunel_rate_eur_hr||0),0);
  const received = Number(inv.received_amount_aed)||0;
  const wps = Number(inv.wps_paid_aed)||0;
  const impliedRate = received && totalCcy ? received/totalCcy : null;
  const satcoAed = impliedRate!==null ? hours*(Number(inv.satco_rate_eur_hr)||4.5)*impliedRate : null;
  const empShare = satcoAed!==null ? received-satcoAed : null;
  // overpaid needs both empShare and an actual WPS payment entered; null means "not enough data yet"
  // (distinct from 0, which means "exactly matched"). positive = employee owes company, negative = company owes employee.
  const overpaid = (empShare!==null && wps) ? wps-empShare : null;
  return { hours, totalCcy, received, wps, impliedRate, satcoAed, empShare, overpaid };
};
const monthStr = (d) => d ? d.slice(0,7) : '';
const firstOfMonth = (m) => m ? m + '-01' : null;

function groupByMonth(rows, dateKey) {
  const map = new Map();
  rows.forEach(r => {
    const m = String(r[dateKey]||'').slice(0,7) || '—';
    if (!map.has(m)) map.set(m, []);
    map.get(m).push(r);
  });
  const out = [];
  for (const [month, mrs] of map) {
    out.push({ month, rows: [...mrs].sort((a,b)=>(a.employee_id||'')<(b.employee_id||'')?-1:1) });
  }
  out.sort((a,b)=>a.month<b.month?1:a.month>b.month?-1:0);
  return out;
}

function applyFilters(rows, filters) {
  return rows.filter(row =>
    Object.entries(filters).every(([key, val]) => {
      if (!val) return true;
      return String(row[key]||'').toLowerCase().includes(val.toLowerCase());
    })
  );
}

// ── FILTER BAR ───────────────────────────────────────────────────
function FilterBar({ fields, values, onChange, onClear }) {
  const hasAny = fields.some(f => values[f.key]);
  const filterRef = useStkPublish('--stk-3', '--stk-2');
  return (
    <div ref={filterRef} className="tbl-sticky-filterbar" style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0', padding:'5px 12px', display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'flex-end', position:'sticky', top:'var(--stk-2)', zIndex:'14' }}>
      {fields.map(f => (
        <div key={f.key}>
          <div style={{ fontSize:'9px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'1px' }}>{f.label}</div>
          {f.options ? (
            <select value={values[f.key]||''} onChange={e=>onChange({...values,[f.key]:e.target.value})}
              style={{...S.input, padding:'3px 7px', fontSize:'11px', height:'23px', width:f.width||'140px'}}>
              <option value="">All</option>
              {f.options.map(o=>{
                const v = typeof o==='string'?o:o.value;
                const l = typeof o==='string'?o:o.label;
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
          ) : (
            <input value={values[f.key]||''} onChange={e=>onChange({...values,[f.key]:e.target.value})}
              placeholder="All"
              style={{...S.input, padding:'3px 7px', fontSize:'11px', height:'23px', width:f.width||'120px'}} />
          )}
        </div>
      ))}
      {hasAny && (
        <button onClick={onClear} style={{...S.btnPri, background:'#dc2626', padding:'3px 9px', fontSize:'10.5px', height:'23px', alignSelf:'flex-end'}}>
          ✕ Clear
        </button>
      )}
    </div>
  );
}

function MonthGroup({ month, count, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding:'5px 14px', background:'#1e293b', color:'#94a3b8', fontSize:'11px', fontWeight:800, letterSpacing:'.07em', whiteSpace:'nowrap', borderTop:'3px solid #334155' }}>
        {month}&nbsp;&nbsp;·&nbsp;&nbsp;{count} {count===1?'entry':'entries'}
      </td>
    </tr>
  );
}

function AmountTag({ value }) {
  return <span style={{ fontWeight:800, color: value>=0?'#166534':'#dc2626' }}>{value<0?'-':''}AED {fmt(Math.abs(value))}</span>;
}


function canonEmpId(id) {
  return String(id || '').trim().toUpperCase();
}
function hasMoneyActivity(r) {
  return ['lifetime_income','lifetime_expense','lifetime_net','lifetime_onboarding_cost','advance_outstanding'].some(k => Math.abs(Number((r||{})[k]) || 0) > 0.004);
}
function preferDisplayName(id, candidates=[]) {
  const clean = (v) => String(v || '').replace(/\s+/g,' ').trim();
  const opts = candidates.map(clean).filter(Boolean).filter(v => v !== id);
  if (!opts.length) return id;
  // Prefer a normal readable HR-style name over all-caps import names.
  const normal = opts.find(v => /[a-z]/.test(v) && /[A-Z]/.test(v));
  if (normal) return normal;
  return opts.sort((a,b)=>b.length-a.length)[0];
}
function dedupePnlSummaryRows(rows=[], monthlyRows=[], ctx={}) {
  const monthlyById = {};
  (monthlyRows || []).forEach(r => {
    const id = canonEmpId(r.employee_id);
    if (!id) return;
    if (!monthlyById[id]) monthlyById[id] = { income:0, expense:0, net:0, onboarding:0, idle:0 };
    monthlyById[id].income     += Number(r.total_income) || 0;
    monthlyById[id].expense    += Number(r.total_expense) || 0;
    monthlyById[id].net        += Number(r.net_profit_loss) || 0;
    monthlyById[id].onboarding += Number(r.onboarding_cost) || 0;
    if ((Number(r.total_income)||0) === 0 && (Number(r.total_expense)||0) > 0) monthlyById[id].idle += 1;
  });

  const byId = {};
  (rows || []).forEach(r => {
    const id = canonEmpId(r.employee_id);
    if (!id) return;
    if (!byId[id]) byId[id] = { rows:[], flags:{} };
    byId[id].rows.push(r);
    ['is_temp','is_finance_only','is_roster_only','is_hr_only'].forEach(k => { if (r[k]) byId[id].flags[k] = true; });
  });

  const empNameById = {};
  (ctx.employees || []).forEach(e => { const id = canonEmpId(e.employee_id); if (id && e.full_name) empNameById[id] = e.full_name; });
  const hrNameById = {};
  (ctx.hrSalaryRows || []).forEach(e => { const id = canonEmpId(e.employee_id); if (id && e.full_name) hrNameById[id] = e.full_name; });

  return Object.entries(byId).map(([id, bucket]) => {
    const list = bucket.rows;
    const agg = monthlyById[id];
    const best = [...list].sort((a,b)=>{
      const score = x => Math.abs(Number(x.lifetime_income)||0) + Math.abs(Number(x.lifetime_expense)||0) + Math.abs(Number(x.lifetime_net)||0);
      return score(b)-score(a);
    })[0] || { employee_id:id };
    const meta = (ctx.empMeta && (ctx.empMeta[id] || ctx.empMeta[best.employee_id])) || {};
    const temp = (ctx.tempCandMeta && (ctx.tempCandMeta[id] || ctx.tempCandMeta[best.employee_id])) || {};
    const names = [meta.full_name, empNameById[id], hrNameById[id], temp.full_name, ...list.map(r=>r.full_name)];
    const out = { ...best, ...bucket.flags, employee_id:id, full_name:preferDisplayName(id, names) };

    if (agg) {
      out.lifetime_income = Math.round(agg.income*100)/100;
      out.lifetime_expense = Math.round(agg.expense*100)/100;
      out.lifetime_net = Math.round(agg.net*100)/100;
      out.lifetime_onboarding_cost = Math.max(Number(best.lifetime_onboarding_cost)||0, Math.round(agg.onboarding*100)/100);
      out.idle_months = Math.max(Number(best.idle_months)||0, agg.idle||0);
    } else if (list.length > 1) {
      // No monthly rows to recalc from. Do NOT add duplicate rows; keep the most complete record.
      ['lifetime_income','lifetime_expense','lifetime_net','lifetime_onboarding_cost','advance_outstanding','idle_months'].forEach(k => {
        out[k] = list.reduce((mx,r)=> Math.abs(Number(r[k])||0) > Math.abs(Number(mx)||0) ? Number(r[k])||0 : mx, Number(out[k])||0);
      });
    }
    return out;
  }).sort((a,b)=>canonEmpId(a.employee_id).localeCompare(canonEmpId(b.employee_id), undefined, {numeric:true}));
}

function EmployeePicker({ employees, value, name, onChange }) {
  return (
    <div style={{ display:'flex', gap:'8px' }}>
      <input list="emp-list" placeholder="Employee ID" value={value||''}
        onChange={e=>{ const id=e.target.value; const m=employees.find(x=>x.employee_id===id); onChange(id,m?m.full_name:name||''); }}
        style={{...S.input,width:'150px',fontFamily:'ui-monospace,monospace',fontWeight:700}} />
      <datalist id="emp-list">{employees.map(e=><option key={e.employee_id} value={e.employee_id}>{e.full_name}</option>)}</datalist>
      <input placeholder="Full name" value={name||''} onChange={e=>onChange(value,e.target.value)} style={{...S.input,flex:1}} />
    </div>
  );
}

function MigrationBanner({ onDismiss }) {
  const sql = `-- Run once in Supabase SQL Editor (Finance project)
ALTER TABLE employee_monthly_costs
  ADD COLUMN IF NOT EXISTS salary_type text DEFAULT 'monthly_basic',
  ADD COLUMN IF NOT EXISTS hours_worked numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_deductions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS basic_salary numeric,
  ADD COLUMN IF NOT EXISTS fixed_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_per_day numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS contract_days_per_week numeric DEFAULT 6,
  ADD COLUMN IF NOT EXISTS working_days numeric,
  ADD COLUMN IF NOT EXISTS month_days numeric,
  ADD COLUMN IF NOT EXISTS normal_ot_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_ot_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computed_salary numeric,
  ADD COLUMN IF NOT EXISTS manual_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_allowance_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_allowance_pay numeric DEFAULT 0;

ALTER TABLE employee_other_costs
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS original_amount   numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate     numeric;

ALTER TABLE employee_timesheets
  ADD COLUMN IF NOT EXISTS income_type text DEFAULT 'hourly';

ALTER TABLE employee_visa_costs
  ADD COLUMN IF NOT EXISTS recoverable boolean DEFAULT false;

ALTER TABLE employee_flights
  ADD COLUMN IF NOT EXISTS recoverable boolean DEFAULT false;

ALTER TABLE employee_training_costs
  ADD COLUMN IF NOT EXISTS recoverable boolean DEFAULT false;

-- Fix: "Onboarding & Misc Costs" save was failing with
--   new row for relation "employee_other_costs" violates check constraint "employee_other_costs_cost_type_check"
-- because the DB constraint's allowed list was created before "wps_overpayment_recovery" and "other"
-- were added to the app.
-- NOTE: this used to recreate the constraint here with only 10 allowed values, then recreate it
-- AGAIN further below (v7) with the full 12-value list. Running both in sequence on a database
-- that already has rows using the newer values (wps_underpayment_payable, camp_food_accommodation)
-- made THIS narrower step fail with "violated by some row" even though the final constraint further
-- down is correct. Removed the redundant narrow recreation — the v7 block below is the only one
-- that runs now, and it already includes every value the app can send.

-- New: recurring site allowances (mobile, food, transport, etc.) that auto-apply every month
-- an employee is on a given site, until their HR demobilization date stops them.
CREATE TABLE IF NOT EXISTS employee_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text,
  allowance_type text NOT NULL DEFAULT 'mobile' CHECK (allowance_type IN ('mobile','food','transport','site','other')),
  amount numeric NOT NULL DEFAULT 0,
  location text,
  start_date date NOT NULL,
  end_date date,
  auto_stop_on_demob boolean DEFAULT true,
  active boolean DEFAULT true,
  remarks text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employee_allowances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_allowances;
CREATE POLICY "Allow authenticated full access" ON employee_allowances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- v6: Salary Profiles — one row per employee; stores the agreed basic salary + fixed allowance
-- so Finance doesn't need to re-enter it every month. Monthly Costs auto-fills from this.
CREATE TABLE IF NOT EXISTS employee_salary_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  full_name text,
  basic_salary numeric NOT NULL DEFAULT 0,
  fixed_allowance numeric NOT NULL DEFAULT 0,
  effective_date date,
  remarks text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employee_salary_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_salary_profiles;
CREATE POLICY "Allow authenticated full access" ON employee_salary_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- v6: Deduction Ledger — HR logs per-employee deductions (visa recovery, deposit, advance etc.)
-- that should be deducted from future salaries. Finance sees this as read-only context.
CREATE TABLE IF NOT EXISTS employee_deduction_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text,
  deduction_type text NOT NULL DEFAULT 'visa_recovery'
    CHECK (deduction_type IN ('visa_recovery','security_deposit_recovery','salary_advance_recovery','flight_recovery','training_recovery','other')),
  amount numeric NOT NULL DEFAULT 0,
  approved_by text,
  advance_date date,
  effective_month date,
  deducted_month date,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','waived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- Migration: add advance_date and deducted_month columns if they don't exist
ALTER TABLE employee_deduction_ledger ADD COLUMN IF NOT EXISTS advance_date date;
ALTER TABLE employee_deduction_ledger ADD COLUMN IF NOT EXISTS deducted_month date;
ALTER TABLE employee_monthly_costs ADD COLUMN IF NOT EXISTS arrears numeric DEFAULT 0;
ALTER TABLE employee_monthly_costs ADD COLUMN IF NOT EXISTS arrears_for_month date;
ALTER TABLE employee_monthly_costs ADD COLUMN IF NOT EXISTS arrears_reason text;

-- Idle Days tracking table (employees deployed but idle at site)
CREATE TABLE IF NOT EXISTS employee_idle_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text,
  month date NOT NULL,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 31),
  reason text,
  client_agreed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, month, day_number)
);
ALTER TABLE employee_idle_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_idle_days;
CREATE POLICY "Allow authenticated full access" ON employee_idle_days
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_idle_days TO authenticated;
ALTER TABLE employee_deduction_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_deduction_ledger;
CREATE POLICY "Allow authenticated full access" ON employee_deduction_ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- v7: Track WPS underpayments (company owes the employee for the month, the mirror image of
-- wps_overpayment_recovery) so Client Billing can show a net "who owes whom" figure per employee
-- and the P&L Dashboard can carry it as a payable instead of silently showing "Clear".
ALTER TABLE employee_other_costs DROP CONSTRAINT IF EXISTS employee_other_costs_cost_type_check;
ALTER TABLE employee_other_costs ADD CONSTRAINT employee_other_costs_cost_type_check
  CHECK (cost_type IN (
    'security_deposit','agent_commission','salary_advance','local_transport',
    'medical_test_expense','food_accommodation_presite','site_accommodation',
    'visit_visa_extra','wps_overpayment_recovery','wps_underpayment_payable',
    'camp_food_accommodation','other'
  ));

-- v8: Camp Costs — food, accommodation & transport paid to the client/camp for every day an
-- employee is demobilized from a site and not yet remobilized elsewhere ("sitting in camp").
-- One global default daily rate, plus optional per-employee overrides.
CREATE TABLE IF NOT EXISTS camp_rate_defaults (
  id integer PRIMARY KEY DEFAULT 1,
  food_rate_per_day numeric NOT NULL DEFAULT 0,
  accommodation_rate_per_day numeric NOT NULL DEFAULT 0,
  transport_rate_per_day numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT camp_rate_defaults_singleton CHECK (id = 1)
);
ALTER TABLE camp_rate_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON camp_rate_defaults;
CREATE POLICY "Allow authenticated full access" ON camp_rate_defaults FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON camp_rate_defaults TO authenticated;

CREATE TABLE IF NOT EXISTS employee_camp_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  full_name text,
  food_rate_per_day numeric,
  accommodation_rate_per_day numeric,
  transport_rate_per_day numeric,
  remarks text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employee_camp_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_camp_rates;
CREATE POLICY "Allow authenticated full access" ON employee_camp_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_camp_rates TO authenticated;

-- v9: Recoverable Amount — lets a single Visa/Flight/Training cost row cap what's actually
-- recoverable from the employee below the real amount spent (e.g. spent AED 7,014.72 on visa +
-- insurance, but only AED 6,000 was agreed to be recovered from salary; the remaining AED 1,014.72
-- is a straight company write-off). Falls back to the full cost when left blank, so nothing
-- changes for existing recoverable rows until someone deliberately sets a lower cap.
ALTER TABLE employee_visa_costs ADD COLUMN IF NOT EXISTS recoverable_amount numeric;
ALTER TABLE employee_flights ADD COLUMN IF NOT EXISTS recoverable_amount numeric;
ALTER TABLE employee_training_costs ADD COLUMN IF NOT EXISTS recoverable_amount numeric;

-- v10: PPE & Uniforms issuance tracking, and Hiring Pipeline History (imported from the master
-- data spreadsheet — coveralls/shoes/goggles issued per employee, and historical recruitment
-- pipeline records). Hiring Pipeline History has no employee_id foreign key: it's a standalone
-- historical reference table (many rows predate the current employee_id scheme), searchable by
-- name/trade, not tied into any P&L or recovery calculation.
CREATE TABLE IF NOT EXISTS employee_ppe_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text,
  issue_date date,
  coverall_size text,
  coverall_qty numeric DEFAULT 0,
  shoes_size text,
  shoes_qty numeric DEFAULT 0,
  goggles_qty numeric DEFAULT 0,
  notes text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employee_ppe_issued ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_ppe_issued;
CREATE POLICY "Allow authenticated full access" ON employee_ppe_issued FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_ppe_issued TO authenticated;

CREATE TABLE IF NOT EXISTS hiring_pipeline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_sheet text,
  sr_no numeric,
  emp_no text,
  candidate_name text,
  passport_no text,
  trade text,
  salary_aed numeric,
  service_provided text,
  document_received_date text,
  visit_visa_apply_date text,
  passport_status text,
  visa_type text,
  visit_visa_status text,
  visit_visa_received_date text,
  visit_visa_send_date text,
  ticket_arrival_date text,
  return_ticket text,
  employment_visa_apply_date text,
  employment_visa_received_date text,
  date_of_joining text,
  visa_medical_date text,
  emirates_id_date text,
  cicpa_apply_date text,
  adnoc_medical_date text,
  daman_insurance_apply_date text,
  visa_stamping_date text,
  bank_account_open_date text,
  ticket_invoice_ref text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE hiring_pipeline_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON hiring_pipeline_history;
CREATE POLICY "Allow authenticated full access" ON hiring_pipeline_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring_pipeline_history TO authenticated;

-- v11: Camps master list + explicit per-employee camp stay records. Camp Costs previously used ONE
-- flat company-wide (or per-employee) AED/day rate for food+accommodation and auto-guessed the days
-- from HR demob/remob history, with no way to say *which* camp someone was at or bill different
-- camps at different rates. This replaces the flat food/accommodation rate with:
--   - camps: named camp locations, each with its own monthly food & accommodation rate. The daily
--     rate is derived by dividing by the real number of days in whichever calendar month(s) a stay
--     touches (same proration convention already used for monthly salary elsewhere in this app),
--     so a stay crossing a month-end is billed fairly instead of assuming a flat 30-day month.
--   - employee_camp_stays: explicit "employee X was at camp Y from date A to date B" records,
--     entered directly instead of only being inferred from demob/remob gaps. Transport still uses
--     the existing flat company/per-employee AED/day rate (camp_rate_defaults / employee_camp_rates)
--     — only food & accommodation move to per-camp monthly rates.
CREATE TABLE IF NOT EXISTS camps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  monthly_food_rate numeric NOT NULL DEFAULT 0,
  monthly_accommodation_rate numeric NOT NULL DEFAULT 0,
  remarks text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON camps;
CREATE POLICY "Allow authenticated full access" ON camps FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON camps TO authenticated;

CREATE TABLE IF NOT EXISTS employee_camp_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text,
  camp_id uuid REFERENCES camps(id) ON DELETE SET NULL,
  camp_name text,
  from_date date NOT NULL,
  to_date date,
  remarks text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employee_camp_stays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON employee_camp_stays;
CREATE POLICY "Allow authenticated full access" ON employee_camp_stays FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_camp_stays TO authenticated;

-- v12: PPE cost tracking — adds a cost column so PPE issuance (coveralls/shoes/goggles)
-- flows into the P&L Dashboard's Total Expense and the employee's detailed expense sheet,
-- the same way Visa/Flights/Training already do.
ALTER TABLE employee_ppe_issued ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0;`;
  return (
    <div style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:'10px',padding:'14px 18px',marginBottom:'16px'}}>
      <div style={{fontWeight:800,fontSize:'13px',color:'#92400e',marginBottom:'6px'}}>Database Migration v12 Required — adds PPE Issuance, Hiring Pipeline History, Camps (master list + per-employee camp stays) &amp; PPE Cost tracking</div>
      <div style={{fontSize:'12px',color:'#78350f',marginBottom:'10px'}}>Open your <strong>Supabase Finance project → SQL Editor</strong> and run the SQL below (once only — safe to re-run):</div>
      <pre style={{background:'#1e293b',color:'#f8fafc',padding:'12px 14px',borderRadius:'8px',fontSize:'11.5px',overflowX:'auto',margin:'0 0 10px',whiteSpace:'pre'}}>{sql}</pre>
      <button onClick={onDismiss} style={{...S.btnPri,background:'#92400e',fontSize:'12px',padding:'7px 14px'}}>I've run the migration — dismiss (v12)</button>
    </div>
  );
}

function HrBridgeCampBanner({ onDismiss }) {
  return (
    <div style={{background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:'10px',padding:'14px 18px',marginBottom:'16px'}}>
      <div style={{fontWeight:800,fontSize:'13px',color:'#1d4ed8',marginBottom:'6px'}}>HR Bridge Update Required — Camp Costs needs full mobilization history</div>
      <div style={{fontSize:'12px',color:'#1e3a8a',marginBottom:'10px'}}>
        The Camp Costs tab calculates how many days each employee has spent off-site (demobilized, not yet remobilized) using mobilization/demobilization records from HR.
        Today the HR bridge view only exposes each employee's <em>latest</em> record, so past camp periods that have already closed won't be reconstructed — only the current one, if any.
        To capture full history, open your <strong>HR Supabase project → SQL Editor</strong> and re-run the HR bridge setup SQL (found under <strong>Salary Master → Show full HR bridge SQL</strong> on this portal, or via the button below) — it's safe to re-run.
        Until then, Camp Costs still works for employees currently off-site, using whatever mobilization record HR already exposes.
      </div>
      <button onClick={onDismiss} style={{...S.btnPri,background:'#1d4ed8',fontSize:'12px',padding:'7px 14px'}}>Got it — dismiss</button>
    </div>
  );
}

// ── GENERIC COST TABLE ────────────────────────────────────────────
function CostTable({ title, table, employees, fields, dateField, initialFilter, hideEmpFilter, hideExportButton, recoverableSupport }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft]     = useState(null);
  const [filters, setFilters] = useState(initialFilter||{});
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await db.from(table).select('*').order(dateField,{ascending:false});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID',  width:'100px'},{key:'full_name',   label:'Name',    width:'150px'}]),
    ...fields.filter(f=>f.type!=='number'&&f.type!=='date')
      .map(f=>({key:f.key, label:f.label, options:f.options, width:f.type==='select'?'160px':'140px'})),
  ];

  const filtered = useMemo(()=>applyFilters(rows,filters),[rows,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,dateField),[filtered,dateField]);
  const colSpan  = fields.length + (hideEmpFilter?1:3) + (recoverableSupport?1:0);

  // CSV columns for this tab
  const csvCols = [
    {key:'employee_id', label:'Emp ID'},
    {key:'full_name',   label:'Name'},
    ...fields.map(f=>({key:f.key, label:f.label})),
    ...(recoverableSupport?[{key:'recoverable',label:'Recoverable'},{key:'recoverable_amount',label:'Recoverable Amount (AED, blank = full cost)'}]:[]),
  ];

  const blank = () => {
    const d = {employee_id:initialFilter&&initialFilter.employee_id||'',full_name:initialFilter&&initialFilter.full_name||''};
    fields.forEach(f=>d[f.key]=f.type==='number'?'':'');
    if (recoverableSupport) { d.recoverable = false; d.recoverable_amount = ''; }
    setDraft(d);
  };
  const save = async () => {
    if (!draft.employee_id) return alert('Employee ID required');
    const clean = {...draft}; delete clean.id;
    fields.forEach(f=>{if(f.type==='number') clean[f.key]=Number(clean[f.key])||0;});
    if (recoverableSupport) {
      clean.recoverable = !!draft.recoverable;
      // Blank/unchecked = recover the full cost (unchanged behavior). A value here caps what's
      // actually recoverable below (or above, e.g. a combined agreed cap) the row's own cost —
      // see the v9 migration note for why this exists.
      clean.recoverable_amount = (clean.recoverable && draft.recoverable_amount!=='' && draft.recoverable_amount!=null) ? Number(draft.recoverable_amount) : null;
    }
    const {error} = draft.id
      ? await db.from(table).update(clean).eq('id',draft.id)
      : await db.from(table).insert(clean);
    if (error) return alert(error.message);
    setDraft(null); load();
  };
  const remove = async (id) => {
    if (!window.confirm('Delete?')) return;
    await db.from(table).delete().eq('id',id); load();
  };
  // Recoverable total uses the per-row recoverable_amount cap when set, otherwise the full cost —
  // this is what lets one row's recovery differ from what was actually spent.
  const recoverableAmt = (r) => (r.recoverable_amount!==null && r.recoverable_amount!==undefined && r.recoverable_amount!=='') ? Number(r.recoverable_amount)||0 : Number(r.cost)||0;
  const total = rows.reduce((s,r)=>s+(Number(r.cost)||0),0);
  const totalRecoverable = recoverableSupport ? rows.filter(r=>r.recoverable).reduce((s,r)=>s+recoverableAmt(r),0) : 0;

  return (
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>{title}</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>{rows.length} entries · Total AED {fmt(total)}{recoverableSupport && totalRecoverable>0 && <span style={{color:'#92400e',fontWeight:700}}> · Recoverable AED {fmt(totalRecoverable)}</span>}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!hideExportButton && <button style={S.btnExp} onClick={()=>exportCSV(filtered, table, csvCols)}>Export CSV</button>}
          <button style={S.btnPri} onClick={blank}>+ Add</button>
        </div>
      </div>

      <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

      {draft && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 2fr',gap:'10px',marginBottom:'8px'}}>
            <div>
              <label style={S.label}>Employee</label>
              <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
            </div>
            {fields.map(f=>(
              <div key={f.key}>
                <label style={S.label}>{f.label}</label>
                {f.type==='select'
                  ? <select value={draft[f.key]||''} onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))} style={{...S.input,width:'100%'}}>
                      <option value="">--</option>
                      {f.options.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  : <input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={draft[f.key]||''}
                      onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))} style={{...S.input,width:'100%'}} />}
              </div>
            ))}
          </div>
          {recoverableSupport && (
            <div style={{marginBottom:'10px',background:'#fff',border:'1px solid #fbbf24',borderRadius:'8px',padding:'10px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <input type="checkbox" id="rcv-cost" checked={!!draft.recoverable} onChange={e=>setDraft(d=>({...d,recoverable:e.target.checked}))} style={{width:'16px',height:'16px'}} />
                <label htmlFor="rcv-cost" style={{fontSize:'12.5px',fontWeight:700,color:'#92400e'}}>Recoverable from employee's salary (will count toward their Balance to Recover; actual recovery is tracked via Monthly Costs → Deductions)</label>
              </div>
              {draft.recoverable && (
                <div style={{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid #fde68a'}}>
                  <label style={S.label}>Recoverable Amount (AED) — leave blank to recover the full cost above</label>
                  <input type="number" step="0.01" placeholder={draft.cost?`Full cost: AED ${draft.cost}`:''} value={draft.recoverable_amount||''} onChange={e=>setDraft(d=>({...d,recoverable_amount:e.target.value}))} style={{...S.input,width:'220px'}} />
                  {draft.recoverable_amount!=='' && draft.recoverable_amount!=null && Number(draft.cost)>Number(draft.recoverable_amount) && (
                    <div style={{fontSize:'11.5px',color:'#dc2626',marginTop:'4px'}}>AED {fmt((Number(draft.cost)||0)-(Number(draft.recoverable_amount)||0))} of the actual cost will NOT be recovered — a straight company write-off, still counted in Total Cost above.</div>
                  )}
                  <div style={{fontSize:'11px',color:'#94a3b8',marginTop:'4px'}}>Can also be set higher than this row's own cost, e.g. to represent one combined recovery cap agreed across several cost entries for the same employee.</div>
                </div>
              )}
            </div>
          )}
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>
            {!hideEmpFilter && <th style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>Emp ID</th>}
            {!hideEmpFilter && <th style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>Name</th>}
            {fields.map(f=><th key={f.key} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{f.label}</th>)}
            {recoverableSupport && <th style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>Recoverable</th>}
            <th style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}></th>
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={colSpan} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : grouped.length===0
                ? <tr><td colSpan={colSpan} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No entries yet':'No entries match the filters'}</td></tr>
                : grouped.map(g=>{
                    const numFields = fields.filter(f=>f.type==='number');
                    const monthTotal = g.rows.reduce((s,r)=>s+(Number(r.cost)||0),0);
                    return (
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={colSpan} />}
                      {g.rows.map(r=>(
                        <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',cursor:'pointer'}} onClick={()=>setDraft({...r})}>
                          {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>}
                          {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>}
                          {fields.map(f=>(
                            <td key={f.key} style={f.key==='remarks'?S.tdWrap:S.td}>
                              {f.type==='number' ? 'AED '+fmt(r[f.key]) : (r[f.key]||'—')}
                            </td>
                          ))}
                          {recoverableSupport && <td style={S.td}>{r.recoverable?<span title={r.recoverable_amount!=null&&r.recoverable_amount!==''&&Number(r.recoverable_amount)!==Number(r.cost)?`Capped — AED ${fmt(recoverableAmt(r))} of AED ${fmt(r.cost)} actual cost`:''} style={{background:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'10px',whiteSpace:'nowrap'}}>Yes{r.recoverable_amount!=null&&r.recoverable_amount!==''&&Number(r.recoverable_amount)!==Number(r.cost)?` · AED ${fmt(recoverableAmt(r))}`:''}</span>:'—'}</td>}
                          <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button style={S.iconBtn} onClick={e=>{e.stopPropagation();setDraft({...r});}}>&#9998;</button>
                            <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                        {!hideEmpFilter && <td style={S.td}></td>}
                        {!hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>}
                        {hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}} colSpan={Math.max(1,fields.length-numFields.length)}>Month Total</td>}
                        {fields.map((f,i)=>{
                          if (f.type!=='number') return hideEmpFilter? null : <td key={f.key} style={S.td}></td>;
                          return <td key={f.key} style={{...S.td,fontWeight:800,color:'#0f172a'}}>AED {fmt(monthTotal)}</td>;
                        })}
                        {recoverableSupport && <td style={S.td}></td>}
                        <td style={S.td}></td>
                      </tr>
                    </React.Fragment>
                  );})
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MONTHLY COSTS ─────────────────────────────────────────────────

// Calendar days in a "YYYY-MM" month string (used to pro-rate basic salary & allowance)
function daysInMonth(m) {
  if (!m) return 30;
  const parts = m.split('-').map(Number);
  const y = parts[0], mo = parts[1];
  if (!y || !mo) return 30;
  return new Date(y, mo, 0).getDate();
}

// ── RECURRING SITE ALLOWANCES ─────────────────────────────────────
// An allowance (e.g. mobile, food) runs from start_date until end_date OR the employee's
// HR demobilization_date (whichever is earlier, when auto_stop_on_demob is set), OR keeps
// going indefinitely if neither is set. This works out, for a given "YYYY-MM" salary month,
// which allowances were active that month and how many of that month's days they cover —
// so a mid-month mobilization/demobilization is pro-rated the same way Basic Pay is.
function monthBounds(monthStr) {
  if (!monthStr) return null;
  const [y,mo] = monthStr.split('-').map(Number);
  if (!y||!mo) return null;
  return { first: new Date(Date.UTC(y,mo-1,1)), last: new Date(Date.UTC(y,mo,0)) };
}
function allowanceActiveDaysInMonth(allowance, monthStr, demobDate) {
  const b = monthBounds(monthStr);
  if (!b || !allowance.start_date) return 0;
  const start = new Date(allowance.start_date+'T00:00:00Z');
  let end = allowance.end_date ? new Date(allowance.end_date+'T00:00:00Z') : null;
  if (allowance.auto_stop_on_demob && demobDate) {
    const demob = new Date(demobDate+'T00:00:00Z');
    if (!end || demob < end) end = demob;
  }
  const rangeStart = start > b.first ? start : b.first;
  const rangeEnd = end && end < b.last ? end : b.last;
  if (rangeEnd < rangeStart) return 0;
  return Math.round((rangeEnd - rangeStart) / 86400000) + 1;
}
// Returns { total, lines:[{...allowance, daysActive, amountThisMonth}], stoppedAlerts:[...] }
function computeRecurringAllowances(allowances, monthStr, demobDate) {
  const mDays = daysInMonth(monthStr);
  const lines = (allowances||[]).filter(a=>a.active!==false).map(a=>{
    const daysActive = allowanceActiveDaysInMonth(a, monthStr, demobDate);
    const amountThisMonth = mDays ? Math.round((Number(a.amount)||0)/mDays*daysActive*100)/100 : 0;
    return { ...a, daysActive, amountThisMonth };
  }).filter(a=>a.daysActive>0);
  const total = Math.round(lines.reduce((s,a)=>s+a.amountThisMonth,0)*100)/100;
  // Flag allowances that are still "active" in the DB but whose employee has demobilized
  // before the end of this month and auto_stop_on_demob is on — these need closing out.
  const stoppedAlerts = (allowances||[]).filter(a=>a.active!==false && a.auto_stop_on_demob && demobDate).filter(a=>{
    const b = monthBounds(monthStr);
    if (!b) return false;
    return new Date(demobDate+'T00:00:00Z') <= b.last && new Date(demobDate+'T00:00:00Z') >= b.first;
  });
  return { total, lines, stoppedAlerts };
}

// Reproduces SATCO's accounts-department salary-sheet formula:
//   Basic Pay     = Basic Salary ÷ Month Days × Working Days
//   Normal OT     = (Basic Salary ÷ Month Days ÷ Hours/Day) × Normal OT Hours × 1.25
//   Holiday OT    = (Basic Salary ÷ Month Days ÷ Hours/Day) × Holiday OT Hours × 1.5
//   Allowance Pay = Fixed Allowance ÷ Month Days × Working Days
//   Gross         = sum of the above (Food/Accommodation/Transport/Other are tracked separately)
function calcProrated(d) {
  const basic   = Number(d.basic_salary) || 0;
  const allow   = Number(d.fixed_allowance) || 0;
  const hpd     = Number(d.hours_per_day) || 8;
  const mDays   = daysInMonth(d.month);
  const wDays   = Number(d.working_days) || 0;
  const nOT     = Number(d.normal_ot_hours) || 0;
  const hOT     = Number(d.holiday_ot_hours) || 0;
  const basicPay      = mDays ? (basic / mDays * wDays) : 0;
  const hourlyBase     = (mDays && hpd) ? (basic / mDays / hpd) : 0;
  const normalOTPay   = hourlyBase * nOT * 1.25;
  const holidayOTPay  = hourlyBase * hOT * 1.5;
  const allowPay       = mDays ? (allow / mDays * wDays) : 0;
  const gross = basicPay + normalOTPay + holidayOTPay + allowPay;
  return { monthDays: mDays, basicPay, normalOTPay, holidayOTPay, allowPay, gross };
}

function SalaryTypeBadge({ type }) {
  const map = {
    prorated:      { bg:'#fdf4ff', color:'#86198f', label:'Calculated' },
    monthly_basic: { bg:'#f0fdf4', color:'#166534', label:'Fixed Monthly' },
    hourly:        { bg:'#e0f2fe', color:'#0369a1', label:'Hourly' },
  };
  const s = map[type] || map.monthly_basic;
  return <span style={{background:s.bg,color:s.color,fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>{s.label}</span>;
}

const ALLOWANCE_TYPES = [
  {value:'mobile',     label:'📱 Mobile Allowance'},
  {value:'food',       label:'🍽️ Food Allowance'},
  {value:'transport',  label:'🚗 Transport Allowance'},
  {value:'site',       label:'🏗️ Site / Hardship Allowance'},
  {value:'other',      label:'➕ Other Allowance'},
];
const ALLOWANCE_LABEL = Object.fromEntries(ALLOWANCE_TYPES.map(o=>[o.value,o.label]));

// Manages recurring per-employee allowances (e.g. AED 100/month mobile allowance for a specific
// site) that auto-apply every "Monthly Costs" salary calculation from start_date onward, and
// auto-stop (or flag for review) once the employee's HR demobilization_date passes — so it's no
// longer possible to "forget" to add or remove a site allowance in next month's WPS run.
