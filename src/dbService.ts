import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  addDoc,
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { Classroom, AttendanceSession, AttendanceRecord } from './types';

// Helper to simulate wait in sandbox
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retrieve sandbox state from localStorage
const getSandboxData = (key: string): any[] => {
  try {
    const data = localStorage.getItem(`eduqr_sandbox_${key}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const saveSandboxData = (key: string, data: any[]) => {
  try {
    localStorage.setItem(`eduqr_sandbox_${key}`, JSON.stringify(data));
    // Trigger local storage event so other components on same window can react
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error("Local storage saving error: ", e);
  }
};

export const dbService = {
  // ==========================================
  // Classroom Operations
  // ==========================================
  async fetchClasses(teacherId: string, isSandbox: boolean): Promise<Classroom[]> {
    if (isSandbox) {
      await delay(200);
      const classes = getSandboxData('classes');
      return classes.filter(c => c.teacherId === teacherId);
    }

    const path = 'classes';
    try {
      const q = query(collection(db, path), where('teacherId', '==', teacherId));
      const snap = await getDocs(q);
      const list: Classroom[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({
          id: doc.id,
          name: d.name,
          code: d.code,
          teacherId: d.teacherId,
          createdAt: d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toISOString() : d.createdAt || '',
        });
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  },

  async createClass(name: string, code: string, teacherId: string, isSandbox: boolean): Promise<Classroom> {
    const id = `class_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newClass: Classroom = {
      id,
      name,
      code,
      teacherId,
      createdAt: new Date().toISOString(),
    };

    if (isSandbox) {
      await delay(200);
      const classes = getSandboxData('classes');
      classes.push(newClass);
      saveSandboxData('classes', classes);
      return newClass;
    }

    const path = `classes/${id}`;
    try {
      await setDoc(doc(db, 'classes', id), {
        id,
        name,
        code,
        teacherId,
        createdAt: serverTimestamp(),
      });
      return newClass;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      throw err;
    }
  },

  // ==========================================
  // Session Operations (Ticking QR codes)
  // ==========================================
  async createSession(classId: string, className: string, teacherId: string, expiryMinutes: number, isSandbox: boolean): Promise<AttendanceSession> {
    const id = `session_${Date.now()}`;
    const token = `token_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + expiryMinutes * 60 * 1000);

    const newSession: AttendanceSession = {
      id,
      classId,
      className,
      teacherId,
      token,
      expiredAt: expiry.toISOString(),
      createdAt: now.toISOString(),
      isActive: true,
    };

    if (isSandbox) {
      // Deactivate other sessions of the teacher first
      let sessions = getSandboxData('sessions');
      sessions = sessions.map(s => s.teacherId === teacherId ? { ...s, isActive: false } : s);
      sessions.push(newSession);
      saveSandboxData('sessions', sessions);
      return newSession;
    }

    const path = `sessions/${id}`;
    try {
      await setDoc(doc(db, 'sessions', id), {
        id,
        classId,
        className,
        teacherId,
        token,
        expiredAt: Timestamp.fromDate(expiry),
        createdAt: serverTimestamp(),
        isActive: true,
      });
      return newSession;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      throw err;
    }
  },

  async endSession(sessionId: string, isSandbox: boolean): Promise<void> {
    if (isSandbox) {
      const sessions = getSandboxData('sessions');
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        sessions[idx].isActive = false;
        saveSandboxData('sessions', sessions);
      }
      return;
    }

    const path = `sessions/${sessionId}`;
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        isActive: false,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async fetchActiveSessions(isSandbox: boolean): Promise<AttendanceSession[]> {
    if (isSandbox) {
      const sessions = getSandboxData('sessions');
      return sessions.filter(s => s.isActive && new Date(s.expiredAt) > new Date());
    }

    const path = 'sessions';
    try {
      const q = query(collection(db, path), where('isActive', '==', true));
      const snap = await getDocs(q);
      const list: AttendanceSession[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        const expiredDate = d.expiredAt?.seconds ? new Date(d.expiredAt.seconds * 1000) : new Date(d.expiredAt);
        // Client-side prune expired
        if (expiredDate > new Date()) {
          list.push({
            id: doc.id,
            classId: d.classId,
            className: d.className,
            teacherId: d.teacherId,
            token: d.token,
            expiredAt: expiredDate.toISOString(),
            createdAt: d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toISOString() : d.createdAt || '',
            isActive: d.isActive,
          });
        }
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  },

  // ==========================================
  // Attendance Writing & Reading
  // ==========================================
  async submitAttendance(
    sessionId: string,
    classId: string,
    className: string,
    studentId: string,
    studentName: string,
    studentEmail: string,
    lat?: number,
    lng?: number,
    deviceFingerprint?: string,
    isSandbox: boolean = false
  ): Promise<AttendanceRecord> {
    const id = `${sessionId}_${studentId}`;
    const now = new Date();

    // Check if late (e.g., if there's arbitrary baseline)
    const status: 'present' | 'late' = 'present'; 

    const record: AttendanceRecord = {
      id,
      sessionId,
      classId,
      className,
      studentId,
      studentName,
      studentEmail,
      timestamp: now.toISOString(),
      status,
      lat,
      lng,
      deviceFingerprint,
    };

    if (isSandbox) {
      const attendances = getSandboxData('attendance');
      
      // Duplication check
      const exists = attendances.some(a => a.id === id);
      if (exists) {
        throw new Error("Attendance already marked for this session!");
      }

      attendances.push(record);
      saveSandboxData('attendance', attendances);
      return record;
    }

    const path = `attendance/${id}`;
    try {
      // Direct transaction set
      await setDoc(doc(db, 'attendance', id), {
        id,
        sessionId,
        classId,
        className,
        studentId,
        studentName,
        studentEmail,
        timestamp: serverTimestamp(),
        status,
        lat: lat || null,
        lng: lng || null,
        deviceFingerprint: deviceFingerprint || null,
      });
      return record;
    } catch (err: any) {
      if (err?.code === 'already-exists') {
        throw new Error("Attendance already marked for this session!");
      }
      handleFirestoreError(err, OperationType.CREATE, path);
      throw err;
    }
  },

  async fetchAttendanceRecords(isSandbox: boolean): Promise<AttendanceRecord[]> {
    if (isSandbox) {
      return getSandboxData('attendance');
    }

    const path = 'attendance';
    try {
      const snap = await getDocs(collection(db, path));
      const list: AttendanceRecord[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({
          id: doc.id,
          sessionId: d.sessionId,
          classId: d.classId,
          className: d.className,
          studentId: d.studentId,
          studentName: d.studentName,
          studentEmail: d.studentEmail,
          timestamp: d.timestamp?.seconds ? new Date(d.timestamp.seconds * 1000).toISOString() : d.timestamp || '',
          status: d.status,
          lat: d.lat || undefined,
          lng: d.lng || undefined,
          deviceFingerprint: d.deviceFingerprint || undefined,
        });
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  }
};
