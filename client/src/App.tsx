import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useMe } from './api/queries';
import { AgeGate } from './components/AgeGate';
import { EmptyState, ErrorState, FullScreenLoader } from './components/ui';
import { CartPage } from './pages/Cart';
import { CatalogPage } from './pages/Catalog';
import { CheckoutPage } from './pages/Checkout';
import { OrderDetailsPage } from './pages/OrderDetails';
import { OrdersPage } from './pages/Orders';
import { PaymentPage } from './pages/Payment';
import { SharedCartPage } from './pages/SharedCart';
import { ProductPage } from './pages/Product';
import { useBackButton } from './telegram/useBackButton';
import { isTelegram, tg } from './telegram/webapp';

// Админка — отдельный чанк: покупателям её код не загружается
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

/** Прокрутка вверх при переходе на новую страницу */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Глубокая ссылка: t.me/<bot>/<app>?startapp=order_15 → открывает заказ №15,
 * startapp=product_7 → товар №7, startapp=cart_<token> → корзина, которой поделились.
 */
let startParamHandled = false;
function StartParamRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    // Срабатывает один раз при запуске, иначе «Назад» на главную снова уводил бы на заказ
    const startParam = tg?.initDataUnsafe.start_param;
    if (startParamHandled || !startParam || window.location.pathname !== '/') return;
    startParamHandled = true;
    const order = /^order_(\d+)$/.exec(startParam);
    const product = /^product_(\d+)$/.exec(startParam);
    const cart = /^cart_([\w-]{8,32})$/.exec(startParam);
    if (order) navigate(`/orders/${order[1]}`);
    else if (product) navigate(`/product/${product[1]}`);
    else if (cart) navigate(`/cart/shared/${cart[1]}`);
  }, [navigate]);
  return null;
}

export function App() {
  useBackButton();
  const me = useMe();

  // Вне Telegram и без DEV_TELEGRAM_ID на сервере — объясняем, как открыть
  if (me.isError && !isTelegram) {
    return (
      <EmptyState
        title="Откройте магазин в Telegram"
        text="Приложение работает внутри Telegram. Для разработки в браузере задайте DEV_TELEGRAM_ID в server/.env."
      />
    );
  }
  // В Telegram, но сервер не принял авторизацию или недоступен — показываем причину
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (me.isPending) return <FullScreenLoader />;

  return (
    <AgeGate>
    <div className="mx-auto min-h-screen max-w-xl">
      <ScrollToTop />
      <StartParamRedirect />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/cart/shared/:token" element={<SharedCartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailsPage />} />
        <Route path="/orders/:id/pay" element={<PaymentPage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
    </AgeGate>
  );
}
