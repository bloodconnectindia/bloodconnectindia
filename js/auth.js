window.BloodConnectAuth = {
    resolveVerifiedDestination(data) {
        const identity = data?.verified_identity;
        if (identity?.role === "Admin" && identity?.status === "Active") {
            return "admin-dashboard.html";
        }
        throw new Error("This account does not have a verified supported destination.");
    },

    async signIn(email, password) {
        const { data, error } = await window.supabaseClient.functions.invoke("admin-login", {
            body: { email, password }
        });

        if (error) {
            throw new Error("Unable to sign in. Please try again.");
        }

        if (!data?.session?.access_token || !data?.session?.refresh_token) {
            throw new Error(data?.message || "Unable to sign in.");
        }

        const destination = this.resolveVerifiedDestination(data);

        const { error: sessionError } = await window.supabaseClient.auth.setSession(data.session);
        if (sessionError) {
            throw new Error("Unable to establish a secure session.");
        }

        return { destination };
    },

    async signOut() {
        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            throw error;
        }
    },

    async getCurrentUser() {
        const { data, error } = await window.supabaseClient.auth.getUser();

        if (error) {
            throw error;
        }

        return data.user;
    },

    async requireAuthenticatedSession() {
        const user = await this.getCurrentUser();

        if (!user) {
            throw new Error("Please sign in to access this page.");
        }

        return user;
    },

    async requireVerifiedAdminSession() {
        const user = await this.requireAuthenticatedSession();
        const { data, error } = await window.supabaseClient.functions.invoke("admin-session-authorization");
        if (error || data?.verified_identity?.role !== "Admin" || data?.verified_identity?.status !== "Active") {
            throw new Error("This session is not authorized for the Admin workspace.");
        }
        return user;
    },

    async requestPasswordReset(email) {
        const { error } = await window.supabaseClient.functions.invoke("admin-password-reset-request", {
            body: { email }
        });

        if (error) {
            throw new Error("Unable to process the request. Please try again later.");
        }
    }
};
