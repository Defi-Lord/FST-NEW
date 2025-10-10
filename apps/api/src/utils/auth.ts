// src/utils/auth.ts
export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function isAuthed(): boolean {
  const t = getToken();
  return !!t && t.startsWith('eyJ'); // quick & dirty check for JWT shape
}

export function signOut() {
  localStorage.removeItem('auth_token');
}
