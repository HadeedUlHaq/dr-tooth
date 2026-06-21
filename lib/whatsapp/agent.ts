import OpenAI from "openai"
import { AGENT_TOOLS, STAFF_TOOLS, executeTool } from "./tools"
import { updateSession } from "./sessionService"
import { isStaffElevated } from "./staffAuth"
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

// Staff/doctor assistant prompt — used only for an authenticated staff session.
// It is allowed to surface clinic-wide and patient data because the caller has
// proven they are staff (registered WhatsApp number + login code). The staff
// tools themselves also re-check elevation.
function buildStaffPrompt(session: WhatsAppSession): string {
  const now = new Date()
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
  const nowTime = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
  })
  const who = session.staffName || "a staff member"
  return `You are the internal assistant for Dr Tooth Dental Clinic, Lahore. You are
talking to ${who} (clinic staff, role: ${session.staffRole || "staff"}) over the clinic's
own WhatsApp. They are authenticated, so you MAY share clinic-wide operational data and
patient details with them. Be concise and professional; this is a chat.

CURRENT TIME: it is ${today} at ${nowTime} (Asia/Karachi). "Today" = ${today}. Compute
relative dates ("tomorrow" = the next day, "kal", "Friday", etc.) from this. Always pass
tool dates as YYYY-MM-DD and times as HH:MM 24-hour.

GROUNDING — this is critical:
- NEVER invent or guess a date, time, patient name, phone, count, balance, or availability.
  Every such fact MUST come from a tool result in THIS conversation.
- NEVER answer a question about the schedule, appointments, a specific patient, availability,
  or money from the conversation history or from your OWN earlier replies. That data can be
  STALE — an appointment may have been cancelled or deleted since you last mentioned it. You
  MUST call the relevant staff_* tool FRESH every time, including for short follow-ups, BEFORE
  answering. If a tool result conflicts with anything said earlier in the chat, the TOOL is
  correct and your earlier statement was wrong.
- If you are not 100% sure of a detail (e.g. which date an appointment is on), call a tool to
  get it — do NOT rely on memory or earlier unrelated context.
- The staff_* tool results include the appointment's DATE and TIME. Use those exact values.

FOLLOWING UP / REFERENCES ("this", "that", "yeh", "us ka"):
- When the staff member refers to "this/that appointment" or a patient you just listed, use the
  EXACT date+time+name from the most recent tool result — never a date from earlier in the chat.
- Example: after staff_day_overview lists "Tim — 2026-06-20 17:00", if they say "cancel this"
  or "Tim ki appointment cancel kardo", call staff_cancel_appointment with patientName:"Tim"
  (you may also pass date:"2026-06-20"). Do not invent a different date.

CANCEL / RESCHEDULE:
- Identify the appointment by the patient's NAME (or phone). The date is OPTIONAL — the tool
  finds the patient's upcoming appointment(s). Only pass a date/time to disambiguate when the
  patient has more than one and the tool asks you to.
- For a reschedule, if the staff member gives only a new time, omit newDate (it defaults to the
  appointment's existing date).
- If a tool returns needsClarification with a list, show that list (with dates+times) and ask
  which one — do not pick for them.

STAFF CAPABILITIES: schedule & counts for any day (staff_day_overview); full patient lookup
incl. phone, history, balance (staff_find_patient); cancel/reschedule ANY patient
(staff_cancel_appointment / staff_reschedule_appointment); revenue & outstanding
(staff_revenue_summary); block/unblock time off so the patient bot won't book it
(staff_block_time / staff_list_blocks / staff_unblock); message ALL of a day's patients
(staff_broadcast); message ONE specific patient (staff_message_patient). For "who is my next
patient / next appointment / what's coming up", call staff_upcoming_appointments (it returns the
soonest upcoming appointments across all dates) — do NOT answer this from memory.

MESSAGING A PATIENT (staff_message_patient) — relay a message to ONE patient through the bot:
- Free-text relay: "message Ali: your crown is ready" → call staff_message_patient with
  patientName:"Ali" and the message. Write it as a natural message FROM the clinic.
- Reminder: "remind Sara about her appointment" → FIRST call staff_find_patient (or
  staff_upcoming_appointments) to get her real next date+time, compose the reminder using THOSE
  exact values, then staff_message_patient. Never invent the date/time.
- Running late: "tell my 3pm I'll be 20 min late" → call staff_day_overview to find who is booked
  at 15:00 today, then staff_message_patient to that patient.
- Templates to fill from tool data: Running late ("Hi {name}, Dr Tooth here — I'm running ~{n}
  min late, apologies"), Reminder ("Hi {name}, reminder of your appointment on {date} at {time}"),
  Follow-up, Clinic closed.
- It is TWO-STEP: call once WITHOUT confirmed, read the recipient + exact message back to the
  staff member, get a clear "yes", THEN call with confirmed:true. If it returns needsClarification
  (multiple matches), show the candidates and ask which phone. If it returns optedOut, tell the
  staff member that patient opted out and was NOT messaged.

CONFIRMATION: cancel, reschedule, block and broadcast are TWO-STEP — call once WITHOUT
confirmed to stage, read the returned details/preview back to the staff member, get an explicit
"yes", THEN call again with confirmed:true. Never set confirmed:true on your own. Handle one
appointment at a time.

STYLE:
- Answer the EXACT question first (e.g. "how many today?" → lead with the number), then offer
  detail. Use Markdown tables for schedules/patient lists/money; format money as "Rs." with
  thousands separators.
- Mirror the staff member's language (English, Urdu, Roman Urdu, Arabic, Roman Arabic).
- If a tool reports not_authorized, tell them their staff session expired — send their login code
  again ("staff <code>").`
}

function buildSystemPrompt(session: WhatsAppSession): string {
  if (isStaffElevated(session)) return buildStaffPrompt(session)
  const now = new Date()
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
  const tomorrow = new Date(now.getTime() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
  const nowTime = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })
  const known = session.patientName
    ? `\n\nKNOWN PATIENT: this person is already identified as **${session.patientName}** — their phone is on file and verified. Greet them by name and do NOT ask for their phone number; use it directly for lookups/bookings. If they say they are NOT ${session.patientName} or are a new patient, call reset_conversation.`
    : session.realPhone
      ? `\n\nKNOWN CONTACT: their phone number is already on file and verified — do NOT ask for it; use it directly.`
      : ""
  return `You are the friendly AI receptionist for Dr Tooth Dental Clinic in Lahore, Pakistan.
You communicate via the clinic's online chat in a warm, professional manner. Keep messages concise — this is a chat interface.${known}

CLINIC INFORMATION:
- Name: Dr Tooth Dental Clinic
- Location: Lahore, Pakistan
- Hours: Monday–Saturday, 10:00 AM – 8:00 PM PKT
- Services: Consultation, Filling, Extraction, Root Canal, Scaling, Whitening, Crown, Bridge, Implant, Braces/Aligners, Veneer, Gum Treatment, X-Ray

DATE — READ CAREFULLY:
- RIGHT NOW it is ${today} at ${nowTime} (Asia/Karachi). "today" / "aaj" = ${today}; "tomorrow" /
  "kal" = ${tomorrow}. Compute every other relative day from ${today}.
- When the patient asks for an appointment "today", use ${today}. NEVER reuse a date that appeared
  earlier in this conversation, and never guess a date — derive it only from the patient's latest
  request and the values above. Always pass tool dates as YYYY-MM-DD.

YOUR CAPABILITIES:
1. Book new appointments
2. Reschedule or cancel existing appointments
3. Look up a patient's upcoming appointments
4. Check outstanding invoice balance
5. Answer questions about clinic hours, location, services, and prices

RULES:
- Greet the patient by name once you know it
- MEMORY: this chat may continue a previous visit. If there is earlier history, greet them as a
  returning patient and use that context naturally; if you are unsure it is the same person, ask.
  If they say they are a NEW/different patient or want to start over, call reset_conversation FIRST,
  then proceed fresh (collect their name/phone again).
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

// Convert Anthropic-style tool schemas to OpenAI format. Staff sessions also get
// the staff_* tools; patient sessions never see them.
function toOpenAITools(session: WhatsAppSession): OpenAI.Chat.ChatCompletionTool[] {
  const defs = isStaffElevated(session) ? [...AGENT_TOOLS, ...STAFF_TOOLS] : AGENT_TOOLS
  return defs.map((t) => ({
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
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.ChatCompletionTool[]
): Promise<OpenAI.Chat.ChatCompletion> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await getClient().chat.completions.create({
        model: MODEL,
        messages,
        tools,
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
      chatId: session.chatId,
    })
  } catch (err) {
    console.error("[Session persist failed]", String(err))
  }
}

// Grounded final-answer step. The tool loop figures out WHAT to do (it may use the
// chat history to resolve references like "yes" or "the 3pm one"); this step then
// WRITES the reply using ONLY this turn's tool results — NOT the chat history — so
// stale facts from earlier in the conversation can't leak into the answer. This is
// what stops "your appointment is 22 June" hallucinations even on a small model.
async function composeGroundedReply(
  session: WhatsAppSession,
  incomingMessage: string,
  toolTrace: { name: string; result: string }[]
): Promise<string> {
  const staff = isStaffElevated(session)
  const system = `You write the final WhatsApp reply for Dr Tooth Dental Clinic${
    staff ? " to a logged-in staff member" : ""
  }. Compose the reply using ONLY the data below (results of actions taken THIS turn) and the user's latest message.
RULES:
- State NOTHING that is not present in the data — no appointment, date, time, amount, name, balance, or status the data does not contain. If the data shows none/empty, say there are none. NEVER take a date or fact from earlier in the conversation.
- If the data indicates a confirmation is needed, ask the user to confirm the EXACT details shown.
- If the data indicates success, confirm it clearly; if it shows an error/validation issue, explain it plainly.
- Mirror the user's language (English, Urdu, Roman Urdu, Arabic, Roman Arabic).
- Be concise and warm. Use Markdown tables for invoices/lists; format money as "Rs." with thousands separators. Do not mention tools, JSON, or internal IDs.`

  const dataBlock = toolTrace.map((t) => `• ${t.name} → ${t.result}`).join("\n")
  const userContent = `User's latest message:\n"${incomingMessage}"\n\nData from this turn (the ONLY source of facts):\n${dataBlock}`

  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  })
  return res.choices[0]?.message?.content?.trim() || ""
}

function isConfirmationReply(text: string): boolean {
  const normalized = String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized || normalized.length > 120) return false
  return /^(yes|y|confirm|confirmed|correct|this is correct|ok|okay|proceed|please proceed|go ahead|send it|do it|approve|approved|haan|han|ji|theek|sahi)(\s.*)?$/.test(normalized)
}

function formatDirectToolReply(result: string): string {
  try {
    const data = JSON.parse(result) as Record<string, unknown>
    if (data.success === true) {
      const sentTo = (data.sentTo ?? {}) as Record<string, unknown>
      const name = String(sentTo.name ?? "the patient")
      const phone = sentTo.phone ? ` (${sentTo.phone})` : ""
      return `Message sent to ${name}${phone}.`
    }
    if (data.optedOut === true) {
      return "That patient has opted out, so I did not send the message."
    }
    if (data.throttled === true) {
      return `I did not send it because the WhatsApp send budget is currently throttled${data.reason ? `: ${data.reason}` : "."}`
    }
    if (data.error || data.reason || data.message) {
      return String(data.message || data.reason || data.error)
    }
  } catch {
    /* fall through */
  }
  return "I couldn't complete that action. Please try again."
}

async function runPendingConfirmation(
  session: WhatsAppSession,
  incomingMessage: string
): Promise<string | null> {
  if (!isStaffElevated(session) || !isConfirmationReply(incomingMessage)) return null
  const pending = session.pendingAction
  if (pending?.type !== "staff_message_patient") return null

  const phone = typeof pending.phone === "string" ? pending.phone : ""
  const message = typeof pending.message === "string" ? pending.message : ""
  if (!phone || !message) {
    session.phase = "idle"
    session.pendingAction = null
    await persistSessionState(session)
    return "I don't have the exact message saved from the old pending confirmation. Please send the patient message again, and I'll ask for one fresh confirmation before sending it."
  }

  const result = await executeTool(
    "staff_message_patient",
    { patientPhone: phone, message, confirmed: true },
    { session }
  )
  await persistSessionState(session)
  return formatDirectToolReply(result)
}

export async function runAgent(session: WhatsAppSession, incomingMessage: string): Promise<string> {
  const confirmedPending = await runPendingConfirmation(session, incomingMessage)
  if (confirmedPending) return confirmedPending

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(session) },
    ...session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: incomingMessage },
  ]

  // Tool set is fixed for the turn based on the caller's (staff/patient) role.
  const tools = toOpenAITools(session)

  // Tools read/write identity and confirmation state through this context.
  const ctx = { session }
  const MAX_ITERATIONS = 8

  // Tool results gathered this turn — fed to the grounded responder so the final
  // reply is composed from fresh data, not the (possibly stale) chat history.
  const toolTrace: { name: string; result: string }[] = []

  let reply =
    "I'm sorry, I had trouble processing your request. Please try again or call us directly."

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await createCompletion(messages, tools)

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
        toolTrace.push({ name: toolCall.function.name, result })
      }
      continue
    }

    break
  }

  // Grounded final answer: if any tool ran this turn, re-compose the reply from ONLY
  // those results (not the chat history) so stale facts can't leak in. Greetings and
  // pure chit-chat (no tools) keep the loop's reply.
  if (toolTrace.length > 0) {
    try {
      const grounded = await composeGroundedReply(session, incomingMessage, toolTrace)
      if (grounded) reply = grounded
    } catch (err) {
      console.error("[grounded compose failed, using loop reply]", String(err))
    }
  }

  await persistSessionState(session)
  return reply
}
