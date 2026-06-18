// Single source of truth for the facts the chatbot is allowed to state about the
// clinic. Prices mirror the dashboard's invoice service list
// (app/dashboard/invoices/new/page.tsx). Amounts are in Pakistani Rupees (PKR).

export const CLINIC_INFO = {
  name: "Dr Tooth Dental Clinic",
  location: "Lahore, Pakistan",
  hours: "Monday–Saturday, 10:00 AM – 8:00 PM PKT (closed Sundays)",
  currency: "PKR",
}

export const SERVICES: { name: string; price: number }[] = [
  { name: "Consultation", price: 1000 },
  { name: "Root Canal", price: 15000 },
  { name: "Extraction", price: 3000 },
  { name: "Scaling", price: 5000 },
  { name: "Filling", price: 3000 },
  { name: "Crown", price: 15000 },
  { name: "Bridge", price: 20000 },
  { name: "Denture", price: 25000 },
  { name: "Whitening", price: 8000 },
  { name: "X-Ray", price: 1500 },
  { name: "Braces Adjustment", price: 5000 },
  { name: "Implant", price: 50000 },
  { name: "Veneer", price: 15000 },
  { name: "Gum Treatment", price: 5000 },
]
