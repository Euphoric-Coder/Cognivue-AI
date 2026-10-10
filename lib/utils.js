export { cn } from "cn"

export function formatSlideNumber(value) {
  if (value === null || value === undefined) return value;
  const num = Number(value);
  if (!isNaN(num)) return Math.floor(num);
  return value;
}
