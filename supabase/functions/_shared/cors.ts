const productionOrigin = "https://bloodconnectindia.org";
const allowedMethods = ["POST", "OPTIONS"] as const;
const allowedHeaders = ["authorization", "x-client-info", "apikey", "content-type"] as const;

const requestedHeaders = (request: Request) =>
  (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

export const productionOriginAllowed = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === productionOrigin;
};

export const productionCorsHeaders = (request: Request, json = true) => {
  const headers = new Headers({
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": allowedHeaders.join(", "),
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin, Access-Control-Request-Headers",
  });
  if (productionOriginAllowed(request) && request.headers.get("origin")) {
    headers.set("Access-Control-Allow-Origin", productionOrigin);
  }
  if (json) headers.set("Content-Type", "application/json");
  return headers;
};

export const productionCorsReply = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: productionCorsHeaders(request) });

export const productionPreflight = (request: Request) => {
  if (!productionOriginAllowed(request)) {
    return productionCorsReply(request, { error: "Request origin is not allowed." }, 403);
  }
  const method = request.headers.get("access-control-request-method")?.toUpperCase();
  if (method && method !== "POST") {
    return productionCorsReply(request, { error: "Request method is not allowed." }, 405);
  }
  if (requestedHeaders(request).some((header) => !allowedHeaders.includes(header as typeof allowedHeaders[number]))) {
    return productionCorsReply(request, { error: "Request headers are not allowed." }, 400);
  }
  return new Response(null, { status: 204, headers: productionCorsHeaders(request, false) });
};
