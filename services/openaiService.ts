import type { Message } from '../types';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export async function askAssistant(history: Message[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: history.map(m => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
