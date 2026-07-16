function normalizeName(n) {
  return (n||'').toLowerCase().replace(/[^a-z\s]/g,'').replace(/\s+/g,' ').trim();
}
function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na||!nb) return 0;
  if (na===nb) return 1;
  const wa = na.split(' '), wb = nb.split(' ');
  let m = 0;
  wa.forEach(w=>{ if (w.length>2 && wb.some(x=>x.includes(w)||w.includes(x))) m++; });
  return m / Math.max(wa.length, wb.length);
}
function bestMatch(clientName, empList) {
  let best=null, bestScore=0;
  empList.forEach(e=>{
    const s = nameSimilarity(clientName, e.full_name);
    if (s>bestScore) { bestScore=s; best=e; }
  });
  return { emp: best, score: bestScore };
}

// ── PDF/Image → base64 ───────────────────────────────────────────
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Month calendar helpers ────────────────────────────────────────
// Returns array of day numbers that are Sundays in a given YYYY-MM
function getSundaysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const sundays = [];
  for (let d = 1; d <= days; d++) {
    if (new Date(y, m-1, d).getDay() === 5) sundays.push(d); // Friday = UAE weekend
  }
  return sundays;
}
function getDayOfWeek(yearMonth, day) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m-1, day).getDay(); // 0=Sun,5=Fri,6=Sat
}
function getDayName(dayIndex) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayIndex];
}
function totalDaysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Storage key for month calendar data
function calendarKey(yearMonth) { return `satco_cal_${yearMonth}`; }
function loadCalendar(yearMonth) {
  try {
    const raw = localStorage.getItem(calendarKey(yearMonth));
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return { publicHolidays: [], weekendDay: 0 }; // SATCO rule: Sunday rest day = 0, paid at 1.5x when worked
}
function saveCalendar(yearMonth, data) {
  try { localStorage.setItem(calendarKey(yearMonth), JSON.stringify(data)); } catch(_) {}
}

// ── MonthCalendarPanel ────────────────────────────────────────────
function MonthCalendarPanel({ yearMonth, onClose }) {
  const [cal, setCal] = React.useState(()=>loadCalendar(yearMonth));
  const [weekendDay, setWeekendDay] = React.useState(cal.weekendDay ?? 0);
  const [holidayInput, setHolidayInput] = React.useState('');
  const [holidayName, setHolidayName] = React.useState('');

  const totalDays = totalDaysInMonth(yearMonth);
  const days = Array.from({length: totalDays}, (_, i) => i+1);

  const isWeekend = (d) => getDayOfWeek(yearMonth, d) === weekendDay;
  const isHoliday = (d) => (cal.publicHolidays||[]).some(h=>h.day===d);
  const getHolidayName = (d) => (cal.publicHolidays||[]).find(h=>h.day===d)?.name || '';

  const toggleHoliday = (d) => {
    const existing = (cal.publicHolidays||[]).find(h=>h.day===d);
    let updated;
    if (existing) {
      updated = (cal.publicHolidays||[]).filter(h=>h.day!==d);
    } else {
      const name = window.prompt(`Public holiday name for Day ${d}?`, '');
      if (name===null) return;
      updated = [...(cal.publicHolidays||[]), {day:d, name: name||`Holiday Day ${d}`}];
    }
    const newCal = {...cal, publicHolidays: updated, weekendDay};
    setCal(newCal);
    saveCalendar(yearMonth, newCal);
  };

  const updateWeekend = (wd) => {
    setWeekendDay(wd);
    const newCal = {...cal, weekendDay: wd};
    setCal(newCal);
    saveCalendar(yearMonth, newCal);
  };

  const [y, m] = yearMonth.split('-');
  const monthName = new Date(Number(y), Number(m)-1, 1).toLocaleString('default',{month:'long'});

  const holidayCount = (cal.publicHolidays||[]).length;
  const weekendCount = days.filter(d=>isWeekend(d)).length;
  const workingDays = totalDays - weekendCount - holidayCount;

  return (
    <div style={{background:'#fff',border:'2px solid #2563eb',borderRadius:'12px',padding:'20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <div style={{fontWeight:800,fontSize:'16px'}}>📅 {monthName} {y} — Month Calendar</div>
          <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>
            Mark public holidays. Weekends auto-calculated. These apply to all timesheet and idle day calculations this month.
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <div style={{fontSize:'12.5px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'6px 12px'}}>
            <strong style={{color:'#166534'}}>{workingDays}</strong> <span style={{color:'#64748b'}}>working days</span>
            <span style={{margin:'0 8px',color:'#e2e8f0'}}>|</span>
            <strong style={{color:'#d97706'}}>{weekendCount}</strong> <span style={{color:'#64748b'}}>weekends</span>
            <span style={{margin:'0 8px',color:'#e2e8f0'}}>|</span>
            <strong style={{color:'#7c3aed'}}>{holidayCount}</strong> <span style={{color:'#64748b'}}>public holidays</span>
          </div>
          {onClose && <button onClick={onClose} style={{...S.btnSec}}>✓ Done</button>}
        </div>
      </div>

      {/* Weekend day selector */}
      <div style={{marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
        <span style={{fontSize:'12.5px',fontWeight:700,color:'#475569'}}>Weekend / Rest day:</span>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((nm,i)=>(
          <label key={i} style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer',fontSize:'12.5px',
            background:weekendDay===i?'#7c3aed':'#f8fafc',color:weekendDay===i?'#fff':'#475569',
            padding:'4px 10px',borderRadius:'6px',border:'1px solid '+(weekendDay===i?'#7c3aed':'#e2e8f0'),fontWeight:weekendDay===i?700:400}}>
            <input type="radio" name="weekend" style={{display:'none'}} checked={weekendDay===i} onChange={()=>updateWeekend(i)}/>
            {nm}
          </label>
        ))}
        <span style={{fontSize:'11.5px',color:'#94a3b8'}}>(UAE standard: Friday)</span>
      </div>

      {/* Calendar grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'14px'}}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
          <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:700,color:'#94a3b8',padding:'4px 0'}}>{d}</div>
        ))}
        {/* Empty cells for offset */}
        {Array.from({length: getDayOfWeek(yearMonth, 1)}, (_, i)=>(
          <div key={`e${i}`}/>
        ))}
        {days.map(d=>{
          const wd = isWeekend(d);
          const ph = isHoliday(d);
          const phName = getHolidayName(d);
          return (
            <div key={d} onClick={()=>!wd && toggleHoliday(d)}
              title={wd ? `Weekend (${getDayName(getDayOfWeek(yearMonth,d))})` : ph ? `Public Holiday: ${phName} (click to remove)` : 'Click to mark as public holiday'}
              style={{
                textAlign:'center',padding:'6px 2px',borderRadius:'6px',cursor:wd?'default':'pointer',
                border:'1px solid '+(ph?'#7c3aed':wd?'#e2e8f0':'#e2e8f0'),
                background: ph?'#f3e8ff' : wd?'#fef3c7':'#fff',
                position:'relative',
              }}>
              <div style={{fontWeight:700,fontSize:'13px',color:ph?'#7c3aed':wd?'#d97706':'#0f172a'}}>{d}</div>
              <div style={{fontSize:'9px',color:ph?'#7c3aed':wd?'#d97706':'#94a3b8',lineHeight:'1.1',marginTop:'1px'}}>
                {ph ? phName.slice(0,8) : getDayName(getDayOfWeek(yearMonth,d))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:'12px',fontSize:'11.5px',flexWrap:'wrap'}}>
        {[['#fff','#0f172a','Regular working day (click to mark as holiday)'],
          ['#fef3c7','#d97706','Weekend / Rest day (auto-calculated)'],
          ['#f3e8ff','#7c3aed','Public Holiday (click to remove)']].map(([bg,c,label])=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <div style={{width:'14px',height:'14px',borderRadius:'3px',background:bg,border:'1px solid '+c+'88'}}/>
            <span style={{color:'#64748b'}}>{label}</span>
          </div>
        ))}
      </div>

      {/* Holidays list */}
      {(cal.publicHolidays||[]).length > 0 && (
        <div style={{marginTop:'14px',paddingTop:'14px',borderTop:'1px solid #e2e8f0'}}>
          <div style={{fontWeight:700,fontSize:'12.5px',color:'#7c3aed',marginBottom:'8px'}}>
            🗓 Public Holidays this month:
          </div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            {[...(cal.publicHolidays||[])].sort((a,b)=>a.day-b.day).map(h=>(
              <div key={h.day} style={{background:'#f3e8ff',border:'1px solid #c4b5fd',borderRadius:'8px',padding:'4px 12px',fontSize:'12px'}}>
                <strong style={{color:'#7c3aed'}}>Day {h.day}</strong>
                <span style={{color:'#6d28d9',marginLeft:'6px'}}>{h.name}</span>
                <button onClick={()=>toggleHoliday(h.day)} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',marginLeft:'6px',fontSize:'11px',padding:'0'}}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── IdleDaysPanel ─────────────────────────────────────────────────
function IdleDaysPanel({ yearMonth, employees, hrSalaryRows, onClose }) {
  const [idleData, setIdleData] = React.useState({}); // {empId: [{day, reason, clientAgreed}]}
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [selectedEmp, setSelectedEmp] = React.useState(null);
  const [search, setSearch] = React.useState('');

  const totalDays = totalDaysInMonth(yearMonth);
  const days = Array.from({length:totalDays},(_,i)=>i+1);
  const cal = loadCalendar(yearMonth);
  const isWeekend = (d) => getDayOfWeek(yearMonth, d) === (cal.weekendDay ?? 0);
  const isHoliday = (d) => (cal.publicHolidays||[]).some(h=>h.day===d);
  const isOff = (d) => isWeekend(d) || isHoliday(d);

  const hrSalaryByEmp = React.useMemo(()=>salaryMapFromRows(hrSalaryRows||[]), [hrSalaryRows]);

  // Load existing idle data from Supabase
  const load = async () => {
    setLoading(true);
    const monthStart = yearMonth + '-01';
    try {
      const { data } = await db.from('employee_idle_days').select('*').eq('month', monthStart);
      const map = {};
      (data||[]).forEach(r=>{
        if (!map[r.employee_id]) map[r.employee_id] = [];
        map[r.employee_id].push({day:r.day_number, reason:r.reason||'', clientAgreed:r.client_agreed||false, id:r.id});
      });
      setIdleData(map);
    } catch(_) {}
    setLoading(false);
  };
  React.useEffect(()=>{ load(); }, [yearMonth]);

  const toggleIdleDay = (empId, day) => {
    setIdleData(prev=>{
      const empDays = prev[empId]||[];
      const exists = empDays.find(d=>d.day===day);
      if (exists) {
        return {...prev, [empId]: empDays.filter(d=>d.day!==day)};
      } else {
        return {...prev, [empId]: [...empDays, {day, reason:'', clientAgreed:false}]};
      }
    });
  };

  const updateIdleDay = (empId, day, field, value) => {
    setIdleData(prev=>{
      const empDays = (prev[empId]||[]).map(d=>d.day===day?{...d,[field]:value}:d);
      return {...prev, [empId]: empDays};
    });
  };

  const saveIdle = async () => {
    setSaving(true);
    const monthStart = yearMonth + '-01';
    // Delete all existing idle records for this month then re-insert
    await db.from('employee_idle_days').delete().eq('month', monthStart);
    const toInsert = [];
    Object.entries(idleData).forEach(([empId, idleDays])=>{
      idleDays.forEach(d=>{
        toInsert.push({
          employee_id: empId,
          full_name: employees.find(e=>e.employee_id===empId)?.full_name||empId,
          month: monthStart,
          day_number: d.day,
          reason: d.reason||null,
          client_agreed: d.clientAgreed||false,
        });
      });
    });
    if (toInsert.length>0) await db.from('employee_idle_days').insert(toInsert);
    setSaving(false);
    alert('✅ Idle days saved.');
    load();
  };

  const filteredEmps = employees.filter(e=>!e.is_temp && (
    !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.employee_id?.toLowerCase().includes(search.toLowerCase())
  ));

  const [y,mo] = yearMonth.split('-');
  const monthName = new Date(Number(y),Number(mo)-1,1).toLocaleString('default',{month:'long'});

  return (
    <div style={{background:'#fff',border:'2px solid #0369a1',borderRadius:'12px',padding:'20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'16px',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <div style={{fontWeight:800,fontSize:'16px'}}>⏸ Idle Days — {monthName} {y}</div>
          <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px',maxWidth:'600px'}}>
            Employees deployed to client site but sitting idle (waiting for welding qualification certs, inspection clearance, etc.).
            Mark idle days per employee. If <strong>client agreed to pay</strong>, these are treated as normal working days for salary.
            If not agreed, they are tracked separately for negotiation.
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={saveIdle} disabled={saving} style={{...S.btnPri,background:'#0369a1',opacity:saving?0.6:1}}>
            {saving?'Saving…':'💾 Save Idle Days'}
          </button>
          {onClose && <button onClick={onClose} style={S.btnSec}>✓ Done</button>}
        </div>
      </div>

      {/* Info box */}
      <div style={{background:'#e0f2fe',border:'1px solid #7dd3fc',borderRadius:'8px',padding:'10px 14px',marginBottom:'14px',fontSize:'12.5px',color:'#0c4a6e'}}>
        <strong>How idle days work:</strong> Click any cell to mark a day as idle for that employee. Enter the reason (e.g. "Waiting for welding cert from BIS"). 
        Check <strong>"Client Agreed"</strong> if the client has confirmed they will pay for the idle period — these count as normal working days in the salary calculation and are included in client billing.
        Unconfirmed idle days are tracked but not paid until client approval.
      </div>

      <div style={{marginBottom:'12px',display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
        <input placeholder="Search employee…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{...S.input,width:'220px'}}/>
        <div style={{display:'flex',gap:'8px',fontSize:'12px',flexWrap:'wrap'}}>
          {[['#fef3c7','#d97706','Weekend/Holiday (not editable)'],
            ['#fee2e2','#dc2626','Idle – Client NOT agreed (tracked only)'],
            ['#dcfce7','#166534','Idle – Client Agreed (paid as normal day)'],
            ['#fff','#94a3b8','Normal working day']].map(([bg,c,label])=>(
            <div key={label} style={{display:'flex',alignItems:'center',gap:'5px'}}>
              <div style={{width:'12px',height:'12px',background:bg,border:'1px solid '+c+'88',borderRadius:'2px'}}/>
              <span style={{color:'#64748b'}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>Loading…</div> : (
        <div className="drag-scroll" style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'}}>
            <thead>
              <tr style={{background:'#f0f9ff'}}>
                <th style={{...S.th,position:'sticky',left:0,background:'#f0f9ff',zIndex:10,minWidth:'160px',textAlign:'left'}}>Employee</th>
                <th style={{...S.th,minWidth:'60px',textAlign:'center'}}>Idle Days</th>
                {days.map(d=>{
                  const wd = isWeekend(d);
                  const ph = isHoliday(d);
                  return (
                    <th key={d} style={{...S.th,padding:'4px 2px',minWidth:'28px',textAlign:'center',
                      background:ph?'#f3e8ff':wd?'#fef3c7':'#f0f9ff',
                      color:ph?'#7c3aed':wd?'#d97706':'#0369a1',fontSize:'10px'}}>
                      {d}
                      <div style={{fontSize:'8px',fontWeight:400,color:ph?'#7c3aed':wd?'#d97706':'#94a3b8'}}>
                        {getDayName(getDayOfWeek(yearMonth,d)).slice(0,1)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map(emp=>{
                const empIdle = idleData[emp.employee_id]||[];
                const idleCount = empIdle.length;
                const agreedCount = empIdle.filter(d=>d.clientAgreed).length;
                return (
                  <React.Fragment key={emp.employee_id}>
                    <tr style={{borderBottom:'1px solid #e0f2fe'}}>
                      <td style={{...S.td,position:'sticky',left:0,background:'#fff',zIndex:5,fontWeight:700,minWidth:'160px',padding:'5px 8px'}}>
                        <div style={{fontFamily:'ui-monospace,monospace',color:'#0369a1',fontSize:'11px'}}>{emp.employee_id}</div>
                        <div style={{color:'#0f172a',fontSize:'12px'}}>{emp.full_name}</div>
                        {idleCount>0 && (
                          <div style={{fontSize:'10px',marginTop:'2px'}}>
                            <span style={{color:'#dc2626'}}>{idleCount} idle</span>
                            {agreedCount>0 && <span style={{color:'#166534',marginLeft:'4px'}}>({agreedCount} agreed)</span>}
                          </div>
                        )}
                      </td>
                      <td style={{...S.td,textAlign:'center',fontWeight:700,
                        color:idleCount>0?'#dc2626':'#94a3b8'}}>
                        {idleCount>0?idleCount:'—'}
                      </td>
                      {days.map(d=>{
                        const off = isOff(d);
                        const idle = empIdle.find(x=>x.day===d);
                        const bg = off?(isHoliday(d)?'#f3e8ff':'#fef9ec'):idle?(idle.clientAgreed?'#dcfce7':'#fee2e2'):'#fff';
                        const cursor = off?'default':'pointer';
                        return (
                          <td key={d} onClick={()=>!off&&toggleIdleDay(emp.employee_id,d)}
                            title={off?'Weekend/Holiday — not editable':idle?`Idle: ${idle.reason||'no reason'} | Client: ${idle.clientAgreed?'✅ Agreed':'❌ Not agreed'}`:'Click to mark as idle'}
                            style={{padding:'2px',background:bg,cursor,textAlign:'center',border:'1px solid #e0f2fe'}}>
                            {idle && (
                              <div style={{fontSize:'9px',fontWeight:700,color:idle.clientAgreed?'#166534':'#dc2626',lineHeight:'1'}}>
                                {idle.clientAgreed?'✓':'!'}
                              </div>
                            )}
                            {off && !idle && <div style={{fontSize:'8px',color:'#cbd5e1'}}>—</div>}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Expanded row for idle day details when employee is selected */}
                    {selectedEmp===emp.employee_id && empIdle.length>0 && (
                      <tr>
                        <td colSpan={totalDays+2} style={{padding:'8px 12px',background:'#f0f9ff',borderBottom:'2px solid #7dd3fc'}}>
                          <div style={{fontWeight:700,fontSize:'12px',color:'#0369a1',marginBottom:'8px'}}>
                            Edit Idle Days — {emp.full_name}
                          </div>
                          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                            {[...empIdle].sort((a,b)=>a.day-b.day).map(idle=>(
                              <div key={idle.day} style={{background:'#fff',border:'1px solid #7dd3fc',borderRadius:'8px',padding:'8px 12px',minWidth:'200px'}}>
                                <div style={{fontWeight:700,fontSize:'12px',marginBottom:'6px',color:'#0369a1'}}>
                                  Day {idle.day} ({getDayName(getDayOfWeek(yearMonth,idle.day))})
                                </div>
                                <div style={{marginBottom:'6px'}}>
                                  <label style={{...S.label,fontSize:'11px'}}>Reason</label>
                                  <input type="text" value={idle.reason||''} placeholder="e.g. Waiting for welding cert"
                                    onChange={e=>updateIdleDay(emp.employee_id,idle.day,'reason',e.target.value)}
                                    style={{...S.input,width:'100%',fontSize:'11.5px',padding:'4px 8px'}}/>
                                </div>
                                <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,
                                  color:idle.clientAgreed?'#166534':'#dc2626'}}>
                                  <input type="checkbox" checked={idle.clientAgreed||false}
                                    onChange={e=>updateIdleDay(emp.employee_id,idle.day,'clientAgreed',e.target.checked)}/>
                                  {idle.clientAgreed ? '✅ Client Agreed to Pay' : '❌ Client NOT Agreed'}
                                </label>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Click row to expand */}
      <div style={{marginTop:'10px',fontSize:'11.5px',color:'#94a3b8',textAlign:'center'}}>
        Tip: Click an employee's name row to edit reasons and client agreement for their idle days.
        <br/>After editing, click <strong>Save Idle Days</strong> to store.
      </div>
      <div style={{marginTop:'8px',display:'flex',justifyContent:'center'}}>
        {filteredEmps.map(emp=>(
          empIdle(emp)>0 && (
            <button key={emp.employee_id} onClick={()=>setSelectedEmp(s=>s===emp.employee_id?null:emp.employee_id)}
              style={{...S.btnSec,fontSize:'12px',padding:'4px 10px',margin:'2px'}}>
              {emp.full_name.split(' ')[0]} ({(idleData[emp.employee_id]||[]).length})
            </button>
          )
        ))}
      </div>
      {/* Quick expand buttons for employees with idle days */}
      <div style={{marginTop:'8px',display:'flex',gap:'6px',flexWrap:'wrap'}}>
        {filteredEmps.filter(emp=>(idleData[emp.employee_id]||[]).length>0).map(emp=>(
          <button key={emp.employee_id} onClick={()=>setSelectedEmp(s=>s===emp.employee_id?null:emp.employee_id)}
            style={{...S.btnSec,fontSize:'12px',padding:'5px 12px',
              background:selectedEmp===emp.employee_id?'#0369a1':'#fff',
              color:selectedEmp===emp.employee_id?'#fff':'#0369a1'}}>
            ✏️ {emp.full_name.split(' ')[0]} ({(idleData[emp.employee_id]||[]).length} idle)
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main SalaryPipelineTab ────────────────────────────────────────
function SalaryPipelineTab({ employees, empMeta, hrSalaryRows }) {
  const [selectedMonth, setSelectedMonth] = React.useState(()=>{
    const d = new Date(); d.setMonth(d.getMonth()-1);
    return d.toISOString().slice(0,7);
  });
  const [pipeline, setPipeline] = React.useState([]);
  const [pipelineLoading, setPipelineLoading] = React.useState(false);
  const [activePanel, setActivePanel] = React.useState(null); // null | 'calendar' | 'idle' | 'timesheet'

  // Bulk PDF OCR state
  const [step, setStep] = React.useState('pipeline');
  const [pdfFile, setPdfFile] = React.useState(null);
  const [ocrProgress, setOcrProgress] = React.useState('');
  const [extractedRows, setExtractedRows] = React.useState([]);
  const [matchedRows, setMatchedRows] = React.useState([]);
  const [bulkSaving, setBulkSaving] = React.useState(false);
  const [savedCount, setSavedCount] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [detectedPeriod, setDetectedPeriod] = React.useState(null);

  const hrSalaryByEmp = React.useMemo(()=>salaryMapFromRows(hrSalaryRows||[]), [hrSalaryRows]);

  const loadPipeline = async () => {
    if (!selectedMonth) return;
    setPipelineLoading(true);
    const monthStart = selectedMonth + '-01';
    const [wpsPaid, actualMonthly, salaryProfiles, wpsMaster, idleRec] = await Promise.all([
      db.from('wps_salary_monthly').select('employee_id,gross_salary,net_salary,wps_basic,wps_ot_allowance,basic_salary,fixed_allowance,salary_month').eq('salary_month', monthStart),
      db.from('employee_monthly_costs').select('employee_id,salary_type,salary,computed_salary,salary_deductions,arrears,remarks').like('month', selectedMonth + '%'),
      db.from('employee_salary_profiles').select('employee_id,full_name,basic_salary,fixed_allowance,hours_per_day'),
      db.from('wps_employee_master').select('employee_id,full_name,basic_salary,fixed_allowance,hours_per_day'),
      db.from('employee_idle_days').select('employee_id,day_number,client_agreed').eq('month', monthStart).catch(()=>({data:[]})),
    ]);
    const profileMap = {};
    (salaryProfiles.data||[]).forEach(r=>{ profileMap[r.employee_id]=r; });
    (wpsMaster.data||[]).forEach(r=>{ if (!profileMap[r.employee_id]) profileMap[r.employee_id]=r; });
    Object.values(hrSalaryByEmp).forEach(r=>{ if (!profileMap[r.employee_id]) profileMap[r.employee_id]=r; });
    const wpsMap = {};
    (wpsPaid.data||[]).forEach(r=>{ wpsMap[r.employee_id]=r; });
    const actualMap = {};
    (actualMonthly.data||[]).forEach(r=>{
      const st = String(r.salary_type || '').toLowerCase();
      if (st.includes('wps_bank') || st.includes('wps_salary_sheet')) return;
      actualMap[r.employee_id]=r;
    });
    const idleMap = {};
    (idleRec.data||[]).forEach(r=>{
      if (!idleMap[r.employee_id]) idleMap[r.employee_id]={total:0,agreed:0};
      idleMap[r.employee_id].total++;
      if (r.client_agreed) idleMap[r.employee_id].agreed++;
    });

    const rows = employees.filter(e=>!e.is_temp).map(e=>{
      const wps = wpsMap[e.employee_id];
      const actual = actualMap[e.employee_id];
      let status = 'not_started';
      if (wps && actual) status = 'settled';
      else if (wps) status = 'wps_pending_ts';
      else if (actual) status = 'actual_no_wps';
      return { ...e, wps, actual, status,
        wpsGross: wps ? Number(wps.net_salary || wps.gross_salary || ((Number(wps.wps_basic)||0)+(Number(wps.wps_ot_allowance)||0)))||0 : null,
        actualSalary: actual ? Number(actual.computed_salary || actual.salary)||0 : null,
        profile: profileMap[e.employee_id]||{},
        idle: idleMap[e.employee_id]||null,
      };
    });
    setPipeline(rows);
    setPipelineLoading(false);
  };

  React.useEffect(()=>{ loadPipeline(); }, [selectedMonth]);

  const cal = loadCalendar(selectedMonth);
  const publicHolidayCount = (cal.publicHolidays||[]).length;
  const weekendCount = Array.from({length:totalDaysInMonth(selectedMonth)},(_,i)=>i+1)
    .filter(d=>getDayOfWeek(selectedMonth,d)===(cal.weekendDay??0)).length;

  const readBulkTimesheet = async () => {
    if (!pdfFile) return;
    setStep('reading'); setErrorMsg(''); setDetectedPeriod(null);
    setOcrProgress('Sending timesheet to AI… (30–90 seconds for large files)');
    const [y, m] = selectedMonth.split('-');
    const monthName = new Date(Number(y),Number(m)-1,1).toLocaleString('default',{month:'long'});
    const weekendDayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][cal.weekendDay??0];
    const holidays = (cal.publicHolidays||[]).map(h=>`Day ${h.day} (${h.name})`).join(', ');
    try {
      const b64 = await fileToBase64(pdfFile);
      const mimeType = pdfFile.type || 'application/pdf';
      setOcrProgress('AI is reading employee names and daily hours…');
      const prompt = `This is a client timesheet for ${monthName} ${y}.
It lists employees one below the other. Each row shows hours worked per day for the whole month.
Values: numbers = hours worked that day (8, 10, 12 etc.), 0/blank/absent/A = absent.

Contract rules:
- Standard working hours: 8h/day
- Weekend (rest day) in UAE: ${weekendDayName}s — any hours on ${weekendDayName} = Holiday OT at 1.5x
${holidays ? `- Public holidays this month: ${holidays} — any hours on these days = Holiday OT at 1.5x` : ''}
- Normal OT: hours beyond 8h/day on regular working days (×1.25 rate)
- Idle days: if a cell is marked "idle", "standby", "waiting" or similar — count as 8h for salary purposes

Also read the actual month and year printed on the timesheet itself (from its title, header or date column) — the document may cover a different period than the ${monthName} ${y} assumed above. Report exactly what is printed on the document, not what I told you.

Extract ALL employees. For each output:
- name: exact name as shown
- normal_days: count of regular working days (not weekend/holiday, hours > 0)
- normal_ot_hours: sum of extra hours beyond 8h on regular days
- holiday_ot_hours: total hours on weekends and public holidays
- idle_days: count of days marked idle/standby
- total_days_present: all days with any hours (including idle)

Respond ONLY with valid JSON, no explanation, no markdown fences, in this exact shape:
{"document_month":"<month name printed on the timesheet>","document_year":<year printed on the timesheet>,"employees":[{"name":"...","normal_days":N,"normal_ot_hours":N,"holiday_ot_hours":N,"idle_days":N,"total_days_present":N},...]}`;

      const res = await fetch(CLAUDE_PROXY, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6', max_tokens:4000,
          messages:[{ role:'user', content:[
            { type: mimeType.startsWith('image/')?'image':'document',
              source:{ type:'base64', media_type:mimeType, data:b64 } },
            { type:'text', text:prompt }
          ]}]
        })
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = (data.content||[]).map(c=>c.text||'').join('');
      setOcrProgress('Parsing results…');
      const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI did not return valid JSON. Got: ' + text.slice(0,300));
      const parsedRaw = JSON.parse(jsonMatch[0]);
      const parsed = Array.isArray(parsedRaw) ? parsedRaw : (parsedRaw.employees || []);
      if (!Array.isArray(parsed)||parsed.length===0) throw new Error('No employees found in timesheet');
      if (!Array.isArray(parsedRaw) && parsedRaw.document_month) {
        setDetectedPeriod({month:String(parsedRaw.document_month), year:parsedRaw.document_year?String(parsedRaw.document_year):''});
      }
      setExtractedRows(parsed);
      const matched = parsed.map(row=>{
        const {emp,score} = bestMatch(row.name, employees.filter(e=>!e.is_temp));
        return {...row, matchedEmp: score>=0.5?emp:null, matchScore:score, skip:false, override:null};
      });
      setMatchedRows(matched);
      setOcrProgress(''); setStep('matching');
    } catch(e) {
      setErrorMsg('Error: '+(e.message||String(e)));
      setStep('upload'); setOcrProgress('');
    }
  };

  const calcSalary = (row, empProfile) => {
    const monthDays = totalDaysInMonth(selectedMonth);
    const basic = Number(empProfile?.basic_salary)||0;
    const allowance = Number(empProfile?.fixed_allowance)||0;
    const hoursPerDay = Number(empProfile?.hours_per_day)||8;
    const normalDays = Number(row.normal_days)||0;
    const idleDays = Number(row.idle_days)||0;
    const payableDays = Math.min(monthDays, normalDays + idleDays);
    const normalOT = Number(row.normal_ot_hours)||0;
    const holidayOT = Number(row.holiday_ot_hours)||0;
    const dailyRate = basic / monthDays;
    const hourlyRate = basic / monthDays / hoursPerDay;
    const basicPay = Math.round(dailyRate * payableDays * 100)/100;
    const normalOTPay = Math.round(hourlyRate * normalOT * 1.25 * 100)/100;
    const holidayOTPay = Math.round(hourlyRate * holidayOT * 1.5 * 100)/100;
    const allowPay = Math.round((allowance / monthDays * payableDays) * 100)/100;
    const gross = basicPay + normalOTPay + holidayOTPay + allowPay;
    return {basicPay,normalOTPay,holidayOTPay,allowPay,gross,monthDays,normalDays:payableDays,normalOT,holidayOT,idleDays};
  };

  const bulkSave = async () => {
    const toSave = matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override));
    if (!toSave.length){alert('No employees to save.');return;}
    setBulkSaving(true); setSavedCount(0); setStep('saving');
    const profileMap={};
    const [sp,wm]= await Promise.all([
      db.from('employee_salary_profiles').select('*'),
      db.from('wps_employee_master').select('employee_id,basic_salary,fixed_allowance,hours_per_day'),
    ]);
    (sp.data||[]).forEach(r=>{profileMap[r.employee_id]=r;});
    (wm.data||[]).forEach(r=>{if(!profileMap[r.employee_id])profileMap[r.employee_id]=r;});
    Object.values(hrSalaryByEmp).forEach(r=>{if(!profileMap[r.employee_id])profileMap[r.employee_id]=r;});
    const monthStart=selectedMonth+'-01';
    const [wpsRes,actualRes]=await Promise.all([
      db.from('wps_salary_monthly').select('employee_id,gross_salary').eq('salary_month',monthStart),
      db.from('employee_monthly_costs').select('id,employee_id').like('month',selectedMonth+'%'),
    ]);
    const wpsMap={};(wpsRes.data||[]).forEach(r=>{wpsMap[r.employee_id]=Number(r.gross_salary)||0;});
    const existingActual={};(actualRes.data||[]).forEach(r=>{existingActual[r.employee_id]=r.id;});
    let saved=0;
    for(const row of toSave){
      const emp=row.override?employees.find(e=>e.employee_id===row.override):row.matchedEmp;
      if(!emp)continue;
      const profile=profileMap[emp.employee_id]||{};
      const cal=calcSalary(row,profile);
      const wpsGross=wpsMap[emp.employee_id]||0;
      const diff=cal.gross-wpsGross;
      const arrears=diff>0.01?Math.round(diff*100)/100:0;
      const deduction=diff<-0.01?Math.round(Math.abs(diff)*100)/100:0;
      const idleNote = (row.idle_days||0)>0 ? ` | Idle days: ${row.idle_days}` : '';
      const payload={
        employee_id:emp.employee_id, full_name:emp.full_name,
        month:monthStart, salary_type:'prorated',
        salary:Math.round(cal.gross*100)/100,
        basic_salary:cal.basicPay+cal.normalOTPay+cal.holidayOTPay,
        fixed_allowance:cal.allowPay,
        working_days:cal.normalDays, month_days:cal.monthDays,
        normal_ot_hours:cal.normalOT, holiday_ot_hours:cal.holidayOT,
        computed_salary:cal.gross, manual_override:false,
        salary_deductions:deduction, arrears:arrears,
        arrears_for_month:arrears>0?selectedMonth:null,
        arrears_reason:arrears>0?`WPS underpay: actual AED ${fmt(cal.gross)} vs WPS AED ${fmt(wpsGross)}`:null,
        remarks:`Bulk timesheet ${selectedMonth}. Client: ${row.name}. Actual AED ${fmt(cal.gross)} vs WPS AED ${fmt(wpsGross)}.${arrears>0?` Pay arrears AED ${fmt(arrears)} in next WPS.`:''}${deduction>0?` Recover AED ${fmt(deduction)} in next WPS.`:''}${idleNote}`,
        food:0,accommodation:0,transport:0,other:0,recurring_allowance_total:0,
      };
      const existId=existingActual[emp.employee_id];
      if(existId){await db.from('employee_monthly_costs').update(payload).eq('id',existId);}
      else{await db.from('employee_monthly_costs').upsert(payload,{onConflict:'employee_id,month'});}
      saved++; setSavedCount(saved);
    }
    setBulkSaving(false); await loadPipeline();
    setStep('pipeline'); setPdfFile(null); setExtractedRows([]); setMatchedRows([]); setErrorMsg('');
    alert(`✅ Saved actual salary for ${saved} employees.`);
  };

  const SC={
    not_started:   {c:'#94a3b8',bg:'#f8fafc',icon:'○',label:'Not Started'},
    wps_pending_ts:{c:'#d97706',bg:'#fffbeb',icon:'⏳',label:'WPS Paid — Need Timesheet'},
    actual_no_wps: {c:'#7c3aed',bg:'#faf5ff',icon:'📝',label:'Actual Recorded'},
    settled:       {c:'#166534',bg:'#f0fdf4',icon:'✅',label:'Settled'},
  };
  const counts=React.useMemo(()=>{
    const c={not_started:0,wps_pending_ts:0,actual_no_wps:0,settled:0};
    pipeline.forEach(r=>{c[r.status]=(c[r.status]||0)+1;}); return c;
  },[pipeline]);

  return (
    <div>
      {/* ── ALWAYS VISIBLE: Month selector + action bar ── */}
      <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'12px',padding:'14px 18px',marginBottom:'14px'}}>
        <div style={{display:'flex',gap:'12px',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div>
            <label style={S.label}>Salary Month</label>
            <input type="month" value={selectedMonth} onChange={e=>{setSelectedMonth(e.target.value);setActivePanel(null);setStep('pipeline');}}
              style={{...S.input,width:'160px'}}/>
          </div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'1px'}}>
            <button onClick={()=>setActivePanel(p=>p==='calendar'?null:'calendar')}
              style={{...S.btnPri,background:activePanel==='calendar'?'#2563eb':'#eff6ff',color:activePanel==='calendar'?'#fff':'#2563eb',border:'1px solid #2563eb'}}>
              📅 Month Calendar
              {publicHolidayCount>0 && <span style={{marginLeft:'6px',background:'#7c3aed',color:'#fff',borderRadius:'10px',padding:'1px 7px',fontSize:'11px'}}>{publicHolidayCount} holidays</span>}
            </button>
            <button onClick={()=>setActivePanel(p=>p==='idle'?null:'idle')}
              style={{...S.btnPri,background:activePanel==='idle'?'#0369a1':'#e0f2fe',color:activePanel==='idle'?'#fff':'#0369a1',border:'1px solid #0369a1'}}>
              ⏸ Idle Days Tracker
            </button>
            <button onClick={()=>{setStep('upload');setActivePanel(null);}}
              style={{...S.btnPri,background:'#7c3aed'}}>
              📄 Upload Timesheet PDF
            </button>
            <button style={{...S.btnPri,background:'#0f172a'}} onClick={loadPipeline}>🔄 Refresh</button>
          </div>
        </div>

        <div style={{marginTop:'12px',display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'8px'}}>
          {[
            ['1','Portal WPS','By 28th generate from portal: Basic + Allowance ± previous adjustments.'],
            ['2','Timesheet','Upload one client PDF for all employees when received.'],
            ['3','Review','Check AI name match, normal hours, OT ×1.25 and OT ×1.5.'],
            ['4','Next WPS','Portal carries arrears/recovery into next month WPS.'],
          ].map(x=><div key={x[0]} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'10px 12px'}}>
            <div style={{fontSize:'10px',fontWeight:900,color:'#64748b',textTransform:'uppercase'}}>Step {x[0]}</div>
            <div style={{fontSize:'13px',fontWeight:900,color:'#0f172a'}}>{x[1]}</div>
            <div style={{fontSize:'11.5px',color:'#64748b',lineHeight:1.35,marginTop:'2px'}}>{x[2]}</div>
          </div>)}
        </div>

        {/* Calendar summary strip */}
        {!activePanel && (
          <div style={{marginTop:'10px',display:'flex',gap:'10px',fontSize:'12px',flexWrap:'wrap'}}>
            <span style={{background:'#fef3c7',color:'#d97706',padding:'3px 10px',borderRadius:'8px',fontWeight:700}}>
              📅 {weekendCount} weekends
            </span>
            {publicHolidayCount>0 && (
              <span style={{background:'#f3e8ff',color:'#7c3aed',padding:'3px 10px',borderRadius:'8px',fontWeight:700}}>
                🗓 {publicHolidayCount} public holidays: {(cal.publicHolidays||[]).map(h=>`Day ${h.day} ${h.name}`).join(', ')}
              </span>
            )}
            <span style={{background:'#f0fdf4',color:'#166534',padding:'3px 10px',borderRadius:'8px',fontWeight:700}}>
              💼 {totalDaysInMonth(selectedMonth)-weekendCount-publicHolidayCount} working days
            </span>
          </div>
        )}
      </div>

      {/* ── PANELS ── */}
      {activePanel==='calendar' && (
        <div style={{marginBottom:'14px'}}>
          <MonthCalendarPanel yearMonth={selectedMonth} onClose={()=>{setActivePanel(null);loadPipeline();}}/>
        </div>
      )}
      {activePanel==='idle' && (
        <div style={{marginBottom:'14px'}}>
          <IdleDaysPanel yearMonth={selectedMonth} employees={employees} hrSalaryRows={hrSalaryRows}
            onClose={()=>{setActivePanel(null);loadPipeline();}}/>
        </div>
      )}

      {/* ── PIPELINE OVERVIEW (always visible below panels) ── */}
      {step==='pipeline' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
            {Object.entries(SC).map(([k,v])=>(
              <div key={k} style={{background:v.bg,border:'1px solid '+v.c+'44',borderRadius:'10px',padding:'12px 16px'}}>
                <div style={{fontSize:'22px',fontWeight:800,color:v.c}}>{counts[k]||0}</div>
                <div style={{fontSize:'11.5px',color:v.c,fontWeight:700}}>{v.icon} {v.label}</div>
              </div>
            ))}
          </div>
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden'}}>
            <div className="drag-scroll" style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {['Emp ID','Name','Status','Idle Days','WPS Paid','Actual Calc.','Difference','Next Month Action'].map(h=>(
                      <th key={h} style={{...S.th,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipelineLoading
                    ? <tr><td colSpan={8} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>Loading…</td></tr>
                    : pipeline.length===0
                      ? <tr><td colSpan={8} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>No employees</td></tr>
                      : pipeline.map(row=>{
                          const sc=SC[row.status];
                          const diff=(row.actualSalary!=null&&row.wpsGross!=null)?row.actualSalary-row.wpsGross:null;
                          return (
                            <tr key={row.employee_id} style={{borderBottom:'1px solid #f1f5f9'}}>
                              <td style={{...S.td,fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#2563eb'}}>{row.employee_id}</td>
                              <td style={{...S.td,fontWeight:600}}>{row.full_name}</td>
                              <td style={S.td}><span style={{background:sc.bg,color:sc.c,fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'10px',whiteSpace:'nowrap'}}>{sc.icon} {sc.label}</span></td>
                              <td style={{...S.td,textAlign:'center'}}>
                                {row.idle ? (
                                  <span style={{fontSize:'11.5px'}}>
                                    <span style={{color:'#dc2626',fontWeight:700}}>{row.idle.total}</span>
                                    {row.idle.agreed>0&&<span style={{color:'#166534',marginLeft:'4px'}}>({row.idle.agreed}✓)</span>}
                                  </span>
                                ):<span style={{color:'#cbd5e1'}}>—</span>}
                              </td>
                              <td style={{...S.td,textAlign:'right',fontWeight:700,color:row.wpsGross!=null?'#0f172a':'#cbd5e1'}}>
                                {row.wpsGross!=null?'AED '+fmt(row.wpsGross):'—'}</td>
                              <td style={{...S.td,textAlign:'right',fontWeight:700,color:row.actualSalary!=null?'#166534':'#cbd5e1'}}>
                                {row.actualSalary!=null?'AED '+fmt(row.actualSalary):'—'}</td>
                              <td style={{...S.td,textAlign:'right'}}>
                                {diff!=null?<span style={{fontWeight:800,color:diff>=0?'#166534':'#dc2626'}}>{diff>=0?'▲ +':'▼ '}{fmt(Math.abs(diff))}</span>:<span style={{color:'#cbd5e1'}}>—</span>}
                              </td>
                              <td style={S.td}>
                                {diff==null?<span style={{color:'#94a3b8'}}>Waiting</span>:diff>0.01?<span style={{background:'#f0fdf4',color:'#166534',fontSize:'11px',fontWeight:800,padding:'3px 9px',borderRadius:'10px'}}>Pay arrears AED {fmt(diff)}</span>:diff<-0.01?<span style={{background:'#fef2f2',color:'#dc2626',fontSize:'11px',fontWeight:800,padding:'3px 9px',borderRadius:'10px'}}>Deduct AED {fmt(Math.abs(diff))}</span>:<span style={{color:'#166534',fontWeight:800}}>No adjustment</span>}
                              </td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── UPLOAD PDF ── */}
      {step==='upload' && (
        <div style={{background:'#fff',border:'2px solid #7c3aed',borderRadius:'12px',padding:'28px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px'}}>
            <button onClick={()=>setStep('pipeline')} style={S.btnSec}>← Back</button>
            <div>
              <div style={{fontWeight:800,fontSize:'16px'}}>📄 Upload Bulk Timesheet — {selectedMonth}</div>
              <div style={{fontSize:'12px',color:'#64748b'}}>
                {publicHolidayCount>0
                  ? `✅ Calendar loaded: ${publicHolidayCount} public holidays + ${weekendCount} weekends will be applied automatically`
                  : `⚠️ No public holidays set. Go to 📅 Month Calendar first to mark holidays for accurate OT calculation.`}
              </div>
            </div>
          </div>
          <div style={{background:'#faf5ff',border:'1px solid #d8b4fe',borderRadius:'10px',padding:'16px',marginBottom:'20px',fontSize:'12.5px',color:'#475569'}}>
            <strong style={{color:'#581c87'}}>What the AI will extract:</strong> All employee names → normal working days → OT hours (×1.25) beyond 8h/day →
            Weekend & public holiday hours (×1.5) → Idle/standby days if marked.
            Holiday rules from your <strong>Month Calendar</strong> are passed to the AI automatically.
          </div>
          <div style={{marginBottom:'20px'}}>
            <div style={{border:'2px dashed #d8b4fe',borderRadius:'10px',padding:'30px',textAlign:'center',background:'#faf5ff'}}>
              <input type="file" accept="application/pdf,image/*" id="bulk-ts-upload" style={{display:'none'}}
                onChange={e=>{setPdfFile(e.target.files[0]);setErrorMsg('');}}/>
              {!pdfFile && (
                <label htmlFor="bulk-ts-upload" style={{cursor:'pointer'}}>
                  <div style={{fontSize:'36px',marginBottom:'8px'}}>📁</div>
                  <div style={{fontWeight:700,color:'#7c3aed',fontSize:'14px',marginBottom:'4px'}}>Click to select timesheet (PDF or image)</div>
                  <div style={{fontSize:'12px',color:'#94a3b8'}}>Client sends one file for all employees — all formats accepted</div>
                </label>
              )}
              {pdfFile && (
                <div style={{marginTop:'4px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'6px',padding:'8px 12px',display:'inline-flex',alignItems:'center',gap:'10px'}}>
                  <span style={{fontWeight:700,color:'#166534'}}>✅ {pdfFile.name}</span>
                  <span style={{fontSize:'11px',color:'#64748b'}}>({(pdfFile.size/1024).toFixed(0)} KB)</span>
                  <button type="button" title="Remove file" onClick={()=>{setPdfFile(null);setErrorMsg('');const inp=document.getElementById('bulk-ts-upload');if(inp)inp.value='';}}
                    style={{background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:'50%',width:'20px',height:'20px',lineHeight:'20px',textAlign:'center',fontWeight:800,fontSize:'12px',cursor:'pointer',padding:0}}>✕</button>
                  <label htmlFor="bulk-ts-upload" style={{cursor:'pointer',fontSize:'11.5px',fontWeight:700,color:'#7c3aed',textDecoration:'underline',marginLeft:'4px'}}>Replace file</label>
                </div>
              )}
            </div>
          </div>
          {errorMsg && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'12.5px',color:'#991b1b'}}>⚠️ {errorMsg}</div>}
          <button onClick={readBulkTimesheet} disabled={!pdfFile}
            style={{...S.btnPri,background:'#7c3aed',opacity:!pdfFile?0.5:1,padding:'12px 28px',fontSize:'14px'}}>
            🤖 Read All Employees with AI →
          </button>
        </div>
      )}

      {/* ── READING PROGRESS ── */}
      {step==='reading' && (
        <div style={{background:'#fff',border:'2px solid #7c3aed',borderRadius:'12px',padding:'40px',textAlign:'center'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>🤖</div>
          <div style={{fontWeight:800,fontSize:'16px',color:'#581c87',marginBottom:'8px'}}>AI is reading the timesheet…</div>
          <div style={{fontSize:'13px',color:'#64748b',marginBottom:'20px'}}>{ocrProgress}</div>
          <div style={{width:'200px',height:'6px',background:'#f1f5f9',borderRadius:'3px',margin:'0 auto',overflow:'hidden'}}>
            <div style={{height:'100%',background:'#7c3aed',animation:'pulsebar 1.5s ease-in-out infinite',borderRadius:'3px',width:'60%'}}/>
          </div>
          <style>{`@keyframes pulsebar{0%{transform:translateX(-150%)}100%{transform:translateX(300%)}}`}</style>
          <div style={{marginTop:'16px',fontSize:'12px',color:'#94a3b8'}}>Large PDFs may take 30–90 seconds. Please keep this page open.</div>
        </div>
      )}

      {/* ── NAME MATCHING REVIEW ── */}
      {step==='matching' && (
        <div>
          <div style={{background:'#fff',border:'2px solid #7c3aed',borderRadius:'12px',padding:'20px',marginBottom:'14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px'}} className="tbl-sticky-toolbar" ref={measureToStk2}>
              <div>
                <div style={{fontWeight:800,fontSize:'16px',marginBottom:'4px'}}>🔗 Review Name Matches — {extractedRows.length} employees found</div>
                <div style={{fontSize:'12.5px',color:'#64748b'}}>
                  The AI extracted employee names from the client's timesheet and auto-matched them to your SATCO list. If the client file has no employee code, the safest identifiers are IBAN/Labour Card; otherwise this page asks you to confirm by name.
                  Review each match — <span style={{color:'#166534',fontWeight:700}}>green = confident</span>,
                  <span style={{color:'#d97706',fontWeight:700}}> yellow = check this</span>,
                  <span style={{color:'#dc2626',fontWeight:700}}> red = no match found</span>.
                  Use the dropdown to correct any wrong match. Skip employees not in this batch.
                </div>
              </div>
              <div style={{display:'flex',gap:'8px',flexShrink:0}}>
                <button onClick={()=>setStep('upload')} style={S.btnSec}>← Re-upload</button>
                <button onClick={bulkSave} style={{...S.btnPri,background:'#166534',padding:'10px 20px'}}>
                  ✅ Save {matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override)).length} Employees
                </button>
              </div>
            </div>
          </div>
          {detectedPeriod && detectedPeriod.month && (() => {
            const [selY, selM] = selectedMonth.split('-');
            const selMonthName = new Date(Number(selY),Number(selM)-1,1).toLocaleString('default',{month:'long'});
            const mismatch = detectedPeriod.month.toLowerCase().slice(0,3) !== selMonthName.toLowerCase().slice(0,3)
              || (detectedPeriod.year && String(detectedPeriod.year) !== selY);
            if (!mismatch) return null;
            return (
              <div style={{background:'#fef2f2',border:'2px solid #dc2626',borderRadius:'10px',padding:'14px 16px',marginBottom:'14px',fontSize:'12.5px',color:'#991b1b'}}>
                ⚠️ <strong>Month mismatch:</strong> This timesheet looks like it's for <strong>{detectedPeriod.month} {detectedPeriod.year||''}</strong>, but your Salary Month is set to <strong>{selMonthName} {selY}</strong>. Weekend/holiday OT above was calculated using {selMonthName} {selY}'s calendar, which may be wrong. Set Salary Month to match the timesheet and re-upload, or correct the Normal Days / OT hours / Idle Days fields below by hand — they're all editable.
              </div>
            );
          })()}
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
              <thead>
                <tr style={{background:'#f8fafc'}}>
                  {['#','Client Name (PDF)','Normal Days','OT ×1.25 hrs','Holiday OT ×1.5','Idle Days','SATCO Employee Match','Confidence',''].map(h=>(
                    <th key={h} style={{...S.th,whiteSpace:'nowrap',fontSize:'11.5px'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchedRows.map((row,i)=>{
                  const pct=Math.round(row.matchScore*100);
                  const cc=pct>=80?'#166534':pct>=50?'#d97706':'#dc2626';
                  const cb=pct>=80?'#f0fdf4':pct>=50?'#fffbeb':'#fef2f2';
                  const resolvedEmp=row.override?employees.find(e=>e.employee_id===row.override):row.matchedEmp;
                  return (
                    <tr key={i} style={{borderBottom:'1px solid #f1f5f9',opacity:row.skip?0.35:1,background:row.skip?'#f8fafc':'#fff'}}>
                      <td style={{...S.td,color:'#94a3b8',width:'28px',fontWeight:600}}>{i+1}</td>
                      <td style={{...S.td,fontWeight:700}}>
                        <input type="text" value={row.name||''}
                          onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,name:v}:r));}}
                          style={{...S.input,width:'130px',padding:'4px 6px',fontSize:'12.5px',fontWeight:700}}/>
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <input type="number" min="0" step="0.5" value={row.normal_days===''?'':(row.normal_days??0)}
                          onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,normal_days:v===''?'':Number(v)}:r));}}
                          style={{...S.input,width:'58px',textAlign:'center',padding:'4px 4px',fontSize:'12.5px'}}/>
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <input type="number" min="0" step="0.5" value={row.normal_ot_hours===''?'':(row.normal_ot_hours??0)}
                          onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,normal_ot_hours:v===''?'':Number(v)}:r));}}
                          style={{...S.input,width:'58px',textAlign:'center',padding:'4px 4px',fontSize:'12.5px',color:(Number(row.normal_ot_hours)>0?'#d97706':'#0f172a')}}/>
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <input type="number" min="0" step="0.5" value={row.holiday_ot_hours===''?'':(row.holiday_ot_hours??0)}
                          onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,holiday_ot_hours:v===''?'':Number(v)}:r));}}
                          style={{...S.input,width:'58px',textAlign:'center',padding:'4px 4px',fontSize:'12.5px',color:(Number(row.holiday_ot_hours)>0?'#dc2626':'#0f172a')}}/>
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <input type="number" min="0" step="0.5" value={row.idle_days===''?'':(row.idle_days??0)}
                          onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,idle_days:v===''?'':Number(v)}:r));}}
                          style={{...S.input,width:'58px',textAlign:'center',padding:'4px 4px',fontSize:'12.5px',color:(Number(row.idle_days)>0?'#0369a1':'#0f172a')}}/>
                      </td>
                      <td style={{...S.td,minWidth:'220px'}}>
                        {row.skip ? <span style={{color:'#94a3b8',fontSize:'11px'}}>Skipped</span> : (
                          <select value={row.override||resolvedEmp?.employee_id||'__none__'}
                            onChange={e=>{const v=e.target.value; setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,override:v==='__none__'?null:v,matchedEmp:v==='__none__'?null:r.matchedEmp}:r));}}
                            style={{...S.input,width:'100%',fontSize:'12px',padding:'4px 8px'}}>
                            <option value="__none__">— No match / skip —</option>
                            {employees.filter(e=>!e.is_temp).map(e=>(
                              <option key={e.employee_id} value={e.employee_id}>{e.employee_id} — {e.full_name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        {!row.skip&&<span style={{background:cb,color:cc,fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'8px'}}>{pct}%</span>}
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        <button onClick={()=>setMatchedRows(rows=>rows.map((r,j)=>j===i?{...r,skip:!r.skip}:r))}
                          style={{...S.btnSec,padding:'3px 10px',fontSize:'11.5px',background:row.skip?'#dcfce7':'#fff',color:row.skip?'#166534':'#64748b'}}>
                          {row.skip?'↩ Restore':'⏭ Skip'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',marginTop:'14px'}}>
            <button onClick={()=>setStep('upload')} style={S.btnSec}>← Re-upload</button>
            <button onClick={bulkSave} style={{...S.btnPri,background:'#166534',padding:'12px 28px',fontSize:'14px'}}>
              ✅ Save {matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override)).length} Employees' Salaries
            </button>
          </div>
        </div>
      )}

      {/* ── SAVING PROGRESS ── */}
      {step==='saving' && (
        <div style={{background:'#fff',border:'2px solid #166534',borderRadius:'12px',padding:'40px',textAlign:'center'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>💾</div>
          <div style={{fontWeight:800,fontSize:'16px',color:'#166534',marginBottom:'8px'}}>Saving actual salaries…</div>
          <div style={{fontSize:'20px',fontWeight:800,color:'#0f172a',marginBottom:'16px'}}>
            {savedCount} / {matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override)).length}
          </div>
          <div style={{width:'300px',height:'10px',background:'#f1f5f9',borderRadius:'5px',margin:'0 auto',overflow:'hidden'}}>
            <div style={{height:'100%',background:'#166534',borderRadius:'5px',transition:'width 0.4s',
              width:matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override)).length>0
                ?(savedCount/matchedRows.filter(r=>!r.skip&&(r.matchedEmp||r.override)).length*100)+'%':'0%'}}/>
          </div>
        </div>
      )}
    </div>
  );
}


// ── APP SHELL / NAVIGATION ────────────────────────────────────────

const SATCO_LOGO_SRC = './satco-logo.png';

function SatcoLogo() {
  return <img className="brand-logo" src={SATCO_LOGO_SRC} alt="SATCO Arabia General Contracting - L.L.C - S.P.C" />;
}

function PortalLaunchpad({ active, onOpen }) {
  return (
    <div className="dashboard-launch">
      <div className="launch-hero">
        <div>
          <div className="launch-kicker">Start here</div>
          <h2>Choose what you need to do.</h2>
          <p>All finance tools are available as large buttons on this first screen. Pick a module, complete the entry, then come back to Dashboard to review the impact on profit/loss.</p>
        </div>
        <div className="launch-help">
          <span>✓ Big tap-friendly buttons</span>
          <span>✓ Works cleanly on mobile</span>
          <span>✓ Simple flow: Payroll → Costs → Revenue → P&amp;L</span>
        </div>
      </div>
      <div className="launch-groups">
        {PORTAL_NAV_GROUPS.map(group=>(
          <div className="launch-group" key={group.title}>
            <div className="launch-group-title">{group.title}</div>
            <div className="module-grid">
              {group.items.map(key=>{
                const item = PORTAL_TAB_MAP[key];
                return (
                  <button key={key} className={'module-card '+(active===key?'active':'')} onClick={()=>onOpen(key)}>
                    <span className="module-card-icon">{item.icon}</span>
                    <span>
                      <span className="module-card-title">{item.label}</span>
                      <span className="module-card-desc">{item.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PORTAL_TABS = [
  { key:'dashboard', icon:'📊', label:'Dashboard', short:'Overview', desc:'Company-wide profit, loss, idle months, and employee drill-down.' },
  { key:'salary_pipeline', icon:'📋', label:'Salary Pipeline', short:'WPS vs Actual', desc:'Upload client timesheets, match employees, calculate actual salary, and carry arrears/deductions to next month.' },
  { key:'salary_profiles', icon:'💼', label:'Salary Master', short:'Payroll setup', desc:'Basic salary, allowance, IBAN, and HR salary bridge status.' },
  { key:'deductions', icon:'🧾', label:'Deduction Ledger', short:'HR deductions', desc:'Employee deductions, recoveries, balances, and supporting notes.' },
  { key:'wps', icon:'🏦', label:'WPS Report', short:'Bank file', desc:'Generate the Basic + Allowance WPS salary sheet, or import a WPS/HR salary Excel for any month.' },
  { key:'monthly', icon:'📅', label:'Monthly Costs', short:'Recurring', desc:'Salary, food, accommodation, transport, and other monthly costs.' },
  { key:'visa', icon:'🛂', label:'Visa Costs', short:'Employee cost', desc:'Track recoverable and non-recoverable visa-related expenses.' },
  { key:'flights', icon:'✈️', label:'Flights', short:'Tickets', desc:'Mobilization, demobilization, leave, and emergency ticket costs.' },
  { key:'training', icon:'🎓', label:'Trainings', short:'Courses', desc:'Training names, dates, costs, and recovery status.' },
  { key:'other', icon:'🧰', label:'Onboarding & Misc', short:'Other spend', desc:'Deposits, advances, medicals, PPE, and miscellaneous employee costs.' },
  { key:'camp', icon:'🏕️', label:'Camp Costs', short:'Off-site days', desc:'Food, accommodation and transport paid to the client/camp for days an employee is demobilized and not yet remobilized.' },
  { key:'ppe', icon:'🥽', label:'PPE & Uniforms', short:'Coveralls, shoes', desc:'Coveralls, safety shoes, and goggles issued per employee.' },
  { key:'timesheets', icon:'⏱️', label:'Timesheets / Income', short:'Revenue input', desc:'Enter employee time and income for monthly P&L.' },
  { key:'billing', icon:'🧾', label:'Client Billing', short:'Invoices', desc:'Create client invoices, track rates, recovery, and billing status.' },
  { key:'hiring_history', icon:'📜', label:'Hiring Pipeline History', short:'Recruitment archive', desc:'Historical recruitment/visa-pipeline records imported from the master data sheet — reference only, not linked to P&L.' },
];
const PORTAL_TAB_MAP = Object.fromEntries(PORTAL_TABS.map(t=>[t.key,t]));
const PORTAL_NAV_GROUPS = [
  { title:'Start here', items:['dashboard','salary_pipeline'] },
  { title:'Payroll', items:['salary_profiles','deductions','wps'] },
  { title:'Employee Costs', items:['monthly','visa','flights','training','other','camp','ppe'] },
  { title:'Revenue', items:['timesheets','billing'] },
  { title:'Archive', items:['hiring_history'] },
];

function PortalGuide({ active }) {
  return null;
  return (
    <div className="guide-grid">
      <div className="guide-card"><b>1. Check P&amp;L</b><span>Start with the dashboard to see which employees, months, or costs need attention.</span></div>
      <div className="guide-card"><b>2. Fix payroll data</b><span>Use Salary Master and WPS Report before closing monthly payroll.</span></div>
      <div className="guide-card"><b>3. Match costs to income</b><span>Use Costs, Timesheets, and Billing so every employee has a clean monthly story.</span></div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────
function App() {
  useDragScroll();
  const topbarRef = useStkPublish('--stk-1', null);
  const [session,   setSession]   = useState(undefined);
  const [tab,       setTab]       = useState('dashboard');
  const [employees, setEmployees] = useState([]);
  const [tempCandError, setTempCandError] = useState(null); // surfaces hiring_pipeline pull failures (RLS, schema, etc) instead of failing silently
  const [empMeta,   setEmpMeta]   = useState({});
  const [hrSalaryRows, setHrSalaryRows] = useState([]);
  const [hrSalaryStatus, setHrSalaryStatus] = useState({ source:null, error:null });
  const [mobDemobByEmp, setMobDemobByEmp] = useState({}); // employee_id -> [{mobilization_date,demobilization_date,location,supply}] full history, oldest first
  const [showMig,   setShowMig]   = useState(()=>localStorage.getItem('satco_migration_v12')!=='done');
  const [showHrBridge, setShowHrBridge] = useState(()=>localStorage.getItem('satco_hr_bridge_camp_v1')!=='done');
  const [detailEmp, setDetailEmp] = useState(null); // {id, name} or null

  useEffect(()=>{
    db.auth.getSession().then(({data})=>setSession(data.session));
    const {data:l}=db.auth.onAuthStateChange((_,sess)=>setSession(sess));
    return ()=>l.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    let alive = true;

    const localFinanceEmployees = async () => {
      const [sp, wm, pnl] = await Promise.all([
        db.from('employee_salary_profiles').select('employee_id,full_name,basic_salary,fixed_allowance'),
        db.from('wps_employee_master').select('employee_id,full_name,basic_salary,fixed_allowance'),
        db.from('employee_pnl_summary').select('employee_id,full_name'),
      ]);
      const map = {};
      const add = (r) => {
        if (!r || !r.employee_id) return;
        const id = canonEmpId(r.employee_id);
        if (!id) return;
        if (!map[id]) map[id] = { employee_id:id, full_name:r.full_name || id };
        else if (!map[id].full_name && r.full_name) map[id].full_name = r.full_name;
      };
      (sp.data||[]).forEach(add);
      (wm.data||[]).forEach(add);
      (pnl.data||[]).forEach(add);
      return Object.values(map).sort((a,b)=>String(a.employee_id).localeCompare(String(b.employee_id)));
    };

    const loadFinancePeople = async () => {
      const { rows, source, error } = await loadHrSalaryRows();
      if (!alive) return;
      setHrSalaryRows(rows||[]);
      setHrSalaryStatus({source:source||null,error:error||null});

      let baseEmployees = [];
      const meta = {};
      if (rows && rows.length) {
        const rowMap = {};
        rows.forEach(r=>{ const id=canonEmpId(r.employee_id); if(id && !rowMap[id]) rowMap[id] = { ...r, employee_id:id, full_name:r.full_name || id }; });
        baseEmployees = Object.values(rowMap).map(r=>({ employee_id:r.employee_id, full_name:r.full_name || r.employee_id }));
        Object.values(rowMap).forEach(r=>{ meta[r.employee_id] = { ...r, bank_iban:r.iban, allowance:r.fixed_allowance }; });
      } else {
        baseEmployees = await localFinanceEmployees();
        baseEmployees.forEach(e=>{ const id=canonEmpId(e.employee_id); if(id) meta[id] = { ...e, employee_id:id }; });
      }

      // If HR has created the optional assignment bridge, enrich empMeta.
      // Missing/blocked bridge should not break the Finance portal.
      // The bridge view now returns every mob/demob row per employee (not just the latest),
      // ordered oldest-first, so we also group it into mobDemobByEmp for Camp Cost tracking —
      // the forEach below still ends on the most recent row per employee, so empMeta's
      // "current" mobilization_date/demobilization_date/location keeps working exactly as before.
      try {
        const { data:md } = await hrDb.from('v_finance_employee_mob_demob').select('*');
        if (alive && md) {
          md.forEach(m=>{ const id=canonEmpId(m.employee_id); if (meta[id]) meta[id] = { ...meta[id], ...m, employee_id:id }; });
          const grouped = {};
          md.forEach(m=>{
            const id = canonEmpId(m.employee_id);
            if (!id) return;
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push({ mobilization_date:m.mobilization_date||null, demobilization_date:m.demobilization_date||null, location:m.location||null, supply:m.supply||null });
          });
          Object.keys(grouped).forEach(id=>grouped[id].sort((a,b)=>String(a.mobilization_date||'').localeCompare(String(b.mobilization_date||''))));
          setMobDemobByEmp(grouped);
        }
      } catch (_) {}

      // Optional pending Temp IDs from HR hiring pipeline.
      try {
        const { data:tempCands, error:tcErr } = await hrDb.from('v_temp_candidates')
          .select('temp_employee_id,candidate_name,status,position_display')
          .not('temp_employee_id','is',null);
        if (!alive) return;
        if (tcErr) {
          setTempCandError(tcErr.message || String(tcErr));
          setEmployees(baseEmployees);
        } else {
          setTempCandError(null);
          const existingIds = new Set(baseEmployees.map(e=>canonEmpId(e.employee_id).toLowerCase()));
          const tempEntries = (tempCands||[])
            .filter(t=>t.temp_employee_id)
            .map(t=>{
              const id = canonEmpId(t.temp_employee_id);
              const name = String(t.candidate_name||id).trim();
              if (!id) return null;
              meta[id] = { ...(meta[id]||{}), employee_id:id, full_name:name, position:t.position_display||'', status:t.status||'', is_temp:true };
              return { employee_id:id, full_name:name, is_temp:true, status:t.status||'', position:t.position_display||'' };
            })
            .filter(Boolean)
            .filter(t=>!existingIds.has(canonEmpId(t.employee_id).toLowerCase()));
          setEmployees([...baseEmployees, ...tempEntries]);
        }
      } catch (e) {
        if (!alive) return;
        setTempCandError(e.message || String(e));
        setEmployees(baseEmployees);
      }
      setEmpMeta(meta);
    };

    loadFinancePeople();
    return ()=>{ alive = false; };
  },[]);

  if (session===undefined) return null;
  if (!session) return <LoginScreen onLogin={setSession} />;

  const activeMeta = PORTAL_TAB_MAP[tab] || PORTAL_TAB_MAP.dashboard;
  const hrIsConnected = !!(hrSalaryRows && hrSalaryRows.length);
  const employeeCount = employees.filter(e=>!e.is_temp).length;
  const pendingCount = employees.filter(e=>e.is_temp).length;

  const renderContent = () => {
    if (detailEmp) {
      return (
        <>
          <div className="detail-backbar">
            <button className="quick-back" onClick={()=>setDetailEmp(null)}>← Back to portal</button>
          </div>
          <EmployeeDetailPage employeeId={detailEmp.id} employeeName={detailEmp.name} employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} mobDemobByEmp={mobDemobByEmp} onBack={()=>setDetailEmp(null)} />
        </>
      );
    }
    return (
      <>
        {tab==='dashboard'       && <>
          <PortalLaunchpad active={tab} onOpen={(key)=>{setTab(key);setDetailEmp(null);window.scrollTo({top:0,behavior:'smooth'});}} />
          <div className="dashboard-section-label">Live P&amp;L Dashboard</div>
          <PnlDashboard employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} onOpenEmployee={(id,name)=>setDetailEmp({id,name})} />
        </>}
        {tab==='salary_pipeline' && <SalaryPipelineTab employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} />}
        {tab==='salary_profiles' && <SalaryProfilesTab employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} hrSalaryStatus={hrSalaryStatus} />}
        {tab==='deductions'      && <DeductionLedgerTab employees={employees} empMeta={empMeta} />}
        {tab==='visa'      && <CostTable title="Visa Costs" table="employee_visa_costs" employees={employees} dateField="cost_date" recoverableSupport
          fields={[{key:'visa_type',label:'Visa Type',type:'select',options:['visit_visa','residence_visa','employment_entry_permit','visa_transfer','renewal','cancellation']},{key:'cost_date',label:'Date',type:'date'},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />}
        {tab==='flights'   && <CostTable title="Flight Tickets" table="employee_flights" employees={employees} dateField="flight_date" recoverableSupport
          fields={[{key:'flight_date',label:'Date',type:'date'},{key:'sector',label:'Sector',type:'text'},{key:'purpose',label:'Purpose',type:'select',options:['mobilization','demobilization','annual_leave','emergency']},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />}
        {tab==='training'  && <CostTable title="Training Costs" table="employee_training_costs" employees={employees} dateField="training_date" recoverableSupport
          fields={[{key:'training_name',label:'Training Name',type:'text'},{key:'training_date',label:'Date',type:'date'},{key:'cost',label:'Cost (AED)',type:'number'},{key:'remarks',label:'Remarks',type:'text'}]} />}
        {tab==='other'     && <OtherCostsTable employees={employees} />}
        {tab==='camp'      && <CampCostsTab employees={employees} empMeta={empMeta} mobDemobByEmp={mobDemobByEmp} />}
        {tab==='ppe'       && <PpeIssuedTable employees={employees} />}
        {tab==='monthly'   && <MonthlyCostsTable employees={employees} empMeta={empMeta} hrSalaryRows={hrSalaryRows} />}
        {tab==='timesheets'&& <TimesheetsTable employees={employees} />}
        {tab==='billing'    && <ClientBillingTab employees={employees} />}
        {tab==='hiring_history' && <HiringPipelineTab />}
        {tab==='wps'        && <WpsReportTab employees={employees} empMeta={empMeta} hrDb={hrDb} hrSalaryRows={hrSalaryRows} hrSalaryStatus={hrSalaryStatus} />}
      </>
    );
  };

  return (
    <div className="container">
      <div className="satco-shell">
        <aside className="satco-sidebar">
          <div className="brand-card">
            <div className="brand-logo-wrap"><SatcoLogo /></div>
            <div>
              <div className="portal-name">FINANCE PORTAL</div>
              <div className="brand-subtitle">Employee Finance &amp; P&amp;L</div>
            </div>
          </div>

          {PORTAL_NAV_GROUPS.map(group=>(
            <div className="nav-group" key={group.title}>
              <div className="nav-title">{group.title}</div>
              {group.items.map(key=>{
                const item = PORTAL_TAB_MAP[key];
                return (
                  <button key={key} className={'nav-btn '+(tab===key && !detailEmp ? 'active' : '')} onClick={()=>{setTab(key);setDetailEmp(null);}}>
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}<span className="nav-caption">{item.short}</span></span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="sidebar-footer">
            <strong>Simple rule</strong>
            <span>Dashboard shows the truth. Payroll fixes salary. Costs and Revenue explain the P&amp;L.</span>
          </div>
        </aside>

        <main className="satco-main">
          <div className="topbar" ref={topbarRef}>
            <div>
              <div className="topbar-brand">
                <div className="brand-logo-wrap"><SatcoLogo /></div>
                <div>
                  <div className="portal-name">FINANCE PORTAL</div>
                  <div className="brand-subtitle">SATCO Employee Finance &amp; P&amp;L</div>
                </div>
              </div>
              <div className="eyebrow">Finance Portal</div>
              <h1 className="page-title">{detailEmp ? (detailEmp.name || detailEmp.id) : activeMeta.label}</h1>
              <div className="page-desc">{detailEmp ? 'Single employee view with salary, costs, recoveries, income, and monthly profit/loss.' : activeMeta.desc}</div>
            </div>
            <div className="top-actions">
              {(tab !== 'dashboard' || detailEmp) && (
                <button className="dashboard-home-btn" onClick={()=>{setTab('dashboard');setDetailEmp(null);window.scrollTo({top:0,behavior:'smooth'});}}>
                  ← Dashboard
                </button>
              )}
              <span className="pill">👥 {employeeCount || 0} employees</span>
              {pendingCount > 0 && <span className="pill warn">⏳ {pendingCount} pending IDs</span>}
              <span className={'pill '+(hrIsConnected?'good':'warn')}>{hrIsConnected?'✓ HR connected':'⚠ Local salary data'}</span>
              <button onClick={()=>db.auth.signOut()} className="signout-btn">Sign Out</button>
            </div>
          </div>

          {!detailEmp && (
            <div className="mobile-section-picker">
              <select value={tab} onChange={e=>{setTab(e.target.value);setDetailEmp(null);}}>
                {PORTAL_NAV_GROUPS.map(group=>(
                  <optgroup key={group.title} label={group.title}>
                    {group.items.map(key=><option key={key} value={key}>{PORTAL_TAB_MAP[key].label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {showMig&&<MigrationBanner onDismiss={()=>{localStorage.setItem('satco_migration_v12','done');setShowMig(false);}} />}
          {showHrBridge&&<HrBridgeCampBanner onDismiss={()=>{localStorage.setItem('satco_hr_bridge_camp_v1','done');setShowHrBridge(false);}} />}
          {tempCandError && (
            <div className="alert-card danger">
              <b>Temporary HR candidates could not be loaded.</b> Temp-ID employees will appear once the HR candidate bridge/view is accessible.
              <div style={{marginTop:'4px',fontSize:'12px'}}>Technical detail: <code>{tempCandError}</code></div>
            </div>
          )}

          <PortalGuide active={detailEmp ? 'detail' : tab} />
          <div className="content-card">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

