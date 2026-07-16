function AllowanceManager({ employees, empMeta, allowances, loading, draft, setDraft, onAdd, onSave, onDelete, onStopNow, demobDateFor }) {
  const today = new Date().toISOString().slice(0,10);
  return (
    <div style={{padding:'14px 18px',borderBottom:'1px solid #e2e8f0',background:'#faf5ff'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
        <div>
          <div style={{fontWeight:800,fontSize:'13.5px',color:'#581c87'}}>Recurring Site Allowances</div>
          <div style={{fontSize:'11.5px',color:'#7c3aed'}}>Set once — auto-applied to every Monthly Cost calculation from the start date until the employee demobilizes (or the end date you set).</div>
        </div>
        <button style={{...S.btnPri,background:'#7c3aed'}} onClick={onAdd}>+ Add Allowance</button>
      </div>

      {draft && (
        <div style={{background:'#fff',border:'1px solid #d8b4fe',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'10px',marginBottom:'8px'}}>
            <div>
              <label style={S.label}>Employee</label>
              <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
            </div>
            <div>
              <label style={S.label}>Allowance Type</label>
              <select value={draft.allowance_type} onChange={e=>setDraft(d=>({...d,allowance_type:e.target.value}))} style={{...S.input,width:'100%'}}>
                {ALLOWANCE_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Amount (AED/month)</label>
              <input type="number" value={draft.amount||''} onChange={e=>setDraft(d=>({...d,amount:e.target.value}))} style={{...S.input,width:'100%'}} />
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px',marginBottom:'8px'}}>
            <div>
              <label style={S.label}>Site / Location</label>
              <input value={draft.location||''} onChange={e=>setDraft(d=>({...d,location:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. ENPPI" />
            </div>
            <div>
              <label style={S.label}>Start Date (effective from)</label>
              <input type="date" value={draft.start_date||''} onChange={e=>setDraft(d=>({...d,start_date:e.target.value}))} style={{...S.input,width:'100%'}} />
            </div>
            <div>
              <label style={S.label}>End Date (optional — leave blank to run until demob)</label>
              <input type="date" value={draft.end_date||''} onChange={e=>setDraft(d=>({...d,end_date:e.target.value}))} style={{...S.input,width:'100%'}} />
            </div>
            <div style={{display:'flex',alignItems:'flex-end',paddingBottom:'9px'}}>
              <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,color:'#475569'}}>
                <input type="checkbox" checked={draft.auto_stop_on_demob!==false} onChange={e=>setDraft(d=>({...d,auto_stop_on_demob:e.target.checked}))} />
                Auto-stop on HR demob date
              </label>
            </div>
          </div>
          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Remarks</label>
            <input value={draft.remarks||''} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. approved per site assignment email" />
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={{...S.btnPri,background:'#7c3aed'}} onClick={onSave}>Save Allowance</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll" style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
          <thead><tr>
            {['Emp ID','Name','Type','Site','Amount/mo','Start','End / Status','Remarks',''].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={9} style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : allowances.length===0
                ? <tr><td colSpan={9} style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>No recurring allowances set up yet</td></tr>
                : allowances.map(a=>{
                    const demob = demobDateFor(a.employee_id);
                    const isStoppedByDate = a.end_date && a.end_date < today;
                    const demobPassed = a.auto_stop_on_demob && demob && demob < today && (!a.end_date || demob < a.end_date);
                    const isClosed = isStoppedByDate || demobPassed;
                    return (
                      <tr key={a.id} style={{borderTop:'1px solid #f1f5f9',opacity:a.active===false?0.5:1}}>
                        <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#7c3aed'}}>{a.employee_id}</td>
                        <td style={{...S.td,fontWeight:600}}>{a.full_name}</td>
                        <td style={S.td}>{ALLOWANCE_LABEL[a.allowance_type]||a.allowance_type}</td>
                        <td style={S.td}>{a.location||'—'}</td>
                        <td style={{...S.td,fontWeight:700}}>AED {fmt(a.amount)}</td>
                        <td style={S.td}>{a.start_date}</td>
                        <td style={{...S.td,whiteSpace:'normal'}}>
                          {isClosed
                            ? <span style={{background:'#fee2e2',color:'#991b1b',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>
                                Stopped {a.end_date||demob}
                              </span>
                            : demobPassed===false && demob
                              ? <span style={{background:'#dcfce7',color:'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>Active · stops on demob {demob}</span>
                              : <span style={{background:'#dcfce7',color:'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>Active · ongoing</span>}
                        </td>
                        <td style={{...S.td,whiteSpace:'normal',fontSize:'11px',color:'#64748b'}}>{a.remarks||'—'}</td>
                        <td style={S.td}>
                          <div style={{display:'flex',gap:'6px'}}>
                            <button onClick={()=>setDraft({...a})} style={{...S.btnExp,padding:'3px 8px',fontSize:'11px'}}>Edit</button>
                            {!a.end_date && <button onClick={()=>onStopNow(a)} style={{...S.btnExp,padding:'3px 8px',fontSize:'11px',color:'#92400e'}}>Stop Today</button>}
                            <button onClick={()=>onDelete(a.id)} style={{...S.btnExp,padding:'3px 8px',fontSize:'11px',color:'#dc2626'}}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyCostsTable({ employees, empMeta, hrSalaryRows, initialFilter, hideEmpFilter, hideExportButton }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft]     = useState(null);
  const [filters, setFilters] = useState(initialFilter||{});
  const [allowances, setAllowances]       = useState([]);
  const [allowLoading, setAllowLoading]   = useState(true);
  const [allowDraft, setAllowDraft]       = useState(null); // editor for a single recurring allowance row
  const [showAllowMgr, setShowAllowMgr]   = useState(false);
  const [salaryProfiles, setSalaryProfiles] = useState({}); // { employee_id: { basic_salary, fixed_allowance } }
  const [pendingDeductions, setPendingDeductions] = useState({}); // { employee_id: [deduction rows] }
  const [empRecoverable, setEmpRecoverable] = useState(null); // {recoverable, recovered, balance} for whichever employee is in the draft
  const hrSalaryByEmp = useMemo(()=>salaryMapFromRows(hrSalaryRows||[]), [hrSalaryRows]);
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  // Reminder: Visa/Flights/Training/Onboarding costs marked recoverable, minus what's already been
  // deducted or received as a deposit — surfaced here because Salary Deductions (below) is the one
  // place that reminder can actually be acted on.
  useEffect(()=>{
    let alive = true;
    if (!draft || !draft.employee_id) { setEmpRecoverable(null); return; }
    const empId = draft.employee_id;
    (async () => {
      const [visa, flights, training, other, monthly] = await Promise.all([
        db.from('employee_visa_costs').select('cost,recoverable,recoverable_amount').eq('employee_id',empId),
        db.from('employee_flights').select('cost,recoverable,recoverable_amount').eq('employee_id',empId),
        db.from('employee_training_costs').select('cost,recoverable,recoverable_amount').eq('employee_id',empId),
        db.from('employee_other_costs').select('amount,recoverable,cost_type,recovered_amount').eq('employee_id',empId),
        db.from('employee_monthly_costs').select('month,salary_deductions').eq('employee_id',empId),
      ]);
      if (!alive) return;
      let recoverable = 0, recovered = 0;
      (visa.data||[]).filter(r=>r.recoverable).forEach(r=>{ recoverable += recoverableCap(r,'cost'); });
      (flights.data||[]).filter(r=>r.recoverable).forEach(r=>{ recoverable += recoverableCap(r,'cost'); });
      (training.data||[]).filter(r=>r.recoverable).forEach(r=>{ recoverable += recoverableCap(r,'cost'); });
      (other.data||[]).forEach(r=>{
        if (r.cost_type==='security_deposit') { recovered += Number(r.amount)||0; return; }
        if (r.recoverable) { recoverable += Number(r.amount)||0; recovered += Number(r.recovered_amount)||0; }
      });
      (monthly.data||[]).forEach(m=>{
        // Exclude the month currently being entered so the reminder reflects the balance BEFORE this entry's deduction.
        if (draft.month && String(m.month||'').slice(0,7)===String(draft.month||'').slice(0,7)) return;
        recovered += Number(m.salary_deductions)||0;
      });
      setEmpRecoverable({ recoverable, recovered, balance: Math.max(0, recoverable-recovered) });
    })();
    return ()=>{ alive = false; };
  },[draft&&draft.employee_id, draft&&draft.month]);

  const load = async () => {
    setLoading(true);
    const {data,error} = await db.from('employee_monthly_costs').select('*').order('month',{ascending:false});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const loadAllowances = async () => {
    setAllowLoading(true);
    const {data,error} = await db.from('employee_allowances').select('*').order('start_date',{ascending:false});
    if (!error) setAllowances(data||[]);
    setAllowLoading(false);
  };
  useEffect(()=>{loadAllowances();},[]);

  // Load salary profiles so Monthly Costs can auto-fill basic salary + allowance
  useEffect(()=>{
    db.from('employee_salary_profiles').select('employee_id,basic_salary,fixed_allowance').then(({data})=>{
      if (!data) return;
      const m = {};
      data.forEach(p=>{ m[p.employee_id]=p; });
      setSalaryProfiles(m);
    });
    // Load pending deductions so Finance can see what HR expects to be deducted
    db.from('employee_deduction_ledger').select('*').eq('status','pending').then(({data})=>{
      if (!data) return;
      const m = {};
      data.forEach(d=>{ (m[d.employee_id]=m[d.employee_id]||[]).push(d); });
      setPendingDeductions(m);
    });
  },[]);

  // HR demobilization date for whichever employee is currently selected in the draft / filters,
  // used to pro-rate and alert on recurring allowances.
  const demobDateFor = (employeeId) => empMeta && empMeta[employeeId] && empMeta[employeeId].demobilization_date || null;
  const allowancesFor = (employeeId) => allowances.filter(a=>a.employee_id===employeeId);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID',  width:'100px'},{key:'full_name',   label:'Name',    width:'150px'}]),
    {key:'salary_type', label:'Type', width:'170px', options:[{value:'prorated',label:'Calculated (Days+OT)'},{value:'monthly_basic',label:'Fixed Monthly'},{value:'hourly',label:'Hourly'}]},
    {key:'remarks',     label:'Remarks', width:'160px'},
  ];

  const filtered = useMemo(()=>applyFilters(rows,filters),[rows,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,'month'),[filtered]);
  const COLS = hideEmpFilter?11:13;

  const csvCols = [
    {key:'employee_id', label:'Emp ID'}, {key:'full_name', label:'Name'},
    {key:'month', label:'Month'}, {key:'salary_type', label:'Type'},
    {key:'salary', label:'Salary Paid'}, {key:'computed_salary', label:'Calculated Salary'},
    {key:'manual_override', label:'Overridden?'},
    {key:'basic_salary', label:'Basic Salary'}, {key:'fixed_allowance', label:'Fixed Allowance'},
    {key:'working_days', label:'Working Days'}, {key:'month_days', label:'Days in Month'},
    {key:'normal_ot_hours', label:'Normal OT Hrs'}, {key:'holiday_ot_hours', label:'Holiday OT Hrs'},
    {key:'hours_per_day', label:'Hours/Day'},
    {key:'food', label:'Food'}, {key:'accommodation', label:'Accommodation'}, {key:'transport', label:'Transport'},
    {key:'other', label:'Other'}, {key:'salary_deductions', label:'Deductions'},
    {key:'recurring_allowance_total', label:'Recurring Allowance'},
    {key:'hours_worked', label:'Hours Worked'}, {key:'hourly_rate', label:'Hourly Rate'},
    {key:'remarks', label:'Remarks'},
  ];

  const blank = ()=>setDraft({
    employee_id:initialFilter&&initialFilter.employee_id||'', full_name:initialFilter&&initialFilter.full_name||'',
    month:'', salary_type:'prorated',
    salary:'', food:'', accommodation:'', transport:'', other:'', remarks:'', salary_deductions:'',
    hours_worked:'', hourly_rate:'',
    basic_salary:'', fixed_allowance:'', hours_per_day:8, working_days:'', normal_ot_hours:'', holiday_ot_hours:'',
    manual_override:false,
  });

  // Prefill basic salary + allowance from Finance Salary Profile first,
  // then live HR salary bridge, then most recent Monthly Cost entry.
  const prefillFromHistory = (employeeId, d) => {
    if (!employeeId || d.basic_salary) return d;
    // 1. Try Salary Profile
    const profile = salaryProfiles[employeeId];
    if (profile && (Number(profile.basic_salary)||0) > 0) {
      return {...d, basic_salary:profile.basic_salary||'', fixed_allowance:profile.fixed_allowance||0, hours_per_day:d.hours_per_day||8};
    }
    // 2. Try HR portal salary bridge (if access is permitted)
    const hrSalary = hrSalaryByEmp[employeeId];
    if (hrSalary && ((Number(hrSalary.basic_salary)||0) > 0 || (Number(hrSalary.fixed_allowance)||0) > 0)) {
      return {...d, basic_salary:hrSalary.basic_salary||'', fixed_allowance:hrSalary.fixed_allowance||0, hours_per_day:d.hours_per_day||8, remarks:d.remarks||'Auto-filled from HR salary bridge'};
    }
    // 3. Fall back to last Monthly Costs entry
    const last = rows.filter(r=>r.employee_id===employeeId && r.salary_type==='prorated' && r.basic_salary)
      .sort((a,b)=> (a.month<b.month?1:a.month>b.month?-1:0))[0];
    if (!last) return d;
    return {...d, basic_salary:last.basic_salary||'', fixed_allowance:last.fixed_allowance||'', hours_per_day:last.hours_per_day||8};
  };

  const save = async () => {
    if (!draft.employee_id||!draft.month) return alert('Employee ID and month are required');
    const type = draft.salary_type||'prorated';
    const isProrated = type==='prorated';
    const isHourly    = type==='hourly';
    const calc = calcProrated(draft);
    const recurring = computeRecurringAllowances(allowancesFor(draft.employee_id), draft.month, demobDateFor(draft.employee_id));
    const hourlyGross = isHourly?(Number(draft.hours_worked)||0)*(Number(draft.hourly_rate)||0):0;
    const finalSalary = isProrated
      ? (draft.manual_override ? (Number(draft.salary)||0) : calc.gross + recurring.total)
      : isHourly ? hourlyGross + recurring.total
      : (Number(draft.salary)||0) + recurring.total;

    const arrearsAmt = Number(draft.arrears)||0;
    const finalSalaryWithArrears = Math.round((finalSalary + arrearsAmt)*100)/100;
    const arrearsRemark = arrearsAmt > 0
      ? `[Arrears AED ${arrearsAmt.toFixed(2)} for ${draft.arrears_for_month||'?'}${draft.arrears_reason ? ': '+draft.arrears_reason : ''}]`
      : '';
    const combinedRemarks = [draft.remarks||'', arrearsRemark].filter(Boolean).join(' | ') || null;

    const clean = {
      employee_id:draft.employee_id, full_name:draft.full_name, month:firstOfMonth(draft.month),
      salary_type:type, salary:finalSalaryWithArrears,
      food:Number(draft.food)||0, accommodation:Number(draft.accommodation)||0,
      transport:Number(draft.transport)||0, other:Number(draft.other)||0, remarks:combinedRemarks,
      salary_deductions:Number(draft.salary_deductions)||0,
      hours_worked:Number(draft.hours_worked)||0, hourly_rate:Number(draft.hourly_rate)||0,
      basic_salary:      isProrated ? (Number(draft.basic_salary)||0) : null,
      fixed_allowance:   isProrated ? (Number(draft.fixed_allowance)||0) : 0,
      hours_per_day:     isProrated ? (Number(draft.hours_per_day)||8) : 8,
      working_days:      isProrated ? (Number(draft.working_days)||0) : null,
      month_days:        isProrated ? calc.monthDays : null,
      normal_ot_hours:   isProrated ? (Number(draft.normal_ot_hours)||0) : 0,
      holiday_ot_hours:  isProrated ? (Number(draft.holiday_ot_hours)||0) : 0,
      computed_salary:   isProrated ? Math.round((calc.gross+recurring.total)*100)/100 : null,
      manual_override:   isProrated ? !!draft.manual_override : false,
      recurring_allowance_total: Math.round(recurring.total*100)/100,
    };
    const {error} = draft.id
      ? await db.from('employee_monthly_costs').update(clean).eq('id',draft.id)
      : await db.from('employee_monthly_costs').upsert(clean,{onConflict:'employee_id,month'});
    if (error) return alert(error.message);
    setDraft(null); load();
  };
  const remove = async (id)=>{ if(!window.confirm('Delete?'))return; await db.from('employee_monthly_costs').delete().eq('id',id); load(); };

  const blankAllowance = (employeeId, fullName) => setAllowDraft({
    employee_id:employeeId||'', full_name:fullName||'',
    allowance_type:'mobile', amount:'', location:'',
    start_date:new Date().toISOString().slice(0,10), end_date:'',
    auto_stop_on_demob:true, active:true, remarks:'',
  });
  const saveAllowance = async () => {
    if (!allowDraft.employee_id||!allowDraft.start_date) return alert('Employee and start date are required');
    const clean = {
      employee_id:allowDraft.employee_id, full_name:allowDraft.full_name||null,
      allowance_type:allowDraft.allowance_type||'mobile', amount:Number(allowDraft.amount)||0,
      location:allowDraft.location||null, start_date:allowDraft.start_date,
      end_date:allowDraft.end_date||null, auto_stop_on_demob:!!allowDraft.auto_stop_on_demob,
      active: allowDraft.active!==false, remarks:allowDraft.remarks||null,
    };
    const {error} = allowDraft.id
      ? await db.from('employee_allowances').update(clean).eq('id',allowDraft.id)
      : await db.from('employee_allowances').insert(clean);
    if (error) return alert(error.message);
    setAllowDraft(null); loadAllowances();
  };
  const removeAllowance = async (id) => { if(!window.confirm('Delete this recurring allowance?'))return; await db.from('employee_allowances').delete().eq('id',id); loadAllowances(); };
  const stopAllowanceNow = async (a) => { await db.from('employee_allowances').update({end_date:new Date().toISOString().slice(0,10)}).eq('id',a.id); loadAllowances(); };

  const isP = !!draft && draft.salary_type==='prorated';
  const isH = !!draft && draft.salary_type==='hourly';
  const isFlat = !!draft && !isP && !isH;
  const calc = isP ? calcProrated(draft) : null;
  const hourlyGrossPreview = isH?(Number(draft.hours_worked)||0)*(Number(draft.hourly_rate)||0):0;
  const netPayablePreview  = isH?hourlyGrossPreview-(Number(draft.salary_deductions)||0):0;
  const draftDemobDate = draft ? demobDateFor(draft.employee_id) : null;
  const recurringPreview = draft ? computeRecurringAllowances(allowancesFor(draft.employee_id), draft.month, draftDemobDate) : { total:0, lines:[], stoppedAlerts:[] };

  return (
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>Monthly Costs (Salary, Food, Accommodation, Transport)</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>
            One row per employee per month.
            {(Object.keys(salaryProfiles).length > 0 || Object.keys(hrSalaryByEmp).length > 0) && (
              <span style={{marginLeft:'8px',background:'#dcfce7',color:'#166534',fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'6px'}}>
                ✅ {Object.keys(salaryProfiles).length} Finance profiles + {Object.keys(hrSalaryByEmp).length} HR salary rows available — auto-fills on selection
              </span>
            )}
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!hideExportButton && <button style={S.btnExp} onClick={()=>exportCSV(filtered,'monthly_costs',csvCols)}>Export CSV</button>}
          <button style={{...S.btnPri,background:showAllowMgr?'#0f172a':'#7c3aed'}} onClick={()=>setShowAllowMgr(v=>!v)}>
            📡 Recurring Allowances{allowances.filter(a=>a.active!==false).length>0?` (${allowances.filter(a=>a.active!==false).length})`:''}
          </button>
          <button style={S.btnPri} onClick={blank}>+ Add Month</button>
        </div>
      </div>

      {showAllowMgr && (
        <AllowanceManager
          employees={employees} empMeta={empMeta} allowances={allowances} loading={allowLoading}
          draft={allowDraft} setDraft={setAllowDraft}
          onAdd={()=>blankAllowance(initialFilter&&initialFilter.employee_id, initialFilter&&initialFilter.full_name)}
          onSave={saveAllowance} onDelete={removeAllowance} onStopNow={stopAllowanceNow}
          demobDateFor={demobDateFor}
        />
      )}

      <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

      {draft && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Employee</label>
            <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
              onChange={(id,name)=>setDraft(d=>prefillFromHistory(id,{...d,employee_id:id,full_name:name}))} />
          </div>
          <div style={{marginBottom:'12px'}}>
            <label style={S.label}>Salary Type</label>
            <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
              {[['prorated','Calculated — Days + OT (from timesheet)'],['monthly_basic','Fixed Monthly Amount'],['hourly','Hourly Rate']].map(([val,lbl])=>(
                <label key={val} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',
                  background:draft.salary_type===val?'#0f172a':'#f1f5f9',color:draft.salary_type===val?'#fff':'#475569',
                  border:'1px solid '+(draft.salary_type===val?'#0f172a':'#cbd5e1'),
                  borderRadius:'8px',padding:'8px 14px',fontWeight:700,fontSize:'12.5px'}}>
                  <input type="radio" name="salary_type" value={val} checked={draft.salary_type===val}
                    onChange={()=>setDraft(d=>({...d,salary_type:val}))} style={{display:'none'}} />{lbl}
                </label>
              ))}
            </div>
          </div>
          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Month</label>
            <input type="month" value={draft.month||''} onChange={e=>setDraft(d=>({...d,month:e.target.value}))} style={{...S.input,width:'160px'}}/>
          </div>

          {isP && (
            <>
              <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'12px 14px',marginBottom:'10px'}}>
                <div style={{fontSize:'11px',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>Fixed pay rates for this employee</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px'}}>
                  <div><label style={S.label}>Basic Salary (AED/month)</label><input type="number" value={draft.basic_salary||''} onChange={e=>setDraft(d=>({...d,basic_salary:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Fixed Allowance (AED/month)</label><input type="number" value={draft.fixed_allowance||''} onChange={e=>setDraft(d=>({...d,fixed_allowance:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Hours / Day (OT basis)</label><input type="number" value={draft.hours_per_day===''?'':draft.hours_per_day} onChange={e=>setDraft(d=>({...d,hours_per_day:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                </div>
              </div>
              <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'12px 14px',marginBottom:'10px'}}>
                <div style={{fontSize:'11px',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>This month's attendance &amp; overtime (from site timesheet)</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px'}}>
                  <div><label style={S.label}>Working Days {draft.month?('(of '+daysInMonth(draft.month)+' days in month)'):''}</label><input type="number" value={draft.working_days||''} onChange={e=>setDraft(d=>({...d,working_days:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Normal OT Hours (×1.25)</label><input type="number" value={draft.normal_ot_hours||''} onChange={e=>setDraft(d=>({...d,normal_ot_hours:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Holiday OT Hours (×1.5)</label><input type="number" value={draft.holiday_ot_hours||''} onChange={e=>setDraft(d=>({...d,holiday_ot_hours:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                </div>
              </div>

              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px',fontSize:'12.5px'}}>
                <div style={{display:'flex',gap:'14px',flexWrap:'wrap',marginBottom:'4px'}}>
                  <span>Basic Pay: <strong>AED {fmt(calc.basicPay)}</strong></span>
                  <span>Normal OT: <strong>AED {fmt(calc.normalOTPay)}</strong></span>
                  <span>Holiday OT: <strong>AED {fmt(calc.holidayOTPay)}</strong></span>
                  <span>Allowance: <strong>AED {fmt(calc.allowPay)}</strong></span>
                </div>
                <div>= Computed Gross Salary: <strong style={{fontSize:'14px'}}>AED {fmt(calc.gross)}</strong></div>
              </div>

              <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',marginBottom:'10px',fontSize:'12.5px',fontWeight:700,color:'#92400e'}}>
                <input type="checkbox" checked={!!draft.manual_override}
                  onChange={e=>{
                    const checked = e.target.checked;
                    setDraft(d=>({...d, manual_override:checked, salary: checked ? (d.salary || (Math.round(calc.gross*100)/100)) : d.salary}));
                  }} />
                Calculation doesn't match what was actually paid — enter the final salary manually
              </label>
              {draft.manual_override && (
                <div style={{marginBottom:'10px',background:'#fffbeb',border:'1px solid #fbbf24',borderRadius:'8px',padding:'10px 14px'}}>
                  <label style={S.label}>Final Salary to Use (AED)</label>
                  <input type="number" value={draft.salary||''} onChange={e=>setDraft(d=>({...d,salary:e.target.value}))} style={{...S.input,width:'220px'}}/>
                  <div style={{fontSize:'11.5px',color:'#92400e',marginTop:'6px'}}>Formula calculated AED {fmt(calc.gross)} — note the reason for the difference in Remarks below.</div>
                </div>
              )}
            </>
          )}

          {isH && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'10px'}}>
                <div><label style={S.label}>Hours Worked</label><input type="number" value={draft.hours_worked||''} onChange={e=>setDraft(d=>({...d,hours_worked:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="208"/></div>
                <div><label style={S.label}>Hourly Rate (AED/hr)</label><input type="number" step="0.01" value={draft.hourly_rate||''} onChange={e=>setDraft(d=>({...d,hourly_rate:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
                <div><label style={S.label}>Salary Deductions (AED)</label><input type="number" value={draft.salary_deductions||''} onChange={e=>setDraft(d=>({...d,salary_deductions:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              </div>
              {(draft.hours_worked&&draft.hourly_rate)&&(
                <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px',fontSize:'12.5px'}}>
                  Gross: <strong>AED {fmt(hourlyGrossPreview)}</strong> · Deductions: <strong style={{color:'#dc2626'}}>AED {fmt(draft.salary_deductions||0)}</strong> · Net: <strong style={{color:netPayablePreview>=0?'#166534':'#dc2626'}}>AED {fmt(netPayablePreview)}</strong>
                </div>
              )}
            </>
          )}

          {isFlat && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px',marginBottom:'10px'}}>
              <div><label style={S.label}>Basic Salary</label><input type="number" value={draft.salary||''} onChange={e=>setDraft(d=>({...d,salary:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Salary Deductions (AED)</label><input type="number" value={draft.salary_deductions||''} onChange={e=>setDraft(d=>({...d,salary_deductions:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            </div>
          )}

          {draft.employee_id && draft.month && (
            <div style={{background:'#faf5ff',border:'1px solid #d8b4fe',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px',fontSize:'12.5px'}}>
              <div style={{fontWeight:800,color:'#581c87',marginBottom:'6px'}}>📡 Recurring Site Allowances (auto-applied to salary above)</div>
              {recurringPreview.lines.length===0 ? (
                <div style={{color:'#7c3aed'}}>No active recurring allowance for this employee this month.</div>
              ) : recurringPreview.lines.map(l=>(
                <div key={l.id} style={{display:'flex',justifyContent:'space-between',marginBottom:'2px'}}>
                  <span>{ALLOWANCE_LABEL[l.allowance_type]||l.allowance_type}{l.location?` — ${l.location}`:''} ({l.daysActive}/{daysInMonth(draft.month)}d)</span>
                  <strong>AED {fmt(l.amountThisMonth)}</strong>
                </div>
              ))}
              {recurringPreview.lines.length>0 && (
                <div style={{marginTop:'4px',paddingTop:'4px',borderTop:'1px dashed #d8b4fe'}}>= Recurring Allowance Total: <strong>AED {fmt(recurringPreview.total)}</strong> <span style={{color:'#7c3aed'}}>(added into the salary saved below)</span></div>
              )}
              {draftDemobDate && recurringPreview.stoppedAlerts.length>0 && (
                <div style={{marginTop:'8px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'6px',padding:'8px 10px',color:'#991b1b',fontWeight:700}}>
                  ⚠️ This employee demobilized on {draftDemobDate} — the allowance below is set to auto-stop on demob and was pro-rated up to that date for this month. Confirm it shouldn't continue into next month's WPS run.
                </div>
              )}
            </div>
          )}

          {/* ── HR Deduction Alert ── show pending deductions HR expects to be applied this month */}
          {draft.employee_id && (pendingDeductions[draft.employee_id]||[]).length > 0 && (
            <div style={{background:'#fff7ed',border:'2px solid #fed7aa',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px',fontSize:'12.5px'}}>
              <div style={{fontWeight:800,color:'#9a3412',marginBottom:'6px'}}>⚠️ HR Pending Deductions — apply in "Salary Deductions" field below</div>
              {(pendingDeductions[draft.employee_id]||[]).map(d=>(
                <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                  <span style={{color:'#7c2d12'}}>
                    {{'visa_recovery':'Visa Recovery','security_deposit_recovery':'Security Deposit','salary_advance_recovery':'Salary Advance','flight_recovery':'Flight Recovery','training_recovery':'Training Cost','other':'Other'}[d.deduction_type]||d.deduction_type}
                    {d.effective_month ? ` (${d.effective_month.slice(0,7)})` : ''}
                    {d.notes ? ` — ${d.notes}` : ''}
                  </span>
                  <strong style={{color:'#dc2626',marginLeft:'12px',whiteSpace:'nowrap'}}>AED {fmt(d.amount)}</strong>
                </div>
              ))}
              <div style={{marginTop:'6px',paddingTop:'6px',borderTop:'1px dashed #fed7aa',color:'#9a3412',fontWeight:700,fontSize:'11.5px'}}>
                Total pending: AED {fmt((pendingDeductions[draft.employee_id]||[]).reduce((s,d)=>s+(Number(d.amount)||0),0))} — enter this in "Salary Deductions" below. Mark as Applied in the Deduction Ledger tab after processing.
              </div>
            </div>
          )}

          {/* ── Recoverable Balance Reminder — Visa/Flights/Training/Onboarding costs marked recoverable ── */}
          {draft.employee_id && empRecoverable && empRecoverable.balance>0.5 && (
            <div style={{background:'#eff6ff',border:'2px solid #bfdbfe',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px',fontSize:'12.5px'}}>
              <div style={{fontWeight:800,color:'#1d4ed8',marginBottom:'4px'}}>💡 Reminder — outstanding recoverable balance: AED {fmt(empRecoverable.balance)}</div>
              <div style={{color:'#1e3a8a'}}>Visa, Flight, Training and Onboarding &amp; Misc costs marked recoverable for this employee total AED {fmt(empRecoverable.recoverable)}, of which AED {fmt(empRecoverable.recovered)} has already been recovered (deductions, deposits, or a capped recoverable amount). Consider including some or all of the remaining AED {fmt(empRecoverable.balance)} in "Salary Deductions" below — see this employee's full breakdown on their Employee Detail page.</div>
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'10px'}}>
            <div><label style={S.label}>Food</label><input type="number" value={draft.food||''} onChange={e=>setDraft(d=>({...d,food:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            <div><label style={S.label}>Accommodation</label><input type="number" value={draft.accommodation||''} onChange={e=>setDraft(d=>({...d,accommodation:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            <div><label style={S.label}>Transport</label><input type="number" value={draft.transport||''} onChange={e=>setDraft(d=>({...d,transport:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            <div><label style={S.label}>Other</label><input type="number" value={draft.other||''} onChange={e=>setDraft(d=>({...d,other:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
          </div>

          {/* ── Arrears block ── pending payment from a previous month */}
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'10px 14px',marginBottom:'10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px',flexWrap:'wrap'}}>
              <span style={{fontSize:'11px',fontWeight:800,color:'#1d4ed8',textTransform:'uppercase',letterSpacing:'.04em'}}>💰 Arrears — Pending Payment from Previous Month</span>
              <span style={{fontSize:'11px',color:'#3b82f6'}}>add any salary/allowance owed but not paid in a prior month</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px'}}>
              <div>
                <label style={S.label}>Arrears Amount (AED)</label>
                <input type="number" value={draft.arrears||''} placeholder="0.00"
                  onChange={e=>setDraft(d=>({...d,arrears:e.target.value}))} style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>For Month (original due month)</label>
                <input type="month" value={draft.arrears_for_month||''}
                  onChange={e=>setDraft(d=>({...d,arrears_for_month:e.target.value}))} style={{...S.input,width:'100%'}}/>
              </div>
              <div>
                <label style={S.label}>Arrears Reason</label>
                <input type="text" value={draft.arrears_reason||''} placeholder="e.g. Salary not processed in May"
                  onChange={e=>setDraft(d=>({...d,arrears_reason:e.target.value}))} style={{...S.input,width:'100%'}}/>
              </div>
            </div>
            {(Number(draft.arrears)||0) > 0 && (
              <div style={{marginTop:'6px',fontSize:'11.5px',color:'#1d4ed8',fontWeight:700}}>
                ✅ Arrears AED {fmt(draft.arrears)} for {draft.arrears_for_month||'?'} will be added to this month's net total.
              </div>
            )}
          </div>

          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Remarks</label>
            <input value={draft.remarks||''} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>
            {(hideEmpFilter?['Month','Type','Salary / Gross','Food','Accom.','Transport','Other','Deductions','Net Total','Remarks','']:['Emp ID','Name','Month','Type','Salary / Gross','Food','Accom.','Transport','Other','Deductions','Net Total','Remarks','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : grouped.length===0
                ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No entries yet':'No entries match filters'}</td></tr>
                : grouped.map(g=>{
                    const mSalary = g.rows.reduce((s,r)=>s+(Number(r.salary)||0),0);
                    const mFood   = g.rows.reduce((s,r)=>s+(Number(r.food)||0),0);
                    const mAccom  = g.rows.reduce((s,r)=>s+(Number(r.accommodation)||0),0);
                    const mTrans  = g.rows.reduce((s,r)=>s+(Number(r.transport)||0),0);
                    const mOther  = g.rows.reduce((s,r)=>s+(Number(r.other)||0),0);
                    const mDed    = g.rows.reduce((s,r)=>s+(Number(r.salary_deductions)||0),0);
                    const mNet    = mSalary+mFood+mAccom+mTrans+mOther-mDed;
                    return (
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={COLS} />}
                      {g.rows.map(r=>{
                        const ded=Number(r.salary_deductions)||0;
                        const tot=(r.salary||0)+(r.food||0)+(r.accommodation||0)+(r.transport||0)+(r.other||0)-ded;
                        const rIsP = r.salary_type==='prorated';
                        return (
                          <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',cursor:'pointer'}}
                            onClick={()=>setDraft({...r,month:monthStr(r.month),salary_type:r.salary_type||'monthly_basic'})}>
                            {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>}
                            {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>}
                            <td style={S.td}>{monthStr(r.month)}</td>
                            <td style={S.td}><SalaryTypeBadge type={r.salary_type}/></td>
                            <td style={{...S.td,whiteSpace:'normal'}}>
                              {fmt(r.salary)}
                              {rIsP && (
                                <div style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600,marginTop:'2px'}}>
                                  {r.working_days||0}/{r.month_days||'—'}d · OT {r.normal_ot_hours||0}h + Hol {r.holiday_ot_hours||0}h
                                  {r.manual_override && <span style={{color:'#dc2626'}}> · overridden (calc AED {fmt(r.computed_salary)})</span>}
                                </div>
                              )}
                              {Number(r.recurring_allowance_total)>0 && (
                                <div style={{fontSize:'10.5px',color:'#7c3aed',fontWeight:700,marginTop:'2px'}}>📡 incl. AED {fmt(r.recurring_allowance_total)} recurring allowance</div>
                              )}
                            </td>
                            <td style={S.td}>{fmt(r.food)}</td>
                            <td style={S.td}>{fmt(r.accommodation)}</td>
                            <td style={S.td}>{fmt(r.transport)}</td>
                            <td style={S.td}>{fmt(r.other)}</td>
                            <td style={{...S.td,color:'#dc2626'}}>{ded>0?'-'+fmt(ded):'—'}</td>
                            <td style={{...S.td,fontWeight:700}}>{fmt(tot)}</td>
                            <td style={S.tdWrap}>{r.remarks||'—'}</td>
                            <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();setDraft({...r,month:monthStr(r.month),salary_type:r.salary_type||'monthly_basic'});}}>&#9998;</button>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                            </td>
                          </tr>
                        );
                      })}
                      {!hideEmpFilter && (
                        <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                          <td style={S.td}></td>
                          <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}></td>
                          <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>
                          <td style={S.td}></td>
                          <td style={{...S.td,fontWeight:800}}>AED {fmt(mSalary)}</td>
                          <td style={{...S.td,fontWeight:800}}>{fmt(mFood)}</td>
                          <td style={{...S.td,fontWeight:800}}>{fmt(mAccom)}</td>
                          <td style={{...S.td,fontWeight:800}}>{fmt(mTrans)}</td>
                          <td style={{...S.td,fontWeight:800}}>{fmt(mOther)}</td>
                          <td style={{...S.td,fontWeight:800,color:'#dc2626'}}>{mDed>0?'-'+fmt(mDed):'—'}</td>
                          <td style={{...S.td,fontWeight:800}}>{fmt(mNet)}</td>
                          <td style={S.td}></td>
                          <td style={S.td}></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );})
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TIMESHEETS ────────────────────────────────────────────────────
function TimesheetsTable({ employees, initialFilter, hideEmpFilter, hideExportButton }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft]     = useState(null);
  const [filters, setFilters] = useState(initialFilter||{});
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  const load = async () => {
    setLoading(true);
    const {data,error} = await db.from('employee_timesheets').select('*').order('month',{ascending:false});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID',  width:'100px'},{key:'full_name',label:'Name',width:'150px'}]),
    {key:'client_project', label:'Client / Project', width:'150px'},
    {key:'income_type',    label:'Mode',             width:'120px', options:[{value:'hourly',label:'Hourly'},{value:'direct',label:'Direct'}]},
    {key:'remarks',        label:'Remarks',          width:'150px'},
  ];

  const filtered = useMemo(()=>applyFilters(rows,filters),[rows,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,'month'),[filtered]);
  const COLS = hideEmpFilter?8:10;

  const csvCols = [
    {key:'employee_id',label:'Emp ID'},{key:'full_name',label:'Name'},
    {key:'month',label:'Month'},{key:'client_project',label:'Client/Project'},
    {key:'income_type',label:'Mode'},{key:'hours',label:'Hours'},
    {key:'rate',label:'Rate'},{key:'remarks',label:'Remarks'},
  ];

  const blank = ()=>setDraft({employee_id:initialFilter&&initialFilter.employee_id||'',full_name:initialFilter&&initialFilter.full_name||'',month:'',client_project:'',income_type:'hourly',hours:'',rate:'',direct_income:'',remarks:''});
  const rowIncome = (r)=>(r.hours||0)*(r.rate||0);
  const totalIncome = rows.reduce((s,r)=>s+rowIncome(r),0);

  const openEdit = (r) => {
    const isDir=r.income_type==='direct';
    setDraft({...r,month:monthStr(r.month),income_type:r.income_type||'hourly',direct_income:isDir?r.rate:'',hours:isDir?'':r.hours,rate:isDir?'':r.rate});
  };
  const save = async () => {
    if (!draft.employee_id||!draft.month) return alert('Employee ID and month are required');
    const isDir=draft.income_type==='direct';
    const clean = {
      employee_id:draft.employee_id, full_name:draft.full_name, month:firstOfMonth(draft.month),
      client_project:draft.client_project||null,
      hours:isDir?1:Number(draft.hours)||0,
      rate:isDir?Number(draft.direct_income)||0:Number(draft.rate)||0,
      remarks:draft.remarks||null,
    };
    const withType={...clean,income_type:draft.income_type||'hourly'};
    let error;
    if (draft.id) {
      ({error}=await db.from('employee_timesheets').update(withType).eq('id',draft.id));
      if (error&&(error.message||'').includes('income_type')) ({error}=await db.from('employee_timesheets').update(clean).eq('id',draft.id));
    } else {
      ({error}=await db.from('employee_timesheets').upsert(withType,{onConflict:'employee_id,month,client_project'}));
      if (error&&(error.message||'').includes('income_type')) ({error}=await db.from('employee_timesheets').upsert(clean,{onConflict:'employee_id,month,client_project'}));
    }
    if (error) return alert(error.message);
    setDraft(null); load();
  };
  const remove = async (id)=>{ if(!window.confirm('Delete?'))return; await db.from('employee_timesheets').delete().eq('id',id); load(); };
  const isDirect=draft&&draft.income_type==='direct';

  return (
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>Timesheets — Income</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>{rows.length} entries · Total AED {fmt(totalIncome)}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!hideExportButton && <button style={S.btnExp} onClick={()=>exportCSV(filtered,'timesheets',csvCols)}>Export CSV</button>}
          <button style={S.btnPri} onClick={blank}>+ Add</button>
        </div>
      </div>

      <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

      {draft && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Employee</label>
            <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
              onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
          </div>
          <div style={{marginBottom:'12px'}}>
            <label style={S.label}>Income Entry Mode</label>
            <div style={{display:'flex',gap:'10px'}}>
              {[['hourly','Hours × Rate'],['direct','Direct Amount']].map(([val,lbl])=>(
                <label key={val} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',
                  background:draft.income_type===val?'#0f172a':'#f1f5f9',color:draft.income_type===val?'#fff':'#475569',
                  border:'1px solid '+(draft.income_type===val?'#0f172a':'#cbd5e1'),
                  borderRadius:'8px',padding:'8px 14px',fontWeight:700,fontSize:'12.5px'}}>
                  <input type="radio" name="income_type" value={val} checked={draft.income_type===val}
                    onChange={()=>setDraft(d=>({...d,income_type:val}))} style={{display:'none'}} />{lbl}
                </label>
              ))}
            </div>
          </div>
          {isDirect ? (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:'10px',marginBottom:'10px'}}>
              <div><label style={S.label}>Month</label><input type="month" value={draft.month||''} onChange={e=>setDraft(d=>({...d,month:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Total Income (AED)</label><input type="number" step="0.01" value={draft.direct_income||''} onChange={e=>setDraft(d=>({...d,direct_income:e.target.value}))} style={{...S.input,width:'100%'}} autoFocus/></div>
              <div><label style={S.label}>Client / Project</label><input value={draft.client_project||''} onChange={e=>setDraft(d=>({...d,client_project:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            </div>
          ) : (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'8px'}}>
                <div><label style={S.label}>Month</label><input type="month" value={draft.month||''} onChange={e=>setDraft(d=>({...d,month:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div><label style={S.label}>Client / Project</label><input value={draft.client_project||''} onChange={e=>setDraft(d=>({...d,client_project:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
                <div><label style={S.label}>Hours</label><input type="number" value={draft.hours||''} onChange={e=>setDraft(d=>({...d,hours:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div><label style={S.label}>Rate (AED/hr)</label><input type="number" step="0.001" value={draft.rate||''} onChange={e=>setDraft(d=>({...d,rate:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              </div>
              {draft.hours&&draft.rate&&<div style={{marginBottom:'8px',fontSize:'12px',color:'#166534',fontWeight:700}}>= AED {fmt(Number(draft.hours)*Number(draft.rate))}</div>}
            </>
          )}
          <div style={{marginBottom:'10px'}}>
            <label style={S.label}>Remarks</label>
            <input value={draft.remarks||''} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>{(hideEmpFilter?['Month','Client/Project','Mode','Hours','Rate','Income','Remarks','']:['Emp ID','Name','Month','Client/Project','Mode','Hours','Rate','Income','Remarks','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : grouped.length===0
                ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No entries yet':'No entries match filters'}</td></tr>
                : grouped.map(g=>{
                    const mIncome = g.rows.reduce((s,r)=>s+rowIncome(r),0);
                    return (
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={COLS} />}
                      {g.rows.map(r=>{
                        const isDir=r.income_type==='direct';
                        return (
                          <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',cursor:'pointer'}} onClick={()=>openEdit(r)}>
                            {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>}
                            {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>}
                            <td style={S.td}>{monthStr(r.month)}</td>
                            <td style={{...S.td,whiteSpace:'normal'}}>{r.client_project||'—'}</td>
                            <td style={S.td}>{isDir?<span style={{background:'#f0fdf4',color:'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>Direct</span>:<span style={{background:'#eff6ff',color:'#1d4ed8',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>Hourly</span>}</td>
                            <td style={{...S.td,color:'#94a3b8'}}>{isDir?'—':r.hours}</td>
                            <td style={{...S.td,color:'#94a3b8'}}>{isDir?'—':fmt(r.rate)}</td>
                            <td style={{...S.td,fontWeight:700,color:'#166534'}}>{fmt(rowIncome(r))}</td>
                            <td style={S.tdWrap}>{r.remarks||'—'}</td>
                            <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();openEdit(r);}}>&#9998;</button>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                        {!hideEmpFilter && <td style={S.td}></td>}
                        {!hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>}
                        {hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>}
                        <td style={S.td}></td>
                        <td style={S.td}></td>
                        <td style={S.td}></td>
                        <td style={S.td}></td>
                        <td style={{...S.td,fontWeight:800,color:'#166534'}}>AED {fmt(mIncome)}</td>
                        <td style={S.td}></td>
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

// ── ONBOARDING & MISC COSTS ───────────────────────────────────────
const OTHER_COST_TYPES = [
  {value:'security_deposit',           label:'Security Deposit (received from employee — Income)'},
  {value:'agent_commission',           label:'Agent / Sourcing Commission'},
  {value:'salary_advance',             label:'Salary Advance Given on Arrival'},
  {value:'local_transport',            label:'Local Transport (taxi/bus during visa processing)'},
  {value:'medical_test_expense',       label:'Medical Test Day — Food/Transport'},
  {value:'food_accommodation_presite', label:'Food & Accommodation (before mobilization)'},
  {value:'site_accommodation',         label:'Site Accommodation (if not by client)'},
  {value:'visit_visa_extra',           label:'Visit Visa — Other Cost'},
  {value:'wps_overpayment_recovery',   label:'⏱️ WPS Overpaid vs Client Billing (auto, from Client Billing tab)'},
  {value:'wps_underpayment_payable',   label:'⏱️ WPS Underpaid vs Client Billing — payable to employee (auto, from Client Billing tab)'},
  {value:'camp_food_accommodation',    label:'🏕️ Camp Food/Accommodation/Transport — off-site days (auto, from Camp Costs tab)'},
  {value:'other',                      label:'Other'},
];
const OTHER_COST_LABEL = Object.fromEntries(OTHER_COST_TYPES.map(o=>[o.value,o.label]));
const CURRENCIES = ['INR','PKR','PHP','NPR','LKR','BDT','USD','EUR','GBP','SAR','QAR','KWD','OMR','BHD'];

function OtherCostsTable({ employees, initialFilter, hideEmpFilter, hideExportButton }) {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [draft, setDraft]         = useState(null);
  const [filters, setFilters]     = useState(initialFilter||{});
  const [fxStatus, setFxStatus]   = useState('');
  const [fxLoading, setFxLoading] = useState(false);
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  const load = async () => {
    setLoading(true);
    const {data,error} = await db.from('employee_other_costs').select('*').order('cost_date',{ascending:false});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID',  width:'100px'},{key:'full_name',label:'Name',width:'150px'}]),
    {key:'cost_type',   label:'Cost Type', width:'200px',
      options: OTHER_COST_TYPES.map(o=>({value:o.value, label:o.label.length>38?o.label.slice(0,38)+'…':o.label}))},
    {key:'notes',       label:'Remarks',   width:'150px'},
  ];

  const filtered = useMemo(()=>applyFilters(rows,filters),[rows,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,'cost_date'),[filtered]);
  const COLS = hideEmpFilter?8:10;

  const csvCols = [
    {key:'employee_id',label:'Emp ID'},{key:'full_name',label:'Name'},
    {key:'cost_type',label:'Cost Type'},{key:'cost_date',label:'Date'},
    {key:'amount',label:'Amount (AED)'},{key:'original_currency',label:'Orig Currency'},
    {key:'original_amount',label:'Orig Amount'},{key:'exchange_rate',label:'Exchange Rate'},
    {key:'recoverable',label:'Recoverable'},{key:'recovered_amount',label:'Recovered'},
    {key:'notes',label:'Remarks'},
  ];

  const blank = ()=>{ setFxStatus(''); setDraft({employee_id:initialFilter&&initialFilter.employee_id||'',full_name:initialFilter&&initialFilter.full_name||'',cost_type:'security_deposit',cost_date:new Date().toISOString().slice(0,10),amount:'',recoverable:false,recovered_amount:'',notes:'',original_currency:'INR',original_amount:'',exchange_rate:''}); };

  const fetchFxRate = async () => {
    if (!draft.original_amount||!draft.cost_date) return alert('Enter original amount and date first');
    const cur=draft.original_currency||'INR';
    setFxLoading(true); setFxStatus('Fetching exchange rate…');
    const directUrl=`https://api.frankfurter.app/${draft.cost_date}?from=${cur}&to=AED`;
    let json=null;
    try { const res=await fetch(directUrl,{mode:'cors'}); if(res.ok) json=await res.json(); } catch(_){}
    if (!json) { try { const res2=await fetch(`https://corsproxy.io/?${encodeURIComponent(directUrl)}`); if(res2.ok) json=await res2.json(); } catch(e2){} }
    setFxLoading(false);
    if (json&&json.rates&&json.rates.AED) {
      const rate=json.rates.AED;
      const aed=(Number(draft.original_amount)*rate).toFixed(2);
      setDraft(d=>({...d,exchange_rate:rate,amount:aed,notes:`${cur} ${Number(d.original_amount).toLocaleString()} × ${rate} = AED ${aed} (date: ${json.date})`}));
      setFxStatus(`1 ${cur} = ${rate} AED  (${json.date})`);
    } else { setFxStatus('Could not fetch rate. Enter AED amount manually.'); }
  };

  const save = async () => {
    if (!draft.employee_id) return alert('Employee is required');
    const clean = {
      employee_id:draft.employee_id, full_name:draft.full_name||null,
      cost_type:draft.cost_type, cost_date:draft.cost_date||new Date().toISOString().slice(0,10),
      amount:Number(draft.amount)||0, recoverable:!!draft.recoverable,
      recovered_amount:Number(draft.recovered_amount)||0, notes:draft.notes||null,
      original_currency:draft.original_currency||null, original_amount:Number(draft.original_amount)||null, exchange_rate:Number(draft.exchange_rate)||null,
    };
    const {error} = draft.id
      ? await db.from('employee_other_costs').update(clean).eq('id',draft.id)
      : await db.from('employee_other_costs').insert(clean);
    if (error) return alert(error.message);
    setDraft(null); setFxStatus(''); load();
  };
  const remove = async (id)=>{ if(!window.confirm('Delete?'))return; await db.from('employee_other_costs').delete().eq('id',id); load(); };

  const isDeposit = draft&&draft.cost_type==='security_deposit';
  const totalDeposits = filtered.filter(r=>r.cost_type==='security_deposit').reduce((s,r)=>s+(Number(r.amount)||0),0);
  const totalExpense  = filtered.filter(r=>r.cost_type!=='security_deposit').reduce((s,r)=>s+(Number(r.amount)||0),0);
  const outstanding   = filtered.reduce((s,r)=>s+(r.recoverable?(Number(r.amount)||0)-(Number(r.recovered_amount)||0):0),0);

  return (
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>Onboarding & Misc Costs</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>
            {filtered.length} entries · Expense AED {fmt(totalExpense)}
            {totalDeposits>0&&<span style={{color:'#166534',fontWeight:700}}> · Deposits: AED {fmt(totalDeposits)}</span>}
            {' · '}Outstanding AED {fmt(outstanding)}
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!hideExportButton && <button style={S.btnExp} onClick={()=>exportCSV(filtered,'onboarding_misc',csvCols)}>Export CSV</button>}
          <button style={S.btnPri} onClick={blank}>+ Add</button>
        </div>
      </div>

      <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

      {draft && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{display:'grid',gridTemplateColumns:'1.8fr 1.3fr 1fr',gap:'10px',marginBottom:'8px',alignItems:'end'}}>
            <div>
              <label style={S.label}>Employee</label>
              <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
            </div>
            <div><label style={S.label}>Cost Type</label>
              <select value={draft.cost_type} onChange={e=>setDraft(d=>({...d,cost_type:e.target.value}))} style={{...S.input,width:'100%'}}>
                {OTHER_COST_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label style={S.label}>Date</label><input type="date" value={draft.cost_date} onChange={e=>setDraft(d=>({...d,cost_date:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
          </div>
          {isDeposit && (
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'10px 12px',marginBottom:'8px'}}>
              <div style={{fontWeight:700,fontSize:'12.5px',color:'#166534',marginBottom:'8px'}}>Security Deposit — Auto Currency Converter</div>
              <div style={{display:'grid',gridTemplateColumns:'140px 1fr 1fr auto',gap:'8px',alignItems:'end'}}>
                <div><label style={S.label}>Currency</label>
                  <select value={draft.original_currency||'INR'} onChange={e=>setDraft(d=>({...d,original_currency:e.target.value}))} style={{...S.input,width:'100%'}}>
                    {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={S.label}>Original Amount</label><input type="number" value={draft.original_amount||''} onChange={e=>setDraft(d=>({...d,original_amount:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div><label style={S.label}>Amount in AED</label><input type="number" step="0.01" value={draft.amount||''} onChange={e=>setDraft(d=>({...d,amount:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <button onClick={fetchFxRate} disabled={fxLoading} style={{...S.btnPri,background:'#166534',padding:'8px 14px',whiteSpace:'nowrap'}}>{fxLoading?'…':'⟳ Fetch Rate'}</button>
              </div>
              {fxStatus&&<div style={{marginTop:'8px',fontSize:'11.5px',color:fxStatus.startsWith('1 ')?'#166534':'#dc2626',fontWeight:600}}>{fxStatus}</div>}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns: isDeposit ? '1fr 1fr 2fr' : '1fr 1fr 1fr 2fr',gap:'10px',marginBottom:'8px',alignItems:'end'}}>
            {!isDeposit && (
              <div><label style={S.label}>Amount (AED)</label><input type="number" value={draft.amount||''} onChange={e=>setDraft(d=>({...d,amount:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            )}
            <div style={{display:'flex',alignItems:'center',gap:'8px',paddingBottom:'6px'}}>
              <input type="checkbox" id="recov" checked={!!draft.recoverable} onChange={e=>setDraft(d=>({...d,recoverable:e.target.checked}))} style={{width:'16px',height:'16px'}} />
              <label htmlFor="recov" style={{fontSize:'12.5px',fontWeight:600,color:'#475569'}}>Recoverable from salary</label>
            </div>
            <div><label style={S.label}>Recovered so far (AED)</label><input type="number" value={draft.recovered_amount||''} disabled={!draft.recoverable} onChange={e=>setDraft(d=>({...d,recovered_amount:e.target.value}))} style={{...S.input,width:'100%',opacity:draft.recoverable?1:0.5}} /></div>
            <div><label style={S.label}>Remarks</label><input value={draft.notes||''} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>{setDraft(null);setFxStatus('');}}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>{(hideEmpFilter?['Cost Type','Date','Amount','Recoverable','Recovered','Outstanding','Remarks','']:['Emp ID','Name','Cost Type','Date','Amount','Recoverable','Recovered','Outstanding','Remarks','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : grouped.length===0
                ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No entries yet':'No entries match filters'}</td></tr>
                : grouped.map(g=>{
                    const mAmount = g.rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
                    const mExpense = g.rows.filter(r=>r.cost_type!=='security_deposit').reduce((s,r)=>s+(Number(r.amount)||0),0);
                    const mDeposit = g.rows.filter(r=>r.cost_type==='security_deposit').reduce((s,r)=>s+(Number(r.amount)||0),0);
                    return (
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={COLS} />}
                      {g.rows.map(r=>{
                        const out=r.recoverable?(Number(r.amount)||0)-(Number(r.recovered_amount)||0):0;
                        const isDep=r.cost_type==='security_deposit';
                        return (
                          <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',background:isDep?'#f0fdf4':'transparent',cursor:'pointer'}}
                            onClick={()=>{setFxStatus('');setDraft({...r,cost_date:r.cost_date||'',original_currency:r.original_currency||'INR'});}}>
                            {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>}
                            {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>}
                            <td style={{...S.td,whiteSpace:'normal',maxWidth:'220px',fontSize:'11.5px'}}>{isDep?<span><span style={{background:'#dcfce7',color:'#166534',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px'}}>Income</span> {OTHER_COST_LABEL[r.cost_type]||r.cost_type}</span>:(OTHER_COST_LABEL[r.cost_type]||r.cost_type)}</td>
                            <td style={S.td}>{r.cost_date||'—'}</td>
                            <td style={{...S.td,fontWeight:700,color:isDep?'#166534':'#0f172a'}}>{isDep?'+':''}{fmt(r.amount)}{r.original_currency&&r.original_amount&&<div style={{fontSize:'10px',color:'#94a3b8'}}>{r.original_currency} {Number(r.original_amount).toLocaleString()}</div>}</td>
                            <td style={S.td}>{!isDep&&r.recoverable?<span style={{background:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'10px'}}>Yes</span>:'—'}</td>
                            <td style={S.td}>{!isDep&&r.recoverable?fmt(r.recovered_amount):'—'}</td>
                            <td style={{...S.td,fontWeight:700,color:out>0?'#dc2626':'#94a3b8'}}>{!isDep&&r.recoverable?fmt(out):'—'}</td>
                            <td style={S.tdWrap}>{r.notes||'—'}</td>
                            <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();setFxStatus('');setDraft({...r,cost_date:r.cost_date||'',original_currency:r.original_currency||'INR'});}}>&#9998;</button>
                              <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                        {!hideEmpFilter && <td style={S.td}></td>}
                        {!hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>}
                        {hideEmpFilter && <td style={{...S.td,fontWeight:800,fontSize:'11px',color:'#64748b',textTransform:'uppercase'}}>Month Total</td>}
                        <td style={S.td}></td>
                        <td style={{...S.td,fontWeight:800}}>
                          {mExpense>0 && <div style={{color:'#0f172a'}}>AED {fmt(mExpense)}</div>}
                          {mDeposit>0 && <div style={{color:'#166534'}}>+{fmt(mDeposit)}</div>}
                        </td>
                        <td style={S.td}></td>
                        <td style={S.td}></td>
                        <td style={S.td}></td>
                        <td style={S.td}></td>
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

// ── CLIENT HOURLY BILLING (e.g. Brunel) ───────────────────────────
// Per employee/month: log hours per project worked → generate invoice (docx) →
// record actual AED received from client → auto-split SATCO vs Employee share →
// record WPS amount actually paid to employee → track recoverable/recovered balance,
// recovered progressively over future months. Recovery rows feed the same
// employee_other_costs recoverable pool used on the main P&L Dashboard.

function genInvoiceNumber() {
  const d = new Date();
  return `ST/${String(d.getFullYear()).slice(2)}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function numberToWordsAED(amount) {
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function chunk(n){
    let s='';
    if(n>=100){s+=ones[Math.floor(n/100)]+' Hundred ';n%=100;}
    if(n>=20){s+=tens[Math.floor(n/10)]+' ';n%=10;}
    if(n>0) s+=ones[n]+' ';
    return s;
  }
  const whole=Math.floor(amount);
  const fils=Math.round((amount-whole)*100);
  if (whole===0 && fils===0) return 'Zero Dirhams';
  let n=whole, words='', scaleIdx=0;
  const scales=['','Thousand','Million','Billion'];
  const parts=[];
  if (n===0) parts.push('Zero');
  while(n>0){ const c=n%1000; if(c>0) parts.unshift(chunk(c)+scales[scaleIdx]+' '); n=Math.floor(n/1000); scaleIdx++; }
  words = parts.join('').trim();
  let out = words+' Dirhams';
  if (fils>0) out += ' and '+chunk(fils).trim()+' Fils';
  return out;
}

// Decode a base64 string into a Uint8Array (browser-safe, no Buffer dependency).
function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateBrunelInvoiceDocx(inv, lines) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
          BorderStyle, WidthType, ShadingType, VerticalAlign, ImageRun, Header, Footer } = window.docx;

  const currency = inv.currency || 'EUR';
  const currencyLabel = currency; // used in column headers, e.g. "Unit Rate (EUR)"
  const isAed = currency === 'AED';

  const totalHours = lines.reduce((s,l)=>s+(Number(l.hours)||0),0);
  const totalCcy   = lines.reduce((s,l)=>s+(Number(l.hours)||0)*(Number(l.rate_eur_hr)||inv.brunel_rate_eur_hr||0),0);
  const rate = isAed ? 1 : (Number(inv.invoice_exchange_rate)||0);
  const totalAed = isAed ? totalCcy : totalCcy*rate;

  const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

  // Column widths sum to 10106 DXA, matching the printable content width (A4 width 11906 minus
  // 900 DXA left/right margins each). The original widths summed to 12260, overflowing the page
  // by about 1.5 inches and clipping the right-most columns when printed.
  const colWidths = [495, 3462, 824, 1072, 1236, 577, 1072, 1368];
  const tableWidth = colWidths.reduce((a,b)=>a+b,0);

  function headerCell(text, width) {
    return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, shading:{fill:'E8E8E8',type:ShadingType.CLEAR}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER,
      children:[new Paragraph({alignment:AlignmentType.CENTER, children:[new TextRun({text, bold:true, size:18})]})] });
  }
  function cell(text, width, opts) {
    opts = opts||{};
    return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER,
      children:[new Paragraph({alignment:opts.align||AlignmentType.LEFT, children:[new TextRun({text:String(text), bold:!!opts.bold, size:18})]})] });
  }

  const lineRows = lines.map((l,i)=>{
    const r = Number(l.rate_eur_hr)||inv.brunel_rate_eur_hr||0;
    const amt = (Number(l.hours)||0)*r;
    return new TableRow({ children:[
      cell(String(i+1), colWidths[0], {align:AlignmentType.CENTER}),
      cell(l.project_name||'', colWidths[1]),
      cell(fmt2(l.hours), colWidths[2], {align:AlignmentType.CENTER}),
      cell(fmt2(r), colWidths[3], {align:AlignmentType.CENTER}),
      cell(fmt2(amt), colWidths[4], {align:AlignmentType.RIGHT}),
      cell('0%', colWidths[5], {align:AlignmentType.CENTER}),
      cell('0', colWidths[6], {align:AlignmentType.RIGHT}),
      cell(fmt2(amt), colWidths[7], {align:AlignmentType.RIGHT}),
    ]});
  });

  const totalsRow = new TableRow({ children:[
    cell('', colWidths[0]),
    cell('TOTAL', colWidths[1], {bold:true}),
    cell(fmt2(totalHours), colWidths[2], {align:AlignmentType.CENTER,bold:true}),
    cell('', colWidths[3]),
    cell(fmt2(totalCcy), colWidths[4], {align:AlignmentType.RIGHT,bold:true}),
    cell('', colWidths[5]),
    cell('-', colWidths[6], {align:AlignmentType.RIGHT,bold:true}),
    cell(fmt2(totalCcy), colWidths[7], {align:AlignmentType.RIGHT,bold:true}),
  ]});

  function infoRow(label, value, opts) {
    opts=opts||{};
    return new TableRow({ children:[
      new TableCell({ borders, width:{size:colWidths.slice(0,7).reduce((a,b)=>a+b,0),type:WidthType.DXA}, margins:cellMargins, columnSpan:7,
        children:[new Paragraph({alignment:AlignmentType.RIGHT, children:[new TextRun({text:label, bold:true, size:18})]})] }),
      new TableCell({ borders, width:{size:colWidths[7],type:WidthType.DXA}, margins:cellMargins,
        children:[new Paragraph({alignment:AlignmentType.RIGHT, children:[new TextRun({text:value, bold:!!opts.bold, size:18})]})] }),
    ]});
  }

  function rowLine(label, value) {
    return new Paragraph({ children:[ new TextRun({text:label+': ', bold:true, size:18}), new TextRun({text:String(value), size:18}) ] });
  }

  // Letterhead header/footer images (full-width banner), embedded from the company letterhead.
  const { header: _lhHeader, footer: _lhFooter } = await loadLetterheadAssets();
  const headerImage = new ImageRun({
    type: 'png',
    data: _lhHeader,
    transformation: { width: 540, height: 59 },
    altText: { title: 'SATCO Letterhead', description: 'SATCO Arabia General Contracting letterhead', name: 'Letterhead Header' },
  });
  const footerImage = new ImageRun({
    type: 'png',
    data: _lhFooter,
    transformation: { width: 540, height: 37 },
    altText: { title: 'SATCO Footer', description: 'SATCO Arabia General Contracting contact footer', name: 'Letterhead Footer' },
  });

  const doc = new Document({
    styles: { default: { document: { run: { font:'Arial', size:20 } } } },
    sections: [{
      properties: { page: { size:{width:11906,height:16838}, margin:{top:1500,right:900,bottom:1200,left:900,header:500,footer:400} } },
      headers: { default: new Header({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[headerImage] }) ] }) },
      footers: { default: new Footer({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[footerImage] }) ] }) },
      children: [
        new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:120,after:300},
          children:[ new TextRun({ text:'TAX INVOICE — EXPORT SERVICES', bold:true, size:26 }) ] }),

        new Table({ width:{size:tableWidth,type:WidthType.DXA}, columnWidths:[5200, 5460], rows:[
          new TableRow({ children:[
            new TableCell({ borders, width:{size:5200,type:WidthType.DXA}, margins:cellMargins,
              children:[
                new Paragraph({children:[new TextRun({text:'Project Location: '+(inv.project_location||''), size:18})]}),
                new Paragraph({children:[new TextRun({text:'', size:8})]}),
                new Paragraph({children:[new TextRun({text:'Customer:', bold:true, size:18})]}),
                new Paragraph({children:[new TextRun({text:inv.client_name||'', bold:true, size:18})]}),
                new Paragraph({children:[new TextRun({text:inv.client_address_line1||'', size:18})]}),
                new Paragraph({children:[new TextRun({text:inv.client_address_line2||'', size:18})]}),
                new Paragraph({children:[new TextRun({text:inv.client_address_line3||'', size:18})]}),
              ] }),
            new TableCell({ borders, width:{size:5460,type:WidthType.DXA}, margins:cellMargins,
              children: isAed ? [
                rowLine('Invoice #', inv.invoice_number||''),
                rowLine('Invoice Date', inv.invoice_date||''),
                rowLine('Invoice period', monthStr(inv.month)),
                rowLine('PO Reference', inv.po_reference||''),
                rowLine('Currency', 'AED'),
              ] : [
                rowLine('Invoice #', inv.invoice_number||''),
                rowLine('Invoice Date', inv.invoice_date||''),
                rowLine('Invoice period', monthStr(inv.month)),
                rowLine('PO Reference', inv.po_reference||''),
                rowLine('Exchange Rate', '1 '+currency+' = '+fmt4(rate)+' AED'),
              ] }),
          ]}),
        ]}),

        new Paragraph({ spacing:{before:240,after:60}, children:[new TextRun({text:'Subject: Invoice for PCM Support Work', bold:true, size:20})] }),
        new Paragraph({ spacing:{after:200}, children:[new TextRun({text:`Please find the below description of PCM support services for the month of ${monthStr(inv.month)}`, size:18})] }),

        new Table({ width:{size:tableWidth,type:WidthType.DXA}, columnWidths:colWidths, rows:[
          new TableRow({ children:[
            headerCell('Sl.No.', colWidths[0]), headerCell('Description', colWidths[1]), headerCell('QTY(HRS)', colWidths[2]),
            headerCell(`Unit Rate (${currencyLabel})`, colWidths[3]), headerCell(`Taxable Amount (${currencyLabel})`, colWidths[4]),
            headerCell('VAT %', colWidths[5]), headerCell(`VAT Amount (${currencyLabel})`, colWidths[6]), headerCell(`Amount Incl. VAT (${currencyLabel})`, colWidths[7]),
          ]}),
          ...lineRows,
          totalsRow,
        ]}),

        new Table({ width:{size:tableWidth,type:WidthType.DXA}, columnWidths:[colWidths.slice(0,7).reduce((a,b)=>a+b,0), colWidths[7]], rows: isAed ? [
          infoRow(`Gross Taxable Amount (${currencyLabel})`, fmt2(totalCcy)),
          infoRow(`VAT Amount (${currencyLabel})`, '-'),
          infoRow(`Total Amount Incl. VAT (${currencyLabel})`, fmt2(totalCcy), {bold:true}),
        ] : [
          infoRow(`Gross Taxable Amount (${currencyLabel})`, fmt2(totalCcy)),
          infoRow(`VAT Amount (${currencyLabel})`, '-'),
          infoRow(`Total Taxable Amount (${currencyLabel})`, fmt2(totalCcy), {bold:true}),
          infoRow('Gross Taxable Amount (AED)', fmt2(totalAed)),
          infoRow('VAT Amount (AED)', '-'),
          infoRow('Total Amount Incl. VAT (AED)', fmt2(totalAed), {bold:true}),
        ]}),

        new Paragraph({ spacing:{before:200,after:60}, children:[new TextRun({text:'Amount in words (AED): '+numberToWordsAED(totalAed), bold:true, size:18})] }),
        new Paragraph({ spacing:{after:200}, children:[new TextRun({text:'Payment Mode: 7 Days from Invoice Submission date', size:18})] }),

        new Paragraph({ spacing:{before:200,after:60}, children:[new TextRun({text:'OUR BANK DETAILS:', bold:true, size:18})] }),
        new Paragraph({ children:[new TextRun({text:'ACCOUNT TITLE: SATCO ARABIA GENERAL CONTRACTING -L.L.C-S.P.C', size:18})] }),
        new Paragraph({ children:[new TextRun({text:'ACCOUNT NUMBER: 90020200014786   IBAN NO: AE170110090020200014786', size:18})] }),
        new Paragraph({ children:[new TextRun({text:'BANK NAME: BANK OF BARODA', size:18})] }),
        new Paragraph({ spacing:{after:300}, children:[new TextRun({text:'TRN: 105042029600003', size:18})] }),

        new Paragraph({ spacing:{before:300}, children:[new TextRun({text:'Best regards,', size:18})] }),
        new Paragraph({ spacing:{after:60}, children:[new TextRun({text:'General Manager', bold:true, size:18})] }),
        new Paragraph({ children:[new TextRun({text:'Computer generated invoice — no original signature or stamp required.', italics:true, size:16})] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Invoice_${(inv.invoice_number||'draft').replace(/\//g,'-')}_${inv.full_name||''}_${monthStr(inv.month)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

const fmt2 = (n)=> (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt4 = (n)=> (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:4});

// Client billing can be invoiced in AED, EUR, USD, GBP, or a custom code.
// currencySymbol() gives a compact symbol for inline display; currency codes are used in documents.
const BILLING_CURRENCIES = ['AED','EUR','USD','GBP'];
function currencySymbol(code) {
  const map = { AED:'AED ', EUR:'€', USD:'$', GBP:'£' };
  return map[code] || (code ? code+' ' : '');
}

