import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthGuard } from "./auth/AuthGuard";
import { AppShell } from "./app/AppShell";

const CampaignListPage = lazy(() => import("./features/campaigns/CampaignListPage").then((module) => ({ default: module.CampaignListPage })));
const VerifyHomePage = lazy(() => import("./features/content/VerifyHomePage").then((module) => ({ default: module.VerifyHomePage })));
const ContentListPage = lazy(() => import("./features/content/ContentListPage").then((module) => ({ default: module.ContentListPage })));
const ContentArticlePage = lazy(() => import("./features/content/ContentArticlePage").then((module) => ({ default: module.ContentArticlePage })));
const SourceAnalyzerPage = lazy(() => import("./features/content/SourceAnalyzerPage").then((module) => ({ default: module.SourceAnalyzerPage })));
const RealProjectDetailPage = lazy(() => import("./features/content/RealProjectDetailPage").then((module) => ({ default: module.RealProjectDetailPage })));
const CampaignDetailPage = lazy(() => import("./features/campaigns/CampaignDetailPage").then((module) => ({ default: module.CampaignDetailPage })));
const DonationPage = lazy(() => import("./features/donations/DonationPage").then((module) => ({ default: module.DonationPage })));
const LoginPage = lazy(() => import("./features/account/LoginPage").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("./features/account/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const HistoryPage = lazy(() => import("./features/donations/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const ReceiptPage = lazy(() => import("./features/donations/ReceiptPage").then((module) => ({ default: module.ReceiptPage })));
const OrganizationPage = lazy(() => import("./features/organization/OrganizationPage").then((module) => ({ default: module.OrganizationPage })));
const AdminPage = lazy(() => import("./features/admin/AdminPage").then((module) => ({ default: module.AdminPage })));
const TransparencyPage = lazy(() => import("./features/transparency/TransparencyPage").then((module) => ({ default: module.TransparencyPage })));
const ReceiptVerificationPage = lazy(() => import("./features/transparency/ReceiptVerificationPage").then((module) => ({ default: module.ReceiptVerificationPage })));
const StatisticsPage = lazy(() => import("./features/analytics/StatisticsPage").then((module) => ({ default: module.StatisticsPage })));
const FavoritesPage = lazy(() => import("./features/engagement/FavoritesPage").then((module) => ({ default: module.FavoritesPage })));
const NotificationsPage = lazy(() => import("./features/notifications/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const AccountPage = lazy(() => import("./features/account/AccountPage").then((module) => ({ default: module.AccountPage })));
const ForgotPasswordPage = lazy(() => import("./features/account/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./features/account/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const NotFoundPage = lazy(() => import("./shared/components/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

export function App(): JSX.Element {
  return <Suspense fallback={<div className="container-page py-12" role="status">Đang tải…</div>}>
    <Routes><Route element={<AppShell />}>
      <Route index element={<VerifyHomePage />} />
      <Route path="chien-dich" element={<CampaignListPage />} />
      <Route path="kiem-chung" element={<ContentListPage />} />
      <Route path="canh-bao" element={<ContentListPage mode="alerts" />} />
      <Route path="kiem-tra-nguon" element={<SourceAnalyzerPage />} />
      <Route path="bai-viet/:slug" element={<ContentArticlePage />} />
      <Route path="du-an/:slug" element={<RealProjectDetailPage />} />
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
