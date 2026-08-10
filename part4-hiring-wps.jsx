function HiringPipelineTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [draft, setDraft] = useState(null);

  const load = async () => {
    setLoading(true);
    const {data,error} = await db.from('hiring_pipeline_history').select('*').order('candidate_name',{ascending:true});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const sources = useMemo(()=>[...new Set(rows.map(r=>r.source_sheet).filter(Boolean))],[rows]);
  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase();
    return rows.filter(r=>{
      if (sourceFilter && r.source_sheet!==sourceFilter) return false;
      if (!q) return true;
      return (r.candidate_name||'').toLowerCase().includes(q) || (r.trade||'').toLowerCase().includes(q) || (r.emp_no||'').toLowerCase().includes(q) || (r.passport_no||'').toLowerCase().includes(q);
    });
  },[rows, search, sourceFilter]);

  const csvCols = [
    {key:'source_sheet',label:'Source'},{key:'sr_no',label:'Sr No'},{key:'emp_no',label:'Emp No'},
    {key:'candidate_name',label:'Name'},{key:'passport_no',label:'Passport No'},{key:'trade',label:'Trade'},
    {key:'salary_aed',label:'Salary AED'},{key:'service_provided',label:'Service Provided'},
    ...HIRING_DATE_FIELDS.map(([k,l])=>({key:k,label:l})),
    {key:'return_ticket',label:'Return Ticket'},{key:'passport_status',label:'Passport Status'},
    {key:'visa_type',label:'Visa Type'},{key:'visit_visa_status',label:'Visit Visa Status'},
    {key:'ticket_invoice_ref',label:'Ticket Invoice Ref'},
  ];

  const blank = () => setDraft({source_sheet:'Tracking List',candidate_name:'',trade:'',salary_aed:''});
  const save = async () => {
    if (!draft.candidate_name) return alert('Candidate name is required');
    const clean = {...draft};
    delete clean.id;
    if (clean.salary_aed==='') clean.salary_aed = null; else clean.salary_aed = Number(clean.salary_aed)||null;
    if (clean.sr_no==='') clean.sr_no = null; else clean.sr_no = Number(clean.sr_no)||null;
    const {error} = draft.id
      ? await db.from('hiring_pipeline_history').update(clean).eq('id',draft.id)
      : await db.from('hiring_pipeline_history').insert(clean);
    if (error) return alert(error.message);
    setDraft(null); load();
  };
  const remove = async (id)=>{ if(!window.confirm('Delete this record?'))return; await db.from('hiring_pipeline_history').delete().eq('id',id); load(); };

  return (
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>Hiring Pipeline History</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>{filtered.length} of {rows.length} historical recruitment record(s) — reference only, not linked to P&amp;L</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button style={S.btnExp} onClick={()=>exportCSV(filtered,'hiring_pipeline_history',csvCols)}>Export CSV</button>
          <button style={S.btnPri} onClick={blank}>+ Add</button>
        </div>
      </div>

      <div style={{display:'flex',gap:'10px',padding:'10px 14px',borderBottom:'1px solid #e2e8f0',flexWrap:'wrap'}}>
        <input placeholder="Search name, trade, emp no, passport no…" value={search} onChange={e=>setSearch(e.target.value)} style={{...S.input,width:'280px'}} />
        <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} style={{...S.input,width:'200px'}}>
          <option value="">All sources</option>
          {sources.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {draft && (
        <div style={{padding:'12px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'8px'}}>
            <div><label style={S.label}>Source Sheet</label>
              <select value={draft.source_sheet||''} onChange={e=>setDraft(d=>({...d,source_sheet:e.target.value}))} style={{...S.input,width:'100%'}}>
                <option value="Tracking List">Tracking List</option>
                <option value="Mission Visa RG">Mission Visa RG</option>
                <option value="Mission Visa AURA">Mission Visa AURA</option>
              </select>
            </div>
            <div><label style={S.label}>Candidate Name</label><input value={draft.candidate_name||''} onChange={e=>setDraft(d=>({...d,candidate_name:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Emp No</label><input value={draft.emp_no||''} onChange={e=>setDraft(d=>({...d,emp_no:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Passport No</label><input value={draft.passport_no||''} onChange={e=>setDraft(d=>({...d,passport_no:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Trade</label><input value={draft.trade||''} onChange={e=>setDraft(d=>({...d,trade:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Salary AED</label><input type="number" value={draft.salary_aed||''} onChange={e=>setDraft(d=>({...d,salary_aed:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Service Provided</label><input value={draft.service_provided||''} onChange={e=>setDraft(d=>({...d,service_provided:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Visa Type</label><input value={draft.visa_type||''} onChange={e=>setDraft(d=>({...d,visa_type:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
          </div>
          <div style={{fontSize:'11px',fontWeight:700,color:'#92400e',textTransform:'uppercase',margin:'10px 0 6px'}}>Milestone Dates (free text — source data has mixed formats)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'8px'}}>
            {HIRING_DATE_FIELDS.map(([k,l])=>(
              <div key={k}><label style={S.label}>{l}</label><input value={draft[k]||''} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            ))}
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>{['Source','Emp No','Name','Trade','Salary AED','Date of Joining','Visa Type','Ticket & Arrival',''].map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={9} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : filtered.length===0
                ? <tr><td colSpan={9} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No records yet':'No records match your search'}</td></tr>
                : filtered.map(r=>(
                    <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',cursor:'pointer'}} onClick={()=>setDraft({...r})}>
                      <td style={{...S.td,fontSize:'11px',color:'#64748b'}}>{r.source_sheet||'—'}</td>
                      <td style={{...S.td,fontFamily:'ui-monospace,monospace'}}>{r.emp_no||'—'}</td>
                      <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.candidate_name}</td>
                      <td style={S.td}>{r.trade||'—'}</td>
                      <td style={S.td}>{r.salary_aed!=null?fmt(r.salary_aed):'—'}</td>
                      <td style={S.td}>{r.date_of_joining||'—'}</td>
                      <td style={S.td}>{r.visa_type||'—'}</td>
                      <td style={S.td}>{r.ticket_arrival_date||'—'}</td>
                      <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                        <button style={S.iconBtn} onClick={e=>{e.stopPropagation();setDraft({...r});}}>&#9998;</button>
                        <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── WPS REPORT TAB ───────────────────────────────────────────────
// Generates the monthly WPS file for SATCO Arabia (MOL-format XLS / CSV)
// matching the bank-submission template used in Mar-2026 / May-2026.
//
// WPS format (per CBUAE / MoHRE):
//   EDR row (one per employee):
//     Col 0: "EDR"
//     Col 1: Labour Card No (14-digit)
//     Col 2: Bank Routing Code (9-digit)
//     Col 3: IBAN
//     Col 4: Salary From (YYYY-MM-DD)
//     Col 5: Salary To   (YYYY-MM-DD)
//     Col 6: No. of Days
//     Col 7: Basic Salary (AED whole number)
//     Col 8: OT + Allowance (AED whole number)
//     Col 9: No. of Leave Days (0)
//     Col 10: Name
//   SCR row (summary, one per file):
//     Col 0: "SCR"
//     Col 1: Company MOL ID (MOHRE establishment no)
//     Col 2: Bank Routing Code
//     Col 3: File Creation Date (DD-MM-YYYY)
//     Col 4: Time (HH.MM)
//     Col 5: Salary Month (MMYYYY)
//     Col 6: Total Employee Count
//     Col 7: Total Amount (Basic + Allowances, AED)
//     Col 8: Currency "AED"
//     Col 9: Company Name
//
// Company constants from the actual files:
const WPS_CO = {
  mol_id:    '2740739',
  name:      'SATCO ARABIA GENERAL CONTRACTING - L.L.C - S.P.C',
  bank_rout: '801120101',
  acct_no:   '90020200014786',
  bank_name: 'Bank of Baroda',
  bank_addr: 'Abu Dhabi Branch',
  signatory: 'Shaik Zaheerudeen',
  signatory_title: 'Managing Director',
};

const BANK_ROUTING_OPTS = [
  { value:'801120101', label:'801120101 — Company default / Bank of Baroda' },
  { value:'600310101', label:'600310101 — Saved code (verify bank name)' },
  { value:'803510106', label:'803510106 — Saved code (verify bank name)' },
  { value:'802610101', label:'802610101 — Saved code (verify bank name)' },
  { value:'801010101', label:'801010101 — Saved code (verify bank name)' },
  { value:'801110101', label:'801110101 — Saved code (verify bank name)' },
];

const WPS_SQL = `-- Run ONCE in Finance Supabase → SQL Editor
-- Creates/updates WPS Employee Master + Monthly Salary Sheet tables.
-- Safe to re-run. It does NOT delete salary or employee data.
-- v8 adds prorated allowance/food allowance and master Contract Hours/Day + Contract Days/Week.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.wps_employee_master (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      text NOT NULL UNIQUE,
  full_name        text,
  labour_card_no   text,
  bank_routing     text,
  iban             text,
  basic_salary     numeric DEFAULT 0,
  fixed_allowance  numeric DEFAULT 0,
  salary_type      text DEFAULT 'fixed',
  hourly_rate      numeric DEFAULT 0,
  hours_per_day    numeric DEFAULT 8,
  contract_days_per_week numeric DEFAULT 6,
  remarks          text,
  active           boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS labour_card_no text;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS bank_routing text;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS basic_salary numeric DEFAULT 0;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS fixed_allowance numeric DEFAULT 0;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS salary_type text DEFAULT 'fixed';
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS hours_per_day numeric DEFAULT 8;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS contract_days_per_week numeric DEFAULT 6;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.wps_employee_master ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.wps_employee_master ALTER COLUMN bank_routing DROP DEFAULT;
ALTER TABLE public.wps_employee_master ALTER COLUMN hourly_rate SET DEFAULT 0;
ALTER TABLE public.wps_employee_master ALTER COLUMN hours_per_day SET DEFAULT 8;
ALTER TABLE public.wps_employee_master ALTER COLUMN contract_days_per_week SET DEFAULT 6;

ALTER TABLE public.wps_employee_master DROP CONSTRAINT IF EXISTS wps_employee_master_salary_type_check;
ALTER TABLE public.wps_employee_master
  ADD CONSTRAINT wps_employee_master_salary_type_check
  CHECK (salary_type IN ('fixed','variable','hourly'));

CREATE TABLE IF NOT EXISTS public.wps_salary_monthly (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              text NOT NULL,
  full_name                text,
  labour_card_no           text,
  bank_routing             text,
  iban                     text,
  salary_month             date NOT NULL,
  salary_type              text DEFAULT 'fixed',
  basic_salary             numeric DEFAULT 0,
  fixed_allowance          numeric DEFAULT 0,
  hourly_rate              numeric DEFAULT 0,
  hours_per_day            numeric DEFAULT 8,
  contract_days_per_week   numeric DEFAULT 6,
  working_days             numeric DEFAULT 0,
  hours_worked             numeric DEFAULT 0,
  normal_ot_hours          numeric DEFAULT 0,
  holiday_ot_hours         numeric DEFAULT 0,
  extra_allowance          numeric DEFAULT 0,
  overtime_amount          numeric DEFAULT 0,
  food_allowance           numeric DEFAULT 0,
  food_allowance_pay       numeric DEFAULT 0,
  hourly_pay               numeric DEFAULT 0,
  basic_pay                numeric DEFAULT 0,
  normal_ot_pay            numeric DEFAULT 0,
  holiday_ot_pay           numeric DEFAULT 0,
  allowance_pay            numeric DEFAULT 0,
  gross_salary             numeric DEFAULT 0,
  finance_recoverable      numeric DEFAULT 0,
  finance_recovered_before numeric DEFAULT 0,
  finance_deposits         numeric DEFAULT 0,
  finance_balance_before   numeric DEFAULT 0,
  deduction_auto           numeric DEFAULT 0,
  deduction_manual         numeric DEFAULT 0,
  deduction_total          numeric DEFAULT 0,
  net_salary               numeric DEFAULT 0,
  wps_basic                numeric DEFAULT 0,
  wps_ot_allowance         numeric DEFAULT 0,
  remarks                  text,
  saved_to_monthly_costs   boolean DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE(employee_id, salary_month)
);

ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS labour_card_no text;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS bank_routing text;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS salary_type text DEFAULT 'fixed';
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS basic_salary numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS fixed_allowance numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS hours_per_day numeric DEFAULT 8;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS contract_days_per_week numeric DEFAULT 6;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS working_days numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS hours_worked numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS normal_ot_hours numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS holiday_ot_hours numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS extra_allowance numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS overtime_amount numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS food_allowance numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS food_allowance_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS hourly_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS basic_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS normal_ot_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS holiday_ot_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS allowance_pay numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS gross_salary numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS finance_recoverable numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS finance_recovered_before numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS finance_deposits numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS finance_balance_before numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS deduction_auto numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS deduction_manual numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS deduction_total numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS net_salary numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS wps_basic numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS wps_ot_allowance numeric DEFAULT 0;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS saved_to_monthly_costs boolean DEFAULT false;
ALTER TABLE public.wps_salary_monthly ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS wps_salary_monthly_employee_month_uidx
  ON public.wps_salary_monthly(employee_id, salary_month);

-- Needed for upsert from Salary Sheet to Monthly Costs / P&L.
-- Make Monthly Costs/P&L ready to receive the Salary Sheet sync payload.
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS salary_type text;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS salary numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS computed_salary numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS manual_override boolean DEFAULT false;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS basic_salary numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS fixed_allowance numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS hours_per_day numeric DEFAULT 8;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS contract_days_per_week numeric DEFAULT 6;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS working_days numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS month_days numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS normal_ot_hours numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS holiday_ot_hours numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS salary_deductions numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS hours_worked numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS food numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS food_allowance_pay numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS accommodation numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS transport numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS other numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS recurring_allowance_total numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.employee_monthly_costs ADD COLUMN IF NOT EXISTS remarks text;

CREATE UNIQUE INDEX IF NOT EXISTS employee_monthly_costs_employee_month_uidx
  ON public.employee_monthly_costs(employee_id, month);

ALTER TABLE public.wps_employee_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wps_salary_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow finance app access" ON public.wps_employee_master;
CREATE POLICY "Allow finance app access" ON public.wps_employee_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow finance app access" ON public.wps_salary_monthly;
CREATE POLICY "Allow finance app access" ON public.wps_salary_monthly
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wps_employee_master TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wps_salary_monthly TO authenticated;

NOTIFY pgrst, 'reload schema';`;

// ── Number to words (AED) ────────────────────────────────────────────────────
function numToWordsAED(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function chunk(x) {
    let s = '';
    if (x >= 100) { s += ones[Math.floor(x/100)] + ' Hundred '; x %= 100; }
    if (x >= 20)  { s += tens[Math.floor(x/10)] + ' '; x %= 10; }
    if (x > 0)    { s += ones[x] + ' '; }
    return s;
  }
  const whole = Math.floor(n), fils = Math.round((n - whole) * 100);
  if (whole === 0 && fils === 0) return 'Zero Dirhams';
  const scales = ['','Thousand','Million','Billion'];
  let w = whole, parts = [];
  if (w === 0) parts.push('Zero');
  let si = 0;
  while (w > 0) { const c = w % 1000; if (c) parts.unshift(chunk(c) + scales[si] + ' '); w = Math.floor(w/1000); si++; }
  let out = parts.join('').trim() + ' Dirhams';
  if (fils > 0) out += ' and ' + chunk(fils).trim() + ' Fils';
  return out;
}

// ── Month helpers ─────────────────────────────────────────────────────────────
function daysInMonthFn(yyyy, mm) { return new Date(yyyy, mm, 0).getDate(); }
function fmtDateDDMMYYYY(d) {
  return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
}

// ── Main WPS Tab ─────────────────────────────────────────────────────────────
function WpsReportTab({ employees, empMeta, hrDb, hrSalaryRows=[], hrSalaryStatus={} }) {
  const today = new Date();
  const defMonth = today.toISOString().slice(0,7);

  // State
  const [activeSection, setActiveSection] = useState('generate');
  const [month,    setMonth]    = useState(defMonth);
  const [master,   setMaster]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tableReady, setTableReady] = useState(null);
  const [draft,    setDraft]    = useState(null);
  const [showSql,  setShowSql]  = useState(false);
  const [overrides, setOverrides] = useState({});
  const [savedSheet, setSavedSheet] = useState([]);
  const [sheetReady, setSheetReady] = useState(true);
  const [savingSheet, setSavingSheet] = useState(false);
  const [recoveryCtx, setRecoveryCtx] = useState({});
  const [salaryAdjustments, setSalaryAdjustments] = useState({});
  const [generating, setGenerating] = useState('');
  const [importingFile, setImportingFile] = useState(false);
  const [hrPullError, setHrPullError] = useState('');
  const hrSalaryByEmp = useMemo(()=>salaryMapFromRows(hrSalaryRows||[]), [hrSalaryRows]);

  // Letter state — editable fields
  const [letterDate, setLetterDate]   = useState(fmtDateDDMMYYYY(today));
  const [dtdDate,    setDtdDate]      = useState(fmtDateDDMMYYYY(today));
  const [bankName,   setBankName]     = useState(WPS_CO.bank_name);
  const [bankAddr,   setBankAddr]     = useState(WPS_CO.bank_addr);
  const [acctNo,     setAcctNo]       = useState(WPS_CO.acct_no);
  const [signatory,  setSignatory]    = useState(WPS_CO.signatory);
  const [sigTitle,   setSigTitle]     = useState(WPS_CO.signatory_title);

  // Load master
  const loadMaster = async () => {
    setLoading(true);
    const { data, error } = await db.from('wps_employee_master').select('*').order('employee_id');
    if (error) { if (error.code === '42P01') setTableReady(false); setLoading(false); return; }
    setTableReady(true);
    setMaster(data || []);
    setLoading(false);
  };
  useEffect(() => { loadMaster(); }, []);

  const money = (v) => Math.round((Number(v)||0)*100)/100;
  const savedByEmp = useMemo(() => {
    const m = {};
    (savedSheet||[]).forEach(r => { if (r.employee_id) m[r.employee_id] = r; });
    return m;
  }, [savedSheet]);

  const draftKey = (m = month) => `satco_wps_salary_sheet_unsaved_${m}`;
  const readLocalDraft = (m = month) => {
    try { return JSON.parse(window.localStorage.getItem(draftKey(m)) || '{}') || {}; }
    catch { return {}; }
  };
  const writeLocalDraft = (m, obj) => {
    try { window.localStorage.setItem(draftKey(m), JSON.stringify(obj || {})); } catch {}
  };
  const clearLocalDraft = (m = month) => {
    try { window.localStorage.removeItem(draftKey(m)); } catch {}
  };
  const hasUnsavedDraft = Object.keys(overrides || {}).length > 0;

  const prevMonthYm = (ym) => {
    const [yy, mm] = String(ym || '').split('-').map(Number);
    if (!yy || !mm) return '';
    const d = new Date(yy, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  const ensureXlsx = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const existing = document.querySelector('script[data-satco-xlsx="true"]');
    if (existing) {
      existing.addEventListener('load', () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX library loaded but global object is unavailable.')));
      existing.addEventListener('error', () => reject(new Error('Could not load XLSX library. Check internet connection / CDN access.')));
      return;
    }
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    sc.async = true;
    sc.setAttribute('data-satco-xlsx','true');
    sc.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX library loaded but global object is unavailable.'));
    sc.onerror = () => reject(new Error('Could not load XLSX library. Check internet connection / CDN access.'));
    document.head.appendChild(sc);
  });

  const cleanCell = (v) => String(v ?? '').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
  const cleanKey = (v) => cleanCell(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const numCell = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = Number(String(v).replace(/[^0-9.-]/g,''));
    return Number.isFinite(n) ? n : 0;
  };
  const normIban = (v) => cleanCell(v).replace(/\s+/g,'').toUpperCase();
  const findCol = (headers, tests) => headers.findIndex(h => tests.some(t => t.test(cleanKey(h)) || t.test(cleanCell(h).toLowerCase())));
  const firstNonEmpty = (...vals) => vals.find(v => cleanCell(v) !== '') ?? '';

  const excelDateToYm = (v) => {
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`;
    if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 70000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    }
    const s = cleanCell(v);
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return `${m[3]}-${String(Number(m[2])).padStart(2,'0')}`;
    m = s.match(/^(\d{1,2})(\d{4})$/); // WPS SCR Salary Month = MMYYYY, e.g. 062026
    if (m) return `${m[2]}-${String(Number(m[1])).padStart(2,'0')}`;
    m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s]*(\d{4})\b/i);
    if (m) {
      const mm = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase()) + 1;
      return `${m[2]}-${String(mm).padStart(2,'0')}`;
    }
    return '';
  };

  const detectSalaryMonthFromAoa = (aoa) => {
    for (let r=0; r<aoa.length; r++) {
      const row = aoa[r] || [];
      for (let c=0; c<row.length; c++) {
        const cell = cleanCell(row[c]).toLowerCase();
        if (/^month:?$/.test(cell) || cell === 'salary month mmyyyy') {
          const ym = excelDateToYm(row[c+1]);
          if (ym) return ym;
        }
        if (cell === 'salary from') {
          for (let rr=r+1; rr<Math.min(aoa.length, r+8); rr++) {
            const ym = excelDateToYm((aoa[rr]||[])[c]);
            if (ym) return ym;
          }
        }
      }
      if (cleanCell(row[0]).toUpperCase() === 'SCR') {
        const ym = excelDateToYm(row[5]);
        if (ym) return ym;
      }
    }
    return '';
  };

  const matchEmployeeForImport = ({employee_id, full_name, labour_card_no, iban}) => {
    const id = cleanCell(employee_id);
    if (id) {
      const byId = (employees||[]).find(e => cleanCell(e.employee_id).toLowerCase() === id.toLowerCase());
      return { employee_id:byId?.employee_id || id, full_name:byId?.full_name || cleanCell(full_name)||id, confidence:byId?1:0.90, method:byId?'Employee code':'Employee code from file' };
    }
    const ib = normIban(iban);
    if (ib) {
      const byIban = (master||[]).find(m => normIban(m.iban) === ib) || null;
      if (byIban) return { employee_id:byIban.employee_id, full_name:byIban.full_name||full_name||byIban.employee_id, confidence:0.98, method:'IBAN' };
    }
    const lc = cleanCell(labour_card_no).replace(/\D/g,'');
    if (lc) {
      const byLc = (master||[]).find(m => cleanCell(m.labour_card_no).replace(/\D/g,'') === lc) || null;
      if (byLc) return { employee_id:byLc.employee_id, full_name:byLc.full_name||full_name||byLc.employee_id, confidence:0.96, method:'Labour card' };
    }
    const nm = cleanCell(full_name);
    if (nm) {
      const live = (employees||[]).filter(e=>!e.is_temp);
      const exact = live.filter(e=>cleanCell(e.full_name).toLowerCase() === nm.toLowerCase());
      if (exact.length === 1) return { employee_id:exact[0].employee_id, full_name:exact[0].full_name, confidence:0.94, method:'Exact name' };
      const {emp, score} = bestMatch(nm, live);
      if (emp && score >= 0.58) return { employee_id:emp.employee_id, full_name:emp.full_name, confidence:score, method:'Name match' };
    }
    return null;
  };

  const parseSalarySheetAoa = (aoa) => {
    const fileMonth = detectSalaryMonthFromAoa(aoa);
    const headerRow = aoa.findIndex(row => row && row.some(c=>/emp\s*(code|no\.?)/i.test(cleanCell(c))) && row.some(c=>/gross\s*salary|bank\s*deposit|net\s*amount/i.test(cleanCell(c))));
    if (headerRow < 0) return [];
    const headers = aoa[headerRow].map(cleanCell);
    const empCol = findCol(headers, [/emp(code|no|id)/, /employeecode/, /employeeno/]);
    const nameCol = findCol(headers, [/nameofemployee/, /employeename/, /^name$/]);
    const craftCol = findCol(headers, [/craft/, /position/, /designation/]);
    const basicSalaryCol = findCol(headers, [/basicsalary/]);
    const allowanceCols = headers.map((h,i)=>cleanKey(h)==='allowance'?i:null).filter(i=>i!==null);
    const fixedAllowanceCol = allowanceCols[0] ?? findCol(headers, [/fixedallowance/]);
    const allowancePayCol = allowanceCols[1] ?? fixedAllowanceCol;
    const workingCol = findCol(headers, [/workingdayshr/, /workingdays/, /workinghours/]);
    const normalOtCol = findCol(headers, [/normalothrs/, /normalovertime/]);
    const holidayOtCol = findCol(headers, [/holiday(s)?ot/, /holidayovertime/]);
    const basicPayCol = headers.findIndex(h => cleanKey(h)==='basic');
    const normalOtPayCol = findCol(headers, [/normalovertimex125/, /normalovertime/]);
    const holidayOtPayCol = findCol(headers, [/holidayovertimex15/, /holidayovertime/]);
    const foodCol = findCol(headers, [/foodallowance/]);
    const grossCol = findCol(headers, [/grosssalary/]);
    const arrearsCol = findCol(headers, [/arrears/]);
    const deductionCol = findCol(headers, [/cashadvance.*deduction/, /advance.*deduction/, /deduction/]);
    const bankDepositCol = findCol(headers, [/bankdeposit/, /netamount/, /netpay/]);
    const remarkCol = findCol(headers, [/remark/]);
    const out=[];
    for (let r=headerRow+1; r<aoa.length; r++) {
      const row = aoa[r] || [];
      const first = cleanCell(row[0]);
      if (/^total\s*salaries|^summary$/i.test(first) || /^total\s*salaries/i.test(cleanCell(row[0]))) break;
      const rawId = empCol>=0 ? cleanCell(row[empCol]) : '';
      const name = nameCol>=0 ? cleanCell(row[nameCol]) : '';
      if (!rawId && !name) continue;
      if (/^total/i.test(rawId) || /^total/i.test(name)) continue;
      const matched = matchEmployeeForImport({employee_id:rawId, full_name:name});
      if (!matched) { out.push({unmatched:true, source_type:'internal_salary_sheet', source_name:name, source_employee_id:rawId}); continue; }
      const gross = money(numCell(grossCol>=0 ? row[grossCol] : 0));
      const arrears = money(numCell(arrearsCol>=0 ? row[arrearsCol] : 0));
      const deductions = money(numCell(deductionCol>=0 ? row[deductionCol] : 0));
      const wpsPaid = money(numCell(bankDepositCol>=0 ? row[bankDepositCol] : 0));
      const actualGross = money(gross + arrears);
      const actualNet = money(actualGross - deductions);
      const carryForward = money(actualNet - wpsPaid);
      const action = carryForward > 0
        ? `Pay arrears AED ${fmt(carryForward)} in next salary`
        : carryForward < 0
          ? `Recover/deduct AED ${fmt(Math.abs(carryForward))} in next salary`
          : 'No carry forward';
      out.push({
        source_type:'internal_salary_sheet', salary_month:fileMonth,
        employee_id:matched.employee_id, full_name:matched.full_name || name || matched.employee_id,
        craft: craftCol>=0 ? cleanCell(row[craftCol]) : '', match_method:matched.method, match_confidence:matched.confidence,
        basic_salary:numCell(basicSalaryCol>=0 ? row[basicSalaryCol] : 0), fixed_allowance:numCell(fixedAllowanceCol>=0 ? row[fixedAllowanceCol] : 0),
        working_days:numCell(workingCol>=0 ? row[workingCol] : 0), normal_ot_hours:numCell(normalOtCol>=0 ? row[normalOtCol] : 0), holiday_ot_hours:numCell(holidayOtCol>=0 ? row[holidayOtCol] : 0),
        basic_pay:numCell(basicPayCol>=0 ? row[basicPayCol] : 0), normal_ot_pay:numCell(normalOtPayCol>=0 ? row[normalOtPayCol] : 0), holiday_ot_pay:numCell(holidayOtPayCol>=0 ? row[holidayOtPayCol] : 0), allowance_pay:numCell(allowancePayCol>=0 ? row[allowancePayCol] : 0),
        food_allowance_pay:numCell(foodCol>=0 ? row[foodCol] : 0), gross_salary:actualGross, actual_gross_salary:actualGross, actual_net_salary:actualNet,
        arrears, deduction_total:deductions, net_salary:actualNet, wps_paid_total:wpsPaid, wps_basic:wpsPaid, wps_ot_allowance:0,
        carry_forward:carryForward, next_month_action:action,
        remarks:firstNonEmpty(remarkCol>=0 ? row[remarkCol] : '', `Imported HR actual salary sheet · ${matched.method}. WPS paid AED ${fmt(wpsPaid)}; actual payable AED ${fmt(actualNet)}; ${action}.`),
      });
    }
    return out;
  };

  const parseWpsAoa = (aoa) => {
    const fileMonth = detectSalaryMonthFromAoa(aoa);
    const out=[];
    for (let r=0; r<aoa.length; r++) {
      const row = aoa[r] || [];
      if (cleanCell(row[0]).toUpperCase() !== 'EDR') continue;
      const labour = cleanCell(row[1]);
      const routing = cleanCell(row[2]).replace(/\D/g,'');
      const iban = normIban(row[3]);
      const name = cleanCell(row[10]);
      const basic = money(numCell(row[7]));
      const otAllow = money(numCell(row[8]));
      const days = numCell(row[6]);
      const paidTotal = money(basic + otAllow);
      const matched = matchEmployeeForImport({full_name:name, labour_card_no:labour, iban});
      if (!matched) { out.push({unmatched:true, source_type:'bank_wps', source_name:name, labour_card_no:labour, iban}); continue; }
      out.push({
        source_type:'bank_wps', salary_month:fileMonth,
        employee_id:matched.employee_id, full_name:matched.full_name || name || matched.employee_id,
        labour_card_no:labour, bank_routing:routing, iban, match_method:matched.method, match_confidence:matched.confidence,
        salary_type:'fixed', working_days:days, basic_salary:basic, fixed_allowance:otAllow,
        basic_pay:basic, allowance_pay:otAllow, gross_salary:paidTotal, net_salary:paidTotal,
        wps_basic:basic, wps_ot_allowance:otAllow, wps_paid_total:paidTotal, deduction_total:0,
        remarks:`Imported Bank WPS file · ${matched.method}. This is the amount already sent to the bank, not the final actual salary.`,
      });
    }
    return out;
  };

  const mergeImportRows = (rows) => {
    const byEmp = {};
    rows.forEach(r => {
      if (!r.employee_id) return;
      const ex = byEmp[r.employee_id] || {};
      const wpsPaidExisting = money(ex.wps_paid_total || (numCell(ex.wps_basic)+numCell(ex.wps_ot_allowance)) || 0);
      if (r.source_type === 'bank_wps') {
        byEmp[r.employee_id] = {
          ...ex,
          employee_id:r.employee_id, full_name:ex.full_name || r.full_name,
          labour_card_no:r.labour_card_no || ex.labour_card_no, bank_routing:r.bank_routing || ex.bank_routing, iban:r.iban || ex.iban,
          wps_basic:r.wps_basic || 0, wps_ot_allowance:r.wps_ot_allowance || 0, wps_paid_total:r.wps_paid_total || 0,
          working_days:ex.working_days || r.working_days || 0,
          basic_salary:ex.basic_salary || 0, fixed_allowance:ex.fixed_allowance || 0,
          gross_salary:ex.actual_gross_salary || ex.gross_salary || r.wps_paid_total || 0,
          net_salary:ex.actual_net_salary || ex.net_salary || r.wps_paid_total || 0,
          source_type:ex.source_type === 'internal_salary_sheet' ? 'combined' : 'bank_wps',
          remarks: ex.source_type === 'internal_salary_sheet' ? `${ex.remarks || 'Imported HR actual salary sheet'} | WPS bank paid AED ${fmt(r.wps_paid_total || 0)}.` : r.remarks,
        };
      } else {
        const wpsPaid = money(r.wps_paid_total || wpsPaidExisting || 0);
        const actualNet = money(r.actual_net_salary ?? r.net_salary ?? 0);
        const carry = money(actualNet - wpsPaid);
        const action = carry > 0 ? `Pay arrears AED ${fmt(carry)} in next salary` : carry < 0 ? `Recover/deduct AED ${fmt(Math.abs(carry))} in next salary` : 'No carry forward';
        byEmp[r.employee_id] = {
          ...ex,
          ...r,
          source_type: ex.source_type === 'bank_wps' ? 'combined' : 'internal_salary_sheet',
          wps_basic: ex.wps_basic || r.wps_basic || wpsPaid,
          wps_ot_allowance: ex.wps_ot_allowance || r.wps_ot_allowance || 0,
          wps_paid_total:wpsPaid,
          carry_forward:carry,
          next_month_action:action,
          remarks:`Imported HR actual salary sheet · ${r.match_method || 'matched'}. WPS paid AED ${fmt(wpsPaid)}; actual payable AED ${fmt(actualNet)}; ${action}.`,
        };
      }
    });
    return Object.values(byEmp);
  };

  const importSalaryOrWpsExcel = async (file, importMode='auto') => {
    if (!file || importingFile) return;
    setImportingFile(true);
    try {
      const XLSXLib = await ensureXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSXLib.read(buf, {type:'array', cellDates:true, raw:true});
      let parsed=[];
      let detectedMonth='';
      for (const sh of wb.SheetNames) {
        const aoa = XLSXLib.utils.sheet_to_json(wb.Sheets[sh], {header:1, defval:null, raw:true});
        detectedMonth = detectedMonth || detectSalaryMonthFromAoa(aoa);
        if (importMode === 'internal_salary_sheet' || importMode === 'auto') parsed = parsed.concat(parseSalarySheetAoa(aoa));
        if (importMode === 'bank_wps' || importMode === 'auto') parsed = parsed.concat(parseWpsAoa(aoa));
      }
      const unmatched = parsed.filter(r=>r.unmatched);
      const rows = parsed.filter(r=>!r.unmatched && r.employee_id);
      if (!rows.length) {
        alert('No salary/WPS rows could be read. Use “Import Bank WPS file” for the bank .xls file or “Import HR Salary Sheet” for the internal salary sheet.');
        setImportingFile(false); return;
      }
      const cleanRows = mergeImportRows(rows);
      const fileMonth = detectedMonth || cleanRows.find(r=>r.salary_month)?.salary_month || '';
      let targetMonth = fileMonth || month;
      if (fileMonth && fileMonth !== month) {
        const ok = window.confirm(`This file appears to be for ${fileMonth}, but the portal is currently open at ${month}.\n\nImport into ${fileMonth}?`);
        if (!ok) { setImportingFile(false); return; }
        setMonth(fileMonth);
      }
      const modeLabel = importMode === 'bank_wps' ? 'Bank WPS file' : importMode === 'internal_salary_sheet' ? 'HR actual salary sheet' : 'salary/WPS file';
      const wpsCount = cleanRows.filter(r=>r.source_type==='bank_wps' || r.source_type==='combined').length;
      const actualCount = cleanRows.filter(r=>r.source_type==='internal_salary_sheet' || r.source_type==='combined').length;
      const totalWpsPaid = cleanRows.reduce((s,r)=>s+numCell(r.wps_paid_total || r.wps_basic || 0)+numCell(r.wps_ot_allowance && !r.wps_paid_total ? r.wps_ot_allowance : 0),0);
      const totalActual = cleanRows.reduce((s,r)=>s+numCell(r.actual_net_salary ?? r.net_salary ?? 0),0);
      const proceed = window.confirm(`Ready to import ${cleanRows.length} employee row(s) for ${targetMonth}.\n\nType: ${modeLabel}\nWPS bank-paid rows: ${wpsCount}\nActual salary rows: ${actualCount}\nWPS paid total: AED ${fmt(totalWpsPaid)}\nActual payable total: AED ${fmt(totalActual)}\n\nContinue?`);
      if (!proceed) { setImportingFile(false); return; }

      const salaryMonth = firstOfMonth(targetMonth);
      const [yy,mm] = targetMonth.split('-').map(Number);
      const salaryPayload = cleanRows.map(r => {
        const isActual = r.source_type === 'internal_salary_sheet' || r.source_type === 'combined';
        const wpsPaid = money(r.wps_paid_total || ((numCell(r.wps_basic)||0) + (numCell(r.wps_ot_allowance)||0)) || r.net_salary || 0);
        const actualGross = money(isActual ? (r.actual_gross_salary ?? r.gross_salary ?? 0) : wpsPaid);
        const actualNet = money(isActual ? (r.actual_net_salary ?? r.net_salary ?? actualGross) : wpsPaid);
        const carry = money(isActual ? actualNet - wpsPaid : 0);
        const action = isActual ? (carry > 0 ? `Pay arrears AED ${fmt(carry)} in next salary` : carry < 0 ? `Recover/deduct AED ${fmt(Math.abs(carry))} in next salary` : 'No carry forward') : 'Awaiting actual timesheet/salary sheet';
        return {
          employee_id:r.employee_id, full_name:r.full_name || r.employee_id, labour_card_no:r.labour_card_no || null, bank_routing:r.bank_routing || null, iban:r.iban || null,
          salary_month:salaryMonth, salary_type:r.salary_type || 'fixed', basic_salary:r.basic_salary || r.basic_pay || 0, fixed_allowance:r.fixed_allowance || 0,
          hourly_rate:0, hours_per_day:8, contract_days_per_week:6, working_days:r.working_days || 0, hours_worked:0,
          normal_ot_hours:r.normal_ot_hours || 0, holiday_ot_hours:r.holiday_ot_hours || 0, extra_allowance:r.arrears || 0, overtime_amount:0,
          food_allowance:0, food_allowance_pay:r.food_allowance_pay || 0, hourly_pay:0, basic_pay:r.basic_pay || r.wps_basic || 0,
          normal_ot_pay:r.normal_ot_pay || 0, holiday_ot_pay:r.holiday_ot_pay || 0, allowance_pay:r.allowance_pay || r.wps_ot_allowance || 0,
          gross_salary:actualGross, finance_recoverable:0, finance_recovered_before:0, finance_deposits:0, finance_balance_before:0,
          deduction_auto:0, deduction_manual:r.deduction_total || 0, deduction_total:r.deduction_total || 0,
          net_salary:actualNet, wps_basic:r.wps_basic || wpsPaid, wps_ot_allowance:r.wps_ot_allowance || 0,
          remarks:r.remarks || `${modeLabel}. WPS paid AED ${fmt(wpsPaid)}; actual payable AED ${fmt(actualNet)}; ${action}.`, saved_to_monthly_costs:true, updated_at:new Date().toISOString(),
        };
      });
      const masterPayload = cleanRows.map(r => {
        const isBankOnly = r.source_type === 'bank_wps';
        const obj = { employee_id:r.employee_id, full_name:r.full_name || r.employee_id, active:true, updated_at:new Date().toISOString() };
        if (r.labour_card_no) obj.labour_card_no = r.labour_card_no;
        if (r.bank_routing) obj.bank_routing = r.bank_routing;
        if (r.iban) obj.iban = r.iban;
        // WPS bank file is a payment instruction, not the contract master. Do not overwrite salary master from bank file.
        if (!isBankOnly) {
          if (numCell(r.basic_salary)) obj.basic_salary = r.basic_salary;
          if (numCell(r.fixed_allowance)) obj.fixed_allowance = r.fixed_allowance;
        }
        return obj;
      });
      const monthlyPayload = cleanRows.map(r => {
        const isActual = r.source_type === 'internal_salary_sheet' || r.source_type === 'combined';
        const wpsPaid = money(r.wps_paid_total || ((numCell(r.wps_basic)||0) + (numCell(r.wps_ot_allowance)||0)) || r.net_salary || 0);
        const actualGross = money(isActual ? (r.actual_gross_salary ?? r.gross_salary ?? 0) : wpsPaid);
        const actualNet = money(isActual ? (r.actual_net_salary ?? r.net_salary ?? actualGross) : wpsPaid);
        const carry = money(isActual ? actualNet - wpsPaid : 0);
        const action = isActual ? (carry > 0 ? `Pay arrears AED ${fmt(carry)} in next salary` : carry < 0 ? `Recover/deduct AED ${fmt(Math.abs(carry))} in next salary` : 'No carry forward') : 'Provisional WPS paid; actual salary pending timesheet.';
        return {
          employee_id:r.employee_id, full_name:r.full_name || r.employee_id, month:salaryMonth,
          salary_type:isActual ? 'actual_salary_sheet' : 'wps_bank_paid_provisional', salary:actualGross,
          food:r.food_allowance_pay || 0, food_allowance_pay:r.food_allowance_pay || 0, accommodation:0, transport:0, other:0,
          remarks:`${isActual ? 'Actual HR salary sheet' : 'Bank WPS file'} imported. WPS paid AED ${fmt(wpsPaid)}; actual payable AED ${fmt(actualNet)}; ${action}`,
          salary_deductions:r.deduction_total || 0, hours_worked:0, hourly_rate:0,
          basic_salary:r.basic_salary || 0, fixed_allowance:r.fixed_allowance || 0, hours_per_day:8, contract_days_per_week:6,
          working_days:r.working_days || 0, month_days:daysInMonthFn(yy, mm),
          normal_ot_hours:r.normal_ot_hours || 0, holiday_ot_hours:r.holiday_ot_hours || 0,
          computed_salary:actualGross, manual_override:false, recurring_allowance_total:0,
        };
      });
      const mUp = await db.from('wps_employee_master').upsert(masterPayload, { onConflict:'employee_id' });
      if (mUp.error) throw new Error('Master update failed: ' + mUp.error.message);
      const sUp = await db.from('wps_salary_monthly').upsert(salaryPayload, { onConflict:'employee_id,salary_month' });
      if (sUp.error) throw new Error('WPS monthly import failed: ' + sUp.error.message);
      const pUp = await db.from('employee_monthly_costs').upsert(monthlyPayload, { onConflict:'employee_id,month' });
      if (pUp.error) alert('Imported WPS/salary sheet, but P&L monthly sync failed: ' + pUp.error.message);
      await loadMaster(); await loadMonthlySheet(); await loadRecoveryContext();
      const skipped = unmatched.length ? `\n${unmatched.length} row(s) could not be matched by Employee Code / IBAN / Labour Card / Name and were skipped.` : '';
      alert(`Imported ${cleanRows.length} employee row(s) for ${targetMonth}.\n\nExcel import completed. Portal-generated WPS/Salary Sheet is the default process, but Excel upload remains available for any month whenever HR needs to correct, migrate, or capture an externally prepared file.${skipped}`);
    } catch(e) {
      alert('Import failed: ' + (e.message || String(e)));
    }
    setImportingFile(false);
  };

  const loadMonthlySheet = async () => {
    if (!month) return;
    const { data, error } = await db.from('wps_salary_monthly')
      .select('*')
      .eq('salary_month', firstOfMonth(month))
      .order('employee_id');
    if (error) {
      if (error.code === '42P01' || /wps_salary_monthly/i.test(error.message||'')) {
        setSheetReady(false);
        setShowSql(true);
      } else {
        console.error('WPS salary sheet load failed', error);
      }
      return;
    }
    setSheetReady(true);
    setSavedSheet(data || []);
    setOverrides(readLocalDraft(month));
  };

  const loadRecoveryContext = async () => {
    const currentMonth = firstOfMonth(month);
    const [visa, flights, training, other, monthly, invoices, invoiceLines, invoiceRecoveries] = await Promise.all([
      db.from('employee_visa_costs').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_flights').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_training_costs').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_other_costs').select('employee_id,amount,recoverable,cost_type,recovered_amount,notes'),
      db.from('employee_monthly_costs').select('employee_id,month,salary_deductions'),
      db.from('employee_client_invoices').select('id,employee_id,month,received_amount_aed,wps_paid_aed,satco_rate_eur_hr,brunel_rate_eur_hr'),
      db.from('employee_client_invoice_lines').select('invoice_id,hours,rate_eur_hr'),
      db.from('employee_client_recoveries').select('invoice_id,employee_id,amount_aed'),
    ]);

    const linesByInvoice = {};
    (invoiceLines.data||[]).forEach(l => { if (!linesByInvoice[l.invoice_id]) linesByInvoice[l.invoice_id]=[]; linesByInvoice[l.invoice_id].push(l); });
    const recoveryByInvoice = {};
    (invoiceRecoveries.data||[]).forEach(r => { recoveryByInvoice[r.employee_id] = (recoveryByInvoice[r.employee_id]||0) + (Number(r.amount_aed)||0); });

    const m = {};
    const ensure = (id) => { if (!m[id]) m[id] = { recoverable:0, recoveredBefore:0, deposits:0, balanceBefore:0 }; return m[id]; };
    const addRecoverable = (id, amt) => { if (!id) return; ensure(id).recoverable += Number(amt)||0; };
    const addRecovered = (id, amt) => { if (!id) return; ensure(id).recoveredBefore += Number(amt)||0; };
    const addDeposit = (id, amt) => { if (!id) return; const r=ensure(id); r.deposits += Number(amt)||0; r.recoveredBefore += Number(amt)||0; };

    (visa.data||[]).filter(r=>r.recoverable).forEach(r=>addRecoverable(r.employee_id, recoverableCap(r,'cost')));
    (flights.data||[]).filter(r=>r.recoverable).forEach(r=>addRecoverable(r.employee_id, recoverableCap(r,'cost')));
    (training.data||[]).filter(r=>r.recoverable).forEach(r=>addRecoverable(r.employee_id, recoverableCap(r,'cost')));
    (other.data||[]).forEach(r => {
      if (r.cost_type === 'security_deposit') addDeposit(r.employee_id, r.amount);
      else if (r.recoverable && r.cost_type !== 'wps_overpayment_recovery') {
        addRecoverable(r.employee_id, r.amount);
        addRecovered(r.employee_id, r.recovered_amount);
      } else if (r.cost_type === 'wps_overpayment_recovery' && r.recoverable && !/\[INV:[^\]]+\]/.test(String(r.notes||''))) {
        addRecoverable(r.employee_id, r.amount);
        addRecovered(r.employee_id, r.recovered_amount);
      }
    });

    (monthly.data||[]).forEach(r => {
      // Exclude this salary month from the "before" balance so the table can show the effect
      // of the deduction the admin is entering now.
      if (String(r.month||'').slice(0,10) === currentMonth) return;
      addRecovered(r.employee_id, r.salary_deductions);
    });

    // Synced employee_other_costs row per invoice — read here so a manual "un-recoverable"
    // override on a WPS-overpaid row (e.g. it'll be netted against next month's WPS payment
    // instead of a salary deduction) isn't silently overwritten by this recompute, which would
    // otherwise re-suggest deducting it from this month's salary.
    const invoiceSyncMapPipeline = {};
    (other.data||[]).forEach(r=>{
      const m = String(r.notes||'').match(/\[INV:([^\]]+)\]/);
      if (m) invoiceSyncMapPipeline[m[1]] = r;
    });
    (invoices.data||[]).forEach(inv => {
      const lns = linesByInvoice[inv.id] || [];
      const split = wpsInvoiceSplit(inv, lns);
      if (split.overpaid === null) return;
      const syncedInv = invoiceSyncMapPipeline[inv.id];
      if (split.overpaid > 0.5 && (!syncedInv || syncedInv.recoverable)) addRecoverable(inv.employee_id, Math.round(split.overpaid*100)/100);
    });

    Object.keys(recoveryByInvoice).forEach(id => addRecovered(id, recoveryByInvoice[id]));
    Object.keys(m).forEach(id => { m[id].balanceBefore = Math.max(0, money(m[id].recoverable - m[id].recoveredBefore)); });
    setRecoveryCtx(m);
  };

  const loadSalaryAdjustments = async () => {
    if (!month) return;
    const prevYm = prevMonthYm(month);
    if (!prevYm) { setSalaryAdjustments({}); return; }
    const prevStart = prevYm + '-01';
    try {
      const [wpsRes, actualRes] = await Promise.all([
        db.from('wps_salary_monthly')
          .select('employee_id,gross_salary,net_salary,wps_basic,wps_ot_allowance,remarks')
          .eq('salary_month', prevStart),
        db.from('employee_monthly_costs')
          .select('employee_id,salary_type,salary,computed_salary,salary_deductions,arrears,remarks')
          .like('month', prevYm + '%')
      ]);
      const wpsMap = {};
      (wpsRes.data || []).forEach(r => {
        wpsMap[r.employee_id] = money(r.net_salary || r.gross_salary || ((Number(r.wps_basic)||0) + (Number(r.wps_ot_allowance)||0)));
      });
      const out = {};
      (actualRes.data || []).forEach(r => {
        const st = String(r.salary_type || '').toLowerCase();
        if (st.includes('wps_bank') || st.includes('wps_salary_sheet')) return;
        const wpsPaid = money(wpsMap[r.employee_id] || 0);
        const actual = money(r.computed_salary || r.salary || 0);
        if (!r.employee_id || !wpsPaid || !actual) return;
        const amount = money(actual - wpsPaid);
        if (Math.abs(amount) < 0.01) return;
        out[r.employee_id] = {
          month: prevYm, amount, wpsPaid, actual,
          label: amount > 0
            ? `Previous ${prevYm} arrears AED ${fmt(amount)}`
            : `Previous ${prevYm} recovery AED ${fmt(Math.abs(amount))}`
        };
      });
      setSalaryAdjustments(out);
    } catch (e) {
      console.warn('Could not load salary adjustments', e);
      setSalaryAdjustments({});
    }
  };

  useEffect(() => { if (tableReady !== false) loadMonthlySheet(); }, [month, tableReady]);
  useEffect(() => { loadRecoveryContext(); loadSalaryAdjustments(); }, [month, master.length]);


  // Pull IBAN + salary from HR bridge only when an exact employee is selected
  const pullHrProfile = async (employeeId) => {
    if (!employeeId) return null;
    if (hrSalaryByEmp[employeeId]) return hrSalaryByEmp[employeeId];
    const { row, error } = await pullHrFinanceEmployee(employeeId);
    if (error) setHrPullError(error);
    return row;
  };
  const pullHrIban = async (employeeId) => {
    const row = await pullHrProfile(employeeId);
    return row?.iban || null;
  };

  // Save master row
  const saveMaster = async () => {
    if (!draft.employee_id) return alert('Employee ID is required');
    const routingClean = String(draft.bank_routing || '').replace(/\D/g,'');
    if (!routingClean) return alert('Bank Routing Code is required. Enter the 9-digit WPS bank routing code once; it will be saved for future months.');
    if (!/^\d{9}$/.test(routingClean)) return alert('Bank Routing Code must be 9 digits. Please verify the WPS routing code with the bank / WPS template.');
    const clean = {
      employee_id: draft.employee_id, full_name: draft.full_name || null,
      labour_card_no: draft.labour_card_no || null,
      bank_routing: routingClean,
      iban: (draft.iban || '').replace(/\s/g,'').toUpperCase() || null,
      basic_salary: Number(draft.basic_salary) || 0,
      fixed_allowance: Number(draft.fixed_allowance) || 0,
      // If an hourly rate is entered, treat this employee as Hourly Contract automatically.
      // Basic salary remains only as contractual / WPS dummy reference.
      salary_type: (Number(draft.hourly_rate) || 0) > 0 ? 'hourly' : (draft.salary_type || 'fixed'),
      hourly_rate: Number(draft.hourly_rate) || 0,
      hours_per_day: Number(draft.hours_per_day) || 8,
      contract_days_per_week: Number(draft.contract_days_per_week) || 6,
      remarks: draft.remarks || null,
      active: draft.active !== false,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await db.from('wps_employee_master').update(clean).eq('id', draft.id)
      : await db.from('wps_employee_master').upsert(clean, { onConflict: 'employee_id' });
    if (error) {
      if (error.code === '42P01' || /wps_employee_master/i.test(error.message||'')) {
        setTableReady(false);
        setShowSql(true);
        return alert('WPS Employee Master table is not created yet. Please run the setup SQL once in Finance Supabase, then refresh this page.');
      }
      return alert(error.message);
    }
    if ((Number(clean.basic_salary)||0) > 0 || (Number(clean.fixed_allowance)||0) > 0) {
      await db.from('employee_salary_profiles').upsert({
        employee_id:clean.employee_id, full_name:clean.full_name, basic_salary:clean.basic_salary, fixed_allowance:clean.fixed_allowance,
        remarks:'Updated from WPS Employee Master', updated_at:new Date().toISOString()
      }, { onConflict:'employee_id' });
    }
    const wasCorrection = !!draft.id;
    setDraft(null);
    await loadMaster();
    await loadMonthlySheet();
    alert(wasCorrection
      ? 'WPS Employee Master corrected. The corrected Labour Card / Bank Routing / IBAN / Salary / Hourly Rate / Contract Hours-Day / Days-Week values will be used for future salary sheets. For the current open month, click Save Salary Sheet once to update the monthly snapshot.'
      : 'Employee added to WPS Master. These values will be reused every salary month.');
  };

  const openMasterCorrection = (employeeId) => {
    const row = master.find(m => m.employee_id === employeeId);
    if (!row) return alert('Employee not found in WPS Master.');
    setDraft({ ...row });
    setActiveSection('master');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const removeMaster = async (id) => {
    if (!window.confirm('Remove this employee from WPS master?')) return;
    await db.from('wps_employee_master').delete().eq('id', id);
    loadMaster();
  };

  // ── Compute Salary Sheet → WPS rows ────────────────────────────────────────
  const computeSalarySheet = () => {
    const [y, mo] = month.split('-').map(Number);
    const lastDay = daysInMonthFn(y, mo);
    const active  = master.filter(m => m.active !== false);
    return active.map((emp, idx) => {
      const saved = savedByEmp[emp.employee_id] || {};
      const ov = overrides[emp.employee_id] || {};
      const pick = (key, def='') => (ov[key] !== undefined ? ov[key] : (saved[key] !== undefined && saved[key] !== null ? saved[key] : def));
      const hourlyRateMaster = Number(emp.hourly_rate ?? saved.hourly_rate ?? 0) || 0;
      // Any employee with Hourly Rate in WPS Master is treated as hourly, even if salary type was left as Variable/Fixed.
      // Basic salary is displayed only as dummy/contractual reference for such employees.
      const salaryType = hourlyRateMaster > 0 ? 'hourly' : (emp.salary_type || 'fixed');
      const isVar = salaryType === 'variable';
      const isHourly = salaryType === 'hourly';
      const hpd = Number(pick('hours_per_day', emp.hours_per_day || 8)) || 8;
      const contractDaysPerWeek = Number(pick('contract_days_per_week', emp.contract_days_per_week || 6)) || 6;
      const hoursWorked = isHourly ? (Number(pick('hours_worked', 0)) || 0) : 0;
      const rawWorkDays = Number(pick('working_days', isHourly ? 0 : lastDay)) || 0;
      // For hourly employees, regular hours drive salary; equivalent worked days are used only for prorating allowance/food.
      const prorataDays = isHourly ? Math.min(lastDay, (hpd ? (hoursWorked / hpd) : 0)) : rawWorkDays;
      const workDays = isHourly ? prorataDays : rawWorkDays;
      const normalOT = Number(pick('normal_ot_hours', 0)) || 0;
      const holidayOT = Number(pick('holiday_ot_hours', 0)) || 0;
      const extraAllowance = Number(pick('extra_allowance', 0)) || 0;
      const overtimeAmount = Number(pick('overtime_amount', 0)) || 0;
      const foodAllowance = Number(pick('food_allowance', 0)) || 0;
      const deductionManual = Number(pick('deduction_manual', 0)) || 0;
      const deductionAuto = Number(pick('deduction_auto', 0)) || 0;
      const remarks = String(pick('remarks', '') || '');
      const baseBasic = Number(emp.basic_salary) || 0;          // contractual / WPS master basic; not used for hourly calculation
      const baseAllow = Number(emp.fixed_allowance) || 0;
      const hourlyRate = hourlyRateMaster;
      const craft = (empMeta && empMeta[emp.employee_id] && (empMeta[emp.employee_id].position || empMeta[emp.employee_id].trade)) || emp.remarks || '';

      let basicPay, normalOTPay, holidayOTPay, allowancePay, foodAllowancePay, extraAllowancePay, hourlyPay;
      if (isHourly) {
        hourlyPay = hourlyRate * hoursWorked;
        basicPay = hourlyPay;
        normalOTPay = hourlyRate * normalOT * 1.25;
        holidayOTPay = hourlyRate * holidayOT * 1.5;
        allowancePay = lastDay ? (baseAllow / lastDay * prorataDays) : baseAllow;
        foodAllowancePay = lastDay ? (foodAllowance / lastDay * prorataDays) : foodAllowance;
        extraAllowancePay = lastDay ? (extraAllowance / lastDay * prorataDays) : extraAllowance;
      } else {
        // Excel salary sheet formula for all non-hourly employees:
        // Basic Pay      = Basic Salary / Month Days × Working Days
        // Normal OT Pay  = Basic Salary / Month Days / Hours Per Day × Normal OT Hours × 1.25
        // Holiday OT Pay = Basic Salary / Month Days / Hours Per Day × Holiday OT Hours × 1.5
        // Allowance Pay  = Allowance / Month Days × Working Days
        // Food Allowance = Monthly Food Allowance / Month Days × Working Days
        const hourlyBase = (lastDay && hpd) ? (baseBasic / lastDay / hpd) : 0;
        hourlyPay = 0;
        basicPay = lastDay ? (baseBasic / lastDay * workDays) : baseBasic;
        normalOTPay = hourlyBase * normalOT * 1.25;
        holidayOTPay = hourlyBase * holidayOT * 1.5;
        allowancePay = lastDay ? (baseAllow / lastDay * workDays) : baseAllow;
        foodAllowancePay = lastDay ? (foodAllowance / lastDay * workDays) : foodAllowance;
        extraAllowancePay = lastDay ? (extraAllowance / lastDay * workDays) : extraAllowance;
      }

      const prevAdj = salaryAdjustments[emp.employee_id] || null;
      const carryForwardAdjustment = money(prevAdj?.amount || 0);
      const carryForwardPay = carryForwardAdjustment > 0 ? carryForwardAdjustment : 0;
      const carryForwardDeduction = carryForwardAdjustment < 0 ? Math.abs(carryForwardAdjustment) : 0;
      const grossBeforeAdjustment = money(basicPay + normalOTPay + holidayOTPay + allowancePay + extraAllowancePay + foodAllowancePay);
      const gross = money(grossBeforeAdjustment + carryForwardPay);
      const deductionTotal = Math.min(gross, money(deductionAuto + deductionManual + carryForwardDeduction));
      const net = money(gross - deductionTotal);
      const rec = recoveryCtx[emp.employee_id] || { recoverable:0, recoveredBefore:0, deposits:0, balanceBefore:0 };
      const balanceAfter = Math.max(0, money((Number(rec.balanceBefore)||0) - deductionTotal));

      // WPS file must carry the net payable amount. Deduction is applied against OT/allowance first,
      // then basic if needed, so Basic + OT/Allowance always equals salary actually paid.
      let wpsBasic = Math.max(0, Math.round(basicPay));
      let wpsOtAllow = Math.max(0, Math.round(gross) - wpsBasic);
      let dedRounded = Math.round(deductionTotal);
      const cutOt = Math.min(wpsOtAllow, dedRounded);
      wpsOtAllow -= cutOt; dedRounded -= cutOt;
      if (dedRounded > 0) wpsBasic = Math.max(0, wpsBasic - dedRounded);

      return {
        sl_no: idx + 1,
        employee_id: emp.employee_id,
        name: emp.full_name || emp.employee_id,
        craft,
        labour_card_no: emp.labour_card_no || saved.labour_card_no || '',
        bank_routing: emp.bank_routing || saved.bank_routing || '',
        iban: emp.iban || saved.iban || '',
        salary_type: salaryType,
        is_hourly: isHourly,
        base_basic: baseBasic,
        base_allowance: baseAllow,
        hourly_rate: hourlyRate,
        working_days: workDays,
        contract_days_per_week: contractDaysPerWeek,
        prorata_days: prorataDays,
        hours_worked: hoursWorked,
        normal_ot: normalOT,
        holiday_ot: holidayOT,
        hours_per_day: hpd,
        extra_allowance: extraAllowance,
        overtime_amount: overtimeAmount,
        food_allowance: foodAllowance,
        food_allowance_pay: money(foodAllowancePay),
        extra_allowance_pay: money(extraAllowancePay),
        hourly_pay: money(hourlyPay),
        basic_pay: money(basicPay),
        normal_ot_pay: money(normalOTPay),
        holiday_ot_pay: money(holidayOTPay),
        allowance_pay: money(allowancePay + extraAllowancePay),
        gross_salary: gross,
        gross_before_adjustment: grossBeforeAdjustment,
        carry_forward_adjustment: carryForwardAdjustment,
        carry_forward_pay: carryForwardPay,
        carry_forward_deduction: carryForwardDeduction,
        carry_forward_note: prevAdj?.label || '',
        finance_recoverable: money(rec.recoverable),
        finance_recovered_before: money(rec.recoveredBefore),
        finance_deposits: money(rec.deposits),
        finance_balance_before: money(rec.balanceBefore),
        deduction_auto: deductionAuto,
        deduction_manual: deductionManual,
        deduction_total: deductionTotal,
        balance_after: balanceAfter,
        net_salary: net,
        wps_basic: wpsBasic,
        wps_ot_allowance: wpsOtAllow,
        remarks,
      };
    });
  };

  const computeWps = () => {
    const [y, mo] = month.split('-').map(Number);
    const lastDay = daysInMonthFn(y, mo);
    const salFrom = `${month}-01`;
    const salTo   = `${month}-${String(lastDay).padStart(2,'0')}`;
    return computeSalarySheet().map(r => ({
      employee_id:    r.employee_id,
      name:           r.name,
      labour_card_no: r.labour_card_no,
      bank_routing:   r.bank_routing,
      iban:           r.iban,
      sal_from: salFrom, sal_to: salTo, days: lastDay,
      basic: r.wps_basic, ot_allow: r.wps_ot_allowance, leave_days: 0,
      salary_type: r.salary_type,
      working_days: r.working_days, normal_ot: r.normal_ot, holiday_ot: r.holiday_ot,
    }));
  };

  const grandTotal = (rows) => rows.reduce((s,r) => s + r.basic + r.ot_allow, 0);

  // ── Export XLS — exactly matching bank template ───────────────────────────
  const exportXls = async () => {
    setGenerating('xls');
    try {
      const XLSXLib = await ensureXlsx();
      const rows  = computeWps();
      const [y, mo] = month.split('-').map(Number);
      const lastDay = daysInMonthFn(y, mo);
      const total   = grandTotal(rows);
      const salMonth = String(mo).padStart(2,'0') + String(y);
      const now = new Date();
      const creationDate = String(now.getDate()).padStart(2,'0') + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + now.getFullYear();
      const timeStr = String(now.getHours()).padStart(2,'0') + '.' + String(now.getMinutes()).padStart(2,'0');

      // Header rows (row 0 = labels, row 1 = arrows)
      const HDR = ['Record Type','Employee  LABOUR CARD NO 14 digit','Bank Routing Code','Employee  IBAN No.','Salary From','Salary To','No. of Days','Basic','Over Time+ Allowance','No. of Leave days','Name'];
      const ARR = HDR.map(() => '↓');
      // EDR rows
      const EDR = rows.map(r => ['EDR', r.labour_card_no, r.bank_routing, r.iban, r.sal_from, r.sal_to, lastDay, r.basic, r.ot_allow, 0, r.name]);
      // Blank separator
      const BLK = new Array(11).fill(null);
      // SCR row
      const SCR = ['SCR', WPS_CO.mol_id, WPS_CO.bank_rout, creationDate, timeStr, salMonth, rows.length, total, 'AED', WPS_CO.name, null];
      // SCR label rows (arrows up + labels)
      const AU  = SCR.map(() => '↑');
      const SLB = ['Record Type','COMP MOL ID','Bank Routing code','File Creation date','Time HHMM','Salary month MMYYYY','Total EMP Count','Total Amount Basic+Allow','Currency','Company Name', null];

      const wsData = [HDR, ARR, ...EDR, BLK, SCR, AU, SLB];
      const ws = XLSXLib.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{wch:12},{wch:24},{wch:18},{wch:28},{wch:12},{wch:12},{wch:10},{wch:14},{wch:20},{wch:18},{wch:38}];
      const wb = XLSXLib.utils.book_new();
      XLSXLib.utils.book_append_sheet(wb, ws, 'WPS');
      XLSXLib.writeFile(wb, `WPS_FILE_-${String(mo).padStart(2,'0')}-${y}.xls`);
    } catch(e) { alert('XLS export failed: ' + e.message); }
    setGenerating('');
  };

  // ── Export PDF via print ──────────────────────────────────────────────────
  const exportPdf = () => {
    const rows  = computeWps();
    const [y, mo] = month.split('-').map(Number);
    const lastDay = daysInMonthFn(y, mo);
    const total   = grandTotal(rows);
    const salMonth = String(mo).padStart(2,'0') + String(y);
    const now = new Date();
    const creationDate = String(now.getDate()).padStart(2,'0') + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + now.getFullYear();
    const timeStr = String(now.getHours()).padStart(2,'0') + '.' + String(now.getMinutes()).padStart(2,'0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthLabel = `${months[mo-1]}-${y}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>WPS_FILE_${salMonth}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 8mm; }
  body { font-family: Arial, sans-serif; font-size: 7.5pt; }
  h3 { text-align:center; font-size:9pt; margin:0 0 6px; }
  table { border-collapse:collapse; width:100%; }
  th { background:#1e293b; color:#fff; padding:4px 5px; font-size:7pt; text-align:center; border:1px solid #555; }
  td { padding:3px 5px; border:1px solid #cbd5e1; }
  .arrow { text-align:center; color:#64748b; font-size:7pt; background:#f8fafc; }
  .edr td { background:#fff; }
  .scr td { background:#f0fdf4; font-weight:bold; }
  .label td { background:#f1f5f9; color:#64748b; font-size:6.5pt; text-align:center; }
  .blank td { border:none; }
  .num { text-align:right; font-family:monospace; }
  .center { text-align:center; }
  .company { font-size:11pt; font-weight:bold; margin-bottom:2px; }
  .summary { border:1px solid #94a3b8; padding:6px 10px; margin-bottom:8px; display:flex; gap:20px; }
  .summary span { font-size:8pt; }
  .summary .big { font-size:10pt; font-weight:bold; color:#166534; }
</style></head><body>
<div class="company">SATCO ARABIA GENERAL CONTRACTING - L.L.C - S.P.C</div>
<div class="summary">
  <span>Salary Month: <strong>${monthLabel}</strong></span>
  <span>Employees: <strong>${rows.length}</strong></span>
  <span>Total: <span class="big">AED ${total.toLocaleString()}</span></span>
  <span>MOL ID: ${WPS_CO.mol_id}</span>
  <span>Created: ${creationDate} ${timeStr}</span>
</div>
<table>
<thead><tr>
  <th>Record Type</th><th>Labour Card No (14 digit)</th><th>Bank Routing Code</th>
  <th>Employee IBAN No.</th><th>Salary From</th><th>Salary To</th>
  <th>No. of Days</th><th>Basic</th><th>OT + Allowance</th><th>Leave Days</th><th>Name</th>
</tr></thead>
<tbody>
<tr class="arrow"><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td class="center">↓</td><td></td></tr>
${rows.map(r => `<tr class="edr">
  <td class="center">EDR</td>
  <td class="center">${r.labour_card_no}</td>
  <td class="center">${r.bank_routing}</td>
  <td>${r.iban}</td>
  <td class="center">${r.sal_from}</td>
  <td class="center">${r.sal_to}</td>
  <td class="center">${lastDay}</td>
  <td class="num">${r.basic.toLocaleString()}</td>
  <td class="num">${r.ot_allow.toLocaleString()}</td>
  <td class="center">0</td>
  <td>${r.name}</td>
</tr>`).join('')}
<tr class="blank"><td colspan="11">&nbsp;</td></tr>
<tr class="scr">
  <td class="center">SCR</td>
  <td class="center">${WPS_CO.mol_id}</td>
  <td class="center">${WPS_CO.bank_rout}</td>
  <td class="center">${creationDate}</td>
  <td class="center">${timeStr}</td>
  <td class="center">${salMonth}</td>
  <td class="num">${rows.length}</td>
  <td class="num">${total.toLocaleString()}</td>
  <td class="center">AED</td>
  <td colspan="2">${WPS_CO.name}</td>
</tr>
<tr class="arrow"><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td class="center">↑</td><td></td></tr>
<tr class="label">
  <td>Record Type</td><td>COMP MOL ID</td><td>Bank Routing code</td>
  <td>File Creation date</td><td>Time HHMM</td><td>Salary month MMYYYY</td>
  <td>Total EMP Count</td><td>Total Amount Basic+Allow</td><td>Currency</td><td colspan="2">Company Name</td>
</tr>
</tbody>
</table>
</body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 400); };
    }
  };

  const salarySheetAoa = () => {
    const rows = computeSalarySheet();
    const [y, mo] = month.split('-').map(Number);
    const lastDay = daysInMonthFn(y, mo);
    const totalGross = rows.reduce((s,r)=>s+r.gross_salary,0);
    const totalDed = rows.reduce((s,r)=>s+r.deduction_total,0);
    const totalNet = rows.reduce((s,r)=>s+r.net_salary,0);
    const totalBalance = rows.reduce((s,r)=>s+r.finance_balance_before,0);
    const totalDeposits = rows.reduce((s,r)=>s+r.finance_deposits,0);
    return [
      [],
      ['Month:', new Date(y, mo-1, 1), 'Month Days', lastDay, '', '', '', '', '', '', '', '', '', '', '', 'TOTAL TO RECOVER', totalBalance, 'DEDUCTION THIS MONTH', totalDed, 'NET WPS', totalNet],
      [],
      ['', '', '', '', '', '', '', 'WORKING DAYS/HOURS', '', '', 'TOTAL AMOUNT', '', '', '', '', '', 'FINANCE RECOVERY', '', '', '', 'Remark'],
      ['Sl no.','EMP CODE','Name of Employee','Craft','Basic Salary','ALLOWANCE','Hourly Rate','Working days / Hours Worked','Contract Hrs/Day','Contract Days/Week','NORMAL OT HRS','HOLIDAYS OT','BASIC / HOURLY PAY','NORMAL OVERTIME (X1.25)','HOLIDAY OVERTIME (X1.5)','ALLOWANCE PAY','Monthly Food Allowance','Food Allowance Pay','GROSS SALARY','Prev Month Adj.','Balance to Recover','Cash Advance & Deductions','Deposits Received','Net Amount / WPS','Remark'],
      ...rows.map(r => [r.sl_no, r.employee_id, r.name, r.craft, r.base_basic, r.base_allowance, r.hourly_rate, r.is_hourly ? r.hours_worked : r.working_days, r.hours_per_day, r.contract_days_per_week, r.normal_ot, r.holiday_ot, r.basic_pay, r.normal_ot_pay, r.holiday_ot_pay, r.allowance_pay, r.food_allowance, r.food_allowance_pay, r.gross_salary, r.carry_forward_adjustment, r.finance_balance_before, r.deduction_total, r.finance_deposits, r.net_salary, [r.remarks, r.carry_forward_note].filter(Boolean).join(' | ')]),
      ['Total Salaries','','','','','','','','','','','', rows.reduce((s,r)=>s+r.basic_pay,0), rows.reduce((s,r)=>s+r.normal_ot_pay,0), rows.reduce((s,r)=>s+r.holiday_ot_pay,0), rows.reduce((s,r)=>s+r.allowance_pay,0), rows.reduce((s,r)=>s+r.food_allowance,0), rows.reduce((s,r)=>s+r.food_allowance_pay,0), totalGross, rows.reduce((s,r)=>s+(r.carry_forward_adjustment||0),0), totalBalance, totalDed, totalDeposits, totalNet, ''],
      [],
      ['', '', 'Summary', WPS_CO.name],
      ['', '', 'Gross Salary with Allowances', totalGross],
      ['', '', 'Previous Month Adjustments', rows.reduce((s,r)=>s+(r.carry_forward_adjustment||0),0)],
      ['', '', 'Deductions / Recoveries', totalDed],
      ['', '', 'Deposits received in Finance (already recovered)', totalDeposits],
      ['', '', 'Net WPS / Bank Amount', totalNet],
    ];
  };

  const exportSalarySheetXls = async () => {
    setGenerating('salary_xls');
    try {
      const XLSXLib = await ensureXlsx();
      const [y, mo] = month.split('-').map(Number);
      const ws = XLSXLib.utils.aoa_to_sheet(salarySheetAoa());
      ws['!cols'] = [
        {wch:8},{wch:12},{wch:28},{wch:22},{wch:14},{wch:14},{wch:12},{wch:18},{wch:10},{wch:14},{wch:14},
        {wch:18},{wch:12},{wch:12},{wch:18},{wch:18},{wch:18},{wch:14},{wch:16},{wch:16},{wch:14},{wch:16},{wch:18},{wch:18},{wch:16},{wch:16},{wch:30}
      ];
      const wb = XLSXLib.utils.book_new();
      XLSXLib.utils.book_append_sheet(wb, ws, 'Salary Sheet');
      XLSXLib.writeFile(wb, `SALARY_SHEET_${String(mo).padStart(2,'0')}-${y}.xlsx`);
    } catch(e) { alert('Salary Sheet XLS export failed: ' + e.message); }
    setGenerating('');
  };

  const salarySheetHtml = () => {
    const rows = computeSalarySheet();
    const [y, mo] = month.split('-').map(Number);
    const lastDay = daysInMonthFn(y, mo);
    const monthFull = new Date(y,mo-1,1).toLocaleString('en-GB',{month:'long',year:'numeric'});
    const totalGross = rows.reduce((s,r)=>s+r.gross_salary,0);
    const totalDed = rows.reduce((s,r)=>s+r.deduction_total,0);
    const totalNet = rows.reduce((s,r)=>s+r.net_salary,0);
    const totalBalance = rows.reduce((s,r)=>s+r.finance_balance_before,0);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Salary Sheet ${monthFull}</title>
<style>
  @page { size:A4 landscape; margin:8mm; }
  body { font-family:Arial,sans-serif; font-size:7.5pt; color:#0f172a; }
  h2 { margin:0 0 4px; font-size:12pt; }
  .meta { display:flex; gap:16px; margin:6px 0 8px; padding:6px 8px; border:1px solid #94a3b8; background:#f8fafc; }
  .meta strong { color:#0f172a; }
  table { border-collapse:collapse; width:100%; }
  th { background:#1e293b; color:#fff; padding:4px; border:1px solid #475569; font-size:6.5pt; }
  td { padding:3px 4px; border:1px solid #cbd5e1; vertical-align:top; }
  .num { text-align:right; font-family:monospace; }
  .center { text-align:center; }
  .total td { background:#0f172a; color:#fff; font-weight:bold; }
  .ded { color:#dc2626; font-weight:bold; }
  .net { color:#166534; font-weight:bold; }
</style></head><body>
<h2>${esc(WPS_CO.name)} — Salary Sheet</h2>
<div class="meta">
  <span>Month: <strong>${esc(monthFull)}</strong></span>
  <span>Month Days: <strong>${lastDay}</strong></span>
  <span>Employees: <strong>${rows.length}</strong></span>
  <span>Total to Recover before this month: <strong>AED ${fmt(totalBalance)}</strong></span>
  <span>Deduction this month: <strong>AED ${fmt(totalDed)}</strong></span>
  <span>Net WPS: <strong>AED ${fmt(totalNet)}</strong></span>
</div>
<table>
<thead><tr>
  <th>Sl</th><th>Emp Code</th><th>Name</th><th>Craft</th><th>Basic Salary</th><th>Allowance</th><th>Hourly Rate</th>
  <th>Working Days / Hours</th><th>Contract Hrs/Day</th><th>Days/Week</th><th>Normal OT</th><th>Holiday OT</th>
  <th>Basic</th><th>Normal OT Pay</th><th>Holiday OT Pay</th><th>Allowance Pay</th><th>Monthly Food</th><th>Food Pay</th>
  <th>Gross Salary</th><th>Prev Month Adj.</th><th>Balance to Recover</th><th>Deductions</th><th>Deposits</th><th>Net Amount / WPS</th><th>Remark</th>
</tr></thead>
<tbody>
${rows.map(r=>`<tr>
  <td class="center">${r.sl_no}</td><td>${esc(r.employee_id)}</td><td>${esc(r.name)}</td><td>${esc(r.craft)}</td>
  <td class="num">${fmt(r.base_basic)}</td><td class="num">${fmt(r.base_allowance)}</td><td class="num">${fmt(r.hourly_rate)}</td><td class="num">${fmt(r.is_hourly ? r.hours_worked : r.working_days)}</td><td class="num">${fmt(r.hours_per_day)}</td><td class="num">${fmt(r.contract_days_per_week)}</td>
  <td class="num">${fmt(r.normal_ot)}</td><td class="num">${fmt(r.holiday_ot)}</td>
  <td class="num">${fmt(r.basic_pay)}</td><td class="num">${fmt(r.normal_ot_pay)}</td><td class="num">${fmt(r.holiday_ot_pay)}</td>
  <td class="num">${fmt(r.allowance_pay)}</td><td class="num">${fmt(r.food_allowance)}</td><td class="num">${fmt(r.food_allowance_pay)}</td><td class="num">${fmt(r.gross_salary)}</td>
  <td class="num">${r.carry_forward_adjustment ? (r.carry_forward_adjustment>0?'+':'-') + fmt(Math.abs(r.carry_forward_adjustment)) : ''}</td><td class="num">${fmt(r.finance_balance_before)}</td><td class="num ded">${r.deduction_total>0?'-':''}${fmt(r.deduction_total)}</td>
  <td class="num">${fmt(r.finance_deposits)}</td><td class="num net">${fmt(r.net_salary)}</td><td>${esc([r.remarks, r.carry_forward_note].filter(Boolean).join(' | '))}</td>
</tr>`).join('')}
<tr class="total">
  <td colspan="12">TOTAL — ${rows.length} employees</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.basic_pay,0))}</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.normal_ot_pay,0))}</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.holiday_ot_pay,0))}</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.allowance_pay,0))}</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.food_allowance,0))}</td>
  <td class="num">${fmt(rows.reduce((s,r)=>s+r.food_allowance_pay,0))}</td>
  <td class="num">${fmt(totalGross)}</td><td class="num">${fmt(rows.reduce((s,r)=>s+(r.carry_forward_adjustment||0),0))}</td><td class="num">${fmt(totalBalance)}</td><td class="num">${fmt(totalDed)}</td><td></td><td class="num">${fmt(totalNet)}</td><td></td>
</tr>
</tbody></table></body></html>`;
  };

  const exportSalarySheetPdf = () => {
    const html = salarySheetHtml();
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.onload = () => { setTimeout(()=>{ win.print(); URL.revokeObjectURL(url); }, 400); };
  };

  const saveSalarySheet = async () => {
    const rows = computeSalarySheet();
    if (!rows.length) return alert('No active WPS employees found.');
    setSavingSheet(true);
    const salaryMonth = firstOfMonth(month);
    const salaryPayload = rows.map(r => ({
      employee_id:r.employee_id, full_name:r.name, labour_card_no:r.labour_card_no, bank_routing:r.bank_routing, iban:r.iban, salary_month:salaryMonth, salary_type:r.salary_type,
      basic_salary:r.base_basic, fixed_allowance:r.base_allowance, hourly_rate:r.hourly_rate, hours_per_day:r.hours_per_day, contract_days_per_week:r.contract_days_per_week,
      working_days:r.working_days, hours_worked:r.hours_worked, normal_ot_hours:r.normal_ot, holiday_ot_hours:r.holiday_ot,
      extra_allowance:r.extra_allowance, overtime_amount:r.overtime_amount, food_allowance:r.food_allowance, food_allowance_pay:r.food_allowance_pay,
      hourly_pay:r.hourly_pay, basic_pay:r.basic_pay, normal_ot_pay:r.normal_ot_pay, holiday_ot_pay:r.holiday_ot_pay,
      allowance_pay:r.allowance_pay, gross_salary:r.gross_salary,
      finance_recoverable:r.finance_recoverable, finance_recovered_before:r.finance_recovered_before,
      finance_deposits:r.finance_deposits, finance_balance_before:r.finance_balance_before,
      deduction_auto:money(r.deduction_auto + r.carry_forward_deduction), deduction_manual:r.deduction_manual, deduction_total:r.deduction_total,
      net_salary:r.net_salary, wps_basic:r.wps_basic, wps_ot_allowance:r.wps_ot_allowance,
      remarks:[r.remarks, r.carry_forward_note].filter(Boolean).join(' | ') || null, saved_to_monthly_costs:true, updated_at:new Date().toISOString(),
    }));

    const monthlyPayload = rows.map(r => ({
      employee_id:r.employee_id, full_name:r.name, month:salaryMonth,
      salary_type:'wps_salary_sheet', salary:r.gross_salary,
      food:r.food_allowance_pay || 0, food_allowance_pay:r.food_allowance_pay || 0, accommodation:0, transport:0, other:0,
      remarks:([r.remarks, r.carry_forward_note, 'Saved from Portal WPS Salary Sheet. Net WPS: AED ' + fmt(r.net_salary)].filter(Boolean).join(' | ')),
      salary_deductions:r.deduction_total,
      hours_worked:r.hours_worked || 0, hourly_rate:r.hourly_rate || 0,
      basic_salary:r.base_basic, fixed_allowance:r.base_allowance, hours_per_day:r.hours_per_day, contract_days_per_week:r.contract_days_per_week,
      working_days:r.working_days, month_days:daysInMonthFn(...month.split('-').map(Number)),
      normal_ot_hours:r.normal_ot, holiday_ot_hours:r.holiday_ot,
      computed_salary:r.gross_salary, manual_override:false, recurring_allowance_total:0,
    }));

    const s = await db.from('wps_salary_monthly').upsert(salaryPayload, { onConflict:'employee_id,salary_month' });
    if (s.error) {
      setSavingSheet(false);
      if (s.error.code === '42P01' || /wps_salary_monthly/i.test(s.error.message||'')) {
        setSheetReady(false); setShowSql(true);
        return alert('WPS monthly salary sheet table is missing. Run the setup SQL shown on this page.');
      }
      return alert(s.error.message);
    }
    const m = await db.from('employee_monthly_costs').upsert(monthlyPayload, { onConflict:'employee_id,month' });
    setSavingSheet(false);
    if (m.error) return alert('Salary sheet saved, but P&L monthly sync failed: ' + m.error.message);
    clearLocalDraft(month);
    setOverrides({});
    await loadMonthlySheet();
    await loadRecoveryContext();
    alert('Salary Sheet saved. Monthly deductions are now reflected in P&L recovery balance.');
  };

  // ── Generate Bank Letter (HTML → Print as PDF) ────────────────────────────
  const exportLetter = () => {
    const rows  = computeWps();
    const [y, mo] = month.split('-').map(Number);
    const total = grandTotal(rows);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthLong = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthLabel = `${months[mo-1]}-${y}`;
    const monthFull  = `${monthLong[mo-1]}-${y}`;
    const wordsAmount = numToWordsAED(total);
    // Format total as comma-separated
    const fmtTotal = total.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>WPS Letter ${monthLabel}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 20mm 15mm 20mm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #1a3a6b; padding-bottom: 10px; }
  .logo-text { font-size: 18pt; font-weight: bold; color: #1a3a6b; }
  .logo-sub  { font-size: 8pt; color: #555; letter-spacing: 1px; }
  .arabic    { text-align: right; font-size: 12pt; color: #1a3a6b; direction: rtl; }
  .date-line { text-align: right; margin-bottom: 20px; }
  .addr-block p { margin: 2px 0; }
  .subject { text-align: center; font-weight: bold; text-decoration: underline; margin: 25px 0 15px; font-size: 11.5pt; }
  .body-para { margin-bottom: 14px; text-align: justify; }
  .sign-block { margin-top: 50px; }
  .sign-line  { border-bottom: 1px solid #000; width: 180px; margin-bottom: 4px; height: 40px; }
  .footer-rule { border-top: 1px solid #aaa; margin-top: 40px; padding-top: 6px; font-size: 7.5pt; color: #555; text-align: center; }
  strong.underline { text-decoration: underline; }

</style>
</head><body>
<div class="header">
  <div>
    <div class="logo-text">SATCO Arabia<span style="font-size:8pt;font-weight:normal;color:#555"> General Contracting - L.L.C - S.P.C</span></div>
    <div class="logo-sub">INFINITE POSSIBILITIES</div>
  </div>
  <div class="arabic">
    ساتكـو العـربيـه<br>
    <span style="font-size:9pt">للمقاولات العامة - ذ.م.م - ش.ش.و</span>
  </div>
</div>

<div class="date-line">Date: ${letterDate}</div>

<div class="addr-block">
  <p>The Asst. General Manager,</p>
  <p>${bankName},</p>
  <p>${bankAddr}</p>
</div>

<p>Dear Sir,</p>

<div class="subject">Subject: &nbsp; WPS Salary Transfer for the Month of ${monthFull}</div>

<div class="body-para">
Kindly arrange to transfer the Sum of <strong>AED &nbsp; ${fmtTotal}/- (AED – ${wordsAmount})</strong> to ${rows.length.toString().padStart(2,'0')} Employees account as per attached list on <strong class="underline">DTD ${dtdDate}</strong> from debit of our Company's account <strong class="underline">${acctNo}.</strong>
</div>

<div class="sign-block">
  <p>Yours faithfully,</p>
  <div class="sign-line"></div>
  <p><strong>${signatory}</strong></p>
  <p>(${sigTitle})</p>
</div>

<div class="footer-rule">
  Tel.: 02 551 9162, Fax: 02 551 9163, P.O. Box: 92654, Abu Dhabi - U.A.E &nbsp;&nbsp; أبوظبي – أ.ع.م
</div>
</body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 400); };
    }
  };

  // ── Override setter ───────────────────────────────────────────────────────
  const setOv = (empId, key, val) =>
    setOverrides(prev => {
      const next = { ...prev, [empId]: { ...(prev[empId]||{}), [key]: val } };
      writeLocalDraft(month, next);
      return next;
    });

  // ── Derived ───────────────────────────────────────────────────────────────
  const [y, mo] = month.split('-').map(Number);
  const lastDayOfMonth = daysInMonthFn(y, mo);
  const salaryRows     = computeSalarySheet();
  const previewRows    = computeWps();
  const total          = grandTotal(previewRows);
  const activeMaster   = master.filter(m => m.active !== false);
  const months         = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabel     = `${months[mo-1]}-${y}`;
  const missingData    = salaryRows.filter(r => !r.labour_card_no || !r.bank_routing || !r.iban || (r.is_hourly && !r.hourly_rate));
  const sheetTotals    = {
    recoverable: salaryRows.reduce((s,r)=>s+r.finance_recoverable,0),
    recoveredBefore: salaryRows.reduce((s,r)=>s+r.finance_recovered_before,0),
    deposits: salaryRows.reduce((s,r)=>s+r.finance_deposits,0),
    balanceBefore: salaryRows.reduce((s,r)=>s+r.finance_balance_before,0),
    carryPay: salaryRows.reduce((s,r)=>s+(r.carry_forward_pay||0),0),
    carryDeduction: salaryRows.reduce((s,r)=>s+(r.carry_forward_deduction||0),0),
    deduction: salaryRows.reduce((s,r)=>s+r.deduction_total,0),
    balanceAfter: salaryRows.reduce((s,r)=>s+r.balance_after,0),
    gross: salaryRows.reduce((s,r)=>s+r.gross_salary,0),
    net: salaryRows.reduce((s,r)=>s+r.net_salary,0),
  };

  // Table-not-ready banner
  if (tableReady === false || sheetReady === false) {
    return (
      <div style={S.card}>
        <div style={{padding:'20px'}}>
          <div style={{fontWeight:800,fontSize:'15px',color:'#0f172a',marginBottom:'4px'}}>📋 WPS Report — One-time Setup Required</div>
          <div style={{fontSize:'12.5px',color:'#64748b',marginBottom:'14px'}}>The <code>wps_employee_master</code> / <code>wps_salary_monthly</code> setup is not complete. Run this SQL once in your <strong>Finance Supabase → SQL Editor</strong>, then refresh.</div>
          <pre style={{background:'#1e293b',color:'#f8fafc',padding:'14px 16px',borderRadius:'8px',fontSize:'11px',overflowX:'auto',whiteSpace:'pre',margin:'0 0 14px'}}>{WPS_SQL}</pre>
          <button style={S.btnPri} onClick={loadMaster}>Check Again</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Section toggle */}
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        {[['generate','📋 Salary Sheet / WPS'],['letter','✉️ Bank Letter'],['master','👥 Employee WPS Master']].map(([k,l]) => (
          <button key={k} onClick={() => setActiveSection(k)}
            style={{padding:'9px 16px',borderRadius:'8px',border:'1px solid '+(activeSection===k?'#0f172a':'#e2e8f0'),
              background:activeSection===k?'#0f172a':'#fff',color:activeSection===k?'#fff':'#475569',fontWeight:700,fontSize:'13px',cursor:'pointer'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION A: GENERATE WPS REPORT                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSection === 'generate' && (
        <div style={S.card}>
          {/* Header row */}
          <div style={{padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
            <div>
              <div style={{fontWeight:800,fontSize:'14px'}}>{WPS_CO.name}</div>
              <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>MOL ID: {WPS_CO.mol_id} · {activeMaster.length} active employees</div>
            </div>
            <div style={{display:'flex',gap:'8px',alignItems:'flex-end',flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Salary Month</div>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  style={{...S.input,width:'170px',fontWeight:700}} />
              </div>
              <button style={{...S.btnPri,background:'#0f766e'}} disabled={savingSheet} onClick={saveSalarySheet}>
                {savingSheet?'Saving…':'💾 Save Salary Sheet'}
              </button>
              <input type="file" id="wps-import-bank" accept=".xls,.xlsx" style={{display:'none'}} onChange={e=>{importSalaryOrWpsExcel(e.target.files && e.target.files[0], 'bank_wps'); e.target.value='';}} />
              <label htmlFor="wps-import-bank" style={{...S.btnPri,background:'#7c3aed',cursor:'pointer',opacity:importingFile?0.6:1}}>
                {importingFile?'Importing…':'⬆ Import Bank WPS Excel'}
              </label>
              <input type="file" id="wps-import-salary" accept=".xls,.xlsx" style={{display:'none'}} onChange={e=>{importSalaryOrWpsExcel(e.target.files && e.target.files[0], 'internal_salary_sheet'); e.target.value='';}} />
              <label htmlFor="wps-import-salary" style={{...S.btnPri,background:'#0ea5e9',cursor:'pointer',opacity:importingFile?0.6:1}}>
                {importingFile?'Importing…':'⬆ Import HR Salary Excel'}
              </label>
              <button style={{...S.btnPri,background:'#166534'}} disabled={!!generating} onClick={exportSalarySheetXls}>
                {generating==='salary_xls'?'Generating…':'⬇ Salary Sheet XLS'}
              </button>
              <button style={{...S.btnPri,background:'#475569'}} onClick={exportSalarySheetPdf}>
                🖨 Salary Sheet PDF
              </button>
              <button style={{...S.btnPri,background:'#14532d'}} disabled={!!generating} onClick={exportXls}>
                {generating==='xls'?'Generating…':'⬇ WPS XLS'}
              </button>
              <button style={{...S.btnPri,background:'#1e40af'}} onClick={exportPdf}>
                🖨 WPS PDF
              </button>
            </div>
          </div>

          <div style={{padding:'12px 18px',borderBottom:'1px solid #e2e8f0',background:'#eff6ff',fontSize:'12.5px',color:'#1e3a8a',lineHeight:1.55}}>
            <strong>Simple payroll flow:</strong> The portal is the main system. Step 1 — by the 28th generate the <strong>Portal WPS Salary Sheet</strong> from employee master salary plus approved previous-month arrears/recoveries, then send the bank WPS on the 1st. Step 2 — after the client timesheet arrives, review the actual salary in <strong>Salary Pipeline</strong> and save it. The difference automatically appears as next month arrears or recovery. Excel import remains available for any month when HR needs to upload an already-prepared WPS or salary sheet.
          </div>

          {/* Summary banner */}
          <div style={{padding:'12px 18px',borderBottom:'1px solid #e2e8f0',background:'#f0fdf4',display:'flex',gap:'22px',flexWrap:'wrap',alignItems:'center'}}>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Month</div><div style={{fontSize:'16px',fontWeight:800}}>{monthLabel}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Employees</div><div style={{fontSize:'16px',fontWeight:800}}>{salaryRows.length}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Gross Salary Sheet</div><div style={{fontSize:'18px',fontWeight:800}}>AED {fmt(sheetTotals.gross)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Prev. Arrears Added</div><div style={{fontSize:'16px',fontWeight:800,color:'#166534'}}>AED {fmt(sheetTotals.carryPay)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#dc2626',textTransform:'uppercase'}}>Prev. Recovery Added</div><div style={{fontSize:'16px',fontWeight:800,color:'#dc2626'}}>AED {fmt(sheetTotals.carryDeduction)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#92400e',textTransform:'uppercase'}}>Total to Recover</div><div style={{fontSize:'18px',fontWeight:800,color:'#92400e'}}>AED {fmt(sheetTotals.balanceBefore)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Deposits Received</div><div style={{fontSize:'16px',fontWeight:800,color:'#166534'}}>AED {fmt(sheetTotals.deposits)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#dc2626',textTransform:'uppercase'}}>Deduction This Month</div><div style={{fontSize:'18px',fontWeight:800,color:'#dc2626'}}>AED {fmt(sheetTotals.deduction)}</div></div>
            <div><div style={{fontSize:'10px',fontWeight:700,color:'#166534',textTransform:'uppercase'}}>Net WPS Amount</div><div style={{fontSize:'20px',fontWeight:800,color:'#166534'}}>AED {fmt(sheetTotals.net)}</div></div>
            {missingData.length > 0 && (
              <div style={{marginLeft:'auto',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'6px',padding:'6px 12px',fontSize:'12px',color:'#991b1b',fontWeight:700}}>
                ⚠️ {missingData.length} employee(s) missing Labour Card / Bank Routing / IBAN / Hourly Rate
              </div>
            )}
          </div>

          <div style={{padding:'8px 18px',borderBottom:'1px solid #e2e8f0',background:'#fff7ed',fontSize:'11.5px',color:'#92400e'}}>
            Master data such as Labour Card, Bank Routing, IBAN, Basic Salary, Allowance and Contract Hours/Day is taken from <strong>Employee WPS Master</strong>. For the bank WPS, keep it simple: Basic + Allowance plus previous-month arrears, minus previous-month recovery / visa / advance deductions. Actual hours and OT are handled later in <strong>Salary Pipeline</strong>. If any master entry is wrong, click <strong>Correct Master</strong>, edit it once, then save again. {hasUnsavedDraft && <strong style={{marginLeft:'8px',color:'#dc2626'}}>Unsaved entries are temporarily kept on this browser — click Save Salary Sheet to store in database.</strong>}
          </div>

          {/* Salary Sheet table */}
          <div className="drag-scroll" style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px',minWidth:'2180px'}}>
              <thead>
                <tr style={{background:'#f8fafc'}}>
                  {['Sl','Employee','Craft','Basic Salary','Allowance','Hourly Rate','Working Days / Hours','Contract Hrs/Day','Days/Wk','Normal OT hrs','Holiday OT hrs','Basic / Hourly Pay','Normal OT Pay','Holiday OT Pay','Allowance Pay','Monthly Food Allow.','Food Allow. Pay','Gross Salary','Prev Month Adj.','Balance to Recover','Deduction This Month','Deposits Received','Balance After','Net WPS','Remarks'].map(h => (
                    <th key={h} style={{...S.th,whiteSpace:'nowrap',fontSize:'10.5px'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={25} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                ) : activeMaster.length === 0 ? (
                  <tr><td colSpan={25} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>
                    No active employees. Go to <strong>Employee WPS Master</strong> and add employees.
                  </td></tr>
                ) : salaryRows.map(r => {
                  const ov = overrides[r.employee_id] || {};
                  const isVar = r.salary_type === 'variable';
                  const isHourly = !!r.is_hourly;
                  const missing  = !r.labour_card_no || !r.bank_routing || !r.iban || (r.is_hourly && !r.hourly_rate);
                  return (
                    <tr key={r.employee_id} style={{borderTop:'1px solid #f1f5f9',background:missing?'#fff7f7':'#fff'}} className="hr-row">
                      <td style={{...S.td,textAlign:'center',fontWeight:700}}>{r.sl_no}</td>
                      <td style={S.td}>
                        <div style={{fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb',fontSize:'11px'}}>{r.employee_id}</div>
                        <div style={{fontWeight:600,color:'#0f172a',fontSize:'12px'}}>{r.name}</div>
                        {isHourly && <div style={{fontSize:'10px',fontWeight:800,color:'#0369a1'}}>Hourly contract — pay by actual hours</div>}
                        <button type="button" onClick={() => openMasterCorrection(r.employee_id)}
                          style={{marginTop:'4px',padding:'2px 7px',border:'1px solid #bfdbfe',background:'#eff6ff',color:'#1d4ed8',borderRadius:'999px',fontSize:'10px',fontWeight:800,cursor:'pointer'}}>
                          Correct Master
                        </button>
                        {missing && <div style={{fontSize:'10px',color:'#dc2626',fontWeight:700}}>
                          ⚠{!r.labour_card_no?' No Labour Card':''}{!r.bank_routing?' No Bank Routing':''}{!r.iban?' No IBAN':''}{(r.is_hourly && !r.hourly_rate)?' No Hourly Rate':''}
                        </div>}
                      </td>
                      <td style={{...S.tdWrap,minWidth:'150px'}}>{r.craft||'—'}</td>
                      <td style={{...S.td,fontWeight:700,textAlign:'right'}}>{fmt(r.base_basic)}{isHourly && <div style={{fontSize:'10px',color:'#64748b'}}>dummy basic</div>}</td>
                      <td style={{...S.td,textAlign:'right'}}>{fmt(r.base_allowance)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:isHourly?800:500,color:isHourly?'#0369a1':'#94a3b8'}}>{isHourly ? fmt(r.hourly_rate) : '—'}</td>
                      <td style={S.td}>
                        <input type="number" value={isHourly ? (ov.hours_worked ?? r.hours_worked ?? '') : (ov.working_days ?? r.working_days ?? '')} placeholder={isHourly ? 'hours' : lastDayOfMonth}
                          onChange={e=>setOv(r.employee_id, isHourly ? 'hours_worked' : 'working_days', e.target.value)}
                          style={{...S.input,width:'78px',padding:'3px 5px',fontSize:'11.5px',borderColor:isHourly?'#7dd3fc':'#cbd5e1',fontWeight:isHourly?800:500}}/>
                        <div style={{fontSize:'10px',color:'#64748b'}}>{isHourly ? 'regular hrs' : 'days'}</div>
                      </td>
                      <td style={S.td}>
                        <input type="number" step="0.5" value={ov.hours_per_day ?? r.hours_per_day ?? 8} placeholder="8"
                          onChange={e=>setOv(r.employee_id,'hours_per_day',e.target.value)}
                          style={{...S.input,width:'70px',padding:'3px 5px',fontSize:'11.5px',borderColor:isHourly?'#7dd3fc':'#cbd5e1'}}/>
                        <div style={{fontSize:'10px',color:'#64748b'}}>contract hrs/day</div>
                      </td>
                      <td style={S.td}>
                        <input type="number" step="0.5" value={ov.contract_days_per_week ?? r.contract_days_per_week ?? 6} placeholder="6"
                          onChange={e=>setOv(r.employee_id,'contract_days_per_week',e.target.value)}
                          style={{...S.input,width:'62px',padding:'3px 5px',fontSize:'11.5px'}}/>
                        <div style={{fontSize:'10px',color:'#64748b'}}>days/week</div>
                      </td>
                      <td style={S.td}>
                        <input type="number" value={ov.normal_ot_hours ?? r.normal_ot ?? ''} placeholder="0"
                          onChange={e=>setOv(r.employee_id,'normal_ot_hours',e.target.value)}
                          style={{...S.input,width:'72px',padding:'3px 5px',fontSize:'11.5px'}}/>
                      </td>
                      <td style={S.td}>
                        <input type="number" value={ov.holiday_ot_hours ?? r.holiday_ot ?? ''} placeholder="0"
                          onChange={e=>setOv(r.employee_id,'holiday_ot_hours',e.target.value)}
                          style={{...S.input,width:'72px',padding:'3px 5px',fontSize:'11.5px'}}/>
                      </td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700}}>{fmt(r.basic_pay)}</td>
                      <td style={{...S.td,textAlign:'right'}}>{fmt(r.normal_ot_pay)}</td>
                      <td style={{...S.td,textAlign:'right'}}>{fmt(r.holiday_ot_pay)}</td>
                      <td style={{...S.td,textAlign:'right'}}>{fmt(r.allowance_pay)}</td>
                      <td style={S.td}>
                        <input type="number" value={ov.food_allowance ?? r.food_allowance ?? ''} placeholder="0"
                          onChange={e=>setOv(r.employee_id,'food_allowance',e.target.value)}
                          style={{...S.input,width:'82px',padding:'3px 5px',fontSize:'11.5px'}}/>
                        <div style={{fontSize:'10px',color:'#64748b'}}>monthly amount</div>
                      </td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700}}>{fmt(r.food_allowance_pay)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:800,color:'#0f172a'}}>{fmt(r.gross_salary)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:800,color:r.carry_forward_adjustment>0?'#166534':r.carry_forward_adjustment<0?'#dc2626':'#94a3b8'}}>
                        {r.carry_forward_adjustment ? (r.carry_forward_adjustment>0?'+':'−') + fmt(Math.abs(r.carry_forward_adjustment)) : '—'}
                        {r.carry_forward_note && <div style={{fontSize:'10px',color:'#64748b',fontWeight:600}}>{r.carry_forward_note}</div>}
                      </td>
                      <td style={{...S.td,textAlign:'right',fontWeight:800,color:r.finance_balance_before>0?'#92400e':'#94a3b8'}}>
                        {fmt(r.finance_balance_before)}
                        {r.finance_recoverable>0 && <div style={{fontSize:'10px',color:'#64748b'}}>Recov. {fmt(r.finance_recoverable)} · Done {fmt(r.finance_recovered_before)}</div>}
                      </td>
                      <td style={S.td}>
                        <input type="number" value={ov.deduction_manual ?? r.deduction_manual ?? ''} placeholder="0"
                          onChange={e=>setOv(r.employee_id,'deduction_manual',e.target.value)}
                          style={{...S.input,width:'92px',padding:'3px 5px',fontSize:'11.5px',borderColor:r.deduction_total>0?'#fca5a5':'#cbd5e1',color:'#dc2626',fontWeight:700}}/>
                        {r.deduction_total>0 && <div style={{fontSize:'10px',color:'#dc2626',fontWeight:700}}>− AED {fmt(r.deduction_total)}</div>}
                      </td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#166534'}}>{fmt(r.finance_deposits)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:r.balance_after>0?'#92400e':'#94a3b8'}}>{fmt(r.balance_after)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:900,color:'#166534'}}>{fmt(r.net_salary)}</td>
                      <td style={S.td}>
                        <input value={ov.remarks ?? r.remarks ?? ''} placeholder="Remark"
                          onChange={e=>setOv(r.employee_id,'remarks',e.target.value)}
                          style={{...S.input,width:'170px',padding:'3px 5px',fontSize:'11.5px'}}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {salaryRows.length > 0 && (
                <tfoot>
                  <tr style={{background:'#0f172a',color:'#fff'}}>
                    <td style={{padding:'10px 14px',fontWeight:800,fontSize:'12px'}} colSpan={11}>TOTAL — {salaryRows.length} employees</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.basic_pay,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.normal_ot_pay,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.holiday_ot_pay,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.allowance_pay,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.food_allowance,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(salaryRows.reduce((s,r)=>s+r.food_allowance_pay,0))}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right'}}>{fmt(sheetTotals.gross)}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right',color:'#bfdbfe'}}>+{fmt(sheetTotals.carryPay)} / −{fmt(sheetTotals.carryDeduction)}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right',color:'#fdba74'}}>{fmt(sheetTotals.balanceBefore)}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right',color:'#fca5a5'}}>{fmt(sheetTotals.deduction)}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right',color:'#86efac'}}>{fmt(sheetTotals.deposits)}</td>
                    <td style={{padding:'10px 14px',fontWeight:800,textAlign:'right',color:'#fdba74'}}>{fmt(sheetTotals.balanceAfter)}</td>
                    <td style={{padding:'10px 14px',fontWeight:900,textAlign:'right',color:'#86efac',fontSize:'14px'}}>AED {fmt(sheetTotals.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* SCR preview */}
          {previewRows.length > 0 && (
            <div style={{padding:'10px 18px',borderTop:'2px solid #e2e8f0',background:'#f8fafc',fontSize:'11.5px',color:'#334155',display:'flex',gap:'18px',flexWrap:'wrap'}}>
              <span><strong>SCR — Salary Month:</strong> {String(mo).padStart(2,'0')}{y}</span>
              <span><strong>Emp Count:</strong> {previewRows.length}</span>
              <span><strong>Total:</strong> AED {total.toLocaleString()}</span>
              <span><strong>Currency:</strong> AED</span>
              <span><strong>MOL ID:</strong> {WPS_CO.mol_id}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION B: BANK LETTER                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSection === 'letter' && (
        <div style={S.card}>
          <div style={{padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
            <div>
              <div style={{fontWeight:800,fontSize:'14px'}}>✉️ WPS Bank Letter</div>
              <div style={{fontSize:'12px',color:'#64748b'}}>Edit fields below, then print / save as PDF</div>
            </div>
            <button style={{...S.btnPri,background:'#1e40af'}} onClick={exportLetter}>🖨 Print / Save PDF</button>
          </div>

          {/* Editable fields */}
          <div style={{padding:'16px 18px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
            <div style={{fontWeight:800,fontSize:'12.5px',color:'#92400e',marginBottom:'12px'}}>Letter Details — edit before printing</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'10px'}}>
              <div>
                <label style={S.label}>Letter Date</label>
                <input value={letterDate} onChange={e=>setLetterDate(e.target.value)} placeholder="DD.MM.YYYY" style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>DTD Date (Transfer Date)</label>
                <input value={dtdDate} onChange={e=>setDtdDate(e.target.value)} placeholder="DD.MM.YYYY" style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>Bank Name</label>
                <input value={bankName} onChange={e=>setBankName(e.target.value)} style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>Bank Branch</label>
                <input value={bankAddr} onChange={e=>setBankAddr(e.target.value)} style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>Company Account No</label>
                <input value={acctNo} onChange={e=>setAcctNo(e.target.value)} style={{...S.input,width:'100%',fontFamily:'ui-monospace,monospace'}}/>
              </div>
              <div>
                <label style={S.label}>Signatory Name</label>
                <input value={signatory} onChange={e=>setSignatory(e.target.value)} style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>Signatory Title</label>
                <input value={sigTitle} onChange={e=>setSigTitle(e.target.value)} style={{...S.input,width:'100%'}}/>
              </div>
            </div>
          </div>

          {/* Letter preview */}
          {(() => {
            const rows  = computeWps();
            const [ly, lmo] = month.split('-').map(Number);
            const total = grandTotal(rows);
            const monthLong = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const monthFull  = `${monthLong[lmo-1]}-${ly}`;
            const fmtTotal = total.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
            const wordsAmount = numToWordsAED(total);
            return (
              <div style={{padding:'24px 32px',maxWidth:'680px',margin:'20px auto',border:'1px solid #cbd5e1',borderRadius:'8px',fontFamily:'Arial,sans-serif',fontSize:'11pt',lineHeight:'1.6',background:'#fff'}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px',paddingBottom:'10px',borderBottom:'2px solid #1a3a6b'}}>
                  <div>
                    <div style={{fontSize:'15pt',fontWeight:'bold',color:'#1a3a6b'}}>SATCO Arabia <span style={{fontSize:'7pt',fontWeight:'normal',color:'#555'}}>General Contracting - L.L.C - S.P.C</span></div>
                    <div style={{fontSize:'7pt',color:'#555',letterSpacing:'1px'}}>INFINITE POSSIBILITIES</div>
                  </div>
                  <div style={{textAlign:'right',direction:'rtl',fontSize:'10pt',color:'#1a3a6b'}}>
                    ساتكـو العـربيـه<br/><span style={{fontSize:'8pt'}}>للمقاولات العامة - ذ.م.م - ش.ش.و</span>
                  </div>
                </div>
                <div style={{textAlign:'right',marginBottom:'18px'}}>Date: {letterDate}</div>
                <div style={{marginBottom:'16px',lineHeight:'1.8'}}>
                  <div>The Asst. General Manager,</div>
                  <div>{bankName},</div>
                  <div>{bankAddr}</div>
                </div>
                <div>Dear Sir,</div>
                <div style={{textAlign:'center',fontWeight:'bold',textDecoration:'underline',margin:'18px 0 14px',fontSize:'11.5pt'}}>
                  Subject: - &nbsp; WPS Salary Transfer for the Month of {monthFull}
                </div>
                <div style={{textAlign:'justify',marginBottom:'14px'}}>
                  Kindly arrange to transfer the Sum of <strong>AED &nbsp; {fmtTotal}/- (AED – {wordsAmount})</strong> to {String(rows.length).padStart(2,'0')} Employees account as per attached list on <strong style={{textDecoration:'underline'}}>DTD {dtdDate}</strong> from debit of our Company's account <strong style={{textDecoration:'underline'}}>{acctNo}.</strong>
                </div>
                <div style={{marginTop:'40px'}}>
                  <div>Yours faithfully,</div>
                  <div style={{height:'50px',borderBottom:'1px solid #000',width:'180px',margin:'10px 0 4px'}}></div>
                  <div><strong>{signatory}</strong></div>
                  <div>({sigTitle})</div>
                </div>
                <div style={{borderTop:'1px solid #aaa',marginTop:'30px',paddingTop:'5px',fontSize:'7.5pt',color:'#555',textAlign:'center'}}>
                  Tel.: 02 551 9162, Fax: 02 551 9163, P.O. Box: 92654, Abu Dhabi - U.A.E
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION C: EMPLOYEE WPS MASTER                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSection === 'master' && (
        <div style={S.card}>
          <div style={{padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
            <div>
              <div style={{fontWeight:800,fontSize:'14px'}}>👥 Employee WPS Master</div>
              <div style={{fontSize:'12px',color:'#64748b'}}>{activeMaster.length} active · {master.filter(m=>m.active===false).length} inactive</div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button style={S.btnExp} onClick={() => setShowSql(v => !v)}>{showSql?'Hide SQL':'📋 Show Setup SQL'}</button>
              <button style={S.btnPri} onClick={() => setDraft({
                employee_id:'', full_name:'', labour_card_no:'',
                bank_routing: '', iban:'',
                basic_salary:'', fixed_allowance:'', salary_type:'fixed', hourly_rate:'', hours_per_day:'8', contract_days_per_week:'6', remarks:'', active:true,
              })}>+ Add Employee</button>
            </div>
          </div>

          {showSql && (
            <div style={{padding:'14px 18px',background:'#fffbeb',borderBottom:'1px solid #e2e8f0'}}>
              <div style={{fontSize:'11.5px',color:'#92400e',marginBottom:'8px',fontWeight:700}}>Run once in Finance Supabase → SQL Editor:</div>
              <pre style={{background:'#1e293b',color:'#f8fafc',padding:'12px 14px',borderRadius:'8px',fontSize:'11px',overflowX:'auto',whiteSpace:'pre',margin:0}}>{WPS_SQL}</pre>
            </div>
          )}

          {(hrSalaryStatus.error || hrPullError) && (
            <div style={{padding:'10px 18px',background:'#fef2f2',borderBottom:'1px solid #fecaca',fontSize:'12px',color:'#991b1b'}}>
              ⚠️ HR salary/IBAN pull issue: {hrPullError || hrSalaryStatus.error}
            </div>
          )}

          {/* Editor */}
          {draft && (
            <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
              <div style={{fontWeight:800,fontSize:'13px',marginBottom:'12px',color:'#92400e'}}>
                {draft.id ? `Correct Master Entry — ${draft.full_name||draft.employee_id}` : 'Add Employee to WPS Master'}
              </div>
              {draft.id && (
                <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1e40af',borderRadius:'8px',padding:'8px 10px',fontSize:'11.5px',fontWeight:700,marginBottom:'10px'}}>
                  Correction mode: update the wrong Labour Card No, Bank Routing Code, IBAN, Basic Salary, Allowance, Hourly Rate, Contract Hours/Day or Contract Days/Week here. Once saved, this master value will be reused every month. For the open salary month, click Save Salary Sheet again to refresh the monthly snapshot.
                </div>
              )}
              <div style={{marginBottom:'10px'}}>
                <label style={S.label}>Employee</label>
                <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                    onChange={async (id,name) => {
                      const exact = employees.find(e=>e.employee_id===id);
                      let hr = exact ? await pullHrProfile(id) : null;
                      setDraft(d => ({...d, employee_id:id, full_name:name||hr?.full_name||d.full_name,
                        iban: d.iban || hr?.iban || '',
                        basic_salary: d.basic_salary || hr?.basic_salary || '',
                        fixed_allowance: d.fixed_allowance || hr?.fixed_allowance || ''}));
                    }} />
                  {draft.employee_id && (
                    <button style={{...S.btnExp,fontSize:'11px',padding:'4px 10px',background:'#0369a1'}}
                      onClick={async()=>{ const hr=await pullHrProfile(draft.employee_id); if(hr) setDraft(d=>({...d,full_name:d.full_name||hr.full_name, iban:d.iban||hr.iban||'', basic_salary:d.basic_salary||hr.basic_salary||'', fixed_allowance:d.fixed_allowance||hr.fixed_allowance||''})); else alert('No salary/IBAN found in HR portal or access is blocked.'); }}>
                      Pull Salary + IBAN from HR
                    </button>
                  )}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                <div>
                  <label style={S.label}>Labour Card No (14-digit)</label>
                  <input value={draft.labour_card_no||''} onChange={e=>setDraft(d=>({...d,labour_card_no:e.target.value}))}
                    placeholder="10007087491888"
                    style={{...S.input,width:'100%',fontFamily:'ui-monospace,monospace',fontWeight:700,letterSpacing:'.05em'}} />
                </div>
                <div>
                  <label style={S.label}>Bank Routing Code</label>
                  <input list="bankRoutingCodes" value={draft.bank_routing||''}
                    onChange={e=>setDraft(d=>({...d,bank_routing:e.target.value.replace(/\D/g,'').slice(0,9)}))}
                    placeholder="Enter 9-digit WPS routing code"
                    style={{...S.input,width:'100%',fontFamily:'ui-monospace,monospace',fontWeight:700,letterSpacing:'.05em'}} />
                  <datalist id="bankRoutingCodes">
                    {BANK_ROUTING_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </datalist>
                  <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'4px'}}>Manual code is saved in WPS Master and reused every month.</div>
                </div>
                <div>
                  <label style={S.label}>IBAN</label>
                  <input value={draft.iban||''} onChange={e=>setDraft(d=>({...d,iban:e.target.value.replace(/\s/g,'').toUpperCase()}))}
                    placeholder="AE220030000774574141001"
                    style={{...S.input,width:'100%',fontFamily:'ui-monospace,monospace',fontWeight:700,letterSpacing:'.04em'}} />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                <div>
                  <label style={S.label}>Salary Type</label>
                  <select value={draft.salary_type||'fixed'} onChange={e=>setDraft(d=>({...d,salary_type:e.target.value}))} style={{...S.input,width:'100%'}}>
                    <option value="fixed">Fixed — same every month</option>
                    <option value="variable">Variable — site workers (days + OT)</option>
                    <option value="hourly">Hourly Contract — rate × actual hours worked</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Basic Salary (AED/month)</label>
                  <input type="number" value={draft.basic_salary||''} onChange={e=>setDraft(d=>({...d,basic_salary:e.target.value}))} style={{...S.input,width:'100%'}} />
                </div>
                <div>
                  <label style={S.label}>Fixed Allowance (AED/month)</label>
                  <input type="number" value={draft.fixed_allowance||''} onChange={e=>setDraft(d=>({...d,fixed_allowance:e.target.value}))} style={{...S.input,width:'100%'}} />
                </div>
                <div>
                  <label style={S.label}>Hourly Rate (AED/hr)</label>
                  <input type="number" step="0.01" value={draft.hourly_rate||''} onChange={e=>setDraft(d=>({...d,hourly_rate:e.target.value}))} placeholder="e.g. 7.50" style={{...S.input,width:'100%'}} />
                  <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'4px'}}>If entered, this employee is treated as Hourly Contract automatically. Basic Salary remains dummy/reference only.</div>
                </div>
                <div>
                  <label style={S.label}>Contract Hours/Day</label>
                  <input type="number" step="0.5" value={draft.hours_per_day||8} onChange={e=>setDraft(d=>({...d,hours_per_day:e.target.value}))} placeholder="8" style={{...S.input,width:'100%'}} />
                  <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'4px'}}>Used for OT divisor and hourly-employee prorata. Engineers/Staff: 10 hrs/day. Workers: 8 hrs/day.</div>
                </div>
                <div>
                  <label style={S.label}>Contract Days/Week</label>
                  <input type="number" step="0.5" value={draft.contract_days_per_week||6} onChange={e=>setDraft(d=>({...d,contract_days_per_week:e.target.value}))} placeholder="6" style={{...S.input,width:'100%'}} />
                  <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'4px'}}>Usually 6 days/week. Saved in WPS Master and shown in salary sheet.</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'10px',marginBottom:'12px',alignItems:'end'}}>
                <div>
                  <label style={S.label}>Remarks</label>
                  <input value={draft.remarks||''} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. Work permit holder" />
                </div>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:700,fontSize:'12.5px',paddingBottom:'9px'}}>
                  <input type="checkbox" checked={draft.active!==false} onChange={e=>setDraft(d=>({...d,active:e.target.checked}))} />
                  Include in WPS
                </label>
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                <button style={S.btnPri} onClick={saveMaster}>Save</button>
                <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="drag-scroll" style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
              <thead>
                <tr style={{background:'#f8fafc'}}>
                  {['Emp ID','Name','Labour Card No','Bank Routing','IBAN','Type','Basic','Allowance','Hourly Rate','Hrs/Day','Days/Wk','Remarks','Action'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                ) : master.length === 0 ? (
                  <tr><td colSpan={13} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>No employees yet. Click <strong>+ Add Employee</strong>.</td></tr>
                ) : master.map(emp => (
                  <tr key={emp.id} style={{borderTop:'1px solid #f1f5f9',opacity:emp.active===false?0.5:1}} className="hr-row">
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb',fontSize:'11px'}}>{emp.employee_id}</td>
                    <td style={{...S.td,fontWeight:600}}>{emp.full_name||'—'}</td>
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontSize:'11px',color:emp.labour_card_no?'#0f172a':'#dc2626'}}>
                      {emp.labour_card_no||<span style={{color:'#dc2626',fontWeight:700}}>⚠ missing</span>}
                    </td>
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontSize:'11px',color:emp.bank_routing?'#0f172a':'#dc2626'}}>
                      {emp.bank_routing||<span style={{color:'#dc2626',fontWeight:700}}>⚠ missing</span>}
                    </td>
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontSize:'10.5px',color:emp.iban?'#0f172a':'#dc2626'}}>
                      {emp.iban||<span style={{color:'#dc2626',fontWeight:700}}>⚠ missing</span>}
                    </td>
                    <td style={S.td}>
                      <span style={{background:(Number(emp.hourly_rate)||0)>0?'#e0f2fe':(emp.salary_type==='variable'?'#fdf4ff':'#f0fdf4'),color:(Number(emp.hourly_rate)||0)>0?'#0369a1':(emp.salary_type==='variable'?'#7e22ce':'#166534'),fontSize:'10.5px',fontWeight:700,padding:'2px 8px',borderRadius:'10px'}}>
                        {(Number(emp.hourly_rate)||0)>0?'Hourly':(emp.salary_type==='variable'?'Variable':'Fixed')}
                      </span>
                    </td>
                    <td style={{...S.td,fontWeight:700,textAlign:'right'}}>{Number(emp.basic_salary||0).toLocaleString()}</td>
                    <td style={{...S.td,textAlign:'right'}}>{Number(emp.fixed_allowance||0).toLocaleString()}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:(Number(emp.hourly_rate)||0)>0?800:500,color:(Number(emp.hourly_rate)||0)>0?'#0369a1':'#94a3b8'}}>{(Number(emp.hourly_rate)||0)>0 ? Number(emp.hourly_rate||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
                    <td style={{...S.td,textAlign:'right'}}>{Number(emp.hours_per_day||8).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                    <td style={{...S.td,textAlign:'right'}}>{Number(emp.contract_days_per_week||6).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                    <td style={{...S.tdWrap,fontSize:'11px',color:'#64748b'}}>{emp.remarks||'—'}</td>
                    <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                      <button style={{...S.iconBtn,width:'auto',padding:'4px 8px',fontWeight:800,color:'#1d4ed8'}} onClick={()=>setDraft({...emp})}>✎ Correct</button>
                      <button style={{...S.iconBtn,width:'auto',padding:'4px 8px',fontWeight:800,color:'#dc2626'}} onClick={()=>removeMaster(emp.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{padding:'12px 18px',borderTop:'1px solid #e2e8f0',background:'#f8fafc',fontSize:'11.5px',color:'#64748b'}}>
            <strong style={{color:'#0f172a'}}>Tip:</strong> Add each employee once only. If any Labour Card, manual Bank Routing Code, IBAN, Basic Salary, Allowance, Hourly Rate, Contract Hours/Day or Days/Week is wrong, click <strong>Correct</strong>, edit it, and save. The corrected master data will be reused for every future salary month. For <strong>Variable</strong> employees, enter monthly working days / OT. For <strong>Hourly Contract</strong> employees, enter actual regular hours worked; salary is calculated as hourly rate × hours worked plus OT/allowances. For other employees, salary follows your Excel formula with Basic/Allowance/Food prorated by working days and OT calculated using Contract Hours/Day.
          </div>
        </div>
      )}
    </div>
  );
}

// ── P&L DASHBOARD ─────────────────────────────────────────────────
