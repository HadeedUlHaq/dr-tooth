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
            margin: 15mm 20mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        .print-invoice {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #111;
          background: #fff;
          padding: 0;
          max-width: 210mm;
          margin: 0 auto;
        }
        .print-invoice * {
          color: #111;
          background: transparent;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px;
          letter-spacing: 1px;
        }
        .header p {
          font-size: 12px;
          color: #555;
          margin: 2px 0;
        }
        .meta-grid {
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
          font-size: 13px;
        }
        .meta-grid .label {
          font-weight: 600;
          color: #333;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .meta-grid .value {
          color: #111;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .items-table th {
          background: #f5f5f5;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 10px 12px;
          text-align: left;
          border-bottom: 2px solid #ddd;
          color: #333;
        }
        .items-table th:last-child {
          text-align: right;
        }
        .items-table td {
          padding: 10px 12px;
          font-size: 13px;
          border-bottom: 1px solid #eee;
        }
        .items-table td:first-child {
          font-weight: 500;
        }
        .items-table td:last-child {
          text-align: right;
        }
        .totals {
          margin-left: auto;
          width: 280px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 13px;
        }
        .totals-row.total-line {
          border-top: 2px solid #333;
          font-weight: 700;
          font-size: 15px;
          padding-top: 10px;
          margin-top: 4px;
        }
        .totals-row.balance-line {
          border-top: 1px solid #ccc;
          padding-top: 8px;
          margin-top: 4px;
        }
        .discount-text {
          color: #c00;
        }
        .paid-text {
          color: #059669;
        }
        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-unpaid { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .status-partial { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
        .status-paid { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
        .payments-section {
          margin-top: 24px;
          font-size: 12px;
        }
        .payments-section h3 {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .payment-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #888;
          border-top: 1px solid #ddd;
          padding-top: 16px;
        }
      `}</style>

      <div className="header">
        <h1>DR TOOTH DENTAL CLINIC</h1>
        <p>Come Smile With Us</p>
      </div>

      <div className="meta-grid">
        <div>
          <div className="label">Invoice To</div>
          <div className="value" style={{ fontWeight: 600 }}>{invoice.patientName}</div>
          {invoice.patientPhone && <div className="value">{invoice.patientPhone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label">Invoice Details</div>
          <div className="value">#{invoice.id.slice(0, 8).toUpperCase()}</div>
          <div className="value">{formatDate(invoice.date)}</div>
          <div style={{ marginTop: 4 }}>
            <span className={`status-badge status-${invoice.status}`}>{invoice.status}</span>
          </div>
        </div>
      </div>

      <table className="items-table">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>#</th>
            <th style={{ width: "60%" }}>Service</th>
            <th style={{ width: "30%" }}>Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((item, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{item.serviceName}</td>
              <td>{item.price.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div className="totals-row">
          <span>Subtotal</span>
          <span>Rs. {invoice.subtotal.toLocaleString()}</span>
        </div>
        {invoice.discountValue > 0 && (
          <div className="totals-row">
            <span>
              Discount {invoice.discountType === "percent" ? `(${invoice.discountValue}%)` : ""}
            </span>
            <span className="discount-text">- Rs. {discountAmount.toLocaleString()}</span>
          </div>
        )}
        <div className="totals-row total-line">
          <span>Total</span>
          <span>Rs. {invoice.total.toLocaleString()}</span>
        </div>
        {invoice.amountPaid > 0 && (
          <div className="totals-row">
            <span>Amount Paid</span>
            <span className="paid-text">Rs. {invoice.amountPaid.toLocaleString()}</span>
          </div>
        )}
        <div className="totals-row balance-line">
          <span style={{ fontWeight: 600 }}>Balance Due</span>
          <span style={{ fontWeight: 600 }}>Rs. {invoice.balanceDue.toLocaleString()}</span>
        </div>
      </div>

      {invoice.payments.length > 0 && (
        <div className="payments-section">
          <h3>Payment History</h3>
          {invoice.payments.map((p, i) => (
            <div key={p.id || i} className="payment-row">
              <span>
                {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {p.method}
              </span>
              <span>Rs. {p.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="footer">
        <p>Thank you for choosing Dr Tooth Dental Clinic</p>
        <p>This is a computer-generated invoice</p>
      </div>
    </div>
  )
}
