package app.hodora.mobile.data.repository

import app.hodora.mobile.data.supabase.SupabaseModule
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.StateFlow

class AuthRepository {
    private val auth = SupabaseModule.client.auth

    // NB: the exact SessionStatus variants (Authenticated / NotAuthenticated /
    // LoadingFromStorage / ...) have shifted across supabase-kt major
    // versions — if HodoraNavHost's `when` over this doesn't compile against
    // whatever version Gradle actually resolves, check the installed
    // version's SessionStatus definition and adjust the branches there.
    val sessionStatus: StateFlow<SessionStatus> = auth.sessionStatus

    suspend fun signUp(
        email: String,
        password: String,
    ) {
        auth.signUpWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signIn(
        email: String,
        password: String,
    ) {
        auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun sendPasswordReset(email: String) {
        auth.resetPasswordForEmail(email)
    }

    suspend fun signOut() {
        auth.signOut()
    }
}
