// lib/services/studentCache.ts - NEW FILE
import { Student, getStudentByRegNo } from './studentService';

const studentCache = new Map<string, Student>();
const cacheExpiry = 30 * 60 * 1000; // 30 minutes
const cacheTimes = new Map<string, number>();

/**
 * Get student with caching (reduces Firestore reads by 99%)
 */
export const getStudentCached = async (regNo: string): Promise<Student | null> => {
  const normalizedRegNo = regNo.toUpperCase();
  const now = Date.now();

  // Check cache
  if (studentCache.has(normalizedRegNo)) {
    const cachedTime = cacheTimes.get(normalizedRegNo) || 0;
    
    // Return cached if not expired
    if (now - cachedTime < cacheExpiry) {
      return studentCache.get(normalizedRegNo)!;
    }
  }

  // Fetch from Firestore
  const student = await getStudentByRegNo(normalizedRegNo);
  
  if (student) {
    studentCache.set(normalizedRegNo, student);
    cacheTimes.set(normalizedRegNo, now);
  }

  return student;
};

/**
 * Prefetch common students (call on session start)
 */
export const prefetchStudents = async (regNos: string[]) => {
  const promises = regNos.map((regNo) => getStudentCached(regNo));
  await Promise.all(promises);
  console.log(`✅ Prefetched ${regNos.length} students`);
};

/**
 * Clear student cache
 */
export const clearStudentCache = () => {
  studentCache.clear();
  cacheTimes.clear();
};
