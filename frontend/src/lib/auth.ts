const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + TOKEN_KEY + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setToken(token: string) {
  const maxAge = 7 * 24 * 3600;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearToken() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}
