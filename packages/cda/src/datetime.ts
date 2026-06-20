const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Data w formacie CDA: YYYYMMDD (czas lokalny). */
export function formatCdaDate(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

/** Data i czas w formacie CDA: YYYYMMDDHHmmss (czas lokalny). */
export function formatCdaDateTime(date: Date): string {
  return `${formatCdaDate(date)}${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}
