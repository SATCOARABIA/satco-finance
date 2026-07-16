function ClientBillingTab({ employees, initialFilter, hideEmpFilter }) {
  const [invoices, setInvoices]   = useState([]);
  const [linesMap, setLinesMap]   = useState({});       // invoice_id -> [lines]
  const [recoveries, setRecoveries] = useState([]);
  const [syncedRecovery, setSyncedRecovery] = useState({}); // invoice_id -> {amount, recovered_amount} from employee_other_costs (P&L Dashboard's source of truth)
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState(initialFilter||{});
  const [draft, setDraft]         = useState(null);      // invoice header being edited
  const [draftLines, setDraftLines] = useState([]);       // line items for draft
  const [expandedId, setExpandedId] = useState(null);
  const [recDraft, setRecDraft]   = useState(null);       // recovery entry being added
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  // One-time auto-repair: recompute each invoice's overpayment from its own saved data and
  // correct (or create) the matching employee_other_costs recovery row if it's missing or
  // out of sync — this is what keeps Client Billing's Recovery Status and the P&L Dashboard
  // showing the same number without requiring the user to re-open and re-save every invoice.
  const autoRepairSync = async (invList, linesByInvoice, syncMap) => {
    const fixes = [];
    for (const inv of invList) {
      const lns = linesByInvoice[inv.id]||[];
      const split = wpsInvoiceSplit(inv, lns);
      if (split.overpaid === null) continue;
      const { overpaid } = split;
      const synced = syncMap[inv.id];
      const wantType = overpaid > 0.5 ? 'over' : overpaid < -0.5 ? 'under' : null;
      if (wantType) {
        const roundedAmt = Math.round(Math.abs(overpaid)*100)/100;
        const wantCostType = wantType==='over' ? 'wps_overpayment_recovery' : 'wps_underpayment_payable';
        const wantNote = wantType==='over'
          ? `WPS overpaid vs employee's actual share for ${monthStr(inv.month)} [INV:${inv.id}]`
          : `WPS underpaid vs employee's actual share for ${monthStr(inv.month)} — payable to employee [INV:${inv.id}]`;
        if (!synced) {
          fixes.push(db.from('employee_other_costs').insert({
            employee_id:inv.employee_id, full_name:inv.full_name, cost_type:wantCostType,
            cost_date:inv.wps_paid_date||inv.month||new Date().toISOString().slice(0,10),
            amount:roundedAmt, recoverable: wantType==='over', recovered_amount:0,
            notes:wantNote,
          }));
        } else if (synced.type !== wantType) {
          // Direction flipped since the last save (e.g. WPS amount corrected) — replace the stale row.
          fixes.push(db.from('employee_other_costs').delete().eq('employee_id',inv.employee_id).ilike('notes', `%[INV:${inv.id}]%`).then(()=>
            db.from('employee_other_costs').insert({
              employee_id:inv.employee_id, full_name:inv.full_name, cost_type:wantCostType,
              cost_date:inv.wps_paid_date||inv.month||new Date().toISOString().slice(0,10),
              amount:roundedAmt, recoverable: wantType==='over', recovered_amount:0,
              notes:wantNote,
            })
          ));
        } else if (Math.abs(synced.amount-roundedAmt) > 0.5) {
          fixes.push(db.from('employee_other_costs').update({ amount:roundedAmt }).eq('employee_id',inv.employee_id).eq('cost_type',wantCostType).ilike('notes', `%[INV:${inv.id}]%`));
        }
      } else if (synced) {
        // No longer over- or under-paid (e.g. WPS amount corrected to match exactly) — remove the stale row.
        fixes.push(db.from('employee_other_costs').delete().eq('employee_id',inv.employee_id).ilike('notes', `%[INV:${inv.id}]%`));
      }
    }
    if (fixes.length) await Promise.all(fixes);
    return fixes.length;
  };

  const load = async () => {
    setLoading(true);
    const [inv, lns, rec, oc] = await Promise.all([
      db.from('employee_client_invoices').select('*').order('month',{ascending:false}),
      db.from('employee_client_invoice_lines').select('*').order('sort_order',{ascending:true}),
      db.from('employee_client_recoveries').select('*').order('recovery_month',{ascending:false}),
      db.from('employee_other_costs').select('id,cost_type,amount,recovered_amount,notes').in('cost_type',['wps_overpayment_recovery','wps_underpayment_payable']),
    ]);
    const invData = inv.data||[];
    if (!inv.error) setInvoices(invData);
    let linesByInvoice = {};
    if (!lns.error) {
      (lns.data||[]).forEach(l=>{ if(!linesByInvoice[l.invoice_id]) linesByInvoice[l.invoice_id]=[]; linesByInvoice[l.invoice_id].push(l); });
      setLinesMap(linesByInvoice);
    }
    if (!rec.error) setRecoveries(rec.data||[]);
    // Map each synced employee_other_costs row (recovery OR payable) back to its invoice id, parsed
    // from the [INV:id] tag in notes. type:'over' = employee owes company, type:'under' = company
    // owes employee — both keep the same {amount, recovered} shape so the rest of this component can
    // treat "outstanding" the same way regardless of direction.
    let syncMap = {};
    if (!oc.error) {
      (oc.data||[]).forEach(r=>{
        const match = String(r.notes||'').match(/\[INV:([^\]]+)\]/);
        if (match) syncMap[match[1]] = { amount:Number(r.amount)||0, recovered:Number(r.recovered_amount)||0, type: r.cost_type==='wps_underpayment_payable'?'under':'over' };
      });
      setSyncedRecovery(syncMap);
    }
    setLoading(false);

    // Auto-repair runs silently in the background after the page has rendered; if it fixes
    // anything, refresh the synced map once more so the table reflects the corrected values.
    if (!inv.error && !lns.error && !oc.error) {
      const fixedCount = await autoRepairSync(invData, linesByInvoice, syncMap);
      if (fixedCount > 0) {
        const { data: ocFresh } = await db.from('employee_other_costs').select('id,cost_type,amount,recovered_amount,notes').in('cost_type',['wps_overpayment_recovery','wps_underpayment_payable']);
        const freshMap = {};
        (ocFresh||[]).forEach(r=>{
          const match = String(r.notes||'').match(/\[INV:([^\]]+)\]/);
          if (match) freshMap[match[1]] = { amount:Number(r.amount)||0, recovered:Number(r.recovered_amount)||0, type: r.cost_type==='wps_underpayment_payable'?'under':'over' };
        });
        setSyncedRecovery(freshMap);
      }
    }
  };
  useEffect(()=>{load();},[]);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID',  width:'100px'},{key:'full_name',label:'Name',width:'150px'}]),
    {key:'client_name', label:'Client', width:'180px'},
    {key:'invoice_number', label:'Invoice #', width:'140px'},
  ];
  const filtered = useMemo(()=>applyFilters(invoices,filters),[invoices,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,'month'),[filtered]);

  const blank = () => {
    setDraft({
      employee_id: initialFilter&&initialFilter.employee_id||'', full_name: initialFilter&&initialFilter.full_name||'',
      month:'', client_name:'Brunel Energy Europe B.V. SUCURSAL EN ESPANA',
      client_address_line1:'Calle General Moscrado 1, 2nd floor', client_address_line2:'28020 MADRID', client_address_line3:'Spain. W00331621',
      project_location:'Netherlands', po_reference:'', invoice_number:genInvoiceNumber(), invoice_date:new Date().toISOString().slice(0,10),
      currency:'EUR', invoice_exchange_rate:'', satco_rate_eur_hr:4.5, brunel_rate_eur_hr:57,
      received_amount_aed:'', received_date:'', received_exchange_rate:'',
      wps_paid_aed:'', wps_paid_date:'', remarks:'',
    });
    setDraftLines([{project_name:'', hours:'', rate_eur_hr:''}]);
  };

  const openEdit = (inv) => {
    setDraft({...inv, month:monthStr(inv.month), currency:inv.currency||'EUR'});
    const lns = linesMap[inv.id]||[];
    setDraftLines(lns.length? lns.map(l=>({...l})) : [{project_name:'', hours:'', rate_eur_hr:''}]);
  };

  const addLine = ()=>setDraftLines(d=>[...d,{project_name:'',hours:'',rate_eur_hr:''}]);
  const removeLine = (i)=>setDraftLines(d=>d.filter((_,idx)=>idx!==i));
  const updateLine = (i,key,val)=>setDraftLines(d=>d.map((l,idx)=>idx===i?{...l,[key]:val}:l));

  const totalHoursDraft = draftLines.reduce((s,l)=>s+(Number(l.hours)||0),0);
  const totalEurDraft   = draftLines.reduce((s,l)=>s+(Number(l.hours)||0)*(Number(l.rate_eur_hr)||Number(draft&&draft.brunel_rate_eur_hr)||0),0);
  const invoiceAedDraft = totalEurDraft*(Number(draft&&draft.invoice_exchange_rate)||0);

  // Split calc: SATCO share = hours * satco_rate_eur_hr * (AED received / EUR invoiced).
  // Uses the same shared wpsInvoiceSplit() helper as every other WPS-vs-billing computation in
  // the app, applied to the in-progress draft/draftLines instead of a saved invoice row.
  const splitCalc = useMemo(()=>{
    if (!draft) return null;
    return wpsInvoiceSplit(draft, draftLines);
  },[draft, draftLines]);

  const wpsDeltaDraft = useMemo(()=>{
    if (!splitCalc) return null;
    return splitCalc.overpaid; // positive = overpaid, needs recovery; null = WPS amount not entered yet
  },[splitCalc]);

  const save = async () => {
    if (!draft.employee_id||!draft.month) return alert('Employee ID and month are required');
    if (draftLines.every(l=>!l.project_name && !l.hours)) return alert('Add at least one project line');

    const received = draft.received_amount_aed!==''&&draft.received_amount_aed!=null ? Number(draft.received_amount_aed) : null;
    const computedImpliedRate = (received && totalEurDraft) ? received/totalEurDraft : (draft.received_exchange_rate?Number(draft.received_exchange_rate):null);

    const clean = {
      employee_id:draft.employee_id, full_name:draft.full_name, month:firstOfMonth(draft.month),
      client_name:draft.client_name||null, client_address_line1:draft.client_address_line1||null,
      client_address_line2:draft.client_address_line2||null, client_address_line3:draft.client_address_line3||null,
      project_location:draft.project_location||null, po_reference:draft.po_reference||null,
      invoice_number:draft.invoice_number||null, invoice_date:draft.invoice_date||null,
      currency:draft.currency||'EUR',
      invoice_exchange_rate:Number(draft.invoice_exchange_rate)||null,
      satco_rate_eur_hr:Number(draft.satco_rate_eur_hr)||4.5, brunel_rate_eur_hr:Number(draft.brunel_rate_eur_hr)||57,
      received_amount_aed:received, received_date:draft.received_date||null,
      received_exchange_rate:computedImpliedRate,
      wps_paid_aed:draft.wps_paid_aed!==''&&draft.wps_paid_aed!=null?Number(draft.wps_paid_aed):null,
      wps_paid_date:draft.wps_paid_date||null,
      remarks:draft.remarks||null, updated_at:new Date().toISOString(),
    };

    let invoiceId = draft.id;
    let error;
    if (draft.id) {
      ({error} = await db.from('employee_client_invoices').update(clean).eq('id',draft.id));
    } else {
      const res = await db.from('employee_client_invoices').insert(clean).select('id').single();
      error = res.error; invoiceId = res.data && res.data.id;
    }
    if (error) return alert(error.message);

    // Replace line items
    await db.from('employee_client_invoice_lines').delete().eq('invoice_id',invoiceId);
    const linesToInsert = draftLines.filter(l=>l.project_name||l.hours).map((l,i)=>({
      invoice_id:invoiceId, project_name:l.project_name||'', hours:Number(l.hours)||0,
      rate_eur_hr:l.rate_eur_hr?Number(l.rate_eur_hr):null, sort_order:i,
    }));
    if (linesToInsert.length) {
      const {error:lerr} = await db.from('employee_client_invoice_lines').insert(linesToInsert);
      if (lerr) return alert('Saved invoice but line items failed: '+lerr.message);
    }

    // Sync WPS over/underpayment into the shared P&L recovery pool (employee_other_costs).
    // Updated in place (never delete+recreate) so any recovered_amount already logged against
    // this invoice is preserved — recreating the row used to silently reset progress to zero.
    // Positive overpaid = employee owes company (wps_overpayment_recovery, recoverable from salary).
    // Negative overpaid = company owes employee (wps_underpayment_payable, a payable, not a deduction).
    if (splitCalc && splitCalc.overpaid !== null) {
      const overpaid = splitCalc.overpaid;
      const { data: existing } = await db.from('employee_other_costs').select('id,cost_type,recovered_amount').eq('employee_id',draft.employee_id).ilike('notes', `%[INV:${invoiceId}]%`);
      const existingRow = existing && existing[0];
      const wantType = overpaid > 0.5 ? 'over' : overpaid < -0.5 ? 'under' : null;
      if (wantType) {
        const wantCostType = wantType==='over' ? 'wps_overpayment_recovery' : 'wps_underpayment_payable';
        const wantNote = wantType==='over'
          ? `WPS overpaid vs employee's actual share for ${monthStr(draft.month)} [INV:${invoiceId}]`
          : `WPS underpaid vs employee's actual share for ${monthStr(draft.month)} — payable to employee [INV:${invoiceId}]`;
        const payload = {
          employee_id:draft.employee_id, full_name:draft.full_name,
          cost_type:wantCostType, cost_date:draft.wps_paid_date||draft.month||new Date().toISOString().slice(0,10),
          amount:Math.round(Math.abs(overpaid)*100)/100,
          notes:wantNote,
        };
        if (existingRow && existingRow.cost_type===wantCostType) {
          // Update in place — deliberately excludes `recoverable`. If someone manually unchecked
          // "Recoverable" on this row (e.g. it'll be netted against next month's WPS payment
          // instead of a salary deduction), re-saving this invoice must not silently flip it back on.
          await db.from('employee_other_costs').update(payload).eq('id',existingRow.id);
        } else {
          // No existing row, or the direction flipped since the last save (e.g. WPS amount
          // corrected from an overpayment to an underpayment) — replace it rather than carry
          // recovered progress over to the wrong direction. recoverable defaults on for a fresh
          // "over" row (employee owes company) since there's no prior manual override to respect.
          if (existingRow) await db.from('employee_other_costs').delete().eq('id',existingRow.id);
          await db.from('employee_other_costs').insert({...payload, recoverable: wantType==='over', recovered_amount:0});
        }
      } else if (existingRow) {
        // No longer over- or under-paid (e.g. WPS amount corrected to match exactly) — remove the stale row.
        await db.from('employee_other_costs').delete().eq('id',existingRow.id);
      }
    }

    setDraft(null); setDraftLines([]); load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this invoice and its line items / linked recovery?')) return;
    await db.from('employee_client_invoice_lines').delete().eq('invoice_id',id);
    await db.from('employee_client_recoveries').delete().eq('invoice_id',id);
    const { data: existing } = await db.from('employee_other_costs').select('id').ilike('notes', `%[INV:${id}]%`);
    if (existing && existing.length) await db.from('employee_other_costs').delete().in('id', existing.map(e=>e.id));
    await db.from('employee_client_invoices').delete().eq('id',id);
    load();
  };

  const downloadDocx = async (inv) => {
    const lns = linesMap[inv.id]||[];
    if (!lns.length) return alert('No line items saved for this invoice yet.');
    if ((inv.currency||'EUR')!=='AED' && !inv.invoice_exchange_rate) { if(!window.confirm('No invoice exchange rate set — AED totals on the document will show as 0. Continue?')) return; }
    await generateBrunelInvoiceDocx(inv, lns);
  };

  // Recovery ledger per employee (for the linked invoice's overpayment)
  const recoveryForEmployee = (employeeId) => recoveries.filter(r=>r.employee_id===employeeId);
  const recoveredTotal = (employeeId) => recoveryForEmployee(employeeId).reduce((s,r)=>s+(Number(r.amount_aed)||0),0);
  // Ledger entries scoped to a single invoice (matches what's actually linked via invoice_id) —
  // used so the recovery ledger shown under each invoice doesn't bleed in other invoices' recoveries.
  const recoveryForInvoice = (invoiceId) => recoveries.filter(r=>r.invoice_id===invoiceId);

  const saveRecovery = async () => {
    if (!recDraft.employee_id||!recDraft.recovery_month||!recDraft.amount_aed) return alert('Employee, month and amount required');
    const { error } = await db.from('employee_client_recoveries').insert({
      invoice_id:recDraft.invoice_id||null, employee_id:recDraft.employee_id,
      recovery_month:firstOfMonth(recDraft.recovery_month), amount_aed:Number(recDraft.amount_aed)||0, remarks:recDraft.remarks||null,
    });
    if (error) return alert(error.message);
    // Update recovered_amount on the linked employee_other_costs recoverable row
    if (recDraft.invoice_id) {
      const { data: existing } = await db.from('employee_other_costs').select('id,recovered_amount').eq('employee_id',recDraft.employee_id).ilike('notes', `%[INV:${recDraft.invoice_id}]%`);
      if (existing && existing.length) {
        const row = existing[0];
        await db.from('employee_other_costs').update({ recovered_amount: (Number(row.recovered_amount)||0)+Number(recDraft.amount_aed) }).eq('id',row.id);
      }
    }
    setRecDraft(null); load();
  };
  const removeRecovery = async (id, invoiceId, employeeId, amount) => {
    if (!window.confirm('Delete this recovery entry?')) return;
    await db.from('employee_client_recoveries').delete().eq('id',id);
    if (invoiceId) {
      const { data: existing } = await db.from('employee_other_costs').select('id,recovered_amount').eq('employee_id',employeeId).ilike('notes', `%[INV:${invoiceId}]%`);
      if (existing && existing.length) {
        const row = existing[0];
        await db.from('employee_other_costs').update({ recovered_amount: Math.max(0,(Number(row.recovered_amount)||0)-Number(amount)) }).eq('id',row.id);
      }
    }
    load();
  };

  const totalReceived = filtered.reduce((s,r)=>s+(Number(r.received_amount_aed)||0),0);

  // Net WPS position across the currently filtered invoices: Employee Share vs what was actually
  // paid via WPS. WPS is paid at month-end, at least ~15 days before the client invoice is even
  // received/converted at the real exchange rate — so the two numbers routinely disagree, and this
  // is the single figure that says who owes whom, right now, across every invoice shown below.
  const netSummary = useMemo(()=>{
    let empShareTotal=0, wpsTotal=0, invoiceCount=0;
    filtered.forEach(inv=>{
      const split = wpsInvoiceSplit(inv, linesMap[inv.id]);
      if (split.empShare===null || !split.wps) return;
      empShareTotal += split.empShare; wpsTotal += split.wps; invoiceCount++;
    });
    return { empShareTotal, wpsTotal, net: empShareTotal-wpsTotal, invoiceCount };
  },[filtered, linesMap]);
  const netSummaryScopeName = useMemo(()=>{
    const ids = [...new Set(filtered.map(r=>r.employee_id).filter(Boolean))];
    return ids.length===1 ? (filtered.find(r=>r.employee_id===ids[0])||{}).full_name : null;
  },[filtered]);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
      <div style={S.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
          <div>
            <div style={{fontWeight:800,fontSize:'14px'}}>Client Hourly Billing — Invoice, Receipt Split &amp; WPS Recovery</div>
            <div style={{fontSize:'12px',color:'#64748b'}}>{filtered.length} invoice(s) · Received AED {fmt2(totalReceived)}</div>
          </div>
          <button style={S.btnPri} onClick={blank}>+ New Invoice / Month</button>
        </div>
        <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

        {draft && (
          <div style={{padding:'16px 18px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
            <div style={{fontWeight:800,fontSize:'13px',marginBottom:'10px',color:'#92400e'}}>{draft.id?'Edit':'New'} Invoice</div>

            <div style={{marginBottom:'10px'}}>
              <label style={S.label}>Employee</label>
              <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'10px'}}>
              <div><label style={S.label}>Month</label><input type="month" value={draft.month||''} onChange={e=>setDraft(d=>({...d,month:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Invoice Number</label><input value={draft.invoice_number||''} onChange={e=>setDraft(d=>({...d,invoice_number:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Invoice Date</label><input type="date" value={draft.invoice_date||''} onChange={e=>setDraft(d=>({...d,invoice_date:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>PO Reference</label><input value={draft.po_reference||''} onChange={e=>setDraft(d=>({...d,po_reference:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <div><label style={S.label}>Client Name</label><input value={draft.client_name||''} onChange={e=>setDraft(d=>({...d,client_name:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Project Location</label><input value={draft.project_location||''} onChange={e=>setDraft(d=>({...d,project_location:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Billing Currency</label>
                <select value={draft.currency||'EUR'} onChange={e=>setDraft(d=>({...d,currency:e.target.value}))} style={{...S.input,width:'100%'}}>
                  {BILLING_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <div><label style={S.label}>Client Rate ({draft.currency||'EUR'}/hr)</label><input type="number" step="0.01" value={draft.brunel_rate_eur_hr} onChange={e=>setDraft(d=>({...d,brunel_rate_eur_hr:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>SATCO Rate ({draft.currency||'EUR'}/hr)</label><input type="number" step="0.01" value={draft.satco_rate_eur_hr} onChange={e=>setDraft(d=>({...d,satco_rate_eur_hr:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
              <div><label style={S.label}>Client Address Line 1</label><input value={draft.client_address_line1||''} onChange={e=>setDraft(d=>({...d,client_address_line1:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Client Address Line 2</label><input value={draft.client_address_line2||''} onChange={e=>setDraft(d=>({...d,client_address_line2:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>Client Address Line 3</label><input value={draft.client_address_line3||''} onChange={e=>setDraft(d=>({...d,client_address_line3:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            </div>

            <div style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px'}}>
              <div style={{fontWeight:700,fontSize:'12.5px',marginBottom:'8px',color:'#0f172a'}}>Projects Worked This Month (hours per project)</div>
              <div className="drag-scroll" style={{overflowX:'auto'}}>
              <div style={{minWidth:'560px'}}>
              <div style={{display:'grid',gridTemplateColumns:'3fr 90px 110px 110px 28px',gap:'8px',marginBottom:'4px',padding:'0 2px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase'}}>Project</div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase'}}>Hours</div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase'}}>Rate</div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase'}}>Amount</div>
                <div></div>
              </div>
              {draftLines.map((l,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'3fr 90px 110px 110px 28px',gap:'8px',marginBottom:'6px',alignItems:'center'}}>
                  <input placeholder="Project name (e.g. 3130 CK5Y Tisza PFHE)" value={l.project_name||''} onChange={e=>updateLine(i,'project_name',e.target.value)} style={{...S.input,width:'100%'}}/>
                  <input type="number" placeholder="Hours" value={l.hours||''} onChange={e=>updateLine(i,'hours',e.target.value)} style={{...S.input,width:'100%'}}/>
                  <input type="number" step="0.01" placeholder={`${draft.brunel_rate_eur_hr||57}`} value={l.rate_eur_hr||''} onChange={e=>updateLine(i,'rate_eur_hr',e.target.value)} style={{...S.input,width:'100%'}}/>
                  <div style={{fontSize:'12px',fontWeight:700,color:'#166534',whiteSpace:'nowrap'}}>{currencySymbol(draft.currency)}{fmt2((Number(l.hours)||0)*(Number(l.rate_eur_hr)||Number(draft.brunel_rate_eur_hr)||0))}</div>
                  <button onClick={()=>removeLine(i)} style={S.iconBtn}>&#128465;</button>
                </div>
              ))}
              </div>
              </div>
              <button onClick={addLine} style={{...S.btnPri,background:'#fff',color:'#0f172a',border:'1px solid #cbd5e1',fontSize:'12px',padding:'6px 12px',marginTop:'4px'}}>+ Add Project Line</button>
              <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'1px solid #e2e8f0',fontSize:'13px'}}>
                Total Hours: <strong>{fmt2(totalHoursDraft)}</strong> &nbsp;·&nbsp; Total Invoice: <strong style={{color:'#166534'}}>{currencySymbol(draft.currency)}{fmt2(totalEurDraft)}</strong>
              </div>
            </div>

            {(draft.currency||'EUR')!=='AED' && (
            <div style={{background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px'}}>
              <div style={{fontWeight:700,fontSize:'12.5px',marginBottom:'8px',color:'#1d4ed8'}}>Invoice Exchange Rate (1 {draft.currency||'EUR'} = ? AED — as quoted on invoice, informational; AED on document uses this)</div>
              <input type="number" step="0.0001" placeholder="e.g. 4.2738280" value={draft.invoice_exchange_rate||''} onChange={e=>setDraft(d=>({...d,invoice_exchange_rate:e.target.value}))} style={{...S.input,width:'220px'}}/>
              {draft.invoice_exchange_rate && <div style={{marginTop:'8px',fontSize:'12.5px'}}>Invoiced AED equivalent (informational): <strong>AED {fmt2(invoiceAedDraft)}</strong></div>}
            </div>
            )}

            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px'}}>
              <div style={{fontWeight:700,fontSize:'12.5px',marginBottom:'8px',color:'#166534'}}>Step 2 — Once Payment is Received from Client</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'8px'}}>
                <div><label style={S.label}>Amount Received (AED)</label><input type="number" step="0.01" value={draft.received_amount_aed||''} onChange={e=>setDraft(d=>({...d,received_amount_aed:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div><label style={S.label}>Date Received</label><input type="date" value={draft.received_date||''} onChange={e=>setDraft(d=>({...d,received_date:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              </div>
              {splitCalc && splitCalc.satcoAed!==null && (
                <div style={{background:'#fff',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'10px 14px',fontSize:'12.5px'}}>
                  <div>Implied exchange rate on day of transmission: <strong>{fmt4(splitCalc.impliedRate)}</strong></div>
                  <div style={{marginTop:'4px'}}>SATCO share ({fmt2(totalHoursDraft)}h × {currencySymbol(draft.currency)}{draft.satco_rate_eur_hr||4.5} × rate): <strong style={{color:'#166534'}}>AED {fmt2(splitCalc.satcoAed)}</strong></div>
                  <div>Employee ({draft.full_name||'employee'}) share: <strong style={{color:'#1d4ed8'}}>AED {fmt2(splitCalc.empShare)}</strong></div>
                </div>
              )}
            </div>

            <div style={{background:'#fef3c7',border:'1px solid #fbbf24',borderRadius:'8px',padding:'12px 14px',marginBottom:'14px'}}>
              <div style={{fontWeight:700,fontSize:'12.5px',marginBottom:'8px',color:'#92400e'}}>Step 3 — WPS Payment Actually Made to Employee</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div><label style={S.label}>WPS Amount Paid (AED)</label><input type="number" step="0.01" value={draft.wps_paid_aed||''} onChange={e=>setDraft(d=>({...d,wps_paid_aed:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div><label style={S.label}>WPS Payment Date</label><input type="date" value={draft.wps_paid_date||''} onChange={e=>setDraft(d=>({...d,wps_paid_date:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              </div>
              {wpsDeltaDraft!==null && (
                <div style={{marginTop:'8px',fontSize:'12.5px',fontWeight:700}}>
                  {wpsDeltaDraft>0.5
                    ? <span style={{color:'#dc2626'}}>Overpaid by AED {fmt2(wpsDeltaDraft)} — this will be added to {draft.full_name||'employee'}'s recoverable balance (visible on P&L Dashboard).</span>
                    : wpsDeltaDraft<-0.5
                      ? <span style={{color:'#dc2626'}}>Underpaid by AED {fmt2(Math.abs(wpsDeltaDraft))} vs employee's actual share.</span>
                      : <span style={{color:'#166534'}}>WPS payment matches employee's share.</span>}
                </div>
              )}
            </div>

            <div style={{marginBottom:'12px'}}>
              <label style={S.label}>Remarks</label>
              <input value={draft.remarks||''} onChange={e=>setDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/>
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <button style={S.btnPri} onClick={save}>Save Invoice</button>
              <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>{setDraft(null);setDraftLines([]);}}>Cancel</button>
            </div>
          </div>
        )}

        {netSummary.invoiceCount>0 && (
          <div style={{margin:'14px 14px 0',padding:'12px 16px',borderRadius:'10px',border:'1px solid '+(Math.abs(netSummary.net)<=0.5?'#bbf7d0':netSummary.net>0?'#bfdbfe':'#fde68a'),background:Math.abs(netSummary.net)<=0.5?'#f0fdf4':netSummary.net>0?'#eff6ff':'#fffbeb'}}>
            <div style={{fontWeight:800,fontSize:'12.5px',marginBottom:'4px',color:'#0f172a'}}>Net WPS Position{netSummaryScopeName?` — ${netSummaryScopeName}`:' — All Employees'}</div>
            <div style={{fontSize:'12.5px',color:'#475569',marginBottom:'6px'}}>Across {netSummary.invoiceCount} invoice(s) shown below: Employee Share AED {fmt2(netSummary.empShareTotal)} vs WPS Paid AED {fmt2(netSummary.wpsTotal)}</div>
            <div style={{fontSize:'15px',fontWeight:800}}>
              {Math.abs(netSummary.net)<=0.5
                ? <span style={{color:'#166534'}}>Settled — WPS paid matches employee share</span>
                : netSummary.net>0
                  ? <span style={{color:'#1d4ed8'}}>Company owes Employee: AED {fmt2(netSummary.net)}</span>
                  : <span style={{color:'#92400e'}}>Employee owes Company: AED {fmt2(Math.abs(netSummary.net))}</span>}
            </div>
          </div>
        )}

        <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
            <thead className="tbl-sticky-th"><tr>{(hideEmpFilter?['Month','Invoice #','Projects','Hours','Invoiced','Received AED','SATCO Share','Employee Share','WPS Paid','Recovery Status','']:['Emp ID','Name','Month','Invoice #','Projects','Hours','Invoiced','Received AED','SATCO Share','Employee Share','WPS Paid','Recovery Status','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={hideEmpFilter?11:12} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                : grouped.length===0
                  ? <tr><td colSpan={hideEmpFilter?11:12} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>No invoices yet — click "+ New Invoice / Month" to start.</td></tr>
                  : grouped.map(g=>(
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={12} />}
                      {g.rows.map(inv=>{
                        const lns = linesMap[inv.id]||[];
                        const split = wpsInvoiceSplit(inv, lns);
                        const { hours, satcoAed, empShare, wps, overpaid, received } = split;
                        const eur = split.totalCcy;
                        // Recovery Status reads the same employee_other_costs row the P&L Dashboard uses,
                        // keyed to this specific invoice via the [INV:id] tag — this keeps both views in sync.
                        const synced = syncedRecovery[inv.id];
                        const outstandingSynced = synced ? Math.max(0, synced.amount - synced.recovered) : null;
                        const recovered = synced ? synced.recovered : recoveredTotal(inv.employee_id);
                        return (
                          <React.Fragment key={inv.id}>
                            <tr className="hr-row" style={{borderTop:'1px solid #f1f5f9'}}>
                              {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{inv.employee_id}</td>}
                              {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{inv.full_name}</td>}
                              <td style={S.td}>{monthStr(inv.month)}</td>
                              <td style={S.td}>{inv.invoice_number||'—'}</td>
                              <td style={{...S.tdWrap,fontSize:'11.5px',color:'#64748b'}}>{lns.map(l=>l.project_name).join(', ')||'—'}</td>
                              <td style={S.td}>{fmt2(hours)}</td>
                              <td style={S.td}>{currencySymbol(inv.currency)}{fmt2(eur)}</td>
                              <td style={S.td}>{received?fmt2(received):'—'}</td>
                              <td style={{...S.td,fontWeight:700,color:'#166534'}}>{satcoAed!==null?fmt2(satcoAed):'—'}</td>
                              <td style={{...S.td,fontWeight:700,color:'#1d4ed8'}}>{empShare!==null?fmt2(empShare):'—'}</td>
                              <td style={S.td}>{wps?fmt2(wps):'—'}</td>
                              <td style={S.td}>
                                {overpaid===null ? '—' : overpaid>0.5 ? (
                                  <span style={{background:'#fef3c7',color:'#92400e',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>
                                    {fmt2(outstandingSynced!==null ? outstandingSynced : Math.max(0,overpaid-recovered))} left
                                  </span>
                                ) : overpaid<-0.5 ? (
                                  <span title="WPS paid was less than the employee's actual share — company owes the employee" style={{background:'#dbeafe',color:'#1d4ed8',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>
                                    Owe employee {fmt2(outstandingSynced!==null ? outstandingSynced : Math.abs(overpaid))}
                                  </span>
                                ) : <span style={{color:'#166534',fontWeight:700,fontSize:'11px'}}>Clear</span>}
                              </td>
                              <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                                <button style={S.iconBtn} title="Download invoice (.docx)" onClick={()=>downloadDocx(inv)}>Download</button>
                                <button style={S.iconBtn} title="Recovery ledger" onClick={()=>setExpandedId(expandedId===inv.id?null:inv.id)}>{expandedId===inv.id?'▲':'▼'}</button>
                                <button style={S.iconBtn} onClick={()=>openEdit(inv)}>&#9998;</button>
                                <button style={S.iconBtn} onClick={()=>remove(inv.id)}>&#128465;</button>
                              </td>
                            </tr>
                            {expandedId===inv.id && (
                              <tr>
                                <td colSpan={hideEmpFilter?11:12} style={{padding:'12px 18px',background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>
                                  {overpaid<-0.5 ? (
                                    <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'10px 14px',fontSize:'12.5px',color:'#1d4ed8'}}>
                                      <div style={{fontWeight:700,marginBottom:'4px'}}>WPS Underpayment — Payable to {inv.full_name}</div>
                                      <div>SATCO paid AED {fmt2(wps)} via WPS this month, but {inv.full_name.split(' ')[0]}'s actual share was AED {fmt2(empShare)} — the company owes the difference of <strong>AED {fmt2(outstandingSynced!==null ? outstandingSynced : Math.abs(overpaid))}</strong>. This is tracked as a payable on the P&amp;L Dashboard and clears automatically once the WPS Paid amount for this invoice is corrected or topped up.</div>
                                    </div>
                                  ) : (
                                    <>
                                  <div style={{fontWeight:700,fontSize:'12px',marginBottom:'8px',color:'#475569'}}>Progressive WPS Recovery — {inv.full_name}</div>
                                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px',marginBottom:'8px'}}>
                                    <thead><tr><th style={S.th}>Recovery Month</th><th style={S.th}>Amount (AED)</th><th style={S.th}>Remarks</th><th style={S.th}></th></tr></thead>
                                    <tbody>
                                      {recoveryForInvoice(inv.id).length===0
                                        ? <tr><td colSpan={4} style={{padding:'10px',color:'#94a3b8',textAlign:'center'}}>No recoveries logged yet</td></tr>
                                        : recoveryForInvoice(inv.id).map(r=>(
                                          <tr key={r.id} style={{borderTop:'1px solid #e2e8f0'}}>
                                            <td style={S.td}>{monthStr(r.recovery_month)}</td>
                                            <td style={{...S.td,fontWeight:700,color:'#166534'}}>{fmt2(r.amount_aed)}</td>
                                            <td style={S.tdWrap}>{r.remarks||'—'}</td>
                                            <td style={{...S.td,textAlign:'right'}}><button style={S.iconBtn} onClick={()=>removeRecovery(r.id,inv.id,inv.employee_id,r.amount_aed)}>&#128465;</button></td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                  <div style={{fontSize:'12px',marginBottom:'8px'}}>Total recovered so far: <strong>AED {fmt2(recovered)}</strong>{overpaid!==null && <span> · Outstanding: <strong style={{color:(outstandingSynced!==null?outstandingSynced:Math.max(0,overpaid-recovered))>0.5?'#dc2626':'#166534'}}>AED {fmt2(outstandingSynced!==null ? outstandingSynced : Math.max(0,overpaid-recovered))}</strong></span>}</div>
                                  {recDraft && recDraft.invoice_id===inv.id ? (
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr auto',gap:'8px',alignItems:'end',background:'#fff',padding:'10px',borderRadius:'8px',border:'1px solid #cbd5e1'}}>
                                      <div><label style={S.label}>Month</label><input type="month" value={recDraft.recovery_month||''} onChange={e=>setRecDraft(d=>({...d,recovery_month:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                                      <div><label style={S.label}>Amount (AED)</label><input type="number" value={recDraft.amount_aed||''} onChange={e=>setRecDraft(d=>({...d,amount_aed:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                                      <div><label style={S.label}>Remarks</label><input value={recDraft.remarks||''} onChange={e=>setRecDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                                      <div style={{display:'flex',gap:'6px'}}>
                                        <button style={S.btnPri} onClick={saveRecovery}>Save</button>
                                        <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setRecDraft(null)}>✕</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button style={{...S.btnPri,fontSize:'11.5px',padding:'6px 12px'}} onClick={()=>setRecDraft({invoice_id:inv.id,employee_id:inv.employee_id,recovery_month:'',amount_aed:'',remarks:''})}>+ Log Monthly Recovery</button>
                                  )}
                                    </>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── CAMP COSTS TAB ───────────────────────────────────────────────
// Camp Costs — food, accommodation and transport paid to the client/camp while an employee is
// off-site. Food & accommodation are billed at a per-CAMP monthly rate (different camps cost
// different amounts), prorated to a daily rate using the real number of days in whichever
// calendar month(s) a stay touches (same convention already used for monthly salary elsewhere in
// this app) — so a stay crossing a month-end is billed fairly instead of assuming a flat 30-day
// month. Transport keeps the existing flat company/per-employee AED/day rate. Which employee was
// at which camp, and from when to when, is entered explicitly as a "Camp Stay" — HR's
// demob/remob history is only used to flag who's currently off-site with nothing logged yet, as a
// reminder, never to auto-book a cost (the old version guessed the days from demob/remob and
// applied one flat company-wide rate, which couldn't reflect different camps costing differently).

// Splits [fromDate, endDateExclusive) into per-calendar-month day counts — e.g. a stay spanning
// Jan 20 – Feb 10 yields two segments: 11 days in January, 9 days in February.
function campStaySegments(fromDate, endDateExclusive) {
  const segments = [];
  if (!fromDate || !endDateExclusive) return segments;
  let cur = new Date(fromDate+'T00:00:00Z');
  const end = new Date(endDateExclusive+'T00:00:00Z');
  if (end <= cur) return segments;
  while (cur < end) {
    const y = cur.getUTCFullYear(), mo = cur.getUTCMonth();
    const nextMonthStart = new Date(Date.UTC(y, mo+1, 1));
    const segEnd = nextMonthStart < end ? nextMonthStart : end;
    const days = Math.round((segEnd - cur)/86400000);
    segments.push({ monthKey: `${y}-${String(mo+1).padStart(2,'0')}`, days });
    cur = segEnd;
  }
  return segments;
}

// Food + accommodation cost for one camp stay: each calendar month's share of days is billed at
// that month's own daily rate (monthly camp rate ÷ real days in that month), then summed.
function campStayFoodAccomCost(fromDate, endDateExclusive, monthlyFood, monthlyAccom) {
  const monthlyTotal = (Number(monthlyFood)||0) + (Number(monthlyAccom)||0);
  if (monthlyTotal <= 0) return 0;
  return campStaySegments(fromDate, endDateExclusive).reduce((sum, seg) => {
    const dailyRate = monthlyTotal / daysInMonth(seg.monthKey);
    return sum + seg.days*dailyRate;
  }, 0);
}

function CampCostsTab({ employees, empMeta, mobDemobByEmp, initialFilter, hideEmpFilter }) {
  // Camps master list (name + monthly food/accommodation rate — different camps, different cost)
  const [camps, setCamps] = useState([]);
  const [campDraft, setCampDraft] = useState(null);
  const [showCamps, setShowCamps] = useState(!hideEmpFilter);
  const [savingCamp, setSavingCamp] = useState(false);

  // Explicit "employee X was at camp Y from A to B" records — the source of truth for cost
  const [stays, setStays] = useState([]);
  const [stayDraft, setStayDraft] = useState(null);

  // Transport keeps the old flat AED/day mechanism (company default + optional per-employee override)
  const [transportDefault, setTransportDefault] = useState({ transport_rate_per_day:0 });
  const [transportOverrides, setTransportOverrides] = useState([]);
  const [transportOverrideDraft, setTransportOverrideDraft] = useState(null);
  const [showTransportOverrides, setShowTransportOverrides] = useState(false);
  const [savingTransport, setSavingTransport] = useState(false);

  const [synced, setSynced] = useState({}); // stay.id -> {id, amount, notes} row in employee_other_costs
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilter||{});
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  // mobDemobByEmp arrives as a prop, fetched once from HR when the whole app first loaded — so
  // newly-entered HR assignments don't show up here until a full page reload. This lets the tab
  // pull the latest straight from HR on demand instead, without reloading the page. Reuses hrDb,
  // which (like every table/view reference in this file) is a top-level constant, so it's reachable
  // from any component without threading it through props.
  const [hrOverride, setHrOverride] = useState(null);
  const [refreshingHr, setRefreshingHr] = useState(false);
  const effectiveMobDemobByEmp = hrOverride || mobDemobByEmp;
  const refreshFromHr = async () => {
    setRefreshingHr(true);
    try {
      const { data: md, error } = await hrDb.from('v_finance_employee_mob_demob').select('*');
      if (error) { alert('Could not reach HR: '+error.message); return; }
      const grouped = {};
      (md||[]).forEach(m=>{
        const id = canonEmpId(m.employee_id);
        if (!id) return;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ mobilization_date:m.mobilization_date||null, demobilization_date:m.demobilization_date||null, location:m.location||null, supply:m.supply||null });
      });
      Object.keys(grouped).forEach(id=>grouped[id].sort((a,b)=>String(a.mobilization_date||'').localeCompare(String(b.mobilization_date||''))));
      setHrOverride(grouped);
    } finally {
      setRefreshingHr(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const [cm, st, def, ov, oc] = await Promise.all([
      db.from('camps').select('*').order('name',{ascending:true}),
      db.from('employee_camp_stays').select('*').order('from_date',{ascending:false}),
      db.from('camp_rate_defaults').select('*').eq('id',1).maybeSingle(),
      db.from('employee_camp_rates').select('*'),
      db.from('employee_other_costs').select('id,employee_id,amount,notes').eq('cost_type','camp_food_accommodation'),
    ]);
    setCamps(cm.data||[]);
    setStays(st.data||[]);
    setTransportDefault(def.data || { transport_rate_per_day:0 });
    setTransportOverrides(ov.data||[]);
    // Only rows tagged [CAMPSTAY:id] belong to the current (per-stay) system — anything else
    // under this cost_type is a leftover from the old flat-rate/demob-remob auto-sync and gets
    // cleaned up below once stays finish loading, the same "auto-repair" pattern Client Billing uses.
    const syncMap = {};
    (oc.data||[]).forEach(r=>{
      const m = String(r.notes||'').match(/\[CAMPSTAY:([^\]]+)\]/);
      if (m) syncMap[m[1]] = { id:r.id, amount:Number(r.amount)||0, notes:r.notes };
    });
    setSynced(syncMap);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const campsById = useMemo(()=>{ const m={}; camps.forEach(c=>{ m[c.id]=c; }); return m; },[camps]);
  const transportOverrideByEmp = useMemo(()=>{ const m={}; transportOverrides.forEach(o=>{ m[o.employee_id]=o; }); return m; },[transportOverrides]);
  const transportRateFor = (employeeId) => {
    const ov = transportOverrideByEmp[employeeId];
    const has = (v) => v!==null && v!==undefined && v!=='';
    return ov && has(ov.transport_rate_per_day) ? Number(ov.transport_rate_per_day) : Number(transportDefault.transport_rate_per_day)||0;
  };

  const todayStr = new Date().toISOString().slice(0,10);

  // HR's mob_demob history records a fresh mobilization_date once an employee actually remobilizes.
  // For a stay still marked "ongoing" in Finance, the earliest HR mobilization_date after the stay's
  // From Date means HR has since recorded them back on site — i.e. the camp stay should have closed
  // that day. Mirrors the same bridge data already used to *open* a stay (demobilization_date), just
  // looking at the other end of the gap.
  const hrRemobDateAfter = (employeeId, fromDate) => {
    const rows = effectiveMobDemobByEmp[employeeId]||[];
    const candidates = rows.map(r=>r.mobilization_date).filter(d=>d && d>fromDate).sort();
    return candidates[0]||null;
  };

  // Enrich each stay with computed days/cost. Blank to_date = ongoing (still in camp), costed up to
  // today. `days` is exclusive of the end date (matches how demob→remob day counts work throughout
  // this app) — e.g. 1 Jan → 5 Jan is 4 camp days.
  const enrichedStays = useMemo(()=>{
    return stays.map(s=>{
      const end = s.to_date || todayStr;
      const days = Math.max(0, Math.round((new Date(end+'T00:00:00Z') - new Date(s.from_date+'T00:00:00Z'))/86400000));
      const camp = s.camp_id ? campsById[s.camp_id] : null;
      const monthlyFood  = camp ? Number(camp.monthly_food_rate)||0 : 0;
      const monthlyAccom = camp ? Number(camp.monthly_accommodation_rate)||0 : 0;
      const foodAccomCost = campStayFoodAccomCost(s.from_date, end, monthlyFood, monthlyAccom);
      const transportRate = transportRateFor(s.employee_id);
      const transportCost = days*transportRate;
      const cost = Math.round((foodAccomCost+transportCost)*100)/100;
      const avgDailyRate = days>0 ? (foodAccomCost+transportCost)/days : 0;
      const ongoing = !s.to_date;
      const suggestedCloseDate = ongoing ? hrRemobDateAfter(s.employee_id, s.from_date) : null;
      return {
        ...s, camp_name: s.camp_name||(camp&&camp.name)||(s.camp_id?'(camp deleted)':null), needsCamp: !s.camp_id, days,
        foodAccomCost, transportRate, transportCost, cost, avgDailyRate, ongoing, suggestedCloseDate,
      };
    });
  },[stays, campsById, transportOverrideByEmp, transportDefault, todayStr, effectiveMobDemobByEmp]);

  // Auto-sync computed stay costs into employee_other_costs — the same shared pool the P&L
  // Dashboard and Client Billing read from — mirroring Client Billing's WPS auto-repair pattern:
  // insert if missing, update if the amount/description drifted, delete if the stay (or its cost)
  // is gone. Also retires any pre-v11 camp_food_accommodation rows left over from the old flat-rate
  // demob/remob auto-sync, since that system no longer books costs (see synced/load() above).
  useEffect(()=>{
    if (loading) return;
    (async () => {
      const fixes = [];
      const seenIds = new Set();
      enrichedStays.forEach(s=>{
        seenIds.add(s.id);
        const note = `Camp cost — ${s.camp_name} from ${s.from_date}${s.to_date?` to ${s.to_date}`:' (ongoing)'} — ${s.days} day(s) [CAMPSTAY:${s.id}]`;
        const existing = synced[s.id];
        if (s.cost<=0) {
          if (existing) fixes.push(db.from('employee_other_costs').delete().eq('id',existing.id));
          return;
        }
        if (!existing) {
          fixes.push(db.from('employee_other_costs').insert({
            employee_id:s.employee_id, full_name:s.full_name, cost_type:'camp_food_accommodation',
            cost_date:s.to_date||s.from_date, amount:s.cost, recoverable:false, recovered_amount:0, notes:note,
          }));
        } else if (Math.abs(existing.amount-s.cost)>0.5 || existing.notes!==note) {
          fixes.push(db.from('employee_other_costs').update({ amount:s.cost, notes:note }).eq('id',existing.id));
        }
      });
      Object.entries(synced).forEach(([id,row])=>{ if (!seenIds.has(id)) fixes.push(db.from('employee_other_costs').delete().eq('id',row.id)); });
      // One-time retirement of old (pre-v11) camp_food_accommodation rows that aren't [CAMPSTAY:]
      // tagged — leftovers from the flat-rate demob/remob auto-sync this version replaces.
      const { data: allCamp } = await db.from('employee_other_costs').select('id,notes').eq('cost_type','camp_food_accommodation');
      (allCamp||[]).forEach(r=>{ if (!/\[CAMPSTAY:[^\]]+\]/.test(String(r.notes||''))) fixes.push(db.from('employee_other_costs').delete().eq('id',r.id)); });
      if (fixes.length) {
        await Promise.all(fixes);
        const { data: ocFresh } = await db.from('employee_other_costs').select('id,employee_id,amount,notes').eq('cost_type','camp_food_accommodation');
        const freshMap = {};
        (ocFresh||[]).forEach(r=>{
          const m = String(r.notes||'').match(/\[CAMPSTAY:([^\]]+)\]/);
          if (m) freshMap[m[1]] = { id:r.id, amount:Number(r.amount)||0, notes:r.notes };
        });
        setSynced(freshMap);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enrichedStays, loading]);

  // ── Camps master list CRUD ──
  const blankCamp = () => setCampDraft({ name:'', monthly_food_rate:'', monthly_accommodation_rate:'', remarks:'' });
  const editCamp = (c) => setCampDraft({ ...c });
  const saveCamp = async () => {
    if (!campDraft.name || !campDraft.name.trim()) return alert('Camp name is required');
    setSavingCamp(true);
    const payload = {
      name:campDraft.name.trim(),
      monthly_food_rate: Number(campDraft.monthly_food_rate)||0,
      monthly_accommodation_rate: Number(campDraft.monthly_accommodation_rate)||0,
      remarks: campDraft.remarks||null,
    };
    const { error } = campDraft.id
      ? await db.from('camps').update(payload).eq('id',campDraft.id)
      : await db.from('camps').insert(payload);
    setSavingCamp(false);
    if (error) return alert(error.message);
    setCampDraft(null); load();
  };
  const removeCamp = async (id) => {
    if (!window.confirm("Delete this camp? Stays already logged against it keep their recorded name but lose the linked rate — edit them to pick a replacement camp if it's still owed.")) return;
    await db.from('camps').delete().eq('id',id);
    load();
  };

  // ── Transport default / per-employee override (unchanged mechanism — only food & accommodation moved to per-camp rates) ──
  const saveTransportDefault = async () => {
    setSavingTransport(true);
    const { error } = await db.from('camp_rate_defaults').upsert({
      id:1, food_rate_per_day:0, accommodation_rate_per_day:0, // retired — see Camps master list
      transport_rate_per_day:Number(transportDefault.transport_rate_per_day)||0,
    });
    setSavingTransport(false);
    if (error) return alert(error.message);
    load();
  };
  const blankTransportOverride = () => setTransportOverrideDraft({ employee_id:initialFilter&&initialFilter.employee_id||'', full_name:initialFilter&&initialFilter.full_name||'', transport_rate_per_day:'', remarks:'' });
  const editTransportOverride = (o) => setTransportOverrideDraft({ ...o });
  const saveTransportOverride = async () => {
    if (!transportOverrideDraft.employee_id) return alert('Employee is required');
    const payload = {
      employee_id:transportOverrideDraft.employee_id, full_name:transportOverrideDraft.full_name||'',
      transport_rate_per_day: transportOverrideDraft.transport_rate_per_day===''||transportOverrideDraft.transport_rate_per_day==null ? null : Number(transportOverrideDraft.transport_rate_per_day),
      remarks:transportOverrideDraft.remarks||null,
    };
    const { error } = await db.from('employee_camp_rates').upsert(payload, { onConflict:'employee_id' });
    if (error) return alert(error.message);
    setTransportOverrideDraft(null); load();
  };
  const removeTransportOverride = async (id) => {
    if (!window.confirm('Remove this transport rate override? This employee will fall back to the default rate.')) return;
    await db.from('employee_camp_rates').delete().eq('id',id);
    load();
  };

  // ── Camp Stays CRUD ──
  const blankStay = (prefill) => setStayDraft({
    employee_id:(prefill&&prefill.employee_id)||(initialFilter&&initialFilter.employee_id)||'',
    full_name:(prefill&&prefill.full_name)||(initialFilter&&initialFilter.full_name)||'',
    camp_id:'', from_date:(prefill&&prefill.from_date)||'', to_date:(prefill&&prefill.to_date)||'', remarks:(prefill&&prefill.remarks)||'',
  });
  const editStay = (s) => setStayDraft({ ...s, from_date:s.from_date||'', to_date:s.to_date||'' });
  const saveStay = async () => {
    if (!stayDraft.employee_id) return alert('Employee is required');
    if (!stayDraft.camp_id) return alert('Camp is required');
    if (!stayDraft.from_date) return alert('From date is required');
    if (stayDraft.to_date && stayDraft.to_date < stayDraft.from_date) return alert('To date cannot be before From date');
    const camp = campsById[stayDraft.camp_id];
    const payload = {
      employee_id:stayDraft.employee_id, full_name:stayDraft.full_name||'',
      camp_id:stayDraft.camp_id, camp_name:camp?camp.name:null,
      from_date:stayDraft.from_date, to_date:stayDraft.to_date||null,
      remarks:stayDraft.remarks||null,
    };
    const { error } = stayDraft.id
      ? await db.from('employee_camp_stays').update(payload).eq('id',stayDraft.id)
      : await db.from('employee_camp_stays').insert(payload);
    if (error) return alert(error.message);
    setStayDraft(null); load();
  };
  // One-click close: HR now shows a later mobilization_date for this employee (see
  // hrRemobDateAfter above), so set that as the To Date instead of leaving the stay open-ended.
  const closeStayWithHrDate = async (id, toDate) => {
    await db.from('employee_camp_stays').update({ to_date:toDate }).eq('id',id);
    load();
  };
  const removeStay = async (id) => {
    if (!window.confirm('Delete this camp stay and its synced cost entry?')) return;
    await db.from('employee_camp_stays').delete().eq('id',id);
    load();
  };

  // Employees currently off-site per HR (demobilized, nothing remobilized since) with no *ongoing*
  // camp stay logged — a reminder only. Unlike the old version, this never auto-books a cost: with
  // camp-specific rates, the system can't guess which camp someone went to.
  const ongoingStayEmpIds = useMemo(()=> new Set(enrichedStays.filter(s=>s.ongoing).map(s=>s.employee_id)), [enrichedStays]);
  const unloggedOffSite = useMemo(()=>{
    const out = [];
    employees.forEach(e=>{
      if (ongoingStayEmpIds.has(e.employee_id)) return;
      const rows = (effectiveMobDemobByEmp[e.employee_id]||[]).slice().sort((a,b)=>String(a.mobilization_date||'').localeCompare(String(b.mobilization_date||'')));
      const last = rows[rows.length-1];
      if (last && last.demobilization_date) {
        const days = Math.max(0, Math.round((new Date(todayStr+'T00:00:00Z') - new Date(last.demobilization_date+'T00:00:00Z'))/86400000));
        if (days>0) out.push({ employee_id:e.employee_id, full_name:e.full_name, demob_date:last.demobilization_date, left_location:last.location||null, days });
      }
    });
    return out;
  },[employees, effectiveMobDemobByEmp, ongoingStayEmpIds, todayStr]);

  // Some HR "assignments" aren't actually deployment to a client site — they're HR's way of
  // recording that the employee is sitting at camp/head office awaiting deployment (e.g.
  // "SATCO OFFICE"). Per the finance team: these should always be treated as camp time in their
  // own right, using that assignment's own mobilization→demobilization dates, not just the gap
  // that follows it. Add more names here if HR uses other internal/non-client holding locations.
  const CAMP_LOCATION_NAMES = ['SATCO OFFICE'];
  const isCampLocation = (loc) => !!loc && CAMP_LOCATION_NAMES.some(n => String(loc).trim().toUpperCase() === n.toUpperCase());

  // Reconstruct EVERY off-site/camp period from HR's full mobilization/demobilization history for
  // one employee — two kinds of period, both surfaced the same way:
  //  1) The assignment itself is at a camp/holding location (e.g. "SATCO OFFICE") — the employee
  //     was in camp for that row's own mobilization→demobilization span.
  //  2) A demob→remob gap between two real assignments — off-site with no assignment record at all.
  // Needs the HR bridge's full-history view (v_finance_employee_mob_demob v2); on the older
  // "latest record only" bridge this will only ever find the current gap, same as unloggedOffSite.
  const hrGapsFor = (employeeId) => {
    const rows = (effectiveMobDemobByEmp[employeeId]||[]).slice().sort((a,b)=>String(a.mobilization_date||'').localeCompare(String(b.mobilization_date||'')));
    const out = [];
    rows.forEach((row,i)=>{
      if (isCampLocation(row.location) && row.mobilization_date) {
        const endDate = row.demobilization_date || todayStr;
        if (endDate > row.mobilization_date) {
          const days = Math.max(0, Math.round((new Date(endDate+'T00:00:00Z') - new Date(row.mobilization_date+'T00:00:00Z'))/86400000));
          if (days>0) out.push({ employee_id:employeeId, from_date:row.mobilization_date, to_date:row.demobilization_date||null, left_location:row.location||null, days });
        }
      }
      if (!row.demobilization_date) return;
      const next = rows[i+1];
      const remobDate = next && next.mobilization_date ? next.mobilization_date : null;
      const endDate = remobDate || todayStr;
      if (endDate <= row.demobilization_date) return;
      const days = Math.max(0, Math.round((new Date(endDate+'T00:00:00Z') - new Date(row.demobilization_date+'T00:00:00Z'))/86400000));
      if (days<=0) return;
      out.push({ employee_id:employeeId, from_date:row.demobilization_date, to_date:remobDate, left_location:row.location||null, days });
    });
    return out;
  };

  // Every HR gap, across the whole roster, that doesn't already have a matching Camp Stay logged
  // (matched on employee + From Date, regardless of whether a camp/To Date has been filled in yet —
  // editing an imported stub still counts as "logged"). This is what "Import from HR History" below
  // creates in bulk, so historical dates never need retyping — only the camp needs picking afterward.
  const existingStayKeys = useMemo(()=> new Set(stays.map(s=>`${s.employee_id}|${s.from_date}`)), [stays]);
  const missingHrGaps = useMemo(()=>{
    const out = [];
    employees.forEach(e=>{
      hrGapsFor(e.employee_id).forEach(g=>{
        if (!existingStayKeys.has(`${g.employee_id}|${g.from_date}`)) out.push({...g, full_name:e.full_name});
      });
    });
    return out;
  },[employees, effectiveMobDemobByEmp, existingStayKeys, todayStr]);

  // Real client-site deployments (location NOT a recognized camp/holding location like "SATCO
  // OFFICE") are NOT auto-assumed to carry a camp cost — whether SATCO pays for food/accommodation
  // while an employee is deployed at a client site depends entirely on that client's contract.
  // So these are only ever surfaced as an opt-in list (never bulk-imported): Finance picks exactly
  // which site deployments actually had SATCO covering camp, one at a time.
  const hrSiteAssignmentsFor = (employeeId) => {
    const rows = (effectiveMobDemobByEmp[employeeId]||[]).slice().sort((a,b)=>String(a.mobilization_date||'').localeCompare(String(b.mobilization_date||'')));
    const out = [];
    rows.forEach(row=>{
      if (!row.mobilization_date || isCampLocation(row.location)) return;
      const endDate = row.demobilization_date || todayStr;
      if (endDate <= row.mobilization_date) return;
      const days = Math.max(0, Math.round((new Date(endDate+'T00:00:00Z') - new Date(row.mobilization_date+'T00:00:00Z'))/86400000));
      if (days<=0) return;
      out.push({ employee_id:employeeId, from_date:row.mobilization_date, to_date:row.demobilization_date||null, location:row.location||null, days });
    });
    return out;
  };
  const missingSiteAssignments = useMemo(()=>{
    const out = [];
    employees.forEach(e=>{
      hrSiteAssignmentsFor(e.employee_id).forEach(g=>{
        if (!existingStayKeys.has(`${g.employee_id}|${g.from_date}`)) out.push({...g, full_name:e.full_name});
      });
    });
    return out.sort((a,b)=>String(b.from_date||'').localeCompare(String(a.from_date||'')));
  },[employees, effectiveMobDemobByEmp, existingStayKeys, todayStr]);

  const [importingHistory, setImportingHistory] = useState(false);
  // Bulk-creates a Camp Stay stub (dates only, no camp assigned yet) for every HR gap not already
  // logged — so past off-site periods only need a camp picked per row, never full re-entry of dates.
  const importFromHrHistory = async () => {
    if (!missingHrGaps.length) return;
    if (!window.confirm(`Import ${missingHrGaps.length} camp stay(s) from HR's mobilization history? Dates and employees will be filled in; you'll still need to open each one and pick a camp (cost shows as transport-only until you do).`)) return;
    setImportingHistory(true);
    const rows = missingHrGaps.map(g=>({
      employee_id:g.employee_id, full_name:g.full_name,
      camp_id:null, camp_name:null,
      from_date:g.from_date, to_date:g.to_date,
      remarks:`Imported from HR mobilization history${g.left_location?` — ${g.left_location}`:''} — assign a camp to complete costing.`,
    }));
    const { error } = await db.from('employee_camp_stays').insert(rows);
    setImportingHistory(false);
    if (error) return alert(error.message);
    load();
  };

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID', width:'100px'},{key:'full_name',label:'Name',width:'150px'}]),
    {key:'camp_name', label:'Camp', width:'150px'},
  ];
  const scopedStays = useMemo(()=>{
    const base = hideEmpFilter && filters.employee_id ? enrichedStays.filter(s=>s.employee_id===filters.employee_id) : enrichedStays;
    return applyFilters(base, hideEmpFilter?{}:filters).sort((a,b)=>b.from_date<a.from_date?-1:1);
  },[enrichedStays, filters, hideEmpFilter]);

  const summary = useMemo(()=>{
    let totalDays=0, totalCost=0, ongoingCount=0, ongoingCost=0;
    scopedStays.forEach(s=>{
      totalDays += s.days; totalCost += s.cost;
      if (s.ongoing) { ongoingCount++; ongoingCost += s.cost; }
    });
    return { totalDays, totalCost, ongoingCount, ongoingCost, periodCount:scopedStays.length };
  },[scopedStays]);

  const csvCols = [
    {key:'employee_id',label:'Emp ID'},{key:'full_name',label:'Name'},{key:'camp_name',label:'Camp'},
    {key:'from_date',label:'From'},{key:'to_date',label:'To'},{key:'days',label:'Camp Days'},
    {key:'avgDailyRate',label:'Avg Rate/day (AED)'},{key:'cost',label:'Camp Cost (AED)'},
  ];
  const csvRows = scopedStays.map(s=>({ ...s, to_date:s.to_date||'(ongoing)', avgDailyRate:fmt2(s.avgDailyRate), cost:fmt2(s.cost) }));

  const monthLabelFor = (monthKey) => {
    if (!monthKey) return '';
    const [y,m] = monthKey.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleString('en-GB',{month:'long',year:'numeric'});
  };

  // Splits every scoped stay into per-calendar-month rows (one per employee/camp/month) using the
  // same campStaySegments proration the cost sync uses — so "how many days in camp in July" and
  // "what that cost" always agree with the synced expense figure. This is the source data for the
  // Monthly Camp Cost Report below, meant to be handed to the client or camp provider to check
  // their invoice against.
  const monthlyBreakdown = useMemo(()=>{
    const rows = [];
    scopedStays.forEach(s=>{
      const end = s.to_date || todayStr;
      const camp = s.camp_id ? campsById[s.camp_id] : null;
      const monthlyFood  = camp ? Number(camp.monthly_food_rate)||0 : 0;
      const monthlyAccom = camp ? Number(camp.monthly_accommodation_rate)||0 : 0;
      const monthlyTotal = monthlyFood+monthlyAccom;
      const transportRate = transportRateFor(s.employee_id);
      campStaySegments(s.from_date, end).forEach(seg=>{
        const dailyFoodAccom = monthlyTotal>0 ? monthlyTotal/daysInMonth(seg.monthKey) : 0;
        const foodAccomCost = Math.round(seg.days*dailyFoodAccom*100)/100;
        const transportCost = Math.round(seg.days*transportRate*100)/100;
        rows.push({
          employee_id:s.employee_id, full_name:s.full_name, month:seg.monthKey,
          camp_name:s.camp_name, days:seg.days,
          food_accom_cost:foodAccomCost, transport_cost:transportCost,
          total_cost:Math.round((foodAccomCost+transportCost)*100)/100,
        });
      });
    });
    return rows.sort((a,b)=> a.month!==b.month ? (a.month<b.month?-1:1) : (a.employee_id<b.employee_id?-1:a.employee_id>b.employee_id?1:0));
  },[scopedStays, campsById, transportOverrideByEmp, transportDefault, todayStr]);

  const reportMonths = useMemo(()=>{
    const set = new Set(monthlyBreakdown.map(r=>r.month));
    return [...set].sort().reverse();
  },[monthlyBreakdown]);

  const [reportMonthFilter, setReportMonthFilter] = useState('');
  const scopedMonthlyRows = useMemo(()=>
    reportMonthFilter ? monthlyBreakdown.filter(r=>r.month===reportMonthFilter) : monthlyBreakdown
  ,[monthlyBreakdown, reportMonthFilter]);

  const monthlyReportTotals = useMemo(()=> scopedMonthlyRows.reduce((a,r)=>({
    days:a.days+r.days, foodAccom:a.foodAccom+r.food_accom_cost, transport:a.transport+r.transport_cost, total:a.total+r.total_cost,
  }),{days:0,foodAccom:0,transport:0,total:0}),[scopedMonthlyRows]);

  const monthlyReportRowsForExport = () => scopedMonthlyRows.map(r=>({...r, month_label:monthLabelFor(r.month)}));

  // Real .xlsx via SheetJS (already loaded for this app) rather than a CSV — a proper spreadsheet
  // reads better when forwarded to a client or camp provider for an invoicing cross-check.
  const exportMonthlyExcel = () => {
    const rows = monthlyReportRowsForExport();
    const sheetData = rows.map(r=>({
      'Emp ID':r.employee_id, 'Name':r.full_name, 'Month':r.month_label, 'Camp':r.camp_name||'',
      'Camp Days':r.days, 'Food + Accom (AED)':r.food_accom_cost, 'Transport (AED)':r.transport_cost, 'Total (AED)':r.total_cost,
    }));
    sheetData.push({});
    sheetData.push({ 'Camp':'TOTAL', 'Camp Days':monthlyReportTotals.days, 'Food + Accom (AED)':Math.round(monthlyReportTotals.foodAccom*100)/100, 'Transport (AED)':Math.round(monthlyReportTotals.transport*100)/100, 'Total (AED)':Math.round(monthlyReportTotals.total*100)/100 });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{wch:10},{wch:22},{wch:18},{wch:20},{wch:10},{wch:16},{wch:14},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Camp Cost Report');
    XLSX.writeFile(wb, `camp_cost_report_${reportMonthFilter||'all_months'}.xlsx`);
  };

  // PDF via jsPDF + autoTable (loaded in <head> alongside the existing docx/xlsx includes) — a
  // formatted, printable report rather than a raw data export, for the same forward-to-client use.
  const exportMonthlyPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });
    doc.setFontSize(14); doc.setFont(undefined,'bold');
    doc.text('SATCO Arabia — Camp Cost Report', 40, 40);
    doc.setFontSize(10); doc.setFont(undefined,'normal');
    doc.text(`Period: ${reportMonthFilter?monthLabelFor(reportMonthFilter):'All months'}   ·   Generated: ${new Date().toLocaleDateString('en-GB')}`, 40, 58);
    const bodyRows = monthlyReportRowsForExport().map(r=>[r.employee_id, r.full_name, r.month_label, r.camp_name||'—', r.days, fmt2(r.food_accom_cost), fmt2(r.transport_cost), fmt2(r.total_cost)]);
    bodyRows.push(['','','','TOTAL', monthlyReportTotals.days, fmt2(monthlyReportTotals.foodAccom), fmt2(monthlyReportTotals.transport), fmt2(monthlyReportTotals.total)]);
    doc.autoTable({
      startY: 72,
      head: [['Emp ID','Name','Month','Camp','Camp Days','Food+Accom (AED)','Transport (AED)','Total (AED)']],
      body: bodyRows,
      styles: { fontSize:8.5 },
      headStyles: { fillColor:[15,23,42] },
      didParseCell: (data)=>{ if (data.section==='body' && data.row.index===bodyRows.length-1) { data.cell.styles.fontStyle='bold'; data.cell.styles.fillColor=[254,243,199]; } },
    });
    doc.save(`camp_cost_report_${reportMonthFilter||'all_months'}.pdf`);
  };

  // Word (.docx) on SATCO letterhead — the same header/footer banner used for client invoices —
  // so this report can be downloaded month-wise and submitted straight to the client or camp
  // provider for an invoicing cross-check, ready to print or forward as-is.
  const [exportingDocx, setExportingDocx] = useState(false);
  const exportMonthlyDocx = async () => {
    setExportingDocx(true);
    try {
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
              BorderStyle, WidthType, ShadingType, VerticalAlign, ImageRun, Header, Footer } = window.docx;

      const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
      const colWidths = [1000, 2200, 1300, 1700, 1300, 1600, 1400, 1400];
      const tableWidth = colWidths.reduce((a,b)=>a+b,0);

      function headerCell(text, width) {
        return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, shading:{fill:'E8E8E8',type:ShadingType.CLEAR}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER,
          children:[new Paragraph({alignment:AlignmentType.CENTER, children:[new TextRun({text, bold:true, size:16})]})] });
      }
      function cell(text, width, opts) {
        opts = opts||{};
        return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER, shading: opts.shade?{fill:opts.shade,type:ShadingType.CLEAR}:undefined,
          children:[new Paragraph({alignment:opts.align||AlignmentType.LEFT, children:[new TextRun({text:String(text), bold:!!opts.bold, size:16})]})] });
      }

      const rows = monthlyReportRowsForExport();
      const bodyRows = rows.map(r=>new TableRow({ children:[
        cell(r.employee_id, colWidths[0]),
        cell(r.full_name||'', colWidths[1]),
        cell(r.month_label, colWidths[2], {align:AlignmentType.CENTER}),
        cell(r.camp_name||'—', colWidths[3]),
        cell(String(r.days), colWidths[4], {align:AlignmentType.CENTER}),
        cell(fmt2(r.food_accom_cost), colWidths[5], {align:AlignmentType.RIGHT}),
        cell(fmt2(r.transport_cost), colWidths[6], {align:AlignmentType.RIGHT}),
        cell(fmt2(r.total_cost), colWidths[7], {align:AlignmentType.RIGHT, bold:true}),
      ]}));
      const totalsRow = new TableRow({ children:[
        cell('', colWidths[0], {shade:'FEF3C7'}), cell('TOTAL', colWidths[1], {bold:true, shade:'FEF3C7'}), cell('', colWidths[2], {shade:'FEF3C7'}), cell('', colWidths[3], {shade:'FEF3C7'}),
        cell(String(monthlyReportTotals.days), colWidths[4], {align:AlignmentType.CENTER, bold:true, shade:'FEF3C7'}),
        cell(fmt2(monthlyReportTotals.foodAccom), colWidths[5], {align:AlignmentType.RIGHT, bold:true, shade:'FEF3C7'}),
        cell(fmt2(monthlyReportTotals.transport), colWidths[6], {align:AlignmentType.RIGHT, bold:true, shade:'FEF3C7'}),
        cell(fmt2(monthlyReportTotals.total), colWidths[7], {align:AlignmentType.RIGHT, bold:true, shade:'FEF3C7'}),
      ]});

      const { header: _lhHeader, footer: _lhFooter } = await loadLetterheadAssets();
      const headerImage = new ImageRun({
        type: 'png', data: _lhHeader,
        transformation: { width: 540, height: 59 },
        altText: { title: 'SATCO Letterhead', description: 'SATCO Arabia General Contracting letterhead', name: 'Letterhead Header' },
      });
      const footerImage = new ImageRun({
        type: 'png', data: _lhFooter,
        transformation: { width: 540, height: 37 },
        altText: { title: 'SATCO Footer', description: 'SATCO Arabia General Contracting contact footer', name: 'Letterhead Footer' },
      });

      const periodLabel = reportMonthFilter ? monthLabelFor(reportMonthFilter) : 'All months';
      const doc = new Document({
        styles: { default: { document: { run: { font:'Arial', size:20 } } } },
        sections: [{
          properties: { page: { size:{width:16838,height:11906}, orientation:'landscape', margin:{top:1500,right:900,bottom:1200,left:900,header:500,footer:400} } },
          headers: { default: new Header({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[headerImage] }) ] }) },
          footers: { default: new Footer({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[footerImage] }) ] }) },
          children: [
            new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:120,after:60},
              children:[ new TextRun({ text:'CAMP COST REPORT', bold:true, size:26 }) ] }),
            new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:240},
              children:[ new TextRun({ text:`Period: ${periodLabel}   ·   Generated: ${new Date().toLocaleDateString('en-GB')}`, size:18 }) ] }),
            new Table({ width:{size:tableWidth,type:WidthType.DXA}, columnWidths:colWidths, rows:[
              new TableRow({ children:[
                headerCell('Emp ID', colWidths[0]), headerCell('Name', colWidths[1]), headerCell('Month', colWidths[2]), headerCell('Camp', colWidths[3]),
                headerCell('Camp Days', colWidths[4]), headerCell('Food+Accom (AED)', colWidths[5]), headerCell('Transport (AED)', colWidths[6]), headerCell('Total (AED)', colWidths[7]),
              ]}),
              ...bodyRows,
              totalsRow,
            ]}),
            new Paragraph({ spacing:{before:240,after:60}, children:[new TextRun({text:'For submission to the client / camp provider — please cross-check against the camp invoice for the same period.', italics:true, size:16})] }),
            new Paragraph({ spacing:{before:200}, children:[new TextRun({text:'Best regards,', size:18})] }),
            new Paragraph({ spacing:{after:60}, children:[new TextRun({text:'SATCO Arabia General Contracting — Finance Department', bold:true, size:18})] }),
            new Paragraph({ children:[new TextRun({text:'Computer generated report — no original signature or stamp required.', italics:true, size:16})] }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Camp_Cost_Report_${reportMonthFilter||'all_months'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingDocx(false);
    }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button
          title="mobDemobByEmp is fetched from HR once when the portal first loads — new HR entries won't appear here until you refresh, either the whole page or just this data with this button."
          style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1',fontSize:'12px',padding:'6px 12px',opacity:refreshingHr?0.6:1}}
          disabled={refreshingHr} onClick={refreshFromHr}
        >{refreshingHr?'Refreshing…':'↻ Refresh Mob/Demob from HR'}</button>
      </div>
      <div style={S.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',flexWrap:'wrap',gap:'8px'}}>
          <div>
            <div style={{fontWeight:800,fontSize:'13px'}}>Camps (master list)</div>
            <div style={{fontSize:'11.5px',color:'#64748b',marginTop:'2px'}}>Each camp has its own monthly food &amp; accommodation rate — the system derives the daily rate from whichever calendar month(s) a stay falls in.</div>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1',fontSize:'12px',padding:'6px 12px'}} onClick={()=>setShowCamps(v=>!v)}>{showCamps?'▲ Hide':'▼ Show'} ({camps.length})</button>
            {!campDraft && <button style={{...S.btnPri,fontSize:'12px',padding:'6px 12px'}} onClick={blankCamp}>+ Add Camp</button>}
          </div>
        </div>
        {showCamps && (
          <div style={{padding:'14px 16px'}}>
            {campDraft && (
              <div style={{background:'#fffbeb',border:'1px solid #fbbf24',borderRadius:'8px',padding:'12px',marginBottom:'10px'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'8px'}}>
                  <div><label style={S.label}>Camp Name</label><input value={campDraft.name} onChange={e=>setCampDraft(d=>({...d,name:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Monthly Food Rate (AED)</label><input type="number" step="0.01" min="0" value={campDraft.monthly_food_rate} onChange={e=>setCampDraft(d=>({...d,monthly_food_rate:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                  <div><label style={S.label}>Monthly Accommodation Rate (AED)</label><input type="number" step="0.01" min="0" value={campDraft.monthly_accommodation_rate} onChange={e=>setCampDraft(d=>({...d,monthly_accommodation_rate:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                </div>
                <div style={{marginBottom:'8px'}}><label style={S.label}>Remarks</label><input value={campDraft.remarks||''} onChange={e=>setCampDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                <div style={{fontSize:'11.5px',color:'#166534',fontWeight:700,marginBottom:'8px'}}>≈ AED {fmt2(((Number(campDraft.monthly_food_rate)||0)+(Number(campDraft.monthly_accommodation_rate)||0))/daysInMonth(todayStr.slice(0,7)))}/day this month</div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button style={{...S.btnPri,opacity:savingCamp?0.6:1}} disabled={savingCamp} onClick={saveCamp}>{savingCamp?'Saving…':'Save Camp'}</button>
                  <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setCampDraft(null)}>Cancel</button>
                </div>
              </div>
            )}
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
              <thead><tr><th style={S.th}>Camp</th><th style={S.th}>Monthly Food</th><th style={S.th}>Monthly Accom.</th><th style={S.th}>≈ AED/day (this month)</th><th style={S.th}>Remarks</th><th style={S.th}></th></tr></thead>
              <tbody>
                {camps.length===0
                  ? <tr><td colSpan={6} style={{padding:'10px',color:'#94a3b8',textAlign:'center'}}>No camps yet — click "+ Add Camp" to define one (e.g. "ADNOC Camp — Ruwais").</td></tr>
                  : camps.map(c=>(
                    <tr key={c.id} style={{borderTop:'1px solid #e2e8f0'}}>
                      <td style={{...S.td,fontWeight:700}}>{c.name}</td>
                      <td style={S.td}>{fmt2(c.monthly_food_rate)}</td>
                      <td style={S.td}>{fmt2(c.monthly_accommodation_rate)}</td>
                      <td style={S.td}>{fmt2(((Number(c.monthly_food_rate)||0)+(Number(c.monthly_accommodation_rate)||0))/daysInMonth(todayStr.slice(0,7)))}</td>
                      <td style={S.tdWrap}>{c.remarks||'—'}</td>
                      <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                        <button style={S.iconBtn} onClick={()=>editCamp(c)}>&#9998;</button>
                        <button style={S.iconBtn} onClick={()=>removeCamp(c.id)}>&#128465;</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
          <div style={{fontWeight:800,fontSize:'13px'}}>Transport Rate (AED/day)</div>
          <div style={{fontSize:'11.5px',color:'#64748b',marginTop:'2px'}}>Applied to every logged camp day, on top of the camp's food &amp; accommodation cost. Set a company default below, and optionally override it for specific employees.</div>
        </div>
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'12px',alignItems:'end',marginBottom:'10px',maxWidth:'420px'}}>
            <div><label style={S.label}>Transport (AED/day)</label><input type="number" step="0.01" min="0" value={transportDefault.transport_rate_per_day} onChange={e=>setTransportDefault(d=>({...d,transport_rate_per_day:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            <button style={{...S.btnPri,opacity:savingTransport?0.6:1}} disabled={savingTransport} onClick={saveTransportDefault}>{savingTransport?'Saving…':'Save Default Rate'}</button>
          </div>

          <div style={{marginTop:'14px',paddingTop:'12px',borderTop:'1px solid #e2e8f0'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}>
              <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1',fontSize:'12px',padding:'6px 12px'}} onClick={()=>setShowTransportOverrides(v=>!v)}>{showTransportOverrides?'▲ Hide':'▼ Show'} Per-Employee Rate Overrides ({transportOverrides.length})</button>
              {!transportOverrideDraft && <button style={{...S.btnPri,fontSize:'12px',padding:'6px 12px'}} onClick={blankTransportOverride}>+ Add Override</button>}
            </div>
            {showTransportOverrides && (
              <div style={{marginTop:'10px'}}>
                {transportOverrideDraft && (
                  <div style={{background:'#fffbeb',border:'1px solid #fbbf24',borderRadius:'8px',padding:'12px',marginBottom:'10px'}}>
                    {!hideEmpFilter && (
                      <div style={{marginBottom:'8px'}}>
                        <label style={S.label}>Employee</label>
                        <EmployeePicker employees={employees} value={transportOverrideDraft.employee_id} name={transportOverrideDraft.full_name}
                          onChange={(id,name)=>setTransportOverrideDraft(d=>({...d,employee_id:id,full_name:name}))} />
                      </div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'10px',marginBottom:'8px',maxWidth:'260px'}}>
                      <div><label style={S.label}>Transport (AED/day) — blank = default</label><input type="number" step="0.01" value={transportOverrideDraft.transport_rate_per_day} onChange={e=>setTransportOverrideDraft(d=>({...d,transport_rate_per_day:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                    </div>
                    <div style={{marginBottom:'8px'}}><label style={S.label}>Remarks</label><input value={transportOverrideDraft.remarks||''} onChange={e=>setTransportOverrideDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
                    <div style={{display:'flex',gap:'8px'}}>
                      <button style={S.btnPri} onClick={saveTransportOverride}>Save Override</button>
                      <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setTransportOverrideDraft(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <thead><tr><th style={S.th}>Employee</th><th style={S.th}>Transport</th><th style={S.th}>Remarks</th><th style={S.th}></th></tr></thead>
                  <tbody>
                    {transportOverrides.length===0
                      ? <tr><td colSpan={4} style={{padding:'10px',color:'#94a3b8',textAlign:'center'}}>No overrides — every employee uses the default rate above.</td></tr>
                      : transportOverrides.map(o=>(
                        <tr key={o.id} style={{borderTop:'1px solid #e2e8f0'}}>
                          <td style={S.td}>{o.full_name||o.employee_id} <span style={{color:'#94a3b8',fontFamily:'ui-monospace,monospace',fontSize:'11px'}}>({o.employee_id})</span></td>
                          <td style={S.td}>{o.transport_rate_per_day!=null?fmt2(o.transport_rate_per_day):'—'}</td>
                          <td style={S.tdWrap}>{o.remarks||'—'}</td>
                          <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button style={S.iconBtn} onClick={()=>editTransportOverride(o)}>&#9998;</button>
                            <button style={S.iconBtn} onClick={()=>removeTransportOverride(o.id)}>&#128465;</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {unloggedOffSite.length>0 && (
        <div style={{...S.card,padding:'14px 16px',background:'#eff6ff',border:'1px solid #bfdbfe'}}>
          <div style={{fontWeight:800,fontSize:'12.5px',color:'#1d4ed8',marginBottom:'6px'}}>Off-Site Per HR — No Camp Stay Logged Yet ({unloggedOffSite.length})</div>
          <div style={{fontSize:'11.5px',color:'#1e40af',marginBottom:'8px'}}>These employees show a demobilization with no later remobilization in HR, but have no ongoing Camp Stay entered below — nothing is being costed for them yet.</div>
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            {unloggedOffSite.map(u=>(
              <div key={u.employee_id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'12px',background:'#fff',borderRadius:'6px',padding:'6px 10px'}}>
                <span><b>{u.full_name}</b> <span style={{color:'#94a3b8',fontFamily:'ui-monospace,monospace'}}>({u.employee_id})</span> — off-site since {u.demob_date}{u.left_location?` (left ${u.left_location})`:''}, {u.days} day(s)</span>
                <button style={{...S.btnPri,fontSize:'11.5px',padding:'5px 10px'}} onClick={()=>blankStay({employee_id:u.employee_id, full_name:u.full_name, from_date:u.demob_date})}>+ Log Camp Stay</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {missingHrGaps.length>0 && (
        <div style={{...S.card,padding:'14px 16px',background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}}>
            <div>
              <div style={{fontWeight:800,fontSize:'12.5px',color:'#166534',marginBottom:'4px'}}>Historical Off-Site Periods from HR — Not Yet Logged ({missingHrGaps.length})</div>
              <div style={{fontSize:'11.5px',color:'#166534'}}>Found in HR's mobilization history (past periods as well as any current one) with no matching Camp Stay below. Import fills in employee and dates for every one of them in one click — you'll still need to open each row afterward and pick which camp it was, since HR has no record of that.</div>
            </div>
            <button style={{...S.btnPri,background:'#166534',opacity:importingHistory?0.6:1,whiteSpace:'nowrap'}} disabled={importingHistory} onClick={importFromHrHistory}>{importingHistory?'Importing…':`Import ${missingHrGaps.length} from HR History`}</button>
          </div>
        </div>
      )}

      {missingSiteAssignments.length>0 && (
        <div style={{...S.card,padding:'14px 16px',background:'#fdf4ff',border:'1px solid #e9d5ff'}}>
          <div style={{fontWeight:800,fontSize:'12.5px',color:'#7e22ce',marginBottom:'4px'}}>Client Site Assignments — Log Only If SATCO Pays Camp Cost There ({missingSiteAssignments.length})</div>
          <div style={{fontSize:'11.5px',color:'#6b21a8',marginBottom:'8px'}}>These are real deployments to a client site per HR (not head office/camp). Whether SATCO covers food &amp; accommodation while deployed depends on that client's contract — nothing is added automatically. Use "+ Log Camp Stay" only for the ones your contract says SATCO pays for.</div>
          <div style={{display:'flex',flexDirection:'column',gap:'6px',maxHeight:'220px',overflowY:'auto'}}>
            {missingSiteAssignments.map((g,i)=>(
              <div key={g.employee_id+'|'+g.from_date+'|'+i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'12px',background:'#fff',borderRadius:'6px',padding:'6px 10px',gap:'10px'}}>
                <span><b>{g.full_name}</b> <span style={{color:'#94a3b8',fontFamily:'ui-monospace,monospace'}}>({g.employee_id})</span> — {g.location||'site'}, {g.from_date} → {g.to_date||'ongoing'} ({g.days} day{g.days===1?'':'s'})</span>
                <button style={{...S.btnPri,background:'#7e22ce',fontSize:'11.5px',padding:'5px 10px',whiteSpace:'nowrap'}}
                  onClick={()=>blankStay({employee_id:g.employee_id, full_name:g.full_name, from_date:g.from_date, to_date:g.to_date||'', remarks:`Client site assignment — ${g.location||'site'} — SATCO pays camp cost per contract.`})}
                >+ Log Camp Stay</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',flexWrap:'wrap',gap:'10px'}}>
          <div>
            <div style={{fontWeight:800,fontSize:'14px'}}>Camp Stays — Food, Accommodation &amp; Transport While Off-Site</div>
            <div style={{fontSize:'12px',color:'#64748b'}}>{summary.periodCount} stay(s) · {summary.ongoingCount} currently in camp</div>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnExp} onClick={()=>exportCSV(csvRows,'camp_stays',csvCols)}>Export CSV</button>
            {!stayDraft && <button style={S.btnPri} onClick={()=>blankStay()}>+ Add Camp Stay</button>}
          </div>
        </div>
        <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

        {stayDraft && (
          <div style={{margin:'14px',background:'#fffbeb',border:'1px solid #fbbf24',borderRadius:'8px',padding:'12px'}}>
            {!hideEmpFilter && (
              <div style={{marginBottom:'8px'}}>
                <label style={S.label}>Employee</label>
                <EmployeePicker employees={employees} value={stayDraft.employee_id} name={stayDraft.full_name}
                  onChange={(id,name)=>setStayDraft(d=>({...d,employee_id:id,full_name:name}))} />
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'8px'}}>
              <div>
                <label style={S.label}>Camp</label>
                <select value={stayDraft.camp_id} onChange={e=>setStayDraft(d=>({...d,camp_id:e.target.value}))} style={{...S.input,width:'100%'}}>
                  <option value="">— Select camp —</option>
                  {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label style={S.label}>From Date</label><input type="date" value={stayDraft.from_date} onChange={e=>setStayDraft(d=>({...d,from_date:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
              <div><label style={S.label}>To Date — blank = still in camp</label><input type="date" value={stayDraft.to_date} onChange={e=>setStayDraft(d=>({...d,to_date:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            </div>
            <div style={{marginBottom:'8px'}}><label style={S.label}>Remarks</label><input value={stayDraft.remarks||''} onChange={e=>setStayDraft(d=>({...d,remarks:e.target.value}))} style={{...S.input,width:'100%'}}/></div>
            {stayDraft.camp_id && stayDraft.from_date && (()=>{
              const camp = campsById[stayDraft.camp_id];
              const end = stayDraft.to_date || todayStr;
              const days = Math.max(0, Math.round((new Date(end+'T00:00:00Z') - new Date(stayDraft.from_date+'T00:00:00Z'))/86400000));
              const foodAccom = camp ? campStayFoodAccomCost(stayDraft.from_date, end, camp.monthly_food_rate, camp.monthly_accommodation_rate) : 0;
              const transport = days*transportRateFor(stayDraft.employee_id);
              return <div style={{fontSize:'11.5px',color:'#166534',fontWeight:700,marginBottom:'8px'}}>{days} day(s) → Food+Accom AED {fmt2(foodAccom)} + Transport AED {fmt2(transport)} = AED {fmt2(foodAccom+transport)}</div>;
            })()}
            <div style={{display:'flex',gap:'8px'}}>
              <button style={S.btnPri} onClick={saveStay}>Save Camp Stay</button>
              <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setStayDraft(null)}>Cancel</button>
            </div>
          </div>
        )}

        {summary.periodCount>0 && (
          <div style={{margin:'14px',padding:'12px 16px',borderRadius:'10px',border:'1px solid #fde68a',background:'#fffbeb'}}>
            <div style={{fontWeight:800,fontSize:'12.5px',marginBottom:'4px',color:'#92400e'}}>Camp Cost Owed to Client/Camp{!hideEmpFilter?' — All Employees':''}</div>
            <div style={{fontSize:'12.5px',color:'#78350f',marginBottom:'6px'}}>{summary.totalDays} total camp day(s) across {summary.periodCount} stay(s), of which {summary.ongoingCount} employee(s) are in camp right now.</div>
            <div style={{fontSize:'15px',fontWeight:800,color:'#92400e'}}>Total: AED {fmt2(summary.totalCost)}{summary.ongoingCost>0 && <span style={{fontSize:'12px',fontWeight:700,color:'#b45309'}}> &nbsp;(AED {fmt2(summary.ongoingCost)} still accruing — ongoing)</span>}</div>
          </div>
        )}

        <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
            <thead className="tbl-sticky-th"><tr>{(hideEmpFilter?['Camp','From','To','Status','Camp Days','Avg Rate/day','Camp Cost','Synced','']:['Emp ID','Name','Camp','From','To','Status','Camp Days','Avg Rate/day','Camp Cost','Synced','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={hideEmpFilter?9:11} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                : scopedStays.length===0
                  ? <tr><td colSpan={hideEmpFilter?9:11} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>No camp stays logged yet — click "+ Add Camp Stay" to record one.</td></tr>
                  : scopedStays.map(s=>{
                      const isSynced = !!synced[s.id];
                      return (
                        <tr key={s.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9'}}>
                          {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{s.employee_id}</td>}
                          {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{s.full_name}</td>}
                          <td style={S.td}>
                            {s.camp_name || <span style={{background:'#fef3c7',color:'#92400e',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>⚠ Assign camp</span>}
                          </td>
                          <td style={S.td}>{s.from_date}</td>
                          <td style={S.td}>{s.to_date||'—'}</td>
                          <td style={S.td}>
                            {s.ongoing
                              ? <span style={{background:'#fef3c7',color:'#92400e',fontSize:'10.5px',fontWeight:700,padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'}}>Still in camp</span>
                              : <span style={{color:'#166534',fontWeight:700,fontSize:'11px'}}>Closed</span>}
                            {s.ongoing && s.suggestedCloseDate && (
                              <div style={{marginTop:'4px'}}>
                                <button
                                  title="HR's mobilization history shows this employee back on site since this date"
                                  style={{background:'#dbeafe',color:'#1d4ed8',border:'1px solid #93c5fd',fontSize:'10px',fontWeight:700,padding:'2px 6px',borderRadius:'8px',cursor:'pointer',whiteSpace:'nowrap'}}
                                  onClick={()=>{ if (window.confirm(`HR shows ${s.full_name} remobilized on ${s.suggestedCloseDate}. Close this camp stay with that date?`)) closeStayWithHrDate(s.id, s.suggestedCloseDate); }}
                                >HR: remobilized {s.suggestedCloseDate} — Close?</button>
                              </div>
                            )}
                          </td>
                          <td style={{...S.td,fontWeight:700}}>{s.days}</td>
                          <td style={S.td} title={`Food+Accom AED ${fmt2(s.foodAccomCost)} + Transport AED ${fmt2(s.transportCost)}`}>{fmt2(s.avgDailyRate)}</td>
                          <td style={{...S.td,fontWeight:700,color:'#92400e'}}>{fmt2(s.cost)}</td>
                          <td style={S.td}>{isSynced ? <span style={{color:'#166534',fontWeight:700,fontSize:'11px'}}>✓ Synced</span> : <span style={{color:'#94a3b8',fontSize:'11px'}}>—</span>}</td>
                          <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button style={S.iconBtn} onClick={()=>editStay(s)}>&#9998;</button>
                            <button style={S.iconBtn} onClick={()=>removeStay(s.id)}>&#128465;</button>
                          </td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={S.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',flexWrap:'wrap',gap:'10px'}}>
          <div>
            <div style={{fontWeight:800,fontSize:'14px'}}>Monthly Camp Cost Report</div>
            <div style={{fontSize:'12px',color:'#64748b'}}>Camp days and cost per employee, split by calendar month — forward to the client or camp provider to cross-check their invoice.</div>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <select value={reportMonthFilter} onChange={e=>setReportMonthFilter(e.target.value)} style={{...S.input,minWidth:'170px'}}>
              <option value="">All months</option>
              {reportMonths.map(m=><option key={m} value={m}>{monthLabelFor(m)}</option>)}
            </select>
            <button style={S.btnExp} disabled={!scopedMonthlyRows.length} onClick={exportMonthlyExcel}>Export Excel</button>
            <button style={{...S.btnExp,background:'#7c2d12'}} disabled={!scopedMonthlyRows.length} onClick={exportMonthlyPDF}>Export PDF</button>
            <button style={{...S.btnExp,background:'#1d4ed8'}} disabled={!scopedMonthlyRows.length||exportingDocx} onClick={exportMonthlyDocx}>{exportingDocx?'Preparing…':'Export Word (Letterhead)'}</button>
          </div>
        </div>

        {scopedMonthlyRows.length>0 && (
          <div style={{margin:'14px',padding:'12px 16px',borderRadius:'10px',border:'1px solid #fde68a',background:'#fffbeb'}}>
            <div style={{fontSize:'12.5px',color:'#78350f',marginBottom:'6px'}}>{scopedMonthlyRows.length} row(s) · {monthlyReportTotals.days} total camp day(s){reportMonthFilter?` in ${monthLabelFor(reportMonthFilter)}`:' across all months'}</div>
            <div style={{fontSize:'15px',fontWeight:800,color:'#92400e'}}>Total: AED {fmt2(monthlyReportTotals.total)} <span style={{fontSize:'12px',fontWeight:600,color:'#78350f'}}>(Food+Accom {fmt2(monthlyReportTotals.foodAccom)} + Transport {fmt2(monthlyReportTotals.transport)})</span></div>
          </div>
        )}

        <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'480px'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
            <thead className="tbl-sticky-th"><tr>{['Emp ID','Name','Month','Camp','Camp Days','Food+Accom','Transport','Total'].map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
            <tbody>
              {scopedMonthlyRows.length===0
                ? <tr><td colSpan={8} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>No camp stay data for this selection.</td></tr>
                : scopedMonthlyRows.map((r,i)=>(
                  <tr key={i} style={{borderTop:'1px solid #f1f5f9'}}>
                    <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>
                    <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>
                    <td style={S.td}>{monthLabelFor(r.month)}</td>
                    <td style={S.td}>{r.camp_name || <span style={{color:'#94a3b8'}}>—</span>}</td>
                    <td style={{...S.td,fontWeight:700}}>{r.days}</td>
                    <td style={S.td}>{fmt2(r.food_accom_cost)}</td>
                    <td style={S.td}>{fmt2(r.transport_cost)}</td>
                    <td style={{...S.td,fontWeight:700,color:'#92400e'}}>{fmt2(r.total_cost)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── PPE & UNIFORMS ISSUED ──────────────────────────────────────────
function PpeIssuedTable({ employees, initialFilter, hideEmpFilter, hideExportButton }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft]   = useState(null);
  const [filters, setFilters] = useState(initialFilter||{});
  useEffect(()=>{ if (initialFilter) setFilters(initialFilter); },[initialFilter&&initialFilter.employee_id]);

  const load = async () => {
    setLoading(true);
    const {data,error} = await db.from('employee_ppe_issued').select('*').order('issue_date',{ascending:false});
    if (!error) setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const filterFields = [
    ...(hideEmpFilter?[]:[{key:'employee_id', label:'Emp ID', width:'100px'},{key:'full_name',label:'Name',width:'150px'}]),
    {key:'notes', label:'Remarks', width:'150px'},
  ];
  const filtered = useMemo(()=>applyFilters(rows,filters),[rows,filters]);
  const grouped  = useMemo(()=>groupByMonth(filtered,'issue_date'),[filtered]);
  const COLS = hideEmpFilter?7:9;

  const csvCols = [
    {key:'employee_id',label:'Emp ID'},{key:'full_name',label:'Name'},
    {key:'issue_date',label:'Issue Date'},{key:'coverall_size',label:'Coverall Size'},
    {key:'coverall_qty',label:'Coverall Qty'},{key:'shoes_size',label:'Shoes Size'},
    {key:'shoes_qty',label:'Shoes Qty'},{key:'goggles_qty',label:'Goggles Qty'},
    {key:'total_cost',label:'Cost (AED)'},{key:'notes',label:'Remarks'},
  ];

  const blank = ()=>setDraft({employee_id:initialFilter&&initialFilter.employee_id||'',full_name:initialFilter&&initialFilter.full_name||'',issue_date:new Date().toISOString().slice(0,10),coverall_size:'',coverall_qty:'',shoes_size:'',shoes_qty:'',goggles_qty:'',total_cost:'',notes:''});

  const save = async () => {
    if (!draft.employee_id) return alert('Employee is required');
    const clean = {
      employee_id:draft.employee_id, full_name:draft.full_name||null,
      issue_date:draft.issue_date||new Date().toISOString().slice(0,10),
      coverall_size:draft.coverall_size||null, coverall_qty:Number(draft.coverall_qty)||0,
      shoes_size:draft.shoes_size||null, shoes_qty:Number(draft.shoes_qty)||0,
      goggles_qty:Number(draft.goggles_qty)||0, total_cost:Number(draft.total_cost)||0, notes:draft.notes||null,
    };
    const {error} = draft.id
      ? await db.from('employee_ppe_issued').update(clean).eq('id',draft.id)
      : await db.from('employee_ppe_issued').insert(clean);
    if (error) return alert(error.message);
    setDraft(null); load();
  };
  const remove = async (id)=>{ if(!window.confirm('Delete?'))return; await db.from('employee_ppe_issued').delete().eq('id',id); load(); };

  // ── Monthly PPE Cost Report — same idea as the Camp Cost monthly report: split every issuance
  // by calendar month (of issue_date) per employee, so the client or accounts team can see exactly
  // what PPE cost was incurred in a given month rather than only a lifetime running total.
  const monthLabelFor = (monthKey) => {
    if (!monthKey) return '';
    const [y,m] = monthKey.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleString('en-GB',{month:'long',year:'numeric'});
  };
  const monthlyPpeBreakdown = useMemo(()=>
    filtered
      .filter(r=>r.issue_date)
      .map(r=>({
        employee_id:r.employee_id, full_name:r.full_name, month:String(r.issue_date).slice(0,7),
        coverall_qty:Number(r.coverall_qty)||0, shoes_qty:Number(r.shoes_qty)||0, goggles_qty:Number(r.goggles_qty)||0,
        total_cost:Number(r.total_cost)||0,
      }))
      .sort((a,b)=> a.month!==b.month ? (a.month<b.month?-1:1) : (a.employee_id<b.employee_id?-1:a.employee_id>b.employee_id?1:0)),
  [filtered]);
  const ppeReportMonths = useMemo(()=>{
    const set = new Set(monthlyPpeBreakdown.map(r=>r.month));
    return [...set].sort().reverse();
  },[monthlyPpeBreakdown]);
  const [ppeReportMonthFilter, setPpeReportMonthFilter] = useState('');
  const scopedPpeMonthlyRows = useMemo(()=>
    ppeReportMonthFilter ? monthlyPpeBreakdown.filter(r=>r.month===ppeReportMonthFilter) : monthlyPpeBreakdown
  ,[monthlyPpeBreakdown, ppeReportMonthFilter]);
  const ppeMonthlyReportTotals = useMemo(()=> scopedPpeMonthlyRows.reduce((a,r)=>({
    coverall:a.coverall+r.coverall_qty, shoes:a.shoes+r.shoes_qty, goggles:a.goggles+r.goggles_qty, total:a.total+r.total_cost,
  }),{coverall:0,shoes:0,goggles:0,total:0}),[scopedPpeMonthlyRows]);
  const ppeMonthlyRowsForExport = () => scopedPpeMonthlyRows.map(r=>({...r, month_label:monthLabelFor(r.month)}));

  const exportPpeMonthlyExcel = () => {
    const rows = ppeMonthlyRowsForExport();
    const sheetData = rows.map(r=>({
      'Emp ID':r.employee_id, 'Name':r.full_name, 'Month':r.month_label,
      'Coverall Qty':r.coverall_qty, 'Shoes Qty':r.shoes_qty, 'Goggles Qty':r.goggles_qty, 'Total (AED)':r.total_cost,
    }));
    sheetData.push({});
    sheetData.push({ 'Name':'TOTAL', 'Coverall Qty':ppeMonthlyReportTotals.coverall, 'Shoes Qty':ppeMonthlyReportTotals.shoes, 'Goggles Qty':ppeMonthlyReportTotals.goggles, 'Total (AED)':Math.round(ppeMonthlyReportTotals.total*100)/100 });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{wch:10},{wch:22},{wch:18},{wch:12},{wch:10},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PPE Cost Report');
    XLSX.writeFile(wb, `ppe_cost_report_${ppeReportMonthFilter||'all_months'}.xlsx`);
  };

  const exportPpeMonthlyPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });
    doc.setFontSize(14); doc.setFont(undefined,'bold');
    doc.text('SATCO Arabia — PPE Cost Report', 40, 40);
    doc.setFontSize(10); doc.setFont(undefined,'normal');
    doc.text(`Period: ${ppeReportMonthFilter?monthLabelFor(ppeReportMonthFilter):'All months'}   ·   Generated: ${new Date().toLocaleDateString('en-GB')}`, 40, 58);
    const bodyRows = ppeMonthlyRowsForExport().map(r=>[r.employee_id, r.full_name, r.month_label, r.coverall_qty, r.shoes_qty, r.goggles_qty, fmt2(r.total_cost)]);
    bodyRows.push(['','','TOTAL', ppeMonthlyReportTotals.coverall, ppeMonthlyReportTotals.shoes, ppeMonthlyReportTotals.goggles, fmt2(ppeMonthlyReportTotals.total)]);
    doc.autoTable({
      startY: 72,
      head: [['Emp ID','Name','Month','Coverall Qty','Shoes Qty','Goggles Qty','Total (AED)']],
      body: bodyRows,
      styles: { fontSize:8.5 },
      headStyles: { fillColor:[15,23,42] },
      didParseCell: (data)=>{ if (data.section==='body' && data.row.index===bodyRows.length-1) { data.cell.styles.fontStyle='bold'; data.cell.styles.fillColor=[254,243,199]; } },
    });
    doc.save(`ppe_cost_report_${ppeReportMonthFilter||'all_months'}.pdf`);
  };

  // Word (.docx) on SATCO letterhead — same pattern as the Camp Cost Report, ready to forward.
  const [exportingPpeDocx, setExportingPpeDocx] = useState(false);
  const exportPpeMonthlyDocx = async () => {
    setExportingPpeDocx(true);
    try {
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
              BorderStyle, WidthType, ShadingType, VerticalAlign, ImageRun, Header, Footer } = window.docx;

      const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
      const colWidths = [1300, 2800, 1800, 1500, 1400, 1500, 1500];
      const tableWidth = colWidths.reduce((a,b)=>a+b,0);

      function headerCell(text, width) {
        return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, shading:{fill:'E8E8E8',type:ShadingType.CLEAR}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER,
          children:[new Paragraph({alignment:AlignmentType.CENTER, children:[new TextRun({text, bold:true, size:16})]})] });
      }
      function cell(text, width, opts) {
        opts = opts||{};
        return new TableCell({ borders, width:{size:width,type:WidthType.DXA}, margins:cellMargins, verticalAlign:VerticalAlign.CENTER, shading: opts.shade?{fill:opts.shade,type:ShadingType.CLEAR}:undefined,
          children:[new Paragraph({alignment:opts.align||AlignmentType.LEFT, children:[new TextRun({text:String(text), bold:!!opts.bold, size:16})]})] });
      }

      const rows = ppeMonthlyRowsForExport();
      const bodyRows = rows.map(r=>new TableRow({ children:[
        cell(r.employee_id, colWidths[0]),
        cell(r.full_name||'', colWidths[1]),
        cell(r.month_label, colWidths[2], {align:AlignmentType.CENTER}),
        cell(String(r.coverall_qty), colWidths[3], {align:AlignmentType.CENTER}),
        cell(String(r.shoes_qty), colWidths[4], {align:AlignmentType.CENTER}),
        cell(String(r.goggles_qty), colWidths[5], {align:AlignmentType.CENTER}),
        cell(fmt2(r.total_cost), colWidths[6], {align:AlignmentType.RIGHT, bold:true}),
      ]}));
      const totalsRow = new TableRow({ children:[
        cell('', colWidths[0], {shade:'FEF3C7'}), cell('TOTAL', colWidths[1], {bold:true, shade:'FEF3C7'}), cell('', colWidths[2], {shade:'FEF3C7'}),
        cell(String(ppeMonthlyReportTotals.coverall), colWidths[3], {align:AlignmentType.CENTER, bold:true, shade:'FEF3C7'}),
        cell(String(ppeMonthlyReportTotals.shoes), colWidths[4], {align:AlignmentType.CENTER, bold:true, shade:'FEF3C7'}),
        cell(String(ppeMonthlyReportTotals.goggles), colWidths[5], {align:AlignmentType.CENTER, bold:true, shade:'FEF3C7'}),
        cell(fmt2(ppeMonthlyReportTotals.total), colWidths[6], {align:AlignmentType.RIGHT, bold:true, shade:'FEF3C7'}),
      ]});

      const { header: _lhHeader, footer: _lhFooter } = await loadLetterheadAssets();
      const headerImage = new ImageRun({
        type: 'png', data: _lhHeader,
        transformation: { width: 540, height: 59 },
        altText: { title: 'SATCO Letterhead', description: 'SATCO Arabia General Contracting letterhead', name: 'Letterhead Header' },
      });
      const footerImage = new ImageRun({
        type: 'png', data: _lhFooter,
        transformation: { width: 540, height: 37 },
        altText: { title: 'SATCO Footer', description: 'SATCO Arabia General Contracting contact footer', name: 'Letterhead Footer' },
      });

      const periodLabel = ppeReportMonthFilter ? monthLabelFor(ppeReportMonthFilter) : 'All months';
      const doc = new Document({
        styles: { default: { document: { run: { font:'Arial', size:20 } } } },
        sections: [{
          properties: { page: { size:{width:16838,height:11906}, orientation:'landscape', margin:{top:1500,right:900,bottom:1200,left:900,header:500,footer:400} } },
          headers: { default: new Header({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[headerImage] }) ] }) },
          footers: { default: new Footer({ children: [ new Paragraph({ alignment:AlignmentType.CENTER, children:[footerImage] }) ] }) },
          children: [
            new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:120,after:60},
              children:[ new TextRun({ text:'PPE & UNIFORMS COST REPORT', bold:true, size:26 }) ] }),
            new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:240},
              children:[ new TextRun({ text:`Period: ${periodLabel}   ·   Generated: ${new Date().toLocaleDateString('en-GB')}`, size:18 }) ] }),
            new Table({ width:{size:tableWidth,type:WidthType.DXA}, columnWidths:colWidths, rows:[
              new TableRow({ children:[
                headerCell('Emp ID', colWidths[0]), headerCell('Name', colWidths[1]), headerCell('Month', colWidths[2]),
                headerCell('Coverall Qty', colWidths[3]), headerCell('Shoes Qty', colWidths[4]), headerCell('Goggles Qty', colWidths[5]), headerCell('Total (AED)', colWidths[6]),
              ]}),
              ...bodyRows,
              totalsRow,
            ]}),
            new Paragraph({ spacing:{before:240,after:60}, children:[new TextRun({text:'For submission to the client — please cross-check against PPE issuance records for the same period.', italics:true, size:16})] }),
            new Paragraph({ spacing:{before:200}, children:[new TextRun({text:'Best regards,', size:18})] }),
            new Paragraph({ spacing:{after:60}, children:[new TextRun({text:'SATCO Arabia General Contracting — Finance Department', bold:true, size:18})] }),
            new Paragraph({ children:[new TextRun({text:'Computer generated report — no original signature or stamp required.', italics:true, size:16})] }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PPE_Cost_Report_${ppeReportMonthFilter||'all_months'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPpeDocx(false);
    }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',position:'sticky',top:'var(--stk-1)',zIndex:'15',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>PPE &amp; Uniforms Issued</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>{filtered.length} issuance record(s) — coveralls, safety shoes, goggles — total AED {filtered.reduce((s,r)=>s+(Number(r.total_cost)||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {!hideExportButton && <button style={S.btnExp} onClick={()=>exportCSV(filtered,'ppe_issued',csvCols)}>Export CSV</button>}
          <button style={S.btnPri} onClick={blank}>+ Add</button>
        </div>
      </div>

      <FilterBar fields={filterFields} values={filters} onChange={setFilters} onClear={()=>setFilters({})} />

      {draft && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid #e2e8f0',background:'#fffbeb'}}>
          <div style={{display:'grid',gridTemplateColumns:'1.8fr 1fr',gap:'10px',marginBottom:'8px',alignItems:'end'}}>
            <div>
              <label style={S.label}>Employee</label>
              <EmployeePicker employees={employees} value={draft.employee_id} name={draft.full_name}
                onChange={(id,name)=>setDraft(d=>({...d,employee_id:id,full_name:name}))} />
            </div>
            <div><label style={S.label}>Issue Date</label><input type="date" value={draft.issue_date} onChange={e=>setDraft(d=>({...d,issue_date:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr',gap:'10px',marginBottom:'8px',alignItems:'end'}}>
            <div><label style={S.label}>Coverall Size</label><input value={draft.coverall_size||''} onChange={e=>setDraft(d=>({...d,coverall_size:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="e.g. L, XL" /></div>
            <div><label style={S.label}>Coverall Qty</label><input type="number" value={draft.coverall_qty||''} onChange={e=>setDraft(d=>({...d,coverall_qty:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Shoes Size</label><input value={draft.shoes_size||''} onChange={e=>setDraft(d=>({...d,shoes_size:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Shoes Qty</label><input type="number" value={draft.shoes_qty||''} onChange={e=>setDraft(d=>({...d,shoes_qty:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Goggles Qty</label><input type="number" value={draft.goggles_qty||''} onChange={e=>setDraft(d=>({...d,goggles_qty:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
            <div><label style={S.label}>Cost (AED)</label><input type="number" value={draft.total_cost||''} onChange={e=>setDraft(d=>({...d,total_cost:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="Total cost of items issued" /></div>
          </div>
          <div style={{marginBottom:'8px'}}><label style={S.label}>Remarks</label><input value={draft.notes||''} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} style={{...S.input,width:'100%'}} /></div>
          <div style={{display:'flex',gap:'8px'}}>
            <button style={S.btnPri} onClick={save}>Save</button>
            <button style={{...S.btnPri,background:'#fff',color:'#475569',border:'1px solid #cbd5e1'}} onClick={()=>setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - var(--stk-3) - 40px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>{(hideEmpFilter?['Date','Coverall','Shoes','Goggles','Cost (AED)','Remarks','']:['Emp ID','Name','Date','Coverall','Shoes','Goggles','Cost (AED)','Remarks','']).map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
              : grouped.length===0
                ? <tr><td colSpan={COLS} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>{rows.length===0?'No PPE records yet':'No records match filters'}</td></tr>
                : grouped.map(g=>(
                    <React.Fragment key={g.month}>
                      {!hideEmpFilter && <MonthGroup month={g.month} count={g.rows.length} colSpan={COLS} />}
                      {g.rows.map(r=>(
                        <tr key={r.id} className="hr-row" style={{borderTop:'1px solid #f1f5f9',cursor:'pointer'}} onClick={()=>setDraft({...r,issue_date:r.issue_date||''})}>
                          {!hideEmpFilter && <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>}
                          {!hideEmpFilter && <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>}
                          <td style={S.td}>{r.issue_date||'—'}</td>
                          <td style={S.td}>{r.coverall_size?`${r.coverall_size} × ${r.coverall_qty||0}`:'—'}</td>
                          <td style={S.td}>{r.shoes_size?`${r.shoes_size} × ${r.shoes_qty||0}`:'—'}</td>
                          <td style={S.td}>{r.goggles_qty||'—'}</td>
                          <td style={{...S.td,fontWeight:700,color:'#dc2626'}}>{r.total_cost?('AED '+Number(r.total_cost).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})):'—'}</td>
                          <td style={S.tdWrap}>{r.notes||'—'}</td>
                          <td style={{...S.td,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button style={S.iconBtn} onClick={e=>{e.stopPropagation();setDraft({...r,issue_date:r.issue_date||''});}}>&#9998;</button>
                            <button style={S.iconBtn} onClick={e=>{e.stopPropagation();remove(r.id);}}>&#128465;</button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
          </tbody>
        </table>
      </div>
    </div>

    <div style={S.card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <div style={{fontWeight:800,fontSize:'14px'}}>Monthly PPE Cost Report</div>
          <div style={{fontSize:'12px',color:'#64748b'}}>PPE issuance and cost per employee, split by calendar month — forward to the client for cross-check or keep for audit.</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <select value={ppeReportMonthFilter} onChange={e=>setPpeReportMonthFilter(e.target.value)} style={{...S.input,minWidth:'170px'}}>
            <option value="">All months</option>
            {ppeReportMonths.map(m=><option key={m} value={m}>{monthLabelFor(m)}</option>)}
          </select>
          <button style={S.btnExp} disabled={!scopedPpeMonthlyRows.length} onClick={exportPpeMonthlyExcel}>Export Excel</button>
          <button style={{...S.btnExp,background:'#7c2d12'}} disabled={!scopedPpeMonthlyRows.length} onClick={exportPpeMonthlyPDF}>Export PDF</button>
          <button style={{...S.btnExp,background:'#1d4ed8'}} disabled={!scopedPpeMonthlyRows.length||exportingPpeDocx} onClick={exportPpeMonthlyDocx}>{exportingPpeDocx?'Preparing…':'Export Word (Letterhead)'}</button>
        </div>
      </div>

      {scopedPpeMonthlyRows.length>0 && (
        <div style={{margin:'14px',padding:'12px 16px',borderRadius:'10px',border:'1px solid #fde68a',background:'#fffbeb'}}>
          <div style={{fontSize:'12.5px',color:'#78350f',marginBottom:'6px'}}>{scopedPpeMonthlyRows.length} row(s){ppeReportMonthFilter?` in ${monthLabelFor(ppeReportMonthFilter)}`:' across all months'}</div>
          <div style={{fontSize:'15px',fontWeight:800,color:'#92400e'}}>Total: AED {fmt2(ppeMonthlyReportTotals.total)} <span style={{fontSize:'12px',fontWeight:600,color:'#78350f'}}>(Coverall {ppeMonthlyReportTotals.coverall} · Shoes {ppeMonthlyReportTotals.shoes} · Goggles {ppeMonthlyReportTotals.goggles})</span></div>
        </div>
      )}

      <div className="drag-scroll tbl-sticky-scrollbox" style={{overflowX:'auto',overflowY:'auto',maxHeight:'480px'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
          <thead className="tbl-sticky-th"><tr>{['Emp ID','Name','Month','Coverall Qty','Shoes Qty','Goggles Qty','Total (AED)'].map(h=><th key={h} style={{...S.th,position:'sticky',top:0,zIndex:'12',background:'#f8fafc',boxShadow:'0 1px 0 #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>
            {scopedPpeMonthlyRows.length===0
              ? <tr><td colSpan={7} style={{padding:'24px',textAlign:'center',color:'#94a3b8'}}>No PPE issuance data for this selection.</td></tr>
              : scopedPpeMonthlyRows.map((r,i)=>(
                <tr key={i} style={{borderTop:'1px solid #f1f5f9'}}>
                  <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{r.employee_id}</td>
                  <td style={{...S.td,fontWeight:600,whiteSpace:'normal'}}>{r.full_name}</td>
                  <td style={S.td}>{monthLabelFor(r.month)}</td>
                  <td style={S.td}>{r.coverall_qty||'—'}</td>
                  <td style={S.td}>{r.shoes_qty||'—'}</td>
                  <td style={S.td}>{r.goggles_qty||'—'}</td>
                  <td style={{...S.td,fontWeight:700,color:'#92400e'}}>{fmt2(r.total_cost)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

// ── HIRING PIPELINE HISTORY ────────────────────────────────────────
// Read-mostly historical reference table imported from the recruitment master sheets
// (Tracking List, Mission Visa RG, Mission Visa AURA). Not tied to any employee_id/P&L —
// many rows predate the current employee_id scheme and use their own old EMP No numbering.
const HIRING_DATE_FIELDS = [
  ['document_received_date','Doc Received'],['visit_visa_apply_date','Visit Visa Apply'],
  ['visit_visa_received_date','Visit Visa Received'],['visit_visa_send_date','Visit Visa Sent'],
  ['ticket_arrival_date','Ticket & Arrival'],['employment_visa_apply_date','Employment Visa Apply'],
  ['employment_visa_received_date','Employment Visa Received'],['date_of_joining','Date of Joining'],
  ['visa_medical_date','Visa Medical'],['emirates_id_date','Emirates ID'],['cicpa_apply_date','CICPA Apply'],
  ['adnoc_medical_date','ADNOC Medical'],['daman_insurance_apply_date','Daman Insurance'],
  ['visa_stamping_date','Visa Stamping'],['bank_account_open_date','Bank Account Open'],
];
