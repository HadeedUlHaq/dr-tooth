import OpenAI from "openai"
import { AGENT_TOOLS, executeTool } from "./tools"
import type { WhatsAppSession } from "../types"

// OpenAI Chat Completions API.
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
5. Answer questions about clinic hours, location, and services

RULES:
- Greet the patient by name once you know it
- Before booking, ALWAYS call check_slot_availability first — never book a slot without checking
- Before cancelling or rescheduling, ALWAYS call get_patient_appointments first
- For new patients (not found via search_patient), call create_patient before booking
- Always confirm bookings/cancellations with the patient before executing the action
- Use YYYY-MM-DD for dates and HH:MM 24-hour for times when calling tools
- Never reveal internal document IDs to patients
- If you cannot help, offer to have staff call them back
- For emergencies or severe pain, advise the patient to call the clinic directly`
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
      return await client.chat.completions.create({
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

export async function runAgent(session: WhatsAppSession, incomingMessage: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: incomingMessage },
  ]

  const MAX_ITERATIONS = 8

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await createCompletion(messages)

    const choice = response.choices[0]
    const message = choice.message

    if (choice.finish_reason === "stop") {
      return message.content ?? "I'm sorry, I couldn't process that request. Please try again."
    }

    if (choice.finish_reason === "tool_calls" && message.tool_calls?.length) {
      messages.push(message)

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue
        let result: string
        try {
          const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
          result = await executeTool(toolCall.function.name, input)
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

  return "I'm sorry, I had trouble processing your request. Please try again or call us directly."
}
