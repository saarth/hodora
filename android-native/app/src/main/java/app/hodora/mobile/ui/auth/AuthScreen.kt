package app.hodora.mobile.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun AuthScreen(viewModel: AuthViewModel) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = if (state.mode is AuthMode.SignIn) "Sign in to Hodora" else "Create an account",
            style = MaterialTheme.typography.headlineSmall,
        )

        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
        )

        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
        )

        state.error?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        if (state.resetEmailSent) {
            Text(text = "Check your email for a reset link.", modifier = Modifier.padding(top = 8.dp))
        }

        Button(
            onClick = viewModel::submit,
            enabled = !state.isLoading,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
            } else {
                Text(if (state.mode is AuthMode.SignIn) "Sign in" else "Sign up")
            }
        }

        TextButton(onClick = viewModel::onModeToggle, modifier = Modifier.fillMaxWidth()) {
            Text(
                if (state.mode is AuthMode.SignIn) {
                    "Need an account? Sign up"
                } else {
                    "Already have an account? Sign in"
                },
            )
        }

        if (state.mode is AuthMode.SignIn) {
            TextButton(onClick = viewModel::sendPasswordReset, modifier = Modifier.fillMaxWidth()) {
                Text("Forgot password?")
            }
        }
    }
}
