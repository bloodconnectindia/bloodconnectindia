(function exposeSupabaseBrowserConfig(root) {
    "use strict";

    const environments = new Set(["local", "dev", "test", "preview", "production"]);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    const fail = (message) => { throw new Error(`Supabase browser configuration rejected: ${message}`); };
    const isLoopback = (hostname) => loopbackHosts.has(String(hostname || "").toLowerCase());

    function decodeJwt(value) {
        const parts = value.split(".");
        if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || parts[2].length < 20) {
            return null;
        }
        try {
            const decode = (part) => {
                const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
                const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
                return JSON.parse(root.atob(padded));
            };
            return { header: decode(parts[0]), payload: decode(parts[1]) };
        } catch {
            return null;
        }
    }

    function isBrowserPublishableKey(value) {
        const normalized = value.toLowerCase();
        if (normalized.includes("service_role") || normalized.includes("sb_secret_") || normalized.includes("secret")) {
            return false;
        }
        if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return true;
        const jwt = decodeJwt(value);
        return jwt?.header?.alg === "HS256" && jwt?.header?.typ === "JWT" &&
            jwt?.payload?.role === "anon" && jwt?.payload?.iss === "supabase" &&
            Number.isInteger(jwt?.payload?.iat) && Number.isInteger(jwt?.payload?.exp) &&
            jwt.payload.exp > jwt.payload.iat && jwt.payload.exp > Math.floor(Date.now() / 1000);
    }

    function resolve(rawConfig, runtimeLocation) {
        if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
            fail("window.__BLOODCONNECT_SUPABASE_CONFIG__ is required");
        }

        const environment = typeof rawConfig.environment === "string"
            ? rawConfig.environment.trim().toLowerCase()
            : "";
        const rawUrl = typeof rawConfig.url === "string" ? rawConfig.url.trim() : "";
        const publishableKey = typeof rawConfig.publishableKey === "string"
            ? rawConfig.publishableKey.trim()
            : "";

        if (!environments.has(environment)) fail("environment must be local, dev, test, preview, or production");
        if (!rawUrl) fail("url is required");
        if (!publishableKey) fail("publishableKey is required");
        if (!isBrowserPublishableKey(publishableKey)) fail("only a publishable or legacy anon browser key is allowed");

        let url;
        try { url = new URL(rawUrl); } catch { fail("url must be an absolute URL"); }
        if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
            fail("url must be a credential-free Supabase origin");
        }

        const targetIsLoopback = isLoopback(url.hostname);
        if (targetIsLoopback) {
            if (!new Set(["http:", "https:"]).has(url.protocol)) fail("loopback url must use HTTP or HTTPS");
        } else if (url.protocol !== "https:") {
            fail("non-loopback url must use HTTPS");
        }

        const browserHostname = String(runtimeLocation?.hostname || "").toLowerCase();
        if (!browserHostname) fail("browser hostname is unavailable");
        const browserIsLoopback = isLoopback(browserHostname);
        if (browserIsLoopback && !targetIsLoopback) fail("a loopback page cannot target a hosted Supabase project");
        if (environment === "production" && (browserIsLoopback || targetIsLoopback)) {
            fail("production requires an explicit non-loopback page and HTTPS target");
        }
        if (environment === "local" && (!browserIsLoopback || !targetIsLoopback)) {
            fail("local requires both the page and Supabase target to be loopback");
        }

        return Object.freeze({
            environment,
            url: url.origin,
            publishableKey,
        });
    }

    root.BloodConnectSupabaseConfig = Object.freeze({ resolve, isBrowserPublishableKey });
})(typeof window !== "undefined" ? window : globalThis);
