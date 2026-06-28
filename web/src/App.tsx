import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthGuard } from "./auth/AuthGuard";
import { AppShell } from "./app/AppShell";

const CampaignListPage = lazy(() => import("./pages/CampaignListPage").then((module) => ({ default: module.CampaignListPage })));
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage").then((module) => ({ default: module.CampaignDetailPage })));
const DonationPage = lazy(() => import("./pages/DonationPage").then((module) => ({ default: module.DonationPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const ReceiptPage = lazy(() => import("./pages/ReceiptPage").then((module) => ({ default: module.ReceiptPage })));
const OrganizationPage = lazy(() => import("./pages/OrganizationPage").then((module) => ({ default: module.OrganizationPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const TransparencyPage = lazy(() => import("./pages/TransparencyPage").then((module) => ({ default: module.TransparencyPage })));
const ReceiptVerificationPage = lazy(() => import("./pages/ReceiptVerificationPage").then((module) => ({ default: module.ReceiptVerificationPage })));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage").then((module) => ({ default: module.StatisticsPage })));
const FavoritesPage = lazy(() => import("./features/engagement/FavoritesPage").then((module) => ({ default: module.FavoritesPage })));
const NotificationsPage = lazy(() => import("./features/notifications/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const AccountPage = lazy(() => import("./features/account/AccountPage").then((module) => ({ default: module.AccountPage })));
const ForgotPasswordPage = lazy(() => import("./features/account/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./features/account/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

export function App(): JSX.Element {
  return <Suspense fallback={<div className="container-page py-12" role="status">Đang tải…</div>}>
    <Routes><Route element={<AppShell />}>
      <Route index element={<CampaignListPage />} />
      <Route path="chien-dich/:id" element={<CampaignDetailPage />} />
      <Route path="minh-bach" element={<TransparencyPage />} />
      <Route path="thong-ke" element={<StatisticsPage />} />
      <Route path="xac-minh-bien-nhan" element={<ReceiptVerificationPage />} />
      <Route path="dang-nhap" element={<LoginPage />} />
      <Route path="dang-ky" element={<RegisterPage />} />
      <Route path="quen-mat-khau" element={<ForgotPasswordPage />} />
      <Route path="dat-lai-mat-khau" element={<ResetPasswordPage />} />
      <Route element={<AuthGuard roles={["DONOR", "ORGANIZATION", "ADMIN"]} />}><Route path="tai-khoan" element={<AccountPage />} /></Route>
      <Route element={<AuthGuard roles={["DONOR"]} />}><Route path="chien-dich/:id/quyen-gop" element={<DonationPage />} /><Route path="yeu-thich" element={<FavoritesPage />} /><Route path="thong-bao" element={<NotificationsPage />} /><Route path="lich-su" element={<HistoryPage />} /><Route path="bien-nhan/:id" element={<ReceiptPage />} /></Route>
      <Route element={<AuthGuard roles={["ORGANIZATION"]} />}><Route path="to-chuc" element={<OrganizationPage />} /></Route>
      <Route element={<AuthGuard roles={["ADMIN"]} />}><Route path="quan-tri" element={<AdminPage />} /></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route></Routes>
  </Suspense>;
}
