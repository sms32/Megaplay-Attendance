// lib/utils/adminCheck.ts
export const ADMIN_EMAILS = [
  'sammichael@karunya.edu.in',
  'hod_dove@karunya.edu',
  'rhea@karunya.edu'
];

export const isAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const lowerEmail = email.toLowerCase();
  return ADMIN_EMAILS.some((adminEmail) => lowerEmail === adminEmail.toLowerCase());
};

export const isAdminFromList = (email: string | null | undefined): boolean => {
  return isAdmin(email);
};
