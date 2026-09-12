export const AUTH_COOKIE_NAME = "token";

export const PUBLIC_PATHS = ["/login"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function buildLoginPath(pathname: string): string {
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return "/login";
  }
  return `/login?redirect=${encodeURIComponent(pathname)}`;
}
