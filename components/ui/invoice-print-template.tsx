import type { Invoice } from "@/lib/types"

interface InvoicePrintTemplateProps {
  invoice: Invoice
}

export default function InvoicePrintTemplate({ invoice }: InvoicePrintTemplateProps) {
  const formatDate = (dateStr: string) => {
    try {
      const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00")
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    } catch {
      return dateStr
    }
  }

  const discountAmount =
    invoice.discountType === "percent"
      ? Math.round((invoice.subtotal * invoice.discountValue) / 100)
      : invoice.discountValue || 0

  return (
    <div className="print-invoice">
      <style jsx>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 18mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        /* ── Base ─────────────────────────────────────────── */
        .print-invoice {
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #1a1a2e;
          background: #fff;
          max-width: 210mm;
          margin: 0 auto;
        }
        .print-invoice * { box-sizing: border-box; }

        /* ── Header ───────────────────────────────────────── */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 20px;
          margin-bottom: 20px;
          border-bottom: 3px solid #1a1a2e;
        }
        .header-left {
          display: flex;
          flex-direction: column; /* Changed to stack vertically */
          align-items: flex-start; /* Aligns logo and text to the left */
          gap: 8px; /* Space between logo and text */
        }
        .clinic-logo {
          height: 60px;
          width: auto;
          object-fit: contain;
          flex-shrink: 0;
        }
        .clinic-info { line-height: 1.3; }
        .clinic-name {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.4px;
          margin: 0 0 3px;
          color: #1a1a2e;
        }
        .clinic-tagline {
          font-size: 11px;
          color: #777;
          font-style: italic;
          margin: 0;
        }

        .header-right { text-align: right; }
        .invoice-word {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #1a1a2e;
          margin: 0 0 6px;
          line-height: 1;
        }
        .invoice-num {
          font-size: 12px;
          font-weight: 700;
          color: #555;
          margin: 0 0 2px;
          letter-spacing: 0.3px;
        }
        .invoice-date-text {
          font-size: 12px;
          color: #777;
          margin: 0 0 6px;
        }
        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .status-unpaid  { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
        .status-partial { background:#fffbeb; color:#d97706; border:1px solid #fde68a; }
        .status-paid    { background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; }

        /* ── Patient strip ────────────────────────────────── */
        .patient-strip {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: #f4f5f7;
          border-radius: 8px;
          padding: 14px 18px;
          margin-bottom: 24px;
        }
        .strip-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #999;
          margin: 0 0 5px;
        }
        .patient-name-text {
          font-size: 17px;
          font-weight: 700;
          color: #1a1a2e;
          margin: 0 0 2px;
        }
        .patient-phone-text {
          font-size: 12px;
          color: #666;
          margin: 0;
        }
        .strip-right { text-align: right; }
        .strip-date-text {
          font-size: 13px;
          color: #444;
          font-weight: 500;
          margin: 0;
        }

        /* ── Items table ──────────────────────────────────── */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 13px;
        }
        .items-table thead tr {
          background: #1a1a2e;
        }
        .items-table th {
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #fff;
          border: none;
          text-align: left;
        }
        .items-table th.col-num     { width: 5%;  }
        .items-table th.col-service { width: 43%; }
        .items-table th.col-price   { width: 20%; text-align: right; }
        .items-table th.col-qty     { width: 12%; text-align: center; }
        .items-table th.col-total   { width: 20%; text-align: right; }

        .items-table tbody tr:nth-child(even) { background: #f8f9fb; }
        .items-table tbody tr:nth-child(odd)  { background: #fff; }

        .items-table td {
          padding: 10px 12px;
          border-bottom: 1px solid #e8eaed;
          color: #333;
          vertical-align: middle;
        }
        .items-table td.col-num     { color: #aaa; font-size: 11px; }
        .items-table td.col-service { font-weight: 500; color: #1a1a2e; }
        .items-table td.col-price   { text-align: right; color: #666; }
        .items-table td.col-qty     { text-align: center; font-weight: 700; color: #1a1a2e; }
        .items-table td.col-total   { text-align: right; font-weight: 700; color: #1a1a2e; }

        /* ── Totals box ───────────────────────────────────── */
        .totals-wrapper {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }
        .totals-box {
          width: 290px;
          border: 1px solid #e0e2e6;
          border-radius: 10px;
          overflow: hidden;
        }
        .t-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          font-size: 13px;
          border-bottom: 1px solid #f0f0f0;
        }
        .t-row:last-child { border-bottom: none; }
        .t-row .t-label { color: #666; }
        .t-row .t-value { font-weight: 600; color: #1a1a2e; }
        .t-row.t-discount .t-value { color: #c00; }
        .t-row.t-paid    .t-value  { color: #059669; }

        .t-row.t-grand {
          background: #1a1a2e;
          padding: 13px 16px;
          border-bottom: none;
        }
        .t-row.t-grand .t-label { color: #c0c4d0; font-size: 14px; font-weight: 700; }
        .t-row.t-grand .t-value { color: #fff; font-size: 17px; font-weight: 800; }

        .t-row.t-balance {
          background: #f8f9fb;
          padding: 11px 16px;
        }
        .t-row.t-balance .t-label { font-weight: 700; color: #333; font-size: 13px; }
        .t-row.t-balance .t-value { font-size: 15px; }
        .balance-red   { color: #dc2626; }
        .balance-green { color: #059669; }

        /* ── Payment history ──────────────────────────────── */
        .payments-section {
          border-top: 1px solid #e8eaed;
          padding-top: 18px;
          margin-top: 4px;
        }
        .payments-section h3 {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #aaa;
          margin: 0 0 10px;
        }
        .payment-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 0;
          border-bottom: 1px solid #f5f5f5;
          font-size: 12px;
        }
        .payment-row:last-child { border-bottom: none; }
        .payment-left  { color: #666; }
        .payment-right { font-weight: 700; color: #1a1a2e; }

        /* ── Footer ───────────────────────────────────────── */
        .footer {
          margin-top: 36px;
          padding-top: 14px;
          border-top: 1px solid #e8eaed;
          text-align: center;
        }
        .footer-tagline {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a2e;
          margin: 0 0 4px;
        }
        .footer-note {
          font-size: 10px;
          color: #bbb;
          margin: 0;
          letter-spacing: 0.3px;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/drtooth.png" alt="Dr. Tooth Clinic" className="clinic-logo" />
          <div className="clinic-info">
            <p className="clinic-name">DR TOOTH DENTAL CLINIC</p>
            <p className="clinic-tagline">Come Smile With Us</p>
          </div>
        </div>
        <div className="header-right">
          <p className="invoice-word">Invoice</p>
          <p className="invoice-num">#{invoice.id.slice(0, 8).toUpperCase()}</p>
          <p className="invoice-date-text">{formatDate(invoice.date)}</p>
          <span className={`status-badge status-${invoice.status}`}>{invoice.status}</span>
        </div>
      </div>

      {/* ── Patient strip ── */}
      <div className="patient-strip">
        <div>
          <p className="strip-label">Bill To</p>
          <p className="patient-name-text">{invoice.patientName}</p>
          {invoice.patientPhone && <p className="patient-phone-text">{invoice.patientPhone}</p>}
        </div>
        <div className="strip-right">
          <p className="strip-label">Invoice Date</p>
          <p className="strip-date-text">{formatDate(invoice.date)}</p>
        </div>
      </div>

      {/* ── Line items ── */}
      <table className="items-table">
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th className="col-service">Treatment / Service</th>
            <th className="col-price">Unit Price</th>
            <th className="col-qty">Qty</th>
            <th className="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((item, i) => {
            const qty = item.quantity || 1
            const rowTotal = item.price * qty
            return (
              <tr key={i}>
                <td className="col-num">{i + 1}</td>
                <td className="col-service">{item.serviceName}</td>
                <td className="col-price">Rs. {item.price.toLocaleString()}</td>
                <td className="col-qty">{qty}</td>
                <td className="col-total">Rs. {rowTotal.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div className="totals-wrapper">
        <div className="totals-box">
          <div className="t-row">
            <span className="t-label">Subtotal</span>
            <span className="t-value">Rs. {invoice.subtotal.toLocaleString()}</span>
          </div>
          {invoice.discountValue > 0 && (
            <div className="t-row t-discount">
              <span className="t-label">
                Discount{invoice.discountType === "percent" ? ` (${invoice.discountValue}%)` : ""}
              </span>
              <span className="t-value">− Rs. {discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="t-row t-grand">
            <span className="t-label">Total</span>
            <span className="t-value">Rs. {invoice.total.toLocaleString()}</span>
          </div>
          {invoice.amountPaid > 0 && (
            <div className="t-row t-paid">
              <span className="t-label">Amount Paid</span>
              <span className="t-value">Rs. {invoice.amountPaid.toLocaleString()}</span>
            </div>
          )}
          <div className="t-row t-balance">
            <span className="t-label">Balance Due</span>
            <span className={`t-value ${invoice.balanceDue > 0 ? "balance-red" : "balance-green"}`}>
              Rs. {invoice.balanceDue.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Payment history ── */}
      {invoice.payments.length > 0 && (
        <div className="payments-section">
          <h3>Payment History</h3>
          {invoice.payments.map((p, i) => (
            <div key={p.id || i} className="payment-row">
              <span className="payment-left">
                {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {p.method}
                {p.recordedByName ? ` · ${p.recordedByName}` : ""}
              </span>
              <span className="payment-right">Rs. {p.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="footer">
        <p className="footer-tagline">Thank you for choosing Dr Tooth Dental Clinic</p>
        <p className="footer-note">This is a computer-generated invoice · No signature required</p>
      </div>
    </div>
  )
}