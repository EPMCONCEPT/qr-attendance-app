import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import AuthScreen from './components/AuthScreen';
import ClassroomManager from './components/ClassroomManager';
import QRScannerSimulator from './components/QRScannerSimulator';
import ReportsBoard from './components/ReportsBoard';
import { 
  GraduationCap, LogOut, ToggleLeft, ToggleRight, Laptop, Smartphone, 
  Sparkles, RefreshCw, Layers, LayoutDashboard, QrCode, ClipboardCheck 
} from 'lucide-react';

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSandbox, setIsSandbox] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Playground Options in Sandbox
  const [splitscreenMode, setSplitscreenMode] = useState(true);
  const [simulatedStudentProfile, setSimulatedStudentProfile] = useState<UserProfile>({
    uid: 'sandbox_student_default',
    name: 'Sophia Chen',
    email: 's.chen@student.edu',
    role: 'student',
    createdAt: new Date().toISOString()
  });

  // Global Refresh ticker to coordinate side-by-side state mutations instantly
  const [refreshFlag, setRefreshFlag] = useState(0);
  const triggerRefresh = () => setRefreshFlag(prev => prev + 1);

  // Sync state when localstorage changes (to mirror data between components)
  useEffect(() => {
    const handleStorageChange = () => {
      triggerRefresh();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setIsSandbox(false);
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            // Profile isn't fully saved yet, let child AuthScreen resolve this
            setUserProfile(null);
          }
        } catch (err) {
          console.error("Firestore loading error inside auth state change: ", err);
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (profile: UserProfile, sandboxActive?: boolean) => {
    if (sandboxActive) {
      setIsSandbox(true);
      setUserProfile(profile);
      // If student is logged in, use appropriate complementary role
      if (profile.role === 'student') {
        setSimulatedStudentProfile(profile);
        setUserProfile({
          uid: 'sandbox_teacher_default',
          name: 'Prof. Evelyn Vance',
          email: 'evelyn.vance@college.edu',
          role: 'teacher',
          createdAt: new Date().toISOString()
        });
      }
    } else {
      setUserProfile(profile);
    }
  };

  const handleLogOut = async () => {
    if (isSandbox) {
      setIsSandbox(false);
      setUserProfile(null);
    } else {
      try {
        await signOut(auth);
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[90vh] bg-gray-50/50">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-xs font-mono text-indigo-900 uppercase tracking-widest font-bold">
          Verifying security certificates...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" id="application-entry">
      {/* Top Header navbar - Sleek Interface Style */}
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-800 tracking-tight font-sans flex items-center gap-2">
              <span>QRAttend <span className="text-indigo-600">Pro</span></span>
              {isSandbox && (
                <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold tracking-widest uppercase">
                  Sandbox
                </span>
              )}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Automated High-Speed Authentication</p>
          </div>
        </div>

        {userProfile && (
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-800">{userProfile.name}</span>
              <span className="text-[9px] text-indigo-600 font-mono font-bold uppercase tracking-widest mt-0.5">
                {userProfile.role}
              </span>
            </div>

            <button
              onClick={handleLogOut}
              id="logout-btn"
              className="p-2 bg-slate-50 hover:bg-rose-50 rounded-xl border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 transition outline-none cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Core Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 font-sans">
        {!userProfile ? (
          <AuthScreen onAuthSuccess={handleAuthSuccess} />
        ) : (
          <div className="space-y-6">
            {/* Class Sandbox control bar */}
            {isSandbox && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider">
                      Classroom Simulator Playground
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-sans">
                      Test immediate sync: Generating ticking QR codes on the left (Teacher) lets students immediately fast-scan on the right.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 font-sans uppercase tracking-wider">
                    Splitscreen View:
                  </span>
                  <button
                    onClick={() => setSplitscreenMode(v => !v)}
                    className="flex bg-slate-900 text-white hover:bg-indigo-600 px-3.5 py-1.5 rounded-xl text-xs font-semibold gap-1.5 transition outline-none cursor-pointer"
                  >
                    <span>{splitscreenMode ? "ON" : "OFF"}</span>
                    {splitscreenMode ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                  </button>
                </div>
              </div>
            )}

            {/* Application modules layout */}
            {isSandbox && splitscreenMode ? (
              /* Splitscreen dual device simulator playground */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Desktop Teacher Panel */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="flex items-center gap-2.5 bg-white text-slate-800 p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-sans">
                        Faculty Workstation Portal
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Create course sheets & host ticked enrollment registers</p>
                    </div>
                  </div>

                  <ClassroomManager 
                    userProfile={userProfile} 
                    isSandbox={isSandbox}
                    refreshFlag={refreshFlag}
                    triggerRefresh={triggerRefresh}
                  />

                  {/* Shared statistics bottom */}
                  <ReportsBoard 
                    userProfile={userProfile} 
                    isSandbox={isSandbox}
                    refreshFlag={refreshFlag}
                  />
                </div>

                {/* Mobile Student Simulator Device */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="flex items-center gap-2.5 bg-white text-slate-800 p-4 rounded-2xl border border-slate-200 shadow-sm justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-sans">
                          Student Mobile Device
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Mocking client: {simulatedStudentProfile.name}</p>
                      </div>
                    </div>
                    
                    <span className="text-[9px] bg-emerald-50 text-emerald-600 font-bold tracking-wide uppercase px-2.5 py-1 rounded border border-emerald-100">
                      Live GPS
                    </span>
                  </div>

                  {/* Smartphone visual frame wrapper (Sleek design) */}
                  <div className="border-[8px] border-slate-900 bg-[#f8fafc] rounded-[3rem] p-3 shadow-2xl relative max-w-sm mx-auto overflow-hidden">
                    {/* Device speaker & camera Notch */}
                    <div className="absolute top-2.5 left-1/3 right-1/3 h-4 bg-slate-900 rounded-full z-10 hidden sm:block flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-slate-700 rounded-full"></div>
                    </div>

                    <div className="bg-white rounded-[2.2rem] p-4 min-h-[520px] shadow-inner border border-slate-100">
                      <QRScannerSimulator 
                        userProfile={simulatedStudentProfile} 
                        isSandbox={isSandbox}
                        refreshFlag={refreshFlag}
                        triggerRefresh={triggerRefresh}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Single dashboard standard viewport */
              <div className="space-y-6">
                {userProfile.role === 'teacher' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                      <ClassroomManager 
                        userProfile={userProfile} 
                        isSandbox={isSandbox}
                        refreshFlag={refreshFlag}
                        triggerRefresh={triggerRefresh}
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <ReportsBoard 
                        userProfile={userProfile} 
                        isSandbox={isSandbox}
                        refreshFlag={refreshFlag}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <QRScannerSimulator 
                      userProfile={userProfile} 
                      isSandbox={isSandbox}
                      refreshFlag={refreshFlag}
                      triggerRefresh={triggerRefresh}
                    />
                    <ReportsBoard 
                      userProfile={userProfile} 
                      isSandbox={isSandbox}
                      refreshFlag={refreshFlag}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t py-4 text-center text-[10px] text-gray-400 tracking-wider uppercase select-none mt-6 font-mono">
        EduQR Systems &copy; {new Date().getFullYear()} — Secure Student Attendance Matrix
      </footer>
    </div>
  );
}
