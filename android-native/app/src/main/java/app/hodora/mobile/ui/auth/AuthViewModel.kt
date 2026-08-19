package app.hodora.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.repository.AuthRepository
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AuthMode {
    data object SignIn : AuthMode

    data object SignUp : AuthMode
}

data class AuthUiState(
    val mode: AuthMode = AuthMode.SignIn,
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val resetEmailSent: Boolean = false,
)

class AuthViewModel(
    private val repository: AuthRepository = AuthRepository(),
) : ViewModel() {
    val sessionStatus: StateFlow<SessionStatus> = repository.sessionStatus

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.value = _uiState.value.copy(email = value, error = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, error = null)
    }

    fun onModeToggle() {
        val next = if (_uiState.value.mode is AuthMode.SignIn) AuthMode.SignUp else AuthMode.SignIn
        _uiState.value = _uiState.value.copy(mode = next, error = null, resetEmailSent = false)
    }

    fun submit() {
        val state = _uiState.value
        if (state.email.isBlank() || state.password.isBlank()) {
            _uiState.value = state.copy(error = "Enter an email and password")
            return
        }
        _uiState.value = state.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                when (state.mode) {
                    is AuthMode.SignIn -> repository.signIn(state.email, state.password)
                    is AuthMode.SignUp -> repository.signUp(state.email, state.password)
                }
                _uiState.value = _uiState.value.copy(isLoading = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Something went wrong")
            }
        }
    }

    fun sendPasswordReset() {
        val email = _uiState.value.email
        if (email.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Enter your email first")
            return
        }
        viewModelScope.launch {
            try {
                repository.sendPasswordReset(email)
                _uiState.value = _uiState.value.copy(resetEmailSent = true, error = null)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Couldn't send reset email")
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { repository.signOut() }
    }
}
