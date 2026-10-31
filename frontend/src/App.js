import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./context/AuthContext";
import AppShell, { ProtectedRoute } from "./components/AppShell";
import Landing from "./pages/Landing";
import Catalog from "./pages/Catalog";
import Courses from "./pages/Courses";
import { Login, Register, ForgotPassword, ResetPassword } from "./pages/AuthPages";
import Onboarding from "./pages/Onboarding";
import Verify from "./pages/Verify";
import PublicProfile from "./pages/PublicProfile";
import Talent from "./pages/Talent";
import Dashboard from "./pages/app/Dashboard";
import { Paths, PathDetail } from "./pages/app/Paths";
import Sessions from "./pages/app/Sessions";
import { Quizzes, QuizPlayer } from "./pages/app/Quizzes";
import Progress from "./pages/app/Progress";
import Challenges from "./pages/app/Challenges";
import Drill from "./pages/app/Drill";
import MyCourses from "./pages/app/MyCourses";
import CTF from "./pages/app/CTF";
import { Labs, LabRunner, KaliPage } from "./pages/app/Labs";
import Siem from "./pages/app/Siem";
import Tools from "./pages/app/Tools";
import { Certificates, Billing } from "./pages/app/Account";
import Instructor from "./pages/Instructor";
import Admin from "./pages/Admin";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/courses" element={<Courses />} />
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
              <Route path="sessions" element={<Sessions />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="quizzes/:id" element={<QuizPlayer />} />
              <Route path="progress" element={<Progress />} />
              <Route path="drill" element={<Drill />} />
              <Route path="courses" element={<MyCourses />} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="ctf" element={<CTF />} />
              <Route path="labs" element={<Labs />} />
              <Route path="labs/:id" element={<LabRunner />} />
              <Route path="kali" element={<KaliPage />} />
              <Route path="siem" element={<Siem />} />
              <Route path="tools" element={<Tools />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="billing" element={<Billing />} />
            </Route>
            <Route path="/instructor" element={<ProtectedRoute roles={["instructor", "admin"]}><AppShell /></ProtectedRoute>}>
              <Route index element={<Instructor />} />
            </Route>
            <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AppShell /></ProtectedRoute>}>
              <Route index element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
