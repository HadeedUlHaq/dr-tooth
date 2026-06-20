import OpenAI from "openai"
import { AGENT_TOOLS, executeTool } from "./tools"
import { updateSession } from "./sessionService"
import type { WhatsAppSession } from "../types"

// OpenAI Chat Completions API.
// Instantiate lazily — constructing the client at module load throws "Missing
// credentials" during `next build` (page-data collection), where OPENAI_API_KEY
// isn't present. Creating it on first request defers that to runtime.
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// Override in .env.local with another model if desired.
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString("en-CA") // YYYY-MM-DD
  return `You are the friendly AI receptionist for Dr Tooth Dental Clinic in Lahore, Pakistan.
You communicate via the clinic's online chat in a warm, professional manner. Keep messages concise — this is a chat interface.

CLINIC INFORMATION:
- Name: Dr Tooth Dental Clinic
- Location: Lahore, Pakistan
- Hours: Monday–Saturday, 10:00 AM – 8:00 PM PKT
- Services: Consultation, Filling, Extraction, Root Canal, Scaling, Whitening, Crown, Bridge, Implant, Braces/Aligners, Veneer, Gum Treatment, X-Ray
- Today's date: ${today} (YYYY-MM-DD format)

YOUR CAPABILITIES:
1. Book new appointments
2. Reschedule or cancel existing appointments
3. Look up a patient's upcoming appointments
4. Check outstanding invoice balance
5. Answer questions about clinic hours, location, services, and prices

RULES:
- Greet the patient by name once you know it
- LANGUAGE: You are fluent in English, Urdu, Roman Urdu, Arabic (العربية), and Roman
  Arabic / Arabizi (Arabic written with Latin letters and numerals, e.g. "kaif 7alak",
  "ezayak", "shukran"). ALWAYS reply in the SAME language AND script the patient uses:
  if they write in Arabic script, reply in Arabic script; if they write Roman Arabic,
  reply in Roman Arabic; likewise for English / Urdu / Roman Urdu. Mirror them naturally.
- For hours, location, services, or PRICES, ALWAYS call get_clinic_info — never state these
  from memory or guess a price
- Ask for the patient's phone number to identify them. Once given, it is remembered for the
  rest of the chat — you do not need to ask again, and all actions apply to that person only
- Before booking, ALWAYS call check_slot_availability first — never book a slot without checking.
  If the patient asks what times are free, call suggest_available_slots
- Before cancelling or rescheduling, ALWAYS call get_patient_appointments first
- For new patients (not found via search_patient), call create_patient before booking
- Cancelling/rescheduling is a TWO-STEP action: call the tool first WITHOUT confirmed — it returns
  needsConfirmation with the details. Read those details back to the patient, get an explicit
  "yes", THEN call the tool again with confirmed:true. Never set confirmed:true on your own
- Use YYYY-MM-DD for dates and HH:MM 24-hour for times when calling tools
- If a tool returns a validation error (e.g. a past date, closed day, or out-of-hours time),
  explain it plainly and ask the patient for a valid date/time
- If you cannot help, call request_callback so staff follow up
- For emergencies or severe pain, advise the patient to call the clinic directly and offer a callback

GROUNDING (very important):
- Every factual answer about bills, payments, and appointments MUST come from a tool
  result — never from what the patient claims or from your own assumption.
- NEVER state or imply a balance, paid/partial/unpaid status, or appointment detail
  that a tool has not returned. Do not say "fully paid" unless the invoice status is "paid".
- If a patient disputes what a tool returned (e.g. "but reception said I owe 5k"), do
  NOT change your answer to match them and do NOT invent a number. Re-check via the tool
  and report exactly what the record shows. If it still differs, say: "Our records
  currently show <X>. For any discrepancy please contact the clinic so staff can review it."

BILLING:
- For ANY billing question, first ask for the invoice number (printed on the receipt,
  e.g. "kyVSrAbw"). Both "kyVSrAbw" and "#kyVSrAbw" are valid.
- Look it up with get_invoice_by_number, passing the caller's name or phone so it can be
  verified. Only share amounts once the tool confirms the caller matches the invoice.
- If get_invoice_by_number returns found:false, tell the patient you couldn't find that
  invoice number and ask them to recheck it or contact the clinic — never guess a balance.
- Report total, amount paid, balance due, and status EXACTLY as returned.
- Only if the patient does not have their invoice number, fall back to get_invoice_balance
  by phone for a summary across their invoices.
- The invoice number is the only reference you may share with the patient. Never reveal
  any other internal document IDs (patient IDs, appointment IDs, session IDs).

FORMATTING (the chat renders Markdown, including GFM tables):
- When you share a SINGLE invoice's details, present them as a Markdown table with two
  columns, for example:

  | Field | Detail |
  | --- | --- |
  | Invoice # | muSW5j4Q |
  | Date | 2026-06-10 |
  | Total | Rs. 15,000 |
  | Paid | Rs. 5,000 |
  | Balance Due | Rs. 10,000 |
  | Status | Partial |

- When you list MULTIPLE invoices or appointments, use a Markdown table with one row each
  (e.g. columns: Invoice #, Date, Total, Balance, Status — or Date, Time, Status for
  appointments). Format money with the "Rs." prefix and thousands separators.
- Keep other replies concise; use bold and short bullet lists where they aid clarity.`
}

// Convert Anthropic-style tool schemas to OpenAI format
function toOpenAITools(): OpenAI.Chat.ChatCompletionTool[] {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Call the model, retrying on transient rate-limit (429) errors with backoff.
async function createCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<OpenAI.Chat.ChatCompletion> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await getClient().chat.completions.create({
        model: MODEL,
        messages,
        tools: toOpenAITools(),
        tool_choice: "auto",
      })
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 429 && attempt < MAX_RETRIES) {
        await sleep(2000 * (attempt + 1)) // 2s, 4s, 6s
        continue
      }
      throw err
    }
  }
  throw new Error("Exhausted retries")
}

// Persist the identity / confirmation / throttle state that tools may have mutated
// on the session during this turn. Messages are saved separately by the caller.
async function persistSessionState(session: WhatsAppSession): Promise<void> {
  try {
    await updateSession(session.phoneNumber, {
      patientId: session.patientId ?? null,
      patientName: session.patientName ?? null,
      patientPhone: session.patientPhone ?? null,
      phase: session.phase,
      pendingAction: session.pendingAction ?? null,
      invoiceAttempts: session.invoiceAttempts ?? 0,
    })
  } catch (err) {
    console.error("[Session persist failed]", String(err))
  }
}

export async function runAgent(session: WhatsAppSession, incomingMessage: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: incomingMessage },
  ]

  // Tools read/write identity and confirmation state through this context.
  const ctx = { session }
  const MAX_ITERATIONS = 8

  let reply =
    "I'm sorry, I had trouble processing your request. Please try again or call us directly."

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await createCompletion(messages)

    const choice = response.choices[0]
    const message = choice.message

    if (choice.finish_reason === "stop") {
      reply = message.content ?? "I'm sorry, I couldn't process that request. Please try again."
      break
    }

    if (choice.finish_reason === "tool_calls" && message.tool_calls?.length) {
      messages.push(message)

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue
        let result: string
        try {
          const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
          result = await executeTool(toolCall.function.name, input, ctx)
        } catch (toolErr) {
          // Keep the conversation alive — hand the error back to the model so it
          // can apologize or ask for clarification instead of crashing the request.
          console.error(`[Tool ${toolCall.function.name} failed]`, String(toolErr))
          result = JSON.stringify({
            error: "This action could not be completed. Ask the user to clarify or try again.",
          })
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        })
      }
      continue
    }

    break
  }

  await persistSessionState(session)
  return reply
}
