// CompanyExpenses.jsx — SATCO Finance Portal
// UMD / Babel standalone style — matches part1-6 pattern
// Registers: window.CompanyExpensesSection (picked up by App in part6)

(function () {
  const { useState, useEffect, useCallback } = React;
  // Use the shared 'db' client created in part1 (same as all other tabs)

  // ── Constants ──────────────────────────────────────────────
  const CATEGORIES = [
    "Rent","Commission","Bank Charges","PRO / Govt Fees",
    "Office Supplies","Utilities","Insurance","Vehicle / Fuel",
    "Marketing","Legal / Audit","Other",
  ];
  const PAYMENT_MODES = ["Bank Transfer","Cheque","Cash","Card"];
  const EMPTY = {
    expense_date: new Date().toISOString().slice(0,10),
    category:"", sub_category:"", payee:"",
    amount_aed:"", payment_mode:"", reference_no:"",
    recoverable: false, recovered_amount:"", client_id:"", notes:"",
  };

  const fmt = n => Number(n||0).toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2});

  function monthOptions() {
    const opts=[]; const now=new Date();
    for(let i=0;i<12;i++){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      opts.push(d.toISOString().slice(0,7));
    }
    return opts;
  }

  function catColor(cat){
    const map={"Rent":"#1e40af","Commission":"#7c3aed","Bank Charges":"#0369a1",
      "PRO / Govt Fees":"#0f766e","Office Supplies":"#854d0e","Utilities":"#1d4ed8",
      "Insurance":"#0e7490","Vehicle / Fuel":"#4338ca","Marketing":"#be185d",
      "Legal / Audit":"#b45309","Other":"#6b7280"};
    return map[cat]||"#6b7280";
  }

  // ── Field wrapper ───────────────────────────────────────────
  function Field({label,children}){
    return (
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <label style={{fontSize:12,fontWeight:700,color:"#374151"}}>{label}</label>
        {React.cloneElement(children,{style:{
          padding:"7px 10px",border:"1px solid #d1d5db",borderRadius:8,
          fontSize:13,width:"100%",boxSizing:"border-box",
          ...(children.props.style||{})
        }})}
      </div>
    );
  }

  function Th({children,align="left"}){
    return <th style={{padding:"8px 10px",textAlign:align,fontWeight:700,fontSize:12,
      color:"#374151",borderBottom:"2px solid #e5e7eb",whiteSpace:"nowrap"}}>{children}</th>;
  }
  function Td({children,align="left",bold,color}){
    return <td style={{padding:"7px 10px",borderBottom:"1px solid #f3f4f6",
      textAlign:align,fontWeight:bold?700:400,color:color||"inherit",whiteSpace:"nowrap"}}>{children}</td>;
  }
  function Chip({label,value,color}){
    return(
      <div style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:"8px 18px"}}>
        <div style={{fontSize:11,color:"#6b7280",marginBottom:2}}>{label}</div>
        <div style={{fontSize:17,fontWeight:800,color}}>{value}</div>
      </div>
    );
  }
  function ActionBtn({children,onClick,color="#1a56db",small}){
    return(
      <button onClick={onClick} style={{
        background:color,color:"#fff",border:"none",borderRadius:small?5:8,
        padding:small?"3px 9px":"8px 20px",fontSize:small?11:13,
        cursor:"pointer",fontWeight:700
      }}>{children}</button>
    );
  }

  // ── Main component ──────────────────────────────────────────
  function CompanyExpenses(){
    const [rows,setRows]=useState([]);
    const [summary,setSummary]=useState([]);
    const [loading,setLoading]=useState(false);
    const [saving,setSaving]=useState(false);
    const [err,setErr]=useState(null);
    const [view,setView]=useState("ledger"); // ledger | summary | form
    const [filterMonth,setFilterMonth]=useState(new Date().toISOString().slice(0,7));
    const [filterCat,setFilterCat]=useState("All");
    const [form,setForm]=useState(EMPTY);
    const [editId,setEditId]=useState(null);
    const [deleteId,setDeleteId]=useState(null);

    const fetchRows=useCallback(async()=>{
      setLoading(true); setErr(null);
      let q=db.from("company_expenses").select("*")
        .eq("month_year",filterMonth).order("expense_date",{ascending:false});
      if(filterCat!=="All") q=q.eq("category",filterCat);
      const {data,error}=await q;
      if(error) setErr(error.message); else setRows(data||[]);
      setLoading(false);
    },[filterMonth,filterCat]);

    const fetchSummary=useCallback(async()=>{
      const {data,error}=await db.from("company_expenses_monthly_summary")
        .select("*").order("month_year",{ascending:false});
      if(!error) setSummary(data||[]);
    },[]);

    useEffect(()=>{fetchRows();fetchSummary();},[fetchRows,fetchSummary]);

    const handleSave=async()=>{
      if(!form.category||!form.amount_aed||!form.expense_date){
        setErr("Date, Category and Amount are required."); return;
      }
      setSaving(true); setErr(null);
      const payload={
        expense_date:form.expense_date, category:form.category,
        sub_category:form.sub_category||null, payee:form.payee||null,
        amount_aed:parseFloat(form.amount_aed),
        payment_mode:form.payment_mode||null, reference_no:form.reference_no||null,
        recoverable:form.recoverable,
        recovered_amount:form.recoverable?parseFloat(form.recovered_amount||0):0,
        client_id:form.recoverable?form.client_id||null:null,
        notes:form.notes||null,
      };
      let error;
      if(editId){
        ({error}=await db.from("company_expenses").update(payload).eq("id",editId));
      } else {
        ({error}=await db.from("company_expenses").insert(payload));
      }
      setSaving(false);
      if(error){ setErr(error.message); }
      else{ setForm(EMPTY); setEditId(null); setView("ledger"); fetchRows(); fetchSummary(); }
    };

    const startEdit=row=>{
      setForm({
        expense_date:row.expense_date, category:row.category,
        sub_category:row.sub_category||"", payee:row.payee||"",
        amount_aed:row.amount_aed, payment_mode:row.payment_mode||"",
        reference_no:row.reference_no||"", recoverable:row.recoverable,
        recovered_amount:row.recovered_amount||"",
        client_id:row.client_id||"", notes:row.notes||"",
      });
      setEditId(row.id); setView("form");
    };

    const handleDelete=async()=>{
      if(!deleteId) return;
      await db.from("company_expenses").delete().eq("id",deleteId);
      setDeleteId(null); fetchRows(); fetchSummary();
    };

    const totalAed=rows.reduce((s,r)=>s+parseFloat(r.amount_aed||0),0);
    const totalRec=rows.reduce((s,r)=>s+parseFloat(r.recovered_amount||0),0);
    const netCost=totalAed-totalRec;

    return (
      <div style={{padding:"0 0 32px"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <h2 style={{margin:0,fontSize:20,fontWeight:900,letterSpacing:"-.03em"}}>🏢 Company Expenses</h2>
            <p style={{margin:"3px 0 0",color:"#64748b",fontSize:12.5}}>
              Rent · Commissions · Bank Charges · PRO Fees · Office Overheads
            </p>
          </div>
          <button onClick={()=>{setForm(EMPTY);setEditId(null);setView("form");}}
            style={{background:"#0f172a",color:"#fff",border:"none",borderRadius:10,
              padding:"10px 20px",cursor:"pointer",fontWeight:800,fontSize:13}}>
            + Add Expense
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {[["ledger","📋 Ledger"],["summary","📊 Monthly Summary"]].map(([key,label])=>(
            <button key={key} onClick={()=>setView(key)} style={{
              padding:"7px 18px",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,
              background:view===key?"#0f172a":"#f1f5f9",color:view===key?"#fff":"#374151"
            }}>{label}</button>
          ))}
        </div>

        {err&&<div style={{background:"#fee2e2",color:"#b91c1c",padding:"8px 14px",borderRadius:8,marginBottom:12,fontSize:13}}>⚠ {err}</div>}

        {/* ── ADD / EDIT FORM ── */}
        {view==="form"&&(
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:16,padding:20,marginBottom:20}}>
            <h3 style={{margin:"0 0 16px",fontWeight:800}}>{editId?"✏️ Edit Expense":"➕ New Expense"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
              <Field label="Date *">
                <input type="date" value={form.expense_date}
                  onChange={e=>setForm({...form,expense_date:e.target.value})}/>
              </Field>
              <Field label="Category *">
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Sub-category">
                <input type="text" placeholder="e.g. Office Lease – MBZ" value={form.sub_category}
                  onChange={e=>setForm({...form,sub_category:e.target.value})}/>
              </Field>
              <Field label="Payee / Vendor">
                <input type="text" placeholder="e.g. Al Farida Real Estate" value={form.payee}
                  onChange={e=>setForm({...form,payee:e.target.value})}/>
              </Field>
              <Field label="Amount (AED) *">
                <input type="number" min="0" step="0.01" value={form.amount_aed}
                  onChange={e=>setForm({...form,amount_aed:e.target.value})}/>
              </Field>
              <Field label="Payment Mode">
                <select value={form.payment_mode} onChange={e=>setForm({...form,payment_mode:e.target.value})}>
                  <option value="">Select…</option>
                  {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Reference / Cheque No.">
                <input type="text" value={form.reference_no}
                  onChange={e=>setForm({...form,reference_no:e.target.value})}/>
              </Field>
              <Field label="Notes">
                <input type="text" value={form.notes}
                  onChange={e=>setForm({...form,notes:e.target.value})}/>
              </Field>
              <Field label="Recoverable from Client?">
                <div style={{paddingTop:6,border:"none",background:"none"}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
                    <input type="checkbox" checked={form.recoverable}
                      onChange={e=>setForm({...form,recoverable:e.target.checked})}
                      style={{width:16,height:16}}/>
                    Yes — recoverable
                  </label>
                </div>
              </Field>
              {form.recoverable&&<>
                <Field label="Recovered Amount (AED)">
                  <input type="number" min="0" step="0.01" value={form.recovered_amount}
                    onChange={e=>setForm({...form,recovered_amount:e.target.value})}/>
                </Field>
                <Field label="Client">
                  <input type="text" placeholder="Client name / code" value={form.client_id}
                    onChange={e=>setForm({...form,client_id:e.target.value})}/>
                </Field>
              </>}
            </div>
            <div style={{marginTop:16,display:"flex",gap:10}}>
              <ActionBtn onClick={handleSave} disabled={saving}>
                {saving?"Saving…":editId?"Update":"Save"}
              </ActionBtn>
              <ActionBtn onClick={()=>{setView("ledger");setForm(EMPTY);setEditId(null);setErr(null);}}
                color="#64748b">Cancel</ActionBtn>
            </div>
          </div>
        )}

        {/* ── LEDGER ── */}
        {view==="ledger"&&<>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
              style={{padding:"7px 12px",borderRadius:8,border:"1px solid #d1d5db",fontWeight:700,fontSize:13}}>
              {monthOptions().map(m=><option key={m}>{m}</option>)}
            </select>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
              style={{padding:"7px 12px",borderRadius:8,border:"1px solid #d1d5db",fontWeight:700,fontSize:13}}>
              <option value="All">All Categories</option>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <Chip label="Total Spent" value={"AED "+fmt(totalAed)} color="#1e40af"/>
            <Chip label="Recovered" value={"AED "+fmt(totalRec)} color="#065f46"/>
            <Chip label="Net Cost" value={"AED "+fmt(netCost)} color={netCost>0?"#9a3412":"#065f46"}/>
            <Chip label="Entries" value={rows.length} color="#374151"/>
          </div>

          {loading?<p style={{color:"#64748b"}}>Loading…</p>
          :rows.length===0?<p style={{color:"#64748b"}}>No expenses for {filterMonth}{filterCat!=="All"?" · "+filterCat:""}.</p>
          :(
            <div style={{overflowX:"auto",borderRadius:14,border:"1px solid #e2e8f0",background:"#fff"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    <Th>Date</Th><Th>Category</Th><Th>Sub-cat</Th><Th>Payee</Th>
                    <Th align="right">Amount (AED)</Th><Th>Mode</Th><Th>Ref</Th>
                    <Th align="right">Recovered</Th><Th>Notes</Th><Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>(
                    <tr key={r.id} style={{background:i%2===0?"#fff":"#f9fafb"}}>
                      <Td>{r.expense_date}</Td>
                      <Td>
                        <span style={{background:catColor(r.category),color:"#fff",
                          padding:"2px 9px",borderRadius:999,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                          {r.category}
                        </span>
                      </Td>
                      <Td>{r.sub_category||"—"}</Td>
                      <Td>{r.payee||"—"}</Td>
                      <Td align="right" bold>{fmt(r.amount_aed)}</Td>
                      <Td>{r.payment_mode||"—"}</Td>
                      <Td>{r.reference_no||"—"}</Td>
                      <Td align="right" color={parseFloat(r.recovered_amount)>0?"#065f46":"#9ca3af"}>
                        {r.recoverable?fmt(r.recovered_amount):"—"}
                      </Td>
                      <Td>{r.notes||"—"}</Td>
                      <Td>
                        <div style={{display:"flex",gap:4}}>
                          <ActionBtn onClick={()=>startEdit(r)} small>Edit</ActionBtn>
                          <ActionBtn onClick={()=>setDeleteId(r.id)} color="#dc2626" small>Del</ActionBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>}

        {/* ── MONTHLY SUMMARY ── */}
        {view==="summary"&&<>
          <h3 style={{margin:"0 0 14px",fontWeight:800}}>Monthly Expense Summary — All Categories</h3>
          {summary.length===0?<p style={{color:"#64748b"}}>No data yet.</p>:(
            <div style={{overflowX:"auto",borderRadius:14,border:"1px solid #e2e8f0",background:"#fff"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    <Th>Month</Th><Th>Category</Th><Th align="center">Entries</Th>
                    <Th align="right">Total (AED)</Th><Th align="right">Recovered (AED)</Th><Th align="right">Net Cost (AED)</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r,i)=>(
                    <tr key={i} style={{background:i%2===0?"#fff":"#f9fafb"}}>
                      <Td><b>{r.month_year}</b></Td>
                      <Td>
                        <span style={{background:catColor(r.category),color:"#fff",
                          padding:"2px 9px",borderRadius:999,fontSize:11,fontWeight:700}}>
                          {r.category}
                        </span>
                      </Td>
                      <Td align="center">{r.entry_count}</Td>
                      <Td align="right">{fmt(r.total_aed)}</Td>
                      <Td align="right" color="#065f46">{fmt(r.total_recovered)}</Td>
                      <Td align="right" bold color={r.net_cost>0?"#9a3412":"#065f46"}>{fmt(r.net_cost)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>}

        {/* ── DELETE CONFIRM ── */}
        {deleteId&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
            display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
            <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:340,
              textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,.18)"}}>
              <p style={{fontWeight:800,fontSize:16,margin:"0 0 6px"}}>Delete this expense?</p>
              <p style={{color:"#6b7280",fontSize:13,margin:"0 0 20px"}}>This cannot be undone.</p>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <ActionBtn onClick={handleDelete} color="#dc2626">Delete</ActionBtn>
                <ActionBtn onClick={()=>setDeleteId(null)} color="#64748b">Cancel</ActionBtn>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── Expose as global function for part6 App ──────────────
  window.CompanyExpensesSection = CompanyExpenses;

})();
