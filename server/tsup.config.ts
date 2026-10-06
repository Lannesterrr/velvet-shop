import { defineConfig } from 'tsup';

/**
 * Сборка сервера в один ESM-файл.
 * Пакет @shop/shared (исходники на TS) встраиваем в бандл,
 * остальные зависимости остаются внешними и берутся из node_modules.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@shop/shared'],
});
