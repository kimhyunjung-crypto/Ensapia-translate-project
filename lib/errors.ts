import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type SafeErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
};

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "input";
    fields[field] = [...(fields[field] ?? []), issue.message];
  }

  return fields;
}

export function toSafeError(error: unknown): { status: number; body: SafeErrorBody } {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "입력 내용을 확인해 주세요.",
          fields: zodFields(error),
        },
      },
    };
  }

  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "DUPLICATE_DATA",
          message: "이미 등록된 항목입니다.",
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    },
  };
}

export function safeErrorResponse(error: unknown): Response {
  const safe = toSafeError(error);

  return Response.json(safe.body, {
    status: safe.status,
    headers: { "Cache-Control": "no-store" },
  });
}
