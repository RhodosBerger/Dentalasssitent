
export interface Source {
  uri: string;
  title: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  sources?: Source[];
}

export type VoiceStyle = 'professional' | 'friendly' | 'concise';

export interface AppointmentSlot {
  date: Date;
  times: string[];
}
