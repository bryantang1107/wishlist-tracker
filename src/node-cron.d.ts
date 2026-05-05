/** Types for `node-cron` (the package ships without TypeScript definitions). */
declare module "node-cron" {
  const cron: {
    schedule(
      expression: string,
      fn: () => void,
      options?: { timezone?: string; scheduled?: boolean },
    ): { start: () => void; stop: () => void };
    validate(expression: string): boolean;
  };
  export default cron;
}
