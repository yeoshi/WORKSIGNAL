export interface AgentSpeechInput {
  reasoning: string;
  keyArgument?: string;
}

function toFirstPerson(text: string): string {
  return text
    .replace(/\bThe user's\b/gi, 'Your')
    .replace(/\bthe user's\b/gi, 'your')
    .replace(/\bUser's\b/g, "Your")
    .replace(/^This role\b/i, "I'd say this role")
    .replace(/^This job\b/i, "I'd say this job")
    .replace(/^The role\b/i, "I'd say the role")
    .replace(/^The company\b/i, "I'd say the company")
    .replace(/^Company is\b/i, "I'd say the company is")
    .replace(/^Salary range\b/i, "I'd note the salary range")
    .replace(/^Profile is\b/i, "I'd say your profile is")
    .replace(/^All four agents\b/i, "From where I sit, all four agents")
    .trim();
}

export function formatAgentSpeech({ reasoning, keyArgument }: AgentSpeechInput): string {
  const base = toFirstPerson(reasoning.trim());
  const opener = base.match(/^(I'd|I would|I think|I believe|From where I sit)/i)
    ? ''
    : "Here's my read: ";

  const speech = `${opener}${base}`.trim();

  if (!keyArgument?.trim()) {
    return speech;
  }

  const takeaway = toFirstPerson(keyArgument.trim());
  return `${speech} ${takeaway.endsWith('.') ? takeaway : `${takeaway}.`}`;
}
