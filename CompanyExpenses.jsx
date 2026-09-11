// ============================================================
// CompanyExpenses.jsx  —  SATCO Finance Portal
// Drop this file into src/tabs/ and register the tab in App.jsx
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client (reuse env vars already in your project) ──
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Constants ─────────────────────────────────────────────────
const CATEGORIES = [
  "Rent",
  "Commission",
  "Bank Charges",
  "PRO / Govt Fees",
  "Office Supplies",
  "Utilities",
  "Insurance",
  "Vehicle / Fuel",
  "Marketing",
  "Legal / Audit",
  "Other",
];

const PAYMENT_MODES = ["Bank Transfer", "Cheque", "Cash", "Card"];

const EMPTY_FORM = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: "",
  sub_category: "",
  payee: "",
  amount_aed: "",
  payment_mode: "",
  reference_no: "",
  recoverable: false,
  recovered_amount: "",
  client_id: "",
  notes: "",
};

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(d.toISOString().slice(0, 7));
  }
  return opts;
}

// ── Main Component ────────────────────────────────────────────
export default function CompanyExpenses() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("ledger"); // "ledger" | "summary" | "add"
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [filterCat, setFilterCat] = useState("All");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // ── Fetch ledger ──
  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErr(null);
    let q = supabase
      .from("company_expenses")
      .select("*")
      .eq("month_year", filterMonth)
      .order("expense_date", { ascending: false });
    if (filterCat !== "All") q = q.eq("category", filterCat);
    const { data, error } = await q;
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [filterMonth, filterCat]);

  // ── Fetch monthly summary ──
  const fetchSummary = useCallback(async () => {
    const { data, error } = await supabase
      .from("company_expenses_monthly_summary")
      .select("*")
      .order("month_year", { ascending: false });
    if (!error) setSummary(data || []);
  }, []);

  useEffect(() => {
    fetchRows();
    fetchSummary();
  }, [fetchRows, fetchSummary]);

  // ── Save (insert or update) ──
  const handleSave = async () => {
    if (!form.category || !form.amount_aed || !form.expense_date) {
      setErr("Date, Category and Amount are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      expense_date: form.expense_date,
      category: form.category,
      sub_category: form.sub_category || null,
      payee: form.payee || null,
      amount_aed: parseFloat(form.amount_aed),
      payment_mode: form.payment_mode || null,
      reference_no: form.reference_no || null,
      recoverable: form.recoverable,
      recovered_amount: form.recoverable
        ? parseFloat(form.recovered_amount || 0)
        : 0,
      client_id: form.recoverable ? form.client_id || null : null,
      notes: form.notes || null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase
        .from("company_expenses")
        .update(payload)
        .eq("id", editId));
    } else {
      ({ error } = await supabase.from("company_expenses").insert(payload));
    }

    setSaving(false);
    if (error) {
      setErr(error.message);
    } else {
      setForm(EMPTY_FORM);
      setEditId(null);
      setView("ledger");
      fetchRows();
      fetchSummary();
    }
  };

  const startEdit = (row) => {
    setForm({
      expense_date: row.expense_date,
      category: row.category,
      sub_category: row.sub_category || "",
      payee: row.payee || "",
      amount_aed: row.amount_aed,
      payment_mode: row.payment_mode || "",
      reference_no: row.reference_no || "",
      recoverable: row.recoverable,
      recovered_amount: row.recovered_amount || "",
      client_id: row.client_id || "",
      notes: row.notes || "",
    });
    setEditId(row.id);
    setView("add");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("company_expenses")
      .delete()
      .eq("id", deleteId);
    setDeleteId(null);
    if (!error) { fetchRows(); fetchSummary(); }
  };

  // ── Totals for current filter ──
  const totalAed = rows.reduce((s, r) => s + parseFloat(r.amount_aed || 0), 0);
  const totalRec = rows.reduce((s, r) => s + parseFloat(r.recovered_amount || 0), 0);
  const netCost  = totalAed - totalRec;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏢 Company Expenses</h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
            Rent · Commissions · Bank Charges · PRO Fees · Office Overheads
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditId(null); setView("add"); }}
          style={{ background: "#1a56db", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontWeight: 600 }}
        >
          + Add Expense
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["ledger", "summary"].map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            style={{
              padding: "6px 18px", border: "none", borderRadius: 6, cursor: "pointer",
              background: view === t ? "#1a56db" : "#e5e7eb", color: view === t ? "#fff" : "#374151",
              fontWeight: view === t ? 700 : 400,
            }}
          >
            {t === "ledger" ? "📋 Ledger" : "📊 Monthly Summary"}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
          ⚠ {err}
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {view === "add" && (
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px" }}>{editId ? "✏️ Edit Expense" : "➕ New Expense"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Date *">
              <input type="date" value={form.expense_date}
                onChange={e => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <Field label="Category *">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Sub-category">
              <input type="text" placeholder="e.g. Office Lease – MBZ" value={form.sub_category}
                onChange={e => setForm({ ...form, sub_category: e.target.value })} />
            </Field>
            <Field label="Payee / Vendor">
              <input type="text" placeholder="e.g. Al Farida Real Estate" value={form.payee}
                onChange={e => setForm({ ...form, payee: e.target.value })} />
            </Field>
            <Field label="Amount (AED) *">
              <input type="number" min="0" step="0.01" value={form.amount_aed}
                onChange={e => setForm({ ...form, amount_aed: e.target.value })} />
            </Field>
            <Field label="Payment Mode">
              <select value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
                <option value="">Select…</option>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference / Cheque No.">
              <input type="text" value={form.reference_no}
                onChange={e => setForm({ ...form, reference_no: e.target.value })} />
            </Field>
            <Field label="Notes">
              <input type="text" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Field label="Recoverable from Client?">
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={form.recoverable}
                  onChange={e => setForm({ ...form, recoverable: e.target.checked })} />
                Yes — recoverable
              </label>
            </Field>
            {form.recoverable && (
              <>
                <Field label="Recovered Amount (AED)">
                  <input type="number" min="0" step="0.01" value={form.recovered_amount}
                    onChange={e => setForm({ ...form, recovered_amount: e.target.value })} />
                </Field>
                <Field label="Client">
                  <input type="text" placeholder="Client name / code" value={form.client_id}
                    onChange={e => setForm({ ...form, client_id: e.target.value })} />
                </Field>
              </>
            )}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ background: "#1a56db", color: "#fff", border: "none", borderRadius: 6, padding: "8px 22px", cursor: "pointer", fontWeight: 600 }}>
              {saving ? "Saving…" : editId ? "Update" : "Save"}
            </button>
            <button onClick={() => { setView("ledger"); setForm(EMPTY_FORM); setEditId(null); setErr(null); }}
              style={{ background: "#e5e7eb", border: "none", borderRadius: 6, padding: "8px 18px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── LEDGER VIEW ── */}
      {view === "ledger" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}>
              {monthOptions().map(m => <option key={m}>{m}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}>
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Totals bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <StatChip label="Total Spent" value={`AED ${fmt(totalAed)}`} color="#1e40af" />
            <StatChip label="Recovered" value={`AED ${fmt(totalRec)}`} color="#065f46" />
            <StatChip label="Net Cost" value={`AED ${fmt(netCost)}`} color={netCost > 0 ? "#9a3412" : "#065f46"} />
          </div>

          {/* Table */}
          {loading ? (
            <p style={{ color: "#6b7280" }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No expenses recorded for {filterMonth}{filterCat !== "All" ? ` · ${filterCat}` : ""}.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    {["Date","Category","Sub-cat","Payee","Amount (AED)","Mode","Ref","Recovered","Notes",""].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <Td>{r.expense_date}</Td>
                      <Td><span style={{ background: catColor(r.category), color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace:"nowrap" }}>{r.category}</span></Td>
                      <Td>{r.sub_category || "—"}</Td>
                      <Td>{r.payee || "—"}</Td>
                      <Td align="right" bold>{fmt(r.amount_aed)}</Td>
                      <Td>{r.payment_mode || "—"}</Td>
                      <Td>{r.reference_no || "—"}</Td>
                      <Td align="right" color={r.recovered_amount > 0 ? "#065f46" : "#9ca3af"}>
                        {r.recoverable ? fmt(r.recovered_amount) : "—"}
                      </Td>
                      <Td>{r.notes || "—"}</Td>
                      <Td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <Btn onClick={() => startEdit(r)} color="#1a56db">Edit</Btn>
                          <Btn onClick={() => setDeleteId(r.id)} color="#dc2626">Del</Btn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MONTHLY SUMMARY VIEW ── */}
      {view === "summary" && (
        <>
          <h3 style={{ marginBottom: 12 }}>Monthly Expense Summary — All Categories</h3>
          {summary.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No data yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    {["Month","Category","Entries","Total (AED)","Recovered (AED)","Net Cost (AED)"].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <Td><b>{r.month_year}</b></Td>
                      <Td><span style={{ background: catColor(r.category), color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{r.category}</span></Td>
                      <Td align="center">{r.entry_count}</Td>
                      <Td align="right">{fmt(r.total_aed)}</Td>
                      <Td align="right" color="#065f46">{fmt(r.total_recovered)}</Td>
                      <Td align="right" bold color={r.net_cost > 0 ? "#9a3412" : "#065f46"}>{fmt(r.net_cost)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
        }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, maxWidth: 360, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
            <p style={{ fontWeight: 700, fontSize: 16 }}>Delete this expense?</p>
            <p style={{ color: "#6b7280", fontSize: 13 }}>This cannot be undone.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
              <button onClick={handleDelete}
                style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontWeight: 600 }}>
                Delete
              </button>
              <button onClick={() => setDeleteId(null)}
                style={{ background: "#e5e7eb", border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {React.cloneElement(children, {
        style: {
          padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6,
          fontSize: 13, width: "100%", boxSizing: "border-box", ...(children.props.style || {})
        }
      })}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{children}</th>;
}

function Td({ children, align = "left", bold = false, color }) {
  return (
    <td style={{ padding: "7px 10px", borderBottom: "1px solid #f3f4f6", textAlign: align, fontWeight: bold ? 700 : 400, color: color || "inherit", whiteSpace: "nowrap" }}>
      {children}
    </td>
  );
}

function Btn({ children, onClick, color }) {
  return (
    <button onClick={onClick}
      style={{ background: color, color: "#fff", border: "none", borderRadius: 4, padding: "3px 9px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
      {children}
    </button>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 16px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function catColor(cat) {
  const map = {
    "Rent": "#1e40af", "Commission": "#7c3aed", "Bank Charges": "#0369a1",
    "PRO / Govt Fees": "#0f766e", "Office Supplies": "#854d0e", "Utilities": "#1d4ed8",
    "Insurance": "#0e7490", "Vehicle / Fuel": "#4338ca", "Marketing": "#be185d",
    "Legal / Audit": "#b45309", "Other": "#6b7280",
  };
  return map[cat] || "#6b7280";
}
