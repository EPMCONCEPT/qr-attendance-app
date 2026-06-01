import React, { useState } from 'react';
import { motion } from 'motion/react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '../types';
import { GraduationCap, ShieldAlert, Sparkles, User, Users, LogIn } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (profile: UserProfile, isSandbox?: boolean) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pending profile setup state
  const [needsProfileSetup, setNeedsProfileSetup] = useState<{ uid: string; email: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student'>('student');

  // Real Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        throw new Error("No email associated with Google account");
      }

      // Check if user profile already exists
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        onAuthSuccess(profile, false);
      } else {
        // Needs setup
        setNeedsProfileSetup({
          uid: user.uid,
          email: user.email,
        });
        setDisplayName(user.displayName || '');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Google Authentication failed. Try Sandbox Mode if popups are blocked.");
    } finally {
      setLoading(false);
    }
  };

  // Complete Firestore user profile setup
  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!needsProfileSetup) return;
    if (!displayName.trim()) {
      setError("Please enter your display name.");
      return;
    }
    
    setLoading(true);
    setError(null);
    const userId = needsProfileSetup.uid;
    const path = `users/${userId}`;

    try {
      const profileData: UserProfile = {
        uid: userId,
        name: displayName.trim(),
        email: needsProfileSetup.email,
        role: selectedRole,
        createdAt: new Date().toISOString(),
      };

      // Write to Firestore
      await setDoc(doc(db, 'users', userId), {
        uid: profileData.uid,
        name: profileData.name,
        email: profileData.email,
        role: profileData.role,
        createdAt: serverTimestamp()
      });

      onAuthSuccess(profileData, false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  // Fast-track Simulated sandbox login for quick testing
  const handleSandboxLogin = (role: 'teacher' | 'student', name: string, email: string) => {
    const mockUid = `sandbox_${role}_${Date.now().toString().slice(-4)}`;
    const mockProfile: UserProfile = {
      uid: mockUid,
      name,
      email,
      role,
      createdAt: new Date().toISOString()
    };
    onAuthSuccess(mockProfile, true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-slate-800">
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-[2rem] shadow-xl p-8 overflow-hidden"
        id="auth-container"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight font-sans">
            QRAttend <span className="text-indigo-600">Pro</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide mt-2">
            Eliminate manual roll calls. Secure, automated, and real-time tracking.
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 bg-red-50 border border-red-150 rounded-xl p-4 text-xs text-red-600 mb-6"
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="flex-1">{error}</p>
          </motion.div>
        )}

        {!needsProfileSetup ? (
          <div className="space-y-6">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              id="google-signin-btn"
              className="w-full flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
            >
              <span>{loading ? "Authenticating..." : "Sign in with Google"}</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-150"></div>
              <span className="flex-shrink mx-4 text-[9px] text-slate-400 font-bold tracking-widest uppercase font-mono">
                Simulation Sandbox
              </span>
              <div className="flex-grow border-t border-slate-150"></div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-400 font-medium font-sans text-center">
                Select a simulated device interface to test fast-track sync:
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleSandboxLogin('teacher', 'Prof. Evelyn Vance', 'evelyn.vance@college.edu')}
                  id="sandbox-teacher-btn"
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-600 hover:bg-slate-50/40 transition duration-200 text-center group cursor-pointer shadow-sm animate-fade-in"
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Faculty Portal</span>
                  <span className="text-[9px] text-slate-400 mt-1">Evelyn Vance</span>
                </button>

                <button
                  onClick={() => handleSandboxLogin('student', 'Sophia Chen', 's.chen@student.edu')}
                  id="sandbox-student-btn"
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-600 hover:bg-slate-50/40 transition duration-200 text-center group cursor-pointer shadow-sm animate-fade-in"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Student Portal</span>
                  <span className="text-[9px] text-slate-400 mt-1">Sophia Chen</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl p-3 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Running fully simulated instant data sockets</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCompleteSetup} className="space-y-5" id="profile-setup-form">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono text-center">
              Configure Profile Settings
            </h2>
            
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans">Full Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Professor Evelyn Vance"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans">Institutional Role</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole('teacher')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition cursor-pointer select-none ${
                    selectedRole === 'teacher'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Faculty Portal
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole('student')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition cursor-pointer select-none ${
                    selectedRole === 'student'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Student Portal
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 outline-none select-none cursor-pointer shadow-md"
            >
              {loading ? "Creating account..." : "Submit Profile Settings"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
