// Helpers for safer PROACTIVE messaging (reminders, broadcasts) — anti-ban.

// Expand simple spintax: "{Hi|Hello|Assalam-o-Alaikum} {name}" -> one random pick
// per {a|b|c} group. Non-nested; leaves text without braces unchanged.
export function spin(template: string): string {
  return template.replace(/\{([^{}]*)\}/g, (_, group: string) => {
    const opts = group.split("|")
    return opts[Math.floor(Math.random() * opts.length)] ?? ""
  })
}

// Randomised inter-send gap so bulk sending doesn't look like clockwork.
export function jitterMs(min = 600, max = 1800): number {
  return min + Math.floor(Math.random() * Math.max(0, max - min))
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Recognise an opt-out / opt-in command (kept tight to avoid false positives —
// must be the whole message, not "stop" inside a sentence). Returns null otherwise.
export function parseOptCommand(text: string): "stop" | "start" | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[!.]+$/, "")
  if (
    t === "stop" ||
    t === "unsubscribe" ||
    t === "unsub" ||
    t === "stop reminders" ||
    t.startsWith("stop ") ||
    t === "band karo" ||
    t === "band kardo"
  ) {
    return "stop"
  }
  if (t === "start" || t === "subscribe" || t === "resume reminders" || t === "unstop") {
    return "start"
  }
  return null
}
