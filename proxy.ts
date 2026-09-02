import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const LOCAL_HOSTNAME = "127.0.0.1";

export function isAllowedLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;

  const [hostname, port, ...rest] = hostHeader.toLowerCase().split(":");
  const hasValidPort = port === undefined || /^\d+$/.test(port);

  return hostname === LOCAL_HOSTNAME && hasValidPort && rest.length === 0;
}

export function proxy(request: NextRequest) {
  if (!isAllowedLocalHost(request.headers.get("host"))) {
    return new NextResponse(
      "이 앱은 이 컴퓨터의 http://127.0.0.1 주소에서만 사용할 수 있습니다.",
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)"],
};
