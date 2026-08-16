window.BloodConnectAuth = {
    async signIn(email, password) {
        const { data, error } = await supabaseClient.functions.invoke("admin-login", {
            body: { email, password }
        });

        if (error) {
            throw new Error("Unable to sign in. Please try again.");
        }

        if (!data?.session?.access_token || !data?.session?.refresh_token) {
            throw new Error(data?.message || "Unable to sign in.");
        }

        const { error: sessionError } = await supabaseClient.auth.setSession(data.session);
        if (sessionError) {
            throw new Error("Unable to establish a secure session.");
        }

        return data;
    },

    async signOut() {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            throw error;
        }
    },

    async getCurrentUser() {
        const { data, error } = await supabaseClient.auth.getUser();

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

    async requestPasswordReset(email) {
        const { error } = await supabaseClient.functions.invoke("admin-password-reset-request", {
            body: { email }
        });

        if (error) {
            throw new Error("Unable to process the request. Please try again later.");
        }
    }
};
