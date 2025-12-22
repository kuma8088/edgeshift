import type { ApiResponse } from '../types';

export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function successResponse<T>(data: T): Response {
  return jsonResponse<ApiResponse<T>>({ success: true, data }, 200);
}

export function errorResponse(error: string, status = 400): Response {
  return jsonResponse<ApiResponse>({ success: false, error }, status);
}
