// lib/validators/emailValidator.ts
export const isKarunyaEmail = (email: string): boolean => {
  const allowedDomains = [
    '@karunya.edu',
    '@karunya.edu.in',
    '@kate.education',
    '@kate.academy',
  ];
  return allowedDomains.some((domain) => email.toLowerCase().endsWith(domain));
};
