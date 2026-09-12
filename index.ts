// supabase/functions/supplier-invoice-reminder/index.ts
// Deploy: supabase functions deploy supplier-invoice-reminder
// Schedule: runs daily at 04:00 UTC (08:00 UAE) via pg_cron — same job as daily-alert
//
// Secrets needed in Supabase Dashboard → Edge Functions → Secrets:
//   RESEND_API_KEY  — your Resend key
//   TELEGRAM_BOT_TOKEN — your Telegram bot token
//   TELEGRAM_CHAT_ID   — SATCO alert chat ID (-5190164133)
//   RESEND_TO_EMAIL    — recipient email (e.g. mail@satcoarabiaengg.com)
//   SUPABASE_URL       — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')!;
const TELEGRAM_BOT_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID    = Deno.env.get('TELEGRAM_CHAT_ID') || '-5190164133';
const RESEND_TO_EMAIL     = Deno.env.get('RESEND_TO_EMAIL') || 'mail@satcoarabiaengg.com';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function todayUAE(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }); // YYYY-MM-DD
}

function fmtAED(n: number): string {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function sendTelegram(message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
  });
}

async function sendEmail(subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'SATCO Finance <info@satcoarabiaengg.com>',
      to: [RESEND_TO_EMAIL],
      subject,
      html
    })
  });
}

serve(async (_req) => {
  try {
    const today = todayUAE();

    // ── 1. REMINDER — 3 days before due date ──────────────────────────────────
    const { data: reminders } = await sb
      .from('supplier_invoices')
      .select('*')
      .eq('reminder_date', today)
      .neq('status', 'Paid')
      .eq('alert_sent', false);

    // ── 2. OVERDUE — past due date, not paid ──────────────────────────────────
    const { data: overdue } = await sb
      .from('supplier_invoices')
      .select('*')
      .lt('due_date', today)
      .neq('status', 'Paid')
      .neq('status', 'Disputed');

    const allAlerts = [
      ...(reminders || []).map(i => ({ ...i, alertType: 'reminder' })),
      ...(overdue  || []).map(i => ({ ...i, alertType: 'overdue'  }))
    ];

    if (allAlerts.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No alerts today' }), { status: 200 });
    }

    // ── Build messages ─────────────────────────────────────────────────────────
    let telegramMsg = `🏗️ <b>SATCO Arabia — Supplier Invoice Alerts</b>\n📅 ${today}\n\n`;
    let emailRows = '';

    for (const inv of allAlerts) {
      const daysUntil = Math.ceil((new Date(inv.due_date).getTime() - new Date(today).getTime()) / 86400000);
      const isOverdue = inv.alertType === 'overdue';

      if (isOverdue) {
        telegramMsg += `🚨 <b>OVERDUE</b>\n`;
        telegramMsg += `  Supplier: ${inv.supplier_name}\n`;
        telegramMsg += `  Invoice: ${inv.invoice_number || '—'} | AED ${fmtAED(inv.total_amount)}\n`;
        telegramMsg += `  Due: ${fmtDate(inv.due_date)} (${Math.abs(daysUntil)} days ago)\n\n`;
        emailRows += `<tr style="background:#fef2f2"><td>${inv.supplier_name}</td><td>${inv.invoice_number||'—'}</td><td>AED ${fmtAED(inv.total_amount)}</td><td style="color:#dc2626;font-weight:bold">${fmtDate(inv.due_date)} 🚨 OVERDUE ${Math.abs(daysUntil)}d</td><td>${inv.status}</td></tr>`;
      } else {
        telegramMsg += `⚠️ <b>DUE IN ${daysUntil} DAYS</b>\n`;
        telegramMsg += `  Supplier: ${inv.supplier_name}\n`;
        telegramMsg += `  Invoice: ${inv.invoice_number || '—'} | AED ${fmtAED(inv.total_amount)}\n`;
        telegramMsg += `  Due: ${fmtDate(inv.due_date)} | Terms: ${inv.payment_terms}d\n\n`;
        emailRows += `<tr><td>${inv.supplier_name}</td><td>${inv.invoice_number||'—'}</td><td>AED ${fmtAED(inv.total_amount)}</td><td style="color:#d97706;font-weight:bold">${fmtDate(inv.due_date)} ⚠️ ${daysUntil}d left</td><td>${inv.status}</td></tr>`;
      }
    }

    telegramMsg += `📋 Action: Review in Finance Portal → Supplier Invoices`;

    const emailHtml = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
      <div style="background:#0a1628;padding:20px 24px;border-bottom:3px solid #c9a84c">
        <h2 style="color:#ffffff;margin:0;font-size:18px">SATCO Arabia — Supplier Invoice Alerts</h2>
        <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">${today}</p>
      </div>
      <div style="padding:20px 24px">
        <p style="color:#1a2540;font-size:14px">The following supplier invoices require attention:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead>
            <tr style="background:#0a1628;color:white">
              <th style="padding:10px 14px;text-align:left;font-size:12px">Supplier</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Invoice #</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Amount</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Due Date</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px">Status</th>
            </tr>
          </thead>
          <tbody>${emailRows}</tbody>
        </table>
        <div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px">
          <strong>Action required:</strong> Log into the Finance Portal → Supplier Invoices tab to approve and process payment.
        </div>
      </div>
      <div style="background:#f5f7fa;padding:14px 24px;font-size:12px;color:#64748b;border-top:1px solid #d1d9e6">
        SATCO Arabia General Contracting LLC — SPC · Abu Dhabi, UAE<br/>
        This is an automated alert from the SATCO Finance Portal.
      </div>
    </div>`;

    // ── Send ───────────────────────────────────────────────────────────────────
    await Promise.all([
      sendTelegram(telegramMsg),
      sendEmail(`⚠️ SATCO Invoice Alert — ${allAlerts.length} invoice(s) need attention`, emailHtml)
    ]);

    // Mark reminders as alert_sent = true (overdue keeps re-alerting daily)
    if (reminders && reminders.length > 0) {
      await sb.from('supplier_invoices')
        .update({ alert_sent: true, status: 'Due Soon' })
        .in('id', reminders.map(r => r.id));
    }

    return new Response(JSON.stringify({ ok: true, sent: allAlerts.length }), { status: 200 });

  } catch (err) {
    console.error('supplier-invoice-reminder error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
