export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export function html(markup: string, init?: ResponseInit): Response {
  return new Response(markup, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location
    }
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Unauthorized"): Response {
  return json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): Response {
  return json({ error: message }, { status: 403 });
}

export function tooManyRequests(message = "Rate limit exceeded"): Response {
  return json({ error: message }, { status: 429 });
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getBearerToken(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim();
  if (!value) return null;
  const [scheme, token] = value.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function getOperatorKey(request: Request): string | null {
  return request.headers.get("x-operator-key");
}
