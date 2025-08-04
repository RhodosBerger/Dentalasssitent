import type { AppointmentSlot } from '../types';

// Sample data: available slots for specific days
const slots: AppointmentSlot[] = [
  { date: new Date(2025, 4, 20), times: ['09:00', '10:00', '11:00'] },
  { date: new Date(2025, 4, 21), times: ['13:00', '14:00', '15:00'] },
];

export function getAvailableSlots(year: number, month: number): AppointmentSlot[] {
  return slots.filter(s => s.date.getFullYear() === year && s.date.getMonth() === month);
}

interface Booking {
  name: string;
  date: string; // ISO date string
  time: string;
}

export function bookAppointment(booking: Booking): void {
  const existing: Booking[] = JSON.parse(localStorage.getItem('appointments') || '[]');
  existing.push(booking);
  localStorage.setItem('appointments', JSON.stringify(existing));
}
