import React, { useState } from 'react';
import type { Message } from './types';
import { askAssistant } from './services/openaiService';
import { getAvailableSlots, bookAppointment } from './services/appointmentService';

function sameDate(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export default function App(): React.ReactNode {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Dobrý deň, som virtuálna recepčná. Ako vám môžem pomôcť?' }
  ]);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage: Message = { role: 'user', content: input };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    const reply = await askAssistant(history);
    setMessages([...history, { role: 'assistant', content: reply }]);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDate(value);
    const d = new Date(value);
    const available = getAvailableSlots(d.getFullYear(), d.getMonth()).find(s => sameDate(s.date, d));
    setSlots(available ? available.times : []);
    setTime('');
  };

  const handleBook = () => {
    bookAppointment({ name, date, time });
    alert('Termín bol úspešne rezervovaný.');
    setName('');
    setDate('');
    setTime('');
    setSlots([]);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h1>Virtuálny recepčný</h1>
      <div style={{ border: '1px solid #ccc', padding: 10, height: 200, overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i}><b>{m.role === 'assistant' ? 'Asistent' : 'Vy'}:</b> {m.content}</div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Napíšte správu"
          style={{ width: '80%' }}
        />
        <button onClick={handleSend} style={{ width: '20%' }}>Odoslať</button>
      </div>
      <hr style={{ margin: '20px 0' }} />
      <h2>Rezervácia termínu</h2>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Meno"
        style={{ display: 'block', marginBottom: 10, width: '100%' }}
      />
      <input
        type="date"
        value={date}
        onChange={handleDateChange}
        style={{ display: 'block', marginBottom: 10, width: '100%' }}
      />
      <select
        value={time}
        onChange={e => setTime(e.target.value)}
        style={{ display: 'block', marginBottom: 10, width: '100%' }}
      >
        <option value="">Vyberte čas</option>
        {slots.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button
        onClick={handleBook}
        disabled={!name || !date || !time}
      >
        Rezervovať
      </button>
    </div>
  );
}
