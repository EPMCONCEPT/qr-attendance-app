import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../dbService';
import { Classroom, AttendanceSession, AttendanceRecord, UserProfile } from '../types';
import { 
  Users, Plus, Clock, Play, AlertCircle, CheckCircle2, RefreshCw, 
  Trash2, MapPin, Tablet, ShieldAlert, CalendarRange
} from 'lucide-react';

interface ClassroomManagerProps {
  userProfile: UserProfile;
  isSandbox: boolean;
  refreshFlag: number;
  triggerRefresh: () => void;
}

export default function ClassroomManager({ userProfile, isSandbox, refreshFlag, triggerRefresh }: ClassroomManagerProps) {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Class Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [classError, setClassError] = useState<string | null>(null);

  // Active Session State
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [sessionDuration, setSessionDuration] = useState<number>(5); // minutes
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [scannedStudents, setScannedStudents] = useState<AttendanceRecord[]>([]);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load Classes
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const list = await dbService.fetchClasses(userProfile.uid, isSandbox);
        setClasses(list);

        // Check if there's an active session in local storage/database
        const sessions = await dbService.fetchActiveSessions(isSandbox);
        const myActive = sessions.find(s => s.teacherId === userProfile.uid);
        if (myActive) {
          setActiveSession(myActive);
        } else {
          setActiveSession(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userProfile.uid, isSandbox, refreshFlag]);

  // Load Live Roster for Active Session
  useEffect(() => {
    let rosterInterval: NodeJS.Timeout;
    
    async function checkRoster() {
      if (!activeSession) return;
      try {
        const records = await dbService.fetchAttendanceRecords(isSandbox);
        const activeRecords = records.filter(r => r.sessionId === activeSession.id);
        setScannedStudents(activeRecords);
      } catch (err) {
        console.error(err);
      }
    }

    if (activeSession) {
      checkRoster();
      rosterInterval = setInterval(checkRoster, 2500); // Poll every 2.5s for real-time responsiveness
    } else {
      setScannedStudents([]);
    }

    return () => {
      if (rosterInterval) clearInterval(rosterInterval);
    };
  }, [activeSession, isSandbox, refreshFlag]);

  // Handle active session timing & QR refresh
  useEffect(() => {
    if (!activeSession) {
      setQrCodeUrl('');
      setTimeLeft('');
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Generate QR Code
    const qrPayload = JSON.stringify({
      sessionId: activeSession.id,
      classId: activeSession.classId,
      className: activeSession.className,
      token: activeSession.token,
      expiredAt: activeSession.expiredAt
    });

    QRCode.toDataURL(qrPayload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#1e1b4b', // Deep indigo
        light: '#ffffff'
      }
    }).then(url => {
      setQrCodeUrl(url);
    }).catch(err => {
      console.error("QR Code Generation Error", err);
    });

    // Countdown Timer
    const expiry = new Date(activeSession.expiredAt).getTime();
    
    const updateCountdown = () => {
      const now = new Date().getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft('EXPIRED');
        setActiveSession(null);
        dbService.endSession(activeSession.id, isSandbox);
        triggerRefresh();
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        const mins = Math.floor(diff / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
      }
    };

    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession]);

  // Create class handler
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassCode.trim()) {
      setClassError("Please provide both name and code.");
      return;
    }
    setClassError(null);
    try {
      const created = await dbService.createClass(
        newClassName.trim(),
        newClassCode.trim().toUpperCase(),
        userProfile.uid,
        isSandbox
      );
      setClasses(prev => [...prev, created]);
      setNewClassName('');
      setNewClassCode('');
      setShowCreateForm(false);
      triggerRefresh();
    } catch (err: any) {
      setClassError(err?.message || "Failed to create class.");
    }
  };

  // Start Session handler
  const handleStartSession = async (classId: string, className: string) => {
    try {
      const session = await dbService.createSession(
        classId,
        className,
        userProfile.uid,
        sessionDuration,
        isSandbox
      );
      setActiveSession(session);
      triggerRefresh();
    } catch (err) {
      console.error("Error creating session", err);
    }
  };

  // Close Session handler
  const handleCloseSession = async () => {
    if (!activeSession) return;
    try {
      await dbService.endSession(activeSession.id, isSandbox);
      setActiveSession(null);
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6" id="classroom-manager-root">
      {/* Active Scan Monitor */}
      <AnimatePresence mode="wait">
        {activeSession && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl overflow-hidden border border-slate-800"
            id="active-session-banner"
          >
            {/* QR block */}
            <div className="md:col-span-12 lg:col-span-5 flex flex-col items-center justify-center bg-white/5 rounded-2xl p-6 border border-white/10 relative">
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-emerald-500 text-white px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-widest animate-pulse">
                <Tablet className="w-3 h-3" /> Live Registry
              </div>
              
              <div className="bg-white p-3.5 rounded-2xl mt-5 flex items-center justify-center shadow-lg border border-slate-150">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="Session QR Code" referrerPolicy="no-referrer" className="w-52 h-52 select-none" />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center bg-slate-50 text-slate-800 font-mono text-xs rounded-xl">
                    Generating QR code...
                  </div>
                )}
              </div>

              <div className="text-center mt-4">
                <p className="text-xs text-slate-300 font-medium tracking-wide">
                  Topic: <span className="font-bold text-white block text-sm mt-0.5">{activeSession.className}</span>
                </p>
                <div className="flex items-center gap-1.5 justify-center mt-3 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-base font-bold text-emerald-400">{timeLeft}</span>
                  <span className="text-[10px] text-slate-300 font-medium uppercase tracking-wider">remaining</span>
                </div>
              </div>
            </div>

            {/* Live Scanned List block */}
            <div className="md:col-span-12 lg:col-span-7 flex flex-col h-full min-h-[320px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wider font-sans text-white">Active Enrollment Feed</h3>
                  <p className="text-xs text-slate-400">Verifying high-speed signatures instantly</p>
                </div>
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                  <Users className="w-3.5 h-3.5 text-indigo-300" />
                  <span>{scannedStudents.length} present</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-2 select-none custom-scrollbar">
                {scannedStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8 text-slate-400/70">
                    <RefreshCw className="w-8 h-8 mb-2 animate-spin text-indigo-500" />
                    <p className="text-xs font-medium">Awaiting student scans. Device cameras are pairing live...</p>
                  </div>
                ) : (
                  scannedStudents.map((student, i) => (
                    <motion.div
                      key={student.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                          {student.studentName.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{student.studentName}</p>
                          <p className="text-[10px] text-slate-400">{student.studentEmail}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {student.lat && (
                          <div className="flex items-center gap-0.5 text-slate-300 text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded uppercase font-semibold">
                            <MapPin className="w-2.5 h-2.5 text-rose-500" /> GPS OK
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-bold">
                          Marked
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <button
                onClick={handleCloseSession}
                id="close-session-btn"
                className="mt-4 w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition outline-none select-none cursor-pointer shadow-lg shadow-rose-950/20"
              >
                End Active Register Session
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roster & Classes setup */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Course Config Column */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-450 font-sans uppercase tracking-widest">
                My Classrooms
              </h2>
              <button
                onClick={() => setShowCreateForm(prev => !prev)}
                id="add-class-btn"
                className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100/50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition text-xs flex items-center gap-1 font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {showCreateForm && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                onSubmit={handleCreateClass}
                className="mb-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                id="create-class-form"
              >
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">New Classroom</h3>
                {classError && (
                  <p className="text-[10px] text-red-600 bg-red-50 p-2 rounded">{classError}</p>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Class Name</label>
                  <input
                    type="text"
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g. Data Structures"
                    className="w-full bg-white border border-slate-200 rounded-xl text-xs p-2.5 px-3 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Course Code</label>
                  <input
                    type="text"
                    required
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    placeholder="e.g. CS201"
                    className="w-full bg-white border border-slate-200 rounded-xl text-xs p-2.5 px-3 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-white border border-slate-200 text-slate-500 rounded-xl px-3 py-2 text-xs font-bold uppercase transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.form>
            )}

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-6 text-xs text-slate-400">Loading classrooms...</div>
              ) : classes.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-sans border border-dashed border-slate-200 rounded-2xl">
                  No courses added yet. Click Add to setup registries.
                </div>
              ) : (
                classes.map(cls => (
                  <div 
                    key={cls.id}
                    className="flex items-center justify-between p-3 border border-slate-100 rounded-2xl bg-slate-50/40 hover:bg-slate-50 transition"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{cls.name}</h4>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{cls.code}</p>
                    </div>

                    <button
                      disabled={!!activeSession}
                      onClick={() => handleStartSession(cls.id, cls.name)}
                      className="p-1 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-150"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Register
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sessions overview Column */}
        <div className="md:col-span-2">
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-6 h-full flex flex-col">
            <h2 className="text-xs font-bold text-slate-450 font-sans uppercase tracking-widest mb-4 flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-indigo-500" /> Ticking QR Lifespan settings
            </h2>
            
            <div className="flex-1 flex flex-col justify-center items-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-center text-slate-500">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-indigo-600 mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-850 mb-1 uppercase tracking-wide">Dynamic Expiry Lifespan</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                Configure short ticking buffers to block unauthorized student QR proxy sharing. Select period:
              </p>
              
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[2, 5, 10, 15].map(mins => (
                  <button
                    key={mins}
                    onClick={() => setSessionDuration(mins)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                      sessionDuration === mins
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-150'
                        : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {mins} mins {mins === 5 && '(Recommended)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
