package app.hodora.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.hodora.mobile.ui.auth.AuthScreen
import app.hodora.mobile.ui.auth.AuthViewModel
import app.hodora.mobile.ui.ridedetail.RideDetailScreen
import app.hodora.mobile.ui.rides.RidesListScreen
import io.github.jan.supabase.auth.status.SessionStatus

object HodoraDestination {
    const val AUTH = "auth"
    const val RIDES = "rides"
    const val RIDE_ID_ARG = "rideId"
    const val RIDE_DETAIL = "rides/{$RIDE_ID_ARG}"

    fun rideDetail(rideId: String) = "rides/$rideId"
}

@Composable
fun HodoraNavHost(navController: NavHostController = rememberNavController()) {
    // Shared at the nav-host level (not per-screen) so sign-in on the auth
    // screen and sign-out from the rides screen both flow through the same
    // sessionStatus this composable watches to decide where to navigate.
    val authViewModel: AuthViewModel = viewModel()
    val sessionStatus by authViewModel.sessionStatus.collectAsState()

    LaunchedEffect(sessionStatus) {
        // LoadingFromStorage / network-error states fall through and leave
        // the current screen as-is rather than bouncing the user.
        val destination =
            when (sessionStatus) {
                is SessionStatus.Authenticated -> HodoraDestination.RIDES
                is SessionStatus.NotAuthenticated -> HodoraDestination.AUTH
                else -> return@LaunchedEffect
            }
        navController.navigate(destination) {
            popUpTo(0) { inclusive = true }
            launchSingleTop = true
        }
    }

    NavHost(navController = navController, startDestination = HodoraDestination.AUTH) {
        composable(HodoraDestination.AUTH) {
            AuthScreen(viewModel = authViewModel)
        }
        composable(HodoraDestination.RIDES) {
            RidesListScreen(
                onSignOut = { authViewModel.signOut() },
                onOpenRide = { rideId -> navController.navigate(HodoraDestination.rideDetail(rideId)) },
            )
        }
        composable(
            route = HodoraDestination.RIDE_DETAIL,
            arguments = listOf(navArgument(HodoraDestination.RIDE_ID_ARG) { type = NavType.StringType }),
        ) { backStackEntry ->
            val rideId = backStackEntry.arguments?.getString(HodoraDestination.RIDE_ID_ARG).orEmpty()
            RideDetailScreen(rideId = rideId, onBack = { navController.popBackStack() })
        }
    }
}
