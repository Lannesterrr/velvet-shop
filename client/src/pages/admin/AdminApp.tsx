/**
 * Админ-панель внутри Mini App (/admin/*). Загружается отдельным чанком.
 * Клиентская проверка прав — только для интерфейса; настоящая защита на сервере.
 */
import { ShieldAlert } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router';
import { useMe } from '../../api/queries';
import { EmptyState } from '../../components/ui';
import { CategoriesPage } from './Categories';
import { DashboardPage } from './Dashboard';
import { AdminOrderPage } from './OrderDetails';
import { AdminOrdersPage } from './Orders';
import { PaymentMethodsPage } from './PaymentMethods';
import { ProductEditPage } from './ProductEdit';
import { AdminProductsPage } from './Products';
import { SettingsPage } from './Settings';

const TABS = [
  { to: '/admin', label: 'Сводка', end: true },
  { to: '/admin/orders', label: 'Заказы' },
  { to: '/admin/products', label: 'Товары' },
  { to: '/admin/categories', label: 'Категории' },
  { to: '/admin/payments', label: 'Реквизиты' },
  { to: '/admin/settings', label: 'Настройки' },
];

export default function AdminApp() {
  const { data: me } = useMe();

  if (!me?.isAdmin) {
    return (
      <EmptyState
        icon={<ShieldAlert size={48} />}
        title="Нет доступа"
        text={`Админ-панель доступна только администраторам. Ваш Telegram ID: ${me?.telegramId ?? '—'}`}
      />
    );
  }

  return (
    <div>
      <nav className="no-scrollbar sticky top-0 z-20 flex gap-1 overflow-x-auto bg-page/95 px-3 py-2 backdrop-blur">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            replace
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent text-accent-ink' : 'bg-card text-ink'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/:id" element={<AdminOrderPage />} />
        <Route path="products" element={<AdminProductsPage />} />
        <Route path="products/new" element={<ProductEditPage />} />
        <Route path="products/:id" element={<ProductEditPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="payments" element={<PaymentMethodsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
