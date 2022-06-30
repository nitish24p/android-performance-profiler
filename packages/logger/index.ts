export const Logger = {
  info: (message: string) => {
    console.log(message);
  },
  success: (message: string) => {
    console.log(`✅ ${message}`);
  },
  warn: (message: string) => {
    console.log(`⚠️ ${message}`);
  },
};
