/* ============================================
   TRACKIQ — FIREBASE CLIENT (v6)
   Auth + Firestore + Cloudinary + Monthly Reports
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB87qrIgZRp_ExfNN4vVtcAGf5N4qXWUxs",
  authDomain: "trackiq-97024.firebaseapp.com",
  projectId: "trackiq-97024",
  storageBucket: "trackiq-97024.firebasestorage.app",
  messagingSenderId: "384237627823",
  appId: "1:384237627823:web:f663a6e32dc109f259275a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------- CLOUDINARY CONFIG ---------- */
const CLOUDINARY_CLOUD_NAME = 'wxhjrwyz';
const CLOUDINARY_UPLOAD_PRESET = 'trackiq_unsigned';

export async function uploadFile(file, folder = 'trackiq') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Cloudinary upload failed');
  }

  const result = await response.json();
  return result.secure_url;
}

export async function deleteFile(publicId) {
  console.warn('Cloudinary file deletion requires backend or dashboard. Public ID:', publicId);
  return true;
}

/* ---------- AUTH ---------- */
export async function signUp(email, password, displayName) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(userCredential.user, { displayName });
  }
  await setDoc(doc(db, 'profiles', userCredential.user.uid), {
    display_name: displayName || '',
    email: email,
    created_at: Timestamp.now(),
    xp: 0,
    level: 1,
    total_study_time: 0,
    tier: 'balanced'
  });
  return userCredential.user;
}

export async function signIn(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function signOutUser() {
  if (window.Store) {
    window.Store.set('user', null);
    window.Store.set('profile', null);
  }
  await signOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ---------- ACCOUNT SECURITY ---------- */
export async function changeUserPassword(newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await updatePassword(user, newPassword);
}

export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function deleteUserAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  const userId = user.uid;
  const batch = writeBatch(db);

  batch.delete(doc(db, 'profiles', userId));

  const coursesSnap = await getDocs(query(collection(db, 'courses'), where('user_id', '==', userId)));
  for (const c of coursesSnap.docs) {
    batch.delete(doc(db, 'courses', c.id));
    const topicsSnap = await getDocs(query(collection(db, 'topics'), where('course_id', '==', c.id)));
    for (const t of topicsSnap.docs) {
      batch.delete(doc(db, 'topics', t.id));
      const resourcesSnap = await getDocs(query(collection(db, 'resources'), where('topic_id', '==', t.id)));
      for (const r of resourcesSnap.docs) {
        batch.delete(doc(db, 'resources', r.id));
      }
      const plannerSnap = await getDocs(query(collection(db, 'planner'), where('topic_id', '==', t.id)));
      for (const p of plannerSnap.docs) {
        batch.delete(doc(db, 'planner', p.id));
      }
    }
  }

  const sessionsSnap = await getDocs(query(collection(db, 'study_sessions'), where('user_id', '==', userId)));
  for (const s of sessionsSnap.docs) {
    batch.delete(doc(db, 'study_sessions', s.id));
  }

  const plannerSnap = await getDocs(query(collection(db, 'planner'), where('user_id', '==', userId)));
  for (const p of plannerSnap.docs) {
    batch.delete(doc(db, 'planner', p.id));
  }

  const milestonesSnap = await getDocs(query(collection(db, 'milestones'), where('user_id', '==', userId)));
  for (const m of milestonesSnap.docs) {
    batch.delete(doc(db, 'milestones', m.id));
  }

  await batch.commit();
  await deleteUser(user);
}

/* ---------- PROFILES ---------- */
export async function getProfile(userId) {
  const docRef = doc(db, 'profiles', userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return {
    id: userId,
    display_name: '',
    email: '',
    xp: 0,
    level: 1,
    total_study_time: 0,
    tier: 'balanced',
    weekly_goal: 15
  };
}

export async function updateProfileData(userId, updates) {
  const docRef = doc(db, 'profiles', userId);
  const docSnap = await getDoc(docRef);

  const cleaned = { ...updates };
  for (const key in cleaned) {
    if (cleaned[key] === null) cleaned[key] = deleteField();
  }

  if (docSnap.exists()) {
    await updateDoc(docRef, cleaned);
  } else {
    await setDoc(docRef, {
      display_name: '',
      email: '',
      created_at: Timestamp.now(),
      xp: 0,
      level: 1,
      total_study_time: 0,
      tier: 'balanced',
      weekly_goal: 15,
      ...updates
    });
  }
  return updates;
}

/* ---------- COURSES ---------- */
export async function fetchCourses(userId) {
  try {
    const q = query(
      collection(db, 'courses'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for courses, falling back to unordered query');
      const q = query(collection(db, 'courses'), where('user_id', '==', userId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createCourse(userId, name) {
  const docRef = await addDoc(collection(db, 'courses'), {
    user_id: userId,
    name: name,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now()
  });
  return { id: docRef.id, name: name, user_id: userId };
}

export async function updateCourse(courseId, updates) {
  const docRef = doc(db, 'courses', courseId);
  await updateDoc(docRef, {
    ...updates,
    updated_at: Timestamp.now()
  });
  return updates;
}

export async function deleteCourse(courseId) {
  const topicsQuery = query(collection(db, 'topics'), where('course_id', '==', courseId));
  const topicsSnap = await getDocs(topicsQuery);
  for (const topicDoc of topicsSnap.docs) {
    const resourcesQuery = query(collection(db, 'resources'), where('topic_id', '==', topicDoc.id));
    const resourcesSnap = await getDocs(resourcesQuery);
    for (const resDoc of resourcesSnap.docs) {
      await deleteDoc(doc(db, 'resources', resDoc.id));
    }
    const plannerQuery = query(collection(db, 'planner'), where('topic_id', '==', topicDoc.id));
    const plannerSnap = await getDocs(plannerQuery);
    for (const planDoc of plannerSnap.docs) {
      await deleteDoc(doc(db, 'planner', planDoc.id));
    }
    await deleteDoc(doc(db, 'topics', topicDoc.id));
  }
  await deleteDoc(doc(db, 'courses', courseId));
}

/* ---------- TOPICS ---------- */
export async function fetchTopics(courseId) {
  try {
    const q = query(
      collection(db, 'topics'),
      where('course_id', '==', courseId),
      orderBy('created_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for topics, falling back to unordered query');
      const q = query(collection(db, 'topics'), where('course_id', '==', courseId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createTopic(courseId, name, targetHours) {
  const docRef = await addDoc(collection(db, 'topics'), {
    course_id: courseId,
    name: name,
    target_hours: targetHours,
    completed_hours: 0,
    status: 'active',
    created_at: Timestamp.now(),
    updated_at: Timestamp.now()
  });
  return { id: docRef.id, course_id: courseId, name, target_hours: targetHours, completed_hours: 0, status: 'active' };
}

export async function updateTopic(topicId, updates) {
  const docRef = doc(db, 'topics', topicId);
  await updateDoc(docRef, {
    ...updates,
    updated_at: Timestamp.now()
  });
  return updates;
}

export async function deleteTopic(topicId) {
  const resourcesQuery = query(collection(db, 'resources'), where('topic_id', '==', topicId));
  const resourcesSnap = await getDocs(resourcesQuery);
  for (const resDoc of resourcesSnap.docs) {
    await deleteDoc(doc(db, 'resources', resDoc.id));
  }
  const plannerQuery = query(collection(db, 'planner'), where('topic_id', '==', topicId));
  const plannerSnap = await getDocs(plannerQuery);
  for (const planDoc of plannerSnap.docs) {
    await deleteDoc(doc(db, 'planner', planDoc.id));
  }
  await deleteDoc(doc(db, 'topics', topicId));
}

/* ---------- RESOURCES ---------- */
export async function fetchResources(topicId) {
  try {
    const q = query(
      collection(db, 'resources'),
      where('topic_id', '==', topicId),
      orderBy('created_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for resources, falling back to unordered query');
      const q = query(collection(db, 'resources'), where('topic_id', '==', topicId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createResource(topicId, name, fileUrl, fileType) {
  const docRef = await addDoc(collection(db, 'resources'), {
    topic_id: topicId,
    name: name,
    file_url: fileUrl,
    file_type: fileType,
    created_at: Timestamp.now()
  });
  return { id: docRef.id, topic_id: topicId, name, file_url: fileUrl, file_type: fileType };
}

export async function deleteResource(resourceId) {
  await deleteDoc(doc(db, 'resources', resourceId));
}

/* ---------- STUDY SESSIONS ---------- */
export async function fetchSessions(userId) {
  try {
    const q = query(
      collection(db, 'study_sessions'),
      where('user_id', '==', userId),
      orderBy('started_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for study_sessions, falling back to unordered query');
      const q = query(collection(db, 'study_sessions'), where('user_id', '==', userId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createSession(sessionData) {
  const docRef = await addDoc(collection(db, 'study_sessions'), {
    ...sessionData,
    started_at: Timestamp.now()
  });
  return { id: docRef.id, ...sessionData };
}

export async function endSession(sessionId, sessionData) {
  const docRef = doc(db, 'study_sessions', sessionId);
  await updateDoc(docRef, {
    ...sessionData,
    ended_at: Timestamp.now()
  });
}

/* ---------- PLANNER ---------- */
export async function fetchPlanner(userId) {
  try {
    const q = query(
      collection(db, 'planner'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for planner, falling back to unordered query');
      const q = query(collection(db, 'planner'), where('user_id', '==', userId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createPlannerItem(userId, itemData) {
  const docRef = await addDoc(collection(db, 'planner'), {
    ...itemData,
    user_id: userId,
    created_at: Timestamp.now()
  });
  return { id: docRef.id, ...itemData };
}

export async function deletePlannerItem(itemId) {
  await deleteDoc(doc(db, 'planner', itemId));
}

/* ---------- MILESTONES ---------- */
export async function fetchMilestones(userId) {
  try {
    const q = query(
      collection(db, 'milestones'),
      where('user_id', '==', userId),
      orderBy('achieved_at', 'desc'),
      limit(100)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('Index missing for milestones, falling back to unordered query');
      const q = query(collection(db, 'milestones'), where('user_id', '==', userId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    throw err;
  }
}

export async function createMilestone(userId, milestoneData) {
  const docRef = await addDoc(collection(db, 'milestones'), {
    ...milestoneData,
    user_id: userId,
    achieved_at: Timestamp.now()
  });
  return { id: docRef.id, ...milestoneData };
}

/* ---------- AI CHAT ---------- */
export async function sendChatMessage(message, history = []) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });
  if (!response.ok) {
    throw new Error('Chat request failed');
  }
  return response.json();
}

/* ============================================================
   MONTHLY PROGRESS REPORTS — Firestore Helpers
   ============================================================ */

export async function fetchMonthlyReports(userId) {
  try {
    const q = query(
      collection(db, 'monthly_reports'),
      where('user_id', '==', userId),
      orderBy('year', 'desc'),
      orderBy('month', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      const q = query(collection(db, 'monthly_reports'), where('user_id', '==', userId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    }
    throw err;
  }
}

export async function getMonthlyReport(userId, year, month) {
  const docId = `${userId}_${year}_${month}`;
  const docRef = doc(db, 'monthly_reports', docId);
  const snap = await getDoc(docRef);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  return null;
}

export async function saveMonthlyReport(userId, year, month, reportData) {
  const docId = `${userId}_${year}_${month}`;
  const docRef = doc(db, 'monthly_reports', docId);
  await setDoc(docRef, {
    user_id: userId,
    year,
    month,
    ...reportData,
    created_at: Timestamp.now(),
    locked: true
  });
  return docId;
}

export async function fetchAllSessions(userId) {
  try {
    const q = query(
      collection(db, 'study_sessions'),
      where('user_id', '==', userId),
      orderBy('started_at', 'desc'),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      const q = query(collection(db, 'study_sessions'), where('user_id', '==', userId), limit(500));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    throw err;
  }
}

export async function fetchAllTopics(userId, courses) {
  const allTopics = [];
  for (const course of courses) {
    try {
      const q = query(collection(db, 'topics'), where('course_id', '==', course.id), limit(100));
      const snap = await getDocs(q);
      snap.docs.forEach(d => allTopics.push({ id: d.id, ...d.data(), course_name: course.name }));
    } catch (e) { console.error(e); }
  }
  return allTopics;
}

export async function fetchGoals(userId) {
  try {
    const q = query(collection(db, 'goals'), where('user_id', '==', userId), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    return [];
  }
}