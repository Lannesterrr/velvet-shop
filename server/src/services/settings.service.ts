import type { ShopSettingsDTO, ShopSettingsInput } from '@shop/shared';
import { prisma } from '../db';

/** Настройки — одна строка с id = 1; создаётся при первом обращении */
export async function getSettings(): Promise<ShopSettingsDTO> {
  const s = await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return {
    shopName: s.shopName,
    currency: s.currency,
    supportUsername: s.supportUsername,
    supportPhone: s.supportPhone,
    supportText: s.supportText,
    aboutText: s.aboutText,
    deliveryText: s.deliveryText,
  };
}

export async function updateSettings(input: ShopSettingsInput): Promise<ShopSettingsDTO> {
  await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input });
  return getSettings();
}
