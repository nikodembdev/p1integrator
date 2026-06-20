/** Port zegara — pozwala na deterministyczne testy znaczników czasu (Timestamp). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
