import type { Env } from '../types';

export function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return false;
  }

  // Expect: Bearer <api_key>
  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return false;
  }

  return token === env.ADMIN_API_KEY;
}
