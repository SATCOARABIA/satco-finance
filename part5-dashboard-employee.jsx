function PnlDashboard({ employees=[], empMeta={}, hrSalaryRows=[], onOpenEmployee }) {
  const [summary,      setSummary]      = useState([]);
  const [monthly,      setMonthly]      = useState([]);
  const [deposits,     setDeposits]     = useState([]);
  const [recoverySrc,  setRecoverySrc]  = useState({visa:[],flights:[],training:[],other:[],deductions:[],monthlyCosts:[],timesheets:[],invoices:[],invoiceLines:[],invoiceRecoveries:[],ppe:[]});
  const [loading,      setLoading]      = useState(true);
  const [selectedEmp,  setSelectedEmp]  = useState(null);
  const [filters,      setFilters]      = useState({});
  const [showAllPnlRows, setShowAllPnlRows] = useState(false);
  const [empNotes,     setEmpNotes]     = useState({});
  const [notesLoading, setNotesLoading] = useState(false);

  const [tempCandMeta, setTempCandMeta] = useState({}); // temp_employee_id -> {full_name, position}
  const [tempCandError, setTempCandError] = useState(null);

  const load = async () => {
    setLoading(true);
    const [s,m,d,visa,flights,training,other,ded,timesheets,inv,lns,rec,tempCands,ppe] = await Promise.all([
      db.from('employee_pnl_summary').select('*').order('employee_id',{ascending:true}),
      db.from('employee_pnl_monthly').select('*').order('month',{ascending:false}),
      db.from('employee_other_costs').select('employee_id,amount').eq('cost_type','security_deposit'),
      db.from('employee_visa_costs').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_flights').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_training_costs').select('employee_id,cost,recoverable,recoverable_amount'),
      db.from('employee_other_costs').select('employee_id,amount,recoverable,cost_type,recovered_amount,notes'),
      db.from('employee_monthly_costs').select('employee_id,month,salary,food,accommodation,transport,other,salary_deductions'),
      db.from('employee_timesheets').select('employee_id,hours,rate'),
      db.from('employee_client_invoices').select('id,employee_id,month,received_amount_aed,wps_paid_aed,satco_rate_eur_hr,brunel_rate_eur_hr'),
      db.from('employee_client_invoice_lines').select('invoice_id,hours,rate_eur_hr'),
      db.from('employee_client_recoveries').select('invoice_id,employee_id,amount_aed'),
      hrDb.from('v_temp_candidates').select('temp_employee_id,candidate_name,position_display'),
      db.from('employee_ppe_issued').select('employee_id,total_cost'),
    ]);
    if (tempCands.error) { console.error('Temp candidate pull failed (v_temp_candidates):', tempCands.error); setTempCandError(tempCands.error.message || String(tempCands.error)); }
    else setTempCandError(null);
    let summaryRows = s.data || [];
    const tcMeta = {};
    (tempCands.data || []).forEach(t => { const id = canonEmpId(t.temp_employee_id); if (id) tcMeta[id] = { full_name: t.candidate_name, position: t.position_display }; });
    setTempCandMeta(tcMeta);
    // Temp candidates (Visa Processing, not yet a real employee) don't have a row in the
    // employee_pnl_summary view — it's joined off the `employees` table, which they're not in
    // yet by design. If a deposit was logged against their temp ID, synthesize a minimal row so
    // it's actually visible in this table instead of only being folded into the grand totals.
    if (d.data && d.data.length) {
      const realIds = new Set(summaryRows.map(r => canonEmpId(r.employee_id)));
      const depositedTempIds = [...new Set(d.data.map(r => canonEmpId(r.employee_id)))].filter(id => /T$/i.test(id) && !realIds.has(id));
      depositedTempIds.forEach(id => {
        summaryRows = [...summaryRows, {
          employee_id: id, full_name: (tcMeta[id] && tcMeta[id].full_name) || id,
          lifetime_income: 0, lifetime_expense: 0, lifetime_net: 0,
          lifetime_onboarding_cost: 0, advance_outstanding: 0, idle_months: 0,
          is_temp: true,
        }];
      });
    }
    // Fix 1: Also show employees that exist only in Finance (WPS master / salary profiles)
    // even if they have no HR record and are not in employee_pnl_summary.
    try {
      const [spFinance, wmFinance] = await Promise.all([
        db.from('employee_salary_profiles').select('employee_id,full_name'),
        db.from('wps_employee_master').select('employee_id,full_name'),
      ]);
      const realIds = new Set(summaryRows.map(r => canonEmpId(r.employee_id)));
      const financeOnly = {};
      (spFinance.data||[]).forEach(r=>{ const id=canonEmpId(r.employee_id); if (id && !realIds.has(id)) financeOnly[id]=r.full_name||id; });
      (wmFinance.data||[]).forEach(r=>{ const id=canonEmpId(r.employee_id); if (id && !realIds.has(id)) financeOnly[id]=r.full_name||financeOnly[id]||id; });
      Object.entries(financeOnly).forEach(([id,name])=>{
        summaryRows = [...summaryRows, {
          employee_id:id, full_name:name,
          lifetime_income:0, lifetime_expense:0, lifetime_net:0,
          lifetime_onboarding_cost:0, advance_outstanding:0, idle_months:0,
          is_finance_only: true,
        }];
      });
    } catch(_){}

    // Fix: The P&L Dashboard must show the complete employee roster, even where there is
    // no Finance entry yet. This makes missing costs/income visible instead of hiding people.
    try {
      const ids = new Set((summaryRows||[]).map(r=>canonEmpId(r.employee_id)));
      const addEmptyPnlRow = (id, name, flags={}) => {
        id = canonEmpId(id);
        if (!id || ids.has(id)) return;
        summaryRows = [...summaryRows, {
          employee_id:id, full_name:name || (empMeta[id] && empMeta[id].full_name) || id,
          lifetime_income:0, lifetime_expense:0, lifetime_net:0,
          lifetime_onboarding_cost:0, advance_outstanding:0, idle_months:0,
          ...flags,
        }];
        ids.add(id);
      };
      (employees||[]).forEach(e=>addEmptyPnlRow(e.employee_id, e.full_name, {is_roster_only:true, is_temp:!!e.is_temp}));
      (hrSalaryRows||[]).forEach(r=>addEmptyPnlRow(r.employee_id, r.full_name, {is_hr_only:true}));
      Object.entries(empMeta||{}).forEach(([id,m])=>addEmptyPnlRow(id, (m&&m.full_name)||id, {is_hr_only:true}));
    } catch(_){}

    summaryRows = dedupePnlSummaryRows(summaryRows, m.data || [], { employees, hrSalaryRows, empMeta, tempCandMeta: tcMeta });
    if (summaryRows) setSummary(summaryRows);
    if (m.data) setMonthly(m.data);
    if (d.data) setDeposits(d.data);
    setRecoverySrc({
      visa: visa.data||[], flights: flights.data||[], training: training.data||[],
      other: other.data||[], deductions: ded.data||[], monthlyCosts: ded.data||[], timesheets: timesheets.data||[],
      invoices: inv.data||[], invoiceLines: lns.data||[], invoiceRecoveries: rec.data||[],
      ppe: ppe.data||[],
    });
    setLoading(false);
  };
  useEffect(()=>{load();},[employees.length, hrSalaryRows.length]);

  useEffect(()=>{
    if (!selectedEmp) { setEmpNotes({}); return; }
    setNotesLoading(true);
    Promise.all([
      db.from('employee_monthly_costs').select('month,remarks').eq('employee_id',selectedEmp),
      db.from('employee_other_costs').select('cost_date,cost_type,amount,recoverable,recovered_amount,notes').eq('employee_id',selectedEmp),
    ]).then(([mc,oc])=>{
      const map={};
      if (mc.data) mc.data.forEach(r=>{
        const m=String(r.month||'').slice(0,7);
        if (!map[m]) map[m]={remarks:null,deposit:0,recoveries:[]};
        if (r.remarks) map[m].remarks=r.remarks;
      });
      if (oc.data) oc.data.forEach(r=>{
        const m=String(r.cost_date||'').slice(0,7);
        if (!map[m]) map[m]={remarks:null,deposit:0,recoveries:[]};
        if (r.cost_type==='security_deposit') {
          map[m].deposit=(map[m].deposit||0)+(Number(r.amount)||0);
        } else if (r.recoverable) {
          map[m].recoveries.push({notes:r.notes,amount:Number(r.amount)||0,recovered:Number(r.recovered_amount)||0,outstanding:(Number(r.amount)||0)-(Number(r.recovered_amount)||0)});
        }
      });
      setEmpNotes(map); setNotesLoading(false);
    });
  },[selectedEmp]);

  const depositMap = useMemo(()=>{
    const m={};
    deposits.forEach(d=>{ const id=canonEmpId(d.employee_id); if(id) m[id]=(m[id]||0)+(Number(d.amount)||0); });
    return m;
  },[deposits]);

  // Per-employee: total recoverable (Visa+Flights+Training+Onboarding marked recoverable, plus
  // WPS overpayment vs employee's actual Client Billing share) vs total recovered (salary
  // deductions + deposits received + logged WPS recoveries).
  //
  // wps_overpayment_recovery rows in employee_other_costs come in two flavours:
  //  - Invoice-synced: created/repaired automatically by the Client Billing tab, tagged
  //    "[INV:<id>]" in notes. For these we recompute the amount live from the invoice
  //    (Received → implied FX rate → SATCO share → Employee share → vs WPS paid) so it
  //    self-heals even if Client Billing hasn't been reopened since the invoice changed.
  //  - Manual: entered directly on the Onboarding & Misc tab with no invoice behind them
  //    (e.g. a one-off "WPS overpaid this month, recover from salary" note). These have no
  //    [INV:id] tag, so there's nothing to recompute — just use the stored amount, exactly
  //    like every other recoverable cost type.
  const recoveryMap = useMemo(()=>{
    const m = {};
    const blank = () => ({ recoverable:0, recovered:0, payable:0, overpaidRaw:0, recoveredForNet:0 });
    const ensure = (id) => { id=canonEmpId(id); if (!id) return blank(); if (!m[id]) m[id] = blank(); return m[id]; };
    recoverySrc.visa.forEach(r=>{ if (r.recoverable) ensure(r.employee_id).recoverable += recoverableCap(r,'cost'); });
    recoverySrc.flights.forEach(r=>{ if (r.recoverable) ensure(r.employee_id).recoverable += recoverableCap(r,'cost'); });
    recoverySrc.training.forEach(r=>{ if (r.recoverable) ensure(r.employee_id).recoverable += recoverableCap(r,'cost'); });
    recoverySrc.other.forEach(r=>{ if (r.recoverable && r.cost_type!=='security_deposit' && r.cost_type!=='wps_overpayment_recovery') ensure(r.employee_id).recoverable += Number(r.amount)||0; });
    recoverySrc.other.forEach(r=>{ if (r.cost_type==='security_deposit') ensure(r.employee_id).recovered += Number(r.amount)||0; });
    // Manual WPS-overpayment rows (no [INV:id] tag) — use the stored amount/recovered_amount directly.
    // overpaidRaw counts every such row regardless of the "Recoverable" checkbox (a row being marked
    // not-recoverable-via-salary doesn't erase the underlying fact that WPS overpaid that month —
    // it just means it'll be settled a different way) — this feeds Net WPS Position below, mirroring
    // the Employee Detail page's identical wpsOverpaymentRaw logic so the two can never disagree.
    recoverySrc.other.forEach(r=>{
      if (r.cost_type==='wps_overpayment_recovery' && !/\[INV:[^\]]+\]/.test(String(r.notes||''))) {
        ensure(r.employee_id).overpaidRaw += Number(r.amount)||0;
        if (r.recoverable) {
          ensure(r.employee_id).recoverable += Number(r.amount)||0;
          ensure(r.employee_id).recovered  += Number(r.recovered_amount)||0;
          ensure(r.employee_id).recoveredForNet += Number(r.recovered_amount)||0;
        }
      }
    });
    // Manual WPS-underpayment rows (no [INV:id] tag) — the mirror image: a payable to the employee,
    // not a recoverable. recoverable is always false on these rows so they never leak into the
    // recoverable loops above.
    recoverySrc.other.forEach(r=>{
      if (r.cost_type==='wps_underpayment_payable' && !/\[INV:[^\]]+\]/.test(String(r.notes||''))) {
        ensure(r.employee_id).payable += Number(r.amount)||0;
      }
    });
    recoverySrc.deductions.forEach(r=>{ ensure(r.employee_id).recovered += Number(r.salary_deductions)||0; });

    // WPS over/underpayment per invoice, computed directly (Received → implied FX rate → SATCO share → Employee share → vs WPS paid)
    const linesByInvoice = {};
    recoverySrc.invoiceLines.forEach(l=>{ if(!linesByInvoice[l.invoice_id]) linesByInvoice[l.invoice_id]=[]; linesByInvoice[l.invoice_id].push(l); });
    // Synced employee_other_costs row per invoice — read here so a manual "un-recoverable"
    // override on a WPS-overpaid row (e.g. it'll be netted against next month's WPS payment
    // instead of a salary deduction) isn't silently overwritten by this recompute.
    const invoiceSyncMap = {};
    recoverySrc.other.forEach(r=>{
      const m = String(r.notes||'').match(/\[INV:([^\]]+)\]/);
      if (m) invoiceSyncMap[m[1]] = r;
    });
    recoverySrc.invoices.forEach(inv=>{
      const lns = linesByInvoice[inv.id]||[];
      const split = wpsInvoiceSplit(inv, lns);
      if (split.overpaid === null) return;
      const { overpaid } = split;
      const synced = invoiceSyncMap[inv.id];
      if (overpaid > 0.5) {
        // Raw fact (feeds Net WPS Position) — counts regardless of the manual "Recoverable" override.
        ensure(inv.employee_id).overpaidRaw += Math.round(overpaid*100)/100;
        if (!synced || synced.recoverable) ensure(inv.employee_id).recoverable += Math.round(overpaid*100)/100;
      }
      else if (overpaid < -0.5) ensure(inv.employee_id).payable += Math.round(Math.abs(overpaid)*100)/100;
    });
    // Logged recoveries against those invoices count as recovered — both toward the general
    // "recovered" total and specifically toward netting down WPS overpayment for Net WPS Position.
    recoverySrc.invoiceRecoveries.forEach(r=>{
      ensure(r.employee_id).recovered += Number(r.amount_aed)||0;
      ensure(r.employee_id).recoveredForNet += Number(r.amount_aed)||0;
    });

    // Net WPS Position: positive = company still owes the employee (net of any offsetting
    // overpayment that hasn't been recovered another way); negative = employee still owes company.
    // Mirrors the Employee Detail page's Net WPS Position formula exactly — this used to be a raw,
    // un-netted "payable" figure here, which could show e.g. AED 7,790.08 owed to an employee while
    // the Employee Detail page correctly showed AED 821.77 net (after an offsetting unrecovered
    // overpayment elsewhere), a mismatch with no way to reconcile from this table alone.
    Object.values(m).forEach(t=>{
      t.netWpsPosition = Math.round((t.payable - Math.max(0, t.overpaidRaw - t.recoveredForNet))*100)/100;
    });

    return m;
  },[recoverySrc]);


  // P&L numbers shown on the dashboard are calculated from the original source tables,
  // not from the employee_pnl_monthly/summary helper views. Those helper views can contain
  // duplicate/stale rows after Excel imports or manual repairs, which is why the dashboard
  // was showing inflated figures. This source-of-truth map matches the employee detail page:
  // income = Timesheets / Income, salary cost = Monthly Costs net payout, plus visa/flight/training/other actual costs.
  const rawPnlMap = useMemo(()=>{
    const m = {};
    const n = (v)=>Number(v)||0;
    const ensure = (id) => {
      id = canonEmpId(id);
      if (!id) return null;
      if (!m[id]) m[id] = { income:0, salary:0, visa:0, flights:0, training:0, other:0, ppe:0, expense:0 };
      return m[id];
    };
    (recoverySrc.timesheets||[]).forEach(r=>{
      const t = ensure(r.employee_id); if (!t) return;
      t.income += n(r.hours) * n(r.rate);
    });
    (recoverySrc.monthlyCosts||[]).forEach(r=>{
      const t = ensure(r.employee_id); if (!t) return;
      const salaryNet = n(r.salary) + n(r.food) + n(r.accommodation) + n(r.transport) + n(r.other) - n(r.salary_deductions);
      t.salary += salaryNet;
      t.expense += salaryNet;
    });
    (recoverySrc.visa||[]).forEach(r=>{ const t=ensure(r.employee_id); if(t){ const v=n(r.cost); t.visa+=v; t.expense+=v; } });
    (recoverySrc.flights||[]).forEach(r=>{ const t=ensure(r.employee_id); if(t){ const v=n(r.cost); t.flights+=v; t.expense+=v; } });
    (recoverySrc.training||[]).forEach(r=>{ const t=ensure(r.employee_id); if(t){ const v=n(r.cost); t.training+=v; t.expense+=v; } });
    (recoverySrc.ppe||[]).forEach(r=>{ const t=ensure(r.employee_id); if(t){ const v=n(r.total_cost); t.ppe+=v; t.expense+=v; } });
    (recoverySrc.other||[]).forEach(r=>{
      const type = String(r.cost_type||'');
      // Security deposits are recoveries/cash received, not operating cost. WPS overpayment recovery
      // is also not an extra cost because the WPS paid amount is already inside Monthly Costs salary.
      // WPS underpayment payable is the mirror image (company owes employee extra) — per the Client
      // Billing tab's own documentation it is carried as a payable and must NOT be deducted from
      // expense, so it's excluded here too. (Previously only the first two were excluded, which made
      // this dashboard's Total Expense / Net P/L disagree with the Employee Detail page by exactly
      // the WPS-underpaid amount for any employee with one of these rows.)
      if (type==='security_deposit' || type==='wps_overpayment_recovery' || type==='wps_underpayment_payable') return;
      const t=ensure(r.employee_id); if(t){ const v=n(r.amount); t.other+=v; t.expense+=v; }
    });
    Object.values(m).forEach(t=>{
      ['income','salary','visa','flights','training','other','ppe','expense'].forEach(k=>{ t[k]=Math.round((t[k]||0)*100)/100; });
      t.net = Math.round((t.income - t.expense)*100)/100;
    });
    return m;
  },[recoverySrc]);

  const filterFields = [{key:'employee_id',label:'Emp ID',width:'100px'},{key:'full_name',label:'Name',width:'180px'}];
  const filteredSummary = useMemo(()=>applyFilters(summary,filters),[summary,filters]);
  const PNL_VISIBLE_LIMIT = 75;
  const visiblePnlSummary = showAllPnlRows ? filteredSummary : filteredSummary.slice(0, PNL_VISIBLE_LIMIT);

  // Per-employee lifetime totals broken out by category. Use the raw source-of-truth
  // calculations above so duplicated helper-view rows cannot inflate the dashboard.
  const categoryTotals = useMemo(()=>{
    const m = {};
    Object.entries(rawPnlMap||{}).forEach(([id,t])=>{
      m[id] = {
        visa:Number(t.visa)||0,
        flights:Number(t.flights)||0,
        training:Number(t.training)||0,
        salary:Number(t.salary)||0,
        income:Number(t.income)||0,
        other:Number(t.other)||0,
        ppe:Number(t.ppe)||0,
        expense:Number(t.expense)||0,
      };
    });
    return m;
  },[rawPnlMap]);

  const empMonthly = useMemo(()=>
    [...monthly.filter(r=>canonEmpId(r.employee_id)===canonEmpId(selectedEmp))].sort((a,b)=>a.month<b.month?1:a.month>b.month?-1:0),
    [monthly,selectedEmp]);

  const G = summary.reduce((a,r)=>{
    const id = canonEmpId(r.employee_id);
    const raw = rawPnlMap[id];
    const rec = recoveryMap[id]||{recoverable:0,recovered:0,payable:0,overpaidRaw:0,recoveredForNet:0,netWpsPosition:0};
    const income = raw ? Number(raw.income)||0 : Number(r.lifetime_income)||0;
    const grossExpense = raw ? Number(raw.expense)||0 : Number(r.lifetime_expense)||0;
    const netExpense = Math.max(0, grossExpense - (Number(rec.recovered)||0));
    return {income:a.income+income, expense:a.expense+netExpense, net:a.net+(income-netExpense), netWpsPosition:a.netWpsPosition+(Number(rec.netWpsPosition)||0)};
  },{income:0,expense:0,net:0,netWpsPosition:0});
  const totalDeposits=Object.values(depositMap).reduce((s,v)=>s+v,0);

  // Export P&L summary
  const pnlCsvCols = [
    {key:'employee_id',label:'Emp ID'},{key:'full_name',label:'Name'},
    {key:'visa_total',label:'Visa Total (AED)'},{key:'salary_total',label:'Salary Total (AED)'},{key:'income_total',label:'Income Total (AED)'},
    {key:'lifetime_income',label:'Total Income (AED)'},{key:'lifetime_expense',label:'Total Expense (AED)'},
    {key:'lifetime_net',label:'Net P/L (AED)'},{key:'lifetime_onboarding_cost',label:'Onboarding Cost'},
    {key:'advance_outstanding',label:'Advance Outstanding'},{key:'deposits_received',label:'Deposits Received (info only — already included in Recovered)'},
    {key:'recoverable_total',label:'Recoverable'},{key:'recovered_plus_deposits',label:'Recovered / Deposits Received'},{key:'balance_to_recover',label:'Balance to Recover'},
    {key:'wps_overpaid_raw',label:'WPS Overpaid vs Billing (gross, employee owes company)'},
    {key:'wps_underpaid_raw',label:'WPS Underpaid vs Billing (gross, payable to employee)'},
    {key:'wps_net_position',label:'WPS Net Position (+ = owe employee, - = employee owes company)'},
    {key:'idle_months',label:'Idle Months'},
  ];
  const pnlExportRows = useMemo(()=>filteredSummary.map(r=>{
    const id=canonEmpId(r.employee_id);
    const rec=recoveryMap[id]||{recoverable:0,recovered:0,payable:0,overpaidRaw:0,recoveredForNet:0,netWpsPosition:0};
    const dep=depositMap[id]||0;
    const raw=rawPnlMap[id];
    const cat=categoryTotals[id]||{visa:0,salary:0,income:0,expense:0};
    const income = raw ? Number(raw.income)||0 : Number(r.lifetime_income)||0;
    const grossExpense = raw ? Number(raw.expense)||0 : Number(r.lifetime_expense)||0;
    const netExpense = Math.max(0, grossExpense - (Number(rec.recovered)||0));
    const net = income - netExpense;
    // rec.recovered already includes deposits received (folded in once when recoveryMap is built) — do not add dep again.
    return {...r, lifetime_income:income, lifetime_expense:netExpense, lifetime_net:net,
      deposits_received:dep, recoverable_total:rec.recoverable, recovered_plus_deposits:rec.recovered, balance_to_recover:rec.recoverable-rec.recovered,
      wps_overpaid_raw:rec.overpaidRaw, wps_underpaid_raw:rec.payable, wps_net_position:rec.netWpsPosition,
      visa_total:cat.visa, salary_total:cat.salary, income_total:cat.income};
  }),[filteredSummary,recoveryMap,depositMap,categoryTotals,rawPnlMap]);

  const renderNotesCell=(monthKey)=>{
    const n=empNotes[monthKey];
    if (!n) return <td style={S.tdWrap}>—</td>;
    const parts=[];
    if (n.remarks) parts.push(<div key="rem" style={{marginBottom:'3px',color:'#475569',fontSize:'11.5px'}}> {n.remarks}</div>);
    if (n.deposit>0) parts.push(<div key="dep" style={{marginBottom:'3px'}}><span style={{background:'#dcfce7',color:'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>Deposit rcvd: AED {fmt(n.deposit)}</span></div>);
    n.recoveries.forEach((rec,i)=>{
      const isPending=rec.outstanding>0;
      parts.push(<div key={'rec'+i} style={{marginBottom:'2px'}}><span style={{background:isPending?'#fef3c7':'#f0fdf4',color:isPending?'#92400e':'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>{isPending?'Recover':'Recovered'}: AED {fmt(isPending?rec.outstanding:rec.amount)}{rec.notes?` — ${rec.notes}`:''}</span></div>);
    });
    return <td style={{...S.tdWrap,minWidth:'180px',maxWidth:'260px'}}>{parts.length?parts:'—'}</td>;
  };

  return (
    <div>
      {tempCandError && (
        <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',color:'#991b1b',fontSize:'12.5px'}}>
          ⚠️ Couldn't load in-process candidate names/positions from HR for this table — temp-ID rows (if any) will still show using the raw ID as the name. Error: <code>{tempCandError}</code>
        </div>
      )}
      <div className="finance-kpi-grid">
        <div style={{...S.card,padding:'16px'}}><div style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Total Income (all employees)</div><div style={{fontSize:'22px',fontWeight:800,color:'#166534',marginTop:'6px'}}>AED {fmt(G.income)}</div>{totalDeposits>0&&<div style={{fontSize:'11px',color:'#64748b',marginTop:'4px'}}>AED {fmt(totalDeposits)} deposits shown under recovered, not income</div>}</div>
        <div style={{...S.card,padding:'16px'}}><div style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Total Expense (all employees)</div><div style={{fontSize:'22px',fontWeight:800,color:'#dc2626',marginTop:'6px'}}>AED {fmt(G.expense)}</div></div>
        <div style={{...S.card,padding:'16px'}}><div style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Net Profit / Loss</div><div style={{fontSize:'22px',marginTop:'6px'}}><AmountTag value={G.net} /></div></div>
        <div style={{...S.card,padding:'16px'}}>
          <div style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>WPS Net Position (all employees)</div>
          <div style={{fontSize:'22px',fontWeight:800,color:Math.abs(G.netWpsPosition)<=0.5?'#94a3b8':G.netWpsPosition>0?'#1d4ed8':'#92400e',marginTop:'6px'}}>
            {Math.abs(G.netWpsPosition)<=0.5 ? 'AED 0.00' : `AED ${fmt(Math.abs(G.netWpsPosition))}`}
          </div>
          <div style={{fontSize:'11px',color:'#64748b',marginTop:'4px'}}>
            {Math.abs(G.netWpsPosition)<=0.5 ? 'Settled — WPS paid matches Client Billing share overall' : G.netWpsPosition>0 ? 'Net: company owes staff (underpaid vs Client Billing, net of any offsetting overpayment)' : 'Net: staff owe company (overpaid vs Client Billing, net of any offsetting underpayment)'}
          </div>
        </div>
      </div>

      <div style={{...S.card,marginBottom:'16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
          <div style={{fontWeight:800,fontSize:'14px'}}>Lifetime Profitability by Employee</div>
          <button style={S.btnExp} onClick={()=>exportCSV(pnlExportRows,'pnl_summary',pnlCsvCols)}>Export CSV</button>
        </div>
        <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />
        <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px',tableLayout:'fixed'}}>
            <thead className="tbl-sticky-th"><tr>
              {[
                ['Emp ID','64px'],['Name','115px'],['Position','90px'],['Joining Date','80px'],
                ['Income Total','80px'],
                ['Total Income','82px'],['Total Expense','82px'],['Net P/L','82px'],
                ['Recoverable','74px'],['Recovered / Deposits Received','84px'],
                ['Balance to Recover','80px'],['WPS Net Position','80px'],['Idle Months','64px'],['',36],
              ].map(([h,w])=>(
                <th key={h} style={{...S.th,whiteSpace:'normal',wordBreak:'break-word',overflowWrap:'anywhere',lineHeight:'1.3',width:w,verticalAlign:'bottom',position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={14} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                : filteredSummary.length===0
                  ? <tr><td colSpan={14} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{summary.length===0?'No data yet':'No employees match filters'}</td></tr>
                  : visiblePnlSummary.map(r=>{
                      const id=canonEmpId(r.employee_id);
                      const dep=depositMap[id]||0;
                      const rec=recoveryMap[id]||{recoverable:0,recovered:0,payable:0,overpaidRaw:0,recoveredForNet:0,netWpsPosition:0};
                      const balance=rec.recoverable-rec.recovered;
                      const raw=rawPnlMap[id];
                      const adjIncome=raw ? (Number(raw.income)||0) : (Number(r.lifetime_income)||0);
                      // Expense is sourced from original cost tables, then reduced by actual recoveries/deposits received once.
                      const grossExpense=raw ? (Number(raw.expense)||0) : (Number(r.lifetime_expense)||0);
                      const adjExpense=Math.max(0,grossExpense-(Number(rec.recovered)||0));
                      const adjNet=adjIncome-adjExpense;
                      const meta=empMeta&&(empMeta[r.employee_id]||empMeta[id]);
                      const tcMeta=tempCandMeta[id]||tempCandMeta[r.employee_id];
                      const cat=categoryTotals[id]||{visa:0,flights:0,training:0,salary:0,income:0,expense:grossExpense};
                      // rec.recovered already includes deposits received (added once when recoveryMap is built) — this is the single source of truth, no further addition needed.
                      return (
                        <tr key={r.employee_id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',background:selectedEmp===r.employee_id?'#eff6ff':'transparent'}}>
                          <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:r.is_temp?'#0f766e':'#2563eb',cursor:'pointer',padding:'7px 6px',whiteSpace:'normal',wordBreak:'break-word',overflowWrap:'anywhere'}} onClick={()=>onOpenEmployee&&onOpenEmployee(r.employee_id,r.full_name)}>{r.employee_id}</td>
                          <td style={{...S.td,fontWeight:700,color:'#2563eb',cursor:'pointer',textDecoration:'underline',padding:'7px 6px',whiteSpace:'normal',wordBreak:'break-word',overflowWrap:'anywhere'}} onClick={()=>onOpenEmployee&&onOpenEmployee(r.employee_id,r.full_name)}>{r.full_name}</td>
                          <td style={{...S.td,padding:'7px 6px',whiteSpace:'normal',wordBreak:'break-word',overflowWrap:'anywhere'}}>{(meta&&meta.position)||(tcMeta&&tcMeta.position)||'—'}</td>
                          <td style={{...S.td,padding:'7px 6px'}}>{r.is_temp?<span style={{background:'#f0fdfa',color:'#0f766e',fontSize:'10.5px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>pending</span>:r.is_finance_only?<span style={{background:'#faf5ff',color:'#7c3aed',fontSize:'10.5px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>Finance only</span>:r.is_roster_only||r.is_hr_only?<span style={{background:'#eff6ff',color:'#1d4ed8',fontSize:'10.5px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>No P&amp;L yet</span>:((meta&&meta.joining_date)||'—')}</td>
                          <td style={{...S.td,padding:'7px 6px',color:'#166534'}}>{cat.income>0?fmt(cat.income):<span style={{color:'#cbd5e1'}}>—</span>}</td>
                          <td style={{...S.td,color:'#166534',fontWeight:700,padding:'7px 6px'}}>{fmt(adjIncome)}</td>
                          <td style={{...S.td,color:'#dc2626',fontWeight:700,padding:'7px 6px'}}>
                            <div title={rec.recovered>0?`Gross: AED ${fmt(grossExpense)} · Recovered: AED ${fmt(rec.recovered)} · Net shown: AED ${fmt(adjExpense)}`:''}>{fmt(adjExpense)}</div>
                            {rec.recovered>0&&<div style={{fontSize:'9.5px',color:'#94a3b8',fontWeight:600,lineHeight:'1.2',marginTop:'2px'}}>-{fmt(rec.recovered)} rcvd</div>}
                          </td>
                          <td style={{...S.td,padding:'7px 6px'}}><AmountTag value={adjNet} /></td>
                          <td style={{...S.td,padding:'7px 6px'}}>{rec.recoverable>0?fmt(rec.recoverable):<span style={{color:'#cbd5e1'}}>—</span>}</td>
                          <td style={{...S.td,padding:'7px 6px'}}>{(rec.recoverable>0||rec.recovered>0)?<span style={{color:'#166534',fontWeight:700}}>{fmt(rec.recovered)}{dep>0&&<div style={{fontSize:'10px',color:'#94a3b8',fontWeight:600}}>incl. {fmt(dep)} deposit</div>}</span>:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                          <td style={{...S.td,padding:'7px 6px'}}>{rec.recoverable>0?(balance>0?<span style={{background:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>{fmt(balance)}</span>:<span style={{color:'#166534',fontWeight:700}}>✓ Cleared</span>):<span style={{color:'#cbd5e1'}}>—</span>}</td>
                          <td style={{...S.td,padding:'7px 6px'}} title={`WPS Overpaid vs Billing (gross): AED ${fmt(rec.overpaidRaw)} · WPS Underpaid vs Billing (gross): AED ${fmt(rec.payable)}`}>
                            {Math.abs(rec.netWpsPosition)<=0.5
                              ? <span style={{color:'#cbd5e1'}}>—</span>
                              : rec.netWpsPosition>0
                                ? <span style={{background:'#dbeafe',color:'#1d4ed8',fontSize:'11px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>Owe {fmt(rec.netWpsPosition)}</span>
                                : <span style={{background:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>Owes co. {fmt(Math.abs(rec.netWpsPosition))}</span>}
                          </td>
                          <td style={{...S.td,padding:'7px 6px'}}>{r.idle_months>0?<span style={{background:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:700,padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'}}>{r.idle_months} idle</span>:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                          <td style={{...S.td,textAlign:'right',color:'#94a3b8',fontSize:'11px',cursor:'pointer',padding:'7px 6px'}} onClick={()=>setSelectedEmp(r.employee_id===selectedEmp?null:r.employee_id)}>{selectedEmp===r.employee_id?'▲ hide':'▼ months'}</td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
        {filteredSummary.length > PNL_VISIBLE_LIMIT && (
          <div className="pnl-row-limit">
            <span>{showAllPnlRows ? `Showing all ${filteredSummary.length} employees` : `Showing first ${PNL_VISIBLE_LIMIT} of ${filteredSummary.length} employees for faster loading`}</span>
            <button onClick={()=>setShowAllPnlRows(v=>!v)}>{showAllPnlRows ? 'Show less' : 'Show all rows'}</button>
          </div>
        )}
      </div>

      {selectedEmp&&empMeta&&(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)])&&(
        <div style={{...S.card,marginBottom:'16px',padding:'14px 18px'}}>
          <div style={{fontWeight:800,fontSize:'14px',marginBottom:'8px'}}>HR Snapshot — {(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).full_name}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',fontSize:'12.5px'}}>
            {[['Position',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).position],['Nationality',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).nationality],['Joining Date',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).joining_date],['Status',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).status],['Hired From',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).hired_from],['Supplier / Agent',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).supplier_name],['Mobilization Date',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).mobilization_date],['Site / Location',(empMeta[selectedEmp]||empMeta[canonEmpId(selectedEmp)]).location]].map(([k,v])=>(
              <div key={k}><div style={{color:'#94a3b8',fontWeight:600}}>{k}</div><div style={{fontWeight:700}}>{v||'—'}</div></div>
            ))}
          </div>
        </div>
      )}

      {selectedEmp&&(
        <div style={S.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
            <div style={{fontWeight:800,fontSize:'14px'}}>Monthly Breakdown — {selectedEmp} <span style={{fontWeight:400,fontSize:'12px',color:'#94a3b8'}}>(most recent first)</span></div>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {notesLoading&&<span style={{fontSize:'12px',color:'#94a3b8'}}>Loading notes…</span>}
              <button style={S.btnExp} onClick={()=>exportCSV(empMonthly,'monthly_breakdown_'+selectedEmp,[
                {key:'month',label:'Month'},{key:'salary',label:'Salary'},{key:'food',label:'Food'},
                {key:'accommodation',label:'Accom.'},{key:'transport',label:'Transport'},{key:'other_cost',label:'Other'},
                {key:'visa_cost',label:'Visa'},{key:'flight_cost',label:'Flights'},{key:'training_cost',label:'Training'},
                {key:'onboarding_cost',label:'Onboarding'},{key:'total_expense',label:'Total Exp.'},
                {key:'total_income',label:'Income'},{key:'net_profit_loss',label:'Net P/L'},
              ])}>Export CSV</button>
            </div>
          </div>
          <div className="drag-scroll" style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
              <thead><tr>{['Month','Salary','Food','Accom.','Transport','Other','Visa','Flights','Training','Onboarding','Total Exp.','Income','Net P/L','Remarks / Recovery'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {empMonthly.map(r=>{
                  const mk=monthStr(r.month);
                  return (
                    <tr key={r.month} className="hr-row" style={{borderTop:'1px solid #f1f5f9',background:r.total_income===0?'#fffbeb':'transparent'}}>
                      <td style={{...S.td,fontWeight:700}}>{mk}{r.total_income===0&&<span style={{marginLeft:'6px',fontSize:'10px',background:'#fde68a',color:'#92400e',padding:'1px 6px',borderRadius:'8px'}}>idle</span>}</td>
                      <td style={S.td}>{fmt(r.salary)}</td>
                      <td style={S.td}>{fmt(r.food)}</td>
                      <td style={S.td}>{fmt(r.accommodation)}</td>
                      <td style={S.td}>{fmt(r.transport)}</td>
                      <td style={S.td}>{fmt(r.other_cost)}</td>
                      <td style={S.td}>{fmt(r.visa_cost)}</td>
                      <td style={S.td}>{fmt(r.flight_cost)}</td>
                      <td style={S.td}>{fmt(r.training_cost)}</td>
                      <td style={S.td}>{fmt(r.onboarding_cost)}</td>
                      <td style={{...S.td,fontWeight:700,color:'#dc2626'}}>{fmt(r.total_expense)}</td>
                      <td style={{...S.td,fontWeight:700,color:'#166534'}}>{fmt(r.total_income)}</td>
                      <td style={S.td}><AmountTag value={r.net_profit_loss} /></td>
                      {renderNotesCell(mk)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    const {data,error} = await db.auth.signInWithPassword({email,password});
    setLoading(false);
    if (error) { setError(error.message); return; }
    onLogin(data.session);
  };
  return (
    <div className="login-shell">
      <div className="login-card">
        <section className="login-hero">
          <div>
            <div className="brand-card" style={{boxShadow:'none',borderColor:'rgba(255,255,255,.16)',background:'rgba(255,255,255,.08)',width:'fit-content'}}>
              <div className="brand-logo-wrap"><SatcoLogo /></div>
              <div>
                <div className="portal-name">FINANCE PORTAL</div>
                <div className="brand-subtitle">Employee cost, payroll and P&amp;L portal</div>
              </div>
            </div>
            <h1>Finance work without the confusion.</h1>
            <p>Simple screens for salary, employee costs, timesheets, billing, WPS, and profit/loss tracking.</p>
            <div className="login-checks">
              <div>✓ Start from Dashboard for the big picture</div>
              <div>✓ Use Payroll for salaries and WPS</div>
              <div>✓ Use Costs and Revenue to keep P&amp;L clean</div>
            </div>
          </div>
          <p style={{fontSize:'12px',marginTop:'28px'}}>Designed for everyday finance users — clear, direct, and no unnecessary steps.</p>
        </section>
        <form onSubmit={submit} className="login-form">
          <h2>Sign in</h2>
          <div className="hint">Use your SATCO Finance account to continue.</div>
          <label style={S.label}>Email</label>
          <input style={{...S.input,width:'100%',marginBottom:'12px',padding:'11px 12px',borderRadius:'12px'}} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required />
          <label style={S.label}>Password</label>
          <input style={{...S.input,width:'100%',marginBottom:'16px',padding:'11px 12px',borderRadius:'12px'}} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required />
          {error&&<div className="login-error">{error}</div>}
          <button type="submit" disabled={loading} style={{...S.btnPri,width:'100%',padding:'12px 16px',borderRadius:'14px',fontSize:'14px'}}>{loading?'Signing in...':'Sign In'}</button>
        </form>
      </div>
    </div>
  );
}

// ── EMPLOYEE DETAIL PAGE (single-page entry for one employee) ─────
function EmployeeDetailPage({ employeeId, employeeName, employees, empMeta, hrSalaryRows, mobDemobByEmp, onBack }) {
  const meta = empMeta && empMeta[employeeId];
  const filt = { employee_id: employeeId, full_name: employeeName||'' };
  const [exporting, setExporting] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [recLoading, setRecLoading] = useState(true);
  const [lifetimeTotals, setLifetimeTotals] = useState({visa:0,flights:0,training:0,salary:0,other:0,ppe:0});
  const [incomeTotal, setIncomeTotal] = useState(0);

  const loadRecovery = async () => {
    setRecLoading(true);
    const [visa, flights, training, other, monthly, invoices, invoiceLines, invoiceRecoveries, ppe] = await Promise.all([
      db.from('employee_visa_costs').select('cost,recoverable,recoverable_amount').eq('employee_id',employeeId),
      db.from('employee_flights').select('cost,recoverable,recoverable_amount').eq('employee_id',employeeId),
      db.from('employee_training_costs').select('cost,recoverable,recoverable_amount').eq('employee_id',employeeId),
      db.from('employee_other_costs').select('amount,recoverable,cost_type,recovered_amount,notes').eq('employee_id',employeeId),
      db.from('employee_monthly_costs').select('salary_deductions,salary,food,accommodation,transport,other').eq('employee_id',employeeId),
      db.from('employee_client_invoices').select('id,month,received_amount_aed,wps_paid_aed,satco_rate_eur_hr,brunel_rate_eur_hr').eq('employee_id',employeeId),
      db.from('employee_client_invoice_lines').select('invoice_id,hours,rate_eur_hr'),
      db.from('employee_client_recoveries').select('amount_aed').eq('employee_id',employeeId),
      db.from('employee_ppe_issued').select('total_cost').eq('employee_id',employeeId),
    ]);
    // Uses the recoverable_amount cap when set (see recoverableCap), otherwise the full cost.
    const recoverableSum = (rows, amtKey) => (rows||[]).filter(r=>r.recoverable).reduce((s,r)=>s+recoverableCap(r,amtKey),0);
    const visaRecoverable     = recoverableSum(visa.data, 'cost');
    const flightsRecoverable  = recoverableSum(flights.data, 'cost');
    const trainingRecoverable = recoverableSum(training.data, 'cost');
    // Onboarding/Misc recoverable total — excludes security_deposit (that's income, tracked under
    // "recovered") and excludes wps_overpayment_recovery (handled separately just below, since that
    // cost type can be either invoice-synced or entered manually — see comment there).
    const otherRecoverable = (other.data||[]).filter(r=>r.recoverable && r.cost_type!=='security_deposit' && r.cost_type!=='wps_overpayment_recovery').reduce((s,r)=>s+(Number(r.amount)||0),0);

    // WPS overpayment vs employee's actual Client Billing share. Two sources, both counted:
    //  - Manual entries on Onboarding & Misc (no "[INV:id]" tag in notes) — e.g. Firangi's
    //    "WPS paid 1600 vs hourly-rate salary 1350" — use the stored amount directly.
    //  - Invoice-synced entries (tagged "[INV:id]") — recomputed live from the invoice
    //    (Received → implied FX rate → SATCO share → Employee share → vs WPS paid), identical
    //    formula to the P&L Dashboard and Client Billing's auto-repair, so all three agree.
    const manualWpsRows = (other.data||[]).filter(r=>r.cost_type==='wps_overpayment_recovery' && r.recoverable && !/\[INV:[^\]]+\]/.test(String(r.notes||'')));
    const manualWpsRecoverable = manualWpsRows.reduce((s,r)=>s+(Number(r.amount)||0),0);
    const manualWpsRecovered   = manualWpsRows.reduce((s,r)=>s+(Number(r.recovered_amount)||0),0);
    // Raw (un-gated) manual overpayment total — includes rows where "Recoverable" has been
    // manually unchecked (e.g. to be netted against next month's WPS instead of a salary
    // deduction). Used only for the factual Net WPS Position below, never for the recoverable pool.
    const manualWpsOverpaidRaw = (other.data||[]).filter(r=>r.cost_type==='wps_overpayment_recovery' && !/\[INV:[^\]]+\]/.test(String(r.notes||''))).reduce((s,r)=>s+(Number(r.amount)||0),0);

    const linesByInvoice = {};
    (invoiceLines.data||[]).forEach(l=>{ if(!linesByInvoice[l.invoice_id]) linesByInvoice[l.invoice_id]=[]; linesByInvoice[l.invoice_id].push(l); });
    // Synced employee_other_costs row per invoice ([INV:id] tag) — read here so a manual
    // "un-recoverable" override (e.g. it'll be netted against next month's WPS instead of a
    // salary deduction) isn't silently overwritten by re-deriving recoverable=true from the raw
    // invoice numbers every time this recalculates.
    const invoiceSyncMap = {};
    (other.data||[]).forEach(r=>{
      const m = String(r.notes||'').match(/\[INV:([^\]]+)\]/);
      if (m) invoiceSyncMap[m[1]] = r;
    });
    let invoiceWpsRecoverable = 0;
    let invoiceWpsOverpaidRaw = 0;
    let invoiceWpsPayable = 0;
    (invoices.data||[]).forEach(inv=>{
      const lns = linesByInvoice[inv.id]||[];
      const split = wpsInvoiceSplit(inv, lns);
      if (split.overpaid === null) return;
      const { overpaid } = split;
      const synced = invoiceSyncMap[inv.id];
      if (overpaid > 0.5) {
        // Raw fact (feeds Net WPS Position) — counts regardless of the manual "Recoverable" override.
        invoiceWpsOverpaidRaw += Math.round(overpaid*100)/100;
        // Recoverable pool (feeds Total Recoverable / salary-deduction suggestions) — respects the override.
        if (!synced || synced.recoverable) invoiceWpsRecoverable += Math.round(overpaid*100)/100;
      }
      else if (overpaid < -0.5) invoiceWpsPayable += Math.round(Math.abs(overpaid)*100)/100;
    });
    const wpsOverpaymentRecoverable = manualWpsRecoverable + invoiceWpsRecoverable;
    // Raw overpaid total — independent of the "Recoverable" checkbox. A row being marked
    // not-recoverable-via-salary doesn't erase the underlying fact that WPS paid more than the
    // employee's actual Client Billing share that month; it just means it'll be settled a
    // different way (netted against next month's WPS). Net WPS Position must use this, not the
    // gated pool, otherwise unchecking a row makes it vanish from the net instead of just moving
    // out of the salary-recovery bucket. Matches Client Billing tab's own Net WPS Position box.
    const wpsOverpaymentRaw = manualWpsOverpaidRaw + invoiceWpsOverpaidRaw;

    // WPS underpayment — the mirror image: months where WPS paid was less than the employee's
    // actual Client Billing share, so the company owes the employee, not the other way round.
    const manualWpsPayableRows = (other.data||[]).filter(r=>r.cost_type==='wps_underpayment_payable' && !/\[INV:[^\]]+\]/.test(String(r.notes||'')));
    const manualWpsPayable = manualWpsPayableRows.reduce((s,r)=>s+(Number(r.amount)||0),0);
    const wpsUnderpaymentPayable = manualWpsPayable + invoiceWpsPayable;

    const totalRecoverable = visaRecoverable + flightsRecoverable + trainingRecoverable + otherRecoverable + wpsOverpaymentRecoverable;

    const recoveredFromDeductions = (monthly.data||[]).reduce((s,r)=>s+(Number(r.salary_deductions)||0),0);
    const depositsReceived = (other.data||[]).filter(r=>r.cost_type==='security_deposit').reduce((s,r)=>s+(Number(r.amount)||0),0);
    const recoveredFromInvoices = (invoiceRecoveries.data||[]).reduce((s,r)=>s+(Number(r.amount_aed)||0),0) + manualWpsRecovered;
    const totalRecovered = recoveredFromDeductions + depositsReceived + recoveredFromInvoices;

    setRecovery({
      visaRecoverable, flightsRecoverable, trainingRecoverable, otherRecoverable, wpsOverpaymentRecoverable, totalRecoverable,
      recoveredFromDeductions, depositsReceived, recoveredFromInvoices, totalRecovered,
      balance: totalRecoverable - totalRecovered,
      wpsUnderpaymentPayable,
      // Net WPS position across this employee's whole history: positive = company still owes the
      // employee net of what's been recovered the other way; negative = employee still owes company.
      // Uses the raw (un-gated) overpaid total — this is a factual balance, not a to-do list — so
      // unchecking "Recoverable" on one invoice (because it'll be netted against next month's WPS
      // instead of a salary deduction) still nets correctly against other months' underpayments.
      netWpsPosition: wpsUnderpaymentPayable - Math.max(0, wpsOverpaymentRaw - recoveredFromInvoices),
    });

    // Lifetime totals (all entries, not just recoverable ones) for the Totals summary card.
    // "Salary" here is the sum of each month's Net Total (Salary+Food+Accom+Transport+Other−Deductions) —
    // matching the Net Total column on the Monthly Costs tab, i.e. the actual total paid out per month —
    // not just the bare salary field.
    const sumAll = (rows, amtKey) => (rows||[]).reduce((s,r)=>s+(Number(r[amtKey])||0),0);
    const monthlyNetTotal = (monthly.data||[]).reduce((s,r)=>
      s + (Number(r.salary)||0)+(Number(r.food)||0)+(Number(r.accommodation)||0)+(Number(r.transport)||0)+(Number(r.other)||0)-(Number(r.salary_deductions)||0)
    ,0);
    // Onboarding/Misc actual costs (agent commission, salary advance, camp costs, etc.) — excludes
    // security_deposit (income, not a cost) and wps_overpayment_recovery/wps_underpayment_payable
    // (WPS timing differences, not extra operating cost — see P&L Dashboard's rawPnlMap for the
    // matching exclusion). Previously this whole table was left out of Lifetime Totals entirely,
    // which understated Costs / overstated Net here vs the P&L Dashboard for any employee with a
    // genuine Onboarding & Misc cost on file.
    const otherActual = (other.data||[]).filter(r=>
      r.cost_type!=='security_deposit' && r.cost_type!=='wps_overpayment_recovery' && r.cost_type!=='wps_underpayment_payable'
    ).reduce((s,r)=>s+(Number(r.amount)||0),0);
    setLifetimeTotals({
      visa:     sumAll(visa.data, 'cost'),
      flights:  sumAll(flights.data, 'cost'),
      training: sumAll(training.data, 'cost'),
      salary:   monthlyNetTotal,
      other:    otherActual,
      ppe:      sumAll(ppe.data, 'total_cost'),
    });
    setRecLoading(false);
  };
  useEffect(()=>{ loadRecovery(); },[employeeId]);

  const loadIncomeTotal = async () => {
    const { data } = await db.from('employee_timesheets').select('hours,rate').eq('employee_id',employeeId);
    const total = (data||[]).reduce((s,r)=>s+(Number(r.hours)||0)*(Number(r.rate)||0),0);
    setIncomeTotal(total);
  };
  useEffect(()=>{ loadIncomeTotal(); },[employeeId]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const [visa, flights, training, other, monthly, timesheets, ppe] = await Promise.all([
        db.from('employee_visa_costs').select('*').eq('employee_id',employeeId).order('cost_date',{ascending:false}),
        db.from('employee_flights').select('*').eq('employee_id',employeeId).order('flight_date',{ascending:false}),
        db.from('employee_training_costs').select('*').eq('employee_id',employeeId).order('training_date',{ascending:false}),
        db.from('employee_other_costs').select('*').eq('employee_id',employeeId).order('cost_date',{ascending:false}),
        db.from('employee_monthly_costs').select('*').eq('employee_id',employeeId).order('month',{ascending:false}),
        db.from('employee_timesheets').select('*').eq('employee_id',employeeId).order('month',{ascending:false}),
        db.from('employee_ppe_issued').select('*').eq('employee_id',employeeId).order('issue_date',{ascending:false}),
      ]);
      exportMultiSectionCSV([
        { title: `Visa Costs — ${employeeName} (${employeeId})`, rows: visa.data||[],
          cols: [{key:'visa_type',label:'Visa Type'},{key:'cost_date',label:'Date'},{key:'cost',label:'Cost (AED)'},{key:'recoverable',label:'Recoverable'},{key:'remarks',label:'Remarks'}] },
        { title: `Flight Tickets — ${employeeName} (${employeeId})`, rows: flights.data||[],
          cols: [{key:'flight_date',label:'Date'},{key:'sector',label:'Sector'},{key:'purpose',label:'Purpose'},{key:'cost',label:'Cost (AED)'},{key:'recoverable',label:'Recoverable'},{key:'remarks',label:'Remarks'}] },
        { title: `Training Costs — ${employeeName} (${employeeId})`, rows: training.data||[],
          cols: [{key:'training_name',label:'Training Name'},{key:'training_date',label:'Date'},{key:'cost',label:'Cost (AED)'},{key:'recoverable',label:'Recoverable'},{key:'remarks',label:'Remarks'}] },
        { title: `Onboarding & Misc Costs — ${employeeName} (${employeeId})`, rows: other.data||[],
          cols: [{key:'cost_type',label:'Cost Type'},{key:'cost_date',label:'Date'},{key:'amount',label:'Amount (AED)'},{key:'original_currency',label:'Orig Currency'},{key:'original_amount',label:'Orig Amount'},{key:'exchange_rate',label:'Exchange Rate'},{key:'recoverable',label:'Recoverable'},{key:'recovered_amount',label:'Recovered'},{key:'notes',label:'Remarks'}] },
        { title: `Monthly Costs — ${employeeName} (${employeeId})`, rows: monthly.data||[],
          cols: [{key:'month',label:'Month'},{key:'salary_type',label:'Type'},{key:'salary',label:'Salary Paid'},{key:'computed_salary',label:'Calculated Salary'},{key:'manual_override',label:'Overridden?'},{key:'basic_salary',label:'Basic Salary'},{key:'fixed_allowance',label:'Fixed Allowance'},{key:'working_days',label:'Working Days'},{key:'month_days',label:'Days in Month'},{key:'normal_ot_hours',label:'Normal OT Hrs'},{key:'holiday_ot_hours',label:'Holiday OT Hrs'},{key:'food',label:'Food'},{key:'accommodation',label:'Accommodation'},{key:'transport',label:'Transport'},{key:'other',label:'Other'},{key:'salary_deductions',label:'Deductions'},{key:'hours_worked',label:'Hours'},{key:'hourly_rate',label:'Rate'},{key:'remarks',label:'Remarks'}] },
        { title: `Timesheets / Income — ${employeeName} (${employeeId})`, rows: timesheets.data||[],
          cols: [{key:'month',label:'Month'},{key:'client_project',label:'Client/Project'},{key:'income_type',label:'Mode'},{key:'hours',label:'Hours'},{key:'rate',label:'Rate'},{key:'remarks',label:'Remarks'}] },
        { title: `PPE & Uniforms Issued — ${employeeName} (${employeeId})`, rows: ppe.data||[],
          cols: [{key:'issue_date',label:'Issue Date'},{key:'coverall_size',label:'Coverall Size'},{key:'coverall_qty',label:'Coverall Qty'},{key:'shoes_size',label:'Shoes Size'},{key:'shoes_qty',label:'Shoes Qty'},{key:'goggles_qty',label:'Goggles Qty'},{key:'total_cost',label:'Cost (AED)'},{key:'notes',label:'Remarks'}] },
      ], 'employee_'+employeeId);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginTop:'4px',marginBottom:'18px',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'14px',flexWrap:'wrap'}}>
          <button onClick={onBack} style={{display:'flex',alignItems:'center',gap:'6px',padding:'10px 18px',borderRadius:'8px',border:'none',background:'#0f172a',color:'#fff',fontWeight:700,fontSize:'13.5px',cursor:'pointer',boxShadow:'0 2px 6px rgba(15,23,42,0.25)'}}>
            <span style={{fontSize:'16px'}}>&#8592;</span> Back to Dashboard
          </button>
          <div>
            <div style={{fontWeight:800,fontSize:'17px'}}>{employeeName} <span style={{fontFamily:'ui-monospace,monospace',color:'#2563eb',fontWeight:700,fontSize:'13px'}}>({employeeId})</span></div>
            <div style={{fontSize:'12px',color:'#64748b'}}>All visa, flight, training, onboarding, monthly cost &amp; income entries for this employee</div>
          </div>
        </div>
        <button style={S.btnExp} disabled={exporting} onClick={exportAll}>{exporting?'Preparing…':'Export CSV (all sections)'}</button>
      </div>

      <div style={{...S.card,marginBottom:'16px',overflow:'hidden',width:'fit-content',maxWidth:'360px'}}>
        <table style={{borderCollapse:'collapse',fontSize:'13px'}}>
          <thead>
            <tr style={{background:'#0f172a'}}>
              <th style={{textAlign:'left',padding:'10px 14px',color:'#fff',fontWeight:700,fontSize:'11.5px',textTransform:'uppercase',letterSpacing:'.04em'}}>Cost Head</th>
              <th style={{textAlign:'right',padding:'10px 14px',color:'#fff',fontWeight:700,fontSize:'11.5px',textTransform:'uppercase',letterSpacing:'.04em'}}>AED</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Visa', lifetimeTotals.visa, false],
              ['Flight', lifetimeTotals.flights, false],
              ['Training', lifetimeTotals.training, false],
              ['Salary', lifetimeTotals.salary, false],
              ['Other (Onboarding/Misc)', lifetimeTotals.other, false],
              ['PPE & Uniforms', lifetimeTotals.ppe, false],
            ].map(([label,val])=>(
              <tr key={label} style={{borderTop:'1px solid #f1f5f9'}}>
                <td style={{padding:'8px 14px',fontWeight:600,color:'#334155',whiteSpace:'nowrap'}}>{label}</td>
                <td style={{padding:'8px 14px',textAlign:'right',fontWeight:700,color:'#dc2626',whiteSpace:'nowrap'}}>{fmt(val)}</td>
              </tr>
            ))}
            <tr style={{borderTop:'1px solid #f1f5f9',background:'#fef2f2'}}>
              <td style={{padding:'8px 14px',fontWeight:800,color:'#0f172a',whiteSpace:'nowrap'}}>Total Cost</td>
              <td style={{padding:'8px 14px',textAlign:'right',fontWeight:800,color:'#dc2626',whiteSpace:'nowrap'}}>{fmt(lifetimeTotals.visa+lifetimeTotals.flights+lifetimeTotals.training+lifetimeTotals.salary+lifetimeTotals.other+lifetimeTotals.ppe)}</td>
            </tr>
            <tr style={{borderTop:'1px solid #f1f5f9'}}>
              <td style={{padding:'8px 14px',fontWeight:600,color:'#334155',whiteSpace:'nowrap'}}>Income</td>
              <td style={{padding:'8px 14px',textAlign:'right',fontWeight:700,color:'#166534',whiteSpace:'nowrap'}}>{fmt(incomeTotal)}</td>
            </tr>
            <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
              <td style={{padding:'8px 14px',fontWeight:800,color:'#0f172a',whiteSpace:'nowrap'}}>Net (Income − Costs)</td>
              <td style={{padding:'8px 14px',textAlign:'right',fontWeight:800,whiteSpace:'nowrap'}}><AmountTag value={incomeTotal-(lifetimeTotals.visa+lifetimeTotals.flights+lifetimeTotals.training+lifetimeTotals.salary+lifetimeTotals.other+lifetimeTotals.ppe)} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {meta && (
        <div style={{...S.card,marginBottom:'16px',padding:'14px 18px'}}>
          <div style={{fontWeight:800,fontSize:'14px',marginBottom:'8px'}}>HR Snapshot</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',fontSize:'12.5px'}}>
            {[['Position',meta.position],['Nationality',meta.nationality],['Joining Date',meta.joining_date],['Status',meta.status],['Hired From',meta.hired_from],['Supplier / Agent',meta.supplier_name],['Mobilization Date',meta.mobilization_date],['Site / Location',meta.location]].map(([k,v])=>(
              <div key={k}><div style={{color:'#94a3b8',fontWeight:600}}>{k}</div><div style={{fontWeight:700}}>{v||'—'}</div></div>
            ))}
          </div>
        </div>
      )}

      <div style={{...S.card,marginBottom:'16px',padding:'14px 18px'}}>
        <div style={{fontWeight:800,fontSize:'14px',marginBottom:'10px'}}>Lifetime Totals — {employeeName}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:'10px',fontSize:'12.5px'}}>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Visa Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.visa)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Flights Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.flights)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Training Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.training)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Salary Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.salary)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Other Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.other)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>PPE Total</div><div style={{fontWeight:700}}>AED {fmt(lifetimeTotals.ppe)}</div></div>
          <div><div style={{color:'#94a3b8',fontWeight:600}}>Income Total</div><div style={{fontWeight:700,color:'#166534'}}>AED {fmt(incomeTotal)}</div></div>
          <div>
            <div style={{color:'#94a3b8',fontWeight:600}}>Net (Income − Costs)</div>
            {/* Effective net: gross costs minus amounts already recovered from salary — matches P&L Dashboard */}
            {recovery && recovery.totalRecovered>0
              ? <div style={{fontWeight:800}}>
                  <AmountTag value={incomeTotal-(lifetimeTotals.visa+lifetimeTotals.flights+lifetimeTotals.training+lifetimeTotals.salary+lifetimeTotals.other+lifetimeTotals.ppe)+recovery.totalRecovered} />
                  <div style={{fontSize:'9.5px',color:'#94a3b8',fontWeight:600,marginTop:'2px'}}>net of AED {fmt(recovery.totalRecovered)} recovered</div>
                </div>
              : <div style={{fontWeight:800}}><AmountTag value={incomeTotal-(lifetimeTotals.visa+lifetimeTotals.flights+lifetimeTotals.training+lifetimeTotals.salary+lifetimeTotals.other+lifetimeTotals.ppe)} /></div>
            }
          </div>
        </div>
      </div>

      {!recLoading && recovery && (recovery.totalRecoverable>0 || recovery.wpsUnderpaymentPayable>0) && (
        <div style={{...S.card,marginBottom:'16px',padding:'14px 18px',background:'#fffbeb',border:'1px solid #fbbf24'}}>
          <div style={{fontWeight:800,fontSize:'14px',marginBottom:'10px',color:'#92400e'}}>Recovery Summary — money owed between {employeeName.split(' ')[0]} and SATCO</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'10px',fontSize:'12.5px',marginBottom:'10px'}}>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>Visa (recoverable)</div><div style={{fontWeight:700}}>AED {fmt(recovery.visaRecoverable)}</div></div>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>Flights (recoverable)</div><div style={{fontWeight:700}}>AED {fmt(recovery.flightsRecoverable)}</div></div>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>Training (recoverable)</div><div style={{fontWeight:700}}>AED {fmt(recovery.trainingRecoverable)}</div></div>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>Onboarding/Misc (recoverable)</div><div style={{fontWeight:700}}>AED {fmt(recovery.otherRecoverable)}</div></div>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>WPS Overpaid vs Billing</div><div style={{fontWeight:700}}>AED {fmt(recovery.wpsOverpaymentRecoverable)}</div></div>
            <div><div style={{color:'#94a3b8',fontWeight:600}}>WPS Underpaid (payable to employee)</div><div style={{fontWeight:700,color:recovery.wpsUnderpaymentPayable>0?'#1d4ed8':'inherit'}}>AED {fmt(recovery.wpsUnderpaymentPayable)}</div></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'10px',fontSize:'13px',paddingTop:'10px',borderTop:'1px solid #fde68a'}}>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>Total Recoverable</div><div style={{fontWeight:800,fontSize:'16px'}}>AED {fmt(recovery.totalRecoverable)}</div></div>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>Recovered (salary deductions)</div><div style={{fontWeight:800,fontSize:'16px',color:'#166534'}}>AED {fmt(recovery.recoveredFromDeductions)}</div></div>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>+ Deposits Received</div><div style={{fontWeight:800,fontSize:'16px',color:'#166534'}}>AED {fmt(recovery.depositsReceived)}</div></div>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>+ WPS Recoveries Logged</div><div style={{fontWeight:800,fontSize:'16px',color:'#166534'}}>AED {fmt(recovery.recoveredFromInvoices)}</div></div>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>Balance to Recover</div><div style={{fontWeight:800,fontSize:'16px',color:recovery.balance>0?'#dc2626':'#166534'}}>AED {fmt(Math.abs(recovery.balance))}{recovery.balance<0?' (over-recovered)':''}</div></div>
            <div><div style={{color:'#92400e',fontWeight:700,fontSize:'11px',textTransform:'uppercase'}}>Net WPS Position</div><div style={{fontWeight:800,fontSize:'16px',color:Math.abs(recovery.netWpsPosition)<=0.5?'#166534':recovery.netWpsPosition>0?'#1d4ed8':'#dc2626'}}>{Math.abs(recovery.netWpsPosition)<=0.5?'Settled':(recovery.netWpsPosition>0?'Owe employee ':'Employee owes ')+'AED '+fmt(Math.abs(recovery.netWpsPosition))}</div></div>
          </div>
          <div style={{fontSize:'11px',color:'#92400e',marginTop:'10px'}}><strong>P&amp;L impact:</strong> As amounts are recovered from this employee&apos;s salary, the <em>Total Expense</em> on the P&amp;L Dashboard reduces by the same amount and Net P/L improves — the P&amp;L always shows the company&apos;s <em>net</em> cost, not the gross upfront cost. Recovered = Deductions entered each month in Monthly Costs + Deposits Received + WPS Overpaid recovered + WPS recoveries logged on Client Billing. WPS Underpaid is carried separately as a payable (money the company owes the employee, since WPS is paid before the client invoice settles) and is not deducted from expense. To recover costs, enter the deduction amount when adding/editing the monthly salary record.</div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
        <CostTable title={'Visa Costs — '+employeeName} table="employee_visa_costs" employees={employees} dateField="cost_date" initialFilter={filt} hideEmpFilter hideExportButton recoverableSupport
          fields={[{key:'visa_type',label:'Visa Type',type:'select',options:['visit_visa','residence_visa','employment_entry_permit','visa_transfer','renewal','cancellation']},{key:'cost_date',label:'Date',type:'date'},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />

        <CostTable title={'Flight Tickets — '+employeeName} table="employee_flights" employees={employees} dateField="flight_date" initialFilter={filt} hideEmpFilter hideExportButton recoverableSupport
          fields={[{key:'flight_date',label:'Date',type:'date'},{key:'sector',label:'Sector',type:'text'},{key:'purpose',label:'Purpose',type:'select',options:['mobilization','demobilization','annual_leave','emergency']},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />

        <CostTable title={'Training Costs — '+employeeName} table="employee_training_costs" employees={employees} dateField="training_date" initialFilter={filt} hideEmpFilter hideExportButton recoverableSupport
          fields={[{key:'training_name',label:'Training Name',type:'text'},{key:'training_date',label:'Date',type:'date'},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />

        <OtherCostsTable employees={employees} initialFilter={filt} hideEmpFilter hideExportButton />

        <MonthlyCostsTable employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} initialFilter={filt} hideEmpFilter hideExportButton />

        <TimesheetsTable employees={employees} initialFilter={filt} hideEmpFilter hideExportButton />

        <ClientBillingTab employees={employees} initialFilter={filt} hideEmpFilter />

        <CampCostsTab employees={employees} empMeta={empMeta} mobDemobByEmp={mobDemobByEmp||{}} initialFilter={filt} hideEmpFilter />

        <PpeIssuedTable employees={employees} initialFilter={filt} hideEmpFilter hideExportButton />
      </div>
    </div>
  );
}

// ── SALARY PROFILES TAB ──────────────────────────────────────────
// One row per employee: basic salary + fixed allowance, set once and correctable.
// HR values are shown as the source; Finance can save/correct a local profile.
function SalaryProfilesTab({ employees, empMeta, hrSalaryRows=[], hrSalaryStatus={} }) {
  const [profiles,   setProfiles]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [draft,      setDraft]      = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [syncing,    setSyncing]    = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await db.from('employee_salary_profiles').select('*').order('employee_id');
    if (error) console.error('Salary profile load failed:', error);
    setProfiles(data || []);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const profileByEmp = useMemo(()=>{
    const m = {};
    profiles.forEach(p=>{ m[p.employee_id]=p; });
    return m;
  },[profiles]);
  const hrByEmp = useMemo(()=>salaryMapFromRows(hrSalaryRows||[]), [hrSalaryRows]);

  const rows = useMemo(()=>{
    return employees
      .filter(e=>!e.is_temp)
      .filter(e=>{
        if (!search) return true;
        const q = search.toLowerCase();
        return String(e.employee_id||'').toLowerCase().includes(q) || String(e.full_name||'').toLowerCase().includes(q);
      })
      .map(e=>({
        ...e,
        meta: empMeta[e.employee_id]||{},
        profile: profileByEmp[e.employee_id]||null,
        hr: hrByEmp[e.employee_id]||null,
      }));
  },[employees, empMeta, profileByEmp, hrByEmp, search]);

  const openEdit = (row) => {
    const hr = row.hr || {};
    setDraft({
      employee_id: row.employee_id,
      full_name:   row.full_name || hr.full_name,
      basic_salary:    row.profile ? row.profile.basic_salary : (hr.basic_salary ?? ''),
      fixed_allowance: row.profile ? row.profile.fixed_allowance : (hr.fixed_allowance ?? ''),
      effective_date:  row.profile ? (row.profile.effective_date||'') : '',
      remarks:         row.profile ? (row.profile.remarks||'') : (hr.employee_id ? 'Pulled from HR portal — editable by Finance/HR' : ''),
      _existing_id:    row.profile ? row.profile.id : null,
      _hr_basic:       hr.basic_salary ?? '',
      _hr_allowance:   hr.fixed_allowance ?? '',
    });
  };

  const save = async () => {
    if (!draft.employee_id) return alert('No employee selected.');
    const basic = Number(draft.basic_salary)||0;
    const allow = Number(draft.fixed_allowance)||0;
    if (basic < 0 || allow < 0) return alert('Amounts cannot be negative.');
    setSaving(true);
    const payload = {
      employee_id:     draft.employee_id,
      full_name:       draft.full_name||null,
      basic_salary:    basic,
      fixed_allowance: allow,
      effective_date:  draft.effective_date||null,
      remarks:         draft.remarks||null,
      updated_at:      new Date().toISOString(),
    };
    const { error } = await db.from('employee_salary_profiles').upsert(payload, { onConflict:'employee_id' });
    setSaving(false);
    if (error) return alert(error.message);
    setDraft(null);
    load();
  };

  const syncFromHr = async (overwrite=false) => {
    const hrRows = (hrSalaryRows||[]).filter(r=>r.employee_id && ((Number(r.basic_salary)||0)>0 || (Number(r.fixed_allowance)||0)>0));
    if (!hrRows.length) return alert('No HR salary rows available. Check HR access / RLS first.');
    if (overwrite && !window.confirm('Overwrite existing Finance salary profiles with HR values?')) return;
    setSyncing(true);
    const existing = profileByEmp;
    const payload = hrRows
      .filter(r=>overwrite || !existing[r.employee_id])
      .map(r=>({
        employee_id:r.employee_id,
        full_name:r.full_name||null,
        basic_salary:Number(r.basic_salary)||0,
        fixed_allowance:Number(r.fixed_allowance)||0,
        effective_date:null,
        remarks:(overwrite?'HR sync overwrite':'HR sync initial')+' — '+new Date().toISOString().slice(0,10),
        updated_at:new Date().toISOString(),
      }));
    if (!payload.length) { setSyncing(false); return alert('All HR salary rows already have Finance profiles. Use overwrite if you want to refresh them.'); }
    const { error } = await db.from('employee_salary_profiles').upsert(payload, { onConflict:'employee_id' });
    setSyncing(false);
    if (error) return alert(error.message);
    load();
  };

  const del = async (id) => {
    if (!window.confirm('Remove salary profile for this employee?')) return;
    await db.from('employee_salary_profiles').delete().eq('id', id);
    load();
  };

  const totalBasic = profiles.reduce((s,p)=>s+(Number(p.basic_salary)||0),0);
  const totalAllow = profiles.reduce((s,p)=>s+(Number(p.fixed_allowance)||0),0);
  const hrCount = (hrSalaryRows||[]).filter(r=>(Number(r.basic_salary)||0)>0 || (Number(r.fixed_allowance)||0)>0).length;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <h2 style={{margin:0,fontSize:'17px',fontWeight:800}}>💼 Salary Master — HR Pull + Finance Correction</h2>
          <div style={{fontSize:'12px',color:'#64748b',marginTop:'3px'}}>
            Basic salary and fixed allowance are entered/synced once. Monthly Costs and WPS can use this master instead of monthly re-entry.
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <input placeholder="Search employee…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{padding:'7px 12px',borderRadius:'8px',border:'1px solid #e2e8f0',fontSize:'13px',width:'200px'}} />
          <button onClick={()=>syncFromHr(false)} disabled={syncing || !hrCount} style={{...S.btnExp,opacity:(syncing||!hrCount)?0.6:1}}>⬇ Sync Missing from HR</button>
          <button onClick={()=>syncFromHr(true)} disabled={syncing || !hrCount} style={{...S.btnPri,background:'#7c3aed',opacity:(syncing||!hrCount)?0.6:1}}>↻ Overwrite from HR</button>
        </div>
      </div>

      {hrSalaryStatus.error ? (
        <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'12px 16px',marginBottom:'14px',fontSize:'12px',color:'#991b1b'}}>
          <div style={{fontWeight:800,marginBottom:'4px'}}>⚠️ HR salary pull is blocked or the HR view is missing.</div>
          <div style={{marginBottom:'6px'}}>{hrSalaryStatus.error}</div>
          {hrSalaryStatus.error && hrSalaryStatus.error.includes('permission denied') && (
            <div style={{background:'#fff3cd',border:'1px solid #ffc107',borderRadius:'6px',padding:'8px 12px',marginBottom:'8px',color:'#856404',fontWeight:700,fontSize:'11.5px'}}>
              🔧 <strong>Fix:</strong> The HR Supabase view reads from <code>public.employees</code> but the <code>anon</code> role lacks SELECT permission on that base table.
              Run the SQL below in the <strong>HR Supabase SQL Editor</strong> (project: oaerqjrkdpuhiproppaz) to fix:
              <pre style={{background:'#1e293b',color:'#f8fafc',padding:'8px 10px',borderRadius:'6px',fontSize:'11px',marginTop:'6px',overflowX:'auto',whiteSpace:'pre'}}>GRANT SELECT ON public.employees TO anon, authenticated;
GRANT SELECT ON public.mob_demob TO anon, authenticated;
GRANT SELECT ON public.hiring_pipeline TO anon, authenticated;
NOTIFY pgrst, 'reload schema';</pre>
            </div>
          )}
          <details style={{marginTop:'4px'}}>
            <summary style={{cursor:'pointer',fontWeight:700}}>Show full HR bridge SQL (run in HR Supabase SQL Editor)</summary>
            <pre style={{background:'#1e293b',color:'#f8fafc',padding:'10px 12px',borderRadius:'8px',fontSize:'11px',overflowX:'auto',whiteSpace:'pre',marginTop:'8px'}}>{HR_SALARY_VIEW_SQL}</pre>
          </details>
        </div>
      ) : (
        <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'10px',padding:'10px 14px',marginBottom:'14px',fontSize:'12px',color:'#166534',fontWeight:700}}>
          ✅ HR salary bridge loaded {hrSalaryRows.length} employee row(s){hrSalaryStatus.source ? ` from ${hrSalaryStatus.source}` : ''}. Finance can still correct any value locally.
        </div>
      )}

      <div style={{display:'flex',gap:'12px',marginBottom:'14px',flexWrap:'wrap'}}>
        {[
          ['Finance Profiles Set', profiles.length, '#2563eb'],
          ['HR Salary Rows', hrCount, '#0f766e'],
          ['Total Basic Salary / Mo', 'AED '+fmt(totalBasic), '#166534'],
          ['Total Fixed Allowance / Mo', 'AED '+fmt(totalAllow), '#7c3aed'],
          ['Finance Payroll / Mo', 'AED '+fmt(totalBasic+totalAllow), '#b45309'],
        ].map(([lbl,val,col])=>(
          <div key={lbl} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'10px 16px',minWidth:'150px'}}>
            <div style={{fontSize:'11px',color:'#64748b',fontWeight:600}}>{lbl}</div>
            <div style={{fontSize:'17px',fontWeight:800,color:col,marginTop:'2px'}}>{val}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{color:'#94a3b8',padding:'20px'}}>Loading…</div> : (
        <div className="drag-scroll" style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
            <thead>
              <tr style={{background:'#f8fafc'}}>
                {['Emp ID','Name','Position','HR Basic','HR Allowance','Finance Basic','Finance Allowance','Total / Mo','Status','Remarks',''].map(h=>(
                  <th key={h} style={{...S.th,textAlign:['HR Basic','HR Allowance','Finance Basic','Finance Allowance','Total / Mo'].includes(h)?'right':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && <tr><td colSpan={11} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>No employees found.</td></tr>}
              {rows.map(row=>{
                const p = row.profile;
                const hr = row.hr;
                const basic = p ? Number(p.basic_salary)||0 : (hr ? Number(hr.basic_salary)||0 : 0);
                const allow = p ? Number(p.fixed_allowance)||0 : (hr ? Number(hr.fixed_allowance)||0 : 0);
                const status = p ? (String(p.remarks||'').toLowerCase().includes('hr sync') ? 'Saved from HR' : 'Finance corrected') : (hr ? 'HR available — not saved' : 'Not set');
                return (
                  <tr key={row.employee_id} style={{borderBottom:'1px solid #f1f5f9',background:!p&&hr?'#f8fafc':'#fff'}}>
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{row.employee_id}</td>
                    <td style={S.td}>{row.full_name}</td>
                    <td style={{...S.td,color:'#64748b',fontSize:'12px'}}>{row.meta.position||hr?.position||'—'}</td>
                    <td style={{...S.td,textAlign:'right',color:hr?'#0f766e':'#cbd5e1'}}>{hr ? 'AED '+fmt(hr.basic_salary||0) : '—'}</td>
                    <td style={{...S.td,textAlign:'right',color:hr?'#0f766e':'#cbd5e1'}}>{hr ? 'AED '+fmt(hr.fixed_allowance||0) : '—'}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:p?800:500,color:p?'#166534':'#94a3b8'}}>{p ? 'AED '+fmt(p.basic_salary) : (hr?'preview':'not set')}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:p?700:500,color:p?'#7c3aed':'#94a3b8'}}>{p ? 'AED '+fmt(p.fixed_allowance) : (hr?'preview':'—')}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:800,color:(p||hr)?'#b45309':'#94a3b8'}}>{(p||hr) ? 'AED '+fmt(basic+allow) : '—'}</td>
                    <td style={S.td}><span style={{background:p?'#dcfce7':hr?'#e0f2fe':'#f1f5f9',color:p?'#166534':hr?'#0369a1':'#64748b',fontSize:'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px'}}>{status}</span></td>
                    <td style={{...S.td,fontSize:'12px',color:'#64748b',maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p&&p.remarks||'—'}</td>
                    <td style={{...S.td,textAlign:'center'}}>
                      <div style={{display:'flex',gap:'6px',justifyContent:'center'}}>
                        <button onClick={()=>openEdit(row)} style={{...S.btnPri,padding:'4px 12px',fontSize:'12px',background:'#2563eb'}}>
                          {p ? '✏️ Correct' : (hr?'Save/Correct':'+ Set')}
                        </button>
                        {p && <button onClick={()=>del(p.id)} style={{...S.btnSec,padding:'4px 10px',fontSize:'12px',color:'#dc2626',border:'1px solid #fecaca'}}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:'14px',padding:'28px',width:'560px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',maxHeight:'90vh',overflowY:'auto'}}>
            <h3 style={{margin:'0 0 4px',fontSize:'16px',fontWeight:800}}>
              {draft._existing_id ? '✏️ Correct Salary Profile' : '+ Set Salary Profile'}
            </h3>
            <div style={{fontSize:'12px',color:'#64748b',marginBottom:'14px'}}>{draft.employee_id} — {draft.full_name}</div>
            {(draft._hr_basic!=='' || draft._hr_allowance!=='') && (
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'10px 12px',marginBottom:'14px',fontSize:'12px',color:'#1e40af'}}>
                HR portal value: Basic <strong>AED {fmt(draft._hr_basic||0)}</strong> + Allowance <strong>AED {fmt(draft._hr_allowance||0)}</strong>
                <button onClick={()=>setDraft(d=>({...d,basic_salary:d._hr_basic||'',fixed_allowance:d._hr_allowance||'',remarks:'Corrected back to HR portal value'}))} style={{...S.btnPri,background:'#1d4ed8',padding:'4px 10px',fontSize:'11px',marginLeft:'10px'}}>Use HR value</button>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
              <div>
                <label style={S.label}>Basic Salary (AED) *</label>
                <input type="number" value={draft.basic_salary} onChange={e=>setDraft(d=>({...d,basic_salary:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. 3000" min="0" />
              </div>
              <div>
                <label style={S.label}>Fixed Monthly Allowance (AED)</label>
                <input type="number" value={draft.fixed_allowance} onChange={e=>setDraft(d=>({...d,fixed_allowance:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. 500" min="0" />
              </div>
            </div>
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'10px 14px',marginBottom:'14px',fontSize:'13px'}}>
              💰 Monthly WPS total: <strong>AED {fmt((Number(draft.basic_salary)||0)+(Number(draft.fixed_allowance)||0))}</strong>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
              <div><label style={S.label}>Effective From</label><input type="date" value={draft.effective_date} onChange={e=>setDraft(d=>({...d,effective_date:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
              <div><label style={S.label}>Remarks / Correction Reason</label><input type="text" value={draft.remarks} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. allowance corrected by HR" /></div>
            </div>
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button onClick={()=>setDraft(null)} style={S.btnSec}>Cancel</button>
              <button onClick={save} disabled={saving} style={{...S.btnPri,opacity:saving?0.6:1}}>{saving ? 'Saving…' : 'Save Profile'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DEDUCTION LEDGER TAB ──────────────────────────────────────────
// HR uses this to log approved deductions (visa recovery, deposit, advance, etc.)
// Finance sees it as read-only context when deciding what to put in Monthly Costs → Deductions.
function DeductionLedgerTab({ employees, empMeta }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft,   setDraft]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [filter,  setFilter]  = useState('');
  const [financeReview, setFinanceReview] = useState([]);

  const TYPES = [
    {value:'visa_recovery',              label:'Visa Cost Recovery'},
    {value:'security_deposit_recovery',  label:'Security Deposit Recovery'},
    {value:'salary_advance_recovery',    label:'Salary Advance Recovery'},
    {value:'flight_recovery',            label:'Flight Ticket Recovery'},
    {value:'training_recovery',          label:'Training Cost Recovery'},
    {value:'other',                      label:'Other Deduction'},
  ];

  const load = async () => {
    setLoading(true);
    const [ledger, other, monthly] = await Promise.all([
      db.from('employee_deduction_ledger').select('*').order('created_at',{ascending:false}),
      db.from('employee_other_costs').select('id,employee_id,full_name,cost_type,cost_date,amount,recoverable,recovered_amount,notes').order('cost_date',{ascending:false}),
      db.from('employee_monthly_costs').select('id,employee_id,full_name,month,salary_deductions,remarks').gt('salary_deductions',0).order('month',{ascending:false}),
    ]);
    setRows(ledger.data||[]);
    const signals = [];
    (other.data||[]).forEach(r=>{
      const amount = Number(r.amount)||0;
      const recovered = Number(r.recovered_amount)||0;
      if (r.cost_type==='security_deposit') signals.push({...r, review_type:'Deposit received from employee', review_amount:amount, suggested_type:'security_deposit_recovery', info_only:true});
      else if (r.recoverable && amount>recovered) signals.push({...r, review_type:'Recoverable cost pending', review_amount:amount-recovered, suggested_type:r.cost_type==='salary_advance'?'salary_advance_recovery':'other', info_only:false});
    });
    (monthly.data||[]).forEach(r=>signals.push({
      ...r, cost_date:r.month, cost_type:'monthly_salary_deduction', review_type:'Deduction already applied in Monthly Costs',
      review_amount:Number(r.salary_deductions)||0, suggested_type:'other', info_only:true, notes:r.remarks
    }));
    setFinanceReview(signals);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const blank = () => setDraft({
    employee_id:'', full_name:'', deduction_type:'visa_recovery',
    amount:'', approved_by:'', advance_date:'', effective_month:'', deducted_month:'', notes:'', status:'pending',
  });

  const save = async () => {
    if (!draft.employee_id) return alert('Employee required.');
    if (!(Number(draft.amount)>0)) return alert('Amount must be > 0.');
    setSaving(true);
    const payload = {
      employee_id:   draft.employee_id,
      full_name:     draft.full_name||null,
      deduction_type: draft.deduction_type,
      amount:        Number(draft.amount),
      approved_by:   draft.approved_by||null,
      advance_date:  draft.advance_date||null,
      effective_month: draft.effective_month||null,
      deducted_month: draft.status==='applied' ? (draft.deducted_month||draft.effective_month||null) : null,
      notes:         draft.notes||null,
      status:        draft.status||'pending',
      updated_at:    new Date().toISOString(),
    };
    if (draft.id) {
      await db.from('employee_deduction_ledger').update(payload).eq('id', draft.id);
    } else {
      await db.from('employee_deduction_ledger').insert(payload);
    }
    setSaving(false);
    setDraft(null);
    load();
  };

  const del = async (id) => {
    if (!window.confirm('Delete this deduction entry?')) return;
    await db.from('employee_deduction_ledger').delete().eq('id', id);
    load();
  };

  const createFromFinanceReview = (r) => setDraft({
    employee_id:r.employee_id||'', full_name:r.full_name||'', deduction_type:r.suggested_type||'other',
    amount:r.review_amount||'', approved_by:'', advance_date:'', effective_month:monthStr(r.cost_date||r.month)||'',
    deducted_month:'', notes:`From Finance review: ${r.review_type}${r.notes?' — '+r.notes:''}`, status:'pending',
  });

  const STATUS_COLOR = { pending:'#92400e', applied:'#166534', waived:'#64748b' };
  const STATUS_BG    = { pending:'#fef3c7', applied:'#dcfce7', waived:'#f1f5f9' };

  const filtered = rows.filter(r=>{
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (r.employee_id||'').toLowerCase().includes(q)||(r.full_name||'').toLowerCase().includes(q);
  });

  const pending = rows.filter(r=>r.status==='pending').reduce((s,r)=>s+(Number(r.amount)||0),0);
  const filteredFinanceReview = financeReview.filter(r=>{
    if (!filter) return true;
    const q = filter.toLowerCase();
    return String(r.employee_id||'').toLowerCase().includes(q)||String(r.full_name||'').toLowerCase().includes(q)||String(r.review_type||'').toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <h2 style={{margin:0,fontSize:'17px',fontWeight:800}}>📋 Deduction Ledger (HR)</h2>
          <div style={{fontSize:'12px',color:'#64748b',marginTop:'3px'}}>
            HR logs approved deductions here. Finance uses this as reference when entering "Deductions" in Monthly Costs.
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input placeholder="Filter by employee…" value={filter} onChange={e=>setFilter(e.target.value)}
            style={{padding:'7px 12px',borderRadius:'8px',border:'1px solid #e2e8f0',fontSize:'13px',width:'190px'}} />
          <button onClick={blank} style={S.btnPri}>+ Add Entry</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{display:'flex',gap:'12px',marginBottom:'14px',flexWrap:'wrap'}}>
        {[
          ['Total Entries',rows.length,'#2563eb'],
          ['⏳ Pending Recovery','AED '+fmt(pending),'#b45309'],
          ['✅ Applied',rows.filter(r=>r.status==='applied').length+' entries','#166534'],
          ['🚫 Waived',rows.filter(r=>r.status==='waived').length+' entries','#64748b'],
        ].map(([lbl,val,col])=>(
          <div key={lbl} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'10px 16px',minWidth:'140px'}}>
            <div style={{fontSize:'11px',color:'#64748b',fontWeight:600}}>{lbl}</div>
            <div style={{fontSize:'16px',fontWeight:800,color:col,marginTop:'2px'}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'10px',padding:'12px 14px',marginBottom:'14px'}}>
        <div style={{fontWeight:800,fontSize:'13px',color:'#9a3412',marginBottom:'4px'}}>HR Review Queue from Finance Data</div>
        <div style={{fontSize:'12px',color:'#9a3412',marginBottom:'10px'}}>Deposits received, recoverable costs, and deductions already applied are visible here for HR discretion. HR may create/edit ledger entries as required.</div>
        <div className="drag-scroll" style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
            <thead><tr style={{background:'#ffedd5'}}>{['Emp ID','Name','Finance Signal','Amount','Date/Month','Notes','Action'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filteredFinanceReview.length===0 ? <tr><td colSpan={7} style={{padding:'16px',textAlign:'center',color:'#c2410c'}}>No deposits / recoverable signals found.</td></tr> : filteredFinanceReview.slice(0,40).map(r=>(
                <tr key={(r.review_type||'')+'-'+(r.id||r.employee_id)} style={{borderTop:'1px solid #fed7aa'}}>
                  <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#c2410c'}}>{r.employee_id}</td>
                  <td style={S.td}>{r.full_name}</td>
                  <td style={S.td}>{r.review_type}</td>
                  <td style={{...S.td,fontWeight:800,color:r.info_only?'#166534':'#dc2626',textAlign:'right'}}>AED {fmt(r.review_amount)}</td>
                  <td style={S.td}>{monthStr(r.cost_date||r.month)||'—'}</td>
                  <td style={{...S.tdWrap,fontSize:'11.5px',color:'#7c2d12'}}>{r.notes||'—'}</td>
                  <td style={S.td}>{r.info_only ? <span style={{fontSize:'11px',color:'#64748b'}}>Info only</span> : <button onClick={()=>createFromFinanceReview(r)} style={{...S.btnPri,padding:'4px 10px',fontSize:'11px',background:'#c2410c'}}>Create Ledger</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? <div style={{color:'#94a3b8',padding:'20px'}}>Loading…</div> : (() => {
        // Group by effective_month for per-month view
        const grouped = {};
        filtered.forEach(r => {
          const key = r.effective_month ? r.effective_month.slice(0,7) : 'No Month';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(r);
        });
        const sortedMonths = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
        return (
        <div className="drag-scroll" style={{overflowX:'auto'}}>
          {sortedMonths.map(month=>(
            <div key={month} style={{marginBottom:'18px'}}>
              <div style={{fontWeight:800,fontSize:'12px',color:'#475569',textTransform:'uppercase',letterSpacing:'.05em',
                padding:'6px 12px',background:'#f1f5f9',borderRadius:'6px',marginBottom:'4px',borderLeft:'3px solid #7c3aed'}}>
                📅 {month==='No Month' ? 'No Month Assigned' : month}
                <span style={{fontWeight:400,color:'#94a3b8',marginLeft:'8px'}}>{grouped[month].length} entr{grouped[month].length===1?'y':'ies'}</span>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {['Emp ID','Name','Deduction Type','Amount (AED)','Advance Date','Approved By','Notes','Status','Deducted In',''].map(h=>(
                      <th key={h} style={{...S.th,fontSize:'11.5px'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped[month].map(r=>{
                    const isDeducted = r.status==='applied';
                    return (
                    <tr key={r.id} style={{borderBottom:'1px solid #f1f5f9',
                      background:isDeducted?'#f0fdf4':'#fff',
                      opacity:isDeducted?0.85:1}}>
                      <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>
                      <td style={S.td}>{r.full_name}</td>
                      <td style={S.td}>{TYPES.find(t=>t.value===r.deduction_type)?.label||r.deduction_type}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:isDeducted?'#166534':'#dc2626'}}>
                        AED {fmt(r.amount)}
                        {isDeducted && <span style={{fontSize:'10px',display:'block',color:'#166534',fontWeight:600}}>✅ deducted</span>}
                      </td>
                      <td style={{...S.td,fontSize:'11.5px',color:'#64748b'}}>{r.advance_date?r.advance_date.slice(0,10):'—'}</td>
                      <td style={{...S.td,fontSize:'11.5px'}}>{r.approved_by||'—'}</td>
                      <td style={{...S.td,fontSize:'11.5px',color:'#64748b',maxWidth:'160px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                      <td style={S.td}>
                        <span style={{background:STATUS_BG[r.status]||'#f1f5f9',color:STATUS_COLOR[r.status]||'#475569',fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'10px'}}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{...S.td,fontSize:'11px',color:isDeducted?'#166534':'#94a3b8'}}>
                        {isDeducted ? (r.deducted_month?r.deducted_month.slice(0,7):'✅ Applied') : '—'}
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <div style={{display:'flex',gap:'6px',justifyContent:'center'}}>
                          <button onClick={()=>setDraft({...r,
                            effective_month:r.effective_month?r.effective_month.slice(0,7):'',
                            advance_date:r.advance_date?r.advance_date.slice(0,10):'',
                            deducted_month:r.deducted_month?r.deducted_month.slice(0,7):'',
                          })}
                            style={{...S.btnSec,padding:'4px 10px',fontSize:'12px'}}>✏️</button>
                          <button onClick={()=>del(r.id)}
                            style={{...S.btnSec,padding:'4px 10px',fontSize:'12px',color:'#dc2626',border:'1px solid #fecaca'}}>🗑</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {sortedMonths.length===0 && (
            <div style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>No deduction entries. HR adds entries here when recovery is approved.</div>
          )}
        </div>
        );
      })()}

      {/* Add/Edit modal */}
      {draft && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:'14px',padding:'28px',width:'460px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 16px',fontSize:'16px',fontWeight:800}}>
              {draft.id ? '✏️ Edit Deduction Entry' : '+ New Deduction Entry'}
            </h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={S.label}>Employee *</label>
                <select value={draft.employee_id}
                  onChange={e=>{ const emp=employees.find(x=>x.employee_id===e.target.value); setDraft(d=>({...d,employee_id:e.target.value,full_name:emp?.full_name||''})); }}
                  style={{...S.input,width:'100%'}}>
                  <option value="">— select employee —</option>
                  {employees.filter(e=>!e.is_temp).map(e=>(
                    <option key={e.employee_id} value={e.employee_id}>{e.employee_id} — {e.full_name}</option>
                  ))}
                  {employees.filter(e=>e.is_temp).length>0 && (
                    <optgroup label="── Pending / Pre-joining (Temp IDs) ──">
                      {employees.filter(e=>e.is_temp).map(e=>(
                        <option key={e.employee_id} value={e.employee_id}>{e.employee_id} — {e.full_name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={S.label}>Deduction Type *</label>
                <select value={draft.deduction_type} onChange={e=>setDraft(d=>({...d,deduction_type:e.target.value}))} style={{...S.input,width:'100%'}}>
                  {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Amount (AED) *</label>
                <input type="number" value={draft.amount} onChange={e=>setDraft(d=>({...d,amount:e.target.value}))}
                  style={{...S.input,width:'100%'}} placeholder="0.00" min="0" />
              </div>
              <div>
                <label style={S.label}>Advance Given Date</label>
                <input type="date" value={draft.advance_date||''} onChange={e=>setDraft(d=>({...d,advance_date:e.target.value}))} style={{...S.input,width:'100%'}}
                  title="Date on which the advance was actually given to the employee" />
              </div>
              <div>
                <label style={S.label}>Effective Month (recovery due)</label>
                <input type="month" value={draft.effective_month||''} onChange={e=>setDraft(d=>({...d,effective_month:e.target.value}))} style={{...S.input,width:'100%'}} />
              </div>
              <div>
                <label style={S.label}>Approved By</label>
                <input type="text" value={draft.approved_by||''} onChange={e=>setDraft(d=>({...d,approved_by:e.target.value}))}
                  style={{...S.input,width:'100%'}} placeholder="e.g. SHAIK / HR Manager" />
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))} style={{...S.input,width:'100%'}}>
                  <option value="pending">⏳ Pending</option>
                  <option value="applied">✅ Applied</option>
                  <option value="waived">🚫 Waived</option>
                </select>
              </div>
              {draft.status==='applied' && (
                <div>
                  <label style={S.label}>Deducted in Month</label>
                  <input type="month" value={draft.deducted_month||''} onChange={e=>setDraft(d=>({...d,deducted_month:e.target.value}))} style={{...S.input,width:'100%'}}
                    placeholder="Month when deduction was applied" />
                </div>
              )}
              <div style={{gridColumn:'1/-1'}}>
                <label style={S.label}>Notes</label>
                <input type="text" value={draft.notes||''} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}
                  style={{...S.input,width:'100%'}} placeholder="e.g. Visa cost AED 2,500 — to recover over 3 months" />
              </div>
            </div>
            {draft.status==='applied' && (
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'8px 12px',marginBottom:'12px',fontSize:'12px',color:'#166534',fontWeight:700}}>
                ✅ This entry will be marked as <strong>Applied</strong> and shown with a green "deducted" badge in the ledger table. The deducted month will be recorded for reference.
              </div>
            )}
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button onClick={()=>setDraft(null)} style={S.btnSec}>Cancel</button>
              <button onClick={save} disabled={saving} style={{...S.btnPri,opacity:saving?0.6:1}}>
                {saving?'Saving…':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ── SALARY PIPELINE TAB (v2) ──────────────────────────────────────
// Features:
// A) Month Calendar — mark Sundays (auto) + Public Holidays (manual)
// B) Idle Days Tracker — employees deployed but idle (waiting certs etc.)
// C) Bulk PDF Timesheet OCR — AI reads all employees in one pass
// D) Name fuzzy-match review screen
// E) Salary calculation respecting holidays, idle days, OT

const CLAUDE_PROXY = 'https://satco-hr.vercel.app/api/claude';

// ── Fuzzy name matching ──────────────────────────────────────────
