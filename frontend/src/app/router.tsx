import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AuthGuard } from "../auth/AuthGuard";
import { AppShell } from "./AppShell";

const CampaignListPage = lazy(() => import("../features/campaigns/CampaignListPage").then((module) => ({ default: module.CampaignListPage })));
const VerifyHomePage = lazy(() => import("../features/content/VerifyHomePage").then((module) => ({ default: module.VerifyHomePage })));
const ContentListPage = lazy(() => import("../features/content/ContentListPage").then((module) => ({ default: module.ContentListPage })));
const ContentArticlePage = lazy(() => import("../features/content/ContentArticlePage").then((module) => ({ default: module.ContentArticlePage })));
const SourceAnalyzerPage = lazy(() => import("../features/content/SourceAnalyzerPage").then((module) => ({ default: module.SourceAnalyzerPage })));
const RealProjectDetailPage = lazy(() => import("../features/content/RealProjectDetailPage").then((module) => ({ default: module.RealProjectDetailPage })));
const CampaignDetailPage = lazy(() => import("../features/campaigns/CampaignDetailPage").then((module) => ({ default: module.CampaignDetailPage })));
const DonationPage = lazy(() => import("../features/donations/DonationPage").then((module) => ({ default: module.DonationPage })));
const LoginPage = lazy(() => import("../features/account/LoginPage").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("../features/account/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const HistoryPage = lazy(() => import("../features/donations/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const ReceiptPage = lazy(() => import("../features/donations/ReceiptPage").then((module) => ({ default: module.ReceiptPage })));
const OrganizationPage = lazy(() => import("../features/organization/OrganizationPage").then((module) => ({ default: module.OrganizationPage })));
const AdminPage = lazy(() => import("../features/admin/AdminPage").then((module) => ({ default: module.AdminPage })));
const TransparencyPage = lazy(() => import("../features/transparency/TransparencyPage").then((module) => ({ default: module.TransparencyPage })));
const ReceiptVerificationPage = lazy(() => import("../features/transparency/ReceiptVerificationPage").then((module) => ({ default: module.ReceiptVerificationPage })));
const StatisticsPage = lazy(() => import("../features/analytics/StatisticsPage").then((module) => ({ default: module.StatisticsPage })));
const FavoritesPage = lazy(() => import("../features/engagement/FavoritesPage").then((module) => ({ default: module.FavoritesPage })));
const NotificationsPage = lazy(() => import("../features/notifications/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const AccountPage = lazy(() => import("../features/account/AccountPage").then((module) => ({ default: module.AccountPage })));
const ForgotPasswordPage = lazy(() => import("../features/account/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../features/account/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const NotFoundPage = lazy(() => import("../shared/components/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

function RouteFallback(): JSX.Element {
  return <div className="container-page py-12" role="status">Đang tải…</div>;
}

function RootRoute(): JSX.Element {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AppShell />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootRoute />,
    children: [
      // Public routes: mọi người đều xem được.
      { index: true, element: <VerifyHomePage /> },
      { path: "chien-dich", element: <CampaignListPage /> },
      { path: "kiem-chung", element: <ContentListPage /> },
      { path: "canh-bao", element: <ContentListPage mode="alerts" /> },
      { path: "kiem-tra-nguon", element: <SourceAnalyzerPage /> },
      { path: "bai-viet/:slug", element: <ContentArticlePage /> },
      { path: "du-an/:slug", element: <RealProjectDetailPage /> },
      { path: "chien-dich/:id", element: <CampaignDetailPage /> },
      { path: "minh-bach", element: <TransparencyPage /> },
      { path: "thong-ke", element: <StatisticsPage /> },
      { path: "xac-minh-bien-nhan", element: <ReceiptVerificationPage /> },
      { path: "dang-nhap", element: <LoginPage /> },
      { path: "dang-ky", element: <RegisterPage /> },
      { path: "quen-mat-khau", element: <ForgotPasswordPage /> },
      { path: "dat-lai-mat-khau", element: <ResetPasswordPage /> },

      // Auth routes: mọi tài khoản hợp lệ đều dùng được.
      {
        element: <AuthGuard roles={["DONOR", "ORGANIZATION", "ADMIN"]} />,
        children: [{ path: "tai-khoan", element: <AccountPage /> }],
      },

      // Donor routes: người quyên góp.
      {
        element: <AuthGuard roles={["DONOR"]} />,
        children: [
          { path: "chien-dich/:id/quyen-gop", element: <DonationPage /> },
          { path: "yeu-thich", element: <FavoritesPage /> },
          { path: "thong-bao", element: <NotificationsPage /> },
          { path: "lich-su", element: <HistoryPage /> },
          { path: "bien-nhan/:id", element: <ReceiptPage /> },
        ],
      },

      // Organization routes: tổ chức từ thiện.
      {
        element: <AuthGuard roles={["ORGANIZATION"]} />,
        children: [{ path: "to-chuc", element: <OrganizationPage /> }],
      },

      // Admin routes: quản trị hệ thống.
      {
        element: <AuthGuard roles={["ADMIN"]} />,
        children: [{ path: "quan-tri", element: <AdminPage /> }],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
