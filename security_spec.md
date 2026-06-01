# Firestore Security Rules Specification

This document details the security specification, data invariants, and negative audit test payloads for the QR Code Based Attendance App.

## 1. Data Invariants

1. **Self-Ownership of User Profiles**: A user can only read and write their own user profile document. Role allocation (`teacher` vs `student`) is set on initial creation but CANNOT be changed afterwards by the client, preventing privilege escalation.
2. **Teacher Class Monopoly**: Only authenticated users with the `teacher` role can create or modify `classes`. Students can read classes but cannot create or modify them.
3. **Session Genesis**: Only the teacher who owns the classroom can create or modify `sessions`. Sessions must contain valid classroom references.
4. **Attendance Scan Integrity**:
   - Students can only submit attendance records containing their own `uid`, `name`, and `email` matching their authenticated credential.
   - Students cannot modify or delete historic attendance database records once written (Immutable records).
   - Students must submit with server-verifiable timestamps (`request.time`).
   - Standard users cannot falsify their identity.

---

## 2. The "Dirty Dozen" Attack Vectors (Negative Payloads)

Here are twelve payloads designed to exploit potential security update gaps, identity mismatches, or resource poisoning in our database, which our `firestore.rules` must successfully block.

### Vector 1: Profile Hijacking (Privilege Escalation)
* **Goal**: Student tries to change their role from `student` to `teacher` on update.
* **Result**: `Permission Denied` because role update is forbidden on the client.

### Vector 2: User Profile Spoofing
* **Goal**: Student tries to overwrite another student's profile inside the `/users/{userId}` path (e.g. `userId` mismatch with auth UID).
* **Result**: `Permission Denied` due to strict UID path equality rules.

### Vector 3: Classroom Intrusion
* **Goal**: Student attempts to create a classroom or assign themselves as a teacher of a class.
* **Result**: `Permission Denied` because the user profile role must be checked, or writes to `/classes` are reserved for teachers.

### Vector 4: Class Poisoning (Mass Record Creation)
* **Goal**: Generating a class ID containing 500 characters of malicious strings (ID Poisoning).
* **Result**: `Permission Denied` due to strict `isValidId()` rule checking character ranges and lengths.

### Vector 5: Ghost Sessions
* **Goal**: Student tries to start a simulated session `/sessions/{sessionId}` to bypass active teachers.
* **Result**: `Permission Denied` because only teachers can start sessions.

### Vector 6: Session Hijacking (Takeover)
* **Goal**: Teacher A tries to stop, delete, or modify a session owned by Teacher B.
* **Result**: `Permission Denied` because modified actions require matching the `teacherId` within the existing resource.

### Vector 7: Attendance Identity Spoofing
* **Goal**: Student A submits an attendance record setting `studentId: "Student_B"` to mark their friend present.
* **Result**: `Permission Denied` because `incoming().studentId` is strictly validated to equal `request.auth.uid`.

### Vector 8: Future Attendance (Temporal Deception)
* **Goal**: Student submits a scan timestamp set to next week to fake attendance advance.
* **Result**: `Permission Denied` since `timestamp` must strictly be written as `request.time`.

### Vector 9: Double Write / Ghost Updates
* **Goal**: Student attempts to edit their already-marked attendance record to change a late status to present.
* **Result**: `Permission Denied` because `update` operations on attendance records are entirely forbidden, making them write-once.

### Vector 10: Denial of Wallet (Giant Payload)
* **Goal**: Injecting a massive block of 500KB garbage text inside classroom descriptions to deplete cloud credits.
* **Result**: `Permission Denied` owing to strict sizing limits (`incoming().name.size() <= 100`).

### Vector 11: Session Orphanage
* **Goal**: Creating an attendance record referencing a class or session that does not exist in the database.
* **Result**: `Permission Denied` because attendance creation checks `exists(/databases/$(database)/documents/sessions/$(incoming().sessionId))` to enforce relationships.

### Vector 12: Anonymous Vandalism
* **Goal**: Submitting classrooms or profiles without a verified email address or while unauthenticated.
* **Result**: `Permission Denied` because all standard writes require `request.auth != null && request.auth.token.email_verified == true`.

---

## 3. Rules Implementation Strategy

We will build `firestore.rules` incorporating the following helper methods:
- `isSignedIn()`: validates that client matches general authentication requirements.
- `isValidId(id)`: checks size and character structure of key identifiers.
- `getUserData()`: retrieves the authenticated user's profile to verify `role == 'teacher'`.
- `isValidUser(data)`: validates creation payload keys and fields.
- `isValidClass(data)`: ensures strict schema sizes and keys for classes.
- `isValidSession(data)`: guarantees format schema for ticking active QR periods.
- `isValidAttendance(data)`: locks incoming scan records to student profile.
