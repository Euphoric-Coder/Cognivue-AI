export { cn } from "cn"

export function formatSlideNumber(value) {
  if (value === null || value === undefined) return value;
  const num = Number(value);
  if (!isNaN(num)) return Math.floor(num);
  return value;
}

export function formatTimestamp(seconds) {
  if (seconds === null || seconds === undefined) return "00:00";
  const num = Number(seconds);
  if (isNaN(num)) return "00:00";
  const h = Math.floor(num / 3600);
  const m = Math.floor((num % 3600) / 60);
  const s = Math.floor(num % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
