export default {
  "apps/api/**/*.ts": (files) => {
    const filteredFiles = files.filter((f) => !f.endsWith("prisma/seed.ts"));
    if (filteredFiles.length === 0) return [];
    return `pnpm --filter api exec eslint --fix ${filteredFiles.join(" ")}`;
  },
  "apps/web/**/*.{js,jsx,ts,tsx}": (files) => {
    return `pnpm --filter web exec eslint --fix ${files.join(" ")}`;
  },
  "*.{js,jsx,ts,tsx}": ["prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"],
};
