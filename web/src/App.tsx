import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../src/auth/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { NewOrderPage } from './pages/NewOrderPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
      {title} — coming next
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<Placeholder title="Orders" />} />
          <Route path="/menu" element={<Placeholder title="Menu" />} />
          <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
          <Route path="/alerts" element={<Placeholder title="Alerts" />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<Placeholder title="Order detail" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}