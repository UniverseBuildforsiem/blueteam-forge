import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./context/AuthContext";
import AppShell, { ProtectedRoute } from "./components/AppShell";
import Landing from "./pages/Landing";
import Catalog from "./pages/Catalog";
import Courses from "./pages/Courses";
import Book from "./pages/Book";
import { BlogList, BlogPost } from "./pages/Blog";
import { SeriesList, SeriesPost } from "./pages/Series";
import { SopList, SopDetail } from "./pages/Sops";
import { Login, Register, ForgotPassword, ResetPassword, AuthCallback } from "./pages/AuthPages";
import { PlaybookList, PlaybookDetail } from "./pages/Playbooks";
import Onboarding from "./pages/Onboarding";
import Verify from "./pages/Verify";
import PublicProfile from "./pages/PublicProfile";
import Talent from "./pages/Talent";
import Dashboard from "./pages/app/Dashboard";
import { Paths, PathDetail } from "./pages/app/Paths";
import ThreatIntel from "./pages/ThreatIntel";
import SopLab from "./pages/app/SopLab";
import Sessions from "./pages/app/Sessions";
import { Quizzes, QuizPlayer } from "./pages/app/Quizzes";
import Progress from "./pages/app/Progress";
import Challenges from "./pages/app/Challenges";
import Shift from "./pages/app/Shift";
import AcademyList, { AcademyCert } from "./pages/app/Academy";
import CourseLanding from "./pages/CourseLanding";
import BundlePage from "./pages/BundlePage";
import Drill from "./pages/app/Drill";
import Badges from "./pages/app/Badges";
import MockInterview from "./pages/app/MockInterview";
import CTF from "./pages/app/CTF";
import { Labs, LabRunner, KaliPage } from "./pages/app/Labs";
import Siem from "./pages/app/Siem";
import Tools from "./pages/app/Tools";
import { Certificates, Billing, AccountSettings } from "./pages/app/Account";
import Consultation from "./pages/Consultation";
import ReviewPage from "./pages/ReviewPage";
import Instructor from "./pages/Instructor";
import Admin from "./pages/Admin";

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/course/:id" element={<CourseLanding />} />
            <Route path="/bundle/:id" element={<BundlePage />} />
            <Route path="/book" element={<Book />} />
            <Route path="/consultation" element={<Consultation />} />
            <Route path="/review/:token" element={<ReviewPage />} />
            <Route path="/blog" element={<BlogList />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/soc-series" element={<SeriesList />} />
            <Route path="/soc-series/:slug" element={<SeriesPost />} />
            <Route path="/sops" element={<SopList />} />
            <Route path="/sops/:id" element={<SopDetail />} />
            <Route path="/playbooks" element={<PlaybookList />} />
            <Route path="/playbooks/:id" element={<PlaybookDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify/:id" element={<Verify />} />
            <Route path="/u/:username" element={<PublicProfile />} />
            <Route path="/talent" element={<Talent />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="paths" element={<Paths />} />
              <Route path="paths/:id" element={<PathDetail />} />
              <Route path="threat-intel" element={<ThreatIntel />} />
              <Route path="sop-lab/:id" element={<SopLab />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="quizzes/:id" element={<QuizPlayer />} />
              <Route path="progress" element={<Progress />} />
              <Route path="drill" element={<Drill />} />
              <Route path="courses" element={<AcademyList />} />
              <Route path="courses/certificate/:certId" element={<AcademyCert />} />
              <Route path="courses/:id" element={<PathDetail course />} />
              <Route path="badges" element={<Badges />} />
              <Route path="interview" element={<MockInterview />} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="shift" element={<Shift />} />
              <Route path="ctf" element={<CTF />} />
              <Route path="labs" element={<Labs />} />
              <Route path="labs/:id" element={<LabRunner />} />
              <Route path="kali" element={<KaliPage />} />
              <Route path="siem" element={<Siem />} />
              <Route path="tools" element={<Tools />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="billing" element={<Billing />} />
              <Route path="account" element={<AccountSettings />} />
            </Route>
            <Route path="/instructor" element={<ProtectedRoute roles={["instructor", "admin"]}><AppShell /></ProtectedRoute>}>
              <Route index element={<Instructor />} />
            </Route>
            <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AppShell /></ProtectedRoute>}>
              <Route index element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <Toaster theme="dark" position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
