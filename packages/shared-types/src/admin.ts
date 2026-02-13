/** Session data stored server-side */
export interface AdminSession {
  adminId: string;
  adminUsername: string;
}

/** POST /admin/api/login request body */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /admin/api/login success response */
export interface LoginResponse {
  success: true;
}

/** POST /admin/api/login error response */
export interface LoginErrorResponse {
  error: string;
}

/** GET /admin/api/session response when authenticated */
export interface SessionResponse {
  authenticated: true;
  username: string;
}

/** GET /admin/api/session response when not authenticated */
export interface SessionErrorResponse {
  error: string;
}

/** POST /admin/api/logout response */
export interface LogoutResponse {
  success: true;
}
