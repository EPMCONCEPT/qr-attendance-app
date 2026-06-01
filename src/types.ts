export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  createdAt: string;
}

export interface Classroom {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  createdAt: string;
}

export interface AttendanceSession {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  token: string;
  expiredAt: any; // Can be Timestamp or string/date representation
  createdAt: any;
  isActive: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  timestamp: any;
  status: 'present' | 'late';
  lat?: number;
  lng?: number;
  deviceFingerprint?: string;
}
