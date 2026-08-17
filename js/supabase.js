(function initializeSupabaseBrowserClient() {
    "use strict";

    if (!window.BloodConnectSupabaseConfig?.resolve) {
        throw new Error("Supabase browser configuration boundary is unavailable.");
    }
    if (!window.supabase?.createClient) {
        throw new Error("Supabase browser SDK is unavailable.");
    }

    const config = window.BloodConnectSupabaseConfig.resolve(
        window.__BLOODCONNECT_SUPABASE_CONFIG__,
        window.location,
    );

    window.supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
    window.BloodConnectEnvironment = config.environment;
})();
