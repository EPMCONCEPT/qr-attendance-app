import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../dbService';
import { userAgentFingerprint } from '../utils/fingerprint';
import { AttendanceSession, UserProfile, AttendanceRecord } from '../types';
import { 
  Camera, MapPin, Tablet, CheckCircle, ShieldAlert, Wifi, 
  Sparkles, ListCollapse, Play, QrCode, ClipboardCheck
} from 'lucide-react';

interface QRScannerSimulatorProps {
  userProfile: UserProfile;
  isSandbox: boolean;
  refreshFlag: number;
  triggerRefresh: () => void;
}

export default function QRScannerSimulator({ userProfile, isSandbox, refreshFlag, triggerRefresh }: QRScannerSimulatorProps) {
  const [activeSessions, setActiveSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Registration Outcomes
  const [scanStatus, setScanStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [processingScan, setProcessingScan] = useState(false);

  // Geo / Device info
  const [mockCoords, setMockCoords] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 });
  const [tempCoords, setTempCoords] = useState({ lat: '37.7749', lng: '-122.4194' });
  const [fingerprint, setFingerprint] = useState('');

  // Video Streaming scanner ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize browser fingerprint
  useEffect(() => {
    setFingerprint(userAgentFingerprint());
  }, []);

  // Sync active sessions
  useEffect(() => {
    async function loadSessions() {
      try {
        setLoading(true);
        const list = await dbService.fetchActiveSessions(isSandbox);
        setActiveSessions(list);
      } catch (err) {
        console.error("Failed to load active registers", err);
      } finally {
        setLoading(false);
      }
    }
    loadSessions();

    const interval = setInterval(loadSessions, 5000); // Check sessions every 5s
    return () => clearInterval(interval);
  }, [isSandbox, refreshFlag]);

  // Handle camera scanning cycle
  useEffect(() => {
    if (useCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [useCamera]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
        videoRef.current.play();
        animationFrameRef.current = requestAnimationFrame(scanPixelFrame);
      }
    } catch (err: any) {
      console.error("Camera startup error: ", err);
      setCameraError("Unable to access camera or webcam blocked in iframe. Please use the simulated fast scan below.");
      setUseCamera(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Extract pixel frames using canvas and feed to jsQR
  const scanPixelFrame = () => {
    if (!videoRef.current || !canvasRef.current || !useCamera) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context && video.readyState === video.HAVE_CURRENT_DATA) {
      // Scale canvas matches video feed element
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const decodedQR = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (decodedQR) {
        handleQRData(decodedQR.data);
        return; // Break scanning loop on successful match
      }
    }
    animationFrameRef.current = requestAnimationFrame(scanPixelFrame);
  };

  // Process decoded QR payload
  const handleQRData = async (qrString: string) => {
    setProcessingScan(true);
    setUseCamera(false);
    stopCamera();

    try {
      const payload = JSON.parse(qrString);
      if (!payload.sessionId || !payload.classId || !payload.token) {
        throw new Error("Invalid EduQR format detected.");
      }

      // Check temporal validity
      const expiry = new Date(payload.expiredAt).getTime();
      if (Date.now() > expiry) {
        throw new Error("This QR Code session has already expired!");
      }

      // Record attendance
      await dbService.submitAttendance(
        payload.sessionId,
        payload.classId,
        payload.className,
        userProfile.uid,
        userProfile.name,
        userProfile.email,
        mockCoords.lat,
        mockCoords.lng,
        fingerprint,
        isSandbox
      );

      setScanStatus({
        success: true,
        msg: `Successfully marked present in ${payload.className}!`
      });
      triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setScanStatus({
        success: false,
        msg: err?.message || "Failed to parse scanned attendance register."
      });
    } finally {
      setProcessingScan(false);
    }
  };

  // Immediate Simulated click mock scan handler for easy evaluation
  const handleSimulatedScan = async (session: AttendanceSession) => {
    setProcessingScan(true);
    try {
      await dbService.submitAttendance(
        session.id,
        session.classId,
        session.className,
        userProfile.uid,
        userProfile.name,
        userProfile.email,
        mockCoords.lat,
        mockCoords.lng,
        fingerprint,
        isSandbox
      );

      setScanStatus({
        success: true,
        msg: `Sandbox scan successful! Marked "Present" in ${session.className}.`
      });
      triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setScanStatus({
        success: false,
        msg: err?.message || "Attendance already marked or record rejected."
      });
    } finally {
      setProcessingScan(false);
    }
  };

  // Convert geocoords inputs
  const handleGeoSave = () => {
    const lat = parseFloat(tempCoords.lat);
    const lng = parseFloat(tempCoords.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setMockCoords({ lat, lng });
    }
  };

  return (
    <div className="space-y-6" id="student-scanner-root">
      {/* Device frame header */}
      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-xs font-bold text-slate-450 uppercase tracking-widest font-sans">
              Student Scanner Dashboard
            </h2>
            <p className="text-xs text-slate-800 font-bold mt-1">Hello, {userProfile.name}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
            <Wifi className="w-3.5 h-3.5" /> Paired Setup
          </div>
        </div>

        {/* Scan Status banner alerts */}
        <AnimatePresence>
          {scanStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-4 rounded-2xl border mb-4 flex items-start gap-3 ${
                scanStatus.success 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                  : 'bg-rose-50 border-rose-100 text-rose-850'
              }`}
            >
              {scanStatus.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className="text-xs font-bold font-sans">
                  {scanStatus.success ? 'Scan Completed' : 'Registration Failed'}
                </h4>
                <p className="text-xs mt-1 leading-relaxed">{scanStatus.msg}</p>
                <button 
                  onClick={() => setScanStatus(null)}
                  className="text-[10px] text-indigo-600 font-extrabold uppercase mt-2 hover:underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Camera Scanner Box */}
        <div className="relative aspect-video max-w-lg mx-auto bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center text-white border border-slate-850 mb-6">
          {useCamera ? (
            <>
              {/* Green targeting guide lines */}
              <div className="absolute inset-0 pointer-events-none border-[30px] border-black/40 z-10 flex items-center justify-center">
                <div className="w-36 h-36 border-2 border-dashed border-emerald-400 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-4 border-r-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-4 border-r-4 border-emerald-400"></div>
                  <div className="h-0.5 w-full bg-emerald-500 absolute top-1/2 left-0 animate-bounce"></div>
                </div>
              </div>

              <video ref={videoRef} className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              <button
                onClick={() => setUseCamera(false)}
                className="absolute bottom-4 z-20 bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider shadow cursor-pointer"
              >
                Cancel Scanner
              </button>
            </>
          ) : (
            <div className="text-center p-6 space-y-4">
              <div className="inline-flex w-11 h-11 bg-slate-800 rounded-full items-center justify-center border border-slate-700 text-slate-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Biometric Camera Scan</h3>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1 leading-relaxed">
                  Focus physical smartphone viewport on dynamic ticketing QR codes to pair enrollment.
                </p>
              </div>
              <button
                onClick={() => setUseCamera(true)}
                id="start-camera-btn"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition inline-flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-900/20"
              >
                <QrCode className="w-4 h-4" /> Start Camera Feed
              </button>
            </div>
          )}
        </div>

        {processingScan && (
          <div className="text-center py-4 text-xs font-mono text-indigo-600 flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></span>
            Validating spatial cryptographic bounds...
          </div>
        )}

        {/* Camera fallback alerts */}
        {cameraError && (
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-amber-850 text-[10px] leading-relaxed mb-6">
            <span className="font-bold uppercase tracking-wider block mb-0.5 text-amber-900">Sandbox Preview Restricted</span>
            {cameraError}
          </div>
        )}

        {/* Sandbox fast track triggers */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-dashed border-slate-200">
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-4 h-4" /> Simulated Scan Socket
          </div>
          
          <div className="space-y-2">
            {activeSessions.length === 0 ? (
              <div className="text-center py-6 text-[11px] text-slate-400 font-sans leading-relaxed">
                No active classroom registers are running. Generate a live dynamic QR from the faculty panel workstation to scan.
              </div>
            ) : (
              activeSessions.map(session => (
                <div 
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{session.className}</h4>
                    <span className="text-[9px] bg-slate-100 text-slate-550 font-bold px-1.5 py-0.5 rounded uppercase mt-1 inline-block">
                      Ticking code available
                    </span>
                  </div>

                  <button
                    onClick={() => handleSimulatedScan(session)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ClipboardCheck className="w-4 h-4" /> Scan QR
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Geolocations & Device metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mock Location configs */}
        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-5">
          <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-rose-500" /> Spatial GPS Constraints (Mock Location)
          </h3>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-4 font-medium">
            Registries require proof of presence inside physical classroom bounds:
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Latitude</label>
              <input
                type="text"
                value={tempCoords.lat}
                onChange={(e) => setTempCoords({ ...tempCoords, lat: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Longitude</label>
              <input
                type="text"
                value={tempCoords.lng}
                onChange={(e) => setTempCoords({ ...tempCoords, lng: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleGeoSave}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs py-2.5 rounded-xl font-bold uppercase tracking-wider transition cursor-pointer shadow-sm"
          >
            Apply Location coordinates
          </button>
        </div>

        {/* Hardware credentials finger-printing credentials */}
        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Tablet className="w-4 h-4 text-emerald-500" /> Anti-Proxy Device fingerprint
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4 font-medium">
              Unique device hardware signatures block proxy attendance sharing outside class layout:
            </p>
          </div>
          <div className="text-xs font-mono bg-slate-50/80 p-3 rounded-xl border border-slate-200 max-h-[110px] overflow-y-auto custom-scrollbar select-all">
            <span className="text-[9px] text-slate-400 uppercase font-sans tracking-wider block mb-1">Authenticated HW Signature:</span> 
            <span className="text-slate-600 break-words">{fingerprint || "Fingerprint credentials offline"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
